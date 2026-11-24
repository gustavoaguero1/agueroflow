/**
 * Recibos lidos pelo WhatsApp → notinhas do Reembolso de Operações (ops_orgs/{orgId}/reemb_notas).
 * Uma nota por recibo (id `wa_<receiptId>`), na semana certa (fecha quinta 17:00, horário de Brasília),
 * já ligada ao colaborador quando o telefone bate com o cadastro de Operações.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { ReimbursementReceipt } from '../src/types/travel';

const NATUREZA: Record<string, string> = {
  combustivel: 'Combustível',
  alimentacao: 'Alimentação',
  pedagio: 'Pedágio',
  hospedagem: 'Hospedagem',
  estacionamento: 'Estacionamento',
  materiais_obra: 'Material / ferramenta',
  manutencao_van: 'Outros',
  outros: 'Outros',
};

/** Data e hora em Brasília de um instante ISO. */
function spParts(iso: string): { date: string; hour: number; weekday: number } {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday };
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Mesmo lote do Inox: a quinta-feira da semana; a partir de quinta 17:00 vai para a quinta seguinte. */
export function loteDaSemana(isoInstant: string): string {
  const { date, hour, weekday } = spParts(isoInstant);
  if (weekday === 4 && hour >= 17) return addDays(date, 7);
  return addDays(date, (4 - weekday + 7) % 7);
}

export const phoneKey = (p: unknown) => String(p || '').replace(/\D/g, '').slice(-11);

/** Recibo que já foi pago ou recusado não pode entrar para pagar de novo. */
const FECHADO = new Set(['reembolsado', 'rejeitado', 'abatido_fundo_missao']);

type Anexo = { nome: string; tipo: string; url: string };

export function receiptToReembNota(r: ReimbursementReceipt, colabByPhone: Map<string, string>, anexo?: Anexo): Record<string, unknown> {
  const received = r.receivedAt || new Date().toISOString();
  const colab = colabByPhone.get(phoneKey(r.employeePhone)) || '';
  const url = r.fileUrl || r.rawImageUrl || '';
  const anexos = anexo ? [anexo] : url ? [{ nome: `nota-${r.id}.jpg`, tipo: 'image/jpeg', url }] : [];
  const quem = [r.employeeName, r.employeePhone].filter(Boolean).join(' · ');
  return {
    lote: loteDaSemana(received),
    colab,
    centro: '',
    dataEnvio: spParts(received).date,
    dataNota: /^\d{4}-\d{2}-\d{2}$/.test(r.receiptDate || '') ? r.receiptDate : '',
    valor: Number.isFinite(r.totalAmount) ? r.totalAmount : null,
    cnpj: String(r.cnpj || '').replace(/\D/g, ''),
    emitente: r.establishmentName || '',
    numero: '',
    descricao: `Recebida pelo WhatsApp${quem ? ` de ${quem}` : ''}${r.reimbursedAt ? ` · já reembolsada em ${r.reimbursedAt.slice(0, 10)}` : ''}`,
    natSug: NATUREZA[r.category] || '',
    natureza: NATUREZA[r.category] || '',
    lido: true,
    anexos,
    incluir: !(r.reimbursedAt || FECHADO.has(r.status)),
    origem: 'whatsapp',
    receiptId: r.id,
    criadoPor: 'WhatsApp',
    criado: received,
  };
}

/**
 * Grava no Reembolso de Operações os recibos que ainda não foram para lá (sem `opsNotaId`).
 * Marca cada recibo enviado com `opsNotaId`; devolve quantos foram enviados.
 */
export interface MirrorOptions {
  /** Mesma regra do resto do servidor (effectiveOrg): empresa antiga/ausente → empresa real. */
  resolveOrg: (id?: string) => string;
  /** Sobe a foto para o Storage e devolve a URL; sem isso a nota fica sem anexo. */
  uploadImage?: (path: string, data: Buffer, mimeType: string) => Promise<string>;
  now?: Date;
}

/** Recibo recém-chegado cuja foto ainda está sendo salva espera a próxima gravação (até 2 min). */
const ready = (r: ReimbursementReceipt, now: Date) =>
  r.imageStatus !== undefined || now.getTime() - new Date(r.receivedAt || 0).getTime() > 2 * 60_000;

export async function mirrorReceiptsToOps(db: Firestore, receipts: ReimbursementReceipt[], opts: MirrorOptions): Promise<number> {
  const now = opts.now || new Date();
  const pending = receipts.filter(
    (r) => r && !(r as { opsNotaId?: string }).opsNotaId && (r.source === 'whatsapp_real' || r.source === 'manual_upload') && ready(r, now),
  );
  if (!pending.length) return 0;
  const byOrg = new Map<string, ReimbursementReceipt[]>();
  for (const r of pending) {
    const org = opts.resolveOrg(r.organizationId);
    byOrg.set(org, [...(byOrg.get(org) || []), r]);
  }
  const anexoDe = async (orgId: string, r: ReimbursementReceipt): Promise<Anexo | undefined> => {
    if (!opts.uploadImage) return undefined;
    const img = await db.doc(`receipt_images/${r.id}`).get();
    const d = img.exists ? (img.data() as { base64?: string; mimeType?: string }) : null;
    if (!d?.base64) return undefined;
    const tipo = d.mimeType || 'image/jpeg';
    const ext = (tipo.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
    const url = await opts.uploadImage(`operacoes/${orgId}/wa_${r.id}.${ext}`, Buffer.from(d.base64, 'base64'), tipo);
    return { nome: `nota-${r.id}.${ext}`, tipo, url };
  };
  let sent = 0;
  for (const [orgId, list] of byOrg) {
    const colabs = await db.collection(`ops_orgs/${orgId}/colaboradores`).get();
    const byPhone = new Map<string, string>();
    for (const d of colabs.docs) {
      const k = phoneKey(d.get('telefone'));
      if (k.length >= 10) byPhone.set(k, d.id);
    }
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400);
      const anexos = await Promise.all(chunk.map((r) => anexoDe(orgId, r).catch(() => undefined)));
      const batch = db.batch();
      chunk.forEach((r, k) => {
        const id = `wa_${r.id}`.replace(/[^\w-]/g, '_');
        batch.set(db.doc(`ops_orgs/${orgId}/reemb_notas/${id}`), receiptToReembNota(r, byPhone, anexos[k]));
      });
      await batch.commit();
      for (const r of chunk) (r as { opsNotaId?: string }).opsNotaId = `wa_${r.id}`.replace(/[^\w-]/g, '_');
      sent += chunk.length;
    }
  }
  return sent;
}
