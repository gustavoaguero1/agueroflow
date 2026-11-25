export type ProtheusEntityType =
  | 'purchase_order'
  | 'finance_payable'
  | 'finance_receivable'
  | 'stock_movement'
  | 'measurement_bulletin';

export type ProtheusSyncStatus = 'pendente_exportacao' | 'sincronizado' | 'divergencia' | 'erro';

export interface ProtheusSyncRecord {
  id: string;
  orgId: string;
  entityType: ProtheusEntityType;
  internalId: string;
  internalCode: string;
  internalAmount: number;
  internalStatus: string;
  protheusExternalId?: string;
  protheusAmount?: number;
  protheusStatus?: string;
  status: ProtheusSyncStatus;
  divergenceDetails?: string;
  attempts: number;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const cleanKey = (v: string) => String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');
const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Deterministic idempotency ID so repeated Protheus syncs never duplicate fiscal/accounting entries. */
export function protheusSyncDocId(orgId: string, entityType: ProtheusEntityType, internalId: string): string {
  return `prth_${cleanKey(orgId)}_${entityType}_${cleanKey(internalId)}`.slice(0, 180);
}

/**
 * Reconciles an AgueroFlow managerial record against the Protheus ERP fiscal/accounting state.
 * Never silently overwrites divergences: flags them explicitly for human/accounting review.
 */
export function reconcileProtheusSnapshot(params: {
  existing: ProtheusSyncRecord;
  protheusExternalId: string;
  protheusAmount: number;
  protheusStatus: string;
  nowIso?: string;
}): ProtheusSyncRecord {
  const now = params.nowIso || new Date().toISOString();
  const internalAmt = round2(params.existing.internalAmount);
  const externalAmt = round2(params.protheusAmount);
  const diffs: string[] = [];

  if (Math.abs(internalAmt - externalAmt) > 0.01) {
    diffs.push(`Valor divergente: AgueroFlow R$ ${internalAmt.toFixed(2)} vs Protheus R$ ${externalAmt.toFixed(2)}.`);
  }
  if (
    params.protheusStatus.trim().toLowerCase() === 'cancelado' &&
    params.existing.internalStatus.trim().toLowerCase() !== 'cancelado'
  ) {
    diffs.push(`Status divergente: cancelado no Protheus enquanto "${params.existing.internalStatus}" no AgueroFlow.`);
  }

  return {
    ...params.existing,
    protheusExternalId: params.protheusExternalId.trim(),
    protheusAmount: externalAmt,
    protheusStatus: params.protheusStatus.trim(),
    status: diffs.length > 0 ? 'divergencia' : 'sincronizado',
    divergenceDetails: diffs.length > 0 ? diffs.join(' ') : undefined,
    attempts: (params.existing.attempts || 0) + 1,
    lastSyncedAt: now,
    updatedAt: now,
  };
}
