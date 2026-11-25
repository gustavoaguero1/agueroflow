import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas.ts';
import type { UserRole } from '../../src/types/index.ts';

let env: RulesTestEnvironment;
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const asUser = (uid: string, orgId: string, role: UserRole, areaOverrides?: Record<string, 0 | 1 | 2>) => {
  const levels = resolveAreas(role, undefined, areaOverrides as any);
  return env.authenticatedContext(uid, {
    orgs: { [orgId]: role },
    areas: { [orgId]: encodeAreas(levels) },
  }).firestore();
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'agueroflow-pr58-p2-portal-ai-protheus-test',
    firestore: { host: '127.0.0.1', port: 8085, rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'client_portal_grants/cpg_1'), { id: 'cpg_1', orgId: 'org_a', clientName: 'Alfa' });
    await setDoc(doc(db, 'client_portal_audit/cpaud_1'), { id: 'cpaud_1', orgId: 'org_a', action: 'view_summary' });
    await setDoc(doc(db, 'ai_action_proposals/aia_1'), { id: 'aia_1', orgId: 'org_a', status: 'aguardando_confirmacao' });
    await setDoc(doc(db, 'ai_action_audit/aiaud_1'), { id: 'aiaud_1', orgId: 'org_a', actionType: 'create_work_order_draft' });
    await setDoc(doc(db, 'protheus_sync_records/prth_1'), { id: 'prth_1', orgId: 'org_a', status: 'sincronizado' });
    await setDoc(doc(db, 'job_locks/lock_1'), { lockKey: 'k1', ownerId: 'srv1' });
    await setDoc(doc(db, 'durable_jobs/djob_1'), { id: 'djob_1', orgId: 'org_a', status: 'queued' });
  });
});

after(async () => {
  await env.cleanup();
});

test('Portal do Cliente, IA com confirmação, Protheus e Infra durável respeitam segregação estrita e escrita server-only', async () => {
  const admin = asUser('u_admin', 'org_a', 'Admin');
  const op = asUser('u_op', 'org_a', 'Operacional');
  const fin = asUser('u_fin', 'org_a', 'Supervisor', { financeiro: 1, estoque: 0, operacoes: 0 });
  const otherOrg = asUser('u_other', 'org_b', 'Admin');

  // client_portal_grants: apenas Admin/Gerente com Operações lê; Operacional e outra empresa negados; cliente nunca grava
  await assertSucceeds(getDoc(doc(admin, 'client_portal_grants/cpg_1')));
  await assertFails(getDoc(doc(op, 'client_portal_grants/cpg_1')));
  await assertFails(getDoc(doc(otherOrg, 'client_portal_grants/cpg_1')));
  await assertFails(setDoc(doc(admin, 'client_portal_grants/cpg_client'), { orgId: 'org_a' }));

  // client_portal_audit
  await assertSucceeds(getDoc(doc(op, 'client_portal_audit/cpaud_1')));
  await assertFails(getDoc(doc(otherOrg, 'client_portal_audit/cpaud_1')));
  await assertFails(setDoc(doc(admin, 'client_portal_audit/cpaud_client'), { orgId: 'org_a' }));

  // ai_action_proposals & ai_action_audit
  await assertSucceeds(getDoc(doc(op, 'ai_action_proposals/aia_1')));
  await assertFails(getDoc(doc(otherOrg, 'ai_action_proposals/aia_1')));
  await assertFails(setDoc(doc(admin, 'ai_action_proposals/aia_client'), { orgId: 'org_a' }));
  await assertSucceeds(getDoc(doc(admin, 'ai_action_audit/aiaud_1')));
  await assertFails(getDoc(doc(otherOrg, 'ai_action_audit/aiaud_1')));

  // protheus_sync_records: Financeiro/Estoque lê, Operacional sem fin/estoque negado, escrita server-only
  await assertSucceeds(getDoc(doc(fin, 'protheus_sync_records/prth_1')));
  await assertFails(getDoc(doc(otherOrg, 'protheus_sync_records/prth_1')));
  await assertFails(setDoc(doc(admin, 'protheus_sync_records/prth_client'), { orgId: 'org_a' }));

  // job_locks & durable_jobs: 100% server-only (mesmo Admin não lê nem escreve)
  await assertFails(getDoc(doc(admin, 'job_locks/lock_1')));
  await assertFails(getDoc(doc(admin, 'durable_jobs/djob_1')));
});
