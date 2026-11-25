export type CostFactSource =
  | 'labor_hh'
  | 'stock_consumption'
  | 'purchasing_order'
  | 'purchasing_receipt'
  | 'finance_payable'
  | 'field_expense'
  | 'manual_adjustment';

export type CostFactStage = 'comprometido' | 'realizado';

/**
 * Append-only ledger entry for realized or committed cost by Project/Obra.
 * Corrections are always recorded as reversal entries (`isReversal: true`) with negative `amount`.
 */
export interface ProjectCostFact {
  id: string;
  orgId: string;
  projectId: string;
  unitId?: string;
  contractId?: string;
  costCenterId?: string;
  workOrderId?: string;
  source: CostFactSource;
  stage: CostFactStage;
  sourceId: string;
  idempotencyKey: string;
  occurredAt: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  amount: number;
  isReversal?: boolean;
  reversedFactId?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export interface ProjectResultRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  status: string;
  contractId: string;
  unitId: string;
  hasBaseline: boolean;
  contractedRevenue: number;
  plannedDirectCost: number;
  committedCost: number;
  realizedLaborCost: number;
  realizedMaterialCost: number;
  realizedPurchasingCost: number;
  realizedFieldExpenseCost: number;
  realizedTotalCost: number;
  projectedTotalCost: number;
  budgetVariance: number;
  grossMarginRealized: number;
  grossMarginPercent: number | null;
  unpricedLaborHours: number;
  unpricedStockMovementsCount: number;
  coverageWarnings: string[];
  factCount: number;
}

export interface ProjectResultReportSummary {
  rows: ProjectResultRow[];
  totals: {
    contractedRevenue: number;
    plannedDirectCost: number;
    committedCost: number;
    realizedLaborCost: number;
    realizedMaterialCost: number;
    realizedPurchasingCost: number;
    realizedFieldExpenseCost: number;
    realizedTotalCost: number;
    projectedTotalCost: number;
    grossMarginRealized: number;
    grossMarginPercent: number | null;
    unpricedLaborHours: number;
    unpricedStockMovementsCount: number;
  };
}
