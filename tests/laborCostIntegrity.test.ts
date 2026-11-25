import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLaborCost } from '../src/services/laborCostIntegrity.ts';

test('hours without an hourly rate are not valued with a sample/default amount', () => {
  const result = calculateLaborCost({ normalHours: 8, overtime50Hours: 2, mealAllowance: 35 });
  assert.equal(result.hourlyRate, null);
  assert.equal(result.baseSalaryCost, 0);
  assert.equal(result.overtime50Cost, 0);
  assert.equal(result.totalLaborCost, 35);
  assert.equal(result.unpricedHours, 10);
  assert.equal(result.hasMissingHourlyRate, true);
});

test('a valid logged rate takes precedence over employee master rate', () => {
  const result = calculateLaborCost({ logHourlyRate: 25, workerHourlyRate: 20, normalHours: 8, overtime50Hours: 2, overtime100Hours: 1, travelHours: 1, nightShiftHours: 2, mealAllowance: 30, overtime50Multiplier: 1.5, overtime100Multiplier: 2, travelHourMultiplier: 1, nightShiftBonusPercent: 20 });
  assert.equal(result.hourlyRate, 25);
  assert.equal(result.baseSalaryCost, 200);
  assert.equal(result.overtime50Cost, 75);
  assert.equal(result.overtime100Cost, 50);
  assert.equal(result.travelCost, 25);
  assert.equal(result.nightShiftCost, 10);
  assert.equal(result.totalLaborCost, 390);
  assert.equal(result.unpricedHours, 0);
});

test('employee rate is used only when the time log has no valid rate', () => {
  const result = calculateLaborCost({ logHourlyRate: 0, workerHourlyRate: 18.5, normalHours: 8 });
  assert.equal(result.hourlyRate, 18.5);
  assert.equal(result.totalLaborCost, 148);
});

test('a saved total remains the source amount when the hourly rate is missing, but is flagged as unclassified', () => {
  const result = calculateLaborCost({ normalHours: 8, recordedTotal: 410 });
  assert.equal(result.totalLaborCost, 410);
  assert.equal(result.unclassifiedRecordedCost, 410);
  assert.equal(result.unpricedHours, 8);
  assert.equal(result.hasMissingHourlyRate, true);
});
