import { apiFetch } from '../apiAuthFetch';
import type { CommercialProposal } from '../types/commercial';

export const FUNNEL_STATUSES = ['enviada', 'negociacao', 'ganha', 'perdida'] as const;
export const LOSS_REASONS = ['Preço', 'Prazo', 'Escopo', 'Concorrente', 'Cliente desistiu', 'Outro'];
const DEFAULT_PROB: Record<string, number> = { enviada: 30, negociacao: 60 };

const lastChange = (p: CommercialProposal) => p.statusHistory?.at(-1)?.at || p.updatedAt || p.createdAt;

export function funnelSummary(proposals: CommercialProposal[], period?: { from?: string; to?: string }) {
  const byStatus = Object.fromEntries(FUNNEL_STATUSES.map((s) => [s, { count: 0, value: 0 }])) as Record<string, { count: number; value: number }>;
  const reasons = new Map<string, number>();
  let forecast = 0;
  for (const p of proposals) {
    if (!(p.status in byStatus)) continue;
    const closedDeal = p.status === 'ganha' || p.status === 'perdida';
    const at = (lastChange(p) || '').slice(0, 10);
    // Period applies to closed deals only; the open pipeline is always current.
    if (closedDeal && ((period?.from && at < period.from) || (period?.to && at > period.to))) continue;
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

async function postFunnelAction<T extends Record<string, any>>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Não foi possível atualizar o funil comercial.');
  }
  return payload as T;
}

export async function moveProposalStage(
  _db: unknown,
  proposal: CommercialProposal,
  status: 'enviada' | 'negociacao',
  _user: { uid: string; name: string },
) {
  await postFunnelAction(`/api/commercial/proposals/${encodeURIComponent(proposal.id)}/stage`, {
    orgId: proposal.organizationId,
    status,
  });
}

/** Returns the stored `motivoPerda` ("Motivo: detalhe") or throws. */
export function validateLoss(reason: string, detail: string): string {
  const text = detail.trim();
  if (!LOSS_REASONS.includes(reason) || (reason + text).length < 3) throw new Error('Informe o motivo da perda.');
  return text ? `${reason}: ${text}` : reason;
}

export async function markProposalLost(
  _db: unknown,
  proposal: CommercialProposal,
  motivo: string,
  _user: { uid: string; name: string },
  detail = '',
) {
  const motivoPerda = validateLoss(motivo, detail);
  await postFunnelAction(`/api/commercial/proposals/${encodeURIComponent(proposal.id)}/lost`, {
    orgId: proposal.organizationId,
    reason: motivo,
    detail,
  });
  return motivoPerda;
}

/** isInitial first, then lowest order (same as WorkOrdersModule). */
export function pickInitialStatus<T extends { order?: number; isInitial?: boolean }>(list: T[]): T | undefined {
  return list
    .filter((status) => status.isInitial === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
}

/** The server atomically creates the proposal, OS, counter and timeline under Admin transaction control. */
export async function markProposalWon(
  _db: unknown,
  proposal: CommercialProposal,
  _user: { uid: string; name: string },
): Promise<string> {
  const result = await postFunnelAction<{ workOrderId: string }>(
    `/api/commercial/proposals/${encodeURIComponent(proposal.id)}/win`,
    { orgId: proposal.organizationId },
  );
  if (typeof result.workOrderId !== 'string' || !result.workOrderId) {
    throw new Error('A conversão foi aceita, mas o servidor não retornou o identificador da OS.');
  }
  return result.workOrderId;
}
