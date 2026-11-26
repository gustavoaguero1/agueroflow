/**
 * Rotas de Viagens (montadas em /api/travel, depois do login):
 *   GET    /settings?orgId=           → { legacySourcesEnabled } (área Operações)
 *   PUT    /settings                  → { orgId, legacySourcesEnabled } (Admin ou Gerente)
 *   GET    /martravel/account?orgId=  → { connected, login?, updatedAt? } da própria pessoa
 *   PUT    /martravel/account         → { orgId, login, password } grava no cofre
 *   DELETE /martravel/account?orgId=  → remove a conta da pessoa
 * A senha fica cifrada (AES-256-GCM, chave MARTRAVEL_SECRET_KEY) e nunca volta para o navegador.
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { getAdmin } from './firebaseAdmin.ts';
import { requireModuleAccess } from './authMiddleware.ts';
import { sealSecret, openSecret, parseSecretKey, type SealedSecret } from './secretBox.ts';

export interface StoredMarTravelAccount {
  orgId: string;
  uid: string;
  provider: 'martravel';
  login: string;
  password: SealedSecret;
  updatedAt: string;
}

export interface TravelProviderStore {
  getSettings(orgId: string): Promise<{ legacySourcesEnabled?: unknown } | undefined>;
  setSettings(orgId: string, patch: { legacySourcesEnabled: boolean; updatedAt: string; updatedBy: string }): Promise<void>;
  getAccount(key: string): Promise<StoredMarTravelAccount | undefined>;
  setAccount(key: string, acc: StoredMarTravelAccount): Promise<void>;
  deleteAccount(key: string): Promise<void>;
}

export const accountKey = (orgId: string, uid: string) => `${orgId}__${uid}`;

/** Firestore pelo Admin SDK. `travel_provider_accounts` não tem leitura nem escrita pelo navegador (firestore.rules). */
export function firestoreTravelProviderStore(): TravelProviderStore | null {
  const h = getAdmin();
  if (!h) return null;
  const accounts = h.db.collection('travel_provider_accounts');
  return {
    getSettings: async (o) => (await h.db.doc(`organizations/${o}`).get()).get('travelSettings'),
    setSettings: async (o, p) => { await h.db.doc(`organizations/${o}`).set({ travelSettings: p }, { merge: true }); },
    getAccount: async (k) => { const d = await accounts.doc(k).get(); return d.exists ? (d.data() as StoredMarTravelAccount) : undefined; },
    setAccount: async (k, a) => { await accounts.doc(k).set(a); },
    deleteAccount: async (k) => { await accounts.doc(k).delete(); },
  };
}

/** Guarda em memória (testes). `dump()` mostra o que foi gravado. */
export function memoryTravelProviderStore() {
  const settings = new Map<string, Record<string, unknown>>();
  const accounts = new Map<string, StoredMarTravelAccount>();
  const store: TravelProviderStore & { dump: () => IterableIterator<[string, unknown]> } = {
    getSettings: async (o) => settings.get(o),
    setSettings: async (o, p) => { settings.set(o, { ...(settings.get(o) || {}), ...p }); },
    getAccount: async (k) => accounts.get(k),
    setAccount: async (k, a) => { accounts.set(k, JSON.parse(JSON.stringify(a))); },
    deleteAccount: async (k) => { accounts.delete(k); },
    dump: () => new Map<string, unknown>([...settings, ...accounts]).entries(),
  };
  return store;
}

/** Login e senha do colaborador para o conector da Mar Travel (só no servidor). */
export async function loadMarTravelCredentials(store: TravelProviderStore, keyB64: string, orgId: string, uid: string) {
  const acc = await store.getAccount(accountKey(orgId, uid));
  if (!acc) return null;
  return { login: acc.login, password: openSecret(acc.password, keyB64) };
}

export function createTravelProviderRouter(opts: {
  store?: () => TravelProviderStore | null;
  secretKey?: () => string | undefined;
} = {}): Router {
  const getStore = opts.store ?? firestoreTravelProviderStore;
  const getKey = opts.secretKey ?? (() => process.env.MARTRAVEL_SECRET_KEY);
  const r = Router();
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res) => {
    fn(req, res).catch((e) => { console.error('travel provider route error:', e); res.status(500).json({ error: 'internal' }); });
  };
  const storeOr503 = (res: Response) => {
    const s = getStore();
    if (!s) res.status(503).json({ error: 'banco_indisponivel' });
    return s;
  };
  const org = (req: Request) => String(req.orgId || '');
  const uid = (req: Request) => String(req.user?.uid || '');

  r.get('/settings', requireModuleAccess('viagens-configuracoes', 1), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    res.json({ legacySourcesEnabled: (await s.getSettings(org(req)))?.legacySourcesEnabled === true });
  }));

  r.put('/settings', requireModuleAccess('viagens-configuracoes', 4), wrap(async (req, res) => {
    const v = req.body?.legacySourcesEnabled;
    if (typeof v !== 'boolean') return res.status(400).json({ error: 'legacySourcesEnabled deve ser verdadeiro ou falso' });
    const s = storeOr503(res); if (!s) return;
    await s.setSettings(org(req), { legacySourcesEnabled: v, updatedAt: new Date().toISOString(), updatedBy: uid(req) });
    res.json({ ok: true, legacySourcesEnabled: v });
  }));

  r.get('/martravel/account', requireModuleAccess('viagens-configuracoes', 1), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    const acc = await s.getAccount(accountKey(org(req), uid(req)));
    res.json(acc ? { connected: true, login: acc.login, updatedAt: acc.updatedAt } : { connected: false });
  }));

  r.put('/martravel/account', requireModuleAccess('viagens-configuracoes', 2), wrap(async (req, res) => {
    const login = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!login || !password) return res.status(400).json({ error: 'Informe o login e a senha da Mar Travel.' });
    if (login.length > 200 || password.length > 200) return res.status(400).json({ error: 'Login ou senha longos demais.' });
    const key = getKey();
    if (!parseSecretKey(key)) return res.status(503).json({ error: 'cofre_indisponivel' });
    const s = storeOr503(res); if (!s) return;
    const updatedAt = new Date().toISOString();
    await s.setAccount(accountKey(org(req), uid(req)), {
      orgId: org(req), uid: uid(req), provider: 'martravel', login, password: sealSecret(password, key as string), updatedAt,
    });
    res.json({ ok: true, connected: true, login, updatedAt });
  }));

  r.delete('/martravel/account', requireModuleAccess('viagens-configuracoes', 2), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    await s.deleteAccount(accountKey(org(req), uid(req)));
    res.json({ ok: true, connected: false });
  }));

  return r;
}
