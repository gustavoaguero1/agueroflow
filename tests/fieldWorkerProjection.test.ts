import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldWorkerProjection } from '../src/services/fieldWorkerProjection.ts';
import type { RhEmployee } from '../src/types/rhPayroll';
import type { FieldWorker } from '../src/types';

const employee: RhEmployee = {
  id: 'emp_42',
  orgId: 'org_a',
  registrationNumber: '',
  name: 'Ana Souza',
  admissionDate: '',
  active: true,
  department: 'Montagem',
  role: 'Montadora',
  companyName: 'Aguero Inox',
  hourlyRateCarteira: 0,
  hourlyRatePorFora: 0,
  monthlyHours: 220,
  baseSalaryCarteira: 0,
  baseSalaryPorFora: 0,
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
};

test('missing RH compensation and admission remain absent instead of receiving sample values', () => {
  const worker = buildFieldWorkerProjection(employee);
  assert.equal(worker.id, 'fw_42');
  assert.equal(worker.baseSalary, 0);
  assert.equal(worker.hourlyRate, 0);
  assert.equal(worker.admissionDate, '');
  assert.equal(worker.currentSite, '');
  assert.deepEqual(worker.salaryHistory, []);
  assert.equal(worker.isDemo, false);
});

test('real RH values and valid registration are copied to the field projection', () => {
  const worker = buildFieldWorkerProjection({
    ...employee,
    registrationNumber: 'AG-0042',
    admissionDate: '2025-02-10',
    hourlyRateCarteira: 18,
    hourlyRatePorFora: 2,
    baseSalaryCarteira: 3960,
    baseSalaryPorFora: 440,
  });
  assert.equal(worker.baseSalary, 4400);
  assert.equal(worker.hourlyRate, 20);
  assert.equal(worker.admissionDate, '2025-02-10');
  assert.equal(worker.currentSite, 'Obra AG-0042');
});

test('same-id legacy field data is preserved when RH has no replacement values', () => {
  const existing: Partial<FieldWorker> = {
    id: 'fw_42',
    orgId: 'org_a',
    name: 'Ana Souza',
    cpf: '123',
    role: 'Montadora',
    baseSalary: 3850,
    hourlyRate: 17.5,
    currentSite: 'Usina Norte',
    admissionDate: '2023-09-01',
    status: 'ativo',
    salaryHistory: [],
    createdAt: '2023-09-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const worker = buildFieldWorkerProjection(employee, existing);
  assert.equal(worker.baseSalary, 3850);
  assert.equal(worker.hourlyRate, 17.5);
  assert.equal(worker.admissionDate, '2023-09-01');
  assert.equal(worker.currentSite, 'Usina Norte');
  assert.equal(worker.createdAt, existing.createdAt);
});

test('demonstration employees stay marked and do not inherit real payroll/admission values', () => {
  const worker = buildFieldWorkerProjection({
    ...employee,
    isDemo: true,
    admissionDate: '',
    hourlyRateCarteira: 21,
    baseSalaryCarteira: 4620,
  }, {
    id: 'fw_42',
    baseSalary: 3850,
    hourlyRate: 17.5,
    admissionDate: '2023-09-01',
  });
  assert.equal(worker.isDemo, true);
  assert.equal(worker.baseSalary, 4620);
  assert.equal(worker.hourlyRate, 21);
  assert.equal(worker.admissionDate, '');
});
