import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardDataCoverage } from '../src/services/dashboardCoverageRules.ts';

test('computeDashboardDataCoverage separa previsto, comprometido, realizado, medido, faturado e recebido e alerta lacunas', () => {
  const report = computeDashboardDataCoverage({
    orgId: 'org_a',
    projects: [
      { id: 'p1', orgId: 'org_a', code: 'OB-01', name: 'Obra 1', unitId: 'u1', contractId: 'c1', status: 'em_execucao', plannedCost: 50000, createdAt: '', updatedAt: '' } as any,
    ],
    workOrders: [
      { id: 'wo1', orgId: 'org_a', unitId: 'u1', projectId: 'p1', orderNumber: 'OS-1', title: 'A', description: '', priority: 'media', status: 'aberto', createdAt: '', updatedAt: '' },
      { id: 'wo2', orgId: 'org_a', unitId: 'u1', orderNumber: 'OS-2', title: 'B', description: '', priority: 'alta', status: 'aberto', createdAt: '', updatedAt: '' },
    ],
    timeLogs: [
      { id: 'tl1', orgId: 'org_a', totalHours: 10, hourlyRate: 100 } as any,
      { id: 'tl2', orgId: 'org_a', totalHours: 5 } as any,
    ],
    stockMovements: [
      { id: 'm1', orgId: 'org_a', type: 'saida', quantity: 2, unitCost: 250, totalCost: 500 } as any,
      { id: 'm2', orgId: 'org_a', type: 'saida', quantity: 3 } as any,
    ],
    purchaseOrders: [
      { id: 'po1', organizationId: 'org_a', status: 'emitida', totalValue: 12000 } as any,
    ],
    bulletins: [
      { id: 'bm1', orgId: 'org_a', status: 'aprovado', totalMeasuredAmount: 30000, totalApprovedAmount: 28000 } as any,
      { id: 'bm2', orgId: 'org_a', status: 'enviado_aprovacao', totalMeasuredAmount: 10000, totalApprovedAmount: 0 } as any,
    ],
    receivables: [
      { id: 'r1', orgId: 'org_a', status: 'parcial', valor: 28000, valorRecebido: 14000 } as any,
    ],
    recurringOrders: [
      { id: 'rec1', orgId: 'org_a', lastRunError: 'Ativo bloqueado' } as any,
    ],
  });

  assert.equal(report.workOrdersWithProjectPct, 50);
  assert.equal(report.unpricedLaborHours, 5);
  assert.equal(report.unpricedStockExitsCount, 1);
  assert.equal(report.failedRecurringPlansCount, 1);
  assert.equal(report.pendingApprovalBulletinsCount, 1);
  assert.equal(report.economic.previstoOrcado, 50000);
  assert.equal(report.economic.comprometidoAberto, 12000);
  assert.equal(report.economic.realizadoConhecido, 1500);
  assert.equal(report.economic.medidoTotal, 40000);
  assert.equal(report.economic.aprovadoMedicao, 28000);
  assert.equal(report.economic.faturadoReceber, 28000);
  assert.equal(report.economic.recebidoCaixa, 14000);
  assert.equal(report.alerts.length, 5);
});
