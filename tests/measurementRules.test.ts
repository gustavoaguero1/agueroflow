import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceivableFromApprovedBulletin,
  canTransitionMeasurementStatus,
  computeBulletinTotals,
  receivableIdForBulletin,
} from '../src/services/measurementRules';
import type { MeasurementBulletin } from '../src/types/measurement';

test('computeBulletinTotals calculates measured, approved and glosa totals and requires glosa reason', () => {
  assert.throws(
    () =>
      computeBulletinTotals([
        { description: 'Solda inox', unit: 'M', measuredQuantity: 10, approvedQuantity: 8, unitPrice: 100 },
      ]),
    /motivo da glosa/i,
  );

  const res = computeBulletinTotals([
    {
      itemCode: 'LPU-01',
      description: 'Solda tubulação 2"',
      unit: 'M',
      measuredQuantity: 10,
      approvedQuantity: 8,
      unitPrice: 150,
      glosaReason: '2m aguardando ensaio LP',
    },
    {
      itemCode: 'LPU-02',
      description: 'Montagem suporte',
      unit: 'UN',
      measuredQuantity: 4,
      unitPrice: 250,
    },
  ]);

  assert.equal(res.totalMeasuredAmount, 2500);
  assert.equal(res.totalApprovedAmount, 2200);
  assert.equal(res.totalGlosaAmount, 300);
});

test('measurement status state machine enforces valid workflow and terminal states', () => {
  assert.equal(canTransitionMeasurementStatus('rascunho', 'enviado_aprovacao'), true);
  assert.equal(canTransitionMeasurementStatus('rascunho', 'aprovado'), false);
  assert.equal(canTransitionMeasurementStatus('enviado_aprovacao', 'aprovado'), true);
  assert.equal(canTransitionMeasurementStatus('enviado_aprovacao', 'aprovado_parcial'), true);
  assert.equal(canTransitionMeasurementStatus('enviado_aprovacao', 'devolvido'), true);
  assert.equal(canTransitionMeasurementStatus('devolvido', 'enviado_aprovacao'), true);
  assert.equal(canTransitionMeasurementStatus('aprovado', 'devolvido'), false);
  assert.equal(canTransitionMeasurementStatus('cancelado', 'enviado_aprovacao'), false);
});

test('buildReceivableFromApprovedBulletin creates deterministic FinanceReceivable with origem medicao', () => {
  const bulletin: MeasurementBulletin = {
    id: 'bm_123',
    orgId: 'org_a',
    code: 'BM-2026-001',
    number: 1,
    title: '1ª Medição',
    contractId: 'ct_1',
    projectId: 'prj_1',
    unitId: 'unit_1',
    clientName: 'Indústria Alfa',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    dueDate: '2026-12-30',
    status: 'aprovado',
    items: [],
    totalMeasuredAmount: 15000,
    totalApprovedAmount: 15000,
    totalGlosaAmount: 0,
    createdByUid: 'u_1',
    createdByName: 'Eng',
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
  };

  const recv = buildReceivableFromApprovedBulletin(bulletin, 'ger_1', '2026-11-25T12:00:00.000Z');
  assert.equal(recv.id, receivableIdForBulletin('org_a', 'bm_123'));
  assert.equal(recv.origem, 'medicao');
  assert.equal(recv.measurementBulletinId, 'bm_123');
  assert.equal(recv.contractId, 'ct_1');
  assert.equal(recv.projectId, 'prj_1');
  assert.equal(recv.valor, 15000);
  assert.equal(recv.saldoAberto, 15000);
  assert.equal(recv.status, 'aberto');
});
