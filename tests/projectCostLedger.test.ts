import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCostFactIdempotencyKey,
  computeProjectResultReport,
} from '../src/services/projectCostLedger';
import type { Project } from '../src/types/project';

const projectA: Project = {
  id: 'prj_1',
  orgId: 'org_a',
  code: 'OBRA-001',
  name: 'Montagem Tubulação Inox',
  status: 'em_execucao',
  contractId: 'ct_1',
  unitId: 'unit_1',
  budgetBaseline: {
    version: 1,
    frozenAt: '2026-11-01T00:00:00.000Z',
    frozenByUid: 'u_1',
    frozenByName: 'Comercial',
    plannedDirectCost: 50000,
    contractedRevenue: 80000,
    currency: 'BRL',
  },
  createdByUid: 'u_1',
  createdByName: 'Gestor',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

test('computeProjectResultReport consolidates HH, valued stock, open PO commitments, payables, and reversals without double counting', () => {
  const report = computeProjectResultReport({
    orgId: 'org_a',
    projects: [projectA],
    workOrders: [
      { id: 'os_1', orgId: 'org_a', unitId: 'unit_1', projectId: 'prj_1', contractId: 'ct_1' } as any,
    ],
    timeLogs: [
      { id: 'tl_1', orgId: 'org_a', workOrderId: 'os_1', totalHours: 10, hourlyRate: 120, workerName: 'João', date: '2026-11-10' } as any,
      { id: 'tl_2', orgId: 'org_a', workOrderId: 'os_1', totalHours: 4, workerName: 'Sem Taxa', date: '2026-11-11' } as any,
    ],
    stockMovements: [
      {
        id: 'mov_1',
        orgId: 'org_a',
        unitId: 'unit_1',
        orderId: 'os_1',
        itemId: 'item_1',
        itemSku: 'TB-304',
        itemName: 'Tubo 304',
        type: 'saida',
        quantity: 5,
        balanceAfter: 10,
        unitCost: 400,
        totalCost: 2000,
        reason: 'Aplicação em obra',
        createdBy: 'u_1',
        userName: 'Almox',
        createdAt: '2026-11-12T10:00:00.000Z',
      },
      {
        id: 'mov_uncosted',
        orgId: 'org_a',
        unitId: 'unit_1',
        orderId: 'os_1',
        itemId: 'item_2',
        itemSku: 'PAR-01',
        itemName: 'Parafuso',
        type: 'saida',
        quantity: 20,
        balanceAfter: 50,
        reason: 'Sem custo médio',
        createdBy: 'u_1',
        userName: 'Almox',
        createdAt: '2026-11-12T11:00:00.000Z',
      },
    ],
    purchaseOrders: [
      {
        id: 'po_1',
        organizationId: 'org_a',
        code: 'OC-100',
        projectId: 'prj_1',
        status: 'aprovada',
        totalValue: 10000,
        supplierName: 'Inox Brasil',
        buyerId: 'u_1',
        buyerName: 'Comprador',
        emissionDate: '2026-11-05',
        createdAt: '2026-11-05T10:00:00.000Z',
      } as any,
    ],
    payables: [
      // Partial invoice of R$ 3.000 against OC-100 -> remaining committed should be R$ 7.000 (zero double counting!)
      {
        id: 'pay_1',
        orgId: 'org_a',
        origem: 'oc',
        projectId: 'prj_1',
        purchaseOrderId: 'po_1',
        status: 'aberto',
        valor: 3000,
        vencimento: '2026-11-30',
        fornecedor: { nome: 'Inox Brasil' },
        documento: 'NF parcial OC-100',
        categoriaId: 'cat_1',
        createdBy: 'u_1',
        createdAt: '2026-11-15T10:00:00.000Z',
      } as any,
      // Field expense payable R$ 1.500
      {
        id: 'pay_2',
        orgId: 'org_a',
        origem: 'reembolso',
        workOrderId: 'os_1',
        status: 'pago',
        valor: 1500,
        vencimento: '2026-11-18',
        fornecedor: { nome: 'Hotel Campo' },
        documento: 'Hospedagem equipe',
        categoriaId: 'cat_2',
        createdBy: 'u_1',
        createdAt: '2026-11-18T10:00:00.000Z',
      } as any,
    ],
    persistedFacts: [
      // Reversal entry of -R$ 200
      {
        id: 'cf_rev_1',
        orgId: 'org_a',
        projectId: 'prj_1',
        source: 'field_expense',
        stage: 'realizado',
        sourceId: 'pay_2',
        idempotencyKey: buildCostFactIdempotencyKey('org_a', 'field_expense', 'pay_2', 'rev1'),
        occurredAt: '2026-11-19',
        description: 'Estorno parcial de hospedagem',
        amount: -200,
        isReversal: true,
        reversedFactId: 'pay_2',
        createdByUid: 'u_1',
        createdByName: 'Financeiro',
        createdAt: '2026-11-19T10:00:00.000Z',
      },
    ],
  });

  assert.equal(report.rows.length, 1);
  const row = report.rows[0];
  assert.equal(row.plannedDirectCost, 50000);
  assert.equal(row.contractedRevenue, 80000);
  assert.equal(row.committedCost, 7000); // 10000 - 3000 already invoiced
  assert.equal(row.realizedLaborCost, 1200); // 10h * 120
  assert.equal(row.realizedMaterialCost, 2000); // 5 * 400
  assert.equal(row.realizedPurchasingCost, 3000); // pay_1 (OC-backed)
  assert.equal(row.realizedFieldExpenseCost, 1300); // 1500 - 200 reversal
  assert.equal(row.realizedTotalCost, 7500); // 1200 + 2000 + 3000 + 1300
  assert.equal(row.projectedTotalCost, 14500); // 7500 + 7000
  assert.equal(row.budgetVariance, 35500); // 50000 - 14500
  assert.equal(row.grossMarginRealized, 72500); // 80000 - 7500
  assert.equal(row.grossMarginPercent, 90.63);
  assert.equal(row.unpricedLaborHours, 4);
  assert.equal(row.unpricedStockMovementsCount, 1);
  assert.equal(row.coverageWarnings.length, 2);
});
