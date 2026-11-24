/**
 * Uma conexão de WhatsApp por usuário. Guarda as instâncias abertas, de que empresa/usuário é cada
 * uma (sessions.json, para voltar sozinhas depois de reiniciar) e migra a sessão única antiga.
 *
 * Pastas: credenciais em <baseDir>/<chave>/, estado em <baseDir>/../data_whatsapp_bridge_state/<chave>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createWhatsAppBridge, type WhatsAppBridge, type WhatsAppBridgeConfig } from '../src/services/whatsappWebBridgeServer';

export interface SessionMeta {
  orgId: string;
  /** null = sessão antiga (legacy) ainda sem dono. */
  uid: string | null;
}

export const LEGACY_SESSION_KEY = 'legacy';

export const sessionKeyForUser = (uid: string) => `u_${String(uid).replace(/[^A-Za-z0-9_-]/g, '_')}`;

const metaFile = (baseDir: string) => path.join(baseDir, 'sessions.json');
const stateDir = (baseDir: string) => path.join(baseDir, '..', 'data_whatsapp_bridge_state');

function readMeta(baseDir: string): Record<string, SessionMeta> {
  try {
    return JSON.parse(fs.readFileSync(metaFile(baseDir), 'utf-8')) || {};
  } catch {
    return {};
  }
}

function writeMeta(baseDir: string, meta: Record<string, SessionMeta>) {
  fs.mkdirSync(baseDir, { recursive: true });
  const tmp = `${metaFile(baseDir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  fs.renameSync(tmp, metaFile(baseDir));
}

export function createSessionRegistry(opts: {
  baseDir: string;
  maxSessions: number;
  factory?: (cfg: WhatsAppBridgeConfig) => WhatsAppBridge;
}) {
  const factory = opts.factory || createWhatsAppBridge;
  const open = new Map<string, WhatsAppBridge>();
  let meta = readMeta(opts.baseDir);

  const create = (key: string) => {
    const b = factory({
      key,
      authDir: path.join(opts.baseDir, key),
      stateFile: path.join(stateDir(opts.baseDir), `${key}.json`),
    });
    open.set(key, b);
    return b;
  };

  return {
    get: (key: string) => open.get(key),
    meta: (key: string): SessionMeta | undefined => meta[key],
    list: () => Object.entries(meta).map(([key, m]) => ({ key, ...m })),

    ensure(key: string, m: SessionMeta): WhatsAppBridge {
      const existing = open.get(key);
      if (existing) {
        if (meta[key]?.orgId !== m.orgId || meta[key]?.uid !== m.uid) {
          meta = { ...meta, [key]: m };
          writeMeta(opts.baseDir, meta);
        }
        return existing;
      }
      if (open.size >= opts.maxSessions) {
        throw Object.assign(new Error('Limite de conexões de WhatsApp abertas no servidor atingido. Fale com o administrador.'), { status: 429 });
      }
      meta = { ...meta, [key]: m };
      writeMeta(opts.baseDir, meta);
      fs.mkdirSync(stateDir(opts.baseDir), { recursive: true });
      return create(key);
    },

    /** Para a conexão, apaga as credenciais e esquece a sessão. */
    async remove(key: string) {
      const b = open.get(key);
      if (b) await b.stopWhatsAppBridgeSession(true).catch(() => undefined);
      open.delete(key);
      fs.rmSync(path.join(opts.baseDir, key), { recursive: true, force: true });
      fs.rmSync(path.join(stateDir(opts.baseDir), `${key}.json`), { force: true });
      const { [key]: _gone, ...rest } = meta;
      meta = rest;
      writeMeta(opts.baseDir, meta);
    },

    /** Transfere a sessão (ex.: Admin assume a sessão antiga). */
    reassign(key: string, m: SessionMeta) {
      if (!meta[key]) return false;
      meta = { ...meta, [key]: m };
      writeMeta(opts.baseDir, meta);
      return true;
    },

    /** Depois de reiniciar: recria as instâncias de todas as sessões salvas. */
    restoreAll(): string[] {
      meta = readMeta(opts.baseDir);
      const keys = Object.keys(meta).slice(0, opts.maxSessions);
      for (const k of keys) if (!open.has(k)) create(k);
      return keys;
    },
  };
}

export type SessionRegistry = ReturnType<typeof createSessionRegistry>;

/**
 * Sessão única antiga (credenciais soltas em <baseDir>/) → <baseDir>/legacy/, registrada para a
 * empresa padrão. Devolve true se migrou agora.
 */
export function migrateLegacyAuth(baseDir: string, defaultOrgId: string): boolean {
  if (!fs.existsSync(path.join(baseDir, 'creds.json'))) return false;
  const legacyDir = path.join(baseDir, LEGACY_SESSION_KEY);
  fs.mkdirSync(legacyDir, { recursive: true });
  for (const name of fs.readdirSync(baseDir)) {
    const from = path.join(baseDir, name);
    if (name === 'sessions.json' || name === LEGACY_SESSION_KEY || fs.statSync(from).isDirectory()) continue;
    fs.renameSync(from, path.join(legacyDir, name));
  }
  const oldState = path.join(baseDir, '..', 'data_whatsapp_bridge_state.json');
  if (fs.existsSync(oldState)) {
    fs.mkdirSync(stateDir(baseDir), { recursive: true });
    fs.renameSync(oldState, path.join(stateDir(baseDir), `${LEGACY_SESSION_KEY}.json`));
  }
  const meta = readMeta(baseDir);
  writeMeta(baseDir, { ...meta, [LEGACY_SESSION_KEY]: { orgId: defaultOrgId, uid: null } });
  return true;
}
