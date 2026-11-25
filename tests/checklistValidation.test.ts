import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistTemplate } from '../src/types';
import {
  assessChecklistCompletion,
  createInitialChecklistAnswers,
} from '../src/services/checklistValidation.ts';

const template: ChecklistTemplate = {
  id: 'tpl_1',
  orgId: 'org_1',
  title: 'Checklist de teste',
  description: '',
  category: 'Operações',
  items: [
    { id: 'sim', title: 'Proteção instalada', type: 'sim_nao', required: true },
    { id: 'numero', title: 'Pressão', type: 'numerico', required: true },
    { id: 'nota', title: 'Observação', type: 'texto', required: false },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test('initial answers remain blank and do not imply conformity', () => {
  const answers = createInitialChecklistAnswers(template);
  assert.equal(answers.sim.value, '');
  assert.equal(answers.sim.conforme, undefined);
  assert.equal(answers.numero.value, '');
});

test('required unanswered items block completion', () => {
  const result = assessChecklistCompletion(template, createInitialChecklistAnswers(template));
  assert.equal(result.canComplete, false);
  assert.deepEqual(result.missingRequired, ['Proteção instalada', 'Pressão']);
  assert.equal(result.progressPercent, 0);
});

test('zero is a valid numeric answer and optional blank items do not block completion', () => {
  const answers = createInitialChecklistAnswers(template);
  answers.sim.value = 'sim';
  answers.sim.conforme = true;
  answers.numero.value = '0';
  const result = assessChecklistCompletion(template, answers);
  assert.equal(result.canComplete, true);
  assert.equal(result.progressPercent, 67);
  assert.equal(result.missingRequired.length, 0);
});

test('negative answers are counted as non-conformities without blocking a completed record', () => {
  const answers = createInitialChecklistAnswers(template);
  answers.sim.value = 'nao';
  answers.sim.conforme = false;
  answers.numero.value = '18';
  const result = assessChecklistCompletion(template, answers);
  assert.equal(result.canComplete, true);
  assert.equal(result.nonConformityCount, 1);
});

test('empty templates cannot be concluded', () => {
  const empty = { ...template, items: [] };
  const result = assessChecklistCompletion(empty, {});
  assert.equal(result.canComplete, false);
  assert.equal(result.progressPercent, 0);
});
