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
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import { requireModuleAccess, requireRole } from './authMiddleware.ts';
import { sealSecret, openSecret, parseSecretKey, type SealedSecret } from './secretBox.ts';
import { createWsSelfBookingClient, readLemontechConfig } from './lemontech/wsSelfBooking.ts';
import {
  fetchAllSolicitacoes, normalizeSolicitacao, matchUnit,
  type SolicitacaoClient, type SolicitacaoNormalizada, type UnitRef,
} from './lemontech/sync.ts';

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
  /** Solicitações da Mar Travel (Lemontech) já normalizadas, uma por id. */
  saveSolicitacoes(orgId: string, items: StoredSolicitacao[]): Promise<void>;
  listSolicitacoes(orgId: string): Promise<StoredSolicitacao[]>;
  getSolicitacao(orgId: string, id: string): Promise<StoredSolicitacao | undefined>;
  getLemontechMeta(orgId: string): Promise<LemontechMeta | undefined>;
  setLemontechMeta(orgId: string, meta: LemontechMeta): Promise<void>;
  listUnits(orgId: string): Promise<UnitRef[]>;
}

export type StoredSolicitacao = Omit<SolicitacaoNormalizada, 'raw'> & {
  orgId: string; unitId: string | null; unitName: string | null; rawJson: string; syncedAt: string;
};
export interface LemontechMeta { lastSync: string; desde: string; ate: string; total: number; by: string }

export const accountKey = (orgId: string, uid: string) => `${orgId}__${uid}`;

/** Firestore pelo Admin SDK. `travel_provider_accounts` não tem leitura nem escrita pelo navegador (firestore.rules). */
export function firestoreTravelProviderStore(): TravelProviderStore | null {
  const h = getAdmin();
  if (!h) return null;
  const accounts = h.db.collection('travel_provider_accounts');
  const sols = h.db.collection('travel_lemontech_solicitacoes');
  return {
    getSettings: async (o) => (await h.db.doc(`organizations/${o}`).get()).get('travelSettings'),
    setSettings: async (o, p) => { await h.db.doc(`organizations/${o}`).set({ travelSettings: p }, { merge: true }); },
    getAccount: async (k) => { const d = await accounts.doc(k).get(); return d.exists ? (d.data() as StoredMarTravelAccount) : undefined; },
    setAccount: async (k, a) => { await accounts.doc(k).set(a); },
    deleteAccount: async (k) => { await accounts.doc(k).delete(); },
    saveSolicitacoes: async (o, items) => {
      for (let i = 0; i < items.length; i += 400) {
        const batch = h.db.batch();
        for (const it of items.slice(i, i + 400)) batch.set(sols.doc(accountKey(o, it.id)), JSON.parse(JSON.stringify(it)));
        await batch.commit();
      }
    },
    listSolicitacoes: async (o) => (await sols.where('orgId', '==', o).get()).docs.map((d) => d.data() as StoredSolicitacao),
    getSolicitacao: async (o, id) => { const d = await sols.doc(accountKey(o, id)).get(); return d.exists ? (d.data() as StoredSolicitacao) : undefined; },
    getLemontechMeta: async (o) => (await h.db.doc(`organizations/${o}`).get()).get('travelSettings.lemontech'),
    setLemontechMeta: async (o, m) => { await h.db.doc(`organizations/${o}`).set({ travelSettings: { lemontech: m } }, { merge: true }); },
    listUnits: async (o) => (await h.db.collection('units').where('orgId', '==', o).get()).docs
      .map((d) => ({ id: d.id, code: d.get('code'), name: d.get('name') })),
  };
}

/** Guarda em memória (testes). `dump()` mostra o que foi gravado. */
export function memoryTravelProviderStore() {
  const settings = new Map<string, Record<string, unknown>>();
  const accounts = new Map<string, StoredMarTravelAccount>();
  const sols = new Map<string, StoredSolicitacao>();
  const metas = new Map<string, LemontechMeta>();
  const units = new Map<string, UnitRef[]>();
  const store: TravelProviderStore & { units: Map<string, UnitRef[]>; dump: () => IterableIterator<[string, unknown]> } = {
    units,
    saveSolicitacoes: async (o, items) => { for (const it of items) sols.set(accountKey(o, it.id), JSON.parse(JSON.stringify(it))); },
    listSolicitacoes: async (o) => [...sols.values()].filter((x) => x.orgId === o),
    getSolicitacao: async (o, id) => sols.get(accountKey(o, id)),
    getLemontechMeta: async (o) => metas.get(o),
    setLemontechMeta: async (o, m) => { metas.set(o, m); },
    listUnits: async (o) => units.get(o) ?? [],
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
  getAdminHandles?: () => AdminHandles | null;
  /** API Lemontech configurada (secrets LEMONTECH_WS_*), ou null. `orgId` trava a conta numa empresa só. */
  lemontech?: () => { client: SolicitacaoClient; orgId?: string } | null;
  sleep?: (ms: number) => Promise<void>;
} = {}): Router {
  const getH = opts.getAdminHandles ?? getAdmin;
  const getStore = opts.store ?? firestoreTravelProviderStore;
  const getLemon = opts.lemontech ?? defaultLemontech;
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

  r.get('/settings', requireModuleAccess('viagens-configuracoes', 1, getH), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    res.json({ legacySourcesEnabled: (await s.getSettings(org(req)))?.legacySourcesEnabled === true });
  }));

  r.put('/settings', requireModuleAccess('viagens-configuracoes', 4, getH), wrap(async (req, res) => {
    const v = req.body?.legacySourcesEnabled;
    if (typeof v !== 'boolean') return res.status(400).json({ error: 'legacySourcesEnabled deve ser verdadeiro ou falso' });
    const s = storeOr503(res); if (!s) return;
    await s.setSettings(org(req), { legacySourcesEnabled: v, updatedAt: new Date().toISOString(), updatedBy: uid(req) });
    res.json({ ok: true, legacySourcesEnabled: v });
  }));

  r.get('/martravel/account', requireModuleAccess('viagens-configuracoes', 1, getH), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    const acc = await s.getAccount(accountKey(org(req), uid(req)));
    res.json(acc ? { connected: true, login: acc.login, updatedAt: acc.updatedAt } : { connected: false });
  }));

  r.put('/martravel/account', requireModuleAccess('viagens-configuracoes', 2, getH), wrap(async (req, res) => {
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

  r.delete('/martravel/account', requireModuleAccess('viagens-configuracoes', 2, getH), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    await s.deleteAccount(accountKey(org(req), uid(req)));
    res.json({ ok: true, connected: false });
  }));

  // ── Mar Travel pela API oficial (Lemontech WsSelfBooking) ──
  const lemonFor = (orgId: string) => {
    const l = getLemon();
    return l && (!l.orgId || l.orgId === orgId) ? l : null;
  };

  r.get('/lemontech/status', requireModuleAccess('viagens-painel', 1, getH), wrap(async (req, res) => {
    if (!lemonFor(org(req))) return res.json({ configured: false });
    const s = storeOr503(res); if (!s) return;
    res.json({ configured: true, lastSync: (await s.getLemontechMeta(org(req))) ?? null });
  }));

  // Sincronizar consome a cota da API (60/min): Admin ou Gerente, e o submódulo não pode estar revogado.
  r.post('/lemontech/sync', requireRole('Admin', 'Gerente'), requireModuleAccess('viagens-painel', 2, getH), wrap(async (req, res) => {
    const desde = req.body?.desde ?? isoDaysAgo(730);
    const ate = req.body?.ate ?? isoDaysAgo(0);
    if (!DATE_RE.test(String(desde)) || !DATE_RE.test(String(ate)) || desde > ate) {
      return res.status(400).json({ error: 'Use datas no formato AAAA-MM-DD, com o início antes do fim.' });
    }
    const lemon = lemonFor(org(req));
    if (!lemon) return res.status(503).json({ error: 'lemontech_nao_configurada' });
    const s = storeOr503(res); if (!s) return;
    let raws: any[];
    try {
      raws = await fetchAllSolicitacoes(lemon.client, desde, ate, { sleep: opts.sleep });
    } catch (e) {
      return res.status(502).json({ error: e instanceof Error ? e.message : 'Falha ao consultar a Mar Travel.' });
    }
    const units = await s.listUnits(org(req));
    const syncedAt = new Date().toISOString();
    const items: StoredSolicitacao[] = raws.map((raw) => {
      const { raw: _r, ...n } = normalizeSolicitacao(raw);
      const unit = matchUnit(n.centroDeCusto, units);
      return { ...n, orgId: org(req), unitId: unit?.id ?? null, unitName: unit?.name ?? null, rawJson: JSON.stringify(raw), syncedAt };
    }).filter((i) => i.id);
    await s.saveSolicitacoes(org(req), items);
    const meta: LemontechMeta = { lastSync: syncedAt, desde, ate, total: items.length, by: uid(req) };
    await s.setLemontechMeta(org(req), meta);
    res.json({ ok: true, ...meta });
  }));

  r.get('/lemontech/solicitacoes', requireModuleAccess('viagens-painel', 1, getH), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    const items = (await s.listSolicitacoes(org(req)))
      .map(({ rawJson: _r, ...i }) => i)
      .sort((a, b) => String(b.criadaEm ?? '').localeCompare(String(a.criadaEm ?? '')) || b.id.localeCompare(a.id));
    res.json({ items });
  }));

  r.get('/lemontech/solicitacoes/:id', requireModuleAccess('viagens-painel', 1, getH), wrap(async (req, res) => {
    const s = storeOr503(res); if (!s) return;
    const it = await s.getSolicitacao(org(req), String(req.params.id));
    if (!it) return res.status(404).json({ error: 'nao_encontrada' });
    const { rawJson, ...rest } = it;
    res.json({ ...rest, raw: JSON.parse(rawJson) });
  }));

  return r;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

function defaultLemontech() {
  const cfg = readLemontechConfig(process.env);
  if (!cfg) return null;
  return { client: createWsSelfBookingClient(cfg), orgId: process.env.LEMONTECH_WS_ORG_ID?.trim() || undefined };
}
