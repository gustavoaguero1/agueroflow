import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRanges, fetchAllSolicitacoes, normalizeSolicitacao, matchUnit } from '../server/lemontech/sync';

test('monthRanges quebra o período em meses, sem buracos nem sobreposição', () => {
  assert.deepEqual(monthRanges('2026-10-15', '2026-12-02'), [
    { dataInicial: '2026-10-15', dataFinal: '2026-10-31' },
    { dataInicial: '2026-11-01', dataFinal: '2026-11-30' },
    { dataInicial: '2026-12-01', dataFinal: '2026-12-02' },
  ]);
  assert.deepEqual(monthRanges('2026-02-01', '2026-02-10'), [{ dataInicial: '2026-02-01', dataFinal: '2026-02-10' }]);
  assert.deepEqual(monthRanges('2026-03-01', '2026-02-01'), []);
});

test('fetchAll pede todos os status, pagina de 50 em 50 e não duplica', async () => {
  const pedidos: any[] = [];
  const page = (n: number, start: number) => Array.from({ length: n }, (_, i) => ({ idSolicitacao: String(start + i) }));
  const client = {
    async pesquisarSolicitacao(p: any) {
      pedidos.push(p);
      if (p.dataInicial === '2026-11-01') return p.registroInicial === 0 ? page(50, 1) : page(3, 50); // id 50 repetido
      return [];
    },
  };
  const lista = await fetchAllSolicitacoes(client, '2026-10-20', '2026-11-26', { sleep: async () => {} });
  assert.equal(lista.length, 52);
  const nov = pedidos.filter((p) => p.dataInicial === '2026-11-01');
  assert.deepEqual(nov.map((p) => p.registroInicial), [0, 50]);
  for (const p of pedidos) {
    assert.equal(p.exibirCancelados, true);
    assert.equal(p.exibirPendentesAprovacao, true);
    assert.equal(p.exibirAprovadas, true);
    assert.equal(p.quantidadeRegistros, 50);
  }
});

test('fetchAll respeita o limite de 60 por minuto esperando entre chamadas', async () => {
  const esperas: number[] = [];
  const client = { async pesquisarSolicitacao() { return []; } };
  await fetchAllSolicitacoes(client, '2026-09-01', '2026-11-26', { sleep: async (ms) => { esperas.push(ms); } });
  assert.equal(esperas.length, 2); // 3 chamadas, 2 esperas
  assert.ok(esperas.every((ms) => ms >= 1000));
});

const RAW = {
  idSolicitacao: '555', status: 'CONCLUIDA', dataCriacao: '2026-11-10T09:00:00',
  centroDeCusto: { codigo: '1040/24', nome: '1040/24- Yakult Lorena- Manutenção' },
  projeto: { codigo: 'P1', nome: 'Parada' },
  solicitante: { nome: 'Bia', matricula: 'M9' },
  passageiros: { passageiro: [{ nome: 'Ana', matricula: 'M1' }, { nome: 'Caio', matricula: 'M2' }] },
  aereos: { aereo: { valorTotal: '812.40', origem: 'GRU', destino: 'SSA' } },
  rodoviarios: { rodoviario: [{ valorTotal: '120.10' }, { valor: '99,90' }] },
  hoteis: '',
};

test('normalize junta passageiros, conta produtos, soma valores e mantém o original', () => {
  const n = normalizeSolicitacao(RAW);
  assert.equal(n.id, '555');
  assert.equal(n.status, 'CONCLUIDA');
  assert.equal(n.centroDeCusto?.codigo, '1040/24');
  assert.deepEqual(n.passageiros.map((p) => p.nome), ['Ana', 'Caio']);
  assert.equal(n.produtos.aereos, 1);
  assert.equal(n.produtos.rodoviarios, 2);
  assert.equal(n.produtos.hoteis, 0);
  assert.equal(n.valorTotal, 1032.4);
  assert.deepEqual(n.raw, RAW);
});

test('normalize usa o total da própria solicitação quando a Lemontech manda', () => {
  const n = normalizeSolicitacao({ ...RAW, totais: { valorTotal: '2000.00' } });
  assert.equal(n.valorTotal, 2000);
  assert.equal(normalizeSolicitacao({ idSolicitacao: '1' }).valorTotal, null);
});

test('matchUnit liga o centro de custo à obra pelo código', () => {
  const units = [{ id: 'u1', code: '1040/24', name: 'Yakult' }, { id: 'u2', code: '1041/24', name: 'Outra' }];
  assert.equal(matchUnit({ codigo: '1040/24' }, units)?.id, 'u1');
  assert.equal(matchUnit({ codigo: 'X', nome: '1041/24- Outra obra' }, units)?.id, 'u2');
  assert.equal(matchUnit({ codigo: '9999' }, units), null);
  assert.equal(matchUnit(null, units), null);
});
