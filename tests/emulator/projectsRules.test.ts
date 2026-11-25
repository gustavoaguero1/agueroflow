import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas.ts';

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'units/unit_a'), { orgId: 'org_a', name: 'Planta A', code: 'PA' });
    await setDoc(doc(db, 'units/unit_b'), { orgId: 'org_b', name: 'Planta B', code: 'PB' });
    await setDoc(doc(db, 'contracts/ct_a'), { orgId: 'org_a', title: 'Contrato A', status: 'ativo' });
    await setDoc(doc(db, 'contracts/ct_b'), { orgId: 'org_b', title: 'Contrato B', status: 'ativo' });
    await setDoc(doc(db, 'cost_centers/cc_a'), { orgId: 'org_a', code: 'CC-01', name: 'Montagem' });
    await setDoc(doc(db, 'cost_centers/cc_b'), { orgId: 'org_b', code: 'CC-99', name: 'Outro' });
    await setDoc(doc(db, 'projects/prj_a1'), {
      id: 'prj_a1',
      orgId: 'org_a',
      code: 'OBRA-2026-001',
      name: 'Montagem Industrial Planta A',
      status: 'planejamento',
      unitId: 'unit_a',
      contractId: 'ct_a',
      costCenterId: 'cc_a',
      createdByUid: 'u_admin',
      createdByName: 'Admin Org A',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    });
  });
});

const asOrg = (uid: string, org: string, role: string, areas?: string) =>
  env.authenticatedContext(uid, {
    master: false,
    orgs: { [org]: role },
    ...(areas ? { areas: { [org]: areas } } : {}),
  }).firestore();

const withArea = (role: 'Supervisor' | 'Operacional' | 'Visualizador', patch: Record<string, 0 | 1 | 2>) =>
  encodeAreas({ ...resolveAreas(role), ...patch });

test('projects: authorized managers/supervisors create and update with org-owned references; delete is denied', async () => {
  const supervisor = asOrg('u_sup', 'org_a', 'Supervisor');
  const validProject = {
    id: 'prj_a2',
    orgId: 'org_a',
    code: 'OBRA-2026-002',
    name: 'Caldeiraria Pesada',
    status: 'planejamento',
    unitId: 'unit_a',
    contractId: 'ct_a',
    costCenterId: 'cc_a',
    createdByUid: 'u_sup',
    createdByName: 'Supervisor A',
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  };

  await assertSucceeds(setDoc(doc(supervisor, 'projects/prj_a2'), validProject));
  await assertSucceeds(updateDoc(doc(supervisor, 'projects/prj_a2'), { status: 'em_execucao', updatedAt: '2026-03-03T10:00:00.000Z' }));
  await assertFails(deleteDoc(doc(supervisor, 'projects/prj_a2')));
  await assertFails(deleteDoc(doc(asOrg('u_admin', 'org_a', 'Admin'), 'projects/prj_a2')));
});

test('projects: rejects default_unit, cross-org unit/contract/costCenter, and non-manager writes', async () => {
  const adminA = asOrg('u_admin', 'org_a', 'Admin');
  const base = {
    id: 'prj_bad',
    orgId: 'org_a',
    code: 'OBRA-BAD',
    name: 'Obra Referencia Invalida',
    status: 'planejamento',
    unitId: 'unit_a',
    contractId: 'ct_a',
    costCenterId: 'cc_a',
    createdByUid: 'u_admin',
    createdByName: 'Admin A',
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  };

  await assertFails(setDoc(doc(adminA, 'projects/prj_bad'), { ...base, unitId: 'default_unit' }));
  await assertFails(setDoc(doc(adminA, 'projects/prj_bad'), { ...base, unitId: 'unit_b' }));
  await assertFails(setDoc(doc(adminA, 'projects/prj_bad'), { ...base, contractId: 'ct_b' }));
  await assertFails(setDoc(doc(adminA, 'projects/prj_bad'), { ...base, costCenterId: 'cc_b' }));

  const operational = asOrg('u_op', 'org_a', 'Operacional');
  await assertFails(setDoc(doc(operational, 'projects/prj_op'), { ...base, id: 'prj_op', createdByUid: 'u_op' }));
  await assertFails(updateDoc(doc(operational, 'projects/prj_a1'), { status: 'em_execucao' }));
});

test('projects: enforces multi-tenant isolation and area permissions on read/write', async () => {
  // Foreign org cannot read or write
  await assertFails(getDoc(doc(asOrg('u_b', 'org_b', 'Admin'), 'projects/prj_a1')));

  // Same org with Operations / Commercial / Stock / Finance read access can read
  await assertSucceeds(getDoc(doc(asOrg('u_vis', 'org_a', 'Visualizador'), 'projects/prj_a1')));

  // Member stripped of Ops, Com, Stock and Finance read access cannot read projects
  const noAreaRead = asOrg(
    'u_none',
    'org_a',
    'Visualizador',
    withArea('Visualizador', { operacoes: 0, comercial: 0, estoque: 0, financeiro: 0 }),
  );
  await assertFails(getDoc(doc(noAreaRead, 'projects/prj_a1')));

  // Supervisor without Ops/Com write cannot update project
  const supNoWrite = asOrg(
    'u_sup_ro',
    'org_a',
    'Supervisor',
    withArea('Supervisor', { operacoes: 1, comercial: 1 }),
  );
  await assertFails(updateDoc(doc(supNoWrite, 'projects/prj_a1'), { status: 'em_execucao' }));
});

test('optional projectId works alongside legacy records on work_orders, RDO, purchasing, and finance', async () => {
  const adminA = asOrg('u_admin', 'org_a', 'Admin');

  // Work order with optional projectId AND legacy work order without projectId both succeed
  await assertSucceeds(setDoc(doc(adminA, 'work_orders/wo_with_prj'), {
    id: 'wo_with_prj',
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'ct_a',
    projectId: 'prj_a1',
    orderNumber: 'OS-2026-010',
    title: 'OS com projeto',
    description: 'Teste',
    priority: 'media',
    status: 'aberto',
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  }));
  await assertSucceeds(setDoc(doc(adminA, 'work_orders/wo_legacy'), {
    id: 'wo_legacy',
    orgId: 'org_a',
    unitId: 'unit_a',
    orderNumber: 'OS-2026-011',
    title: 'OS legada sem projeto',
    description: 'Teste',
    priority: 'media',
    status: 'aberto',
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  }));

  // Purchasing requisition with optional projectId
  await assertSucceeds(setDoc(doc(adminA, 'purchasing_requisitions/rc_with_prj'), {
    id: 'rc_with_prj',
    organizationId: 'org_a',
    projectId: 'prj_a1',
    code: 'RC-2026-001',
    title: 'Tubos Inox',
    status: 'pendente',
  }));

  // Finance payable with optional projectId
  await assertSucceeds(setDoc(doc(adminA, 'finance_payables/pay_org_a_prj1'), {
    id: 'pay_org_a_prj1',
    orgId: 'org_a',
    projectId: 'prj_a1',
    origem: 'manual',
    fornecedor: { nome: 'Fornecedor A' },
    documento: 'NF-100',
    valor: 1500,
    vencimento: '2026-04-01',
    status: 'aberto',
    categoriaId: 'cat_org_a_dir',
    createdBy: 'u_admin',
    createdAt: '2026-03-02T10:00:00.000Z',
  }));
});
