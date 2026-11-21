import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { applyStockMovement } from '../../src/services/stockService.ts';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = () => env.authenticatedContext('u1', { orgs: { org_a: 'Operacional' } }).firestore() as any;
const item = { id: 'it1', sku: 'S1', name: 'Parafuso', unitOfMeasure: 'un' };
const user = { uid: 'u1', name: 'Op' };
const base = { orgId: 'org_a', unitId: 'u_a', item, user, reason: 'Teste de movimento' };
const bal = async (u: string) => (await getDoc(doc(db(), 'stock_balances', `bal_${u}_it1`))).data() as any;
const seed = (qty: number) => applyStockMovement(db(), { ...base, type: 'entrada', quantity: qty });

test('concurrent saidas never negative', async () => {
  await seed(10);
  const r = await Promise.allSettled(Array.from({ length: 5 }, () => applyStockMovement(db(), { ...base, type: 'saida', quantity: 4 })));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 2);
  const rej = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
  assert.match(rej.reason.message, /Saldo insuficiente/);
  assert.equal((await bal('u_a')).currentBalance, 2);
});

test('transfer moves between units', async () => {
  await seed(10);
  const r = await applyStockMovement(db(), { ...base, type: 'transferencia', quantity: 3, toUnitId: 'u_b' });
  assert.equal(r.movementIds.length, 2);
  assert.equal((await bal('u_a')).currentBalance, 7);
  assert.equal((await bal('u_b')).currentBalance, 3);
  await assert.rejects(applyStockMovement(db(), { ...base, type: 'transferencia', quantity: 99, toUnitId: 'u_b' }), /Saldo insuficiente/);
});

test('average cost', async () => {
  await applyStockMovement(db(), { ...base, type: 'entrada', quantity: 10, unitCost: 2 });
  await applyStockMovement(db(), { ...base, type: 'entrada', quantity: 10, unitCost: 4 });
  assert.equal((await bal('u_a')).averageCost, 3);
  await applyStockMovement(db(), { ...base, type: 'saida', quantity: 5 });
  assert.equal((await bal('u_a')).averageCost, 3);
});

test('duplicate sourceRef rejected', async () => {
  const input = { ...base, type: 'entrada' as const, quantity: 5, sourceRef: 'nfe:123:1' };
  await applyStockMovement(db(), input);
  await assert.rejects(applyStockMovement(db(), input), /Movimento já registrado/);
  assert.equal((await bal('u_a')).currentBalance, 5);
});

test('ajuste requires reason', async () => {
  await assert.rejects(applyStockMovement(db(), { ...base, type: 'ajuste', quantity: 5, reason: 'x' }), /justificativa/);
  const r = await applyStockMovement(db(), { ...base, type: 'ajuste', quantity: 5 });
  assert.equal(r.balanceAfter, 5);
});
