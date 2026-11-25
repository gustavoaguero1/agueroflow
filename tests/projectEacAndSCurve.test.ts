import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProjectEac, computeProjectSCurve } from '../src/services/projectEacAndSCurve.ts';

test('computeProjectEac usa método CPI quando avanço físico >= 10% e método conservador abaixo disso', () => {
  const cpiRes = computeProjectEac({
    projectId: 'p1',
    baselineBudget: 100000,
    committedOpen: 10000,
    realizedToDate: 60000,
    physicalProgressPct: 50, // EV = 50000, CPI = 0.83 -> EAC ~ 120481.93
  });
  assert.equal(cpiRes.methodUsed, 'cpi_avanco_fisico');
  assert.equal(cpiRes.cpi, 0.83);
  assert.ok(cpiRes.eacProjectedCost > 120000);
  assert.ok(cpiRes.varianceAtCompletion < 0);

  const cons = computeProjectEac({
    projectId: 'p2',
    baselineBudget: 100000,
    committedOpen: 20000,
    realizedToDate: 5000,
    physicalProgressPct: 5,
  });
  assert.equal(cons.methodUsed, 'comprometido_mais_realizado');
  assert.equal(cons.eacProjectedCost, 100000);
});

test('computeProjectSCurve separa baseline, realizado e medição aprovada mês a mês', () => {
  const curve = computeProjectSCurve({
    project: {
      id: 'p1',
      orgId: 'org_a',
      code: 'OB-01',
      name: 'Obra',
      unitId: 'u1',
      contractId: 'c1',
      status: 'em_execucao',
      plannedStartDate: '2026-10-01',
      plannedEndDate: '2026-11-30',
      budgetBaseline: { version: 1, frozenAt: '', frozenByUid: 'u1', frozenByName: 'A', contractedRevenue: 130000, plannedDirectCost: 80000, plannedIndirectCost: 20000, currency: 'BRL' },
      createdByUid: 'u1',
      createdByName: 'A',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    },
    realizedFacts: [
      { id: 'f1', orgId: 'org_a', projectId: 'p1', source: 'labor_hh', stage: 'realizado', sourceId: 's1', idempotencyKey: 'k1', occurredAt: '2026-10-15', description: 'HH', amount: 30000, createdByUid: 'u1', createdByName: 'A', createdAt: '2026-10-15' },
      { id: 'f2', orgId: 'org_a', projectId: 'p1', source: 'stock_consumption', stage: 'realizado', sourceId: 's2', idempotencyKey: 'k2', occurredAt: '2026-11-10', description: 'Mat', amount: 25000, createdByUid: 'u1', createdByName: 'A', createdAt: '2026-11-10' },
    ],
    approvedBulletins: [
      { id: 'bm1', orgId: 'org_a', projectId: 'p1', status: 'aprovado', periodEnd: '2026-10-31', totalApprovedAmount: 45000 } as any,
      { id: 'bm2', orgId: 'org_a', projectId: 'p1', status: 'enviado_aprovacao', periodEnd: '2026-11-25', totalApprovedAmount: 50000 } as any, // não aprovado -> não entra como receita aprovada!
    ],
  });

  assert.equal(curve.length, 2);
  assert.equal(curve[0].month, '2026-10');
  assert.equal(curve[0].plannedCumulative, 50000);
  assert.equal(curve[0].realizedCumulative, 30000);
  assert.equal(curve[0].approvedMeasurementCumulative, 45000);
  assert.equal(curve[1].month, '2026-11');
  assert.equal(curve[1].plannedCumulative, 100000);
  assert.equal(curve[1].realizedCumulative, 55000);
  assert.equal(curve[1].approvedMeasurementCumulative, 45000);
});
