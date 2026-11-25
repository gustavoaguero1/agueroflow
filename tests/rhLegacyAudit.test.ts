import test from 'node:test';
import assert from 'node:assert/strict';
import type { FieldWorker } from '../src/types/index.ts';
import type { RhEmployee } from '../src/types/rhPayroll.ts';
import {
  buildRhLegacyAuditReport,
  formatRhLegacyAuditCsv,
  isValidIsoDate,
  normalizePersonName,
} from '../src/services/rhLegacyAudit.ts';

function makeEmployee(overrides: Partial<RhEmployee> = {}): RhEmployee {
  return {
    id: 'emp_1',
    orgId: 'org_a',
    codigoObra: 'OBRA-10',
    registrationNumber: 'OBRA-10',
    name: 'Carlos Henrique Souza',
    admissionDate: '2024-03-10',
    active: true,
    department: 'Caldeiraria',
    role: 'Caldeireiro',
    companyName: 'Empresa A',
    unitId: 'unit_1',
    hourlyRateCarteira: 25,
    hourlyRatePorFora: 0,
    monthlyHours: 220,
    baseSalaryCarteira: 5500,
    baseSalaryPorFora: 0,
    createdAt: '2024-03-10T00:00:00.000Z',
    updatedAt: '2024-03-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeFieldWorker(overrides: Partial<FieldWorker> = {}): FieldWorker {
  return {
    id: 'fw_1',
    orgId: 'org_a',
    rhEmployeeId: 'emp_1',
    name: 'Carlos Henrique Souza',
    cpf: '123.456.789-01',
    role: 'Caldeireiro',
    baseSalary: 5500,
    hourlyRate: 25,
    currentSite: 'Obra OBRA-10',
    status: 'ativo',
    admissionDate: '2024-03-10',
    createdAt: '2024-03-10T00:00:00.000Z',
    updatedAt: '2024-03-10T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizePersonName and isValidIsoDate handle accents, whitespace and calendar dates', () => {
  assert.equal(normalizePersonName('  José   Álvaro  da Silva! '), 'jose alvaro da silva');
  assert.equal(isValidIsoDate('2025-02-28'), true);
  assert.equal(isValidIsoDate('2025-02-30'), false);
  assert.equal(isValidIsoDate(''), false);
  assert.equal(isValidIsoDate('15/03/2025'), false);
});

test('clean organization returns zero issues and isClean = true', () => {
  const emp = makeEmployee();
  const fw = makeFieldWorker();
  const report = buildRhLegacyAuditReport({
    orgId: 'org_a',
    employees: [emp],
    fieldWorkers: [fw],
    generatedAt: '2026-11-25T12:00:00.000Z',
  });

  assert.equal(report.summary.isClean, true);
  assert.equal(report.summary.totalIssues, 0);
  assert.equal(report.employeePendencies.length, 0);
  assert.equal(report.unlinkedFieldWorkers.length, 0);
  assert.equal(report.possibleDuplicates.length, 0);
});

test('flags RH employees missing mandatory fields without fabricating values', () => {
  const incomplete = makeEmployee({
    id: 'emp_incomplete',
    name: 'Marcos Silva',
    admissionDate: '',
    codigoObra: '',
    registrationNumber: '',
    role: '',
    department: '',
    unitId: null,
    hourlyRateCarteira: 0,
    hourlyRatePorFora: 0,
    baseSalaryCarteira: 0,
    baseSalaryPorFora: 0,
  });
  const missingOnlyUnit = makeEmployee({
    id: 'emp_no_unit',
    name: 'Pedro Alves',
    unitId: null,
  });

  const report = buildRhLegacyAuditReport({
    orgId: 'org_a',
    employees: [incomplete, missingOnlyUnit],
    fieldWorkers: [],
    generatedAt: '2026-11-25T12:00:00.000Z',
  });

  assert.equal(report.summary.employeesWithPendencies, 2);
  assert.equal(report.summary.criticalEmployeePendencies, 1);
  const crit = report.employeePendencies.find((p) => p.employeeId === 'emp_incomplete');
  assert.ok(crit);
  assert.equal(crit.severity, 'critica');
  assert.deepEqual(crit.missingFields, [
    'admissionDate',
    'registrationNumber',
    'role',
    'department',
    'compensation',
    'unitId',
  ]);

  const warn = report.employeePendencies.find((p) => p.employeeId === 'emp_no_unit');
  assert.ok(warn);
  assert.equal(warn.severity, 'atencao');
  assert.deepEqual(warn.missingFields, ['unitId']);
});

test('flags field_workers without rhEmployeeId or with broken rhEmployeeId and suggests candidates for human review only', () => {
  const emp = makeEmployee({ id: 'emp_real', name: 'José Carlos Pereira' });
  const unlinked = makeFieldWorker({
    id: 'fw_legacy_1',
    rhEmployeeId: undefined,
    name: 'Jose Carlos Pereira',
    cpf: '111.222.333-44',
  });
  const broken = makeFieldWorker({
    id: 'fw_legacy_2',
    rhEmployeeId: 'emp_deleted',
    name: 'Outro Operador',
    cpf: '555.666.777-88',
  });

  const report = buildRhLegacyAuditReport({
    orgId: 'org_a',
    employees: [emp],
    fieldWorkers: [unlinked, broken],
    generatedAt: '2026-11-25T12:00:00.000Z',
  });

  assert.equal(report.summary.unlinkedFieldWorkersCount, 1);
  assert.equal(report.summary.brokenFieldWorkerLinksCount, 1);

  const missingItem = report.unlinkedFieldWorkers.find((i) => i.fieldWorkerId === 'fw_legacy_1');
  assert.ok(missingItem);
  assert.equal(missingItem.issueType, 'missing_rh_link');
  assert.equal(missingItem.requiresHumanReview, true);
  assert.equal(missingItem.suggestedCandidates.length, 1);
  assert.equal(missingItem.suggestedCandidates[0].employeeId, 'emp_real');
  assert.equal(missingItem.suggestedCandidates[0].requiresHumanReview, true);
  // Input record must remain untouched (no automatic linking)
  assert.equal(unlinked.rhEmployeeId, undefined);

  const brokenItem = report.unlinkedFieldWorkers.find((i) => i.fieldWorkerId === 'fw_legacy_2');
  assert.ok(brokenItem);
  assert.equal(brokenItem.issueType, 'broken_rh_link');
  assert.equal(brokenItem.currentRhEmployeeId, 'emp_deleted');
});

test('flags duplicate rhEmployeeId links, duplicate CPF, and duplicate normalized names without auto-merging', () => {
  const emp1 = makeEmployee({ id: 'emp_1', name: 'João Pedro Lima' });
  const emp2 = makeEmployee({ id: 'emp_2', name: 'Joao Pedro Lima', registrationNumber: 'OBRA-20', codigoObra: 'OBRA-20' });
  const fw1 = makeFieldWorker({ id: 'fw_a', rhEmployeeId: 'emp_1', name: 'João Pedro Lima', cpf: '999.888.777-66' });
  const fw2 = makeFieldWorker({ id: 'fw_b', rhEmployeeId: 'emp_1', name: 'Joao Pedro Lima', cpf: '99988877766' });

  const report = buildRhLegacyAuditReport({
    orgId: 'org_a',
    employees: [emp1, emp2],
    fieldWorkers: [fw1, fw2],
    generatedAt: '2026-11-25T12:00:00.000Z',
  });

  const kinds = new Set(report.possibleDuplicates.map((d) => d.kind));
  assert.ok(kinds.has('duplicate_field_worker_link'));
  assert.ok(kinds.has('duplicate_field_worker_cpf'));
  assert.ok(kinds.has('duplicate_field_worker_name'));
  assert.ok(kinds.has('duplicate_rh_employee_name'));
  assert.ok(report.possibleDuplicates.every((d) => d.requiresHumanReview === true));
});

test('excludes demo records and foreign org records from operational pendencies', () => {
  const demoEmp = makeEmployee({ id: 'emp_demo', isDemo: true, admissionDate: '', registrationNumber: '', codigoObra: '' });
  const demoFw = makeFieldWorker({ id: 'fw_demo', isDemo: true, rhEmployeeId: undefined });
  const foreignEmp = makeEmployee({ id: 'emp_other', orgId: 'org_b', admissionDate: '' });

  const report = buildRhLegacyAuditReport({
    orgId: 'org_a',
    employees: [makeEmployee(), demoEmp, foreignEmp],
    fieldWorkers: [makeFieldWorker(), demoFw],
    generatedAt: '2026-11-25T12:00:00.000Z',
  });

  assert.equal(report.summary.isClean, true);
  assert.equal(report.summary.demoRecordsExcluded, 2);
  assert.equal(report.summary.totalRhEmployees, 1);
  assert.equal(report.summary.totalFieldWorkers, 1);
});

test('formatRhLegacyAuditCsv generates auditable rows with timestamp, orgId and human review column', () => {
  const report = buildRhLegacyAuditReport({
    orgId: 'org_a',
    employees: [makeEmployee({ id: 'emp_1', admissionDate: '' })],
    fieldWorkers: [makeFieldWorker({ id: 'fw_legacy', rhEmployeeId: undefined })],
    generatedAt: '2026-11-25T12:00:00.000Z',
  });

  const csv = formatRhLegacyAuditCsv(report);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3); // header + 1 employee pendency + 1 unlinked field worker
  assert.match(lines[0], /"Gerado_Em";"Org_ID";"Categoria"/);
  assert.match(lines[1], /"pendencia_cadastral_rh";"critica";"rh_employees";"emp_1"/);
  assert.match(lines[2], /"missing_rh_link";"critica";"field_workers";"fw_legacy"/);
});
