import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNfeXml } from '../server/nfe/parseNfe.ts';

const xml = readFileSync(new URL('./fixtures/nfe-sample.xml', import.meta.url), 'utf8');

test('parses items, totals and duplicatas', () => {
  const n = parseNfeXml(xml);
  assert.equal(n.chave, '35261111111111111111550010000012341000012345');
  assert.equal(n.numero, '1234');
  assert.equal(n.modelo, '55');
  assert.equal(n.emitente.cnpj, '11111111000111');
  assert.equal(n.emitente.uf, 'SP');
  assert.equal(n.destinatario.cnpj, '22222222000122');
  assert.equal(n.valorTotal, 585);
  assert.equal(n.valorFrete, 20);
  assert.equal(n.valorIpi, 10);
  assert.equal(n.itens.length, 2);
  assert.deepEqual(n.itens[0], { n: 1, codigo: 'A001', descricao: 'Chapa inox 304 2mm', ncm: '72193500', cfop: '5102', unidade: 'KG', quantidade: 10, valorUnitario: 25.5, valorTotal: 255, ean: '7891234567895' });
  assert.equal(n.itens[1].ean, undefined);
  assert.deepEqual(n.duplicatas, [
    { numero: '001', vencimento: '2026-12-10', valor: 292.5 },
    { numero: '002', vencimento: '2027-01-10', valor: 292.5 },
  ]);
});

test('accepts bare NFe with single det and dup', () => {
  const bare = xml.replace(/<\/?nfeProc[^>]*>/g, '').replace(/<protNFe[\s\S]*<\/protNFe>/, '')
    .replace(/<det nItem="2">[\s\S]*?<\/det>/, '').replace(/<dup><nDup>002[\s\S]*?<\/dup>/, '');
  const n = parseNfeXml(bare);
  assert.equal(n.itens.length, 1);
  assert.equal(n.duplicatas.length, 1);
});

test('rejects non-NFe xml', () => {
  assert.throws(() => parseNfeXml('<foo><bar/></foo>'), /XML não é uma NF-e válida/);
});
