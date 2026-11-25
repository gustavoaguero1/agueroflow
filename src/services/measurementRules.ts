import type { FinanceReceivable } from '../types/finance';
import type {
  MeasurementBulletin,
  MeasurementEventType,
  MeasurementLineItem,
  MeasurementStatus,
} from '../types/measurement';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const round4 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;

export interface RawMeasurementLineInput {
  id?: string;
  itemCode?: string;
  description: string;
  unit: string;
  lpuItemId?: string;
  workOrderId?: string;
  stageName?: string;
  evidenceDocRef?: string;
  contractedQuantity?: number;
  previousAccumulatedQuantity?: number;
  measuredQuantity: number;
  approvedQuantity?: number;
  unitPrice: number;
  glosaReason?: string;
}

export function normalizeMeasurementLine(
  input: RawMeasurementLineInput,
  index: number,
): MeasurementLineItem {
  const description = String(input.description || '').trim();
  const unit = String(input.unit || 'UN').trim().toUpperCase();
  if (description.length < 3) {
    throw new Error(`Item #${index + 1}: informe uma descrição com pelo menos 3 caracteres.`);
  }
  const measuredQuantity = round4(Number(input.measuredQuantity));
  const unitPrice = round4(Number(input.unitPrice));
  if (!Number.isFinite(measuredQuantity) || measuredQuantity <= 0) {
    throw new Error(`Item #${index + 1}: quantidade medida deve ser maior que zero.`);
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(`Item #${index + 1}: preço unitário inválido.`);
  }

  const approvedQuantity =
    input.approvedQuantity !== undefined && input.approvedQuantity !== null
      ? round4(Number(input.approvedQuantity))
      : measuredQuantity;
  if (!Number.isFinite(approvedQuantity) || approvedQuantity < 0 || approvedQuantity > measuredQuantity) {
    throw new Error(`Item #${index + 1}: quantidade aprovada deve estar entre 0 e a quantidade medida (${measuredQuantity}).`);
  }

  const measuredTotal = round2(measuredQuantity * unitPrice);
  const approvedTotal = round2(approvedQuantity * unitPrice);
  const glosaAmount = round2(Math.max(0, measuredTotal - approvedTotal));
  const glosaReason = input.glosaReason ? String(input.glosaReason).trim() : undefined;

  if (glosaAmount > 0 && (!glosaReason || glosaReason.length < 3)) {
    throw new Error(`Item #${index + 1}: informe o motivo da glosa quando a quantidade aprovada for menor que a medida.`);
  }

  return {
    id: (input.id && String(input.id).trim()) || `bmi_${index + 1}`,
    ...(input.itemCode?.trim() ? { itemCode: input.itemCode.trim().toUpperCase() } : {}),
    description,
    unit,
    ...(input.lpuItemId?.trim() ? { lpuItemId: input.lpuItemId.trim() } : {}),
    ...(input.workOrderId?.trim() ? { workOrderId: input.workOrderId.trim() } : {}),
    ...(input.stageName?.trim() ? { stageName: input.stageName.trim() } : {}),
    ...(input.evidenceDocRef?.trim() ? { evidenceDocRef: input.evidenceDocRef.trim() } : {}),
    ...(input.contractedQuantity !== undefined && Number.isFinite(Number(input.contractedQuantity))
      ? { contractedQuantity: round4(Number(input.contractedQuantity)) }
      : {}),
    ...(input.previousAccumulatedQuantity !== undefined && Number.isFinite(Number(input.previousAccumulatedQuantity))
      ? { previousAccumulatedQuantity: round4(Number(input.previousAccumulatedQuantity)) }
      : {}),
    measuredQuantity,
    approvedQuantity,
    unitPrice,
    measuredTotal,
    approvedTotal,
    glosaAmount,
    ...(glosaReason ? { glosaReason } : {}),
  };
}

export function computeBulletinFinancialAdjustments(params: {
  totalApprovedAmount: number;
  readjustmentPercent?: number;
  retentionPercent?: number;
}): {
  readjustmentPercent: number;
  readjustmentAmount: number;
  retentionPercent: number;
  retentionAmount: number;
  netApprovedReceivableAmount: number;
} {
  const base = round2(Math.max(0, Number(params.totalApprovedAmount) || 0));
  const readjustmentPercent = Number.isFinite(Number(params.readjustmentPercent))
    ? Math.max(-50, Math.min(100, Number(params.readjustmentPercent)))
    : 0;
  const retentionPercent = Number.isFinite(Number(params.retentionPercent))
    ? Math.max(0, Math.min(50, Number(params.retentionPercent)))
    : 0;

  const readjustmentAmount = round2((base * readjustmentPercent) / 100);
  const grossWithReadjustment = round2(base + readjustmentAmount);
  const retentionAmount = round2((grossWithReadjustment * retentionPercent) / 100);
  const netApprovedReceivableAmount = round2(Math.max(0, grossWithReadjustment - retentionAmount));

  return {
    readjustmentPercent,
    readjustmentAmount,
    retentionPercent,
    retentionAmount,
    netApprovedReceivableAmount,
  };
}

export function computeBulletinTotals(rawItems: readonly RawMeasurementLineInput[]): {
  items: MeasurementLineItem[];
  totalMeasuredAmount: number;
  totalApprovedAmount: number;
  totalGlosaAmount: number;
} {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('O Boletim de Medição precisa ter ao menos 1 item medido.');
  }
  const items = rawItems.map((item, idx) => normalizeMeasurementLine(item, idx));
  const totalMeasuredAmount = round2(items.reduce((s, i) => s + i.measuredTotal, 0));
  const totalApprovedAmount = round2(items.reduce((s, i) => s + i.approvedTotal, 0));
  const totalGlosaAmount = round2(items.reduce((s, i) => s + i.glosaAmount, 0));

  return { items, totalMeasuredAmount, totalApprovedAmount, totalGlosaAmount };
}

const ALLOWED_TRANSITIONS: Record<MeasurementStatus, MeasurementStatus[]> = {
  rascunho: ['enviado_aprovacao', 'cancelado'],
  enviado_aprovacao: ['aprovado', 'aprovado_parcial', 'glosado', 'devolvido', 'cancelado'],
  devolvido: ['enviado_aprovacao', 'cancelado'],
  aprovado: [],
  aprovado_parcial: [],
  glosado: [],
  cancelado: [],
};

export function canTransitionMeasurementStatus(from: MeasurementStatus, to: MeasurementStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function eventTypeForMeasurementStatus(to: MeasurementStatus): MeasurementEventType {
  switch (to) {
    case 'enviado_aprovacao':
      return 'submitted';
    case 'aprovado':
      return 'approved';
    case 'aprovado_parcial':
      return 'partially_approved';
    case 'glosado':
      return 'glosado';
    case 'devolvido':
      return 'returned';
    case 'cancelado':
      return 'cancelled';
    default:
      return 'created';
  }
}

export function receivableIdForBulletin(orgId: string, bulletinId: string): string {
  const clean = (v: string) => v.trim().replace(/[^A-Za-z0-9_-]/g, '_');
  return `recv_${clean(orgId)}_bm_${clean(bulletinId)}`;
}

export function buildReceivableFromApprovedBulletin(
  bulletin: MeasurementBulletin,
  actorUid: string,
  nowIso: string,
): FinanceReceivable {
  const adjustments = computeBulletinFinancialAdjustments({
    totalApprovedAmount: bulletin.totalApprovedAmount,
    readjustmentPercent: bulletin.readjustmentPercent,
    retentionPercent: bulletin.retentionPercent,
  });
  const finalAmount =
    typeof bulletin.netApprovedReceivableAmount === 'number' && bulletin.netApprovedReceivableAmount > 0
      ? round2(bulletin.netApprovedReceivableAmount)
      : adjustments.netApprovedReceivableAmount;

  if (finalAmount <= 0) {
    throw new Error('Não é possível gerar título a receber para boletim com valor líquido aprovado zerado.');
  }
  const id = receivableIdForBulletin(bulletin.orgId, bulletin.id);
  const extraDetail =
    adjustments.retentionAmount > 0 || adjustments.readjustmentAmount !== 0
      ? ` (Reajuste: R$ ${adjustments.readjustmentAmount.toFixed(2)}, Retenção/Caução: R$ ${adjustments.retentionAmount.toFixed(2)})`
      : '';

  return {
    id,
    orgId: bulletin.orgId,
    origem: 'medicao',
    cliente: {
      nome: bulletin.clientName,
      ...(bulletin.clientCnpj ? { cnpj: bulletin.clientCnpj } : {}),
    },
    documento: bulletin.code,
    valor: finalAmount,
    vencimento: bulletin.dueDate,
    status: 'aberto',
    valorRecebido: 0,
    saldoAberto: finalAmount,
    receiptCount: 0,
    ...(bulletin.projectId ? { projectId: bulletin.projectId } : {}),
    contractId: bulletin.contractId,
    measurementBulletinId: bulletin.id,
    notes: `Gerado automaticamente pela aprovação do Boletim de Medição ${bulletin.code} (${bulletin.periodStart} a ${bulletin.periodEnd})${extraDetail}.`,
    createdAt: nowIso,
    createdBy: actorUid,
  };
}
