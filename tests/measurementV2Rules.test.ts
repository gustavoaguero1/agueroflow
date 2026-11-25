import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceivableFromApprovedBulletin,
  computeBulletinFinancialAdjustments,
  normalizeMeasurementLine,
} from '../src/services/measurementRules.ts';
import type { MeasurementBulletin } from '../src/types/measurement.ts';

test('computeBulletinFinancialAdjustments aplica reajuste e retenção contratual corretamente', () => {
  const adj = computeBulletinFinancialAdjustments({
    totalApprovedAmount: 100000,
    readjustmentPercent: 5,
    retentionPercent: 10,
  });
  // 100000 + 5% = 105000; 10% retention = 10500; net = 94500
  assert.equal(adj.readjustmentAmount, 5000);
  assert.equal(adj.retentionAmount, 10500);
  assert.equal(adj.netApprovedReceivableAmount, 94500);
});

test('buildReceivableFromApprovedBulletin gera título pelo valor líquido após reajuste e retenção', () => {
  const bm: MeasurementBulletin = {
    id: 'bm_v2_1',
    orgId: 'org_a',
    code: 'BM-2026-010',
    number: 10,
    revision: 2,
    title: 'Medição Tubulação',
    contractId: 'ct_1',
    projectId: 'prj_1',
    unitId: 'u_1',
    clientName: 'Cliente Industrial',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    dueDate: '2026-12-30',
    status: 'aprovado',
    items: [],
    totalMeasuredAmount: 100000,
    totalApprovedAmount: 100000,
    totalGlosaAmount: 0,
    readjustmentPercent: 5,
    retentionPercent: 10,
    createdByUid: 'u1',
    createdByName: 'Eng',
    createdAt: '',
    updatedAt: '',
  };
  const recv = buildReceivableFromApprovedBulletin(bm, 'u_fin', '2026-11-30T12:00:00Z');
  assert.equal(recv.valor, 94500);
  assert.equal(recv.saldoAberto, 94500);
  assert.match(recv.notes || '', /Retenção\/Caução/);
});

test('normalizeMeasurementLine preserva referências de OS, etapa e evidência documental', () => {
  const line = normalizeMeasurementLine(
    {
      description: 'Soldagem linha sanitária 2"',
      unit: 'm',
      measuredQuantity: 25,
      unitPrice: 400,
      workOrderId: 'os_10',
      stageName: 'Montagem Trecho A',
      evidenceDocRef: 'RDO-2026-11-20',
    },
    0,
  );
  assert.equal(line.workOrderId, 'os_10');
  assert.equal(line.stageName, 'Montagem Trecho A');
  assert.equal(line.evidenceDocRef, 'RDO-2026-11-20');
});
