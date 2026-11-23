// Reembolsos v1: who spent, on which obra, weekly summary per employee (docs/superpowers/specs/2026-11-23-reembolsos-v1-design.md).
import { Router, type Request } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import { requireRole, orgIdOf } from './authMiddleware.ts';
import { effectiveOrg } from './orgDefaults.ts';

type Rec = Record<string, any>;
type Worker = { id: string; name?: string; whatsapp?: string; currentSite?: string };
type TimeLog = { workerId: string; date: string; siteName?: string; contractId?: string };

const DAY = 864e5;
export const MAX_IMAGE_BASE64 = 900 * 1024;

/** YYYY-MM-DD in America/Sao_Paulo. */
export const spDate = (d: Date | string): string => new Date(d).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = domingo

/** Monday..Sunday week holding `inicio` (snapped to its Monday); default: the previous full week in São Paulo. */
export function weekRange(inicio: string | undefined, now: Date = new Date()): { inicio: string; fim: string } {
  const base = inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio) && !Number.isNaN(Date.parse(inicio)) ? inicio : null;
  const ref = base ?? addDays(spDate(now), -7);
  const monday = addDays(ref, -((dow(ref) + 6) % 7));
  return { inicio: monday, fim: addDays(monday, 6) };
}

/** Digits keyed for matching: no 55 country code, old 8-digit mobiles get the 9th digit. */
export function phoneKey(phone: string): string {
  let d = String(phone || '').split('@')[0].replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  return d;
}
/** Same phone by the last 11 digits (10 when either side is shorter). */
export function phonesMatch(a: string, b: string): boolean {
  const x = phoneKey(a), y = phoneKey(b);
  const n = x.length >= 11 && y.length >= 11 ? 11 : 10;
  return x.length >= 10 && y.length >= 10 && x.slice(-n) === y.slice(-n);
}
export const normName = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function resolveWorker(rec: Rec, workers: Worker[]): Worker | undefined {
  const byPhone = rec.employeePhone ? workers.find((w) => w.whatsapp && phonesMatch(w.whatsapp, rec.employeePhone)) : undefined;
  const name = normName(rec.employeeName);
  return byPhone ?? (name ? workers.find((w) => normName(w.name || '') === name) : undefined);
}

/** OCR dates come as YYYY-MM-DD or dd/mm/yyyy. */
export function isoDate(s: string): string {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : String(s || '').slice(0, 10);
}

/** Worker + obra fields for a receipt: timesheet on the receipt date, then the worker's current site, else a definir. */
export function enrichmentFor(rec: Rec, workers: Worker[], logsOf: (workerId: string, date: string) => TimeLog[]): Rec {
  const w = resolveWorker(rec, workers);
  if (!w) return { workerStatus: 'a_identificar', obraSource: 'a_definir', obraStatus: 'a_definir' };
  const who = { workerId: w.id, workerStatus: 'identificado', employeeName: w.name || rec.employeeName };
  const log = logsOf(w.id, isoDate(rec.receiptDate)).find((l) => l.siteName || l.contractId);
  if (log) return { ...who, obraName: log.siteName || '', contractId: log.contractId || '', obraSource: 'apontamento', obraStatus: 'ok' };
  if (w.currentSite) return { ...who, obraName: w.currentSite, obraSource: 'cadastro', obraStatus: 'ok' };
  return { ...who, obraSource: 'a_definir', obraStatus: 'a_definir' };
}

/** Reads field_workers / worker_time_logs of the receipt's org. Without Admin SDK returns {} (OCR goes on). */
export async function enrichReceipt(db: Firestore | null | undefined, rec: Rec): Promise<Rec> {
  if (!db) return {};
  const org = effectiveOrg(rec.organizationId);
  const ws = await db.collection('field_workers').where('orgId', '==', org).get();
  const workers = ws.docs.map((d) => ({ ...(d.data() as Worker), id: d.id }));
  const w = resolveWorker(rec, workers);
  const date = isoDate(rec.receiptDate);
  const logs = w
    ? (await db.collection('worker_time_logs').where('orgId', '==', org).where('workerId', '==', w.id).where('date', '==', date).get())
        .docs.map((d) => d.data() as TimeLog)
    : [];
  return enrichmentFor(rec, workers, () => logs);
}

/** Saves the receipt image server-side; Firestore docs cap at 1 MiB, so big images are skipped. */
export async function saveReceiptImage(db: Firestore | null | undefined, id: string, orgId: string, base64: string, mimeType = 'image/jpeg'): Promise<'salva' | 'grande_demais' | undefined> {
  if (!db || !base64) return undefined;
  if (base64.length > MAX_IMAGE_BASE64) return 'grande_demais';
  await db.collection('receipt_images').doc(id).set({
    orgId: effectiveOrg(orgId), mimeType, base64, bytes: Buffer.byteLength(base64, 'base64'), createdAt: new Date().toISOString(),
  });
  return 'salva';
}

const COUNTED = new Set(['pendente', 'aprovado', 'reembolsado']);
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const reais = (c: number) => c / 100;
export const inWeek = (rec: Rec, w: { inicio: string; fim: string }) => {
  if (!rec.receivedAt || Number.isNaN(Date.parse(rec.receivedAt))) return false;
  const d = spDate(rec.receivedAt);
  return d >= w.inicio && d <= w.fim;
};

export function weeklySummary(receipts: Rec[], w: { inicio: string; fim: string }) {
  const groups = new Map<string, Rec[]>();
  for (const r of receipts) {
    if (!COUNTED.has(r.status) || !inWeek(r, w)) continue;
    const key = r.workerId ? `w:${r.workerId}` : `n:${normName(r.employeeName) || r.employeePhone || '?'}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const sum = (rs: Rec[]) => rs.reduce((s, r) => s + cents(r.totalAmount), 0);
  const by = (rs: Rec[], f: (r: Rec) => string) => {
    const m: Record<string, number> = {};
    for (const r of rs) m[f(r)] = (m[f(r)] || 0) + cents(r.totalAmount);
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, reais(v)]));
  };
  const funcionarios = [...groups.values()].map((rs) => {
    const aprov = rs.filter((r) => r.status !== 'pendente'), pend = rs.filter((r) => r.status === 'pendente');
    return {
      nome: rs[0].employeeName || rs[0].employeePhone || 'Sem nome',
      workerId: rs[0].workerId || undefined,
      totalAprovado: reais(sum(aprov)),
      totalPendente: reais(sum(pend)),
      pendentes: pend.length,
      porCategoria: by(rs, (r) => r.category || 'outros'),
      porObra: by(rs, (r) => r.obraName || 'A definir'),
      notas: rs.map((r) => ({
        id: r.id, receiptDate: r.receiptDate, receivedAt: r.receivedAt, establishmentName: r.establishmentName,
        category: r.category, totalAmount: Number(r.totalAmount) || 0, status: r.status,
        obraName: r.obraName || '', contractId: r.contractId || '', obraStatus: r.obraStatus, obraSource: r.obraSource,
        workerStatus: r.workerStatus, imageStatus: r.imageStatus,
      })),
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const all = [...groups.values()].flat();
  return {
    ...w,
    funcionarios,
    totais: {
      totalAprovado: reais(sum(all.filter((r) => r.status !== 'pendente'))),
      totalPendente: reais(sum(all.filter((r) => r.status === 'pendente'))),
      pendentes: all.filter((r) => r.status === 'pendente').length,
      notas: all.length,
    },
    avisos: {
      obraADefinir: all.filter((r) => r.obraStatus === 'a_definir').length,
      funcionarioAIdentificar: all.filter((r) => r.workerStatus === 'a_identificar').length,
    },
  };
}
export type WeeklySummary = ReturnType<typeof weeklySummary>;

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export function weeklyMessage(s: WeeklySummary): string {
  const lines = [`*Reembolsos da semana ${br(s.inicio)} a ${br(s.fim)}*`];
  if (!s.totais.notas) return [...lines, 'Nenhuma nota recebida na semana.'].join('\n');
  lines.push(`Total aprovado: ${brl(s.totais.totalAprovado)} | Pendentes: ${s.totais.pendentes} (${brl(s.totais.totalPendente)})`, '');
  for (const f of s.funcionarios) {
    lines.push(`• ${f.nome}: ${brl(f.totalAprovado)} aprovado, ${f.pendentes} pendente(s) — Obras: ${Object.keys(f.porObra).join(', ')}`);
  }
  const avisos = [
    s.avisos.obraADefinir && `⚠️ ${s.avisos.obraADefinir} nota(s) com obra a definir`,
    s.avisos.funcionarioAIdentificar && `⚠️ ${s.avisos.funcionarioAIdentificar} nota(s) com funcionário a identificar`,
  ].filter(Boolean) as string[];
  if (avisos.length) lines.push('', ...avisos);
  return lines.join('\n');
}

/** Week (inicio) the Monday message should cover now, or null when it is not time / already sent. */
export function weeklyDue(now: Date, lastSentInicio: string | undefined): string | null {
  const hour = Number(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }));
  if (dow(spDate(now)) !== 1 || hour < 8) return null;
  const { inicio } = weekRange(undefined, now);
  return lastSentInicio === inicio ? null : inicio;
}

export function weekWorkbookBuffer(s: WeeklySummary): Buffer {
  const wb = XLSX.utils.book_new();
  const resumo = XLSX.utils.json_to_sheet(s.funcionarios.map((f) => ({
    Funcionário: f.nome, 'Total aprovado (R$)': f.totalAprovado, 'Total pendente (R$)': f.totalPendente,
    Pendentes: f.pendentes, Obras: Object.keys(f.porObra).join(', '),
  })));
  const notas = XLSX.utils.json_to_sheet(s.funcionarios.flatMap((f) => f.notas.map((n) => ({
    Funcionário: f.nome, 'Data da nota': n.receiptDate, 'Recebida em': n.receivedAt ? spDate(n.receivedAt) : '',
    Estabelecimento: n.establishmentName, Categoria: n.category, Obra: n.obraName || 'A definir', 'Valor (R$)': n.totalAmount, Status: n.status,
  }))));
  XLSX.utils.book_append_sheet(wb, resumo, 'Resumo');
  XLSX.utils.book_append_sheet(wb, notas, 'Notas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** The org the request is about (orgId param, or the caller's only org); without one, every org the caller belongs to. */
export function visibleTo(req: Request) {
  const u = req.user!;
  const org = req.orgId ?? orgIdOf(req) ?? undefined;
  return (rec: Rec) => {
    const o = effectiveOrg(rec?.organizationId);
    return org ? o === effectiveOrg(org) && (u.master || Object.hasOwn(u.orgs, org)) : u.master || Object.hasOwn(u.orgs, o);
  };
}

export function createReembolsosRouter(deps: {
  receipts: () => Rec[];
  persist: () => void;
  db: () => Firestore | null | undefined;
  now?: () => Date;
}): Router {
  const r = Router();
  const now = () => deps.now?.() ?? new Date();
  const summaryFor = (req: Request) => {
    const w = weekRange(String(req.query.inicio || req.body?.inicio || '') || undefined, now());
    return { w, s: weeklySummary(deps.receipts().filter(visibleTo(req)), w) };
  };
  const transition = (from: string, to: string, stamp: (rec: Rec, by: string, at: string) => void) => (req: Request, res: any) => {
    const w = weekRange(String(req.body?.inicio || '') || undefined, now());
    const visible = visibleTo(req), by = req.user!.email || req.user!.uid, at = now().toISOString();
    let alterados = 0;
    for (const rec of deps.receipts()) {
      if (rec.status === from && visible(rec) && inWeek(rec, w)) { rec.status = to; stamp(rec, by, at); alterados++; }
    }
    if (alterados) deps.persist();
    res.json({ ok: true, ...w, alterados });
  };

  r.get('/semana', (req, res) => res.json(summaryFor(req).s));
  r.get('/semana.xlsx', (req, res) => {
    const { w, s } = summaryFor(req);
    res.setHeader('Content-Disposition', `attachment; filename="reembolsos_${w.inicio}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(weekWorkbookBuffer(s));
  });
  r.post('/semana/aprovar', requireRole('Admin', 'Gerente'), transition('pendente', 'aprovado', (rec, by, at) => { rec.approvedBy = by; rec.approvedAt = at; }));
  r.post('/semana/reembolsado', requireRole('Admin', 'Gerente'), transition('aprovado', 'reembolsado', (rec, by, at) => { rec.reimbursedBy = by; rec.reimbursedAt = at; }));
  r.put('/:id/obra', requireRole('Admin', 'Gerente'), (req, res) => {
    const rec = deps.receipts().find((x) => x.id === req.params.id);
    if (!rec || !visibleTo(req)(rec)) return res.status(404).json({ error: 'nota não encontrada' });
    const obraName = String(req.body?.obraName || '').trim();
    if (!obraName) return res.status(400).json({ error: 'informe a obra' });
    Object.assign(rec, { obraName, contractId: String(req.body?.contractId || ''), obraSource: 'manual', obraStatus: 'ok' });
    deps.persist();
    res.json({ ok: true, receipt: rec });
  });
  r.get('/:id/imagem', async (req, res) => {
    const rec = deps.receipts().find((x) => x.id === req.params.id);
    const db = deps.db();
    if (!rec || !visibleTo(req)(rec) || !db) return res.status(404).json({ error: 'imagem não encontrada' });
    const snap = await db.collection('receipt_images').doc(rec.id).get().catch(() => null);
    const img = snap?.data();
    if (!img?.base64 || img.orgId !== effectiveOrg(rec.organizationId)) return res.status(404).json({ error: 'imagem não encontrada' });
    res.type(img.mimeType || 'image/jpeg').send(Buffer.from(img.base64, 'base64'));
  });
  return r;
}

/** One Monday check: sends the previous week's summary of `org` to the owner; the marker is written only after a successful send. */
export async function weeklyCheck(deps: {
  now: Date;
  org: string;
  receipts: Rec[];
  ownerPhone: string | undefined;
  connected: boolean;
  lastSent: () => string | undefined;
  markSent: (inicio: string) => void;
  send: (to: string, text: string) => Promise<{ success: boolean }>;
  skipped: (why: string) => void;
}): Promise<boolean> {
  const inicio = weeklyDue(deps.now, deps.lastSent());
  if (!inicio) return false;
  if (!deps.ownerPhone) { deps.skipped('OWNER_PHONE não configurado'); return false; }
  if (!deps.connected) { deps.skipped('WhatsApp desconectado'); return false; }
  const w = weekRange(inicio);
  const text = weeklyMessage(weeklySummary(deps.receipts.filter((r) => effectiveOrg(r.organizationId) === deps.org), w));
  if (!(await deps.send(deps.ownerPhone, text)).success) return false;
  deps.markSent(inicio);
  return true;
}
