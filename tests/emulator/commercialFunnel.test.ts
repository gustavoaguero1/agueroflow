import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { markProposalWon, markProposalLost } from '../../src/services/commercialFunnelService.ts';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'commercial_proposals/p1'), {
      id: 'p1', organizationId: 'org_a', code: 'PROP-1', title: 'Skid', clientName: 'ACME', scopeDescription: 'Montar skid',
      status: 'negociacao', proposedTotal: 1000, totalBaseCost: 600, totalFreightCost: 20, totalTaxCost: 30,
    });
  });
});

const db = () => env.authenticatedContext('u1', { orgs: { org_a: 'Operacional' } }).firestore() as any;
const user = { uid: 'u1', name: 'Op' };
const prop = { id: 'p1', organizationId: 'org_a' } as any;

test('concurrent markProposalWon creates a single work order', async () => {
  const ids = await Promise.all([markProposalWon(db(), prop, user), markProposalWon(db(), prop, user), markProposalWon(db(), prop, user)]);
  assert.equal(new Set(ids).size, 1);
  const wos = await getDocs(query(collection(db(), 'work_orders'), where('orgId', '==', 'org_a')));
  assert.equal(wos.size, 1);
  const wo = wos.docs[0].data();
  assert.equal(wo.estimatedCost, 650);
  assert.equal(wo.proposalId, 'p1');
  assert.equal(wo.status, 'aberto');
  const p = (await getDoc(doc(db(), 'commercial_proposals', 'p1'))).data() as any;
  assert.equal(p.status, 'ganha');
  assert.equal(p.workOrderId, ids[0]);
  assert.equal(p.statusHistory.length, 1);
  assert.equal((await getDoc(doc(db(), 'counters', 'org_a_work_orders'))).data()?.seq, 1);
});

test('markProposalLost requires motivo and stores it', async () => {
  await assert.rejects(markProposalLost(db(), prop, '', user), /motivo/i);
  await markProposalLost(db(), prop, 'Preço', user, 'caro');
  const p = (await getDoc(doc(db(), 'commercial_proposals', 'p1'))).data() as any;
  assert.deepEqual([p.status, p.motivoPerda], ['perdida', 'Preço: caro']);
});
