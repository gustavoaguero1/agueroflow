import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { runAgentTool, answerWithTools } from '../../server/agentTools.ts';

const h = getAdmin() as AdminHandles;
assert.ok(h);
const today = new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const set = (p: string, d: object) => h.db.doc(p).set(d);

beforeEach(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-agueroflow/databases/(default)/documents', { method: 'DELETE' });
  await set('finance_categories/c1', { orgId: 'o', nome: 'Material' });
  await set('finance_payables/p1', { orgId: 'o', status: 'aberto', vencimento: plus(-2), valor: 100, categoriaId: 'c1', fornecedor: { nome: 'A' } });
  await set('finance_payables/p2', { orgId: 'o', status: 'aberto', vencimento: plus(3), valor: 250.5, categoriaId: 'c1', fornecedor: { nome: 'B' } });
  await set('finance_payables/p3', { orgId: 'o', status: 'aberto', vencimento: plus(30), valor: 999, categoriaId: 'c1', fornecedor: { nome: 'C' } });
  await set('finance_payables/p4', { orgId: 'o', status: 'pago', vencimento: plus(1), valor: 5, categoriaId: 'c1', fornecedor: { nome: 'D' } });
  await set('finance_payables/px', { orgId: 'other', status: 'aberto', vencimento: plus(1), valor: 7, categoriaId: 'c1' });
});

test('contas_a_pagar: atrasadas, janela e categoria', async () => {
  const r: any = await runAgentTool(h, 'o', 'contas_a_pagar', { dias: 7 });
  assert.deepEqual([r.atrasadas.qtd, r.atrasadas.total, r.vencendo.qtd, r.vencendo.total], [1, 100, 1, 250.5]);
  assert.equal(r.porCategoria.Material, 350.5);
});

test('notas_pendentes: só pendentes, maiores primeiro', async () => {
  await set('nfe_documents/n1', { orgId: 'o', status: 'aguardando_classificacao', emitente: { nome: 'X' }, valorTotal: 10, numero: '1' });
  await set('nfe_documents/n2', { orgId: 'o', status: 'erro_classificacao', emitente: { nome: 'Y' }, valorTotal: 90, numero: '2' });
  await set('nfe_documents/n3', { orgId: 'o', status: 'classificada', valorTotal: 500, numero: '3' });
  const r: any = await runAgentTool(h, 'o', 'notas_pendentes');
  assert.equal(r.quantidade, 2);
  assert.equal(r.maiores[0].numero, '2');
});

test('estoque_critico: soma saldos entre unidades', async () => {
  await set('items/i1', { orgId: 'o', name: 'Parafuso', minStock: 10 });
  await set('items/i2', { orgId: 'o', name: 'Chapa', minStock: 10, criticalStock: 3 });
  await set('items/i3', { orgId: 'o', name: 'Ok', minStock: 1 });
  await set('stock_balances/b1', { orgId: 'o', itemId: 'i1', currentBalance: 4 });
  await set('stock_balances/b2', { orgId: 'o', itemId: 'i1', currentBalance: 2 });
  await set('stock_balances/b3', { orgId: 'o', itemId: 'i2', currentBalance: 2 });
  await set('stock_balances/b4', { orgId: 'o', itemId: 'i3', currentBalance: 50 });
  const r: any = await runAgentTool(h, 'o', 'estoque_critico');
  assert.deepEqual(r.itens.map((i: any) => [i.item, i.saldo, i.critico]), [['Chapa', 2, true], ['Parafuso', 6, false]]);
});

test('os_abertas: ignora concluídas, conta atrasadas', async () => {
  await set('work_order_statuses/o_feito', { id: 'feito', orgId: 'o', isCompleted: true });
  await set('work_order_statuses/o_aberto', { id: 'aberto', orgId: 'o' });
  await set('work_orders/w1', { orgId: 'o', status: 'aberto', orderNumber: '1', scheduledEndDate: plus(-1) });
  await set('work_orders/w2', { orgId: 'o', status: 'aberto', orderNumber: '2', scheduledEndDate: plus(5) });
  await set('work_orders/w3', { orgId: 'o', status: 'feito', orderNumber: '3', scheduledEndDate: plus(-9) });
  const r: any = await runAgentTool(h, 'o', 'os_abertas', {});
  assert.deepEqual([r.abertas, r.atrasadas], [2, 1]);
  const l: any = await runAgentTool(h, 'o', 'os_abertas', { atrasadas: true });
  assert.deepEqual(l.lista.map((w: any) => w.numero), ['1']);
});

test('nr_vencendo: vencidas e janela, ordenado', async () => {
  await set('field_workers/f1', { orgId: 'o', name: 'Ana', status: 'ativo', nrCertifications: [{ nrCode: 'NR-35', expirationDate: plus(10) }, { nrCode: 'NR-10', expirationDate: plus(-3) }, { nrCode: 'ASO', expirationDate: plus(90) }] });
  await set('field_workers/f2', { orgId: 'o', name: 'Zé', status: 'desligado', nrCertifications: [{ nrCode: 'NR-12', expirationDate: plus(1) }] });
  const r: any = await runAgentTool(h, 'o', 'nr_vencendo', { dias: 30 });
  assert.deepEqual(r.lista.map((x: any) => x.nr), ['NR-10', 'NR-35']);
  assert.equal(r.vencidas, 1);
});

test('funil_comercial: contagem e valor por status', async () => {
  await set('commercial_proposals/q1', { organizationId: 'o', status: 'enviada', proposedTotal: 1000 });
  await set('commercial_proposals/q2', { organizationId: 'o', status: 'negociacao', proposedTotal: 500 });
  const r: any = await runAgentTool(h, 'o', 'funil_comercial');
  assert.deepEqual(r.porStatus.enviada, { count: 1, value: 1000 });
  assert.ok(r.previsaoPonderada > 0);
});

test('ferramenta desconhecida/erro vira dado', async () => {
  assert.ok(((await runAgentTool(h, 'o', 'nada')) as any).erro);
});

test('answerWithTools: functionCall -> functionResponse -> texto final', async () => {
  const seen: any[] = [];
  const gen = async ({ contents }: any) => {
    seen.push(contents.length);
    if (seen.length === 1) return { functionCalls: [{ name: 'contas_a_pagar', args: { dias: 7 } }] };
    const last = contents.at(-1).parts[0].functionResponse;
    assert.equal(last.name, 'contas_a_pagar');
    assert.equal(last.response.atrasadas.total, 100);
    return { text: 'Atrasado: R$ 100' };
  };
  assert.equal(await answerWithTools(h, 'o', 'o que vence?', [], gen), 'Atrasado: R$ 100');
  assert.deepEqual(seen, [1, 3]);
});

test('gates: WhatsApp e web', async () => {
  const { canUseErpTools, canQueryErp } = await import('../../server/agentTools.ts');
  assert.ok(canUseErpTools({ isOwner: true, senderDigits: '', authorizedPhones: [] }));
  assert.ok(canUseErpTools({ isOwner: false, senderDigits: '551', authorizedPhones: ['551'] }));
  assert.ok(!canUseErpTools({ isOwner: false, senderDigits: '552', authorizedPhones: ['551'] }));
  assert.ok(!canUseErpTools({ isOwner: false, senderDigits: '', authorizedPhones: [''] }));
  assert.ok(canQueryErp({ master: false, orgs: { o: 'Gerente' } }, 'o'));
  assert.ok(!canQueryErp({ master: false, orgs: { o: 'Operacional' } }, 'o'));
  assert.ok(canQueryErp({ master: true, orgs: {} }, 'o'));
});
