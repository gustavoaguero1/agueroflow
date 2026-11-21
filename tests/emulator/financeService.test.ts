import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { classifyNfe, ensureDefaultCategories, finalizeRun, registeredEntries, releaseStuckNfe } from '../../src/services/financeService.ts';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });

const NFE = 'org_a_K1';
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'items/it1'), { id: 'it1', orgId: 'org_a', sku: 'A001', name: 'Chapa', unitOfMeasure: 'KG' });
    await setDoc(doc(db, `nfe_documents/${NFE}`), {
      orgId: 'org_a', chave: 'K1', numero: '1234', emitidaEm: '2026-11-10T10:30:00-03:00', valorTotal: 585, status: 'aguardando_classificacao',
      emitente: { cnpj: '11111111000111', nome: 'FORNECEDOR' },
      itens: [
        { n: 1, descricao: 'Chapa', ncm: '7219', cfop: '5102', quantidade: 10, valorUnitario: 25.5, valorTotal: 255 },
        { n: 2, descricao: 'Eletrodo', ncm: '8311', cfop: '5102', quantidade: 2, valorUnitario: 150, valorTotal: 300 },
      ],
      duplicatas: [{ numero: '001', vencimento: '2026-12-10', valor: 292.5 }, { numero: '002', vencimento: '2027-01-10', valor: 292.5 }],
    });
  });
});

const db = (role = 'Gerente') => env.authenticatedContext('u1', { orgs: { org_a: role } }).firestore() as any;
const input = {
  orgId: 'org_a', nfeId: NFE, user: { uid: 'u1', name: 'Ger' }, rememberRules: true,
  lines: [
    { n: 1, destino: 'estoque' as const, categoriaId: 'cat_mat', itemId: 'it1', unitId: 'u_a' },
    { n: 2, destino: 'despesa' as const, categoriaId: 'cat_cons', contractId: 'k1' },
  ],
};
const payables = async () => (await getDocs(query(collection(db(), 'finance_payables'), where('orgId', '==', 'org_a')))).docs.map((d) => d.data());
const balance = async () => (await getDoc(doc(db(), 'stock_balances/bal_u_a_it1'))).data()?.currentBalance;
const nfe = async () => (await getDoc(doc(db(), `nfe_documents/${NFE}`))).data()!;

test('classify twice applies once', async () => {
  const r = await Promise.allSettled([classifyNfe(db(), input), classifyNfe(db(), input)]);
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  await assert.rejects(classifyNfe(db(), input), /Nota já classificada/);
  assert.equal(await balance(), 10);
  const ps = await payables();
  assert.equal(ps.length, 2);
  assert.equal(ps.reduce((s, p) => s + p.valor, 0), 585);
  const n = await nfe();
  assert.equal(n.status, 'classificada');
  assert.equal(n.classificacao.lines.length, 2);
  assert.equal((await getDoc(doc(db(), 'finance_rules/rule_org_a_11111111000111_7219'))).data()?.categoriaId, 'cat_mat');
  const bal = (await getDoc(doc(db(), 'stock_balances/bal_u_a_it1'))).data()!;
  assert.equal(bal.averageCost, 26.8784); // 255 × (585 / 555) / 10: freight etc. spread into stock cost
});

test('payables failure marks error; retry does not duplicate stock', async () => {
  // Make payables fail: a paid payable with the same id but another org blocks the transaction (read denied).
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'finance_payables/pay_org_a_K1_001'), { orgId: 'org_b' }));
  await assert.rejects(classifyNfe(db(), input));
  let n = await nfe();
  assert.equal(n.status, 'erro_classificacao');
  assert.ok(n.erroClassificacao);
  assert.equal(await balance(), 10);
  // retry may not move the line already in stock elsewhere
  await assert.rejects(classifyNfe(db(), { ...input, lines: [{ ...input.lines[0], destino: 'despesa' }, input.lines[1]] }), /entrada em estoque já registrada/);
  await assert.rejects(classifyNfe(db(), { ...input, lines: [{ ...input.lines[0], unitId: 'u_b' }, input.lines[1]] }), /entrada em estoque já registrada/);
  assert.equal((await nfe()).status, 'erro_classificacao');
  assert.deepEqual([...(await registeredEntries(db(), 'org_a', n as any))], [[1, { itemId: 'it1', unitId: 'u_a' }]]);
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'finance_payables/pay_org_a_K1_001'), { orgId: 'org_a', valor: 292.5, status: 'pago' }));
  await classifyNfe(db(), input);
  n = await nfe();
  assert.equal(n.status, 'classificada');
  assert.equal(n.erroClassificacao, undefined);
  assert.equal(await balance(), 10);
  const ps = await payables();
  assert.equal(ps.length, 2);
  assert.equal((await getDoc(doc(db(), 'finance_payables/pay_org_a_K1_001'))).data()?.status, 'pago'); // never overwritten
});

const stuck = () => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `nfe_documents/${NFE}`), {
  status: 'classificando', classificacao: { runId: 'old', by: 'other', startedAt: Timestamp.fromMillis(Date.now() - 3 * 60_000) },
}, { merge: true }));

test('invalid lines rejected before the guard; stuck classificando can be released', async () => {
  await assert.rejects(classifyNfe(db(), { ...input, lines: [{ ...input.lines[0], unitId: undefined }, input.lines[1]] }), /estoque exige/);
  assert.equal((await nfe()).status, 'aguardando_classificacao');
  await stuck();
  await assert.rejects(classifyNfe(db(), input), /Nota já classificada/);
  await assert.rejects(releaseStuckNfe(db('Supervisor'), NFE)); // Admin/Gerente only
  await releaseStuckNfe(db(), NFE);
  await classifyNfe(db(), input);
  assert.equal((await nfe()).status, 'classificada');
});

test('stale run cannot finalize after release', async () => {
  await stuck();
  await releaseStuckNfe(db(), NFE);
  assert.equal(await finalizeRun(db(), NFE, 'old', { status: 'classificada' }), false);
  assert.equal((await nfe()).status, 'erro_classificacao');
  await classifyNfe(db(), input); // new run takes over
  assert.equal(await finalizeRun(db(), NFE, 'old', { status: 'erro_classificacao', erroClassificacao: 'x' }), false);
  const n = await nfe();
  assert.equal(n.status, 'classificada');
  assert.equal(n.erroClassificacao, undefined);
});

test('duplicatas above vNF block classification; short ones get a saldo parcela', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `nfe_documents/${NFE}`), {
    duplicatas: [{ numero: '001', vencimento: '2026-12-10', valor: 600 }],
  }, { merge: true }));
  await assert.rejects(classifyNfe(db(), input), /a mais que o total/);
  assert.equal((await nfe()).status, 'aguardando_classificacao');
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `nfe_documents/${NFE}`), {
    duplicatas: [{ numero: '001', vencimento: '2026-12-10', valor: 500 }],
  }, { merge: true }));
  await classifyNfe(db(), input);
  const ps = await payables();
  assert.deepEqual(ps.map((p) => [p.parcela, p.valor]).sort(), [['001', 500], ['saldo', 85]]);
});

test('default chart created once', async () => {
  const [a, b] = await Promise.all([ensureDefaultCategories(db(), 'org_a'), ensureDefaultCategories(db(), 'org_a')]);
  assert.ok(a || b);
  assert.equal(await ensureDefaultCategories(db(), 'org_a'), false);
  const cats = await getDocs(query(collection(db(), 'finance_categories'), where('orgId', '==', 'org_a')));
  assert.equal(cats.size, 15);
});
