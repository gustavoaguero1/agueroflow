import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../public/operacoes/gases.js');

const L = (o: Record<string, unknown>) => ({
  fonte: 'PLANILHA', ref: 'X', mes: 1, data: '2026-01-10', obra: 'A', fornecedor: 'WHITE MARTINS', gas: 'Argônio',
  cilindros: 1, preco_cil: 100, base_preco: 'por cilindro', valor: 100, considerar: 'SIM', status: 'OK', motivo: '', ...o,
});

test('considerar: o ajuste feito no app vence o do arquivo', () => {
  assert.equal(G.considera(L({})), true);
  assert.equal(G.considera(L({ considerar: 'NÃO' })), false);
  assert.equal(G.considera(L({ considerar: 'NÃO', considerarAjuste: 'SIM' })), true);
  assert.equal(G.considera(L({ considerarAjuste: 'NÃO' })), false);
});

test('resumo soma só o que é considerado e conta o que falta revisar', () => {
  const r = G.resumo([L({ valor: 100, cilindros: 2 }), L({ valor: 50, considerar: 'NÃO', cilindros: 1 }), L({ valor: 30, status: 'REVISAR' })]);
  assert.equal(r.valor, 130);
  assert.equal(r.cilindros, 3);
  assert.equal(r.desconsiderado, 50);
  assert.equal(r.revisar, 1);
  assert.equal(r.n, 3);
});

test('gasto por mês tem os 12 meses, mesmo vazios', () => {
  const m = G.porMes([L({ mes: 1, valor: 10 }), L({ mes: 1, valor: 5 }), L({ mes: 3, valor: 7 }), L({ mes: 3, valor: 99, considerar: 'NÃO' })]);
  assert.equal(m.length, 12);
  assert.equal(m[0].valor, 15);
  assert.equal(m[1].valor, 0);
  assert.equal(m[2].valor, 7);
});

test('agrupar por obra ordena do maior gasto para o menor', () => {
  const g = G.agrupar([L({ obra: 'A', valor: 10 }), L({ obra: 'B', valor: 30 }), L({ obra: 'A', valor: 5, cilindros: 2 })], 'obra');
  assert.deepEqual(g.map((x: { k: string }) => x.k), ['B', 'A']);
  assert.equal(g[1].valor, 15);
  assert.equal(g[1].cilindros, 3);
});

test('preço por cilindro: média ponderada, mínimo e máximo por gás e fornecedor; ignora cobrança por m³/kg', () => {
  const p = G.precos([
    L({ cilindros: 2, preco_cil: 100, valor: 200 }),
    L({ cilindros: 1, preco_cil: 160, valor: 160 }),
    L({ base_preco: 'por m³/kg (provável)', cilindros: 0, preco_cil: 0, valor: 500 }),
  ]);
  assert.equal(p.length, 1);
  assert.equal(p[0].media, 120);
  assert.equal(p[0].min, 100);
  assert.equal(p[0].max, 160);
});

test('filtro por mês, obra, fornecedor, gás, situação e texto', () => {
  const ls = [L({ mes: 1, obra: 'YAKULT', ref: 'JANEIRO L4' }), L({ mes: 2, obra: 'UNIGRA', status: 'REVISAR' })];
  assert.equal(G.filtrar(ls, { mes: '2' }).length, 1);
  assert.equal(G.filtrar(ls, { obra: 'YAKULT' }).length, 1);
  assert.equal(G.filtrar(ls, { status: 'REVISAR' }).length, 1);
  assert.equal(G.filtrar(ls, { q: 'janeiro l4' }).length, 1);
  assert.equal(G.filtrar(ls, {}).length, 2);
});

test('data fora do ano dos lançamentos é sinalizada (erro de digitação na planilha)', () => {
  const ls = [L({ data: '2026-01-01' }), L({ data: '2026-02-01' }), L({ data: '2023-03-30' }), L({ data: null })];
  const ano = G.anoBase(ls);
  assert.equal(ano, 2026);
  assert.equal(G.dataSuspeita(ls[2], ano), true);
  assert.equal(G.dataSuspeita(ls[0], ano), false);
  assert.equal(G.dataSuspeita(ls[3], ano), false);
});

test('a aba Controle de gases lê as três coleções importadas', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../public/operacoes/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="gases.js"><\/script>/);
  for (const c of ['gases_lancamentos', 'gases_pendencias', 'gases_boletos']) assert.match(html, new RegExp(`listen\\('${c}'`));
  assert.match(html, /function vGases\(\)\{return vGasesView\(\)\}/);
  assert.doesNotMatch(html, /Em preparação/);
});

test('situação do boleto: pago, vencido ou quantos dias faltam', () => {
  assert.deepEqual(G.boletoSituacao({ vencimento: '2026-12-14' }, '2026-11-24'), { k: 'aberto', dias: 20, txt: 'Vence em 20 dias' });
  assert.equal(G.boletoSituacao({ vencimento: '2026-11-20' }, '2026-11-24').k, 'vencido');
  assert.equal(G.boletoSituacao({ vencimento: '2026-11-24' }, '2026-11-24').txt, 'Vence hoje');
  assert.equal(G.boletoSituacao({ vencimento: '2026-11-20', pago: true }, '2026-11-24').k, 'pago');
});
