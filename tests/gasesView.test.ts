import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

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

test('resumo como no painel original: conta só os considerados; custo médio por cilindro ponderado; obras ativas', () => {
  const r = G.resumo([
    L({ valor: 200, cilindros: 2, preco_cil: 100, obra: 'A' }),
    L({ valor: 50, considerar: 'NÃO', cilindros: 1, status: 'REVISAR' }),
    L({ valor: 300, cilindros: 1, preco_cil: 300, status: 'REVISAR', obra: 'B' }),
    L({ valor: 500, cilindros: 0, preco_cil: 0, base_preco: 'por m³/kg (provável)', obra: 'B' }),
  ]);
  assert.equal(r.valor, 1000);
  assert.equal(r.cilindros, 3);
  assert.equal(r.custoMedio, 166.67);
  assert.equal(r.desconsiderado, 50);
  assert.equal(r.n, 3);
  assert.equal(r.revisar, 1);
  assert.equal(r.obras, 2);
});

test('gasto por mês e por grupo de gás (argônio, argônio 5.0, outros), 12 meses', () => {
  const m = G.porMesGas([
    L({ mes: 1, valor: 10, gas: 'Argônio' }), L({ mes: 1, valor: 5, gas: 'Argônio 5.0', cilindros: 3 }),
    L({ mes: 1, valor: 2, gas: 'Nitrogênio', cilindros: 0 }), L({ mes: 3, valor: 99, considerar: 'NÃO' }),
  ]);
  assert.equal(m.length, 12);
  assert.deepEqual([m[0].argonio, m[0].argonio50, m[0].outros, m[0].total, m[0].cilindros], [10, 5, 2, 17, 4]);
  assert.equal(m[2].total, 0);
});

test('último mês com gasto e a variação contra o mês anterior', () => {
  const u = G.ultimoMes([L({ mes: 10, valor: 125082 }), L({ mes: 11, valor: 53789 })]);
  assert.equal(u.mes, 11);
  assert.equal(u.valor, 53789);
  assert.equal(Math.round(u.variacao * 1000) / 10, -57);
  assert.equal(G.ultimoMes([L({ mes: 1, valor: 10 })]).variacao, null);
});

test('agrupar por obra ordena do maior gasto para o menor', () => {
  const g = G.agrupar([L({ obra: 'A', valor: 10 }), L({ obra: 'B', valor: 30 }), L({ obra: 'A', valor: 5, cilindros: 2 })], 'obra');
  assert.deepEqual(g.map((x: { k: string }) => x.k), ['B', 'A']);
  assert.equal(g[1].valor, 15);
  assert.equal(g[1].cilindros, 3);
});

test('mapa de calor: gasto de cada obra em cada mês', () => {
  const h = G.calor([L({ obra: 'A', mes: 2, valor: 10 }), L({ obra: 'A', mes: 2, valor: 5 }), L({ obra: 'B', mes: 12, valor: 7 })], ['A', 'B']);
  assert.equal(h[0].meses[1], 15);
  assert.equal(h[1].meses[11], 7);
  assert.equal(h[0].meses[0], 0);
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

test('preço médio mensal por fornecedor marca variação acima de 10% sobre a compra anterior', () => {
  const s = G.precoMensal([
    L({ mes: 1, preco_cil: 100, cilindros: 1 }), L({ mes: 2, preco_cil: 105, cilindros: 1 }), L({ mes: 4, preco_cil: 130, cilindros: 1 }),
    L({ mes: 1, gas: 'Argônio 5.0', preco_cil: 999 }),
  ], 'Argônio');
  assert.equal(s.length, 1);
  assert.equal(s[0].fornecedor, 'WHITE MARTINS');
  assert.equal(s[0].pontos[0], 100);
  assert.equal(s[0].pontos[2], null);
  assert.deepEqual(s[0].salto, [false, false, false, true, false, false, false, false, false, false, false, false]);
});

test('alertas: fornecedor bem mais caro que o mais barato no último mês, e variação de preço entre compras', () => {
  const a = G.alertas([
    L({ mes: 11, gas: 'Argônio', fornecedor: 'AIRGAS', preco_cil: 207.26 }),
    L({ mes: 11, gas: 'Argônio', fornecedor: 'AIR LIQUIDE', preco_cil: 360 }),
    L({ mes: 11, gas: 'Argônio', fornecedor: 'NÃO INFORMADO', preco_cil: 900 }),
    L({ mes: 10, gas: 'Argônio', fornecedor: 'AIR LIQUIDE', preco_cil: 317.78 }),
  ]);
  const caro = a.find((x: { tipo: string }) => x.tipo === 'preco');
  assert.ok(caro);
  assert.match(caro.texto, /AIR LIQUIDE cobra R\$\s?360,00\/cil\., 73,7% acima de AIRGAS \(R\$\s?207,26\/cil\.\)/);
  assert.ok(!a.some((x: { texto: string }) => x.texto.includes('NÃO INFORMADO')));
  const vari = a.find((x: { tipo: string }) => x.tipo === 'variacao');
  assert.match(vari.texto, /R\$\s?317,78 \(Out\) → R\$\s?360,00 \(Nov\): \+13,3% por cilindro/);
});

test('linhas a revisar agrupadas por motivo (sem detalhes de linha ou data)', () => {
  const m = G.motivos([
    L({ status: 'REVISAR', motivo: 'fornecedor não informado no bloco; data do pedido (02/02) fora do mês da aba' }),
    L({ status: 'REVISAR', motivo: 'fornecedor não informado no bloco; possível pedido duplicado do bloco MARÇO linha 23 (mesma obra)' }),
    L({ status: 'OK', motivo: '' }),
  ]);
  assert.deepEqual(m, [
    { k: 'fornecedor não informado no bloco', n: 2 },
    { k: 'data do pedido fora do mês da aba', n: 1 },
    { k: 'possível pedido duplicado', n: 1 },
  ]);
});

test('boletos por prazo: vencidos, até 7 dias, até 30 dias (pagos fora)', () => {
  const p = G.boletosPorPrazo([
    { vencimento: '2026-11-20', valor: 10 }, { vencimento: '2026-11-28', valor: 20 }, { vencimento: '2026-12-14', valor: 30 },
    { vencimento: '2027-02-01', valor: 40 }, { vencimento: '2026-11-01', valor: 50, pago: true },
  ], '2026-11-24');
  assert.deepEqual(p.vencidos, { n: 1, valor: 10 });
  assert.deepEqual(p.ate7, { n: 1, valor: 20 });
  assert.deepEqual(p.ate30, { n: 1, valor: 30 });
  assert.deepEqual(p.depois, { n: 1, valor: 40 });
});

test('filtro por mês, obra, fornecedor, gás, fonte, situação e texto', () => {
  const ls = [L({ mes: 1, obra: 'YAKULT', ref: 'JANEIRO L4' }), L({ mes: 2, obra: 'UNIGRA', status: 'REVISAR', fonte: 'NF' })];
  assert.equal(G.filtrar(ls, { mes: '2' }).length, 1);
  assert.equal(G.filtrar(ls, { obra: 'YAKULT' }).length, 1);
  assert.equal(G.filtrar(ls, { status: 'REVISAR' }).length, 1);
  assert.equal(G.filtrar(ls, { fonte: 'NF' }).length, 1);
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

test('a aba Controle de gases lê as três coleções importadas', () => {
  const html = readFileSync(new URL('../public/operacoes/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="gases.js"><\/script>/);
  for (const c of ['gases_lancamentos', 'gases_pendencias', 'gases_boletos']) assert.match(html, new RegExp(`listen\\('${c}'`));
  assert.match(html, /function vGases\(\)\{return vGasesView\(\)\}/);
});

test('gráfico de preço: estado antigo sem gás escolhido cai no Argônio 5.0', () => {
  assert.equal(G.gasPrecoAtual({ tab: 'lanc', f: {} }), 'Argônio 5.0');
  assert.equal(G.gasPrecoAtual({ gasPreco: 'Argônio' }), 'Argônio');
  assert.equal(G.gasPrecoAtual({ gasPreco: 'Xenônio' }), 'Argônio 5.0');
});

test('situação do boleto: pago, vencido ou quantos dias faltam', () => {
  assert.deepEqual(G.boletoSituacao({ vencimento: '2026-12-14' }, '2026-11-24'), { k: 'aberto', dias: 20, txt: 'Vence em 20 dias' });
  assert.equal(G.boletoSituacao({ vencimento: '2026-11-20' }, '2026-11-24').k, 'vencido');
  assert.equal(G.boletoSituacao({ vencimento: '2026-11-24' }, '2026-11-24').txt, 'Vence hoje');
  assert.equal(G.boletoSituacao({ vencimento: '2026-11-20', pago: true }, '2026-11-24').k, 'pago');
});
