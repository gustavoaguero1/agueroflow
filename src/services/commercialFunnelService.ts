import { collection, doc, getDocs, query, runTransaction, where, type Firestore } from 'firebase/firestore';
import type { CommercialProposal, CommercialProposalStatus } from '../types/commercial';

export const FUNNEL_STATUSES = ['enviada', 'negociacao', 'ganha', 'perdida'] as const;
export const LOSS_REASONS = ['Preço', 'Prazo', 'Escopo', 'Concorrente', 'Cliente desistiu', 'Outro'];
const DEFAULT_PROB: Record<string, number> = { enviada: 30, negociacao: 60 };

type Actor = { uid: string; name: string };
const lastChange = (p: CommercialProposal) => p.statusHistory?.at(-1)?.at || p.updatedAt || p.createdAt;

export function funnelSummary(proposals: CommercialProposal[], period?: { from?: string; to?: string }) {
  const byStatus = Object.fromEntries(FUNNEL_STATUSES.map((s) => [s, { count: 0, value: 0 }])) as Record<string, { count: number; value: number }>;
  const reasons = new Map<string, number>();
  let forecast = 0;
  for (const p of proposals) {
    if (!(p.status in byStatus)) continue;
    const at = (lastChange(p) || '').slice(0, 10);
    if ((period?.from && at < period.from) || (period?.to && at > period.to)) continue;
    const v = p.proposedTotal || 0;
    byStatus[p.status].count++;
    byStatus[p.status].value += v;
    if (p.status === 'enviada' || p.status === 'negociacao') forecast += (v * (p.probabilidade ?? DEFAULT_PROB[p.status])) / 100;
    if (p.status === 'perdida') {
      const m = (p.motivoPerda || 'Outro').split(':')[0].trim();
      reasons.set(m, (reasons.get(m) || 0) + 1);
    }
  }
  const closed = byStatus.ganha.count + byStatus.perdida.count;
  return {
    byStatus,
    forecast,
    winRate: closed ? byStatus.ganha.count / closed : null,
    lossReasons: [...reasons].map(([motivo, count]) => ({ motivo, count })).sort((a, b) => b.count - a.count),
  };
}

/** Returns the stored `motivoPerda` ("Motivo: detalhe") or throws. */
export function validateLoss(reason: string, detail: string): string {
  const text = detail.trim();
  if (!LOSS_REASONS.includes(reason) || (reason + text).length < 3) throw new Error('Informe o motivo da perda.');
  return text ? `${reason}: ${text}` : reason;
}

const historyEntry = (status: CommercialProposalStatus, by: string) => ({ status, at: new Date().toISOString(), by });

export async function moveProposalStage(db: Firestore, proposal: CommercialProposal, status: 'enviada' | 'negociacao', user: Actor) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'commercial_proposals', proposal.id);
    const cur = (await tx.get(ref)).data() as CommercialProposal;
    tx.update(ref, { status, updatedAt: new Date().toISOString(), statusHistory: [...(cur.statusHistory || []), historyEntry(status, user.name)] });
  });
}

export async function markProposalLost(db: Firestore, proposal: CommercialProposal, motivo: string, user: Actor, detail = '') {
  const motivoPerda = validateLoss(motivo, detail);
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'commercial_proposals', proposal.id);
    const cur = (await tx.get(ref)).data() as CommercialProposal;
    tx.update(ref, { status: 'perdida', motivoPerda, updatedAt: new Date().toISOString(), statusHistory: [...(cur.statusHistory || []), historyEntry('perdida', user.name)] });
  });
}

/** Deterministic OS id + transaction: concurrent calls yield a single work order. */
export async function markProposalWon(db: Firestore, proposal: CommercialProposal, user: Actor): Promise<string> {
  const orgId = proposal.organizationId;
  const sts = await getDocs(query(collection(db, 'work_order_statuses'), where('orgId', '==', orgId)));
  const first = sts.docs.map((d) => d.data() as { id?: string; order?: number }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  const status = first?.id || 'aberto';
  const orderId = `os_prop_${proposal.id}`;

  return runTransaction(db, async (tx) => {
    const pRef = doc(db, 'commercial_proposals', proposal.id);
    const cRef = doc(db, 'counters', `${orgId}_work_orders`);
    const [pSnap, cSnap] = await Promise.all([tx.get(pRef), tx.get(cRef)]);
    const cur = pSnap.data() as CommercialProposal;
    if (cur.workOrderId) return cur.workOrderId;

    const seq = ((cSnap.data()?.seq as number) || 0) + 1;
    const now = new Date().toISOString();
    const orderNumber = `OS-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`;
    tx.set(cRef, { orgId, seq });
    tx.set(doc(db, 'work_orders', orderId), {
      id: orderId,
      orgId,
      unitId: cur.unitId || 'default_unit',
      ...(cur.contractId ? { contractId: cur.contractId } : {}),
      orderNumber,
      title: `${cur.code} - ${cur.title}`,
      description: `Cliente: ${cur.clientName}\n${cur.scopeDescription || ''}`.trim(),
      orderType: 'solicitacao',
      priority: 'media',
      status,
      requesterId: user.uid,
      requesterName: user.name,
      estimatedHours: 0,
      estimatedCost: (cur.totalBaseCost || 0) + (cur.totalFreightCost || 0) + (cur.totalTaxCost || 0),
      proposalId: cur.id,
      isRework: false,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(doc(collection(db, 'order_events')), {
      orgId, orderId, userId: user.uid, userName: user.name, eventType: 'criacao',
      description: `OS ${orderNumber} criada a partir da proposta ${cur.code}.`,
      newStatus: status, timestamp: now,
    });
    tx.update(pRef, { status: 'ganha', workOrderId: orderId, updatedAt: now, statusHistory: [...(cur.statusHistory || []), historyEntry('ganha', user.name)] });
    return orderId;
  });
}
