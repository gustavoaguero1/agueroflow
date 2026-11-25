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
    projectId: 'agueroflow-industrial-quality-test',
    firestore: { host: '127.0.0.1', port: 8085, rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'welding_procedures/eps_1'), { id: 'eps_1', orgId: 'org_a', code: 'EPS-01' });
    await setDoc(doc(db, 'welder_qualifications/wq_1'), { id: 'wq_1', orgId: 'org_a', stampCode: 'S-01' });
    await setDoc(doc(db, 'material_lots/lot_1'), { id: 'lot_1', orgId: 'org_a', heatNumber: 'H-01' });
    await setDoc(doc(db, 'weld_joints/j_1'), { id: 'j_1', orgId: 'org_a', jointCode: 'J-01' });
    await setDoc(doc(db, 'ndt_reports/ndt_1'), { id: 'ndt_1', orgId: 'org_a', reportCode: 'LP-01' });
    await setDoc(doc(db, 'quality_itp_matrices/itp_1'), { id: 'itp_1', orgId: 'org_a', code: 'ITP-01' });
  });
});

after(async () => {
  await env.cleanup();
});

test('Coleções de Soldagem, END, Lotes e ITP respeitam isolamento multiempresa, área e escrita exclusiva do servidor', async () => {
  const ops = asUser('u_ops', 'org_a', 'Operacional');
  const stockOnly = asUser('u_stock', 'org_a', 'Supervisor', { operacoes: 0, estoque: 1 });
  const rhOnly = asUser('u_rh', 'org_a', 'Gerente', { operacoes: 0, estoque: 0, rh: 1 });
  const noAccess = asUser('u_none', 'org_a', 'Supervisor', { operacoes: 0, estoque: 0, rh: 0 });
  const otherOrg = asUser('u_other', 'org_b', 'Admin');
  const admin = asUser('u_admin', 'org_a', 'Admin');

  // Operações lê tudo da própria empresa
  for (const path of [
    'welding_procedures/eps_1',
    'welder_qualifications/wq_1',
    'material_lots/lot_1',
    'weld_joints/j_1',
    'ndt_reports/ndt_1',
    'quality_itp_matrices/itp_1',
  ]) {
    await assertSucceeds(getDoc(doc(ops, path)));
    await assertFails(getDoc(doc(noAccess, path)));
    await assertFails(getDoc(doc(otherOrg, path)));
    // Escrita direta pelo cliente é bloqueada mesmo para Admin
    await assertFails(setDoc(doc(admin, `${path}_client`), { orgId: 'org_a' }));
  }

  // Estoque pode ler material_lots; RH pode ler welder_qualifications
  await assertSucceeds(getDoc(doc(stockOnly, 'material_lots/lot_1')));
  await assertFails(getDoc(doc(stockOnly, 'weld_joints/j_1')));
  await assertSucceeds(getDoc(doc(rhOnly, 'welder_qualifications/wq_1')));
  await assertFails(getDoc(doc(rhOnly, 'ndt_reports/ndt_1')));
});
