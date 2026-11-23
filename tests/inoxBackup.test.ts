import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInoxBackup, summarizeInoxBackup, rewriteUrls } from '../src/modules/operations/inoxBackup';

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
