import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistTemplate } from '../src/types';
import {
  assessChecklistCompletion,
  createInitialChecklistAnswers,
  validateChecklistSubmission,
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


test('server validation accepts zero as a numeric answer and derives conformity from the template', () => {
  const answers = createInitialChecklistAnswers(template);
  answers.sim.value = 'nao';
  answers.sim.conforme = true; // client-supplied flag is ignored
  answers.numero.value = '0';
  const result = validateChecklistSubmission(template, answers);
  assert.equal(result.canComplete, true);
  assert.equal(result.progressPercent, 67);
  assert.equal(result.nonConformityCount, 1);
  assert.equal(result.answers.sim.conforme, false);
  assert.equal(typeof result.answers.numero.value, 'number');
  assert.equal(result.answers.numero.value, 0);
});

test('server validation rejects missing required answers and unknown answer IDs', () => {
  const answers = createInitialChecklistAnswers(template);
  answers.sim.value = 'sim';
  const result = validateChecklistSubmission(template, { ...answers, unexpected: { value: 'x' } });
  assert.equal(result.canComplete, false);
  assert.ok(result.errors.some((error) => error.includes('Pressão')));
  assert.ok(result.errors.some((error) => error.includes('unexpected')));
});

test('server validation rejects malformed numeric and unsupported multiple-choice answers', () => {
  const numeric = validateChecklistSubmission(template, {
    sim: { value: 'sim' },
    numero: { value: 'não é número' },
  });
  assert.equal(numeric.canComplete, false);
  assert.ok(numeric.errors.some((error) => error.includes('número válido')));

  const multipleChoiceTemplate: ChecklistTemplate = {
    ...template,
    items: [{ id: 'choice', title: 'Material', type: 'multipla_escolha', options: ['inox', 'carbono'], required: true }],
  };
  const choice = validateChecklistSubmission(multipleChoiceTemplate, { choice: { value: 'alumínio' } });
  assert.equal(choice.canComplete, false);
  assert.ok(choice.errors.some((error) => error.includes('opção válida')));
});

test('server validation reconstructs title and answer type from the saved template', () => {
  const answers = createInitialChecklistAnswers(template);
  answers.sim = { itemId: 'sim', itemTitle: 'Título inventado', type: 'texto', value: 'sim', conforme: true };
  answers.numero.value = '12';
  const result = validateChecklistSubmission(template, answers);
  assert.equal(result.canComplete, true);
  assert.equal(result.answers.sim.itemTitle, 'Proteção instalada');
  assert.equal(result.answers.sim.type, 'sim_nao');
});

test('server validation accepts compressed inline image and signature data URLs and rejects invalid data URIs', () => {
  const mediaTemplate: ChecklistTemplate = {
    ...template,
    items: [
      { id: 'foto', title: 'Foto da válvula', type: 'foto', required: true },
      { id: 'ass', title: 'Assinatura do técnico', type: 'assinatura', required: true },
    ],
  };

  const valid = validateChecklistSubmission(mediaTemplate, {
    foto: { value: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/' },
    ass: { value: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
  });
  assert.equal(valid.canComplete, true);
  assert.equal(valid.answeredCount, 2);

  const invalidType = validateChecklistSubmission(mediaTemplate, {
    foto: { value: 'data:text/html;base64,PHNjcmlwdD4=' },
    ass: { value: 'https://storage.example.com/sig.png' },
  });
  assert.equal(invalidType.canComplete, false);
  assert.ok(invalidType.errors.some((e) => e.includes('Foto da válvula')));
});

