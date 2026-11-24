import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGasesFile, planGasesWrites, gasesRows } from '../src/modules/operations/gasesImport';

const lanc = [
  { fonte: 'NF', ref: 'NF 26503', mes: 11, data: '2026-11-16', obra: 'GALPÃO', fornecedor: 'AIRGAS', gas: 'Argônio', tipo: 'Venda de gás', cilindros: 1, preco_cil: 279, base_preco: 'por cilindro', valor: 279, considerar: 'SIM', status: 'REVISAR', motivo: 'x' },
  { fonte: 'NF', ref: 'NF 26503', mes: 11, data: '2026-11-16', obra: 'GALPÃO', fornecedor: 'AIRGAS', gas: 'Argônio', tipo: 'Venda de gás', cilindros: 6, preco_cil: 195.3, base_preco: 'por cilindro', valor: 1171.8, considerar: 'SIM', status: 'REVISAR', motivo: 'x' },
  { fonte: 'PLANILHA', ref: 'JANEIRO L4', mes: 1, data: null, obra: 'TRINDADE', fornecedor: 'NÃO INFORMADO', gas: 'Argônio 5.0', tipo: 'Venda de gás', cilindros: 2, preco_cil: 394, base_preco: 'por cilindro', valor: 788, considerar: 'NÃO', status: 'REVISAR', motivo: 'y' },
];
const pend = [{ id: 1, tipo: 'NF', referencia: '000026503', fornecedor: 'AIRGAS', pendencia: 'NF não encontrada', acao: 'Conferir', situacao: 'ABERTA' }];
const bol = [{ documento: 'E04 026503-01', beneficiario: 'AIRGAS', vencimento: '2026-12-14', valor: 3650.8, nf: '000026503', status: 'OK' }];

test('reconhece cada arquivo de gases pelo formato', () => {
  assert.equal(detectGasesFile(lanc), 'lancamentos');
  assert.equal(detectGasesFile(pend), 'pendencias');
  assert.equal(detectGasesFile(bol), 'boletos');
  assert.equal(detectGasesFile({ formato: 'aguero-inox-backup' }), null);
  assert.equal(detectGasesFile([{ qualquer: 1 }]), null);
  assert.equal(detectGasesFile([]), null);
});

test('códigos estáveis: mesma NF com dois itens do mesmo gás não se sobrepõem, e reimportar dá os mesmos códigos', () => {
  const a = gasesRows('lancamentos', lanc).map((r) => r.id);
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(gasesRows('lancamentos', lanc).map((r) => r.id), a);
  assert.ok(a.every((id) => !id.includes('/')));
});

test('nenhum campo do arquivo se perde', () => {
  const [r] = gasesRows('lancamentos', [lanc[2]]);
  for (const [k, v] of Object.entries(lanc[2])) assert.deepEqual((r.data as Record<string, unknown>)[k], v, k);
});

test('grava em ops_orgs da empresa, cada tipo na sua coleção', () => {
  const w = planGasesWrites('org1', [{ kind: 'lancamentos', rows: lanc }, { kind: 'pendencias', rows: pend }, { kind: 'boletos', rows: bol }], new Map());
  const cols = w.map((x) => x.path.split('/').slice(0, 3).join('/'));
  assert.deepEqual([...new Set(cols)].sort(), ['ops_orgs/org1/gases_boletos', 'ops_orgs/org1/gases_lancamentos', 'ops_orgs/org1/gases_pendencias']);
  assert.equal(w.length, 5);
});

test('reimportar não reabre pendência já resolvida nem apaga baixa de boleto', () => {
  const [pid] = gasesRows('pendencias', pend).map((r) => r.id);
  const w = planGasesWrites('org1', [{ kind: 'pendencias', rows: pend }, { kind: 'boletos', rows: bol }], new Map([[pid, 'RESOLVIDA']]));
  const p = w.find((x) => x.path.includes('gases_pendencias'))!;
  assert.equal('situacao' in p.data, false);
  assert.equal(p.merge, true);
  const b = w.find((x) => x.path.includes('gases_boletos'))!;
  assert.equal(b.merge, true); // pago/pagoEm de quem deu baixa ficam
});
