import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAssetAvailability,
  evaluateCollectiveAssetAvailability,
} from '../src/services/assetAvailabilityRules.ts';

test('evaluateAssetAvailability libera ativo operacional com calibração vigente', () => {
  const res = evaluateAssetAvailability(
    { id: 'a1', tag: 'EQ-01', name: 'Manômetro Digital', status: 'operacional', calibrationDueDate: '2027-01-15' },
    '2026-11-25T12:00:00.000Z',
  );
  assert.equal(res.available, true);
  assert.equal(res.blockers.length, 0);
});

test('evaluateAssetAvailability bloqueia ativo em manutenção ou com calibração vencida', () => {
  const maint = evaluateAssetAvailability(
    { id: 'a2', tag: 'EQ-02', name: 'Inversora TIG', status: 'em_manutencao' },
    '2026-11-25T12:00:00.000Z',
  );
  assert.equal(maint.available, false);
  assert.ok(maint.blockers[0].includes('manutenção'));

  const expired = evaluateAssetAvailability(
    { id: 'a3', tag: 'EQ-03', name: 'Medidor de Espessura US', status: 'operacional', calibrationDueDate: '2026-11-01' },
    '2026-11-25T12:00:00.000Z',
  );
  assert.equal(expired.available, false);
  assert.ok(expired.blockers[0].includes('calibração vencida'));
});

test('evaluateCollectiveAssetAvailability bloqueia bem coletivo baixado ou vencido', () => {
  const res = evaluateCollectiveAssetAvailability(
    { id: 'ca1', code: 'BC-10', description: 'Torquímetro', condition: 'ativo', nextCalibrationDate: '2026-10-01' },
    '2026-11-25T12:00:00.000Z',
  );
  assert.equal(res.available, false);
  assert.ok(res.blockers[0].includes('calibração vencida'));
});
