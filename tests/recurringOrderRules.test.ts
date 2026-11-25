import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceRecurringRunDate,
  canExecuteRecurringOrder,
  canTransitionRecurringLifecycle,
  recurringRunId,
} from '../src/services/recurringOrderRules.ts';

test('recurringRunId gera chave determinística por empresa, plano e período', () => {
  const id1 = recurringRunId('org_a', 'rec_1', '2026-11-25');
  const id2 = recurringRunId('org_a', 'rec_1', '2026-11-25');
  const id3 = recurringRunId('org_a', 'rec_1', '2026-12-25');
  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
});

test('advanceRecurringRunDate avança corretamente e pula feriados/finais de semana configurados', () => {
  // 2026-11-25 (Wednesday) + semanal -> 2026-12-02
  assert.equal(advanceRecurringRunDate('2026-11-25', 'semanal'), '2026-12-02');
  // 2026-12-24 (Thursday) + diaria -> 2026-12-25 (feriado) -> 2026-12-26 (sábado) -> 2026-12-27 (domingo) -> 2026-12-28 (segunda)
  assert.equal(
    advanceRecurringRunDate('2026-12-24', 'diaria', {
      exceptionDates: ['2026-12-25'],
      skipWeekends: true,
    }),
    '2026-12-28',
  );
  assert.equal(advanceRecurringRunDate('2026-01-15', 'mensal'), '2026-02-15');
  assert.equal(advanceRecurringRunDate('2026-01-15', 'trimestral'), '2026-04-15');
});

test('canExecuteRecurringOrder rejeita planos pausados ou com default_unit', () => {
  assert.equal(canExecuteRecurringOrder({ active: false, unitId: 'u1', nextRunDate: '2026-11-25' }).allowed, false);
  assert.equal(canExecuteRecurringOrder({ active: true, unitId: 'default_unit', nextRunDate: '2026-11-25' }).allowed, false);
  assert.equal(canExecuteRecurringOrder({ active: true, unitId: 'u1', nextRunDate: '2026-11-25' }).allowed, true);
});

test('canTransitionRecurringLifecycle controla pausa, retomada e encerramento', () => {
  assert.equal(canTransitionRecurringLifecycle('ativa', 'pausada'), true);
  assert.equal(canTransitionRecurringLifecycle('pausada', 'ativa'), true);
  assert.equal(canTransitionRecurringLifecycle('encerrada', 'ativa'), false);
  assert.equal(canTransitionRecurringLifecycle('cancelada', 'ativa'), false);
});
