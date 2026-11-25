import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

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
    await setDoc(doc(db, 'rh_directory/emp_a1'), { id: 'emp_a1', rhEmployeeId: 'emp_a1', orgId: 'org_a', name: 'Carlos A', active: true });
    await setDoc(doc(db, 'rh_directory/emp_b1'), { id: 'emp_b1', rhEmployeeId: 'emp_b1', orgId: 'org_b', name: 'Carlos B', active: true });
    await setDoc(doc(db, 'items/item_a1'), { id: 'item_a1', orgId: 'org_a', sku: 'SKU-A1', name: 'Tubo Inox', active: true });
    await setDoc(doc(db, 'items/item_b1'), { id: 'item_b1', orgId: 'org_b', sku: 'SKU-B1', name: 'Tubo B', active: true });
  });
});

const asAdmin = (uid: string, org: string) =>
  env.authenticatedContext(uid, { master: false, orgs: { [org]: 'Admin' } }).firestore();

test('collective_asset_workers: allows same-org rhEmployeeId and legacy unlinked docs, denies cross-org or nonexistent rhEmployeeId', async () => {
  const adminA = asAdmin('u_a', 'org_a');

  await assertSucceeds(setDoc(doc(adminA, 'collective_asset_workers/caw_a1'), {
    id: 'caw_a1',
    orgId: 'org_a',
    rhEmployeeId: 'emp_a1',
    name: 'Carlos A',
    registrationNumber: 'MAT-1',
    department: 'Obras',
    role: 'Soldador',
    active: true,
  }));

  await assertSucceeds(setDoc(doc(adminA, 'collective_asset_workers/wrk_legacy'), {
    id: 'wrk_legacy',
    orgId: 'org_a',
    name: 'Legado Sem Link',
    registrationNumber: 'LEG-1',
    department: 'Obras',
    role: 'Auxiliar',
    active: true,
  }));

  // Cross-org and nonexistent rhEmployeeId must fail
  await assertFails(setDoc(doc(adminA, 'collective_asset_workers/caw_cross'), {
    id: 'caw_cross',
    orgId: 'org_a',
    rhEmployeeId: 'emp_b1',
    name: 'Carlos B',
    active: true,
  }));
  await assertFails(setDoc(doc(adminA, 'collective_asset_workers/caw_missing'), {
    id: 'caw_missing',
    orgId: 'org_a',
    rhEmployeeId: 'emp_inexistente',
    name: 'Ghost',
    active: true,
  }));
  await assertFails(updateDoc(doc(adminA, 'collective_asset_workers/wrk_legacy'), { rhEmployeeId: 'emp_b1' }));
  await assertSucceeds(updateDoc(doc(adminA, 'collective_asset_workers/wrk_legacy'), { rhEmployeeId: 'emp_a1' }));
});

test('commercial_materials: allows same-org masterItemId and legacy unlinked materials, denies cross-org or nonexistent masterItemId', async () => {
  const adminA = asAdmin('u_a', 'org_a');

  await assertSucceeds(setDoc(doc(adminA, 'commercial_materials/cm_linked'), {
    id: 'cm_linked',
    organizationId: 'org_a',
    internalCode: 'SKU-A1',
    normalizedDescription: 'Tubo Inox',
    masterItemId: 'item_a1',
    masterLinkStatus: 'linked',
  }));

  await assertSucceeds(setDoc(doc(adminA, 'commercial_materials/cm_legacy'), {
    id: 'cm_legacy',
    organizationId: 'org_a',
    internalCode: 'LEG-01',
    normalizedDescription: 'Material Legado',
  }));

  await assertFails(setDoc(doc(adminA, 'commercial_materials/cm_cross'), {
    id: 'cm_cross',
    organizationId: 'org_a',
    internalCode: 'BAD-1',
    masterItemId: 'item_b1',
  }));
  await assertFails(setDoc(doc(adminA, 'commercial_materials/cm_missing'), {
    id: 'cm_missing',
    organizationId: 'org_a',
    internalCode: 'BAD-2',
    masterItemId: 'item_inexistente',
  }));
  await assertFails(updateDoc(doc(adminA, 'commercial_materials/cm_legacy'), { masterItemId: 'item_b1' }));
  await assertSucceeds(updateDoc(doc(adminA, 'commercial_materials/cm_legacy'), { masterItemId: 'item_a1', masterLinkStatus: 'linked' }));
});
