import path from 'path';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  WASocket,
  WAMessage,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import {
  WhatsAppBridgeConnectionState,
  WhatsAppBridgeStatus,
  WhatsAppGroupSummary,
} from '../types/whatsappComposio';
import { formatWhatsAppPhoneDisplay, normalizeWhatsAppPhone } from './composioWhatsAppServer';

export interface BridgeIncomingMessageEvent {
  messageId: string;
  remoteJid: string;
  isGroup: boolean;
  groupName: string;
  senderPhone: string;
  senderName: string;
  fromMe: boolean;
  text: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  hasAudio?: boolean;
  audioBase64?: string;
  audioMimeType?: string;
  quotedText?: string;
  quotedMessageId?: string;
  quotedMediaBase64?: string;
  quotedMediaMimeType?: string;
  quotedAudioBase64?: string;
  quotedAudioMimeType?: string;
  isCatchUp?: boolean;
  timestampIso: string;
  rawMessage: WAMessage;
}

export interface CachedChatMedia {
  kind: 'image' | 'audio';
  messageId: string;
  chatJid: string;
  base64: string;
  mimeType: string;
  senderName: string;
  timestampIso: string;
}

export interface BridgeHistoryMessageEvent {
  messageId: string;
  remoteJid: string;
  isGroup: boolean;
  groupName: string;
  senderPhone: string;
  senderName: string;
  fromMe: boolean;
  text: string;
  hasMedia: boolean;
  mediaMimeType?: string;
  timestampIso: string;
  sourceMode: 'notify' | 'append' | 'history_sync';
}

export interface BridgeHooks {
  onIncomingMessage?: (event: BridgeIncomingMessageEvent) => Promise<void> | void;
  onHistoryMessage?: (event: BridgeHistoryMessageEvent) => Promise<void> | void;
  shouldDownloadMedia?: (ctx: {
    remoteJid: string;
    isGroup: boolean;
    senderPhone: string;
    text: string;
    isCatchUp: boolean;
    hasImage: boolean;
    hasAudio: boolean;
  }) => boolean;
  isPriorityMonitoredJid?: (remoteJid: string) => boolean;
  shouldIgnoreGroupJid?: (groupJid: string, groupName?: string) => boolean;
  onConnectionOpen?: (info: { connectedNumber: string; connectedName: string; connectedJid: string }) => void;
  onConnectionClose?: (reason: string) => void;
}

// Non-hidden directories/files (alongside data_*.json) so container snapshots preserve session & catch-up state
const LEGACY_AUTH_DIR = path.resolve(process.cwd(), '.whatsapp_auth');
const AUTH_DIR = path.resolve(process.cwd(), 'data_whatsapp_auth');
const BRIDGE_STATE_FILE = path.resolve(process.cwd(), 'data_whatsapp_bridge_state.json');
const silentLogger = pino({ level: 'silent' });

function migrateLegacyAuthDirIfNeeded() {
  try {
    if (
      fs.existsSync(path.join(LEGACY_AUTH_DIR, 'creds.json')) &&
      !fs.existsSync(path.join(AUTH_DIR, 'creds.json'))
    ) {
      fs.cpSync(LEGACY_AUTH_DIR, AUTH_DIR, { recursive: true, force: true });
      console.log('📦 [WhatsApp Web Bridge] Sessão migrada de .whatsapp_auth para data_whatsapp_auth.');
    }
  } catch (err: any) {
    console.warn('⚠️ [WhatsApp Web Bridge] Falha na migração de sessão legada:', err?.message || err);
  }
}

migrateLegacyAuthDirIfNeeded();

let activeSocket: WASocket | null = null;
let bridgeState: WhatsAppBridgeConnectionState = 'desconectado';
let currentQrDataUrl: string | null = null;
let currentPairingCode: string | null = null;
let connectedNumber = '';
let connectedName = '';
let connectedJid = '';
let connectedAt = '';
let lastActivityAt = '';
let lastOnlineAt = '';
let lastDisconnectedAtMs = 0;
let catchUpSinceMs = 0;
let catchUpWindowUntilMs = 0;
let lastCatchUpAt: string | null = null;
let lastCatchUpRecovered = 0;

let lastError: string | null = null;
let lastDisconnectCode: number | null = null;
let lastDisconnectReason: string | null = null;

let manualStopRequested = false;
let lastDisconnectWasFatalLogout = false;
let isStarting = false;
let reconnectAttempts = 0;
let qrCycleAttempts = 0;
let badSessionCount = 0;
let connectionReplacedCount = 0;
let sessionWasRegistered = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let pendingPairingPhone: string | null = null;
let pairingCodeRequestedForSocket = false;
let credsWriteQueue: Promise<void> = Promise.resolve();
const chatEventQueues = new Map<string, Promise<void>>();
let persistStateTimer: ReturnType<typeof setTimeout> | null = null;

const groupsCache = new Map<string, WhatsAppGroupSummary>();
const persistedGroupNamesByJid = new Map<string, string>();
const contactsCache = new Map<
  string,
  { jid: string; phoneDigits: string; formattedPhone: string; name: string; updatedAt: string }
>();
const sentMessageIds = new Set<string>();
const processedMessageIds = new Set<string>();
const archivedHistoryMsgIds = new Set<string>();
const recentMediaByMsgId = new Map<string, CachedChatMedia>();
const lastImageByChatJid = new Map<string, CachedChatMedia>();
const lastAudioByChatJid = new Map<string, CachedChatMedia>();
const recentRawMessagesByChatJid = new Map<string, WAMessage[]>();
const rawMessageByKeyId = new Map<string, WAMessage>();
const placeholderResendRequestedIds = new Set<string>();
const pendingMediaMessages = new Map<string, WAMessage>();
type ChatMessageAnchor = {
  key: { remoteJid: string; id: string; fromMe?: boolean; participant?: string };
  timestampMs: number;
};
const lastAnchorByChatJid = new Map<string, ChatMessageAnchor>();
const oldestAnchorByChatJid = new Map<string, ChatMessageAnchor>();
const recentMessageKeysById = new Map<string, ChatMessageAnchor>();
const historySyncWaiters = new Map<string, Array<(count: number) => void>>();
let freshQrPairingInProgress = false;
let hooks: BridgeHooks = {};

function notifyHistorySyncWaiters(chatJid: string, receivedCount: number) {
  if (!chatJid) return;
  const list = historySyncWaiters.get(chatJid);
  if (list && list.length > 0) {
    historySyncWaiters.delete(chatJid);
    for (const resolve of list) {
      try {
        resolve(receivedCount);
      } catch {
        // ignore
      }
    }
  }
}

export function getLastDisconnectedAtMs(): number {
  if (lastDisconnectedAtMs > 0) return lastDisconnectedAtMs;
  if (lastOnlineAt) {
    const parsed = new Date(lastOnlineAt).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function extractTimestampSec(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (typeof ts === 'string') {
    const n = Number(ts);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof ts === 'object') {
    if (typeof ts.toNumber === 'function') {
      const n = ts.toNumber();
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof ts.low === 'number') {
      return ts.low >>> 0;
    }
  }
  return 0;
}

function rememberRawMessageForChat(msg: WAMessage) {
  const remoteJid = msg.key?.remoteJid || '';
  const msgId = msg.key?.id || '';
  if (!remoteJid || !msgId || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return;
  }
  const tsSec = extractTimestampSec(msg.messageTimestamp);
  const tsMs = tsSec > 0 ? tsSec * 1000 : Date.now();
  const anchorPayload: ChatMessageAnchor = {
    key: {
      remoteJid,
      id: msgId,
      fromMe: Boolean(msg.key?.fromMe),
      participant: msg.key?.participant || undefined,
    },
    timestampMs: tsMs,
  };

  const existingNewest = lastAnchorByChatJid.get(remoteJid);
  if (!existingNewest || tsMs >= existingNewest.timestampMs) {
    lastAnchorByChatJid.set(remoteJid, anchorPayload);
  }
  const existingOldest = oldestAnchorByChatJid.get(remoteJid);
  if (!existingOldest || (tsMs > 0 && tsMs < existingOldest.timestampMs)) {
    oldestAnchorByChatJid.set(remoteJid, anchorPayload);
  }

  const list = recentRawMessagesByChatJid.get(remoteJid) || [];
  const existingIdx = list.findIndex((m) => m.key?.id === msgId);
  if (existingIdx >= 0) {
    if (msg.message) {
      list[existingIdx] = msg;
    }
  } else {
    list.push(msg);
    if (list.length > 350) {
      list.splice(0, list.length - 350);
    }
    recentRawMessagesByChatJid.set(remoteJid, list);
  }

  if (msg.message) {
    rawMessageByKeyId.set(msgId, msg);
    if (rawMessageByKeyId.size > 4000) {
      const oldestKey = rawMessageByKeyId.keys().next().value;
      if (oldestKey) rawMessageByKeyId.delete(oldestKey);
    }
  }

  recentMessageKeysById.set(msgId, anchorPayload);
  if (recentMessageKeysById.size > 2000) {
    const oldestId = recentMessageKeysById.keys().next().value;
    if (oldestId) recentMessageKeysById.delete(oldestId);
  }
}

// Load persisted bridge catch-up state (processed message IDs + lastOnlineAt + chat anchors)
function loadPersistedBridgeState() {
  try {
    if (!fs.existsSync(BRIDGE_STATE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(BRIDGE_STATE_FILE, 'utf-8'));
    if (typeof parsed?.lastOnlineAt === 'string') lastOnlineAt = parsed.lastOnlineAt;
    if (typeof parsed?.lastCatchUpAt === 'string') lastCatchUpAt = parsed.lastCatchUpAt;
    if (typeof parsed?.lastCatchUpRecovered === 'number') lastCatchUpRecovered = parsed.lastCatchUpRecovered;
    if (Array.isArray(parsed?.processedMessageIds)) {
      for (const id of parsed.processedMessageIds.slice(-1500)) {
        if (typeof id === 'string' && id) processedMessageIds.add(id);
      }
    }
    if (parsed?.chatAnchors && typeof parsed.chatAnchors === 'object') {
      for (const [jid, anchor] of Object.entries(parsed.chatAnchors as Record<string, any>)) {
        if (jid && anchor?.key?.id && typeof anchor?.timestampMs === 'number') {
          lastAnchorByChatJid.set(jid, anchor);
        }
      }
    }
    if (parsed?.oldestChatAnchors && typeof parsed.oldestChatAnchors === 'object') {
      for (const [jid, anchor] of Object.entries(parsed.oldestChatAnchors as Record<string, any>)) {
        if (jid && anchor?.key?.id && typeof anchor?.timestampMs === 'number') {
          oldestAnchorByChatJid.set(jid, anchor);
        }
      }
    }
    if (Array.isArray(parsed?.recentMessageKeys)) {
      for (const item of parsed.recentMessageKeys.slice(-2000)) {
        if (item?.key?.id && item?.key?.remoteJid) {
          recentMessageKeysById.set(item.key.id, item);
        }
      }
    }
    if (parsed?.knownGroupNames && typeof parsed.knownGroupNames === 'object') {
      for (const [jid, name] of Object.entries(parsed.knownGroupNames as Record<string, any>)) {
        if (jid && typeof name === 'string' && name.trim()) {
          persistedGroupNamesByJid.set(jid, name.trim());
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [WhatsApp Web Bridge] Falha ao ler data_whatsapp_bridge_state.json:', err?.message || err);
  }
}

function schedulePersistBridgeState() {
  if (persistStateTimer) return;
  persistStateTimer = setTimeout(() => {
    persistStateTimer = null;
    try {
      const chatAnchorsObj: Record<string, any> = {};
      for (const [jid, val] of Array.from(lastAnchorByChatJid.entries()).slice(-300)) {
        chatAnchorsObj[jid] = val;
      }
      const oldestAnchorsObj: Record<string, any> = {};
      for (const [jid, val] of Array.from(oldestAnchorByChatJid.entries()).slice(-300)) {
        oldestAnchorsObj[jid] = val;
      }
      const knownGroupNamesObj: Record<string, string> = {};
      for (const [jid, name] of persistedGroupNamesByJid.entries()) {
        if (jid && name) knownGroupNamesObj[jid] = name;
      }
      for (const [jid, g] of groupsCache.entries()) {
        if (jid && g?.subject) knownGroupNamesObj[jid] = g.subject;
      }
      const payload = {
        lastOnlineAt: lastOnlineAt || new Date().toISOString(),
        lastCatchUpAt,
        lastCatchUpRecovered,
        processedMessageIds: Array.from(processedMessageIds).slice(-1500),
        chatAnchors: chatAnchorsObj,
        oldestChatAnchors: oldestAnchorsObj,
        recentMessageKeys: Array.from(recentMessageKeysById.values()).slice(-2000),
        knownGroupNames: knownGroupNamesObj,
      };
      const tmp = `${BRIDGE_STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmp, BRIDGE_STATE_FILE);
    } catch {
      // Non-fatal state write
    }
  }, 1500);
}

loadPersistedBridgeState();

function rememberBounded(set: Set<string>, id: string, limit = 1500) {
  if (!id) return;
  set.add(id);
  if (set.size > limit) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
}

function cacheChatMedia(entry: CachedChatMedia) {
  recentMediaByMsgId.set(entry.messageId, entry);
  if (recentMediaByMsgId.size > 80) {
    const oldestKey = recentMediaByMsgId.keys().next().value;
    if (oldestKey) recentMediaByMsgId.delete(oldestKey);
  }
  if (entry.kind === 'image') {
    lastImageByChatJid.set(entry.chatJid, entry);
  } else {
    lastAudioByChatJid.set(entry.chatJid, entry);
  }
}

export function getLatestChatMedia(chatJid: string, kind?: 'image' | 'audio'): CachedChatMedia | undefined {
  if (kind === 'image') return lastImageByChatJid.get(chatJid);
  if (kind === 'audio') return lastAudioByChatJid.get(chatJid);
  const img = lastImageByChatJid.get(chatJid);
  const aud = lastAudioByChatJid.get(chatJid);
  if (img && aud) {
    return new Date(aud.timestampIso).getTime() >= new Date(img.timestampIso).getTime() ? aud : img;
  }
  return aud || img;
}

function normalizeAudioMimeType(rawMime?: string): string {
  const clean = String(rawMime || 'audio/ogg').split(';')[0].trim().toLowerCase();
  if (clean === 'audio/ogg' || clean === 'audio/opus' || clean === 'application/ogg') return 'audio/ogg';
  if (clean === 'audio/mpeg' || clean === 'audio/mp3') return 'audio/mp3';
  if (clean === 'audio/mp4' || clean === 'audio/m4a' || clean === 'audio/aac') return 'audio/mp4';
  if (clean === 'audio/wav' || clean === 'audio/x-wav') return 'audio/wav';
  if (clean === 'audio/webm') return 'audio/webm';
  return 'audio/ogg';
}

function clearAuthDirectory() {
  for (const dir of [AUTH_DIR, LEGACY_AUTH_DIR]) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err: any) {
      console.warn('⚠️ [WhatsApp Web Bridge] Falha ao limpar sessão antiga:', err?.message || err);
    }
  }
}

export function hasPersistedBridgeSession(): boolean {
  migrateLegacyAuthDirIfNeeded();
  try {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const raw = fs.readFileSync(credsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.registered || parsed?.me?.id);
  } catch {
    return false;
  }
}

export function registerWhatsAppBridgeHooks(nextHooks: BridgeHooks) {
  hooks = { ...hooks, ...nextHooks };
}

function extractPhoneDigitsFromJid(jid: string | undefined | null): string {
  if (!jid) return '';
  const localPart = String(jid).split('@')[0] || '';
  const phoneOnly = localPart.split(':')[0] || '';
  return phoneOnly.replace(/[^\d]/g, '');
}

async function resolveGroupSubject(sock: WASocket, groupJid: string): Promise<string> {
  const cached = groupsCache.get(groupJid);
  if (cached?.subject) return cached.subject;
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (meta?.subject) {
      rawGroupMetaCache.set(groupJid, { meta, fetchedAt: Date.now() });
      persistedGroupNamesByJid.set(groupJid, meta.subject);
      groupsCache.set(groupJid, {
        jid: groupJid,
        subject: meta.subject,
        participantsCount: Array.isArray(meta.participants) ? meta.participants.length : 0,
        announce: Boolean(meta.announce),
        description: meta.desc || '',
      });
      return meta.subject;
    }
  } catch {
    // Ignore metadata lookup errors on restricted groups
  }
  return persistedGroupNamesByJid.get(groupJid) || groupJid.replace('@g.us', '');
}

export async function refreshBridgeGroups(): Promise<WhatsAppGroupSummary[]> {
  if (!activeSocket || bridgeState !== 'conectado') {
    return Array.from(groupsCache.values());
  }
  try {
    const allGroups = await activeSocket.groupFetchAllParticipating();
    groupsCache.clear();
    const list: WhatsAppGroupSummary[] = [];
    const nowMs = Date.now();
    for (const [jid, meta] of Object.entries(allGroups || {})) {
      rawGroupMetaCache.set(jid, { meta, fetchedAt: nowMs });
      if (meta.subject) persistedGroupNamesByJid.set(jid, meta.subject);
      const summary: WhatsAppGroupSummary = {
        jid,
        subject: meta.subject || jid,
        participantsCount: Array.isArray(meta.participants) ? meta.participants.length : 0,
        announce: Boolean(meta.announce),
        description: meta.desc || '',
      };
      groupsCache.set(jid, summary);
      list.push(summary);
    }
    list.sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'));
    schedulePersistBridgeState();
    return list;
  } catch (err: any) {
    console.warn('⚠️ [WhatsApp Web Bridge] Falha ao listar grupos:', err?.message || err);
    return Array.from(groupsCache.values());
  }
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

let lastWatchdogTickMs = Date.now();
const rawGroupMetaCache = new Map<string, { meta: any; fetchedAt: number }>();

function startWatchdog() {
  stopWatchdog();
  lastWatchdogTickMs = Date.now();
  watchdogTimer = setInterval(() => {
    const nowMs = Date.now();
    const tickGapMs = nowMs - lastWatchdogTickMs;
    lastWatchdogTickMs = nowMs;

    if (manualStopRequested || isStarting || reconnectTimer) return;
    if (!activeSocket) {
      if (hasPersistedBridgeSession() && !lastDisconnectWasFatalLogout && bridgeState !== 'desconectado') {
        scheduleReconnect(2000, 'watchdog_no_socket');
      }
      return;
    }
    if (bridgeState === 'conectado') {
      const wsAny = (activeSocket as any)?.ws;
      const isClosed =
        Boolean(wsAny?.isClosed) ||
        (typeof wsAny?.readyState === 'number' && wsAny.readyState !== 1 && wsAny.readyState !== 0);
      const lastActMs = lastActivityAt ? new Date(lastActivityAt).getTime() : 0;
      const wokeFromFreeze = tickGapMs > 75_000;
      if (isClosed) {
        console.warn('🩺 [WhatsApp Web Bridge] Watchdog detectou WebSocket fechado silenciosamente — reconectando...');
        lastDisconnectedAtMs = nowMs;
        lastDisconnectReason = 'WebSocket encerrado silenciosamente pelo proxy/rede (auto-recuperação)';
        scheduleReconnect(1500, 'watchdog_closed_ws');
      } else if (wokeFromFreeze && (!lastActMs || nowMs - lastActMs > 60_000)) {
        console.warn(
          `🩺 [WhatsApp Web Bridge] Watchdog detectou pausa do container (${Math.round(tickGapMs / 1000)}s) — renovando conexão para receber fila offline...`
        );
        lastDisconnectedAtMs = nowMs - tickGapMs;
        lastDisconnectReason = 'Container acordou de hibernação — reconectando ponte WhatsApp';
        scheduleReconnect(1000, 'watchdog_container_wake');
      } else {
        lastOnlineAt = new Date().toISOString();
        schedulePersistBridgeState();
      }
    }
  }, 20_000);
}

async function destroyCurrentSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const sock = activeSocket;
  activeSocket = null;
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.ev.removeAllListeners('messages.update');
      sock.ev.removeAllListeners('messaging-history.set');
      sock.ev.removeAllListeners('chats.upsert');
      sock.ev.removeAllListeners('chats.update');
      sock.ev.removeAllListeners('groups.upsert');
      sock.ev.removeAllListeners('groups.update');
      sock.ev.removeAllListeners('contacts.upsert');
      sock.ev.removeAllListeners('contacts.update');
      try {
        (sock as any).ws?.close?.();
      } catch {
        // Ignore ws close error
      }
      await sock.end(undefined);
    } catch {
      // Safe cleanup
    }
  }
}

function scheduleReconnect(delayMs: number, reasonTag: string) {
  if (manualStopRequested) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  bridgeState = sessionWasRegistered || hasPersistedBridgeSession() ? 'reconectando' : 'iniciando';
  console.log(
    `🔄 [WhatsApp Web Bridge] Agendando reconexão (${reasonTag}, tentativa ${reconnectAttempts}) em ${delayMs}ms...`
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (manualStopRequested) return;
    startWhatsAppBridgeSession({ isAutoReconnect: true }).catch((e) => {
      lastError = e?.message || 'Erro ao reconectar ponte WhatsApp Web';
      if (sessionWasRegistered || hasPersistedBridgeSession()) {
        reconnectAttempts += 1;
        const nextDelay = Math.min(3000 * Math.pow(1.6, Math.min(reconnectAttempts, 6)), 45_000);
        scheduleReconnect(Math.round(nextDelay), 'retry_after_start_error');
      } else {
        bridgeState = 'desconectado';
      }
    });
  }, delayMs);
}

export function getDiscoveredBridgeContacts() {
  return Array.from(contactsCache.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function getWhatsAppBridgeStatus(): WhatsAppBridgeStatus {
  const groups = Array.from(groupsCache.values()).sort((a, b) =>
    a.subject.localeCompare(b.subject, 'pt-BR')
  );
  return {
    state: bridgeState,
    qrDataUrl: currentQrDataUrl,
    pairingCode: currentPairingCode,
    connectedNumber: connectedNumber || undefined,
    connectedName: connectedName || undefined,
    connectedJid: connectedJid || undefined,
    groups,
    lastError,
    connectedAt: connectedAt || undefined,
    hasSavedSession: hasPersistedBridgeSession(),
    reconnectAttempts,
    lastDisconnectCode,
    lastDisconnectReason,
    lastActivityAt: lastActivityAt || undefined,
    lastCatchUpAt,
    lastCatchUpRecovered,
  };
}

export function ensureWhatsAppBridgeResumed() {
  if (
    manualStopRequested ||
    lastDisconnectWasFatalLogout ||
    isStarting ||
    reconnectTimer ||
    activeSocket ||
    bridgeState !== 'desconectado'
  ) {
    return;
  }
  if (hasPersistedBridgeSession()) {
    console.log('♻️ [WhatsApp Web Bridge] Retomando sessão salva automaticamente...');
    startWhatsAppBridgeSession({ isAutoReconnect: true }).catch((err) => {
      console.warn('⚠️ [WhatsApp Web Bridge] Erro ao retomar sessão automaticamente:', err?.message || err);
    });
  }
}

async function downloadMediaBufferWithRetry(
  sock: WASocket,
  msg: WAMessage,
  maxAttempts = 3
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger: silentLogger as any,
          reuploadRequest: sock.updateMediaMessage,
        }
      );
      if (Buffer.isBuffer(buffer) && buffer.length > 0) {
        return buffer;
      }
    } catch (dlErr: any) {
      if (attempt < maxAttempts) {
        try {
          await sock.updateMediaMessage(msg);
        } catch {
          // Best-effort reupload request before retry
        }
        await new Promise((r) => setTimeout(r, attempt * 1500));
      } else {
        console.warn(
          `⚠️ [WhatsApp Web Bridge] Falha ao baixar mídia após ${maxAttempts} tentativas:`,
          dlErr?.message || dlErr
        );
      }
    }
  }
  return null;
}

function unwrapNormalizedMessageContent(rawMsgContent: any): {
  normalized: any;
  editedTargetMsgId?: string;
} {
  if (!rawMsgContent) return { normalized: undefined };
  let cur: any = normalizeMessageContent(rawMsgContent) || rawMsgContent;
  let editedTargetMsgId: string | undefined;

  for (let i = 0; i < 8 && cur; i++) {
    // 1. Messages sent from WhatsApp Web / Desktop / another linked device (IDs starting with 3EB0...)
    if (cur.deviceSentMessage?.message) {
      cur = normalizeMessageContent(cur.deviceSentMessage.message) || cur.deviceSentMessage.message;
      continue;
    }
    // 2. Disappearing / ephemeral messages
    if (cur.ephemeralMessage?.message) {
      cur = normalizeMessageContent(cur.ephemeralMessage.message) || cur.ephemeralMessage.message;
      continue;
    }
    // 3. View-once wrappers
    if (cur.viewOnceMessage?.message) {
      cur = normalizeMessageContent(cur.viewOnceMessage.message) || cur.viewOnceMessage.message;
      continue;
    }
    if (cur.viewOnceMessageV2?.message) {
      cur = normalizeMessageContent(cur.viewOnceMessageV2.message) || cur.viewOnceMessageV2.message;
      continue;
    }
    if (cur.viewOnceMessageV2Extension?.message) {
      cur =
        normalizeMessageContent(cur.viewOnceMessageV2Extension.message) ||
        cur.viewOnceMessageV2Extension.message;
      continue;
    }
    // 4. Document with caption wrapper
    if (cur.documentWithCaptionMessage?.message) {
      cur =
        normalizeMessageContent(cur.documentWithCaptionMessage.message) ||
        cur.documentWithCaptionMessage.message;
      continue;
    }
    // 5. Group status wrappers
    if (cur.groupStatusMessage?.message) {
      cur = normalizeMessageContent(cur.groupStatusMessage.message) || cur.groupStatusMessage.message;
      continue;
    }
    if (cur.groupStatusMessageV2?.message) {
      cur =
        normalizeMessageContent(cur.groupStatusMessageV2.message) || cur.groupStatusMessageV2.message;
      continue;
    }
    // 6. Edited message wrappers (top-level or inside protocolMessage)
    if (cur.editedMessage?.message) {
      const inner = cur.editedMessage.message;
      if (inner?.protocolMessage?.key?.id && !editedTargetMsgId) {
        editedTargetMsgId = String(inner.protocolMessage.key.id);
      }
      cur =
        normalizeMessageContent(inner?.protocolMessage?.editedMessage || inner) ||
        inner?.protocolMessage?.editedMessage ||
        inner;
      continue;
    }
    const protoMsg = cur.protocolMessage;
    if (protoMsg?.editedMessage) {
      if (protoMsg?.key?.id && !editedTargetMsgId) {
        editedTargetMsgId = String(protoMsg.key.id);
      }
      cur = normalizeMessageContent(protoMsg.editedMessage) || protoMsg.editedMessage;
      continue;
    }
    break;
  }
  return { normalized: cur, editedTargetMsgId };
}

function extractTextAndMediaFromNormalized(normalized: any): {
  text: string;
  hasImage: boolean;
  hasAudio: boolean;
  hasDocument: boolean;
  hasVideo: boolean;
  mediaMimeType?: string;
  fileName?: string;
} {
  if (!normalized) {
    return { text: '', hasImage: false, hasAudio: false, hasDocument: false, hasVideo: false };
  }
  const docMime = normalized.documentMessage?.mimetype || '';
  const hasDocument = Boolean(normalized.documentMessage);
  const hasImage = Boolean(normalized.imageMessage) || (hasDocument && docMime.startsWith('image/'));
  const hasAudio = Boolean(normalized.audioMessage);
  const hasVideo = Boolean(normalized.videoMessage);
  const fileName = normalized.documentMessage?.fileName || undefined;

  const parts: string[] = [];
  const primaryText =
    normalized.conversation ||
    normalized.extendedTextMessage?.text ||
    normalized.imageMessage?.caption ||
    normalized.documentMessage?.caption ||
    normalized.videoMessage?.caption ||
    normalized.buttonsMessage?.contentText ||
    normalized.buttonsResponseMessage?.selectedDisplayText ||
    normalized.listMessage?.description ||
    normalized.listResponseMessage?.title ||
    normalized.templateMessage?.hydratedTemplate?.hydratedContentText ||
    normalized.templateMessage?.hydratedFourRowTemplate?.hydratedContentText ||
    normalized.interactiveMessage?.body?.text ||
    normalized.pollCreationMessage?.name ||
    normalized.pollCreationMessageV2?.name ||
    normalized.pollCreationMessageV3?.name ||
    normalized.contactMessage?.displayName ||
    '';

  if (primaryText && String(primaryText).trim()) {
    parts.push(String(primaryText).trim());
  }
  if (hasDocument && fileName && !parts.some((p) => p.includes(fileName))) {
    parts.push(`[Arquivo] ${fileName}`);
  } else if (hasDocument && !parts.length) {
    parts.push(`[Arquivo] ${docMime || 'documento'}`);
  }

  let text = parts.join('\n').trim();
  if (!text) {
    if (hasAudio) text = '[Áudio / Mensagem de Voz]';
    else if (hasImage) text = '[Foto / Imagem]';
    else if (hasVideo) text = '[Vídeo]';
  }

  const mediaMimeType =
    normalized.imageMessage?.mimetype ||
    docMime ||
    normalized.audioMessage?.mimetype ||
    normalized.videoMessage?.mimetype ||
    undefined;

  return { text, hasImage, hasAudio, hasDocument, hasVideo, mediaMimeType, fileName };
}

/**
 * Passive, side-effect-free history archival:
 * Indexes ANY message received during reconnect/offline history sync or on-demand fetchMessageHistory
 * into the server's searchable message archive so @aguero cost/ND summaries ALWAYS see messages sent
 * while offline — WITHOUT triggering OCR, auto-reply, ND PDF generation, or @aguero replies.
 */
async function archiveRawWAMessageForHistory(
  sock: WASocket,
  msg: WAMessage,
  sourceMode: 'notify' | 'append' | 'history_sync',
  opts?: { allowUpdate?: boolean }
): Promise<boolean> {
  const remoteJid = msg.key?.remoteJid || '';
  const msgId = msg.key?.id || '';
  if (!remoteJid || !msgId || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return false;
  }

  rememberRawMessageForChat(msg);

  const { normalized, editedTargetMsgId } = unwrapNormalizedMessageContent(msg.message);
  if (!normalized) {
    // If WhatsApp delivered a CIPHERTEXT / empty placeholder (decryption miss), request plaintext from primary phone!
    const stubType = Number((msg as any)?.messageStubType || 0);
    if (
      (stubType === 2 || (!msg.message && !stubType)) &&
      !placeholderResendRequestedIds.has(msgId) &&
      typeof (sock as any).requestPlaceholderResend === 'function'
    ) {
      rememberBounded(placeholderResendRequestedIds, msgId, 500);
      (sock as any).requestPlaceholderResend(msg.key).catch(() => undefined);
    }
    return false;
  }

  const effectiveMsgId = editedTargetMsgId || msgId;
  const allowUpdate = Boolean(opts?.allowUpdate || editedTargetMsgId);

  if (!allowUpdate && archivedHistoryMsgIds.has(effectiveMsgId)) {
    return false;
  }

  const nowMs = Date.now();
  const msgTsSec = extractTimestampSec(msg.messageTimestamp);
  const msgTsMs = msgTsSec > 0 ? msgTsSec * 1000 : nowMs;
  // Archive up to 60 days of history so daily/monthly summaries & cross-chat lookups always have full data
  if (nowMs - msgTsMs > 60 * 24 * 60 * 60 * 1000) {
    return false;
  }

  const extracted = extractTextAndMediaFromNormalized(normalized);
  if (!extracted.text) return false;

  const isGroup = remoteJid.endsWith('@g.us');
  const fromMe = Boolean(msg.key?.fromMe);
  const keyAny = msg.key as any;
  const participantJid = isGroup
    ? keyAny?.participantAlt || msg.key?.participant || msg.participant || remoteJid
    : keyAny?.remoteJidAlt || remoteJid;

  const senderDigits = extractPhoneDigitsFromJid(participantJid);
  const senderPhone = senderDigits
    ? formatWhatsAppPhoneDisplay(senderDigits)
    : participantJid.split('@')[0];
  const senderName = fromMe
    ? connectedName || 'Você (WhatsApp Conectado)'
    : msg.pushName || senderPhone || 'Contato WhatsApp';

  const cachedGroup = isGroup ? groupsCache.get(remoteJid) : undefined;
  const groupName = isGroup
    ? cachedGroup?.subject || (sourceMode === 'history_sync' ? remoteJid.replace('@g.us', '') : await resolveGroupSubject(sock, remoteJid))
    : '';

  const timestampIso = new Date(msgTsMs).toISOString();
  rememberBounded(archivedHistoryMsgIds, effectiveMsgId, 12000);

  try {
    await hooks.onHistoryMessage?.({
      messageId: effectiveMsgId,
      remoteJid,
      isGroup,
      groupName,
      senderPhone,
      senderName,
      fromMe,
      text: extracted.text,
      hasMedia: extracted.hasImage || extracted.hasAudio || extracted.hasDocument || extracted.hasVideo,
      mediaMimeType: extracted.mediaMimeType,
      timestampIso,
      sourceMode,
    });
    return true;
  } catch (err: any) {
    console.warn('⚠️ [WhatsApp Web Bridge] Falha no hook onHistoryMessage:', err?.message || err);
    return false;
  }
}

export async function downloadCachedRawMessageMedia(
  chatJid: string,
  messageId: string
): Promise<{ buffer: Buffer; mimeType: string; fileName?: string; kind: 'image' | 'document' | 'audio' | 'other' } | null> {
  const sock = activeSocket;
  if (!sock || bridgeState !== 'conectado') return null;
  let raw = rawMessageByKeyId.get(messageId);
  if (!raw && chatJid) {
    raw = (recentRawMessagesByChatJid.get(chatJid) || []).find((m) => m.key?.id === messageId);
  }
  if (!raw?.message) return null;
  const { normalized } = unwrapNormalizedMessageContent(raw.message);
  if (!normalized) return null;
  const extracted = extractTextAndMediaFromNormalized(normalized);
  if (!extracted.hasImage && !extracted.hasDocument && !extracted.hasAudio) return null;
  const buffer = await downloadMediaBufferWithRetry(sock, raw, 2);
  if (!buffer) return null;
  const kind: 'image' | 'document' | 'audio' | 'other' = extracted.hasImage
    ? 'image'
    : extracted.hasDocument
    ? 'document'
    : extracted.hasAudio
    ? 'audio'
    : 'other';
  return {
    buffer,
    mimeType: extracted.mediaMimeType || 'application/octet-stream',
    fileName: extracted.fileName,
    kind,
  };
}

/**
 * Recovers missing/evicted messages from the user's primary phone using Baileys PLACEHOLDER_MESSAGE_RESEND.
 * Given a list of message keys (or raw message IDs + candidate chatJids), asks the primary phone to resend
 * the full decrypted WebMessageInfo, which automatically feeds into archiveRawWAMessageForHistory.
 */
export async function recoverMissingMessagesByKeys(params: {
  keys: Array<{ remoteJid: string; id: string; fromMe?: boolean; participant?: string }>;
  waitMs?: number;
}): Promise<{ requested: number; errors: string[] }> {
  const sock = activeSocket;
  if (!sock || bridgeState !== 'conectado' || typeof (sock as any).requestPlaceholderResend !== 'function') {
    return { requested: 0, errors: ['WhatsApp não conectado ou requestPlaceholderResend indisponível'] };
  }
  let requested = 0;
  const errors: string[] = [];
  for (const key of (params.keys || []).slice(0, 40)) {
    if (!key?.remoteJid || !key?.id) continue;
    try {
      // Allow re-archiving if it previously got evicted from data_whatsapp_messages.json
      archivedHistoryMsgIds.delete(key.id);
      await (sock as any).requestPlaceholderResend({
        remoteJid: key.remoteJid,
        id: key.id,
        fromMe: Boolean(key.fromMe),
        participant: key.participant || undefined,
      });
      requested += 1;
    } catch (err: any) {
      errors.push(`${key.id}: ${err?.message || err}`);
    }
  }
  if (requested > 0) {
    await new Promise((r) => setTimeout(r, Math.min(Math.max(params.waitMs || 4500, 1500), 10000)));
  }
  return { requested, errors };
}

export function getKnownRecentMessageKeysForChat(chatJid: string): ChatMessageAnchor[] {
  const out: ChatMessageAnchor[] = [];
  for (const item of recentMessageKeysById.values()) {
    if (item.key.remoteJid === chatJid) out.push(item);
  }
  return out;
}

async function processSingleWAMessage(
  sock: WASocket,
  msg: WAMessage,
  sourceMode: 'notify' | 'append' | 'history_sync',
  opts?: { forceMediaRetry?: boolean; forceNdRetry?: boolean; sinceMs?: number }
) {
  const remoteJid = msg.key?.remoteJid || '';
  const msgId = msg.key?.id || '';
  if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return;
  }

  // Always archive raw text/caption into searchable history BEFORE any dedup/cutoff skip!
  await archiveRawWAMessageForHistory(sock, msg, sourceMode, { allowUpdate: Boolean(opts?.forceNdRetry) });

  if (msgId && !opts?.forceMediaRetry && !opts?.forceNdRetry && processedMessageIds.has(msgId)) {
    return;
  }
  if (msgId && sentMessageIds.has(msgId)) {
    return;
  }

  const { normalized } = unwrapNormalizedMessageContent(msg.message);
  if (!normalized) return;

  const nowMs = Date.now();
  const msgTsSec = extractTimestampSec(msg.messageTimestamp);
  const msgTsMs = msgTsSec > 0 ? msgTsSec * 1000 : nowMs;
  const ageMs = nowMs - msgTsMs;

  // Strict cutoff when a manual/targeted catch-up scan specifies an exact sinceMs window
  if (opts?.sinceMs && msgTsMs < opts.sinceMs) {
    return;
  }

  const inCatchUpWindow = nowMs <= catchUpWindowUntilMs && catchUpSinceMs > 0;
  const isPriorityMonitored = Boolean(hooks.isPriorityMonitoredJid?.(remoteJid));
  let isCatchUp = Boolean(opts?.forceMediaRetry || opts?.forceNdRetry);

  if (sourceMode === 'history_sync' || sourceMode === 'append') {
    if (opts?.forceMediaRetry || opts?.forceNdRetry) {
      // Explicit rescan already checked opts.sinceMs above
      isCatchUp = true;
    } else if (sourceMode === 'append' && isPriorityMonitored && ageMs <= 6 * 60 * 60 * 1000) {
      // NEVER drop live/offline append messages in monitored ND or OCR channels (deduped by messageId/records)
      isCatchUp = ageMs > 90_000;
      if (inCatchUpWindow) {
        catchUpWindowUntilMs = Math.max(catchUpWindowUntilMs, nowMs + 5 * 60 * 1000);
      }
    } else if (sourceMode === 'history_sync' && isPriorityMonitored && ageMs <= 2 * 60 * 60 * 1000) {
      // Recent messages in monitored ND/OCR channels delivered via history sync must also be evaluated
      isCatchUp = true;
    } else if (inCatchUpWindow && msgTsMs >= catchUpSinceMs) {
      // Strictly respect the active catchUpSinceMs cutoff (disconnect time or user-selected window)
      isCatchUp = true;
      if (sourceMode === 'append') {
        catchUpWindowUntilMs = Math.max(catchUpWindowUntilMs, nowMs + 5 * 60 * 1000);
      }
    } else if (sourceMode === 'append' && ageMs <= 30 * 60 * 1000) {
      // Allow live phone/web sync appends within the last 30 minutes
      isCatchUp = ageMs > 90_000;
    } else {
      // Historical message older than the active cutoff -> skip triggering OCR/@aguero/ND
      return;
    }
  } else if (sourceMode === 'notify' && ageMs > 45_000 && ageMs <= 24 * 60 * 60 * 1000) {
    isCatchUp = true;
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const fromMe = Boolean(msg.key?.fromMe);
  const keyAny = msg.key as any;
  const participantJid = isGroup
    ? keyAny?.participantAlt || msg.key?.participant || msg.participant || remoteJid
    : keyAny?.remoteJidAlt || remoteJid;

  const senderDigits = extractPhoneDigitsFromJid(participantJid);
  const senderPhone = senderDigits
    ? formatWhatsAppPhoneDisplay(senderDigits)
    : participantJid.split('@')[0];

  const senderName = fromMe
    ? connectedName || 'Você (WhatsApp Conectado)'
    : msg.pushName || senderPhone || 'Contato WhatsApp';

  if (!fromMe && senderDigits && senderDigits.length >= 8) {
    const prevContact = contactsCache.get(senderDigits);
    contactsCache.set(senderDigits, {
      jid: participantJid,
      phoneDigits: senderDigits,
      formattedPhone: senderPhone,
      name:
        msg.pushName && msg.pushName.trim()
          ? msg.pushName.trim()
          : prevContact?.name || senderPhone,
      updatedAt: new Date().toISOString(),
    });
  }

  const groupName = isGroup ? await resolveGroupSubject(sock, remoteJid) : '';

  const extractedMain = extractTextAndMediaFromNormalized(normalized);
  const docMime = normalized.documentMessage?.mimetype || '';
  const hasImage = extractedMain.hasImage;
  const hasAudio = extractedMain.hasAudio;
  const text = extractedMain.text;

  if (!text && !hasImage && !hasAudio) {
    return;
  }

  let mediaBase64: string | undefined;
  let mediaMimeType: string | undefined;
  let audioBase64: string | undefined;
  let audioMimeType: string | undefined;

  const timestampIso = msgTsSec
    ? new Date(msgTsSec * 1000).toISOString()
    : new Date().toISOString();

  const shouldDownload =
    Boolean(opts?.forceMediaRetry) ||
    !hooks.shouldDownloadMedia ||
    hooks.shouldDownloadMedia({
      remoteJid,
      isGroup,
      senderPhone,
      text,
      isCatchUp,
      hasImage,
      hasAudio,
    });

  let imageDownloadFailed = false;
  if (hasImage && shouldDownload) {
    const buffer = await downloadMediaBufferWithRetry(sock, msg, 3);
    if (buffer) {
      mediaBase64 = buffer.toString('base64');
      const resolvedImageMime = normalized.imageMessage?.mimetype || docMime || 'image/jpeg';
      mediaMimeType = resolvedImageMime;
      if (msgId) {
        pendingMediaMessages.delete(msgId);
        cacheChatMedia({
          kind: 'image',
          messageId: msgId,
          chatJid: remoteJid,
          base64: mediaBase64,
          mimeType: resolvedImageMime,
          senderName,
          timestampIso,
        });
      }
    } else {
      imageDownloadFailed = true;
      if (msgId) {
        pendingMediaMessages.set(msgId, msg);
      }
    }
  }

  if (hasAudio && shouldDownload) {
    const buffer = await downloadMediaBufferWithRetry(sock, msg, 2);
    if (buffer) {
      audioBase64 = buffer.toString('base64');
      audioMimeType = normalizeAudioMimeType(normalized.audioMessage?.mimetype ?? undefined);
      if (msgId) {
        cacheChatMedia({
          kind: 'audio',
          messageId: msgId,
          chatJid: remoteJid,
          base64: audioBase64,
          mimeType: audioMimeType,
          senderName,
          timestampIso,
        });
      }
    }
  }

  // Extract quoted message context (text + image/audio media when user replies to a photo or voice note with @aguero)
  const contextInfo =
    normalized.extendedTextMessage?.contextInfo ||
    normalized.imageMessage?.contextInfo ||
    normalized.documentMessage?.contextInfo ||
    undefined;

  const quotedMessageId = contextInfo?.stanzaId ? String(contextInfo.stanzaId) : undefined;
  let quotedText: string | undefined;
  let quotedMediaBase64: string | undefined;
  let quotedMediaMimeType: string | undefined;
  let quotedAudioBase64: string | undefined;
  let quotedAudioMimeType: string | undefined;

  if (quotedMessageId || contextInfo?.quotedMessage) {
    const cachedQuoted = quotedMessageId ? recentMediaByMsgId.get(quotedMessageId) : undefined;
    if (cachedQuoted) {
      if (cachedQuoted.kind === 'image') {
        quotedMediaBase64 = cachedQuoted.base64;
        quotedMediaMimeType = cachedQuoted.mimeType;
      } else {
        quotedAudioBase64 = cachedQuoted.base64;
        quotedAudioMimeType = cachedQuoted.mimeType;
      }
    }

    if (contextInfo?.quotedMessage) {
      const { normalized: qNorm } = unwrapNormalizedMessageContent(contextInfo.quotedMessage);
      if (qNorm) {
        const qExtracted = extractTextAndMediaFromNormalized(qNorm);
        quotedText = qExtracted.text || undefined;

        const qDocMime = qNorm.documentMessage?.mimetype || '';
        const qHasImage =
          !quotedMediaBase64 &&
          (Boolean(qNorm.imageMessage) || (Boolean(qNorm.documentMessage) && qDocMime.startsWith('image/')));
        const qHasAudio = !quotedAudioBase64 && Boolean(qNorm.audioMessage);

        if (qHasImage || qHasAudio) {
          try {
            const fakeQuotedWaMsg: WAMessage = {
              key: {
                remoteJid,
                id: quotedMessageId || `quoted_${Date.now()}`,
                participant: contextInfo.participant || undefined,
              },
              message: contextInfo.quotedMessage,
            } as WAMessage;

            const qBuf = await downloadMediaMessage(
              fakeQuotedWaMsg,
              'buffer',
              {},
              {
                logger: silentLogger as any,
                reuploadRequest: sock.updateMediaMessage,
              }
            );
            if (Buffer.isBuffer(qBuf) && qBuf.length > 0) {
              if (qHasImage) {
                quotedMediaBase64 = qBuf.toString('base64');
                quotedMediaMimeType = qNorm.imageMessage?.mimetype || qDocMime || 'image/jpeg';
              } else if (qHasAudio) {
                quotedAudioBase64 = qBuf.toString('base64');
                quotedAudioMimeType = normalizeAudioMimeType(qNorm.audioMessage?.mimetype ?? undefined);
              }
            }
          } catch (qDlErr: any) {
            console.warn('⚠️ [WhatsApp Web Bridge] Falha ao baixar mídia da mensagem citada:', qDlErr?.message || qDlErr);
          }
        }
      }
    }
  }

  // Only mark as processed if media download succeeded (so failed image downloads can be retried on next catch-up/sync!)
  if (msgId && !imageDownloadFailed) {
    rememberBounded(processedMessageIds, msgId);
  }
  lastOnlineAt = new Date().toISOString();
  if (isCatchUp && !imageDownloadFailed) {
    lastCatchUpAt = new Date().toISOString();
    lastCatchUpRecovered += 1;
  }
  schedulePersistBridgeState();

  await hooks.onIncomingMessage?.({
    messageId: msgId || `waweb_${Date.now()}`,
    remoteJid,
    isGroup,
    groupName,
    senderPhone,
    senderName,
    fromMe,
    text: text || (hasAudio ? '[Áudio / Mensagem de Voz]' : hasImage ? '[Foto / Imagem]' : ''),
    mediaBase64,
    mediaMimeType,
    hasAudio,
    audioBase64,
    audioMimeType,
    quotedText,
    quotedMessageId,
    quotedMediaBase64,
    quotedMediaMimeType,
    quotedAudioBase64,
    quotedAudioMimeType,
    isCatchUp,
    timestampIso,
    rawMessage: msg,
  });
}

function enqueueIncomingMessage(
  sock: WASocket,
  msg: WAMessage,
  sourceMode: 'notify' | 'append' | 'history_sync',
  opts?: { forceMediaRetry?: boolean; forceNdRetry?: boolean; sinceMs?: number }
) {
  // Per-chat serialized queue: keeps message order within each chat while ensuring
  // unmonitored noisy groups NEVER stall monitored ND/OCR/@aguero chats!
  const chatKey = msg.key?.remoteJid || '__global__';
  const prev = chatEventQueues.get(chatKey) || Promise.resolve();
  const next = prev
    .then(async () => {
      if (activeSocket !== sock) return;
      await processSingleWAMessage(sock, msg, sourceMode, opts);
    })
    .catch((err: any) => {
      console.warn('⚠️ [WhatsApp Web Bridge] Erro na fila de mensagem:', err?.message || err);
    })
    .finally(() => {
      if (chatEventQueues.get(chatKey) === next) {
        chatEventQueues.delete(chatKey);
      }
    });
  chatEventQueues.set(chatKey, next);
}

async function drainActiveChatQueues(targetJids?: Set<string>) {
  const pending: Promise<void>[] = [];
  for (const [jid, p] of chatEventQueues.entries()) {
    if (!targetJids || targetJids.has(jid)) {
      pending.push(p);
    }
  }
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
}

/**
 * Actively scans and recovers missed images/messages on reconnect or manual Sync:
 * 1) Retries any image downloads that failed transiently during reconnect
 * 2) Scans cached recent messages (up to lookbackHours) for active OCR/ND channels not yet processed
 * 3) Requests on-demand history pull from WhatsApp primary phone via Baileys fetchMessageHistory
 */
export async function scanAndCatchUpChannels(params: {
  targetJids: string[];
  ndRuleJids?: Set<string>;
  alreadyProcessedReceiptIds?: Set<string>;
  alreadyProcessedNdMsgIds?: Set<string>;
  lookbackHours?: number;
  sinceMs?: number;
  skipHistoryPull?: boolean;
}): Promise<{
  retriedPendingMedia: number;
  rescannedCachedImages: number;
  rescannedNdMessages: number;
  historyPullRequested: number;
  sinceIso: string;
}> {
  const nowMs = Date.now();
  const effectiveSinceMs =
    params.sinceMs && Number.isFinite(params.sinceMs) && params.sinceMs > 0
      ? params.sinceMs
      : nowMs - (params.lookbackHours || 2) * 60 * 60 * 1000;
  const sinceIso = new Date(effectiveSinceMs).toISOString();

  const sock = activeSocket;
  if (!sock || bridgeState !== 'conectado') {
    return {
      retriedPendingMedia: 0,
      rescannedCachedImages: 0,
      rescannedNdMessages: 0,
      historyPullRequested: 0,
      sinceIso,
    };
  }

  const targetSet = new Set((params.targetJids || []).filter(Boolean));
  const ndSet = params.ndRuleJids || new Set<string>();
  const processedReceipts = params.alreadyProcessedReceiptIds || new Set<string>();
  const processedNdIds = params.alreadyProcessedNdMsgIds || new Set<string>();

  // Set exact catch-up cutoff so any incoming on-demand history sync batch ONLY processes messages >= effectiveSinceMs
  catchUpSinceMs = effectiveSinceMs;
  catchUpWindowUntilMs = Math.max(catchUpWindowUntilMs, nowMs + 10 * 60 * 1000);

  let retriedPendingMedia = 0;
  let rescannedCachedImages = 0;
  let rescannedNdMessages = 0;
  let historyPullRequested = 0;

  // 1. Retry any pending failed media downloads within the selected cutoff
  for (const [msgId, msg] of Array.from(pendingMediaMessages.entries())) {
    if (processedReceipts.has(msgId)) {
      pendingMediaMessages.delete(msgId);
      continue;
    }
    const tsSec = extractTimestampSec(msg.messageTimestamp);
    const tsMs = tsSec > 0 ? tsSec * 1000 : nowMs;
    if (tsMs < effectiveSinceMs) continue;
    retriedPendingMedia += 1;
    enqueueIncomingMessage(sock, msg, 'history_sync', {
      forceMediaRetry: true,
      sinceMs: effectiveSinceMs,
    });
  }

  // 2. Scan recent cached raw messages for target OCR & ND channels strictly >= effectiveSinceMs
  for (const jid of targetSet) {
    const isNdChannel = ndSet.has(jid);
    const cachedList = recentRawMessagesByChatJid.get(jid) || [];
    for (const msg of cachedList) {
      const msgId = msg.key?.id || '';
      if (!msgId || sentMessageIds.has(msgId)) continue;
      const tsSec = extractTimestampSec(msg.messageTimestamp);
      const tsMs = tsSec > 0 ? tsSec * 1000 : nowMs;
      if (tsMs < effectiveSinceMs) continue;

      const { normalized: norm } = unwrapNormalizedMessageContent(msg.message);
      if (!norm) continue;
      const extracted = extractTextAndMediaFromNormalized(norm);

      if (extracted.hasImage && !processedReceipts.has(msgId)) {
        rescannedCachedImages += 1;
        enqueueIncomingMessage(sock, msg, 'history_sync', {
          forceMediaRetry: true,
          sinceMs: effectiveSinceMs,
        });
      } else if (isNdChannel && extracted.text && !processedNdIds.has(msgId)) {
        rescannedNdMessages += 1;
        enqueueIncomingMessage(sock, msg, 'history_sync', {
          forceNdRetry: true,
          sinceMs: effectiveSinceMs,
        });
      }
    }

    // 3. Request on-demand history pull from primary phone only when explicitly needed
    if (!params.skipHistoryPull) {
      const anchor = lastAnchorByChatJid.get(jid);
      if (anchor && typeof (sock as any).fetchMessageHistory === 'function') {
        try {
          await (sock as any).fetchMessageHistory(20, anchor.key, anchor.timestampMs);
          historyPullRequested += 1;
        } catch (pullErr: any) {
          console.warn(`⚠️ [WA Catch-Up] fetchMessageHistory (${jid}):`, pullErr?.message || pullErr);
        }
      }
    }
  }

  // Wait for queued messages + brief window for any on-demand history response
  await drainActiveChatQueues(targetSet);
  if (historyPullRequested > 0) {
    await new Promise((r) => setTimeout(r, 2500));
    await drainActiveChatQueues(targetSet);
  }

  return { retriedPendingMedia, rescannedCachedImages, rescannedNdMessages, historyPullRequested, sinceIso };
}

/**
 * On-demand passive history synchronization for @aguero cost/ND summaries and post-reconnect catch-up.
 * Pulls missed offline/historical messages from the primary WhatsApp phone via Baileys fetchMessageHistory
 * and archives them strictly read-only (via onHistoryMessage) WITHOUT triggering OCR/ND/auto-reply spam.
 */
export async function syncChatHistoryOnDemand(params: {
  chatJid: string;
  sinceMs?: number;
  fallbackAnchors?: Array<{
    key: { remoteJid: string; id: string; fromMe?: boolean; participant?: string };
    timestampMs: number;
  }>;
  maxBatches?: number;
  countPerBatch?: number;
}): Promise<{
  synced: boolean;
  pulledBatches: number;
  archivedFromCache: number;
  receivedFromHistorySync: number;
  oldestTimestampIso?: string;
  note?: string;
}> {
  const chatJid = String(params.chatJid || '').trim();
  const sock = activeSocket;
  if (!chatJid || !sock || bridgeState !== 'conectado') {
    return {
      synced: false,
      pulledBatches: 0,
      archivedFromCache: 0,
      receivedFromHistorySync: 0,
      note: 'WhatsApp não conectado no momento.',
    };
  }

  // 1. Ensure group subject is in cache before archiving
  if (chatJid.endsWith('@g.us') && !groupsCache.has(chatJid)) {
    await resolveGroupSubject(sock, chatJid).catch(() => undefined);
  }

  // 2. Flush any cached raw messages for this chat into the searchable archive
  let archivedFromCache = 0;
  const cachedList = recentRawMessagesByChatJid.get(chatJid) || [];
  for (const rawMsg of cachedList) {
    const added = await archiveRawWAMessageForHistory(sock, rawMsg, 'history_sync');
    if (added) archivedFromCache += 1;
  }

  // 3. Seed anchors from server's saved WhatsApp message history if in-memory anchors are missing/narrower
  if (Array.isArray(params.fallbackAnchors)) {
    for (const fb of params.fallbackAnchors) {
      if (!fb?.key?.id || !fb.timestampMs) continue;
      const curNewest = lastAnchorByChatJid.get(chatJid);
      if (!curNewest || fb.timestampMs > curNewest.timestampMs) {
        lastAnchorByChatJid.set(chatJid, fb);
      }
      const curOldest = oldestAnchorByChatJid.get(chatJid);
      if (!curOldest || fb.timestampMs < curOldest.timestampMs) {
        oldestAnchorByChatJid.set(chatJid, fb);
      }
    }
  }

  const maxBatches = Math.min(Math.max(Number(params.maxBatches || 2), 1), 4);
  const countPerBatch = Math.min(Math.max(Number(params.countPerBatch || 50), 15), 100);
  const targetSinceMs = params.sinceMs || Date.now() - 24 * 60 * 60 * 1000;

  let pulledBatches = 0;
  let receivedFromHistorySync = 0;

  if (typeof (sock as any).fetchMessageHistory === 'function') {
    const waitForBatch = (timeoutMs: number) =>
      new Promise<number>((resolve) => {
        let settled = false;
        const done = (cnt: number) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(cnt);
        };
        const timer = setTimeout(() => done(0), timeoutMs);
        const list = historySyncWaiters.get(chatJid) || [];
        list.push(done);
        historySyncWaiters.set(chatJid, list);
      });

    const usedAnchorIds = new Set<string>();

    for (let batch = 0; batch < maxBatches; batch++) {
      // Batch 0: start from newest anchor to capture any offline gap right before the latest message;
      // Subsequent batches: walk backwards from oldest anchor until we cover targetSinceMs.
      const anchor =
        batch === 0
          ? lastAnchorByChatJid.get(chatJid) || oldestAnchorByChatJid.get(chatJid)
          : oldestAnchorByChatJid.get(chatJid);

      if (!anchor || usedAnchorIds.has(anchor.key.id)) break;
      if (batch > 0 && anchor.timestampMs <= targetSinceMs) break;

      usedAnchorIds.add(anchor.key.id);
      const waitPromise = waitForBatch(4200);
      try {
        await (sock as any).fetchMessageHistory(countPerBatch, anchor.key, anchor.timestampMs);
        pulledBatches += 1;
        const gotCount = await waitPromise;
        receivedFromHistorySync += gotCount;
        // Brief settle so any concurrent archiveRawWAMessageForHistory promises finish
        if (gotCount > 0) {
          await new Promise((r) => setTimeout(r, 450));
        } else {
          break;
        }
      } catch (pullErr: any) {
        console.warn(`⚠️ [WA History Sync] fetchMessageHistory(${chatJid}):`, pullErr?.message || pullErr);
        break;
      }
    }
  }

  schedulePersistBridgeState();
  const oldestFinal = oldestAnchorByChatJid.get(chatJid);
  return {
    synced: true,
    pulledBatches,
    archivedFromCache,
    receivedFromHistorySync,
    oldestTimestampIso: oldestFinal ? new Date(oldestFinal.timestampMs).toISOString() : undefined,
  };
}

export async function startWhatsAppBridgeSession(options?: {
  phoneNumberForPairing?: string;
  forceFreshQr?: boolean;
  isAutoReconnect?: boolean;
}): Promise<WhatsAppBridgeStatus> {
  if (isStarting) {
    return getWhatsAppBridgeStatus();
  }

  const isManualStart = !options?.isAutoReconnect;

  if (options?.forceFreshQr) {
    await destroyCurrentSocket();
    clearAuthDirectory();
    freshQrPairingInProgress = true;
    connectedNumber = '';
    connectedName = '';
    connectedJid = '';
    connectedAt = '';
    sessionWasRegistered = false;
    groupsCache.clear();
  } else if (
    isManualStart &&
    activeSocket &&
    (bridgeState === 'conectado' || bridgeState === 'aguardando_qr' || bridgeState === 'aguardando_pareamento')
  ) {
    if (!options?.phoneNumberForPairing) {
      return getWhatsAppBridgeStatus();
    }
  }

  if (isManualStart) {
    reconnectAttempts = 0;
    qrCycleAttempts = 0;
    badSessionCount = 0;
    connectionReplacedCount = 0;
    lastDisconnectWasFatalLogout = false;
    lastDisconnectCode = null;
    lastDisconnectReason = null;
    lastError = null;
  }

  isStarting = true;
  manualStopRequested = false;
  currentQrDataUrl = null;
  currentPairingCode = null;
  pairingCodeRequestedForSocket = false;
  if (options?.phoneNumberForPairing !== undefined) {
    pendingPairingPhone = options.phoneNumberForPairing
      ? normalizeWhatsAppPhone(options.phoneNumberForPairing)
      : null;
  } else if (isManualStart) {
    pendingPairingPhone = null;
  }

  const alreadyHasSession = hasPersistedBridgeSession();
  bridgeState = pendingPairingPhone
    ? 'aguardando_pareamento'
    : alreadyHasSession && options?.isAutoReconnect
    ? 'reconectando'
    : 'iniciando';

  try {
    await destroyCurrentSocket();
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    sessionWasRegistered = Boolean(state.creds.registered || state.creds.me?.id);

    let waVersion: [number, number, number] = [2, 3000, 1043857760];
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      if (latest && Array.isArray(latest.version) && latest.version.length === 3) {
        waVersion = latest.version;
      }
    } catch {
      // Keep tested fallback WA Web version
    }

    const sock = makeWASocket({
      version: waVersion,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
      },
      logger: silentLogger,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      // CRITICAL: drop status@broadcast, @newsletter, @broadcast AND known unmonitored high-noise personal/promo groups
      // BEFORE Baileys' sequential offlineNodeProcessor so monitored ND/OCR/corporate groups drain in <2 seconds!
      shouldIgnoreJid: (jid: string) => {
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) {
          return true;
        }
        if (jid.endsWith('@g.us') && hooks.shouldIgnoreGroupJid) {
          const knownName = groupsCache.get(jid)?.subject || persistedGroupNamesByJid.get(jid);
          return Boolean(hooks.shouldIgnoreGroupJid(jid, knownName));
        }
        return false;
      },
      // Only request full multi-year history on fresh QR pairing; on reconnect keep RECENT + ON_DEMAND fast!
      syncFullHistory: !sessionWasRegistered,
      shouldSyncHistoryMessage: (histMsg: any) => {
        if (!sessionWasRegistered) return true;
        // Skip giant FULL (syncType 3) archive blobs on normal reconnects so live/offline queues stay instant
        return histMsg?.syncType !== 3;
      },
      keepAliveIntervalMs: 20_000,
      connectTimeoutMs: 45_000,
      defaultQueryTimeoutMs: 20_000,
      qrTimeout: 45_000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 2,
      generateHighQualityLinkPreview: false,
      cachedGroupMetadata: async (jid: string) => {
        const entry = rawGroupMetaCache.get(jid);
        if (entry && Date.now() - entry.fetchedAt < 5 * 60 * 1000) {
          return entry.meta;
        }
        return undefined;
      },
      getMessage: async (key) => {
        const msgId = key?.id || '';
        if (!msgId) return undefined;
        const found = rawMessageByKeyId.get(msgId);
        return found?.message || undefined;
      },
    });

    activeSocket = sock;
    startWatchdog();

    sock.ev.on('creds.update', () => {
      credsWriteQueue = credsWriteQueue
        .then(() => saveCreds())
        .catch((err: any) => {
          console.warn('⚠️ [WhatsApp Web Bridge] Erro ao salvar credenciais:', err?.message || err);
        });
    });

    sock.ev.on('groups.upsert', (newGroups) => {
      for (const g of newGroups || []) {
        if (g.id) {
          groupsCache.set(g.id, {
            jid: g.id,
            subject: g.subject || g.id,
            participantsCount: Array.isArray(g.participants) ? g.participants.length : 0,
            announce: Boolean(g.announce),
            description: g.desc || '',
          });
        }
      }
    });

    sock.ev.on('groups.update', (updates) => {
      for (const u of updates || []) {
        if (!u.id) continue;
        const prev = groupsCache.get(u.id);
        groupsCache.set(u.id, {
          jid: u.id,
          subject: u.subject || prev?.subject || u.id,
          participantsCount: Array.isArray(u.participants)
            ? u.participants.length
            : prev?.participantsCount || 0,
          announce: u.announce ?? prev?.announce,
          description: u.desc ?? prev?.description,
        });
      }
    });

    const upsertBridgeContact = (c: any) => {
      const rawId = String(c?.id || c?.jid || '');
      if (!rawId || rawId.endsWith('@g.us') || rawId === 'status@broadcast' || rawId.endsWith('@newsletter')) return;
      const digits = extractPhoneDigitsFromJid(c?.phoneNumber || rawId);
      if (!digits || digits.length < 8) return;
      const name = String(c?.notify || c?.name || c?.verifiedName || formatWhatsAppPhoneDisplay(digits)).trim();
      const prev = contactsCache.get(digits);
      contactsCache.set(digits, {
        jid: rawId,
        phoneDigits: digits,
        formattedPhone: formatWhatsAppPhoneDisplay(digits),
        name: name && name !== digits ? name : prev?.name || formatWhatsAppPhoneDisplay(digits),
        updatedAt: new Date().toISOString(),
      });
    };

    sock.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts || []) upsertBridgeContact(c);
    });

    sock.ev.on('contacts.update', (updates) => {
      for (const c of updates || []) upsertBridgeContact(c);
    });

    sock.ev.on('connection.update', async (update) => {
      if (activeSocket !== sock) return;

      const { connection, lastDisconnect, qr } = update;
      lastActivityAt = new Date().toISOString();

      if (qr) {
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: '#0B132B', light: '#FFFFFF' },
          });
          if (!pendingPairingPhone) {
            bridgeState = 'aguardando_qr';
          }
          lastError = null;
        } catch (qrErr: any) {
          lastError = `Erro ao gerar QR Code: ${qrErr?.message || qrErr}`;
        }

        if (pendingPairingPhone && !state.creds.registered && !pairingCodeRequestedForSocket) {
          pairingCodeRequestedForSocket = true;
          try {
            const code = await sock.requestPairingCode(pendingPairingPhone);
            currentPairingCode = code;
            bridgeState = 'aguardando_pareamento';
            console.log(`🔑 [WhatsApp Web Bridge] Código de pareamento gerado para +${pendingPairingPhone}: ${code}`);
          } catch (pairErr: any) {
            lastError = `Falha ao solicitar código de pareamento: ${pairErr?.message || pairErr}`;
            bridgeState = 'aguardando_qr';
          }
        }
      }

      if (connection === 'open') {
        const nowMs = Date.now();
        const persistedLastOnlineMs = lastOnlineAt ? new Date(lastOnlineAt).getTime() : 0;
        const rawOfflineSince =
          lastDisconnectedAtMs > 0
            ? lastDisconnectedAtMs
            : persistedLastOnlineMs > 0
            ? persistedLastOnlineMs
            : nowMs - 2 * 60 * 60 * 1000;

        if (freshQrPairingInProgress) {
          // Fresh QR pairing triggers INITIAL_BOOTSTRAP + RECENT + FULL history sync:
          // Archive ALL historical messages passively via onHistoryMessage, but do NOT fire OCR/ND/auto-reply on old history!
          catchUpSinceMs = nowMs;
          catchUpWindowUntilMs = nowMs;
          freshQrPairingInProgress = false;
        } else {
          // Cover only the actual offline gap (-2 min safety margin), clamped between 15 min and 12h
          const earliestAllowed = nowMs - 12 * 60 * 60 * 1000;
          const latestAllowed = nowMs - 15 * 60 * 1000;
          const computedSince = Math.max(
            Math.min(rawOfflineSince - 2 * 60 * 1000, latestAllowed),
            earliestAllowed
          );
          catchUpSinceMs =
            catchUpSinceMs > 0 && nowMs <= catchUpWindowUntilMs
              ? Math.min(catchUpSinceMs, computedSince)
              : computedSince;
          catchUpWindowUntilMs = nowMs + 20 * 60 * 1000;
        }

        reconnectAttempts = 0;
        qrCycleAttempts = 0;
        badSessionCount = 0;
        connectionReplacedCount = 0;
        sessionWasRegistered = true;
        lastDisconnectWasFatalLogout = false;
        lastDisconnectCode = null;
        lastDisconnectReason = null;
        lastDisconnectedAtMs = 0;
        lastError = null;
        currentQrDataUrl = null;
        currentPairingCode = null;
        pendingPairingPhone = null;
        bridgeState = 'conectado';
        connectedAt = new Date().toISOString();
        lastOnlineAt = connectedAt;
        schedulePersistBridgeState();

        const rawJid = sock.user?.id || '';
        const digits = extractPhoneDigitsFromJid(rawJid);
        connectedJid = rawJid;
        connectedNumber = digits ? formatWhatsAppPhoneDisplay(digits) : rawJid;
        connectedName = sock.user?.name || 'WhatsApp Conectado';

        console.log(
          `✅ [WhatsApp Web Bridge] Conectado (${connectedNumber} · ${connectedName}). Janela de catch-up pós-reconexão ativa desde ${new Date(catchUpSinceMs).toISOString()}.`
        );

        refreshBridgeGroups().catch(() => undefined);
        hooks.onConnectionOpen?.({
          connectedNumber,
          connectedName,
          connectedJid,
        });
      }

      if (connection === 'close') {
        const errObj = lastDisconnect?.error as any;
        const statusCode: number | undefined = errObj?.output?.statusCode ?? errObj?.statusCode;
        const errMessage = String(errObj?.message || errObj?.output?.payload?.message || '');
        const isRegisteredNow = Boolean(sessionWasRegistered || state.creds.registered || state.creds.me?.id);

        if (lastDisconnectedAtMs === 0) {
          lastDisconnectedAtMs = Date.now();
        }
        lastDisconnectCode = statusCode ?? null;
        lastDisconnectReason = errMessage || (statusCode ? `Código ${statusCode}` : 'Conexão encerrada');
        schedulePersistBridgeState();

        if (manualStopRequested) {
          bridgeState = 'desconectado';
          currentQrDataUrl = null;
          currentPairingCode = null;
          return;
        }

        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log('🔄 [WhatsApp Web Bridge] WhatsApp solicitou reinício do stream (515) — reconectando em 1s...');
          scheduleReconnect(1000, 'restart_required_515');
          return;
        }

        const isFatalAuth =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === DisconnectReason.forbidden ||
          statusCode === DisconnectReason.multideviceMismatch;

        if (isFatalAuth) {
          if (!isRegisteredNow && qrCycleAttempts < 1) {
            qrCycleAttempts += 1;
            console.warn(`⚠️ [WhatsApp Web Bridge] Handshake inicial rejeitado (${statusCode}). Limpando auth parcial e gerando novo QR...`);
            clearAuthDirectory();
            scheduleReconnect(1500, `stale_handshake_${statusCode}`);
            return;
          }

          console.warn(`🔌 [WhatsApp Web Bridge] Sessão encerrada pelo WhatsApp (${statusCode}).`);
          clearAuthDirectory();
          activeSocket = null;
          sessionWasRegistered = false;
          lastDisconnectWasFatalLogout = true;
          bridgeState = 'desconectado';
          currentQrDataUrl = null;
          currentPairingCode = null;
          connectedNumber = '';
          connectedName = '';
          connectedJid = '';
          groupsCache.clear();
          lastError =
            statusCode === DisconnectReason.loggedOut
              ? 'Aparelho desconectado pelo WhatsApp (sessão revogada no celular). Gere um novo QR Code para reconectar.'
              : `Sessão recusada pelo WhatsApp (código ${statusCode}). Gere um novo QR Code para reconectar.`;
          hooks.onConnectionClose?.(lastError);
          return;
        }

        if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
          connectionReplacedCount += 1;
          if (connectionReplacedCount <= 2) {
            lastError = 'Sessão substituída momentaneamente (440). Aguardando 12s para retomar com segurança...';
            scheduleReconnect(12_000, 'connection_replaced_440');
            return;
          }
          activeSocket = null;
          bridgeState = 'desconectado';
          lastError =
            'Conexão substituída por outra sessão ativa (código 440). Feche outras instâncias usando este mesmo aparelho e clique em Reconectar.';
          hooks.onConnectionClose?.(lastError);
          return;
        }

        if (statusCode === DisconnectReason.badSession || statusCode === 500) {
          badSessionCount += 1;
          if (badSessionCount >= 5) {
            console.warn('⚠️ [WhatsApp Web Bridge] Bad Session persistente (500 x5). Limpando credenciais corrompidas.');
            clearAuthDirectory();
            activeSocket = null;
            sessionWasRegistered = false;
            lastDisconnectWasFatalLogout = true;
            bridgeState = 'desconectado';
            currentQrDataUrl = null;
            lastError = 'Sessão local corrompida (código 500). Clique em "Conectar Meu WhatsApp" para escanear um novo QR Code.';
            hooks.onConnectionClose?.(lastError);
            return;
          }
        }

        if (!isRegisteredNow) {
          const isQrExpired =
            errMessage.toLowerCase().includes('qr refs attempts ended') ||
            statusCode === DisconnectReason.timedOut ||
            statusCode === 408;

          if (isQrExpired && qrCycleAttempts >= 2) {
            activeSocket = null;
            bridgeState = 'desconectado';
            currentQrDataUrl = null;
            currentPairingCode = null;
            lastError =
              'O QR Code expirou aguardando leitura no celular. Clique em "Conectar Meu WhatsApp" para gerar um novo QR Code.';
            return;
          }

          if (qrCycleAttempts < 2) {
            qrCycleAttempts += 1;
            const delayMs = isQrExpired ? 1500 : 2500;
            scheduleReconnect(delayMs, `qr_refresh_cycle_${qrCycleAttempts}`);
            return;
          }

          activeSocket = null;
          bridgeState = 'desconectado';
          currentQrDataUrl = null;
          lastError = errMessage
            ? `Conexão encerrada antes do pareamento (${errMessage}). Clique em Conectar novamente.`
            : 'Conexão encerrada antes do pareamento. Clique em Conectar novamente.';
          return;
        }

        reconnectAttempts += 1;
        const baseDelay = Math.min(2000 * Math.pow(1.6, Math.min(reconnectAttempts - 1, 6)), 45_000);
        const jitter = Math.floor(Math.random() * 800);
        const delayMs = Math.round(baseDelay + jitter);
        lastError = `Queda momentânea na conexão (${statusCode || 'rede'}). Reconectando automaticamente (tentativa ${reconnectAttempts})...`;
        scheduleReconnect(delayMs, `paired_auto_recover_${statusCode || 'net'}`);
      }
    });

    // Helper to extract WAMessages nested inside chats arrays emitted by WhatsApp history/chats sync
    const extractNestedChatMessages = (chats: any[]): WAMessage[] => {
      const out: WAMessage[] = [];
      for (const ch of chats || []) {
        const chJid = String(ch?.id || '');
        const nested = Array.isArray(ch?.messages) ? ch.messages : [];
        for (const item of nested) {
          const waMsg: WAMessage | undefined = item?.message || (item?.key ? item : undefined);
          if (waMsg && waMsg.key?.id) {
            if (!waMsg.key.remoteJid && chJid) {
              waMsg.key.remoteJid = chJid;
            }
            out.push(waMsg);
          }
        }
      }
      return out;
    };

    sock.ev.on('chats.upsert', (chats: any[]) => {
      if (activeSocket !== sock) return;
      const nested = extractNestedChatMessages(chats);
      for (const m of nested) {
        archiveRawWAMessageForHistory(sock, m, 'history_sync').catch(() => undefined);
      }
    });

    sock.ev.on('chats.update', (chats: any[]) => {
      if (activeSocket !== sock) return;
      const nested = extractNestedChatMessages(chats);
      for (const m of nested) {
        archiveRawWAMessageForHistory(sock, m, 'history_sync').catch(() => undefined);
      }
    });

    // Offline catch-up batch emitted by WhatsApp right after reconnection or on-demand history pull
    sock.ev.on('messaging-history.set', (historyEvt: any) => {
      if (activeSocket !== sock) return;
      const directMsgs: WAMessage[] = Array.isArray(historyEvt?.messages) ? historyEvt.messages : [];
      const nestedMsgs = extractNestedChatMessages(Array.isArray(historyEvt?.chats) ? historyEvt.chats : []);
      const combined = [...directMsgs, ...nestedMsgs];
      if (combined.length === 0) return;

      // Sort chronologically (oldest first) so catch-up runs in natural order
      const sorted = combined.sort(
        (a, b) => extractTimestampSec(a.messageTimestamp) - extractTimestampSec(b.messageTimestamp)
      );

      // Immediately archive ALL synced messages (read-only) so @aguero summaries see offline history right away
      const msgsByChat = new Map<string, WAMessage[]>();
      Promise.all(
        sorted.map(async (m) => {
          const jid = m.key?.remoteJid || '';
          if (jid) {
            const arr = msgsByChat.get(jid) || [];
            arr.push(m);
            msgsByChat.set(jid, arr);
          }
          await archiveRawWAMessageForHistory(sock, m, 'history_sync');
        })
      )
        .then(() => {
          for (const [jid, list] of msgsByChat.entries()) {
            notifyHistorySyncWaiters(jid, list.length);
          }
          schedulePersistBridgeState();
        })
        .catch(() => undefined);

      // Enqueue into active automation pipeline (strictly gated by catchUpSinceMs for OCR/@aguero/ND)
      for (const msg of sorted) {
        enqueueIncomingMessage(sock, msg, 'history_sync');
      }
    });

    // Capture edited messages & late-decrypted placeholder messages AND feed them into live automation!
    sock.ev.on('messages.update', (updates: any[]) => {
      if (activeSocket !== sock) return;
      for (const item of updates || []) {
        const key = item?.key;
        const upd = item?.update;
        if (!key?.remoteJid || !key?.id) continue;
        if (upd?.message) {
          const prev = rawMessageByKeyId.get(key.id);
          const merged: WAMessage = {
            ...(prev || {}),
            key,
            message: upd.message,
            messageTimestamp: upd.messageTimestamp || prev?.messageTimestamp || Math.floor(Date.now() / 1000),
            pushName: upd.pushName || prev?.pushName,
          } as WAMessage;
          archiveRawWAMessageForHistory(sock, merged, 'append', { allowUpdate: true }).catch(() => undefined);

          // If this was a late-decrypted CIPHERTEXT group message or recent edit (last 6h), trigger live pipeline!
          const msgTsSec = extractTimestampSec(merged.messageTimestamp);
          const msgTsMs = msgTsSec > 0 ? msgTsSec * 1000 : Date.now();
          if (!sentMessageIds.has(key.id) && Date.now() - msgTsMs <= 6 * 60 * 60 * 1000) {
            enqueueIncomingMessage(sock, merged, 'notify', { forceNdRetry: true });
          }
        }
      }
    });

    sock.ev.on('messages.upsert', (upsert) => {
      if (activeSocket !== sock) return;
      if (upsert.type !== 'notify' && upsert.type !== 'append') return;
      lastActivityAt = new Date().toISOString();

      const sorted = [...(upsert.messages || [])].sort(
        (a, b) => extractTimestampSec(a.messageTimestamp) - extractTimestampSec(b.messageTimestamp)
      );
      const mode = upsert.type === 'notify' ? 'notify' : 'append';
      for (const msg of sorted) {
        const rJid = msg.key?.remoteJid || '';
        if (rJid && hooks.isPriorityMonitoredJid?.(rJid)) {
          const tsSec = extractTimestampSec(msg.messageTimestamp);
          const { normalized } = unwrapNormalizedMessageContent(msg.message);
          const preview = normalized ? extractTextAndMediaFromNormalized(normalized).text.slice(0, 60) : '(sem conteúdo/ciphertext)';
          console.log(
            `📨 [WA Monitorado] mode=${mode} fromMe=${Boolean(msg.key?.fromMe)} jid=${rJid} id=${msg.key?.id} ts=${tsSec ? new Date(tsSec * 1000).toISOString() : 'now'} text=${JSON.stringify(preview)}`
          );
        }
        enqueueIncomingMessage(sock, msg, mode);
      }
    });

    return getWhatsAppBridgeStatus();
  } catch (err: any) {
    lastError = err?.message || 'Erro ao inicializar conexão WhatsApp Web.';
    console.warn('⚠️ [WhatsApp Web Bridge] Erro ao iniciar sessão:', lastError);
    if (sessionWasRegistered || hasPersistedBridgeSession()) {
      reconnectAttempts += 1;
      const delayMs = Math.min(3000 * Math.pow(1.6, Math.min(reconnectAttempts, 6)), 45_000);
      scheduleReconnect(Math.round(delayMs), 'start_exception_recover');
    } else {
      bridgeState = 'desconectado';
    }
    return getWhatsAppBridgeStatus();
  } finally {
    isStarting = false;
  }
}

export async function stopWhatsAppBridgeSession(logout = false): Promise<WhatsAppBridgeStatus> {
  manualStopRequested = true;
  if (!logout && lastDisconnectedAtMs === 0) {
    lastDisconnectedAtMs = Date.now();
    schedulePersistBridgeState();
  }
  stopWatchdog();
  if (logout && activeSocket) {
    try {
      await activeSocket.logout('Desconectado pelo painel AgueroFlow');
    } catch {
      // Proceed to cleanup even if socket already closed
    }
  }
  if (logout) {
    clearAuthDirectory();
    connectedNumber = '';
    connectedName = '';
    connectedJid = '';
    connectedAt = '';
    sessionWasRegistered = false;
    lastDisconnectWasFatalLogout = true;
    groupsCache.clear();
  }
  await destroyCurrentSocket();
  bridgeState = 'desconectado';
  currentQrDataUrl = null;
  currentPairingCode = null;
  lastError = null;
  lastDisconnectCode = null;
  lastDisconnectReason = null;
  reconnectAttempts = 0;
  return getWhatsAppBridgeStatus();
}

export async function sendMessageViaWhatsAppBridge(params: {
  toJidOrPhone: string;
  text: string;
  quotedMessage?: WAMessage;
}): Promise<{
  success: boolean;
  externalMessageId?: string;
  chatJid?: string;
  error?: string;
}> {
  if (!activeSocket || bridgeState !== 'conectado') {
    ensureWhatsAppBridgeResumed();
    return {
      success: false,
      error:
        bridgeState === 'reconectando'
          ? 'WhatsApp Web está reconectando automaticamente. Aguarde alguns segundos e tente novamente.'
          : 'WhatsApp Web (Dispositivos Conectados) não está conectado. Escaneie o QR Code primeiro.',
    };
  }

  const rawTarget = String(params.toJidOrPhone || '').trim();
  if (!rawTarget) {
    return { success: false, error: 'Informe um grupo (@g.us) ou número de destino.' };
  }

  let targetJid = rawTarget;
  if (!targetJid.includes('@')) {
    const normalized = normalizeWhatsAppPhone(targetJid);
    if (!normalized || normalized.length < 10) {
      return { success: false, error: 'Número de WhatsApp inválido (inclua DDI + DDD, ex: 5511999999999).' };
    }
    targetJid = `${normalized}@s.whatsapp.net`;
  }

  try {
    let sent: any;
    try {
      sent = await activeSocket.sendMessage(
        targetJid,
        { text: params.text },
        params.quotedMessage ? { quoted: params.quotedMessage } : undefined
      );
    } catch (quotedErr: any) {
      if (params.quotedMessage) {
        console.warn('⚠️ [WhatsApp Web Bridge] Falha ao responder citando mensagem, reenviando sem citação:', quotedErr?.message || quotedErr);
        sent = await activeSocket.sendMessage(targetJid, { text: params.text });
      } else {
        throw quotedErr;
      }
    }
    const externalMessageId = sent?.key?.id || `waweb_out_${Date.now()}`;
    rememberBounded(sentMessageIds, externalMessageId);
    lastActivityAt = new Date().toISOString();
    lastOnlineAt = lastActivityAt;
    schedulePersistBridgeState();

    return {
      success: true,
      externalMessageId,
      chatJid: targetJid,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Erro ao enviar mensagem pela ponte WhatsApp Web.';
    if (/closed|connection|stream|timeout|not open/i.test(errMsg) && sessionWasRegistered) {
      lastDisconnectedAtMs = Date.now();
      scheduleReconnect(1500, 'send_detected_closed_socket');
    }
    return {
      success: false,
      chatJid: targetJid,
      error: errMsg,
    };
  }
}

export async function sendDocumentViaWhatsAppBridge(params: {
  toJidOrPhone: string;
  buffer: Buffer;
  fileName: string;
  mimetype?: string;
  caption?: string;
  quotedMessage?: WAMessage;
}): Promise<{
  success: boolean;
  externalMessageId?: string;
  chatJid?: string;
  error?: string;
}> {
  if (!activeSocket || bridgeState !== 'conectado') {
    ensureWhatsAppBridgeResumed();
    return {
      success: false,
      error:
        bridgeState === 'reconectando'
          ? 'WhatsApp Web está reconectando automaticamente. Aguarde alguns segundos e tente novamente.'
          : 'WhatsApp Web (Dispositivos Conectados) não está conectado. Escaneie o QR Code primeiro.',
    };
  }

  const rawTarget = String(params.toJidOrPhone || '').trim();
  if (!rawTarget) {
    return { success: false, error: 'Informe um grupo (@g.us) ou número de destino.' };
  }

  let targetJid = rawTarget;
  if (!targetJid.includes('@')) {
    const normalized = normalizeWhatsAppPhone(targetJid);
    if (!normalized || normalized.length < 10) {
      return { success: false, error: 'Número de WhatsApp inválido.' };
    }
    targetJid = `${normalized}@s.whatsapp.net`;
  }

  const docContent = {
    document: params.buffer,
    mimetype: params.mimetype || 'application/pdf',
    fileName: params.fileName,
    caption: params.caption || undefined,
  };

  try {
    let sent: any;
    try {
      sent = await activeSocket.sendMessage(
        targetJid,
        docContent,
        params.quotedMessage ? { quoted: params.quotedMessage } : undefined
      );
    } catch (quotedErr: any) {
      if (params.quotedMessage) {
        console.warn(
          '⚠️ [WhatsApp Web Bridge] Falha ao enviar PDF citando mensagem, reenviando direto no chat:',
          quotedErr?.message || quotedErr
        );
        sent = await activeSocket.sendMessage(targetJid, docContent);
      } else {
        throw quotedErr;
      }
    }
    const externalMessageId = sent?.key?.id || `waweb_doc_${Date.now()}`;
    rememberBounded(sentMessageIds, externalMessageId);
    lastActivityAt = new Date().toISOString();
    lastOnlineAt = lastActivityAt;
    schedulePersistBridgeState();

    return {
      success: true,
      externalMessageId,
      chatJid: targetJid,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Erro ao enviar documento PDF pela ponte WhatsApp Web.';
    if (/closed|connection|stream|timeout|not open/i.test(errMsg) && sessionWasRegistered) {
      lastDisconnectedAtMs = Date.now();
      scheduleReconnect(1500, 'send_doc_detected_closed_socket');
    }
    return {
      success: false,
      chatJid: targetJid,
      error: errMsg,
    };
  }
}

