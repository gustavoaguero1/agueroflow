import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEmployeeSafetyCompliance,
  evaluateSafetyCrewCompliance,
  type SafetyComplianceSnapshot,
} from '../src/services/safetyCompliance';
import type { SafetyPermitType } from '../src/types/safety';

const today = '2026-11-25';
const employee = {
  id: 'emp_01', orgId: 'org_a', name: 'Soldador TIG', role: 'Soldador', active: true,
};
const ppe = {
  id: 'ppe_01', orgId: 'org_a', name: 'Cinto paraquedista', category: 'Cinto paraquedista',
  caNumber: 'CA-12345', caExpiresAt: '2027-11-25', requiredForPermitTypes: ['trabalho_em_altura'] as SafetyPermitType[],
  active: true, createdByUid: 'admin',
};
const movement = {
  id: 'movement_01', orgId: 'org_a', employeeId: employee.id, employeeName: employee.name,
  ppeId: ppe.id, ppeName: ppe.name, eventType: 'entregue' as const,
  movementDate: today, createdByUid: 'admin', createdAt: new Date('2026-11-25T08:00:00Z'),
};
const training = {
  id: 'training_01', orgId: 'org_a', employeeId: employee.id, employeeName: employee.name,
  trainingCode: 'NR-35', title: 'Trabalho em Altura', issueDate: '2026-01-01',
  expirationDate: '2027-01-01', createdByUid: 'admin',
};
const snapshot = (overrides: Partial<SafetyComplianceSnapshot> = {}): SafetyComplianceSnapshot => ({
  loading: false,
  employees: [employee],
  ppeCatalog: [ppe],
  ppeMovements: [movement],
  trainingCatalog: [],
  trainingRecords: [training],
  legacyTrainingRecords: [],
  ...overrides,
});

test('crew is compliant when RH, NR-35, delivered PPE and CA are valid', () => {
  assert.deepEqual(evaluateSafetyCrewCompliance(snapshot(), [employee.id], 'trabalho_em_altura', today), []);
});

test('missing employee blocks the PT and does not fall back to a typed name', () => {
  const blockers = evaluateSafetyCrewCompliance(snapshot(), ['not_in_rh'], 'trabalho_em_altura', today);
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].category, 'cadastro');
});

test('inactive or dismissed employee is blocked', () => {
  for (const person of [{ ...employee, active: false }, { ...employee, dismissalDate: '2026-10-31' }]) {
    const blockers = evaluateEmployeeSafetyCompliance(snapshot({ employees: [person] }), employee.id, 'trabalho_em_altura', today);
    assert.equal(blockers[0].message, 'Colaborador inativo ou desligado no RH.');
  }
});

test('missing, expired or future-issued NR blocks the activity', () => {
  const cases = [
    snapshot({ trainingRecords: [] }),
    snapshot({ trainingRecords: [{ ...training, expirationDate: '2026-11-24' }] }),
    snapshot({ trainingRecords: [{ ...training, issueDate: '2026-11-26' }] }),
  ];
  for (const item of cases) {
    assert.ok(evaluateEmployeeSafetyCompliance(item, employee.id, 'trabalho_em_altura', today)
      .some((blocker) => blocker.category === 'treinamento'));
  }
});

test('NR must remain valid through the final day of the planned activity', () => {
  const blockers = evaluateEmployeeSafetyCompliance(
    snapshot({ trainingRecords: [{ ...training, expirationDate: '2026-12-10' }] }),
    employee.id, 'trabalho_em_altura', '2026-12-01', '2026-12-15',
  );
  assert.ok(blockers.some((item) => item.category === 'treinamento' && item.message.includes('NR-35')));
});

test('EPI CA must remain valid through the final day of the planned activity', () => {
  const blockers = evaluateEmployeeSafetyCompliance(
    snapshot({ ppeCatalog: [{ ...ppe, caExpiresAt: '2026-12-10' }] }),
    employee.id, 'trabalho_em_altura', '2026-12-01', '2026-12-15',
  );
  assert.ok(blockers.some((item) => item.category === 'epi' && item.message.includes('CA ausente ou vencido')));
});

test('missing EPI configuration fails closed', () => {
  const blockers = evaluateEmployeeSafetyCompliance(snapshot({ ppeCatalog: [] }), employee.id, 'trabalho_em_altura', today);
  assert.ok(blockers.some((blocker) => blocker.category === 'epi' && blocker.message.includes('Nenhum EPI obrigatório')));
});

test('missing or expired CA blocks the employee even when PPE was delivered', () => {
  for (const invalidPpe of [
    { ...ppe, caNumber: '' },
    { ...ppe, caExpiresAt: '2026-11-24' },
  ]) {
    const blockers = evaluateEmployeeSafetyCompliance(snapshot({ ppeCatalog: [invalidPpe] }), employee.id, 'trabalho_em_altura', today);
    assert.ok(blockers.some((blocker) => blocker.message.includes('CA ausente ou vencido')));
  }
});

test('PPE returned after delivery no longer satisfies the requirement', () => {
  const returned = {
    ...movement, id: 'movement_02', eventType: 'devolvido' as const,
    referenceMovementId: movement.id, createdAt: new Date('2026-11-25T09:00:00Z'),
  };
  const blockers = evaluateEmployeeSafetyCompliance(snapshot({ ppeMovements: [movement, returned] }), employee.id, 'trabalho_em_altura', today);
  assert.ok(blockers.some((blocker) => blocker.category === 'epi' && blocker.message.includes('não consta como entregue')));
});

test('confined-space and electrical tasks require their activity-specific NR', () => {
  const confined = evaluateEmployeeSafetyCompliance(snapshot({ trainingRecords: [] }), employee.id, 'espaco_confinado', today);
  const electrical = evaluateEmployeeSafetyCompliance(snapshot({ trainingRecords: [] }), employee.id, 'eletrico', today);
  assert.ok(confined.some((item) => item.message.includes('NR-33')));
  assert.ok(electrical.some((item) => item.message.includes('NR-10')));
});

test('additional catalog requirements apply only to the selected activity', () => {
  const extended = snapshot({
    trainingCatalog: [{
      id: 'course_01', orgId: 'org_a', code: 'RIGGER', title: 'Sinaleiro e Amarrador',
      requiredForPermitTypes: ['icamento'], active: true, createdByUid: 'admin',
    }],
  });
  assert.equal(evaluateEmployeeSafetyCompliance(extended, employee.id, 'trabalho_em_altura', today)
    .some((item) => item.message.includes('RIGGER')), false);
  assert.ok(evaluateEmployeeSafetyCompliance(extended, employee.id, 'icamento', today)
    .some((item) => item.message.includes('RIGGER')));
});

test('loading and empty crews never authorize a permit', () => {
  assert.ok(evaluateSafetyCrewCompliance(snapshot({ loading: true }), [employee.id], 'trabalho_em_altura', today).length > 0);
  assert.ok(evaluateSafetyCrewCompliance(snapshot(), [], 'trabalho_em_altura', today).length > 0);
});
