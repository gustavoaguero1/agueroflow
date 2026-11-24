/**
 * "Qual WhatsApp?" sem mudar as chamadas do servidor: cada requisição roda na sessão de quem chamou,
 * cada mensagem recebida roda na sessão que recebeu, e automações sem contexto usam o número
 * oficial da empresa. As funções de `api` têm os mesmos nomes de antes e resolvem a conexão certa.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { BridgeHooks, WhatsAppBridge } from '../src/services/whatsappWebBridgeServer';
import type { SessionRegistry } from './whatsappSessions';
import { pickOrgSender } from './whatsappRouting';

export interface SessionContext {
  key: string;
  orgId: string;
  uid: string | null;
}

type Registry = Pick<SessionRegistry, 'get' | 'meta' | 'list' | 'ensure'>;

/** Contexto de automação de uma empresa sem nenhum WhatsApp conectado. */
const NO_SENDER = '__sem_whatsapp__';

export function createWhatsAppContext(opts: {
  registry: Registry;
  defaultOrgId: string;
  /** Conexão que nunca é iniciada: responde "desconectado" para quem não tem WhatsApp. */
  blank: WhatsAppBridge;
  /** Número oficial escolhido pela empresa (chave de sessão), se houver. */
  officialKeyOf: (orgId: string) => string | undefined;
}) {
  const als = new AsyncLocalStorage<SessionContext>();
  let hooks: BridgeHooks | null = null;
  const attached = new WeakSet<object>();

  const connected = (b: WhatsAppBridge | undefined) => b?.getWhatsAppBridgeStatus().state === 'conectado';

  const senderKey = (orgId: string): string | null =>
    pickOrgSender(
      orgId,
      opts.registry.list().map((s) => {
        const b = opts.registry.get(s.key);
        const since = Date.parse(String((b?.getWhatsAppBridgeStatus() as { connectedAt?: string } | undefined)?.connectedAt || '')) || 0;
        return { key: s.key, orgId: s.orgId, connected: connected(b), since };
      }),
      opts.officialKeyOf(orgId),
    );

  /** Liga os ganchos do servidor a uma conexão, rodando cada um no contexto dela. */
  const attach = (b: WhatsAppBridge) => {
    if (!hooks || attached.has(b)) return;
    attached.add(b);
    // A empresa é lida a cada chamada: se a sessão mudar de empresa, vale na próxima mensagem.
    const ctxNow = (): SessionContext => {
      const m = opts.registry.meta(b.key);
      return { key: b.key, orgId: m?.orgId || opts.defaultOrgId, uid: m?.uid ?? null };
    };
    const wrapped = Object.fromEntries(
      Object.entries(hooks).map(([name, fn]) => [
        name,
        typeof fn === 'function' ? (...a: unknown[]) => als.run(ctxNow(), () => (fn as (...x: unknown[]) => unknown)(...a)) : fn,
      ]),
    ) as BridgeHooks;
    b.registerWhatsAppBridgeHooks(wrapped);
  };

  const attachAll = () => {
    for (const s of opts.registry.list()) {
      const b = opts.registry.get(s.key);
      if (b) attach(b);
    }
  };

  const currentSession = (): SessionContext | undefined => als.getStore();

  /** Avisa (no máximo a cada 5 min por empresa) quando uma automação não tem por onde enviar. */
  const lastWarn = new Map<string, number>();
  const warnNoSender = (orgId: string) => {
    const now = Date.now();
    if (now - (lastWarn.get(orgId) || 0) < 5 * 60_000) return;
    lastWarn.set(orgId, now);
    console.warn(`⚠️ [WhatsApp] Sem WhatsApp conectado para a empresa ${orgId}: avisos e automações não serão enviados.`);
  };

  /** Empresa do contexto atual (sessão que recebeu ou empresa da requisição); sem contexto, a padrão. */
  const orgOfContext = (): string => als.getStore()?.orgId || opts.defaultOrgId;

  /** Conexão do contexto atual; sem contexto, o número da empresa padrão; sem nada, a em branco. */
  const resolve = (): WhatsAppBridge => {
    const s = als.getStore();
    if (s?.key === NO_SENDER) {
      warnNoSender(s.orgId);
      return opts.blank;
    }
    if (s) return opts.registry.get(s.key) || opts.blank;
    const k = senderKey(opts.defaultOrgId);
    const b = k && opts.registry.get(k);
    if (b) return b;
    warnNoSender(opts.defaultOrgId);
    return opts.blank;
  };

  /** A conexão atual é o remetente da empresa? Só ela faz OCR, NDs, respostas automáticas e @aguero. */
  const isCompanySession = (): boolean => {
    const s = als.getStore();
    return Boolean(s && s.key === senderKey(s.orgId));
  };

  const runInSession = <T,>(ctx: SessionContext, fn: () => T): T => als.run(ctx, fn);

  const runAsOrgSender = <T,>(orgId: string, fn: () => T): T => {
    const k = senderKey(orgId);
    return als.run({ key: k || NO_SENDER, orgId, uid: (k && opts.registry.meta(k)?.uid) ?? null }, fn);
  };

  type Fn<K extends keyof WhatsAppBridge> = WhatsAppBridge[K];
  const via = <K extends keyof WhatsAppBridge>(name: K) =>
    ((...a: unknown[]) => (resolve()[name] as (...x: unknown[]) => unknown)(...a)) as Fn<K>;

  const api = {
    getLastDisconnectedAtMs: via('getLastDisconnectedAtMs'),
    getLatestChatMedia: via('getLatestChatMedia'),
    hasPersistedBridgeSession: via('hasPersistedBridgeSession'),
    refreshBridgeGroups: via('refreshBridgeGroups'),
    getDiscoveredBridgeContacts: via('getDiscoveredBridgeContacts'),
    getWhatsAppBridgeConnectedLid: via('getWhatsAppBridgeConnectedLid'),
    getWhatsAppBridgeStatus: via('getWhatsAppBridgeStatus'),
    ensureWhatsAppBridgeResumed: via('ensureWhatsAppBridgeResumed'),
    downloadCachedRawMessageMedia: via('downloadCachedRawMessageMedia'),
    recoverMissingMessagesByKeys: via('recoverMissingMessagesByKeys'),
    getKnownRecentMessageKeysForChat: via('getKnownRecentMessageKeysForChat'),
    scanAndCatchUpChannels: via('scanAndCatchUpChannels'),
    syncChatHistoryOnDemand: via('syncChatHistoryOnDemand'),
    stopWhatsAppBridgeSession: via('stopWhatsAppBridgeSession'),
    sendMessageViaWhatsAppBridge: via('sendMessageViaWhatsAppBridge'),
    sendDocumentViaWhatsAppBridge: via('sendDocumentViaWhatsAppBridge'),
    sendReactionViaWhatsAppBridge: via('sendReactionViaWhatsAppBridge'),
    sendPresenceViaWhatsAppBridge: via('sendPresenceViaWhatsAppBridge'),

    /** Conectar abre (ou reabre) a sessão de quem está no contexto. */
    startWhatsAppBridgeSession: ((...a: unknown[]) => {
      const s = als.getStore();
      if (!s) return (resolve().startWhatsAppBridgeSession as (...x: unknown[]) => unknown)(...a);
      const b = opts.registry.ensure(s.key, { orgId: s.orgId, uid: s.uid });
      attach(b);
      return (b.startWhatsAppBridgeSession as (...x: unknown[]) => unknown)(...a);
    }) as Fn<'startWhatsAppBridgeSession'>,

    /** Ganchos do servidor (mensagens recebidas etc.): valem para todas as conexões. */
    registerWhatsAppBridgeHooks: (h: BridgeHooks) => {
      hooks = h;
      attachAll();
    },
  };

  return { api, runInSession, runAsOrgSender, currentSession, orgOfContext, isCompanySession, attach, attachAll, senderKey };
}

export type WhatsAppContext = ReturnType<typeof createWhatsAppContext>;
