import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSafetyNextStatus,
  localSafetyDate,
  requiredSafetyControls,
  safetyPermitCode,
  validateSafetyOccurrenceInput,
  validateSafetyPermitInput,
} from '../src/services/safetyManagement';
import type { SafetyPermitInput, SafetyOccurrenceInput } from '../src/services/safetyManagement';

const validPermit: SafetyPermitInput = {
  unitId: 'unit_a',
  contractId: 'contract_a',
  documentType: 'apr',
  validFrom: '2026-11-25T07:00',
  validUntil: '2026-11-25T17:00',
  permitType: 'trabalho_a_quente',
  activityTitle: 'Soldagem TIG em tubulação inox',
  description: 'Execução de soldagem TIG em trecho isolado da linha de processo.',
  location: 'Planta industrial / Linha L-101',
  supervisorName: 'Encarregado de montagem',
  teamMembers: ['Soldador TIG', 'Ajudante'],
  risks: [{
    hazard: 'Projeção de fagulhas durante soldagem',
    consequence: 'Queimaduras ou princípio de incêndio',
    initialRisk: 'alto',
    controlMeasures: 'Isolar a área, remover combustíveis e manter extintor e vigia de fogo.',
    residualRisk: 'medio',
  }],
  controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true, fireWatch: true },
  emergencyPlan: 'Interromper o serviço, acionar o responsável da planta e utilizar os recursos de combate disponíveis.',
};

const validOccurrence: SafetyOccurrenceInput = {
  unitId: 'unit_a',
  incidentDate: '2026-11-25',
  category: 'quase_acidente',
  title: 'Queda de ferramenta próxima à equipe',
  description: 'Uma ferramenta caiu de uma plataforma e atingiu o piso próximo aos trabalhadores.',
  immediateAction: 'Área isolada e ferramentas conferidas antes da retomada.',
  urgency: 'alta',
};

test('validates an APR/PT for hot work with controls and risk assessment', () => {
  assert.deepEqual(validateSafetyPermitInput(validPermit), []);
  assert.equal(requiredSafetyControls('trabalho_a_quente').some((item) => item.key === 'fireWatch'), true);
  assert.equal(safetyPermitCode('apr', '2026-11-25', 'permit_abc12345'), 'APR-2026-ABC12345');
  assert.equal(safetyPermitCode('pt', '2026-11-25', 'permit_abc12345'), 'PT-2026-ABC12345');
});

test('accepts multiple separately described hazards in one APR', () => {
  const errors = validateSafetyPermitInput({
    ...validPermit,
    risks: [
      ...validPermit.risks,
      {
        hazard: 'Contato com superfície aquecida',
        consequence: 'Queimadura durante a atividade',
        initialRisk: 'medio',
        controlMeasures: 'Identificar e isolar a superfície até atingir temperatura segura.',
        residualRisk: 'baixo',
      },
    ],
  });
  assert.deepEqual(errors, []);
});

test('requires APR link for a PT and prevents linking an APR to another APR', () => {
  const missingLink = validateSafetyPermitInput({ ...validPermit, documentType: 'pt' });
  assert.ok(missingLink.some((message) => message.includes('APR aprovada')));
  const aprWithLink = validateSafetyPermitInput({ ...validPermit, relatedAprId: 'apr_123' });
  assert.ok(aprWithLink.some((message) => message.includes('não pode ser vinculada')));
  assert.deepEqual(validateSafetyPermitInput({ ...validPermit, documentType: 'pt', relatedAprId: 'apr_approved_01' }), []);
});

test('requires specialized controls for height, confined-space, electrical and lifting work', () => {
  const required = (type: Parameters<typeof requiredSafetyControls>[0]) =>
    requiredSafetyControls(type).map((item) => item.key);
  assert.ok(required('trabalho_em_altura').includes('anchorVerified'));
  assert.ok(required('espaco_confinado').includes('gasTest'));
  assert.ok(required('espaco_confinado').includes('rescuePlan'));
  assert.ok(required('eletrico').includes('zeroEnergyVerified'));
  assert.ok(required('icamento').includes('liftPlanReviewed'));
});

test('rejects permits with missing mandatory control, reversed validity or higher residual risk', () => {
  const missingControl = validateSafetyPermitInput({
    ...validPermit,
    controls: { ...validPermit.controls, fireWatch: false },
  });
  assert.ok(missingControl.some((message) => message.includes('vigia')));

  const reversed = validateSafetyPermitInput({
    ...validPermit,
    validFrom: '2026-11-25T17:00',
    validUntil: '2026-11-25T07:00',
  });
  assert.ok(reversed.some((message) => message.includes('posterior')));

  const higherResidual = validateSafetyPermitInput({
    ...validPermit,
    risks: [{ ...validPermit.risks[0], initialRisk: 'baixo', residualRisk: 'alto' }],
  });
  assert.ok(higherResidual.some((message) => message.includes('residual')));
});

test('rejects incomplete risk descriptions and duplicate team members', () => {
  const errors = validateSafetyPermitInput({
    ...validPermit,
    teamMembers: ['Soldador TIG', 'soldador tig'],
    risks: [{ ...validPermit.risks[0], controlMeasures: 'ok' }],
  });
  assert.ok(errors.some((message) => message.includes('duplicados')));
  assert.ok(errors.some((message) => message.includes('medidas de controle')));
});

test('validates SMS occurrences without requiring unnecessary personal health details', () => {
  assert.deepEqual(validateSafetyOccurrenceInput(validOccurrence), []);
  const errors = validateSafetyOccurrenceInput({
    ...validOccurrence,
    incidentDate: '2026-02-31',
    category: 'not_a_category' as SafetyOccurrenceInput['category'],
    description: 'curto',
  });
  assert.ok(errors.some((message) => message.includes('data válida')));
  assert.ok(errors.some((message) => message.includes('classificação')));
  assert.ok(errors.some((message) => message.includes('Descrição') || message.includes('Descreva')));
});

test('APR/PT status workflow does not allow approval or closure out of order', () => {
  assert.equal(getSafetyNextStatus('draft', 'submitted_for_approval'), 'awaiting_approval');
  assert.equal(getSafetyNextStatus('awaiting_approval', 'approved'), 'approved');
  assert.equal(getSafetyNextStatus('awaiting_approval', 'rejected'), 'rejected');
  assert.equal(getSafetyNextStatus('rejected', 'submitted_for_approval'), 'awaiting_approval');
  assert.equal(getSafetyNextStatus('approved', 'closed'), 'closed');
  assert.equal(getSafetyNextStatus('draft', 'approved'), null);
  assert.equal(getSafetyNextStatus('awaiting_approval', 'closed'), null);
  assert.equal(getSafetyNextStatus('closed', 'cancelled'), null);
});

test('local safety date and permit code are deterministic in their formats', () => {
  assert.match(localSafetyDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(safetyPermitCode(localSafetyDate(), 'abcdefghi'), /^PT-\d{4}-[A-Z0-9]{8}$/);
});
