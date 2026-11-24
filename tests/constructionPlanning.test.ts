import assert from 'node:assert/strict';
import testCase from 'node:test';
import {
  calculateWeightedPhysicalProgress,
  getConstructionScheduleStatus,
  validateMilestoneScheduleDates,
} from '../src/services/constructionPlanning';

testCase('calcula avanço físico ponderado sem distorcer pesos', () => {
  assert.equal(
    calculateWeightedPhysicalProgress([
      { weightPercentage: 30, completedPercentage: 50 },
      { weightPercentage: 70, completedPercentage: 100 },
    ]),
    85,
  );
});

testCase('retorna zero quando não há pesos válidos', () => {
  assert.equal(calculateWeightedPhysicalProgress([]), 0);
  assert.equal(
    calculateWeightedPhysicalProgress([
      { weightPercentage: 0, completedPercentage: 100 },
      { weightPercentage: -5, completedPercentage: 100 },
      { weightPercentage: Number.NaN, completedPercentage: 50 },
    ]),
    0,
  );
});

testCase('limita percentuais inválidos ao intervalo de 0 a 100', () => {
  assert.equal(
    calculateWeightedPhysicalProgress([
      { weightPercentage: 1, completedPercentage: 150 },
      { weightPercentage: 1, completedPercentage: -20 },
      { weightPercentage: 1, completedPercentage: Number.NaN },
    ]),
    33,
  );
});

testCase('marca etapa concluída mesmo que o prazo tenha passado', () => {
  assert.equal(
    getConstructionScheduleStatus(
      { completedPercentage: 100, targetDate: '2026-01-01' },
      '2026-11-24',
    ),
    'concluida',
  );
});

testCase('identifica etapa atrasada usando datas de calendário', () => {
  assert.equal(
    getConstructionScheduleStatus(
      { completedPercentage: 40, targetDate: '2026-11-23' },
      '2026-11-24',
    ),
    'atrasada',
  );
});

testCase('considera etapa no prazo quando o término previsto ainda não passou', () => {
  assert.equal(
    getConstructionScheduleStatus(
      { completedPercentage: 0, targetDate: '2026-11-24' },
      '2026-11-24',
    ),
    'no_prazo',
  );
});

testCase('não inventa situação de prazo quando a etapa não tem data válida', () => {
  assert.equal(
    getConstructionScheduleStatus({ completedPercentage: 10 }, '2026-11-24'),
    'sem_prazo',
  );
  assert.equal(
    getConstructionScheduleStatus({ targetDate: '2026-02-31' }, '2026-11-24'),
    'sem_prazo',
  );
});

testCase('aceita início e fim previstos em ordem cronológica', () => {
  assert.equal(validateMilestoneScheduleDates('2026-11-24', '2026-11-30'), null);
  assert.equal(validateMilestoneScheduleDates(undefined, '2026-11-30'), null);
});

testCase('rejeita datas inválidas e término anterior ao início', () => {
  assert.match(
    validateMilestoneScheduleDates('2026-12-01', '2026-11-30') || '',
    /não pode ser anterior/,
  );
  assert.match(
    validateMilestoneScheduleDates('2026-02-30', '2026-03-01') || '',
    /início é inválida/,
  );
  assert.match(
    validateMilestoneScheduleDates('2026-02-01', '2026-02-31') || '',
    /prazo previsto é inválido/,
  );
});
