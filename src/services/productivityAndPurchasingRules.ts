import type { PurchaseOrder } from '../types/purchasing.ts';
import type { UserRole } from '../types/index.ts';

export interface SupplierReceiptRecord {
  id: string;
  purchaseOrderId: string;
  receivedAt?: string;
  createdAt?: string;
  items?: Array<{
    receivedQty?: number;
    quantityReceived?: number;
    nonConformingQty?: number;
    rejectedQty?: number;
  }>;
}

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const round4 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;

export type ProductivityUnit = 'kg' | 'm' | 'junta' | 'diametro_polegada';

export interface ProductivityBenchmark {
  discipline: string;
  unit: ProductivityUnit;
  plannedHhPerUnit: number;
  sourceLabel: string;
  revision: string;
}

export interface AssemblyProductivityResult {
  discipline: string;
  unit: ProductivityUnit;
  plannedQuantity: number;
  actualQuantity: number;
  actualHours: number;
  plannedHhPerUnit: number;
  actualHhPerUnit: number | null;
  efficiencyIndex: number | null; // planned / actual (>1 = better than baseline)
  status: 'dados_insuficientes' | 'acima_meta' | 'na_meta' | 'abaixo_meta';
  sourceLabel: string;
  revision: string;
}

export function computeAssemblyProductivity(params: {
  benchmark: ProductivityBenchmark;
  plannedQuantity: number;
  actualQuantity: number;
  actualHours: number;
}): AssemblyProductivityResult {
  const { benchmark, plannedQuantity, actualQuantity, actualHours } = params;
  if (!Number.isFinite(actualQuantity) || actualQuantity <= 0 || !Number.isFinite(actualHours) || actualHours <= 0) {
    return {
      discipline: benchmark.discipline,
      unit: benchmark.unit,
      plannedQuantity: round2(plannedQuantity),
      actualQuantity: round2(Math.max(0, actualQuantity || 0)),
      actualHours: round2(Math.max(0, actualHours || 0)),
      plannedHhPerUnit: round4(benchmark.plannedHhPerUnit),
      actualHhPerUnit: null,
      efficiencyIndex: null,
      status: 'dados_insuficientes',
      sourceLabel: benchmark.sourceLabel,
      revision: benchmark.revision,
    };
  }
  const actualHhPerUnit = round4(actualHours / actualQuantity);
  const efficiencyIndex = benchmark.plannedHhPerUnit > 0 ? round2(benchmark.plannedHhPerUnit / actualHhPerUnit) : null;
  const status =
    efficiencyIndex === null
      ? 'dados_insuficientes'
      : efficiencyIndex >= 1.05
      ? 'acima_meta'
      : efficiencyIndex >= 0.95
      ? 'na_meta'
      : 'abaixo_meta';

  return {
    discipline: benchmark.discipline,
    unit: benchmark.unit,
    plannedQuantity: round2(plannedQuantity),
    actualQuantity: round2(actualQuantity),
    actualHours: round2(actualHours),
    plannedHhPerUnit: round4(benchmark.plannedHhPerUnit),
    actualHhPerUnit,
    efficiencyIndex,
    status,
    sourceLabel: benchmark.sourceLabel,
    revision: benchmark.revision,
  };
}

export interface SupplierScorecard {
  supplierId: string;
  supplierName: string;
  ordersEvaluated: number;
  receiptsEvaluated: number;
  onTimeRatePct: number | null;
  qualityConformityPct: number | null;
  compositeScore: number | null; // 0..100, null when insufficient real history
  coverageNote: string;
}

export function evaluateSupplierScorecard(params: {
  supplierId: string;
  supplierName: string;
  orders: readonly PurchaseOrder[];
  receipts: readonly SupplierReceiptRecord[];
}): SupplierScorecard {
  const orders = params.orders.filter((o) => o.supplierId === params.supplierId && o.status !== 'cancelada');
  const orderIds = new Set(orders.map((o) => o.id));
  const receipts = params.receipts.filter((r) => orderIds.has(r.purchaseOrderId));

  if (orders.length === 0 || receipts.length === 0) {
    return {
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      ordersEvaluated: orders.length,
      receiptsEvaluated: receipts.length,
      onTimeRatePct: null,
      qualityConformityPct: null,
      compositeScore: null,
      coverageNote: 'Histórico insuficiente de recebimentos reais para calcular nota do fornecedor.',
    };
  }

  let onTimeTotal = 0;
  let onTimeChecked = 0;
  let qtyReceivedTotal = 0;
  let qtyConformingTotal = 0;

  const orderById = new Map(orders.map((o) => [o.id, o]));
  for (const r of receipts) {
    const po = orderById.get(r.purchaseOrderId);
    const promised = po?.expectedDeliveryDate || '';
    const actual = (r.receivedAt || r.createdAt || '').slice(0, 10);
    if (promised && actual) {
      onTimeChecked += 1;
      if (actual <= promised) onTimeTotal += 1;
    }
    for (const item of r.items || []) {
      const recQty = Math.max(0, Number((item as any).receivedQty ?? (item as any).quantityReceived ?? 0));
      const ncQty = Math.max(0, Number((item as any).nonConformingQty ?? (item as any).rejectedQty ?? 0));
      qtyReceivedTotal += recQty;
      qtyConformingTotal += Math.max(0, recQty - ncQty);
    }
  }

  const onTimeRatePct = onTimeChecked > 0 ? round2((onTimeTotal / onTimeChecked) * 100) : null;
  const qualityConformityPct = qtyReceivedTotal > 0 ? round2((qtyConformingTotal / qtyReceivedTotal) * 100) : null;
  const parts = [onTimeRatePct, qualityConformityPct].filter((v): v is number => v !== null);
  const compositeScore = parts.length > 0 ? round2(parts.reduce((s, v) => s + v, 0) / parts.length) : null;

  return {
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    ordersEvaluated: orders.length,
    receiptsEvaluated: receipts.length,
    onTimeRatePct,
    qualityConformityPct,
    compositeScore,
    coverageNote: `Avaliado sobre ${orders.length} OC(s) e ${receipts.length} recebimento(s) reais.`,
  };
}

export interface PurchasingApprovalRule {
  id: string;
  orgId: string;
  minAmount: number;
  maxAmount: number | null;
  requiredRoles: UserRole[];
  costCenterId?: string;
  label: string;
}

export function evaluatePurchasingApprovalAuthority(params: {
  amount: number;
  actorRole: UserRole;
  isMaster?: boolean;
  costCenterId?: string;
  rules: readonly PurchasingApprovalRule[];
}): { allowed: boolean; matchedRule?: PurchasingApprovalRule; reason?: string } {
  if (params.isMaster) return { allowed: true };
  const amount = round2(Number(params.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, reason: 'Valor da Ordem de Compra deve ser maior que zero.' };
  }

  const applicable = params.rules.filter(
    (r) =>
      (!r.costCenterId || r.costCenterId === params.costCenterId) &&
      amount >= r.minAmount &&
      (r.maxAmount === null || amount <= r.maxAmount),
  );
  // Prefer specific cost center rule, then highest minAmount
  applicable.sort((a, b) => {
    const aSpec = a.costCenterId ? 1 : 0;
    const bSpec = b.costCenterId ? 1 : 0;
    if (aSpec !== bSpec) return bSpec - aSpec;
    return b.minAmount - a.minAmount;
  });

  const matched = applicable[0];
  if (!matched) {
    // Safe default policy: up to R$ 10k Supervisor+, above requires Gerente/Admin
    const allowedDefault =
      amount <= 10000
        ? ['Admin', 'Gerente', 'Supervisor'].includes(params.actorRole)
        : ['Admin', 'Gerente'].includes(params.actorRole);
    return allowedDefault
      ? { allowed: true }
      : { allowed: false, reason: `Alçada insuficiente (${params.actorRole}) para aprovar OC de R$ ${amount.toLocaleString('pt-BR')}.` };
  }

  if (matched.requiredRoles.includes(params.actorRole)) {
    return { allowed: true, matchedRule: matched };
  }
  return {
    allowed: false,
    matchedRule: matched,
    reason: `Alçada "${matched.label}" exige perfil ${matched.requiredRoles.join(' ou ')} para aprovar R$ ${amount.toLocaleString('pt-BR')}.`,
  };
}
