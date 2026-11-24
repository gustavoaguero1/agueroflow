import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeColab,
  splitColabWrite,
  salarioFromRh,
  mergeObra,
  splitObraWrite,
} from '../src/modules/operations/unifiedCollections';
import type { RhEmployee } from '../src/types/rhPayroll';
import type { Unit } from '../src/types';

const emp = (o: Partial<RhEmployee> = {}): RhEmployee => ({
  id: 'e1', orgId: 'org', registrationNumber: '', name: 'Ana Souza', admissionDate: '2025-02-01', active: true,
  department: 'Obras', role: 'Soldador', companyName: 'Aguero', hourlyRateCarteira: 0, hourlyRatePorFora: 0,
  monthlyHours: 220, baseSalaryCarteira: 0, baseSalaryPorFora: 0, createdAt: '', updatedAt: '', ...o,
});
const unit = (o: Partial<Unit> = {}): Unit => ({
  id: 'u1', orgId: 'org', name: 'Usina Norte', code: '198', city: 'Campinas', state: 'SP', managerName: 'Carlos',
  createdAt: '', updatedAt: '', ...o,
});

test('mergeColab sem complemento usa id rh_<empId> e a identidade do RH', () => {
  const c = mergeColab(emp(), null);
  assert.equal(c.id, 'rh_e1');
  assert.equal(c.rhId, 'e1');
  assert.equal(c.nome, 'Ana Souza');
  assert.equal(c.funcao, 'Soldador');
  assert.equal(c.status, 'Ativo');
  assert.equal(c.admissao, '2025-02-01');
});

test('mergeColab mantém o id e os campos operacionais do complemento', () => {
  const c = mergeColab(emp(), { id: 'c-ana', rhId: 'e1', cidade: 'Bauru/SP', obraAtual: 'o1', nome: 'nome velho' });
  assert.equal(c.id, 'c-ana');
  assert.equal(c.cidade, 'Bauru/SP');
  assert.equal(c.obraAtual, 'o1');
  assert.equal(c.nome, 'Ana Souza');
});

test('mergeColab: desligado no RH vence o status do complemento', () => {
  const c = mergeColab(emp({ active: false }), { id: 'c-ana', rhId: 'e1', status: 'Ativo' });
  assert.equal(c.status, 'Desligado');
});

test('mergeColab: complemento sem funcionário no RH volta marcado como semRh', () => {
  const c = mergeColab(null, { id: 'c-x', nome: 'Fulano', status: 'Ativo' });
  assert.equal(c.id, 'c-x');
  assert.equal(c.nome, 'Fulano');
  assert.equal(c.semRh, true);
});

test('splitColabWrite tira os campos de identidade', () => {
  assert.deepEqual(splitColabWrite({ nome: 'X', obraAtual: 'o1' }), { overlay: { obraAtual: 'o1' }, ignored: ['nome'] });
});

test('salarioFromRh: CLT com carteira e por fora', () => {
  assert.deepEqual(salarioFromRh(emp({ baseSalaryCarteira: 2500, baseSalaryPorFora: 800 })), { clt: 2500, porFora: 800, pj: 0 });
});

test('salarioFromRh: PJ soma tudo como PJ', () => {
  assert.deepEqual(salarioFromRh(emp({ baseSalaryCarteira: 2500, baseSalaryPorFora: 800 }), 'PJ'), { clt: 0, porFora: 0, pj: 3300 });
});

test('salarioFromRh: valor hora quando houver', () => {
  const s = salarioFromRh(emp({ baseSalaryCarteira: 2200, hourlyRateCarteira: 10, hourlyRatePorFora: 2 }));
  assert.equal(s.valorHora, 12);
});

test('mergeObra sem complemento usa id un_<unitId> e campos da unidade', () => {
  const o = mergeObra(unit(), null);
  assert.equal(o.id, 'un_u1');
  assert.equal(o.unitId, 'u1');
  assert.equal(o.nome, 'Usina Norte');
  assert.equal(o.os, '198');
  assert.equal(o.cidade, 'Campinas/SP');
  assert.equal(o.coordenador, 'Carlos');
});

test('splitObraWrite separa unidade e complemento (ida e volta)', () => {
  const { unitPatch, overlay } = splitObraWrite({ nome: 'Usina Norte', os: '198', cidade: 'Campinas/SP', coordenador: 'Carlos', dataFim: '2026-12-31' });
  assert.deepEqual(unitPatch, { name: 'Usina Norte', code: '198', city: 'Campinas', state: 'SP', managerName: 'Carlos' });
  assert.deepEqual(overlay, { dataFim: '2026-12-31' });
  const back = mergeObra({ ...unit(), ...unitPatch }, { id: 'o1', unitId: 'u1', ...overlay });
  assert.equal(back.cidade, 'Campinas/SP');
  assert.equal(back.dataFim, '2026-12-31');
});
