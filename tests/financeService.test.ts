import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestClassification, cfopDefault, buildPayables, payableKpis, matchCatalogItem, catId, DEFAULT_CATEGORIES,
  stockUnitCost, parcelasOf, duplicatasExcess, autoLines,
} from '../src/services/financeService.ts';

const nfe = {
  chave: '3526', numero: '1234', emitidaEm: '2026-11-10T10:30:00-03:00', valorTotal: 585,
  emitente: { cnpj: '11111111000111', nome: 'FORNECEDOR' },
  itens: [
    { n: 1, valorTotal: 255 }, { n: 2, valorTotal: 300 },
  ],
  duplicatas: [{ numero: '001', vencimento: '2026-12-10', valor: 292.5 }, { numero: '002', vencimento: '2027-01-10', valor: 292.5 }],
} as any;
const rule = (chave: string, categoriaId: string) => ({ orgId: 'o', chave, destino: 'despesa', categoriaId, updatedAt: '' }) as any;

test('suggestClassification priority', () => {
  const item = { ncm: '7219' } as any;
  const rules = [rule('cnpj:11111111000111', 'c_cnpj'), rule('ncm:7219', 'c_ncm'), rule('cnpj_ncm:11111111000111_7219', 'c_both')];
  assert.equal(suggestClassification(rules, nfe, item)?.categoriaId, 'c_both');
  assert.equal(suggestClassification(rules.slice(0, 2), nfe, item)?.categoriaId, 'c_ncm');
  assert.equal(suggestClassification(rules.slice(0, 1), nfe, item)?.categoriaId, 'c_cnpj');
  assert.equal(suggestClassification([], nfe, item), null);
  assert.equal(suggestClassification([rule('ncm:9999', 'x')], nfe, item), null);
});

test('cfopDefault maps emitter CFOP to entry destino', () => {
  assert.equal(cfopDefault('5102', 'o').destino, 'estoque');
  assert.equal(cfopDefault('6101', 'o').destino, 'estoque');
  assert.equal(cfopDefault('1556', 'o').destino, 'consumo');
  assert.deepEqual(cfopDefault('5551', 'o'), { destino: 'despesa', categoriaId: catId('o', 'ferramentas') });
  assert.equal(cfopDefault('5933', 'o').destino, 'despesa');
  assert.ok(DEFAULT_CATEGORIES.some((c) => catId('o', c.slug) === catId('o', 'ferramentas')));
});

const lines = [
  { n: 1, destino: 'estoque', categoriaId: 'mat', contractId: 'k1' },
  { n: 2, destino: 'despesa', categoriaId: 'cons', centroCustoId: 'cc1' },
] as any;
const opts = { orgId: 'o', user: { uid: 'u', name: 'U' }, now: '2026-11-21T00:00:00.000Z' };

test('payables from duplicatas', () => {
  const p = buildPayables(nfe, lines, opts);
  assert.deepEqual(p.map((x) => [x.id, x.parcela, x.valor, x.vencimento]), [
    ['pay_o_3526_001', '001', 292.5, '2026-12-10'], ['pay_o_3526_002', '002', 292.5, '2027-01-10'],
  ]);
  assert.equal(p[0].categoriaId, 'cons'); // 300 > 255
  assert.equal(p[0].origem, 'nfe');
  assert.equal(p[0].status, 'aberto');
  assert.equal(p[0].nfeChave, '3526');
  // rateio proportional to line values, sums exactly to the parcela
  const r = p[0].rateio!;
  assert.equal(r.length, 2);
  assert.equal(Math.round(r.reduce((s, x) => s + x.valor, 0) * 100), 29250);
  assert.equal(r.find((x) => x.categoriaId === 'mat')!.valor, 134.39);
  assert.equal(r.find((x) => x.categoriaId === 'mat')!.contractId, 'k1');
  // differing contract/cc → not set on the payable itself
  assert.equal(p[0].contractId, undefined);
});

test('payables without duplicatas: one at emission + 30 days, overrides honoured', () => {
  const p = buildPayables({ ...nfe, duplicatas: [] }, lines, opts);
  assert.deepEqual(p.map((x) => [x.id, x.parcela, x.valor, x.vencimento]), [['pay_o_3526_1', '1', 585, '2026-12-10']]);
  const o = buildPayables({ ...nfe, duplicatas: [] }, lines, { ...opts, vencimentos: { '1': '2026-12-31' } });
  assert.equal(o[0].vencimento, '2026-12-31');
  const same = buildPayables(nfe, lines.map((l: any) => ({ ...l, contractId: 'k1' })), opts);
  assert.equal(same[0].contractId, 'k1');
});

test('payableKpis', () => {
  const ps = [
    { status: 'aberto', valor: 10, vencimento: '2026-11-20' },
    { status: 'aberto', valor: 20, vencimento: '2026-11-25' },
    { status: 'aberto', valor: 40, vencimento: '2026-12-20' },
    { status: 'pago', valor: 5, vencimento: '2026-11-01', pagoEm: '2026-11-03' },
    { status: 'cancelado', valor: 99, vencimento: '2026-11-20' },
  ] as any;
  const k = payableKpis(ps, '2026-11-21');
  assert.deepEqual(k, {
    atrasadas: { qtd: 1, valor: 10 }, vence7: { qtd: 1, valor: 20 }, aPagarMes: { qtd: 2, valor: 30 }, pagoMes: { qtd: 1, valor: 5 },
  });
});

test('payableKpis includes partial cash movements and excludes abatements from cash paid', () => {
  const ps = [
    { id: 'p1', status: 'aberto', valor: 5400, valorPago: 1500, valorAbatido: 100, vencimento: '2026-11-20' },
    { id: 'p2', status: 'pago', valor: 3000, valorPago: 2500, valorAbatido: 500, vencimento: '2026-11-01', pagoEm: '2026-11-21' },
  ] as any;
  const movements = [
    { payableId: 'p1', paymentDate: '2026-11-21', paymentAmount: 1000, settledValue: 1100 },
    { payableId: 'p1', paymentDate: '2026-11-22', paymentAmount: 500, settledValue: 500 },
    { payableId: 'p2', paymentDate: '2026-11-21', paymentAmount: 2500, settledValue: 3000 },
  ];
  const k = payableKpis(ps, '2026-11-21', movements);
  assert.equal(k.atrasadas.valor, 3800);
  assert.equal(k.pagoMes.valor, 4000);
  assert.equal(k.pagoMes.qtd, 2);
});

test('matchCatalogItem by EAN then normalized description', () => {
  const items = [{ id: 'a', name: 'Chapa Inox 304 2mm', ean: '' }, { id: 'b', name: 'Outro', ean: '7891234567895' }] as any;
  assert.equal(matchCatalogItem(items, { ean: '7891234567895', descricao: 'Chapa inox 304 2mm' } as any)?.id, 'b');
  assert.equal(matchCatalogItem(items, { ean: 'SEM GTIN', descricao: 'CHAPA  INÓX 304 2MM' } as any)?.id, 'a');
  assert.equal(matchCatalogItem(items, { descricao: 'nada' } as any), undefined);
});

test('stockUnitCost fallback (no custoTotal) spreads freight/discount (vNF vs Σ vProd)', () => {
  // vProd 100 + 300, vFrete 30, vDesc 10 → vNF 420; factor 1.05
  const n = { valorTotal: 420, itens: [{ n: 1, quantidade: 4, valorTotal: 100 }, { n: 2, quantidade: 3, valorTotal: 300 }] } as any;
  assert.equal(stockUnitCost(n, n.itens[0]), 26.25);
  assert.equal(stockUnitCost(n, n.itens[1]), 105);
  assert.equal(stockUnitCost({ valorTotal: 0, itens: [{ n: 1, quantidade: 2, valorTotal: 0 }] } as any, { n: 1, quantidade: 2, valorTotal: 0 } as any), 0);
});

test('parcelas: balancing saldo when duplicatas fall short of vNF; excess detected', () => {
  const short = { ...nfe, duplicatas: [{ numero: '001', vencimento: '2026-12-10', valor: 292.5 }] };
  assert.deepEqual(parcelasOf(short), [
    { parcela: '001', valor: 292.5, vencimento: '2026-12-10' }, { parcela: 'saldo', valor: 292.5, vencimento: '2026-11-10' },
  ]);
  const p = buildPayables(short, lines, opts);
  assert.equal(p.reduce((s, x) => s + x.valor, 0), 585);
  assert.equal(p[1].id, 'pay_o_3526_saldo');
  assert.equal(duplicatasExcess(nfe), 0);
  assert.equal(parcelasOf(nfe).length, 2);
  assert.equal(duplicatasExcess({ ...nfe, duplicatas: [{ numero: '1', vencimento: '2026-12-10', valor: 600 }] }), 15);
});

test('rateio carries workOrderId', () => {
  const p = buildPayables(nfe, lines.map((l: any, i: number) => ({ ...l, workOrderId: `wo${i}` })), opts);
  assert.deepEqual(p[0].rateio!.map((r) => r.workOrderId).sort(), ['wo0', 'wo1']);
});

test('payables preserve OC, receipt and work-order references', () => {
  const sameWorkOrder = lines.map((line: any) => ({ ...line, workOrderId: 'wo1' }));
  const p = buildPayables(nfe, sameWorkOrder, { ...opts, purchaseOrderId: 'po1', purchaseOrderCode: 'OC-2026-001', receiptId: 'rec_1', workOrderNumber: 'OS-2026-014' });
  assert.equal(p[0].purchaseOrderId, 'po1');
  assert.equal(p[0].purchaseOrderCode, 'OC-2026-001');
  assert.equal(p[0].receiptId, 'rec_1');
  assert.equal(p[0].workOrderNumber, 'OS-2026-014');
  assert.equal(p[0].workOrderId, 'wo1');
});

test('stockUnitCost and rateio use the parsed custoTotal', () => {
  const n = { ...nfe, itens: [{ n: 1, quantidade: 10, valorTotal: 255, custoTotal: 260 }, { n: 2, quantidade: 2, valorTotal: 300, custoTotal: 325 }] };
  assert.equal(stockUnitCost(n, n.itens[0]), 26);
  assert.equal(stockUnitCost(n, n.itens[1]), 162.5);
  const p = buildPayables(n, lines, opts);
  assert.equal(p[0].rateio!.find((r) => r.categoriaId === 'mat')!.valor, 130); // 292.50 × 260 / 585
});

test('autoLines pre-fills destino, categoria, catalog item and unit (rule → CFOP → default category)', () => {
  const n = {
    emitente: { cnpj: '11111111000111', nome: 'F' },
    itens: [
      { n: 1, descricao: 'Chapa inox 304 2mm', ncm: '7219', cfop: '5102', ean: '' },
      { n: 2, descricao: 'Eletrodo', ncm: '8311', cfop: '5102' },
      { n: 3, descricao: 'Luva', ncm: '6116', cfop: '5556' },
      { n: 4, descricao: 'Frete', ncm: '0000', cfop: '5933' },
    ],
  } as any;
  const rules = [rule('cnpj_ncm:11111111000111_8311', 'cat_o_consumiveis-solda-corte')];
  rules[0].destino = 'consumo';
  const cats = ['cat_o_materiais-diretos', 'cat_o_consumiveis-solda-corte', 'cat_o_administrativo'];
  const ls = autoLines(n, rules, [{ id: 'it1', name: 'Chapa Inox 304 2mm' }], cats, 'o', 'u1');
  assert.deepEqual(ls, [
    { n: 1, destino: 'estoque', categoriaId: 'cat_o_materiais-diretos', itemId: 'it1', unitId: 'u1' },
    { n: 2, destino: 'consumo', categoriaId: 'cat_o_consumiveis-solda-corte' },
    { n: 3, destino: 'consumo', categoriaId: 'cat_o_materiais-diretos' },
    { n: 4, destino: 'despesa', categoriaId: 'cat_o_administrativo' },
  ]);
  // no unit to stock into → consumo
  assert.equal(autoLines(n, [], [], cats, 'o', '')[0].destino, 'consumo');
});
