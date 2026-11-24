import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInoxBackup, summarizeInoxBackup, rewriteUrls, matchByName, rhEmployeeFromInox } from '../src/modules/operations/inoxBackup';

test('matchByName ignora acento e caixa', () => {
  const r = matchByName('JOÃO da silva', [{ id: 'e1', name: 'João da Silva' }, { id: 'e2', name: 'Maria' }]);
  assert.equal(r?.id, 'e1');
});

test('matchByName: homônimos não casam (evita juntar duas pessoas)', () => {
  assert.equal(matchByName('José Lima', [{ id: 'e1', name: 'José Lima' }, { id: 'e2', name: 'Jose Lima' }]), null);
  assert.equal(matchByName('Ninguém', [{ id: 'e1', name: 'José' }]), null);
});

test('rhEmployeeFromInox: CLT leva salário para Carteira; desligado vira inativo', () => {
  const e = rhEmployeeFromInox('org', 'c-ana', { nome: 'Ana', funcao: 'Soldadora', status: 'Desligado', admissao: '2025-01-10' }, { clt: 2200 });
  assert.equal(e.id, 'rh_ops_c-ana');
  assert.equal(e.name, 'Ana');
  assert.equal(e.role, 'Soldadora');
  assert.equal(e.active, false);
  assert.equal(e.admissionDate, '2025-01-10');
  assert.equal(e.baseSalaryCarteira, 2200);
  assert.equal(e.hourlyRateCarteira, 10);
});

test('rhEmployeeFromInox: PJ leva o valor PJ para Carteira (o regime fica no complemento)', () => {
  const e = rhEmployeeFromInox('org', 'c-bia', { nome: 'Bia', regime: 'PJ' }, { pj: 5000 });
  assert.equal(e.baseSalaryCarteira, 5000);
  assert.equal(e.active, true);
});

const sample = {
  formato: 'aguero-inox-backup', versao: 1, geradoEm: '2026-11-23T20:00:00Z',
  colecoes: { colaboradores: [{ id: 'c1', nome: 'Ana' }], reemb_notas: [{ id: 'n1', anexos: [{ nome: 'a.jpg', tipo: 'image/jpeg', url: 'https://old/a' }] }] },
  docs: { 'config/params': { horiz: 365 }, 'config/diario': null },
  arquivos: { 'historico.json': { k: 1 } },
  anexos: { 'https://old/a': 'data:image/jpeg;base64,AAAA' },
};

test('aceita backup válido e resume', () => {
  const b = parseInoxBackup(JSON.stringify(sample));
  const s = summarizeInoxBackup(b);
  assert.deepEqual(s.colecoes, { colaboradores: 1, reemb_notas: 1 });
  assert.deepEqual(s.docs, ['config/params']);
  assert.deepEqual(s.arquivos, ['historico.json']);
  assert.equal(s.anexos, 1);
});

test('recusa arquivo que não é backup do Inox', () => {
  assert.throws(() => parseInoxBackup('{"foo":1}'), /não é um backup/);
  assert.throws(() => parseInoxBackup('nem json'));
});

test('troca URLs de anexos em qualquer profundidade e só no campo url', () => {
  const m = new Map([['https://old/a', 'https://new/a']]);
  const out = rewriteUrls({ anexos: [{ url: 'https://old/a', obs: 'https://old/a' }], x: { y: [{ url: 'https://other' }] } }, m);
  assert.deepEqual(out, { anexos: [{ url: 'https://new/a', obs: 'https://old/a' }], x: { y: [{ url: 'https://other' }] } });
});
