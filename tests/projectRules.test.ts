import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectId,
  buildProjectRecord,
  validateBudgetBaseline,
  validateProjectInput,
  validateProjectUpdatePatch,
} from '../src/services/projectRules.ts';

test('buildProjectRecord creates normalized master Project with contract, unit and optional costCenter', () => {
  const project = buildProjectRecord(
    {
      orgId: 'org_a',
      code: 'obra-2026-01',
      name: 'Montagem de Tubulação Inox',
      unitId: 'unit_norte',
      contractId: 'ct_100',
      costCenterId: 'cc_montagem',
      clientName: 'Cliente Industrial',
      disciplines: ['tubulacao', 'caldeiraria', 'tubulacao'],
      plannedStartDate: '2026-04-01',
      plannedEndDate: '2026-08-30',
      createdByUid: 'u1',
      createdByName: 'Engenheiro Responsável',
    },
    '2026-03-01T10:00:00.000Z',
  );

  assert.equal(project.code, 'OBRA-2026-01');
  assert.equal(project.status, 'planejamento');
  assert.equal(project.unitId, 'unit_norte');
  assert.equal(project.contractId, 'ct_100');
  assert.equal(project.costCenterId, 'cc_montagem');
  assert.deepEqual(project.disciplines, ['tubulacao', 'caldeiraria']);
  assert.ok(project.id.startsWith('prj_org_a_OBRA-2026-01_'));
});

test('validateProjectInput rejects default_unit, missing contract, invalid code, and inverted dates', () => {
  const errors = validateProjectInput({
    orgId: 'org_a',
    code: 'X',
    name: 'AB',
    unitId: 'default_unit',
    contractId: '',
    plannedStartDate: '2026-10-01',
    plannedEndDate: '2026-09-01',
    createdByUid: '',
    createdByName: '',
  });

  assert.ok(errors.some((e) => e.includes('default_unit')));
  assert.ok(errors.some((e) => e.includes('contrato')));
  assert.ok(errors.some((e) => e.includes('Código')));
  assert.ok(errors.some((e) => e.includes('Nome')));
  assert.ok(errors.some((e) => e.includes('anterior ao início')));
  assert.ok(errors.some((e) => e.includes('Autor autenticado')));
});

test('validateBudgetBaseline rejects negative costs and accepts valid frozen baseline', () => {
  const bad = validateBudgetBaseline({
    version: 0,
    frozenAt: 'not-a-date',
    frozenByUid: '',
    frozenByName: '',
    plannedDirectCost: -10,
    contractedRevenue: -5,
    currency: '',
  });
  assert.ok(bad.length >= 4);

  const ok = validateBudgetBaseline({
    version: 1,
    frozenAt: '2026-03-01T12:00:00.000Z',
    frozenByUid: 'u1',
    frozenByName: 'Diretor Comercial',
    sourceProposalId: 'prop_1',
    plannedDirectCost: 120000,
    plannedLaborCost: 60000,
    plannedMaterialCost: 60000,
    contractedRevenue: 185000,
    currency: 'BRL',
  });
  assert.deepEqual(ok, []);
});

test('validateProjectUpdatePatch rejects default_unit and inverted actual dates while allowing valid status changes', () => {
  const existing = {
    plannedStartDate: '2026-04-01',
    plannedEndDate: '2026-08-30',
    actualStartDate: '2026-04-05',
  };

  assert.ok(validateProjectUpdatePatch(existing, { unitId: 'default_unit' }).length > 0);
  assert.ok(validateProjectUpdatePatch(existing, { actualEndDate: '2026-04-01' }).length > 0);
  assert.deepEqual(
    validateProjectUpdatePatch(existing, { status: 'em_execucao', costCenterId: null }),
    [],
  );
  assert.ok(buildProjectId('org_a', 'OBRA/01', 'fix').startsWith('prj_org_a_OBRA_01_fix'));
});
