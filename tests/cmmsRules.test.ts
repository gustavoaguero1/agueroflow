import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cmmsTriggerKey,
  computeAssetReliabilityKpis,
  isCmmsPlanDue,
} from '../src/services/cmmsRules.ts';

test('cmmsTriggerKey é determinístico e isCmmsPlanDue avalia calendário e horímetro', () => {
  assert.equal(cmmsTriggerKey('org_a', 'p1', '2026-11-25'), cmmsTriggerKey('org_a', 'p1', '2026-11-25'));
  assert.equal(
    isCmmsPlanDue({ active: true, triggerType: 'calendario', nextDueDate: '2026-11-20' }, { todayIso: '2026-11-25' }).due,
    true,
  );
  assert.equal(
    isCmmsPlanDue({ active: true, triggerType: 'horimetro', nextDueHourmeter: 500 }, { todayIso: '2026-11-25', currentHourmeter: 520 }).due,
    true,
  );
  assert.equal(
    isCmmsPlanDue({ active: false, triggerType: 'horimetro', nextDueHourmeter: 500 }, { todayIso: '2026-11-25', currentHourmeter: 600 }).due,
    false,
  );
});

test('computeAssetReliabilityKpis só calcula MTBF quando há dados reais suficientes (>= 2 falhas corretivas)', () => {
  const insuff = computeAssetReliabilityKpis({
    assetId: 'a1',
    operatingWindowHours: 720,
    records: [
      { id: 'r1', orgId: 'org_a', assetId: 'a1', assetTag: 'EQ-1', unitId: 'u1', type: 'corretiva', downtimeHours: 4, laborHours: 4, partsCost: 0, laborCost: 0, performedAt: '2026-11-10', createdByUid: 'u', createdByName: 'u', createdAt: '' },
    ],
  });
  assert.equal(insuff.sufficientData, false);
  assert.equal(insuff.mtbfHours, null);

  const ok = computeAssetReliabilityKpis({
    assetId: 'a1',
    operatingWindowHours: 720,
    records: [
      { id: 'r1', orgId: 'org_a', assetId: 'a1', assetTag: 'EQ-1', unitId: 'u1', type: 'corretiva', downtimeHours: 10, laborHours: 8, partsCost: 100, laborCost: 400, performedAt: '2026-11-05', createdByUid: 'u', createdByName: 'u', createdAt: '' },
      { id: 'r2', orgId: 'org_a', assetId: 'a1', assetTag: 'EQ-1', unitId: 'u1', type: 'corretiva', downtimeHours: 10, laborHours: 8, partsCost: 200, laborCost: 400, performedAt: '2026-11-20', createdByUid: 'u', createdByName: 'u', createdAt: '' },
    ],
  });
  assert.equal(ok.sufficientData, true);
  assert.equal(ok.mtbfHours, 350);
  assert.equal(ok.mttrHours, 10);
  assert.equal(ok.availabilityPct, 97.22);
});
