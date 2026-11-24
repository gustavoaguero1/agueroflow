/**
 * Conexões de WhatsApp do servidor: uma por usuário (registro + contexto). Exporta as mesmas funções
 * que o servidor já usava; cada uma resolve a conexão de quem está no contexto (ver whatsappContext.ts).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWhatsAppBridge } from '../src/services/whatsappWebBridgeServer';
import { createSessionRegistry, migrateLegacyAuth, LEGACY_SESSION_KEY } from './whatsappSessions';
import { createWhatsAppContext } from './whatsappContext';
import { effectiveOrg } from './orgDefaults';

const BASE_DIR = path.resolve(process.cwd(), 'data_whatsapp_auth');
const OLD_DIR = path.resolve(process.cwd(), '.whatsapp_auth');
const OFFICIAL_FILE = path.resolve(process.cwd(), 'data_whatsapp_official.json');
export const DEFAULT_WA_ORG = effectiveOrg(undefined);

// Pasta bem antiga (.whatsapp_auth) → raiz de data_whatsapp_auth (como antes) → legacy/.
try {
  if (
    fs.existsSync(path.join(OLD_DIR, 'creds.json')) &&
    !fs.existsSync(path.join(BASE_DIR, 'creds.json')) &&
    !fs.existsSync(path.join(BASE_DIR, LEGACY_SESSION_KEY, 'creds.json'))
  ) {
    fs.cpSync(OLD_DIR, BASE_DIR, { recursive: true, force: true });
  }
  if (migrateLegacyAuth(BASE_DIR, DEFAULT_WA_ORG)) {
    console.log('📦 [WhatsApp] Sessão única antiga movida para a sessão "legacy" da empresa padrão.');
  }
} catch (err: any) {
  console.warn('⚠️ [WhatsApp] Falha ao migrar a sessão antiga:', err?.message || err);
}

/** Número oficial (chave de sessão) que cada empresa usa para avisos e automações. */
let official: Record<string, string> = {};
try {
  official = JSON.parse(fs.readFileSync(OFFICIAL_FILE, 'utf-8')) || {};
} catch {
  official = {};
}
export function getOfficialSessionKey(orgId: string): string | undefined {
  return official[orgId];
}
export function setOfficialSessionKey(orgId: string, key: string | null) {
  const next = { ...official };
  if (key) next[orgId] = key;
  else delete next[orgId];
  official = next;
  fs.writeFileSync(`${OFFICIAL_FILE}.tmp`, JSON.stringify(official, null, 2), 'utf-8');
  fs.renameSync(`${OFFICIAL_FILE}.tmp`, OFFICIAL_FILE);
}

export const waRegistry = createSessionRegistry({
  baseDir: BASE_DIR,
  maxSessions: Number(process.env.WA_MAX_SESSIONS) || 20,
});

/** Conexão que nunca liga: responde "desconectado" para quem ainda não conectou o WhatsApp. */
const blankDir = path.join(os.tmpdir(), 'agueroflow-wa-blank');
const blank = createWhatsAppBridge({ key: '__sem_whatsapp__', authDir: blankDir, stateFile: `${blankDir}.json` });

export const waContext = createWhatsAppContext({
  registry: waRegistry,
  defaultOrgId: DEFAULT_WA_ORG,
  blank,
  officialKeyOf: getOfficialSessionKey,
});

/** Sessões salvas voltam sozinhas (cada uma no próprio contexto). */
export function resumeSavedWhatsAppSessions() {
  for (const key of waRegistry.restoreAll()) {
    const b = waRegistry.get(key);
    const m = waRegistry.meta(key);
    if (!b || !m || !b.hasPersistedBridgeSession()) continue;
    waContext.attach(b);
    waContext.runInSession({ key, orgId: m.orgId, uid: m.uid }, () =>
      b.startWhatsAppBridgeSession().catch((err: any) => {
        console.warn(`⚠️ [WhatsApp ${key}] Falha ao retomar sessão salva:`, err?.message || err);
      }),
    );
  }
}

export const runInWhatsAppSession = waContext.runInSession;
export const runAsOrgWhatsAppSender = waContext.runAsOrgSender;
export const currentWhatsAppSession = waContext.currentSession;
/** Empresa do WhatsApp do contexto (quem recebeu a mensagem / empresa da requisição). */
export const orgOfWhatsAppContext = waContext.orgOfContext;

export const {
  downloadCachedRawMessageMedia,
  ensureWhatsAppBridgeResumed,
  getDiscoveredBridgeContacts,
  getKnownRecentMessageKeysForChat,
  getLastDisconnectedAtMs,
  getLatestChatMedia,
  getWhatsAppBridgeConnectedLid,
  getWhatsAppBridgeStatus,
  hasPersistedBridgeSession,
  recoverMissingMessagesByKeys,
  refreshBridgeGroups,
  registerWhatsAppBridgeHooks,
  scanAndCatchUpChannels,
  sendDocumentViaWhatsAppBridge,
  sendMessageViaWhatsAppBridge,
  sendPresenceViaWhatsAppBridge,
  sendReactionViaWhatsAppBridge,
  startWhatsAppBridgeSession,
  stopWhatsAppBridgeSession,
  syncChatHistoryOnDemand,
} = waContext.api;
