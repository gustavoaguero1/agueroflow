import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getQualityRecordStatus,
  localQualityDate,
  qualityEventLabel,
  qualityInitialEvent,
  qualityRecordTypeLabel,
  qualityStatusLabel,
  validateQualityRecordInput,
} from '../src/services/qualityCommissioning';
import type { QualityRecordInput } from '../src/services/qualityCommissioning';

const inspection: QualityRecordInput = {
  recordDate: '2026-11-24',
  recordType: 'visual_inspection',
  title: 'Inspeção visual da linha',
  description: 'Inspeção da linha de processo após montagem.',
  result: 'conforme',
  acceptanceCriteria: 'Sem trincas, poros, respingos ou descontinuidades visíveis.',
};

test('validates the minimum data for an industrial inspection', () => {
  assert.deepEqual(validateQualityRecordInput(inspection), []);
  assert.equal(qualityInitialEvent('visual_inspection'), 'submitted_for_review');
});

test('requires measurable evidence and unit for functional tests', () => {
  const errors = validateQualityRecordInput({
    ...inspection,
    recordType: 'functional_test',
    measuredValue: undefined,
    measuredUnit: '',
  });
  assert.ok(errors.some((message) => message.includes('valor medido')));
  assert.ok(errors.some((message) => message.includes('unidade do valor medido')));
});

test('requires pressure, medium and observation time for hydrostatic testing', () => {
  const valid = validateQualityRecordInput({
    ...inspection,
    recordType: 'hydrostatic_test',
    measuredValue: 10,
    measuredUnit: 'bar',
    testMedium: 'Água',
    holdDurationMinutes: 60,
  });
  assert.deepEqual(valid, []);

  const invalid = validateQualityRecordInput({
    ...inspection,
    recordType: 'hydrostatic_test',
    measuredValue: 0,
    measuredUnit: '',
    testMedium: '',
    holdDurationMinutes: 0,
  });
  assert.ok(invalid.some((message) => message.includes('fluido')));
  assert.ok(invalid.some((message) => message.includes('tempo de estabilização')));
  assert.ok(invalid.some((message) => message.includes('unidade do valor medido')));
});

test('requires responsible person, due date and severity for punch list and nonconformities', () => {
  const base: QualityRecordInput = {
    ...inspection,
    recordType: 'punch_item',
    result: 'nao_conforme',
    severity: 'alta',
    responsibleName: 'Encarregado de montagem',
    dueDate: '2026-11-28',
  };
  assert.deepEqual(validateQualityRecordInput(base), []);
  const errors = validateQualityRecordInput({ ...base, responsibleName: '', dueDate: '', severity: undefined });
  assert.ok(errors.some((message) => message.includes('criticidade')));
  assert.ok(errors.some((message) => message.includes('responsável')));
  assert.ok(errors.some((message) => message.includes('prazo')));
  assert.equal(qualityInitialEvent('punch_item'), 'opened');
});

test('rejects impossible dates and oversized technical descriptions', () => {
  const errors = validateQualityRecordInput({
    ...inspection,
    recordDate: '2026-02-31',
    title: 'xy',
    description: 'ok',
    acceptanceCriteria: 'x'.repeat(501),
  });
  assert.ok(errors.some((message) => message.includes('data válida')));
  assert.ok(errors.some((message) => message.includes('título')));
  assert.ok(errors.some((message) => message.includes('descrição')));
  assert.ok(errors.some((message) => message.includes('critério de aceitação')));
});

test('maps the quality event timeline to clear statuses and labels', () => {
  assert.equal(getQualityRecordStatus('submitted_for_review'), 'review_pending');
  assert.equal(getQualityRecordStatus('opened'), 'open');
  assert.equal(getQualityRecordStatus('rejected'), 'rejected');
  assert.equal(getQualityRecordStatus('corrective_action_submitted'), 'correction_pending_verification');
  assert.equal(getQualityRecordStatus('approved'), 'approved');
  assert.equal(getQualityRecordStatus('verified'), 'verified');
  assert.equal(getQualityRecordStatus('closed'), 'closed');
  assert.equal(getQualityRecordStatus('reopened'), 'reopened');
  assert.equal(qualityStatusLabel('approved'), 'Aprovada');
  assert.equal(qualityEventLabel('corrective_action_submitted'), 'Ação corretiva enviada para verificação');
  assert.equal(qualityRecordTypeLabel('hydrostatic_test'), 'Teste hidrostático');
});

test('local quality date uses local calendar components', () => {
  assert.match(localQualityDate(), /^\d{4}-\d{2}-\d{2}$/);
});
