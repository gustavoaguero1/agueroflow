import type { StockMovement, WorkOrder, WorkerTimeLog } from '../types/index.ts';
import type { FinanceReceivable } from '../types/finance.ts';
import type { MeasurementBulletin } from '../types/measurement.ts';
import type { Project } from '../types/project.ts';
import type { PurchaseOrder } from '../types/purchasing.ts';
import type { RecurringOrderConfig } from './recurringOrderRules.ts';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export interface DashboardEconomicSeparation {
  previstoOrcado: number;
  comprometidoAberto: number;
  realizadoConhecido: number;
  medidoTotal: number;
  aprovadoMedicao: number;
  faturadoReceber: number;
  recebidoCaixa: number;
}

export interface DashboardCoverageAlert {
  id: string;
  severity: 'warning' | 'critical';
  label: string;
  count: number;
  detail: string;
  targetSection: 'ordens' | 'obras' | 'obras-medicoes' | 'estoque' | 'relatorios' | 'ordens-recorrencias';
}

export interface DashboardDataCoverageReport {
  generatedAt: string;
  workOrdersTotal: number;
  workOrdersWithProjectPct: number;
  workOrdersWithValidUnitPct: number;
  unpricedLaborHours: number;
  unpricedStockExitsCount: number;
  failedRecurringPlansCount: number;
  pendingApprovalBulletinsCount: number;
  economic: DashboardEconomicSeparation;
  alerts: DashboardCoverageAlert[];
}

export function computeDashboardDataCoverage(params: {
  orgId: string;
  projects: readonly Project[];
  workOrders: readonly WorkOrder[];
  timeLogs?: readonly WorkerTimeLog[];
  stockMovements?: readonly StockMovement[];
  purchaseOrders?: readonly PurchaseOrder[];
  bulletins?: readonly MeasurementBulletin[];
  receivables?: readonly FinanceReceivable[];
  recurringOrders?: readonly RecurringOrderConfig[];
  nowIso?: string;
}): DashboardDataCoverageReport {
  const { orgId } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  const projects = params.projects.filter((p) => p.orgId === orgId);
  const workOrders = params.workOrders.filter((w) => w.orgId === orgId);
  const timeLogs = (params.timeLogs || []).filter((l) => l.orgId === orgId);
  const stockMovements = (params.stockMovements || []).filter((m) => m.orgId === orgId);
  const purchaseOrders = (params.purchaseOrders || []).filter((po) => po.organizationId === orgId);
  const bulletins = (params.bulletins || []).filter((b) => b.orgId === orgId);
  const receivables = (params.receivables || []).filter((r) => r.orgId === orgId);
  const recurring = (params.recurringOrders || []).filter((r) => r.orgId === orgId);

  const workOrdersTotal = workOrders.length;
  const withProject = workOrders.filter((w) => Boolean(w.projectId?.trim())).length;
  const withValidUnit = workOrders.filter((w) => Boolean(w.unitId?.trim()) && w.unitId !== 'default_unit').length;
  const workOrdersWithProjectPct = workOrdersTotal > 0 ? Math.round((withProject / workOrdersTotal) * 100) : 100;
  const workOrdersWithValidUnitPct = workOrdersTotal > 0 ? Math.round((withValidUnit / workOrdersTotal) * 100) : 100;

  let unpricedLaborHours = 0;
  let realizedLabor = 0;
  for (const log of timeLogs) {
    const rec = log as unknown as Record<string, any>;
    const hours = Number(rec.totalHours ?? rec.hours ?? 0);
    const cost =
      typeof rec.totalCost === 'number' && rec.totalCost > 0
        ? rec.totalCost
        : typeof rec.calculatedCost === 'number' && rec.calculatedCost > 0
        ? rec.calculatedCost
        : typeof rec.hourlyRate === 'number' && rec.hourlyRate > 0 && hours > 0
        ? rec.hourlyRate * hours
        : null;
    if (cost === null) {
      if (Number.isFinite(hours) && hours > 0) unpricedLaborHours += hours;
    } else {
      realizedLabor += cost;
    }
  }

  let unpricedStockExitsCount = 0;
  let realizedStock = 0;
  for (const mov of stockMovements) {
    if (mov.type !== 'saida') continue;
    if (typeof mov.totalCost === 'number' && Number.isFinite(mov.totalCost) && mov.totalCost >= 0) {
      realizedStock += mov.totalCost;
    } else if (typeof mov.unitCost === 'number' && Number.isFinite(mov.unitCost) && mov.unitCost >= 0) {
      realizedStock += mov.unitCost * (Number(mov.quantity) || 0);
    } else {
      unpricedStockExitsCount += 1;
    }
  }

  const previstoOrcado = round2(
    projects.reduce((s, p) => {
      const b = p.budgetBaseline;
      const fromBaseline = b ? (Number(b.plannedDirectCost) || 0) + (Number(b.plannedIndirectCost) || 0) : 0;
      const legacyPlanned = Number((p as unknown as Record<string, unknown>).plannedCost) || 0;
      return s + (fromBaseline > 0 ? fromBaseline : legacyPlanned);
    }, 0),
  );
  const comprometidoAberto = round2(
    purchaseOrders
      .filter((po) => po.status !== 'cancelada' && po.status !== 'recebida_total')
      .reduce((s, po) => s + (Number(po.totalValue) || 0), 0),
  );
  const realizadoConhecido = round2(realizedLabor + realizedStock);

  const nonCancelledBulletins = bulletins.filter((b) => b.status !== 'cancelado');
  const medidoTotal = round2(nonCancelledBulletins.reduce((s, b) => s + (Number(b.totalMeasuredAmount) || 0), 0));
  const aprovadoMedicao = round2(
    nonCancelledBulletins
      .filter((b) => b.status === 'aprovado' || b.status === 'aprovado_parcial')
      .reduce((s, b) => s + (Number(b.totalApprovedAmount) || 0), 0),
  );

  const nonCancelledReceivables = receivables.filter((r) => r.status !== 'cancelado');
  const faturadoReceber = round2(nonCancelledReceivables.reduce((s, r) => s + (Number(r.valor) || 0), 0));
  const recebidoCaixa = round2(nonCancelledReceivables.reduce((s, r) => s + (Number(r.valorRecebido) || 0), 0));

  const failedRecurringPlansCount = recurring.filter((r) => Boolean(r.lastRunError)).length;
  const pendingApprovalBulletinsCount = bulletins.filter((b) => b.status === 'enviado_aprovacao').length;

  const alerts: DashboardCoverageAlert[] = [];
  if (workOrdersTotal > 0 && withProject < workOrdersTotal) {
    alerts.push({
      id: 'wo_without_project',
      severity: 'warning',
      label: 'OS sem vínculo a Projeto/Obra',
      count: workOrdersTotal - withProject,
      detail: `${workOrdersTotal - withProject} de ${workOrdersTotal} OS ainda não apontam para um Projeto/Obra mestre.`,
      targetSection: 'ordens',
    });
  }
  if (unpricedLaborHours > 0) {
    alerts.push({
      id: 'unpriced_labor',
      severity: 'warning',
      label: 'Horas apontadas sem taxa de custo',
      count: Math.round(unpricedLaborHours * 10) / 10,
      detail: `${round2(unpricedLaborHours)}h registradas sem valor/taxa — excluídas do realizado para evitar distorção.`,
      targetSection: 'relatorios',
    });
  }
  if (unpricedStockExitsCount > 0) {
    alerts.push({
      id: 'unpriced_stock',
      severity: 'warning',
      label: 'Saídas de estoque sem custo unitário',
      count: unpricedStockExitsCount,
      detail: `${unpricedStockExitsCount} movimentação(ões) de saída sem custo médio/unitário registrado.`,
      targetSection: 'estoque',
    });
  }
  if (failedRecurringPlansCount > 0) {
    alerts.push({
      id: 'failed_recurring',
      severity: 'critical',
      label: 'Recorrências com falha de geração',
      count: failedRecurringPlansCount,
      detail: `${failedRecurringPlansCount} plano(s) recorrente(s) falharam na última geração e precisam de ajuste.`,
      targetSection: 'ordens-recorrencias',
    });
  }
  if (pendingApprovalBulletinsCount > 0) {
    alerts.push({
      id: 'pending_bm',
      severity: 'warning',
      label: 'Boletins de Medição aguardando aprovação',
      count: pendingApprovalBulletinsCount,
      detail: `${pendingApprovalBulletinsCount} BM(s) enviado(s) para aprovação aguardando validação/faturamento.`,
      targetSection: 'obras-medicoes',
    });
  }

  return {
    generatedAt: nowIso,
    workOrdersTotal,
    workOrdersWithProjectPct,
    workOrdersWithValidUnitPct,
    unpricedLaborHours: round2(unpricedLaborHours),
    unpricedStockExitsCount,
    failedRecurringPlansCount,
    pendingApprovalBulletinsCount,
    economic: {
      previstoOrcado,
      comprometidoAberto,
      realizadoConhecido,
      medidoTotal,
      aprovadoMedicao,
      faturadoReceber,
      recebidoCaixa,
    },
    alerts,
  };
}
