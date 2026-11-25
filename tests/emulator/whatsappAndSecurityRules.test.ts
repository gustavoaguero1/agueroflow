import test, { after, before, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { encodeAreas, resolveAreas } from '../../src/permissions/areas';

const PROJECT_ID = 'demo-agueroflow';
let env: RulesTestEnvironment;

const ctx = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8085,
    },
    storage: {
      rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

after(async () => {
  await env?.cleanup();
});

test('whatsapp_* collections enforce strict orgId isolation and WhatsApp area levels', async () => {
  const adminA = ctx('admin_a', { orgs: { org_a: 'Admin' } }).firestore();
  const adminB = ctx('admin_b', { orgs: { org_b: 'Admin' } }).firestore();
  const opA = ctx('op_a', { orgs: { org_a: 'Operacional' } }).firestore(); // whatsapp level 1 (read-only)
  const noWaAreas = encodeAreas({ ...resolveAreas('Admin'), whatsapp: 0 });
  const noWaA = ctx('nowa_a', { orgs: { org_a: 'Admin' }, areas: { org_a: noWaAreas } }).firestore();

  // Admin of org_a can create org-scoped WhatsApp docs
  await assertSucceeds(
    setDoc(doc(adminA, 'whatsapp_contacts', 'c_a'), {
      id: 'c_a',
      orgId: 'org_a',
      organizationId: 'org_a',
      name: 'Contato A',
    }),
  );
  await assertSucceeds(
    setDoc(doc(adminA, 'whatsapp_nd_records', 'nd_a'), {
      id: 'nd_a',
      orgId: 'org_a',
      organizationId: 'org_a',
      receiverName: 'Recebedor A',
      amount: 150,
    }),
  );

  // Unowned WhatsApp document is rejected
  await assertFails(
    setDoc(doc(adminA, 'whatsapp_contacts', 'c_unowned'), {
      id: 'c_unowned',
      name: 'Sem empresa',
    }),
  );

  // Cross-org member (org_b) is denied reading or mutating org_a WhatsApp docs
  await assertFails(getDoc(doc(adminB, 'whatsapp_contacts', 'c_a')));
  await assertFails(updateDoc(doc(adminB, 'whatsapp_contacts', 'c_a'), { name: 'Tampered' }));
  await assertFails(deleteDoc(doc(adminB, 'whatsapp_contacts', 'c_a')));
  await assertFails(getDoc(doc(adminB, 'whatsapp_nd_records', 'nd_a')));

  // Operacional (whatsapp level 1) can read own org, but cannot write/delete
  await assertSucceeds(getDoc(doc(opA, 'whatsapp_contacts', 'c_a')));
  await assertFails(
    setDoc(doc(opA, 'whatsapp_contacts', 'c_op'), {
      id: 'c_op',
      orgId: 'org_a',
      organizationId: 'org_a',
      name: 'Blocked Write',
    }),
  );

  // Member with whatsapp area = 0 cannot even read own org WhatsApp docs
  await assertFails(getDoc(doc(noWaA, 'whatsapp_contacts', 'c_a')));
  await assertFails(getDoc(doc(noWaA, 'whatsapp_nd_records', 'nd_a')));

  // whatsapp_nd_records never allows client delete, even for same-org Admin
  await assertFails(deleteDoc(doc(adminA, 'whatsapp_nd_records', 'nd_a')));
});

test('hr-onboardings Storage path is server-only for writes and restricted to same-org RH for reads', async () => {
  await env.withSecurityRulesDisabled(async (adminCtx) => {
    const storage = adminCtx.storage();
    await uploadBytes(
      ref(storage, 'hr-onboardings/org_a/onb_1/rgFront.pdf'),
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { contentType: 'application/pdf' },
    );
  });

  const adminA = ctx('admin_a', { orgs: { org_a: 'Admin' } }).storage();
  const gerenteA = ctx('ger_a', { orgs: { org_a: 'Gerente' } }).storage(); // RH level 1
  const supA = ctx('sup_a', { orgs: { org_a: 'Supervisor' } }).storage(); // RH level 0
  const adminB = ctx('admin_b', { orgs: { org_b: 'Admin' } }).storage();

  // Same-org RH readers (Admin/Gerente) can read
  await assertSucceeds(getBytes(ref(adminA, 'hr-onboardings/org_a/onb_1/rgFront.pdf')));
  await assertSucceeds(getBytes(ref(gerenteA, 'hr-onboardings/org_a/onb_1/rgFront.pdf')));

  // Same-org non-RH (Supervisor) and cross-org Admin cannot read
  await assertFails(getBytes(ref(supA, 'hr-onboardings/org_a/onb_1/rgFront.pdf')));
  await assertFails(getBytes(ref(adminB, 'hr-onboardings/org_a/onb_1/rgFront.pdf')));

  // Client direct upload is denied even for same-org Admin (server-only via Admin SDK)
  await assertFails(
    uploadBytes(
      ref(adminA, 'hr-onboardings/org_a/onb_1/direct.pdf'),
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { contentType: 'application/pdf' },
    ),
  );
});
