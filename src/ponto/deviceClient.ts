/**
 * Cliente offline-first do Coletor de Ponto (PWA Celular Pessoal + Totem de Obra).
 *
 * - Guarda identidade pareada, chave privada ECDSA P-256, vetores faciais, âncora de relógio,
 *   fila assinada de marcações offline e comprovantes no IndexedDB.
 * - Funciona 100% sem internet na obra e sincroniza em lote assim que reconectar.
 */
import type { PontoConfig, TipoMarcacao } from './config';
import { PONTO_DEFAULTS } from './config';
import type { ObraGeo } from './geo';
import { toBrt } from './tempo';
import { FACE_MODEL_VERSION, LGPD_TERM_VERSION } from './faceMath';
import type { Alerta } from '../services/pontoApi';

const DB_NAME = 'agueroflow_ponto_collector_v1';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_QUEUE = 'queue';

export interface TotemPessoaCache {
  rhId: string;
  nome: string;
  daObra: boolean;
  temPin: boolean;
  temRosto: boolean;
  descriptors: number[][];
}

export interface DeviceIdentity {
  deviceId: string;
  modo: 'pessoal' | 'totem';
  nomeAparelho: string;
  rhId?: string;
  unitId?: string;
  pessoa?: { rhId: string; nome: string; temPin?: boolean } | null;
  estabelecimento?: { razaoSocial: string; cnpj: string } | null;
  obra?: ObraGeo | null;
  obras: ObraGeo[];
  config: PontoConfig;
  biometria: {
    status: 'pendente' | 'cadastrada' | 'recusada';
    poses: number;
    descriptors: number[][];
    lgpdAceitoEm?: string | null;
    atualizadoEm?: string | null;
  };
  totemPessoas: TotemPessoaCache[];
  ultimasDoDia: { tipo: TipoMarcacao; dataHora: string; nsr?: number; hash?: string; alertas?: Alerta[] }[];
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  pairedAt: string;
  lastSyncedAt?: string;
}

export interface ClockAnchor {
  serverIso: string;
  serverEpochMs: number;
  capturedEpochMs: number;
  capturedPerfMs: number;
}

export interface PendingMarcacao {
  clientId: string;
  rhId: string;
  pessoaNome: string;
  tipo: TipoMarcacao;
  dataHora: string;
  payload: string;
  signature: string;
  createdAt: string;
  status: 'pending' | 'error';
  lastError?: string;
}

export interface ComprovanteLocal {
  id: string; // clientId ou nsr-based
  clientId?: string;
  provisorio: boolean;
  nsr?: number;
  empresa: { razaoSocial: string; cnpj: string };
  pessoa: { nome: string; cpf?: string };
  tipo: TipoMarcacao;
  dataHora: string;
  obra: { unitId: string; nome: string } | null;
  hash?: string;
  alertas: Alerta[];
  offline?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'clientId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erro ao abrir banco offline do ponto.'));
  });
}

async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readonly');
    const req = tx.objectStore(STORE_KV).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet<T>(key: string, val: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readwrite');
    tx.objectStore(STORE_KV).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function kvDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readwrite');
    tx.objectStore(STORE_KV).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingQueue(): Promise<PendingMarcacao[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => {
      const items = (req.result as PendingMarcacao[]) ?? [];
      resolve(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => reject(req.error);
  });
}

async function putQueueItem(item: PendingMarcacao): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteQueueItem(clientId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(clientId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDeviceIdentity(): Promise<DeviceIdentity | null> {
  return kvGet<DeviceIdentity>('identity');
}

export async function saveDeviceIdentity(identity: DeviceIdentity): Promise<void> {
  await kvSet('identity', identity);
}

export async function clearDeviceIdentity(): Promise<void> {
  await kvDelete('identity');
  await kvDelete('clockAnchor');
  await kvDelete('receipts');
}

export async function getClockAnchor(): Promise<ClockAnchor | null> {
  return kvGet<ClockAnchor>('clockAnchor');
}

export async function getLocalReceipts(): Promise<ComprovanteLocal[]> {
  return (await kvGet<ComprovanteLocal[]>('receipts')) ?? [];
}

async function upsertReceipt(receipt: ComprovanteLocal): Promise<ComprovanteLocal[]> {
  const existing = await getLocalReceipts();
  const filtered = existing.filter((r) => {
    if (receipt.clientId && r.clientId === receipt.clientId) return false;
    if (receipt.nsr && r.nsr === receipt.nsr) return false;
    return r.id !== receipt.id;
  });
  const next = [receipt, ...filtered]
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora))
    .slice(0, 80);
  await kvSet('receipts', next);
  return next;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Assina texto usando ECDSA P-256 / SHA-256 (formato IEEE P1363 base64, esperado pelo servidor). */
export async function signWithDeviceKey(privateKeyJwk: JsonWebKey, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(text),
  );
  return bytesToBase64(new Uint8Array(sigBuf));
}

/** Gera cliente ID único para garantir idempotência offline. */
export function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `mc_${crypto.randomUUID()}`;
  }
  return `mc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Sincroniza o relógio oficial do servidor e salva âncora monotônica contra manipulação offline. */
export async function syncServerClock(): Promise<ClockAnchor | null> {
  try {
    const t0 = performance.now();
    const res = await fetch('/api/ponto/device/time', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { agora?: string };
    const t1 = performance.now();
    if (!data.agora) return null;
    const serverEpochMs = Date.parse(data.agora);
    if (!Number.isFinite(serverEpochMs)) return null;
    const halfRtt = (t1 - t0) / 2;
    const anchor: ClockAnchor = {
      serverIso: data.agora,
      serverEpochMs: serverEpochMs + halfRtt,
      capturedEpochMs: Date.now(),
      capturedPerfMs: t1,
    };
    await kvSet('clockAnchor', anchor);
    return anchor;
  } catch {
    return null;
  }
}

/**
 * Calcula a data/hora atual confiável + metadados de relógio para envio na marcação.
 * Mesmo se o usuário mexer no relógio do celular offline, o delta monotônico denuncia divergência.
 */
export function computeCurrentTimestamp(anchor: ClockAnchor | null): {
  nowDate: Date;
  dataHoraBrt: string;
  relogio: { sincronizadoEm: string; decorridoMs: number } | null;
} {
  if (!anchor) {
    const nowDate = new Date();
    return { nowDate, dataHoraBrt: toBrt(nowDate), relogio: null };
  }
  // Se performance.now() resetou (página reaberta offline), usa diferença de epoch como fallback
  const perfNow = performance.now();
  const decorridoMs = perfNow >= anchor.capturedPerfMs
    ? Math.round(perfNow - anchor.capturedPerfMs)
    : Math.max(0, Date.now() - anchor.capturedEpochMs);
  const estimatedMs = anchor.serverEpochMs + decorridoMs;
  const nowDate = new Date(estimatedMs);
  return {
    nowDate,
    dataHoraBrt: toBrt(nowDate),
    relogio: {
      sincronizadoEm: anchor.serverIso,
      decorridoMs,
    },
  };
}

/** Limpa o código lido do QR (aceita URL /ponto?pair=XXXX, "agueroflow-ponto:XXXX" ou código puro). */
export function extractPairCode(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      const q = u.searchParams.get('pair') || u.searchParams.get('code');
      if (q) return q.trim().toUpperCase();
    }
  } catch {
    // ignore URL parse error
  }
  if (trimmed.toLowerCase().startsWith('agueroflow-ponto:')) {
    return trimmed.slice('agueroflow-ponto:'.length).trim().toUpperCase();
  }
  return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Pareia o celular ou totem usando o código único de 8 caracteres gerado no RH. */
export async function pairDevice(rawCode: string, nomeAparelho: string): Promise<DeviceIdentity> {
  const code = extractPairCode(rawCode);
  if (code.length < 6) {
    throw new Error('Informe o código de pareamento de 8 caracteres gerado pelo RH.');
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const cleanPublic = { kty: publicKeyJwk.kty, crv: publicKeyJwk.crv, x: publicKeyJwk.x, y: publicKeyJwk.y };

  const res = await fetch('/api/ponto/device/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      publicKeyJwk: cleanPublic,
      nome: nomeAparelho.trim() || guessDeviceName(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Código inválido ou vencido. Peça um novo QR ao RH.');
  }

  const identity: DeviceIdentity = {
    deviceId: data.deviceId,
    modo: data.modo,
    nomeAparelho: nomeAparelho.trim() || guessDeviceName(),
    rhId: data.rhId,
    unitId: data.unitId,
    pessoa: data.pessoa ? { rhId: data.rhId, nome: data.pessoa.nome } : null,
    estabelecimento: data.estabelecimento ?? null,
    obra: null,
    obras: [],
    config: { ...PONTO_DEFAULTS, ...(data.config ?? {}) },
    biometria: { status: 'pendente', poses: 0, descriptors: [] },
    totemPessoas: [],
    ultimasDoDia: [],
    privateKeyJwk,
    publicKeyJwk: cleanPublic,
    pairedAt: new Date().toISOString(),
  };

  await saveDeviceIdentity(identity);
  await syncServerClock();
  try {
    return await refreshDeviceState();
  } catch {
    return identity;
  }
}

function guessDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Celular Android';
  return 'Navegador / Coletor';
}

/** Atualiza dados do aparelho pareado (vetores faciais, obras, últimas marcações, comprovantes) quando online. */
export async function refreshDeviceState(): Promise<DeviceIdentity> {
  const current = await getDeviceIdentity();
  if (!current) throw new Error('Aparelho não pareado.');

  await syncServerClock();
  const minuto = Math.floor(Date.now() / 60000);
  const sig = await signWithDeviceKey(current.privateKeyJwk, `GET /device/me|${minuto}`);

  const res = await fetch('/api/ponto/device/me', {
    headers: {
      'x-ponto-device': current.deviceId,
      'x-ponto-sig': sig,
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível sincronizar o aparelho.');
  }

  const updated: DeviceIdentity = {
    ...current,
    modo: data.modo ?? current.modo,
    pessoa: data.pessoa !== undefined ? data.pessoa : current.pessoa,
    estabelecimento: data.estabelecimento !== undefined ? data.estabelecimento : current.estabelecimento,
    obra: data.obra !== undefined ? data.obra : current.obra,
    obras: Array.isArray(data.obras) ? data.obras : current.obras,
    config: { ...PONTO_DEFAULTS, ...(data.config ?? current.config) },
    biometria: data.biometria
      ? {
          status: data.biometria.status ?? 'pendente',
          poses: data.biometria.poses ?? 0,
          descriptors: Array.isArray(data.biometria.descriptors) ? data.biometria.descriptors : [],
          lgpdAceitoEm: data.biometria.lgpdAceitoEm ?? null,
          atualizadoEm: data.biometria.atualizadoEm ?? null,
        }
      : current.biometria,
    totemPessoas: Array.isArray(data.pessoas) ? data.pessoas : current.totemPessoas,
    ultimasDoDia: Array.isArray(data.ultimasDoDia) ? data.ultimasDoDia : current.ultimasDoDia,
    lastSyncedAt: new Date().toISOString(),
  };

  await saveDeviceIdentity(updated);

  // Carrega histórico recente de comprovantes no modo pessoal
  if (updated.modo === 'pessoal') {
    try {
      const sigComp = await signWithDeviceKey(updated.privateKeyJwk, `GET /device/comprovantes|${minuto}`);
      const resComp = await fetch('/api/ponto/device/comprovantes', {
        headers: { 'x-ponto-device': updated.deviceId, 'x-ponto-sig': sigComp },
        cache: 'no-store',
      });
      if (resComp.ok) {
        const compJson = (await resComp.json()) as { items?: any[] };
        for (const c of compJson.items ?? []) {
          await upsertReceipt({
            id: `nsr_${c.nsr}`,
            provisorio: false,
            nsr: c.nsr,
            empresa: c.empresa,
            pessoa: c.pessoa,
            tipo: c.tipo,
            dataHora: c.dataHora,
            obra: c.obra ?? null,
            hash: c.hash,
            alertas: c.alertas ?? [],
          });
        }
      }
    } catch {
      // ignora falha secundária
    }
  }

  return updated;
}

/** Envia cadastro facial + termo LGPD (ou recusa LGPD) diretamente pelo celular pessoal pareado. */
export async function enrollDeviceFace(params: {
  descriptors?: number[][];
  lgpdAceito?: boolean;
  recusar?: boolean;
}): Promise<DeviceIdentity> {
  const current = await getDeviceIdentity();
  if (!current) throw new Error('Aparelho não pareado.');

  const payload = JSON.stringify({
    ...(params.recusar ? { recusar: true } : { lgpdAceito: params.lgpdAceito === true, descriptors: params.descriptors, modelo: FACE_MODEL_VERSION }),
    lgpdVersao: LGPD_TERM_VERSION,
    ts: Date.now(),
  });
  const signature = await signWithDeviceKey(current.privateKeyJwk, payload);

  const res = await fetch('/api/ponto/device/rosto', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ponto-device': current.deviceId,
      'x-ponto-sig': signature,
    },
    body: JSON.stringify({ payload, signature }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível salvar a biometria.');
  }

  const next: DeviceIdentity = {
    ...current,
    biometria: params.recusar
      ? { status: 'recusada', poses: 0, descriptors: [], atualizadoEm: data.atualizadoEm }
      : {
          status: 'cadastrada',
          poses: params.descriptors?.length ?? 0,
          descriptors: params.descriptors ?? [],
          lgpdAceitoEm: data.atualizadoEm,
          atualizadoEm: data.atualizadoEm,
        },
  };
  await saveDeviceIdentity(next);
  return next;
}

export interface RegistrarPontoParams {
  rhId: string;
  pessoaNome: string;
  tipo: TipoMarcacao;
  gps: { lat: number; lng: number; precisaoM?: number } | null;
  obraPrevista?: { unitId: string; nome: string } | null;
  metodo: 'rosto' | 'pin' | 'nenhum';
  pin?: string;
  face?: { score: number; liveness?: number; modelo: string } | null;
  faceDescriptor?: number[] | null;
  fotoDataUrl?: string | null;
}

/**
 * Registra uma marcação de ponto:
 * 1. Assina com ECDSA P-256 local + relógio monotônico;
 * 2. Salva imediatamente na fila offline do IndexedDB (nunca perde batida);
 * 3. Tenta enviar online na hora; se sem sinal, devolve comprovante provisório "pendente de envio".
 */
export async function registrarPontoLocalESincronizar(
  params: RegistrarPontoParams,
): Promise<{ receipt: ComprovanteLocal; syncedNow: boolean; error?: string }> {
  const identity = await getDeviceIdentity();
  if (!identity) throw new Error('Aparelho não pareado.');

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const anchor = isOnline ? (await syncServerClock()) ?? (await getClockAnchor()) : await getClockAnchor();
  const { dataHoraBrt, relogio } = computeCurrentTimestamp(anchor);
  const clientId = generateClientId();

  const bodyObj = {
    clientId,
    rhId: params.rhId,
    tipo: params.tipo,
    dataHora: dataHoraBrt,
    offline: !isOnline,
    gps: params.gps,
    face: params.face ?? null,
    ...(params.faceDescriptor ? { faceDescriptor: params.faceDescriptor } : {}),
    ...(params.fotoDataUrl ? { fotoDataUrl: params.fotoDataUrl } : {}),
    relogio,
    metodo: params.metodo,
    ...(params.metodo === 'pin' && params.pin ? { pin: params.pin } : {}),
  };

  const payload = JSON.stringify(bodyObj);
  const signature = await signWithDeviceKey(identity.privateKeyJwk, payload);

  const pendingItem: PendingMarcacao = {
    clientId,
    rhId: params.rhId,
    pessoaNome: params.pessoaNome,
    tipo: params.tipo,
    dataHora: dataHoraBrt,
    payload,
    signature,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  await putQueueItem(pendingItem);

  const provisional: ComprovanteLocal = {
    id: clientId,
    clientId,
    provisorio: true,
    empresa: identity.estabelecimento ?? { razaoSocial: 'Grupo Aguero', cnpj: '' },
    pessoa: { nome: params.pessoaNome },
    tipo: params.tipo,
    dataHora: dataHoraBrt,
    obra: params.obraPrevista ?? null,
    alertas: isOnline ? [] : ['offline'],
    offline: !isOnline,
  };
  await upsertReceipt(provisional);

  // Atualiza ultimasDoDia localmente no modo pessoal para já sugerir a próxima marcação offline!
  if (identity.modo === 'pessoal') {
    const nextUltimas = [...identity.ultimasDoDia, { tipo: params.tipo, dataHora: dataHoraBrt }];
    await saveDeviceIdentity({ ...identity, ultimasDoDia: nextUltimas });
  }

  if (!isOnline) {
    return { receipt: provisional, syncedNow: false };
  }

  const syncRes = await syncPendingQueue();
  const confirmed = syncRes.confirmedByClientId.get(clientId);
  if (confirmed) {
    return { receipt: confirmed, syncedNow: true };
  }
  const rejectedErr = syncRes.rejectedByClientId.get(clientId);
  if (rejectedErr) {
    // Se o servidor recusou definitivamente (ex.: PIN incorreto), remove comprovante provisório e lança erro claro
    const recs = (await getLocalReceipts()).filter((r) => r.clientId !== clientId);
    await kvSet('receipts', recs);
    throw new Error(rejectedErr);
  }
  return { receipt: provisional, syncedNow: false, error: syncRes.networkError };
}

/** Envia todas as marcações pendentes na fila offline para /api/ponto/device/marcacoes. */
export async function syncPendingQueue(): Promise<{
  syncedCount: number;
  remainingCount: number;
  confirmedByClientId: Map<string, ComprovanteLocal>;
  rejectedByClientId: Map<string, string>;
  networkError?: string;
}> {
  const confirmedByClientId = new Map<string, ComprovanteLocal>();
  const rejectedByClientId = new Map<string, string>();

  const identity = await getDeviceIdentity();
  const queue = await listPendingQueue();
  if (!identity || queue.length === 0) {
    return { syncedCount: 0, remainingCount: queue.length, confirmedByClientId, rejectedByClientId };
  }

  try {
    const res = await fetch('/api/ponto/device/marcacoes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ponto-device': identity.deviceId,
      },
      body: JSON.stringify({
        items: queue.map((q) => ({ payload: q.payload, signature: q.signature })),
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        syncedCount: 0,
        remainingCount: queue.length,
        confirmedByClientId,
        rejectedByClientId,
        networkError: errJson.error || 'Sem conexão estável com o servidor. Mantido na fila offline.',
      };
    }

    const data = (await res.json()) as {
      results?: { clientId?: string; ok: boolean; retry?: boolean; error?: string; comprovante?: any }[];
    };

    let syncedCount = 0;
    for (const r of data.results ?? []) {
      const cid = r.clientId;
      if (!cid) continue;
      if (r.ok && r.comprovante) {
        syncedCount += 1;
        await deleteQueueItem(cid);
        const official: ComprovanteLocal = {
          id: `nsr_${r.comprovante.nsr}`,
          clientId: cid,
          provisorio: false,
          nsr: r.comprovante.nsr,
          empresa: r.comprovante.empresa,
          pessoa: r.comprovante.pessoa,
          tipo: r.comprovante.tipo,
          dataHora: r.comprovante.dataHora,
          obra: r.comprovante.obra ?? null,
          hash: r.comprovante.hash,
          alertas: r.comprovante.alertas ?? [],
        };
        await upsertReceipt(official);
        confirmedByClientId.set(cid, official);
      } else if (r.retry === false) {
        await deleteQueueItem(cid);
        rejectedByClientId.set(cid, r.error || 'Marcação recusada pelo servidor.');
      } else {
        const item = queue.find((q) => q.clientId === cid);
        if (item) {
          await putQueueItem({ ...item, status: 'error', lastError: r.error || 'Falha temporária' });
        }
      }
    }

    const remaining = await listPendingQueue();
    return {
      syncedCount,
      remainingCount: remaining.length,
      confirmedByClientId,
      rejectedByClientId,
    };
  } catch {
    return {
      syncedCount: 0,
      remainingCount: queue.length,
      confirmedByClientId,
      rejectedByClientId,
      networkError: 'Sem internet no momento. A marcação ficou salva no aparelho.',
    };
  }
}
