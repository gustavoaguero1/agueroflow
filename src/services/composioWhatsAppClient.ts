import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  ComposioAuthConfigSummary,
  ComposioConnectionSummary,
  ComposioWhatsAppStatusResponse,
  OutlookBridgeStatus,
  WhatsAppAiAssistantMessage,
  WhatsAppAutoResponderRule,
  WhatsAppBridgeStatus,
  WhatsAppBusinessMessage,
  WhatsAppContactType,
  WhatsAppGroupSummary,
  WhatsAppManagedContact,
  WhatsAppMentionConfig,
  WhatsAppMessageCategory,
  WhatsAppNdRecord,
  WhatsAppNdRule,
  WhatsAppOcrDashboardResponse,
  WhatsAppOcrReceiptItem,
  WhatsAppPendingRuleDraft,
  WhatsAppQuickReply,
  WhatsAppScheduledJob,
  WhatsAppScheduledJobType,
  WhatsAppScheduledRecurrence,
} from '../types/whatsappComposio';
import { apiFetch } from '../apiAuthFetch';

function stripUndefined<T extends Record<string, any>>(obj: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function mirrorDocToFirestore(collectionName: string, docId: string, data: Record<string, any>) {
  try {
    if (!docId) return;
    const cleanId = docId.replace(/[/#?]/g, '_');
    const payload = stripUndefined({
      ...data,
      updatedByUid: auth.currentUser?.uid || 'corporate_session',
    });
    await Promise.race([
      setDoc(doc(db, collectionName, cleanId), payload, { merge: true }),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (err) {
    console.warn(`[Firestore Sync] Falha ao espelhar ${collectionName}/${docId}:`, err);
  }
}

async function deleteDocFromFirestore(collectionName: string, docId: string) {
  try {
    if (!docId) return;
    const cleanId = docId.replace(/[/#?]/g, '_');
    await Promise.race([
      deleteDoc(doc(db, collectionName, cleanId)),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (err) {
    console.warn(`[Firestore Sync] Falha ao remover ${collectionName}/${docId}:`, err);
  }
}

async function fetchApiJson<T extends { success?: boolean; error?: string | null }>(
  input: RequestInfo | URL,
  init?: RequestInit,
  retryOnHtml = true
): Promise<T> {
  const attempt = async (): Promise<{ ok: boolean; status: number; contentType: string; text: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await apiFetch(input, {
        ...init,
        signal: init?.signal || controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init?.headers || {}),
        },
      });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const text = await res.text();
      return { ok: res.ok, status: res.status, contentType, text };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let result = await attempt();
    const trimmed = result.text.trimStart();
    const looksLikeHtml = trimmed.startsWith('<') || (!result.contentType.includes('json') && trimmed.length > 0 && !trimmed.startsWith('{') && !trimmed.startsWith('['));

    if (looksLikeHtml && retryOnHtml) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = await attempt();
    }

    const finalTrimmed = result.text.trimStart();
    if (!finalTrimmed) {
      return {
        success: false,
        error: `Resposta vazia do servidor (HTTP ${result.status}).`,
      } as T;
    }

    if (finalTrimmed.startsWith('<')) {
      return {
        success: false,
        error: `O servidor do AgueroFlow retornou HTML (HTTP ${result.status}) ao invés de JSON. Se o ambiente acabou de iniciar ou foi atualizado, recarregue a página e tente novamente.`,
      } as T;
    }

    const parsed = JSON.parse(finalTrimmed) as T;
    if (!result.ok && parsed && typeof parsed === 'object' && parsed.success === undefined) {
      return {
        ...parsed,
        success: false,
        error: parsed.error || `Erro HTTP ${result.status} na requisição.`,
      };
    }
    return parsed;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Falha de comunicação com o servidor do AgueroFlow.',
    } as T;
  }
}

export async function fetchComposioWhatsAppStatus(): Promise<ComposioWhatsAppStatusResponse> {
  return fetchApiJson<ComposioWhatsAppStatusResponse>('/api/composio/whatsapp/status');
}

export async function listComposioWhatsAppAccounts(userId?: string): Promise<{
  success: boolean;
  apiKeyConfigured: boolean;
  accounts: ComposioConnectionSummary[];
  authConfigs: ComposioAuthConfigSummary[];
  error?: string;
}> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return fetchApiJson(`/api/composio/whatsapp/accounts${params}`);
}

export async function connectComposioWhatsAppAccount(payload: {
  connectedAccountId: string;
  phoneNumberId?: string;
  wabaId?: string;
  entityId?: string;
  authConfigId?: string;
  connectedPhoneNumber?: string;
  messagingMode?: '1_to_1_private' | 'group' | 'hybrid_groups_and_private';
  autoReplyConfirmation?: boolean;
  composioRealtimeEnabled?: boolean;
}): Promise<{
  success: boolean;
  message?: string;
  warning?: string | null;
  validatedAccount?: ComposioConnectionSummary | null;
  error?: string;
}> {
  return fetchApiJson('/api/composio/whatsapp/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function createComposioWhatsAppAuthLink(payload: {
  userId?: string;
  authConfigId?: string;
  callbackUrl?: string;
}): Promise<{
  success: boolean;
  redirectUrl?: string;
  connectionRequestId?: string;
  authConfigIdUsed?: string;
  error?: string;
}> {
  return fetchApiJson('/api/composio/whatsapp/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchComposioWhatsAppMessages(params?: {
  organizationId?: string;
  phone?: string;
  category?: string;
}): Promise<{
  success: boolean;
  messages: WhatsAppBusinessMessage[];
  total: number;
  error?: string;
}> {
  const query = new URLSearchParams();
  if (params?.organizationId) query.set('organizationId', params.organizationId);
  if (params?.phone) query.set('phone', params.phone);
  if (params?.category) query.set('category', params.category);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return fetchApiJson(`/api/composio/whatsapp/messages${qs}`);
}

export async function sendWhatsAppMessageViaComposio(payload: {
  organizationId: string;
  toNumber: string;
  contactName?: string;
  contactType?: WhatsAppContactType;
  category?: WhatsAppMessageCategory;
  text?: string;
  templateName?: string;
  languageCode?: string;
  linkedProposalId?: string;
  linkedProposalCode?: string;
  sentByUserName?: string;
  connectedAccountId?: string;
  phoneNumberId?: string;
}): Promise<{
  success: boolean;
  requiresServerEnvKey?: boolean;
  messageRecord?: WhatsAppBusinessMessage;
  executionId?: string;
  externalMessageId?: string;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/composio/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function reconnectComposioRealtime(): Promise<{
  success: boolean;
  realtimeSubscribed: boolean;
  error?: string | null;
}> {
  return fetchApiJson('/api/composio/whatsapp/realtime/reconnect', { method: 'POST' });
}

// -----------------------------------------------------------------------------
// Embedded WhatsApp Web Linked Devices Bridge (Dispositivos Conectados)
// -----------------------------------------------------------------------------

export async function fetchWhatsAppBridgeStatus(): Promise<{
  success: boolean;
  bridge: WhatsAppBridgeStatus;
  targetGroupJid?: string;
  targetGroupName?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/bridge/status');
}

export async function connectWhatsAppBridge(payload?: {
  phoneNumberForPairing?: string;
  forceFreshQr?: boolean;
}): Promise<{
  success: boolean;
  bridge?: WhatsAppBridgeStatus;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/bridge/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
}

export async function disconnectWhatsAppBridge(logout = false): Promise<{
  success: boolean;
  bridge?: WhatsAppBridgeStatus;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/bridge/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logout }),
  });
}

export async function fetchWhatsAppBridgeGroups(): Promise<{
  success: boolean;
  groups: WhatsAppGroupSummary[];
  targetGroupJid?: string;
  targetGroupName?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/bridge/groups');
}

export async function selectWhatsAppBridgeGroup(payload: {
  groupJid: string;
  groupName: string;
  ocrAutoReply?: boolean;
}): Promise<{
  success: boolean;
  contact?: WhatsAppManagedContact;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    contact?: WhatsAppManagedContact;
    message?: string;
    error?: string;
  }>('/api/whatsapp/bridge/select-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.contact) {
    mirrorDocToFirestore('whatsapp_contacts', res.contact.id, res.contact);
  }
  return res;
}

export async function triggerWhatsAppBridgeCatchUp(options?: {
  mode?: 'since_disconnect' | 'hours' | 'today';
  lookbackHours?: number;
  sinceIso?: string;
}): Promise<{
  success: boolean;
  reconnecting?: boolean;
  bridge?: WhatsAppBridgeStatus;
  sweep?: {
    retriedPendingMedia: number;
    rescannedCachedImages: number;
    historyPullRequested: number;
    newReceiptsCount: number;
    monitoredChannelsCount: number;
    cutoffBr?: string;
    sinceIso?: string;
  };
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/bridge/catch-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
}

export async function sendWhatsAppMessageViaBridge(payload: {
  organizationId: string;
  toJidOrPhone: string;
  contactName?: string;
  groupName?: string;
  contactType?: WhatsAppContactType;
  category?: WhatsAppMessageCategory;
  text: string;
  linkedProposalId?: string;
  linkedProposalCode?: string;
  sentByUserName?: string;
}): Promise<{
  success: boolean;
  messageRecord?: WhatsAppBusinessMessage;
  externalMessageId?: string;
  chatJid?: string;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/bridge/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// -----------------------------------------------------------------------------
// Contacts & Strict OCR Opt-In Registry
// -----------------------------------------------------------------------------

export async function fetchWhatsAppContacts(): Promise<{
  success: boolean;
  contacts: WhatsAppManagedContact[];
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/contacts');
}

export async function saveWhatsAppContact(payload: {
  id?: string;
  jidOrPhone: string;
  name?: string;
  isGroup?: boolean;
  contactType?: WhatsAppContactType;
  ocrEnabled?: boolean;
  ocrAutoReply?: boolean;
  notes?: string;
  source?: 'whatsapp_sync' | 'manual' | 'orca_agil';
}): Promise<{
  success: boolean;
  contact?: WhatsAppManagedContact;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    contact?: WhatsAppManagedContact;
    message?: string;
    error?: string;
  }>('/api/whatsapp/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.contact) {
    mirrorDocToFirestore('whatsapp_contacts', res.contact.id, res.contact);
  }
  return res;
}

export async function toggleWhatsAppContactOcr(payload: {
  id?: string;
  jidOrPhone?: string;
  name?: string;
  isGroup?: boolean;
  ocrEnabled?: boolean;
  ocrAutoReply?: boolean;
}): Promise<{
  success: boolean;
  contact?: WhatsAppManagedContact;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    contact?: WhatsAppManagedContact;
    message?: string;
    error?: string;
  }>('/api/whatsapp/contacts/toggle-ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.contact) {
    mirrorDocToFirestore('whatsapp_contacts', res.contact.id, res.contact);
  }
  return res;
}

export async function deleteWhatsAppContact(id: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    message?: string;
    error?: string;
  }>(`/api/whatsapp/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.success) {
    deleteDocFromFirestore('whatsapp_contacts', id);
  }
  return res;
}

/**
 * Bidirectional Firestore protection for OCR-enabled WhatsApp groups/contacts.
 * Restores any OCR-enabled channel from Firestore if the server restarted,
 * and mirrors server-side OCR-enabled channels back to Firestore.
 */
export async function syncWhatsAppContactsWithFirestore(
  serverContacts: WhatsAppManagedContact[],
  organizationId?: string
): Promise<{ contacts: WhatsAppManagedContact[]; restoredCount: number }> {
  const path = 'whatsapp_contacts';
  const cloudOcrContacts: WhatsAppManagedContact[] = [];

  try {
    const snap = await getDocs(collection(db, path));
    snap.forEach((d) => {
      const data = d.data() as WhatsAppManagedContact;
      if (data && data.jidOrPhone && data.ocrEnabled) {
        cloudOcrContacts.push(data);
      }
    });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, path);
    } catch {
      // Keep running gracefully offline
    }
  }

  const serverByJid = new Map<string, WhatsAppManagedContact>();
  for (const c of serverContacts) {
    if (c.jidOrPhone) serverByJid.set(c.jidOrPhone, c);
    if (c.normalizedPhone) serverByJid.set(c.normalizedPhone, c);
  }

  const toRestore = cloudOcrContacts.filter((fc) => {
    const srv = serverByJid.get(fc.jidOrPhone) || (fc.normalizedPhone ? serverByJid.get(fc.normalizedPhone) : undefined);
    return !srv || !srv.ocrEnabled;
  });

  let finalContacts = serverContacts;
  let restoredCount = 0;

  if (toRestore.length > 0) {
    const res = await fetchApiJson<{
      success: boolean;
      restored?: number;
      contacts?: WhatsAppManagedContact[];
    }>('/api/whatsapp/contacts/sync-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: toRestore }),
    });
    if (res.success) {
      restoredCount = res.restored || 0;
      if (Array.isArray(res.contacts)) {
        finalContacts = res.contacts;
      }
    }
  }

  // Mirror all currently OCR-enabled contacts back to Firestore so cloud always stays authoritative
  const ocrActive = finalContacts.filter((c) => c.ocrEnabled && c.id);
  if (ocrActive.length > 0) {
    await Promise.allSettled(
      ocrActive.map((c) =>
        mirrorDocToFirestore(path, c.id, {
          ...c,
          organizationId: organizationId || 'org_aguero_default',
        })
      )
    );
  }

  return { contacts: finalContacts, restoredCount };
}

// -----------------------------------------------------------------------------
// Quick Replies CRUD
// -----------------------------------------------------------------------------

export async function fetchWhatsAppQuickReplies(): Promise<{
  success: boolean;
  quickReplies: WhatsAppQuickReply[];
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/quick-replies');
}

export async function saveWhatsAppQuickReply(payload: {
  id?: string;
  title: string;
  shortcut?: string;
  category?: WhatsAppMessageCategory;
  text: string;
}): Promise<{
  success: boolean;
  quickReply?: WhatsAppQuickReply;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    quickReply?: WhatsAppQuickReply;
    message?: string;
    error?: string;
  }>('/api/whatsapp/quick-replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.quickReply) {
    mirrorDocToFirestore('whatsapp_quick_replies', res.quickReply.id, res.quickReply);
  }
  return res;
}

export async function deleteWhatsAppQuickReply(id: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    message?: string;
    error?: string;
  }>(`/api/whatsapp/quick-replies/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.success) {
    deleteDocFromFirestore('whatsapp_quick_replies', id);
  }
  return res;
}

export async function incrementQuickReplyUsage(id: string): Promise<{
  success: boolean;
  quickReply?: WhatsAppQuickReply;
  error?: string;
}> {
  return fetchApiJson(`/api/whatsapp/quick-replies/${encodeURIComponent(id)}/use`, {
    method: 'POST',
  });
}

// -----------------------------------------------------------------------------
// AI Assistant Chat & Auto-Responder Rules
// -----------------------------------------------------------------------------

export async function fetchWhatsAppAssistantState(): Promise<{
  success: boolean;
  rules: WhatsAppAutoResponderRule[];
  scheduledJobs?: WhatsAppScheduledJob[];
  chatHistory: WhatsAppAiAssistantMessage[];
  mentionConfig?: WhatsAppMentionConfig;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/assistant/state');
}

export async function createWhatsAppScheduledJob(payload: {
  name: string;
  jobType: WhatsAppScheduledJobType;
  scheduleTime: string;
  recurrence?: WhatsAppScheduledRecurrence;
  oneShotDate?: string;
  targetJidOrPhone?: string;
  targetLabel?: string;
  sourceChatJid?: string;
  sourceChatLabel?: string;
  promptInstruction: string;
}): Promise<{
  success: boolean;
  job?: WhatsAppScheduledJob;
  scheduledJobs?: WhatsAppScheduledJob[];
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    job?: WhatsAppScheduledJob;
    scheduledJobs?: WhatsAppScheduledJob[];
    message?: string;
    error?: string;
  }>('/api/whatsapp/assistant/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.job) {
    mirrorDocToFirestore('whatsapp_scheduled_jobs', res.job.id, res.job);
  }
  return res;
}

export async function toggleWhatsAppScheduledJob(
  id: string,
  active?: boolean
): Promise<{
  success: boolean;
  job?: WhatsAppScheduledJob;
  scheduledJobs?: WhatsAppScheduledJob[];
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    job?: WhatsAppScheduledJob;
    scheduledJobs?: WhatsAppScheduledJob[];
    error?: string;
  }>(`/api/whatsapp/assistant/jobs/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  if (res.success && res.job) {
    mirrorDocToFirestore('whatsapp_scheduled_jobs', res.job.id, res.job);
  }
  return res;
}

export async function runWhatsAppScheduledJobNow(id: string): Promise<{
  success: boolean;
  summary?: string;
  scheduledJobs?: WhatsAppScheduledJob[];
  chatHistory?: WhatsAppAiAssistantMessage[];
  error?: string;
}> {
  return fetchApiJson(`/api/whatsapp/assistant/jobs/${encodeURIComponent(id)}/run-now`, {
    method: 'POST',
  });
}

export async function deleteWhatsAppScheduledJob(id: string): Promise<{
  success: boolean;
  scheduledJobs?: WhatsAppScheduledJob[];
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    scheduledJobs?: WhatsAppScheduledJob[];
    error?: string;
  }>(`/api/whatsapp/assistant/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.success) {
    await deleteDocFromFirestore('whatsapp_scheduled_jobs', id);
  }
  return res;
}

export async function updateWhatsAppScheduledJob(
  id: string,
  payload: Partial<{
    name: string;
    jobType: WhatsAppScheduledJobType;
    scheduleTime: string;
    recurrence: WhatsAppScheduledRecurrence;
    oneShotDate?: string;
    targetJidOrPhone: string;
    targetLabel?: string;
    sourceChatJid?: string;
    sourceChatLabel?: string;
    promptInstruction: string;
    active: boolean;
  }>
): Promise<{
  success: boolean;
  job?: WhatsAppScheduledJob;
  scheduledJobs?: WhatsAppScheduledJob[];
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    job?: WhatsAppScheduledJob;
    scheduledJobs?: WhatsAppScheduledJob[];
    message?: string;
    error?: string;
  }>(`/api/whatsapp/assistant/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.job) {
    await mirrorDocToFirestore('whatsapp_scheduled_jobs', res.job.id, res.job);
  }
  return res;
}

/**
 * Bidirectional sync between Firestore collection `whatsapp_scheduled_jobs`
 * and the Express server cron scheduler so scheduled commands survive restarts
 * and stay synchronized across AiAssistantModule and Central WhatsApp.
 */
export async function syncScheduledJobsWithFirestore(
  serverJobs: WhatsAppScheduledJob[],
  organizationId?: string
): Promise<{ jobs: WhatsAppScheduledJob[]; restoredCount: number; firestoreSynced: boolean }> {
  const path = 'whatsapp_scheduled_jobs';
  const mergedMap = new Map<string, WhatsAppScheduledJob>();

  const upsert = (item: WhatsAppScheduledJob) => {
    if (!item || !item.id || !item.name || !item.scheduleTime) return;
    const prev = mergedMap.get(item.id);
    if (!prev) {
      mergedMap.set(item.id, item);
      return;
    }
    const prevTs = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
    const nextTs = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    if (nextTs >= prevTs) {
      mergedMap.set(item.id, { ...prev, ...item });
    }
  };

  let firestoreSynced = false;
  try {
    const snap = await getDocs(collection(db, path));
    firestoreSynced = true;
    snap.forEach((d) => {
      const data = d.data() as WhatsAppScheduledJob;
      if (data && data.id) upsert(data);
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      // Surface diagnostic in console without crashing UI if offline
    }
  }

  const serverById = new Map(serverJobs.map((j) => [j.id, j]));
  const toRestoreOnServer: WhatsAppScheduledJob[] = [];
  mergedMap.forEach((fsJob, id) => {
    const srv = serverById.get(id);
    if (!srv) {
      toRestoreOnServer.push(fsJob);
    } else {
      const srvTs = srv.updatedAt ? new Date(srv.updatedAt).getTime() : 0;
      const fsTs = fsJob.updatedAt ? new Date(fsJob.updatedAt).getTime() : 0;
      if (fsTs > srvTs) toRestoreOnServer.push(fsJob);
    }
  });

  serverJobs.forEach(upsert);

  let restoredCount = 0;
  let finalJobs = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  if (toRestoreOnServer.length > 0) {
    const res = await fetchApiJson<{
      success: boolean;
      restored?: number;
      updated?: number;
      scheduledJobs?: WhatsAppScheduledJob[];
    }>('/api/whatsapp/assistant/jobs/sync-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: toRestoreOnServer }),
    });
    if (res.success) {
      restoredCount = (res.restored || 0) + (res.updated || 0);
      if (Array.isArray(res.scheduledJobs)) {
        finalJobs = res.scheduledJobs;
      }
    }
  }

  // Mirror any server-created jobs (e.g., created directly from @aguero in WhatsApp) back into Firestore
  if (finalJobs.length > 0) {
    await Promise.allSettled(
      finalJobs.map((job) =>
        mirrorDocToFirestore(path, job.id, {
          ...job,
          organizationId: organizationId || 'org_aguero_default',
        })
      )
    );
    firestoreSynced = true;
  }

  return { jobs: finalJobs, restoredCount, firestoreSynced };
}

export async function saveWhatsAppMentionConfig(
  payload: Partial<WhatsAppMentionConfig>
): Promise<{
  success: boolean;
  mentionConfig?: WhatsAppMentionConfig;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    mentionConfig?: WhatsAppMentionConfig;
    message?: string;
    error?: string;
  }>('/api/whatsapp/assistant/mention-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.mentionConfig) {
    mirrorDocToFirestore('whatsapp_ai_settings', 'mention_trigger', res.mentionConfig);
  }
  return res;
}

export async function invokeWhatsAppMentionAi(payload: {
  targetJidOrPhone: string;
  contactName?: string;
  isGroup?: boolean;
  promptText: string;
  dispatchToWhatsApp?: boolean;
}): Promise<{
  success: boolean;
  handled?: boolean;
  dispatched?: boolean;
  replyText?: string;
  formattedReply?: string;
  rules?: WhatsAppAutoResponderRule[];
  scheduledJobs?: WhatsAppScheduledJob[];
  chatHistory?: WhatsAppAiAssistantMessage[];
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/assistant/mention-invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function sendWhatsAppAssistantMessage(
  message: string,
  action?: 'confirm_draft' | 'cancel_draft'
): Promise<{
  success: boolean;
  reply?: WhatsAppAiAssistantMessage;
  pendingDraft?: WhatsAppPendingRuleDraft | null;
  rules?: WhatsAppAutoResponderRule[];
  scheduledJobs?: WhatsAppScheduledJob[];
  chatHistory?: WhatsAppAiAssistantMessage[];
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    reply?: WhatsAppAiAssistantMessage;
    pendingDraft?: WhatsAppPendingRuleDraft | null;
    rules?: WhatsAppAutoResponderRule[];
    scheduledJobs?: WhatsAppScheduledJob[];
    chatHistory?: WhatsAppAiAssistantMessage[];
    error?: string;
  }>('/api/whatsapp/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, action }),
  });
  if (res.success && res.rules) {
    res.rules.slice(0, 1).forEach((r) => mirrorDocToFirestore('whatsapp_ai_rules', r.id, r));
  }
  if (res.success && res.scheduledJobs) {
    res.scheduledJobs.slice(0, 1).forEach((j) => mirrorDocToFirestore('whatsapp_scheduled_jobs', j.id, j));
  }
  return res;
}

export async function toggleWhatsAppAssistantRule(
  id: string,
  active?: boolean,
  reason?: string
): Promise<{
  success: boolean;
  rule?: WhatsAppAutoResponderRule;
  rules?: WhatsAppAutoResponderRule[];
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    rule?: WhatsAppAutoResponderRule;
    rules?: WhatsAppAutoResponderRule[];
    error?: string;
  }>(`/api/whatsapp/assistant/rules/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active, reason }),
  });
  if (res.success && res.rule) {
    mirrorDocToFirestore('whatsapp_ai_rules', res.rule.id, res.rule);
  }
  return res;
}

export async function deleteWhatsAppAssistantRule(id: string): Promise<{
  success: boolean;
  rules?: WhatsAppAutoResponderRule[];
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    rules?: WhatsAppAutoResponderRule[];
    error?: string;
  }>(`/api/whatsapp/assistant/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.success) {
    deleteDocFromFirestore('whatsapp_ai_rules', id);
  }
  return res;
}

export async function clearWhatsAppAssistantChat(): Promise<{
  success: boolean;
  chatHistory?: WhatsAppAiAssistantMessage[];
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/assistant/chat', { method: 'DELETE' });
}

export async function resolveWhatsAppAssistantAlert(alertId: string): Promise<{
  success: boolean;
  chatHistory?: WhatsAppAiAssistantMessage[];
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/assistant/alert-resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertId }),
  });
}

// -----------------------------------------------------------------------------
// OCR Dashboard (Scoped strictly to OCR-enabled groups & contacts + Triple Vault)
// -----------------------------------------------------------------------------

const OCR_LOCAL_VAULT_KEY = 'agueroflow_ocr_receipts_vault_v1';

export async function fetchWhatsAppOcrDashboard(
  includeHistory = false
): Promise<WhatsAppOcrDashboardResponse> {
  const qs = includeHistory ? '?includeHistory=true' : '';
  return fetchApiJson<WhatsAppOcrDashboardResponse>(`/api/whatsapp/ocr-dashboard${qs}`);
}

export async function updateOcrReceiptStatus(
  id: string,
  status: 'aprovado' | 'rejeitado' | 'reembolsado' | 'pendente'
): Promise<{
  success: boolean;
  receipt?: WhatsAppOcrReceiptItem;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    receipt?: WhatsAppOcrReceiptItem;
    error?: string;
  }>('/api/reimbursements/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  if (res.success && res.receipt) {
    mirrorDocToFirestore('whatsapp_ocr_receipts', res.receipt.id, res.receipt);
  }
  return res;
}

export async function updateOcrReceipt(
  id: string,
  payload: Partial<WhatsAppOcrReceiptItem> & { editedBy?: string }
): Promise<{
  success: boolean;
  receipt?: WhatsAppOcrReceiptItem;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    receipt?: WhatsAppOcrReceiptItem;
    message?: string;
    error?: string;
  }>(`/api/whatsapp/ocr-dashboard/receipts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.receipt) {
    mirrorDocToFirestore('whatsapp_ocr_receipts', res.receipt.id, res.receipt);
  }
  return res;
}

export async function createManualOcrReceipt(payload: {
  receiptDate?: string;
  establishmentName: string;
  cnpj?: string;
  category?: string;
  totalAmount: number;
  taxAmount?: number;
  paymentMethod?: string;
  employeeName?: string;
  employeePhone?: string;
  workOrderNumber?: string;
  sourceChatJid?: string;
  sourceGroupName?: string;
  status?: string;
  notes?: string;
  editedBy?: string;
}): Promise<{
  success: boolean;
  receipt?: WhatsAppOcrReceiptItem;
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    receipt?: WhatsAppOcrReceiptItem;
    message?: string;
    error?: string;
  }>('/api/whatsapp/ocr-dashboard/receipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.receipt) {
    mirrorDocToFirestore('whatsapp_ocr_receipts', res.receipt.id, res.receipt);
  }
  return res;
}

export async function restoreOcrReceiptsToServer(
  receipts: WhatsAppOcrReceiptItem[]
): Promise<{
  success: boolean;
  restored?: number;
  updated?: number;
  total?: number;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/ocr-dashboard/sync-restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipts }),
  });
}

function readLocalOcrVault(): WhatsAppOcrReceiptItem[] {
  try {
    const raw = localStorage.getItem(OCR_LOCAL_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalOcrVault(receipts: WhatsAppOcrReceiptItem[]) {
  try {
    localStorage.setItem(OCR_LOCAL_VAULT_KEY, JSON.stringify(receipts));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Triple-redundant OCR receipt history vault:
 * 1) Server atomic disk + rolling backup (data_receipts.json + data_receipts_backup.json)
 * 2) Firestore cloud collection (whatsapp_ocr_receipts) when user is signed in
 * 3) Browser localStorage vault (agueroflow_ocr_receipts_vault_v1)
 */
export async function syncOcrReceiptsVault(
  serverReceipts: WhatsAppOcrReceiptItem[]
): Promise<{ restoredCount: number; cloudSynced: boolean; totalProtected: number }> {
  const mergedMap = new Map<string, WhatsAppOcrReceiptItem>();

  const upsertIntoMap = (item: WhatsAppOcrReceiptItem) => {
    if (!item || !item.id || item.source === 'demo' || item.source === 'simulacao_teste') return;
    const prev = mergedMap.get(item.id);
    if (!prev) {
      mergedMap.set(item.id, item);
      return;
    }
    const prevTs = prev.editedAt ? new Date(prev.editedAt).getTime() : 0;
    const nextTs = item.editedAt ? new Date(item.editedAt).getTime() : 0;
    if (nextTs >= prevTs) {
      mergedMap.set(item.id, { ...prev, ...item });
    }
  };

  // 1. Load local browser vault
  const localItems = readLocalOcrVault();
  localItems.forEach(upsertIntoMap);

  // 2. Load Firestore cloud vault
  let cloudAvailable = false;
  try {
    const snap = await getDocs(collection(db, 'whatsapp_ocr_receipts'));
    cloudAvailable = true;
    snap.forEach((d) => {
      const data = d.data() as WhatsAppOcrReceiptItem;
      if (data && data.id) upsertIntoMap(data);
    });
  } catch {
    // Best-effort cloud read
  }

  // 3. Identify anything in local/cloud missing or newer than server
  const serverById = new Map(serverReceipts.map((r) => [r.id, r]));
  const toRestore: WhatsAppOcrReceiptItem[] = [];
  mergedMap.forEach((vaultItem, id) => {
    const srv = serverById.get(id);
    if (!srv) {
      toRestore.push(vaultItem);
    } else {
      const srvTs = srv.editedAt ? new Date(srv.editedAt).getTime() : 0;
      const vaultTs = vaultItem.editedAt ? new Date(vaultItem.editedAt).getTime() : 0;
      if (vaultTs > srvTs) {
        toRestore.push(vaultItem);
      }
    }
  });

  // Merge server items into map too
  serverReceipts.forEach(upsertIntoMap);

  let restoredCount = 0;
  if (toRestore.length > 0) {
    const restoreRes = await restoreOcrReceiptsToServer(toRestore);
    if (restoreRes.success) {
      restoredCount = (restoreRes.restored || 0) + (restoreRes.updated || 0);
    }
  }

  // 4. Mirror unified history back to localStorage + Firestore cloud
  const allProtected = Array.from(mergedMap.values()).sort(
    (a, b) =>
      new Date(b.receivedAt || b.receiptDate || 0).getTime() -
      new Date(a.receivedAt || a.receiptDate || 0).getTime()
  );

  writeLocalOcrVault(allProtected);

  if (allProtected.length > 0) {
    await Promise.allSettled(
      allProtected.slice(0, 100).map((rec) => mirrorDocToFirestore('whatsapp_ocr_receipts', rec.id, rec))
    );
    cloudAvailable = true;
  }

  return {
    restoredCount,
    cloudSynced: cloudAvailable,
    totalProtected: allProtected.length,
  };
}

// -----------------------------------------------------------------------------
// Nota de Débito (ND) Automation + Outlook Routing Client & Firestore Sync
// -----------------------------------------------------------------------------

export async function fetchWhatsAppNdState(): Promise<{
  success: boolean;
  rules: WhatsAppNdRule[];
  records: WhatsAppNdRecord[];
  globalNextProjNumber?: number;
  outlookStatus: OutlookBridgeStatus;
  availableGroups: Array<{ jid: string; name: string; participantsCount: number; isGroup?: boolean }>;
  availableContacts?: Array<{ jid: string; name: string; phone: string; isGroup?: boolean }>;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/nd/state');
}

export async function createWhatsAppNdRule(
  payload: Partial<WhatsAppNdRule> & { groupJid: string; groupName: string }
): Promise<{
  success: boolean;
  rule?: WhatsAppNdRule;
  rules?: WhatsAppNdRule[];
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    rule?: WhatsAppNdRule;
    rules?: WhatsAppNdRule[];
    message?: string;
    error?: string;
  }>('/api/whatsapp/nd/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.rule) {
    void mirrorDocToFirestore('whatsapp_nd_rules', res.rule.id, res.rule);
  }
  return res;
}

export async function updateWhatsAppNdRule(
  id: string,
  payload: Partial<WhatsAppNdRule>
): Promise<{
  success: boolean;
  rule?: WhatsAppNdRule;
  rules?: WhatsAppNdRule[];
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    rule?: WhatsAppNdRule;
    rules?: WhatsAppNdRule[];
    message?: string;
    error?: string;
  }>(`/api/whatsapp/nd/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.rule) {
    void mirrorDocToFirestore('whatsapp_nd_rules', res.rule.id, res.rule);
  }
  return res;
}

export async function deleteWhatsAppNdRule(id: string): Promise<{
  success: boolean;
  rules?: WhatsAppNdRule[];
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    rules?: WhatsAppNdRule[];
    error?: string;
  }>(`/api/whatsapp/nd/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.success) {
    void deleteDocFromFirestore('whatsapp_nd_rules', id);
  }
  return res;
}

export async function parseAndGenerateNd(payload: {
  ruleId?: string;
  messageText: string;
  dispatchWhatsApp?: boolean;
  dispatchEmail?: boolean;
}): Promise<{
  success: boolean;
  ignored?: boolean;
  record?: WhatsAppNdRecord;
  rule?: WhatsAppNdRule;
  rules?: WhatsAppNdRule[];
  records?: WhatsAppNdRecord[];
  pdfUrl?: string;
  whatsappResult?: { success: boolean; error?: string };
  emailResult?: { success: boolean; error?: string; pendingConfig?: boolean };
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    ignored?: boolean;
    record?: WhatsAppNdRecord;
    rule?: WhatsAppNdRule;
    rules?: WhatsAppNdRule[];
    records?: WhatsAppNdRecord[];
    pdfUrl?: string;
    whatsappResult?: { success: boolean; error?: string };
    emailResult?: { success: boolean; error?: string; pendingConfig?: boolean };
    message?: string;
    error?: string;
  }>('/api/whatsapp/nd/parse-and-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.success && res.record) {
    void mirrorDocToFirestore('whatsapp_nd_records', res.record.id, res.record);
  }
  if (res.success && res.rule) {
    void mirrorDocToFirestore('whatsapp_nd_rules', res.rule.id, res.rule);
  }
  return res;
}

export async function resendNdEmail(
  id: string,
  overrides?: { to?: string[]; cc?: string[]; subject?: string; body?: string }
): Promise<{
  success: boolean;
  record?: WhatsAppNdRecord;
  records?: WhatsAppNdRecord[];
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    record?: WhatsAppNdRecord;
    records?: WhatsAppNdRecord[];
    message?: string;
    error?: string;
  }>(`/api/whatsapp/nd/records/${encodeURIComponent(id)}/resend-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides || {}),
  });
  if (res.record) {
    void mirrorDocToFirestore('whatsapp_nd_records', res.record.id, res.record);
  }
  return res;
}

export async function resendNdWhatsApp(
  id: string,
  groupJid?: string
): Promise<{
  success: boolean;
  record?: WhatsAppNdRecord;
  records?: WhatsAppNdRecord[];
  message?: string;
  error?: string;
}> {
  const res = await fetchApiJson<{
    success: boolean;
    record?: WhatsAppNdRecord;
    records?: WhatsAppNdRecord[];
    message?: string;
    error?: string;
  }>(`/api/whatsapp/nd/records/${encodeURIComponent(id)}/resend-whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupJid }),
  });
  if (res.record) {
    void mirrorDocToFirestore('whatsapp_nd_records', res.record.id, res.record);
  }
  return res;
}

export async function testOutlookBridgeConnection(payload: {
  to: string[];
  cc?: string[];
}): Promise<{
  success: boolean;
  provider?: string;
  pendingConfig?: boolean;
  outlookStatus?: OutlookBridgeStatus;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/nd/outlook/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getOutlookOAuthUrl(redirectUri?: string): Promise<{
  success: boolean;
  url?: string;
  redirectUri?: string;
  error?: string;
}> {
  const qs = redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : '';
  return fetchApiJson(`/api/outlook/oauth/url${qs}`);
}

export async function disconnectOutlookOAuth(): Promise<{
  success: boolean;
  outlookStatus?: OutlookBridgeStatus;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/outlook/oauth/disconnect', { method: 'POST' });
}

export async function scanPendingNdMessages(lookbackHours = 6): Promise<{
  success: boolean;
  generatedCount?: number;
  rules?: WhatsAppNdRule[];
  records?: WhatsAppNdRecord[];
  globalNextProjNumber?: number;
  message?: string;
  error?: string;
}> {
  return fetchApiJson('/api/whatsapp/nd/scan-pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lookbackHours }),
  });
}

export async function syncNdDataWithFirestore(
  serverRules: WhatsAppNdRule[],
  serverRecords: WhatsAppNdRecord[],
  organizationId?: string
): Promise<{
  rules: WhatsAppNdRule[];
  records: WhatsAppNdRecord[];
  firestoreSynced: boolean;
}> {
  let firestoreSynced = false;

  // 1. Sync Rules (always preserve highest sequential nextProjNumber so counter never goes backwards)
  const rulesMap = new Map<string, WhatsAppNdRule>();
  const upsertRule = (r: WhatsAppNdRule) => {
    if (!r || !r.id || !r.groupJid) return;
    const prev = rulesMap.get(r.id);
    if (!prev) {
      rulesMap.set(r.id, r);
      return;
    }
    const maxNextProj = Math.max(
      Number(prev.nextProjNumber || 0),
      Number(r.nextProjNumber || 0)
    );
    if (new Date(r.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime()) {
      rulesMap.set(r.id, { ...prev, ...r, nextProjNumber: maxNextProj || r.nextProjNumber });
    } else if (maxNextProj > Number(prev.nextProjNumber || 0)) {
      rulesMap.set(r.id, { ...prev, nextProjNumber: maxNextProj });
    }
  };
  try {
    const snap = await getDocs(collection(db, 'whatsapp_nd_rules'));
    firestoreSynced = true;
    snap.forEach((d) => upsertRule(d.data() as WhatsAppNdRule));
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, 'whatsapp_nd_rules');
    } catch {
      // keep running gracefully
    }
  }

  const srvRulesById = new Map(serverRules.map((r) => [r.id, r]));
  const rulesToRestore: WhatsAppNdRule[] = [];
  rulesMap.forEach((fsRule, id) => {
    const srv = srvRulesById.get(id);
    if (!srv || new Date(fsRule.updatedAt || 0).getTime() > new Date(srv.updatedAt || 0).getTime()) {
      rulesToRestore.push(fsRule);
    }
  });
  serverRules.forEach(upsertRule);

  if (rulesToRestore.length > 0) {
    await fetchApiJson('/api/whatsapp/nd/rules/sync-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: rulesToRestore }),
    });
  }

  // 2. Sync Records
  const recordsMap = new Map<string, WhatsAppNdRecord>();
  const upsertRec = (r: WhatsAppNdRecord) => {
    if (!r || !r.id || !r.receiverName) return;
    const prev = recordsMap.get(r.id);
    if (!prev || new Date(r.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime()) {
      recordsMap.set(r.id, { ...prev, ...r });
    }
  };
  try {
    const snap = await getDocs(collection(db, 'whatsapp_nd_records'));
    firestoreSynced = true;
    snap.forEach((d) => upsertRec(d.data() as WhatsAppNdRecord));
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, 'whatsapp_nd_records');
    } catch {
      // keep running gracefully
    }
  }

  const srvRecsById = new Map(serverRecords.map((r) => [r.id, r]));
  const recsToRestore: WhatsAppNdRecord[] = [];
  recordsMap.forEach((fsRec, id) => {
    const srv = srvRecsById.get(id);
    if (!srv || new Date(fsRec.updatedAt || 0).getTime() > new Date(srv.updatedAt || 0).getTime()) {
      recsToRestore.push(fsRec);
    }
  });
  serverRecords.forEach(upsertRec);

  if (recsToRestore.length > 0) {
    await fetchApiJson('/api/whatsapp/nd/records/sync-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: recsToRestore }),
    });
  }

  const finalRules = Array.from(rulesMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  const finalRecords = Array.from(recordsMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  // Mirror server-side new records/rules back to Firestore
  await Promise.allSettled([
    ...finalRules.map((r) =>
      mirrorDocToFirestore('whatsapp_nd_rules', r.id, {
        ...r,
        organizationId: r.organizationId || organizationId || 'org_aguero_default',
      })
    ),
    ...finalRecords.slice(0, 80).map((r) =>
      mirrorDocToFirestore('whatsapp_nd_records', r.id, {
        ...r,
        organizationId: r.organizationId || organizationId || 'org_aguero_default',
      })
    ),
  ]);

  return { rules: finalRules, records: finalRecords, firestoreSynced };
}
