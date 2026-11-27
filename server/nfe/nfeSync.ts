import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin, type AdminHandles } from '../firebaseAdmin.ts';
import { requireModuleAccess } from '../authMiddleware.ts';
import { parseNfeXml } from './parseNfe.ts';
import { upsertNfe, upsertNfeSummary } from './nfeStore.ts';
import { distDfeRequest, nfeConfigFromEnv, parseResNFe, sendCiencia, type DistDoc, type SefazCfg } from './sefaz.ts';

const MIN = 60_000;
const MAX_CALLS = 20;
const MAX_CIENCIA = 20;
const BACKOFF = 61 * MIN; // SEFAZ: wait ≥ 1h after 137/656 or when caught up (Review Focus 4)
const MORE = 5 * MIN;
const LEASE = 25 * MIN; // cross-instance lock > worst-case run (20 × 30 s DistDFe + 20 × 30 s ciência); a crashed run frees itself
const CIENCIA_OK = new Set(['135', '136', '573']); // 573 = duplicidade de evento: already registered
const CIENCIA_TRANSIENT = new Set(['108', '109', '999']); // serviço paralisado / erro não catalogado: retry
const MAX_TRIES = 3;

export type SyncResult =
  | { skipped?: undefined; fetched: number; summaries: number; full: number; ciencia: number; nextRunAt: string }
  | { skipped: true; nextRunAt?: string };

const warn = (msg: string) => { if (!process.env.NODE_TEST_CONTEXT) console.warn(`[nfe] ${msg}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
let running = false;

type Counts = { summaries: number; full: number };
async function storeDoc(h: AdminHandles, cfg: SefazCfg, d: DistDoc, c: Counts) {
  const isRes = d.schema.startsWith('resNFe'), isProc = d.schema.startsWith('procNFe');
  if (!isRes && !isProc) return; // resEvento / procEventoNFe: counted as fetched, not stored
  let parsed;
  // A malformed document is skipped (logged) so it can't wedge the NSU forever; storage errors still abort the page.
  try { parsed = isRes ? parseResNFe(d.xml) : parseNfeXml(d.xml); }
  catch (e) { warn(`NSU ${d.nsu} (${d.schema}) ignorado: ${errMsg(e)}`); return; }
  if (!isRes) {
    const full = parsed as ReturnType<typeof parseNfeXml>;
    if (digits(full.destinatario.cnpj) !== cfg.cnpj) { warn(`NSU ${d.nsu}: NF-e ${full.chave} não é destinada ao CNPJ ${cfg.cnpj}`); return; }
    await upsertNfe(h, cfg.orgId, full, 'sefaz', d.xml);
    c.full++;
    return;
  }
  const res = parsed as ReturnType<typeof parseResNFe>;
  const { id } = await upsertNfeSummary(h, cfg.orgId, res);
  c.summaries++;
  if (res.situacao !== 'autorizada') return; // cancelada/denegada: no ciência
  const ref = h.db.doc(`nfe_documents/${id}`);
  const cur = (await ref.get()).data();
  if (cur?.status === 'resumo' && !cur.cienciaEnviadaEm && !cur.cienciaPendente) await ref.update({ cienciaPendente: true });
}

async function sendPendingCiencias(h: AdminHandles, cfg: SefazCfg, now: Date): Promise<number> {
  const pend = await h.db.collection('nfe_documents').where('orgId', '==', cfg.orgId).where('cienciaPendente', '==', true)
    .orderBy('recebidaEm').limit(MAX_CIENCIA).get();
  let sent = 0;
  // Permanent rejections leave the queue at once; transient ones (and transport errors) are retried up to MAX_TRIES runs.
  const fail = (doc: (typeof pend.docs)[number], cStat: string, xMotivo: string, transient: boolean) => {
    const tries = Number(doc.data().cienciaTentativas ?? 0) + 1;
    return doc.ref.update({
      cienciaErro: { cStat, xMotivo, at: now.toISOString() }, cienciaTentativas: tries,
      ...(!(transient && tries < MAX_TRIES) && { cienciaPendente: FieldValue.delete() }),
    });
  };
  for (const doc of pend.docs) {
    let r;
    try { r = await sendCiencia(cfg, String(doc.data().chave)); }
    catch (e) {
      warn(`ciência ${doc.data().chave}: ${errMsg(e)}`);
      await fail(doc, 'transporte', errMsg(e), true);
      break; // SEFAZ unreachable: don't spend the rest of the run on timeouts
    }
    if (CIENCIA_OK.has(r.cStat)) {
      await doc.ref.update({ cienciaEnviadaEm: now.toISOString(), cienciaPendente: FieldValue.delete(), cienciaErro: FieldValue.delete() });
      sent++;
    } else await fail(doc, r.cStat, r.xMotivo, CIENCIA_TRANSIENT.has(r.cStat));
  }
  return sent;
}

/** One sync pass for cfg.orgId: DistDFe loop (≤ 20 calls) then pending Ciências (≤ 20). Honours nextRunAt. */
export async function runNfeSync(h: AdminHandles, cfg: SefazCfg): Promise<SyncResult> {
  if (running) return { skipped: true };
  running = true;
  try {
    const now = (cfg.now ?? (() => new Date()))();
    const t = now.getTime();
    const stateRef = h.db.doc(`nfe_sync/${cfg.orgId}`);
    const claim = await h.db.runTransaction(async (tx) => {
      const s = (await tx.get(stateRef)).data() ?? {};
      if (s.nextRunAt && Date.parse(s.nextRunAt) > t) return { skip: s.nextRunAt as string };
      if (s.lockedUntil && Date.parse(s.lockedUntil) > t) return { skip: s.lockedUntil as string };
      tx.set(stateRef, { orgId: cfg.orgId, lockedUntil: new Date(t + LEASE).toISOString() }, { merge: true });
      return { ultNSU: String(s.ultNSU ?? '0') };
    });
    if ('skip' in claim) return { skipped: true, ...(claim.skip && { nextRunAt: claim.skip }) };

    let ultNSU = claim.ultNSU;
    let next = t + BACKOFF;
    let status = '';
    let fetched = 0;
    const c: Counts = { summaries: 0, full: 0 };
    try {
      for (let i = 0; i < MAX_CALLS; i++) {
        const r = await distDfeRequest(cfg, ultNSU);
        status = `${r.cStat} ${r.xMotivo}`;
        if (r.cStat !== '138') break; // 137 nada a retornar, 656 consumo indevido, any error: keep ultNSU, back off
        for (const d of r.docs) await storeDoc(h, cfg, d, c);
        fetched += r.docs.length;
        ultNSU = r.ultNSU;
        await stateRef.set({ ultNSU }, { merge: true }); // progress survives a later failure in this run
        if (Number(r.ultNSU) >= Number(r.maxNSU)) break; // caught up: SEFAZ asks ≥ 1h before the next query
        if (i === MAX_CALLS - 1) next = t + MORE;
      }
    } catch (e) { status = `erro: ${errMsg(e)}`; }
    let ciencia = 0;
    try { ciencia = await sendPendingCiencias(h, cfg, now); }
    catch (e) { status = `${status}; ciência: ${errMsg(e)}`; }

    const nextRunAt = new Date(next).toISOString();
    try {
      await stateRef.set({ orgId: cfg.orgId, ultNSU, lastRunAt: now.toISOString(), nextRunAt, lastStatus: status, lockedUntil: FieldValue.delete() }, { merge: true });
    } catch {
      // Must not lose the backoff: retry once with the essentials (ultNSU was already saved per page).
      await stateRef.set({ nextRunAt, lastStatus: status }, { merge: true });
    }
    return { fetched, summaries: c.summaries, full: c.full, ciencia, nextRunAt };
  } finally { running = false; }
}

let envCfg: SefazCfg | null | undefined;
const cfgFromEnv = () => (envCfg === undefined ? (envCfg = nfeConfigFromEnv()) : envCfg);

/** Every 5 min; runNfeSync itself skips until nextRunAt. No-op (one info log) without NFE_* env. */
export function startNfeSyncScheduler(getH: () => AdminHandles | null = getAdmin, getCfg = cfgFromEnv): void {
  const cfg = getCfg();
  if (!cfg) { console.info('[nfe] Busca automática na SEFAZ desativada (defina NFE_CERT_PFX_BASE64, NFE_CERT_PASSWORD, NFE_CNPJ, NFE_UF e NFE_ORG_ID).'); return; }
  const tick = () => {
    const h = getH();
    if (h) runNfeSync(h, cfg).catch((e) => warn(`sincronização falhou: ${errMsg(e)}`));
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 5 * MIN).unref();
}

export function createNfeSyncRouter(getH: () => AdminHandles | null = getAdmin, getCfg: () => SefazCfg | null = cfgFromEnv): Router {
  const r = Router();
  r.post('/sync-now', requireModuleAccess('financeiro-notas', 2, getH), async (req, res) => {
    const h = getH(), cfg = getCfg();
    if (!h || !cfg) return res.status(503).json({ error: 'Busca na SEFAZ não configurada no servidor.' });
    if (req.orgId !== cfg.orgId) return res.status(403).json({ error: 'A busca na SEFAZ está configurada para outra empresa.' });
    try { res.json(await runNfeSync(h, cfg)); }
    catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
  r.get('/sync-status', requireModuleAccess('financeiro-notas', 1, getH), async (req, res) => {
    const h = getH(), cfg = getCfg();
    if (!h || !cfg || req.orgId !== cfg.orgId) return res.json({ configured: false });
    try {
      const { lockedUntil: _l, ...s } = (await h.db.doc(`nfe_sync/${cfg.orgId}`).get()).data() ?? {};
      res.json({ configured: true, ambiente: cfg.ambiente, ...s });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
  return r;
}

export const nfeSyncRouter: Router = createNfeSyncRouter();
