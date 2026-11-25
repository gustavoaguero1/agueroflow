import type { StockBalance, StockMovement, WorkOrder, WorkerTimeLog } from '../types';
import type { FinancePayable } from '../types/finance';
import type { Project } from '../types/project';
import type { PurchaseOrder } from '../types/purchasing';
import type {
  CostFactSource,
  ProjectCostFact,
  ProjectResultReportSummary,
  ProjectResultRow,
} from '../types/costLedger';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function buildCostFactIdempotencyKey(
  orgId: string,
  source: CostFactSource,
  sourceId: string,
  suffix = '',
): string {
  const clean = (v: string) => String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');
  return `${clean(orgId)}__${source}__${clean(sourceId)}${suffix ? `__${clean(suffix)}` : ''}`;
}

export interface ProjectCostLedgerInputs {
  orgId: string;
  projects: readonly Project[];
  workOrders?: readonly WorkOrder[];
  timeLogs?: readonly WorkerTimeLog[];
  stockMovements?: readonly StockMovement[];
  stockBalances?: readonly StockBalance[];
  purchaseOrders?: readonly PurchaseOrder[];
  payables?: readonly FinancePayable[];
  persistedFacts?: readonly ProjectCostFact[];
}

export interface DerivedProjectCostLedger {
  facts: ProjectCostFact[];
  unpricedLaborHoursByProject: Map<string, number>;
  unpricedStockCountByProject: Map<string, number>;
}

function resolveProjectIdForRecord(
  explicitProjectId: string | undefined,
  workOrderId: string | undefined,
  contractId: string | undefined,
  orderById: Map<string, WorkOrder>,
  singleProjectByContract: Map<string, string>,
): string | null {
  if (explicitProjectId && explicitProjectId.trim()) return explicitProjectId.trim();
  if (workOrderId) {
    const wo = orderById.get(workOrderId);
    if (wo?.projectId) return wo.projectId;
    if (wo?.contractId) {
      const fromWoContract = singleProjectByContract.get(wo.contractId);
      if (fromWoContract) return fromWoContract;
    }
  }
  if (contractId) {
    const fromContract = singleProjectByContract.get(contractId);
    if (fromContract) return fromContract;
  }
  return null;
}

export function deriveProjectCostLedger(inputs: ProjectCostLedgerInputs): DerivedProjectCostLedger {
  const { orgId } = inputs;
  const projects = inputs.projects.filter((p) => p.orgId === orgId);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // Only map contractId -> projectId when unambiguous (exactly 1 project on that contract)
  const projectsPerContract = new Map<string, string[]>();
  for (const p of projects) {
    if (!p.contractId) continue;
    const list = projectsPerContract.get(p.contractId) || [];
    list.push(p.id);
    projectsPerContract.set(p.contractId, list);
  }
  const singleProjectByContract = new Map<string, string>();
  for (const [ctId, ids] of projectsPerContract.entries()) {
    if (ids.length === 1) singleProjectByContract.set(ctId, ids[0]);
  }

  const orderById = new Map<string, WorkOrder>();
  for (const wo of inputs.workOrders || []) {
    if (wo.orgId === orgId) orderById.set(wo.id, wo);
  }

  const avgCostByUnitItem = new Map<string, number>();
  for (const bal of inputs.stockBalances || []) {
    if (bal.orgId === orgId && typeof bal.averageCost === 'number' && Number.isFinite(bal.averageCost) && bal.averageCost >= 0) {
      avgCostByUnitItem.set(`${bal.unitId}__${bal.itemId}`, bal.averageCost);
    }
  }

  const facts: ProjectCostFact[] = [];
  const seenKeys = new Set<string>();
  const unpricedLaborHoursByProject = new Map<string, number>();
  const unpricedStockCountByProject = new Map<string, number>();

  const pushFact = (fact: ProjectCostFact) => {
    if (!projectById.has(fact.projectId)) return;
    if (seenKeys.has(fact.idempotencyKey)) return;
    seenKeys.add(fact.idempotencyKey);
    facts.push(fact);
  };

  // 1. Persisted append-only ledger facts & reversals take precedence by idempotencyKey
  for (const fact of inputs.persistedFacts || []) {
    if (fact.orgId !== orgId) continue;
    pushFact(fact);
  }

  // 2. Realized Labor (HH) from worker_time_logs
  for (const log of inputs.timeLogs || []) {
    if (log.orgId !== orgId) continue;
    const rec = log as unknown as Record<string, any>;
    const projectId = resolveProjectIdForRecord(
      rec.projectId,
      rec.workOrderId || rec.orderId,
      rec.contractId,
      orderById,
      singleProjectByContract,
    );
    if (!projectId || !projectById.has(projectId)) continue;

    const hours = Number(rec.totalHours ?? rec.hours ?? 0);
    const directCost =
      typeof rec.totalCost === 'number' && Number.isFinite(rec.totalCost) && rec.totalCost > 0
        ? rec.totalCost
        : typeof rec.calculatedCost === 'number' && Number.isFinite(rec.calculatedCost) && rec.calculatedCost > 0
        ? rec.calculatedCost
        : typeof rec.hourlyRate === 'number' && Number.isFinite(rec.hourlyRate) && rec.hourlyRate > 0 && hours > 0
        ? rec.hourlyRate * hours
        : null;

    if (directCost === null) {
      if (Number.isFinite(hours) && hours > 0) {
        unpricedLaborHoursByProject.set(
          projectId,
          round2((unpricedLaborHoursByProject.get(projectId) || 0) + hours),
        );
      }
      continue;
    }

    const key = buildCostFactIdempotencyKey(orgId, 'labor_hh', log.id);
    pushFact({
      id: `cf_${key}`,
      orgId,
      projectId,
      unitId: rec.unitId || projectById.get(projectId)?.unitId,
      contractId: rec.contractId || projectById.get(projectId)?.contractId,
      workOrderId: rec.workOrderId || rec.orderId,
      source: 'labor_hh',
      stage: 'realizado',
      sourceId: log.id,
      idempotencyKey: key,
      occurredAt: String(rec.date || rec.createdAt || ''),
      description: `Apontamento HH — ${rec.workerName || 'Equipe'} (${round2(hours)}h)`,
      quantity: Number.isFinite(hours) ? round2(hours) : undefined,
      unit: 'HH',
      unitCost: hours > 0 ? round2(directCost / hours) : undefined,
      amount: round2(directCost),
      createdByUid: String(rec.createdBy || 'system'),
      createdByName: String(rec.workerName || 'Apontamento'),
      createdAt: String(rec.createdAt || rec.date || ''),
    });
  }

  // 3. Realized Material Consumption from stock_movements (type === 'saida')
  for (const mov of inputs.stockMovements || []) {
    if (mov.orgId !== orgId || mov.type !== 'saida') continue;
    const projectId = resolveProjectIdForRecord(
      mov.projectId,
      mov.orderId,
      undefined,
      orderById,
      singleProjectByContract,
    );
    if (!projectId || !projectById.has(projectId)) continue;

    const unitCost =
      typeof mov.unitCost === 'number' && Number.isFinite(mov.unitCost) && mov.unitCost >= 0
        ? mov.unitCost
        : avgCostByUnitItem.get(`${mov.unitId}__${mov.itemId}`);

    const totalCost =
      typeof mov.totalCost === 'number' && Number.isFinite(mov.totalCost) && mov.totalCost >= 0
        ? mov.totalCost
        : unitCost !== undefined
        ? round2(mov.quantity * unitCost)
        : null;

    if (totalCost === null) {
      unpricedStockCountByProject.set(projectId, (unpricedStockCountByProject.get(projectId) || 0) + 1);
      continue;
    }

    const key = buildCostFactIdempotencyKey(orgId, 'stock_consumption', mov.id);
    pushFact({
      id: `cf_${key}`,
      orgId,
      projectId,
      unitId: mov.unitId,
      contractId: projectById.get(projectId)?.contractId,
      workOrderId: mov.orderId,
      source: 'stock_consumption',
      stage: 'realizado',
      sourceId: mov.id,
      idempotencyKey: key,
      occurredAt: mov.createdAt,
      description: `Consumo de estoque — ${mov.itemSku} ${mov.itemName}`,
      quantity: mov.quantity,
      unitCost,
      amount: round2(totalCost),
      createdByUid: mov.createdBy,
      createdByName: mov.userName,
      createdAt: mov.createdAt,
    });
  }

  // 4. Purchasing Commitments from open PurchaseOrders (not cancelled, draft, or fully received)
  const payablesByPoId = new Map<string, number>();
  for (const pay of inputs.payables || []) {
    if (pay.orgId !== orgId || pay.status === 'cancelado') continue;
    const poId = pay.purchaseOrderId;
    if (poId) {
      payablesByPoId.set(poId, round2((payablesByPoId.get(poId) || 0) + (Number(pay.valor) || 0)));
    }
  }

  for (const po of inputs.purchaseOrders || []) {
    const poRec = po as unknown as Record<string, any>;
    const poOrg = poRec.orgId || po.organizationId;
    if (poOrg !== orgId) continue;
    const status = String(po.status || '').toLowerCase();
    if (['cancelado', 'cancelada', 'rascunho', 'recebido_total', 'encerrado', 'concluido'].includes(status)) {
      continue;
    }
    const workOrderId = po.linkedWorkOrderId || poRec.workOrderId;
    const projectId = resolveProjectIdForRecord(
      po.projectId,
      workOrderId,
      poRec.contractId,
      orderById,
      singleProjectByContract,
    );
    if (!projectId || !projectById.has(projectId)) continue;

    const poTotal = Number(po.totalValue ?? poRec.totalAmount ?? 0);
    const alreadyInvoiced = payablesByPoId.get(po.id) || 0;
    const remainingCommitted = round2(Math.max(0, poTotal - alreadyInvoiced));
    if (remainingCommitted <= 0) continue;

    const key = buildCostFactIdempotencyKey(orgId, 'purchasing_order', po.id);
    pushFact({
      id: `cf_${key}`,
      orgId,
      projectId,
      unitId: poRec.unitId || projectById.get(projectId)?.unitId,
      contractId: projectById.get(projectId)?.contractId,
      workOrderId,
      source: 'purchasing_order',
      stage: 'comprometido',
      sourceId: po.id,
      idempotencyKey: key,
      occurredAt: po.emissionDate || po.createdAt,
      description: `OC Comprometida ${po.code || po.id} — ${po.supplierName || 'Fornecedor'}`,
      amount: remainingCommitted,
      createdByUid: po.buyerId || 'system',
      createdByName: po.buyerName || 'Compras',
      createdAt: po.createdAt,
    });
  }

  // 5. Realized Payables / Field Expenses from finance_payables
  for (const pay of inputs.payables || []) {
    if (pay.orgId !== orgId || pay.status === 'cancelado') continue;
    const rec = pay as unknown as Record<string, any>;
    const projectId = resolveProjectIdForRecord(
      pay.projectId,
      pay.workOrderId,
      pay.contractId,
      orderById,
      singleProjectByContract,
    );
    if (!projectId || !projectById.has(projectId)) continue;

    const amount = Number(pay.valor) || 0;
    if (amount <= 0) continue;

    const isPurchaseBacked = Boolean(pay.purchaseOrderId || pay.origem === 'oc');
    const source: CostFactSource = isPurchaseBacked ? 'purchasing_receipt' : 'finance_payable';
    const key = buildCostFactIdempotencyKey(orgId, source, pay.id);
    pushFact({
      id: `cf_${key}`,
      orgId,
      projectId,
      unitId: rec.unitId || projectById.get(projectId)?.unitId,
      contractId: pay.contractId || projectById.get(projectId)?.contractId,
      costCenterId: pay.centroCustoId,
      workOrderId: pay.workOrderId,
      source,
      stage: 'realizado',
      sourceId: pay.id,
      idempotencyKey: key,
      occurredAt: pay.vencimento || pay.createdAt || '',
      description: `${pay.fornecedor?.nome || 'Despesa'} — ${pay.documento || pay.id}`,
      amount: round2(amount),
      createdByUid: pay.createdBy || 'system',
      createdByName: pay.createdBy || 'Financeiro',
      createdAt: pay.createdAt || '',
    });
  }

  return {
    facts,
    unpricedLaborHoursByProject,
    unpricedStockCountByProject,
  };
}

export function computeProjectResultReport(inputs: ProjectCostLedgerInputs): ProjectResultReportSummary {
  const { orgId } = inputs;
  const projects = inputs.projects.filter((p) => p.orgId === orgId);
  const derived = deriveProjectCostLedger(inputs);

  const factsByProject = new Map<string, ProjectCostFact[]>();
  for (const f of derived.facts) {
    const list = factsByProject.get(f.projectId) || [];
    list.push(f);
    factsByProject.set(f.projectId, list);
  }

  const rows: ProjectResultRow[] = projects.map((project) => {
    const pFacts = factsByProject.get(project.id) || [];
    const baseline = project.budgetBaseline;
    const contractedRevenue = round2(baseline?.contractedRevenue || 0);
    const plannedDirectCost = round2(baseline?.plannedDirectCost || 0);

    let committedCost = 0;
    let realizedLaborCost = 0;
    let realizedMaterialCost = 0;
    let realizedPurchasingCost = 0;
    let realizedFieldExpenseCost = 0;

    for (const fact of pFacts) {
      if (fact.stage === 'comprometido') {
        committedCost = round2(committedCost + fact.amount);
        continue;
      }
      if (fact.source === 'labor_hh') {
        realizedLaborCost = round2(realizedLaborCost + fact.amount);
      } else if (fact.source === 'stock_consumption') {
        realizedMaterialCost = round2(realizedMaterialCost + fact.amount);
      } else if (fact.source === 'purchasing_receipt') {
        realizedPurchasingCost = round2(realizedPurchasingCost + fact.amount);
      } else {
        realizedFieldExpenseCost = round2(realizedFieldExpenseCost + fact.amount);
      }
    }

    const realizedTotalCost = round2(
      realizedLaborCost + realizedMaterialCost + realizedPurchasingCost + realizedFieldExpenseCost,
    );
    const projectedTotalCost = round2(realizedTotalCost + committedCost);
    const budgetVariance = round2(plannedDirectCost - projectedTotalCost);
    const grossMarginRealized = round2(contractedRevenue - realizedTotalCost);
    const grossMarginPercent =
      contractedRevenue > 0 ? round2((grossMarginRealized / contractedRevenue) * 100) : null;

    const unpricedLaborHours = derived.unpricedLaborHoursByProject.get(project.id) || 0;
    const unpricedStockMovementsCount = derived.unpricedStockCountByProject.get(project.id) || 0;
    const coverageWarnings: string[] = [];
    if (!baseline) coverageWarnings.push('Projeto sem orçamento-base (budgetBaseline) congelado.');
    if (unpricedLaborHours > 0) {
      coverageWarnings.push(`${unpricedLaborHours}h de apontamento HH sem custo horário definido.`);
    }
    if (unpricedStockMovementsCount > 0) {
      coverageWarnings.push(`${unpricedStockMovementsCount} saída(s) de estoque sem custo médio valorizado.`);
    }

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      status: project.status,
      contractId: project.contractId,
      unitId: project.unitId,
      hasBaseline: Boolean(baseline),
      contractedRevenue,
      plannedDirectCost,
      committedCost,
      realizedLaborCost,
      realizedMaterialCost,
      realizedPurchasingCost,
      realizedFieldExpenseCost,
      realizedTotalCost,
      projectedTotalCost,
      budgetVariance,
      grossMarginRealized,
      grossMarginPercent,
      unpricedLaborHours,
      unpricedStockMovementsCount,
      coverageWarnings,
      factCount: pFacts.length,
    };
  });

  rows.sort((a, b) => b.realizedTotalCost - a.realizedTotalCost || a.projectCode.localeCompare(b.projectCode));

  const totals = rows.reduce(
    (acc, r) => ({
      contractedRevenue: round2(acc.contractedRevenue + r.contractedRevenue),
      plannedDirectCost: round2(acc.plannedDirectCost + r.plannedDirectCost),
      committedCost: round2(acc.committedCost + r.committedCost),
      realizedLaborCost: round2(acc.realizedLaborCost + r.realizedLaborCost),
      realizedMaterialCost: round2(acc.realizedMaterialCost + r.realizedMaterialCost),
      realizedPurchasingCost: round2(acc.realizedPurchasingCost + r.realizedPurchasingCost),
      realizedFieldExpenseCost: round2(acc.realizedFieldExpenseCost + r.realizedFieldExpenseCost),
      realizedTotalCost: round2(acc.realizedTotalCost + r.realizedTotalCost),
      projectedTotalCost: round2(acc.projectedTotalCost + r.projectedTotalCost),
      grossMarginRealized: round2(acc.grossMarginRealized + r.grossMarginRealized),
      grossMarginPercent: null as number | null,
      unpricedLaborHours: round2(acc.unpricedLaborHours + r.unpricedLaborHours),
      unpricedStockMovementsCount: acc.unpricedStockMovementsCount + r.unpricedStockMovementsCount,
    }),
    {
      contractedRevenue: 0,
      plannedDirectCost: 0,
      committedCost: 0,
      realizedLaborCost: 0,
      realizedMaterialCost: 0,
      realizedPurchasingCost: 0,
      realizedFieldExpenseCost: 0,
      realizedTotalCost: 0,
      projectedTotalCost: 0,
      grossMarginRealized: 0,
      grossMarginPercent: null as number | null,
      unpricedLaborHours: 0,
      unpricedStockMovementsCount: 0,
    },
  );
  totals.grossMarginPercent =
    totals.contractedRevenue > 0
      ? round2((totals.grossMarginRealized / totals.contractedRevenue) * 100)
      : null;

  return { rows, totals };
}
