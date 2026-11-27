import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCompras, filterCompras, type CompraMarTravel } from '../src/services/marTravelCompras';

const base = { produtos: { aereos: 0, hoteis: 0, carros: 0, rodoviarios: 0, outros: 0, seguros: 0, traslados: 0 }, passageiros: [], solicitante: null, projeto: null };
const items: CompraMarTravel[] = [
  { ...base, id: '1', status: 'CONCLUIDA', valorTotal: 500, unitId: 'u1', unitName: 'Yakult', centroDeCusto: { codigo: '1040/24', nome: 'Yakult Lorena' }, passageiros: [{ nome: 'Ana' }] },
  { ...base, id: '2', status: 'CONCLUIDA', valorTotal: 250.5, unitId: 'u1', unitName: 'Yakult', centroDeCusto: { codigo: '1040/24' } },
  { ...base, id: '3', status: 'CANCELADA', valorTotal: 900, unitId: 'u1', unitName: 'Yakult', centroDeCusto: { codigo: '1040/24' } },
  { ...base, id: '4', status: 'PENDENTE_APROVACAO', valorTotal: null, unitId: null, unitName: null, centroDeCusto: { codigo: '7777', nome: 'Sem obra' } },
];

test('resumo: canceladas não somam no custo; pendentes contam à parte', () => {
  const r = summarizeCompras(items);
  assert.equal(r.custoTotal, 750.5);
  assert.deepEqual(r.porStatus, { CONCLUIDA: 2, CANCELADA: 1, PENDENTE_APROVACAO: 1 });
  assert.equal(r.semObra, 1);
});

test('resumo por obra junta pelo unitId e, sem obra, pelo centro de custo', () => {
  const r = summarizeCompras(items);
  assert.deepEqual(r.porObra.map((o) => [o.chave, o.nome, o.custo, o.qtd]), [
    ['u1', 'Yakult', 750.5, 3],
    ['cc:7777', 'Sem obra', 0, 1],
  ]);
});

test('filtro por status e por texto (passageiro, obra, centro de custo, id)', () => {
  assert.deepEqual(filterCompras(items, { status: 'CANCELADA' }).map((i) => i.id), ['3']);
  assert.deepEqual(filterCompras(items, { busca: 'ana' }).map((i) => i.id), ['1']);
  assert.deepEqual(filterCompras(items, { busca: '7777' }).map((i) => i.id), ['4']);
  assert.equal(filterCompras(items, {}).length, 4);
});
