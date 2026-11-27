import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16Kermit, dhAfd, camposTipo7, hashTipo7, linhaTipo7, linhaTipo2, linhaTipo5, gerarAfd } from '../server/ponto/afd.ts';

test('CRC-16/KERMIT de referência', () => assert.equal(crc16Kermit('123456789'), '2189'));

test('data-hora no formato do AFD', () => {
  assert.equal(dhAfd('2026-11-25T07:00:41-03:00'), '2026-11-25T07:00:00-0300');
  assert.equal(dhAfd('2026-11-25T10:00:41Z'), '2026-11-25T10:00:00+0000');
});

const r1 = { nsr: 1, dataHora: '2026-11-25T07:00:00-03:00', cpf: '52998224725', gravadoEm: '2026-11-25T07:00:05-03:00', coletor: '01' as const, offline: false };

test('tipo 7: tamanho, posições e hash encadeado', () => {
  const c1 = camposTipo7(r1);
  assert.equal(c1.length, 73);
  assert.equal(c1.slice(0, 9), '000000001');
  assert.equal(c1[9], '7');
  assert.equal(c1.slice(34, 46), '052998224725');
  assert.equal(c1.slice(70, 72), '01');
  assert.equal(c1[72], '0');
  const h1 = hashTipo7(c1, null);
  assert.match(h1, /^[0-9a-f]{64}$/);
  const c2 = camposTipo7({ ...r1, nsr: 2, dataHora: '2026-11-25T12:00:00-03:00', gravadoEm: '2026-11-25T12:00:01-03:00', offline: true });
  assert.equal(c2[72], '1');
  assert.notEqual(hashTipo7(c2, h1), hashTipo7(c2, null));
  assert.equal(linhaTipo7(c1, h1).length, 137);
});

test('arquivo: cabeçalho 302, trailer 64, assinatura 100, CRLF, contagem do tipo 7', () => {
  const c = camposTipo7(r1);
  const txt = gerarAfd({
    cnpj: '11222333000181', razaoSocial: 'AGUERO INOX LTDA', inpi: '', inicio: '2026-11-01', fim: '2026-11-30',
    geradoEm: '2026-11-30T18:00:00-03:00', desenvolvedorCnpj: '11222333000181',
    linhas: [{ nsr: 1, tipo: 7, linha: linhaTipo7(c, hashTipo7(c, null)) }],
  });
  const linhas = txt.split('\r\n');
  assert.equal(linhas.at(-1), '');
  assert.equal(linhas[0].length, 302);
  assert.equal(linhas[0].slice(9, 10), '1');
  assert.equal(linhas[0].slice(250, 253), '004');
  assert.equal(linhas[0].slice(298), crc16Kermit(linhas[0].slice(0, 298)));
  assert.equal(linhas[1].length, 137);
  assert.equal(linhas[2].length, 64);
  assert.equal(linhas[2].slice(0, 9), '999999999');
  assert.equal(linhas[2].slice(54, 63), '000000001');
  assert.equal(linhas[3], 'ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' '));
});

test('tipos 2 e 5: tamanho e CRC; trailer conta cada tipo; ordem por NSR', () => {
  const l5 = linhaTipo5({ nsr: 1, gravadoEm: '2026-11-25T06:00:00-03:00', operacao: 'I', cpf: '52998224725', nome: 'José Ação', cpfResp: '52998224725' });
  assert.equal(l5.length, 118);
  assert.equal(l5[9], '5');
  assert.equal(l5.slice(114), crc16Kermit(l5.slice(0, 114)));
  assert.match(l5, /JOSE ACAO|Jose Acao/);
  const l2 = linhaTipo2({ nsr: 2, gravadoEm: '2026-11-25T06:00:00-03:00', cpfResp: '52998224725', cnpj: '11222333000181', razaoSocial: 'AGUERO', local: 'Obra' });
  assert.equal(l2.length, 331);
  assert.equal(l2[9], '2');
  assert.equal(l2.slice(327), crc16Kermit(l2.slice(0, 327)));
  const txt = gerarAfd({
    cnpj: '11222333000181', razaoSocial: 'X', inpi: '', inicio: '2026-11-01', fim: '2026-11-30', geradoEm: '2026-11-30T18:00:00-03:00', desenvolvedorCnpj: '11222333000181',
    linhas: [{ nsr: 2, tipo: 2, linha: l2 }, { nsr: 1, tipo: 5, linha: l5 }],
  });
  const ls = txt.split('\r\n');
  assert.equal(ls[1], l5);
  assert.equal(ls[2], l2);
  assert.equal(ls[3].slice(9, 18), '000000001'); // tipo 2
  assert.equal(ls[3].slice(36, 45), '000000001'); // tipo 5
});
