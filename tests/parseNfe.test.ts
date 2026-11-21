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
  assert.equal(n.valorIpi, 6);
  assert.deepEqual(
    [n.valorDesconto, n.valorSeguro, n.valorOutros, n.valorSt, n.valorPis, n.valorCofins],
    [5, 2, 3, 4, 9.16, 42.18],
  );
  assert.equal(n.itens.length, 2);
  assert.deepEqual(n.itens[0], {
    n: 1, codigo: 'A001', descricao: 'Chapa inox 304 2mm', ncm: '72193500', cfop: '5102', unidade: 'KG', quantidade: 10, valorUnitario: 25.5, valorTotal: 255, ean: '7891234567895',
    vFrete: 10, vSeg: 0, vDesc: 5, vOutro: 0,
    impostos: { vICMS: 45.9, vICMSST: 0, vFCPST: 0, vIPI: 0, vIPIDevol: 0, vII: 0, vPIS: 4.21, vCOFINS: 19.38, pICMS: 18 },
    custoTotal: 260, // 255 + 10 − 5
  });
  assert.deepEqual(n.itens[1].impostos, { vICMS: 54, vICMSST: 4, vFCPST: 0, vIPI: 6, vIPIDevol: 0, vII: 0, vPIS: 4.95, vCOFINS: 22.8, pICMS: 18, pIPI: 2 });
  assert.equal(n.itens[1].custoTotal, 325); // 300 + 10 + 2 + 3 + 4 (ST) + 6 (IPI)
  assert.equal(n.itens.reduce((s, i) => s + i.custoTotal, 0), n.valorTotal);
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

test('Simples Nacional ICMS group and missing imposto parse as zero', () => {
  const sn = xml.replace(/<ICMS00>[\s\S]*?<\/ICMS00>/, '<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>');
  assert.equal(parseNfeXml(sn).itens[0].impostos.vICMS, 0);
  const none = xml.replace(/<imposto>[\s\S]*?<\/imposto>/g, '');
  assert.deepEqual(parseNfeXml(none).itens[0].impostos, { vICMS: 0, vICMSST: 0, vFCPST: 0, vIPI: 0, vIPIDevol: 0, vII: 0, vPIS: 0, vCOFINS: 0 });
});

test('custoTotal includes FCP-ST, II and IPI devolvido', () => {
  const x = xml
    .replace('<vICMSST>4.00</vICMSST>', '<vICMSST>4.00</vICMSST><vBCFCPST>322.20</vBCFCPST><pFCPST>2.00</pFCPST><vFCPST>1.00</vFCPST>')
    .replace('<PIS><PISAliq><CST>01</CST><vBC>255.00</vBC>', '<II><vBC>255.00</vBC><vDespAdu>0</vDespAdu><vII>2.00</vII><vIOF>0</vIOF></II><PIS><PISAliq><CST>01</CST><vBC>255.00</vBC>')
    .replace('</imposto></det>', '</imposto><impostoDevol><pDevol>100.00</pDevol><IPI><vIPIDevol>0.50</vIPIDevol></IPI></impostoDevol></det>'); // first det
  const n = parseNfeXml(x);
  assert.equal(n.itens[0].impostos.vII, 2);
  assert.equal(n.itens[0].impostos.vIPIDevol, 0.5);
  assert.equal(n.itens[1].impostos.vFCPST, 1);
  assert.equal(n.itens[0].custoTotal, 262.5); // 260 + II 2 + IPI devol 0.5
  assert.equal(n.itens[1].custoTotal, 326); // 325 + FCP-ST 1 (diff to vNF 3.50 > 0.05: left as-is)
  const sn = xml.replace(/<ICMS10>[\s\S]*?<\/ICMS10>/, '<ICMSSN202><orig>0</orig><CSOSN>202</CSOSN><vICMSST>4.00</vICMSST><vFCPST>0.70</vFCPST></ICMSSN202>');
  assert.equal(parseNfeXml(sn).itens[1].impostos.vFCPST, 0.7);
});

test('rounding remainder (≤ R$ 0,05) goes to the largest line so Σ custoTotal == vNF', () => {
  const n = parseNfeXml(xml.replace('<vNF>585.00</vNF>', '<vNF>585.03</vNF>'));
  assert.deepEqual(n.itens.map((i) => i.custoTotal), [260, 325.03]);
  const far = parseNfeXml(xml.replace('<vNF>585.00</vNF>', '<vNF>585.10</vNF>'));
  assert.deepEqual(far.itens.map((i) => i.custoTotal), [260, 325]);
});

test('rejects non-NFe xml', () => {
  assert.throws(() => parseNfeXml('<foo><bar/></foo>'), /XML não é uma NF-e válida/);
});

test('rejects doctype/entity xml', () => {
  assert.throws(() => parseNfeXml('<!DOCTYPE x [<!ENTITY a "b">]>' + xml), /XML não é uma NF-e válida/);
});

test('rejects invalid chave', () => {
  assert.throws(() => parseNfeXml(xml.replace(/NFe\d{44}/, 'NFe123')), /XML não é uma NF-e válida/);
});

test('missing vNF rejected', () => {
  assert.throws(() => parseNfeXml(xml.replace(/<vNF>.*?<\/vNF>/, '')), /XML não é uma NF-e válida/);
});
