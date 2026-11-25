import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const payrollSource = readFileSync(new URL('../src/services/rhPayrollService.ts', import.meta.url), 'utf8');
const avosStart = payrollSource.indexOf('export function calculateThirteenthAvos(');
const avosEnd = payrollSource.indexOf('\n}', avosStart);
if (avosStart < 0 || avosEnd < 0) throw new Error('calculateThirteenthAvos not found in rhPayrollService.ts');
const avosFunction = payrollSource.slice(avosStart, avosEnd + 2);
const avosContext: Record<string, unknown> = {};
vm.createContext(avosContext);
vm.runInContext(avosFunction.replace('export function', 'function') + '\nthis.calculateThirteenthAvos = calculateThirteenthAvos;', avosContext);
const calculateThirteenthAvos = avosContext.calculateThirteenthAvos as (admission: string, year?: number, dismissal?: string | null) => number;

test('missing or invalid admission date never receives assumed 12/12 avos', () => {
  assert.equal(calculateThirteenthAvos('', 2026), 0);
  assert.equal(calculateThirteenthAvos('não é uma data', 2026), 0);
  assert.equal(calculateThirteenthAvos('2026-02-30', 2026), 0);
});

test('admission date uses the 15-day inclusive rule in the admission month', () => {
  assert.equal(calculateThirteenthAvos('2026-12-17', 2026), 1);
  assert.equal(calculateThirteenthAvos('2026-12-18', 2026), 0);
  assert.equal(calculateThirteenthAvos('2026-01-01', 2026), 12);
});

test('admission and dismissal in the same month count only actual days worked', () => {
  assert.equal(calculateThirteenthAvos('2026-05-01', 2026, '2026-05-15'), 1);
  assert.equal(calculateThirteenthAvos('2026-05-17', 2026, '2026-05-30'), 0);
});

test('dismissal month follows the 15-day rule for workers admitted in prior years', () => {
  assert.equal(calculateThirteenthAvos('2020-04-01', 2026, '2026-01-14'), 0);
  assert.equal(calculateThirteenthAvos('2020-04-01', 2026, '2026-01-15'), 1);
  assert.equal(calculateThirteenthAvos('2020-04-01', 2026, '2025-12-31'), 0);
});

test('admission after the reference year receives no avos', () => {
  assert.equal(calculateThirteenthAvos('2027-01-01', 2026), 0);
});
