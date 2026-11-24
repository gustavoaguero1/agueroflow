import test from 'node:test';
import assert from 'node:assert/strict';
import { toDirectoryEntry, DIRECTORY_FIELDS } from '../src/services/rhDirectory';
import type { RhEmployee } from '../src/types/rhPayroll';

const emp: RhEmployee = {
  id: 'e1', orgId: 'org', registrationNumber: '12', name: 'Ana', admissionDate: '2025-01-01', active: true,
  department: 'Obras', role: 'Soldadora', companyName: 'Aguero', hourlyRateCarteira: 10, hourlyRatePorFora: 3,
  monthlyHours: 220, baseSalaryCarteira: 2200, baseSalaryPorFora: 660, createdAt: 'c', updatedAt: 'u',
  unitId: 'u1', codigoObra: '198',
};

test('diretório de pessoas não leva nenhum valor de salário', () => {
  const d = toDirectoryEntry(emp) as Record<string, unknown>;
  for (const k of Object.keys(d)) assert.doesNotMatch(k, /salary|hourly|rate|salario|valor/i);
  assert.equal(d.baseSalaryCarteira, undefined);
  assert.equal(d.hourlyRateCarteira, undefined);
});

test('diretório leva o que Operações precisa: nome, função, situação, admissão, obra', () => {
  assert.deepEqual(toDirectoryEntry(emp), {
    id: 'e1', orgId: 'org', name: 'Ana', role: 'Soldadora', active: true, admissionDate: '2025-01-01',
    department: 'Obras', registrationNumber: '12', unitId: 'u1', codigoObra: '198', updatedAt: 'u',
  });
  assert.ok(DIRECTORY_FIELDS.includes('name'));
});

test('campos ausentes não viram undefined (o Firestore recusa undefined)', () => {
  const d = toDirectoryEntry({ ...emp, unitId: undefined, codigoObra: undefined });
  assert.equal('unitId' in d, false);
  assert.equal('codigoObra' in d, false);
});
