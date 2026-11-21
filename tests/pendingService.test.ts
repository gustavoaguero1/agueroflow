import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingItems, todaySaoPaulo, type PendingData } from '../src/services/pendingService';

const base: PendingData = {
  hoje: '2026-11-21', payables: [], nfes: [], stock: [], certAlerts: [], assets: [], workOrders: [], completedStatusIds: ['concluida'], proposals: [],
};
const run = (p: Partial<PendingData>) => buildPendingItems({ ...base, ...p });

test('payables: overdue is critical, due within 7 days is attention, paid/far ignored', () => {
  const r = run({ payables: [
    { id: 'a', status: 'aberto', vencimento: '2026-11-20', valor: 100, fornecedor: { nome: 'A' } },
    { id: 'b', status: 'aberto', vencimento: '2026-11-28', valor: 50, fornecedor: { nome: 'B' } },
    { id: 'c', status: 'aberto', vencimento: '2026-11-29', valor: 50, fornecedor: { nome: 'C' } },
    { id: 'd', status: 'pago', vencimento: '2026-11-01', valor: 50, fornecedor: { nome: 'D' } },
  ] });
  assert.deepEqual(r.map((i) => [i.id, i.severity]), [['pay:a', 'critico'], ['pay:b', 'atencao']]);
  assert.equal(r[0].acao.section, 'financeiro-pagar');
});

test('nfe: waiting is attention, classification error is critical', () => {
  const r = run({ nfes: [
    { id: 'n1', status: 'aguardando_classificacao', emitente: { nome: 'X' }, numero: '1', emitidaEm: '2026-11-10' },
    { id: 'n2', status: 'erro_classificacao', emitente: { nome: 'Y' }, numero: '2', emitidaEm: '2026-11-11' },
    { id: 'n3', status: 'classificada', emitente: { nome: 'Z' } },
  ] });
  assert.deepEqual(r.map((i) => [i.id, i.severity]), [['nfe:n2', 'critico'], ['nfe:n1', 'atencao']]);
  assert.equal(r[1].titulo, 'Falta informar a obra');
});

test('stock: critical vs minimum', () => {
  const r = run({ stock: [
    { id: 's1', itemName: 'Eletrodo', currentBalance: 1, minStock: 10, criticalStock: 2 },
    { id: 's2', itemName: 'Luva', currentBalance: 5, minStock: 5 },
    { id: 's3', itemName: 'Disco', currentBalance: 50, minStock: 5 },
  ] });
  assert.deepEqual(r.map((i) => [i.id, i.severity]), [['stk:s1', 'critico'], ['stk:s2', 'atencao']]);
});

test('certifications and collective assets', () => {
  const r = run({
    certAlerts: [{ id: 'w1c1', workerName: 'João', nrCode: 'NR-35', daysRemaining: -3 }, { id: 'w2c1', workerName: 'Ana', nrCode: 'ASO', daysRemaining: 20 }, { id: 'w3c1', workerName: 'Zé', nrCode: 'NR-10', daysRemaining: 60 }],
    assets: [{ id: 'a1', code: 'PT-1', description: 'Talha', alert: 'VENCIDO' }, { id: 'a2', code: 'PT-2', description: 'X', alert: 'A_VENCER' }, { id: 'a3', code: 'PT-3', description: 'Y', alert: 'EM_DIA' }],
  });
  assert.deepEqual(r.map((i) => [i.id, i.severity]), [['cert:w1c1', 'critico'], ['asset:a1', 'critico'], ['asset:a2', 'atencao'], ['cert:w2c1', 'atencao']]);
});

test('work orders: past due and not completed per configured statuses', () => {
  const r = run({ completedStatusIds: ['feito'], workOrders: [
    { id: 'o1', orderNumber: 'OS-1', title: 'T', status: 'em_execucao', scheduledEndDate: '2026-11-10' },
    { id: 'o2', orderNumber: 'OS-2', title: 'T', status: 'feito', scheduledEndDate: '2026-11-10' },
    { id: 'o3', orderNumber: 'OS-3', title: 'T', status: 'em_execucao', scheduledEndDate: '2026-11-25' },
  ] });
  assert.deepEqual(r.map((i) => i.id), ['wo:o1']);
});

test('proposals stale > 7 days in enviada/negociacao', () => {
  const r = run({ proposals: [
    { id: 'p1', code: 'P1', clientName: 'C', status: 'enviada', updatedAt: '2026-11-10T10:00:00Z' },
    { id: 'p2', code: 'P2', clientName: 'C', status: 'negociacao', updatedAt: '2026-11-20T10:00:00Z' },
    { id: 'p3', code: 'P3', clientName: 'C', status: 'aprovada', updatedAt: '2026-01-01T10:00:00Z' },
  ] });
  assert.deepEqual(r.map((i) => [i.id, i.severity]), [['prop:p1', 'info']]);
});

test('orders by severity then oldest date', () => {
  const r = run({ payables: [
    { id: 'late2', status: 'aberto', vencimento: '2026-11-19', valor: 1, fornecedor: { nome: 'A' } },
    { id: 'late1', status: 'aberto', vencimento: '2026-11-10', valor: 1, fornecedor: { nome: 'A' } },
    { id: 'soon', status: 'aberto', vencimento: '2026-11-22', valor: 1, fornecedor: { nome: 'A' } },
  ] });
  assert.deepEqual(r.map((i) => i.id), ['pay:late1', 'pay:late2', 'pay:soon']);
});

test('todaySaoPaulo uses BRT, not UTC', () => {
  // 23:30 BRT on 21/11 is already 22/11 in UTC
  assert.equal(todaySaoPaulo(new Date('2026-11-22T02:30:00Z')), '2026-11-21');
});
