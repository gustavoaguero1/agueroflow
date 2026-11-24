import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});

after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const dbFor = (uid: string, role: string, orgId = 'org_a') =>
  env.authenticatedContext(uid, { orgs: { [orgId]: role } }).firestore();

const documentId = 'eng_org_a_ISO-101_A';

async function seedReferences() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'units/unit_a'), { id: 'unit_a', orgId: 'org_a', name: 'Fábrica A' });
    await setDoc(doc(db, 'contracts/contract_a'), { id: 'contract_a', orgId: 'org_a', title: 'Montagem de tubulação' });
  });
}

function validEngineeringDocument(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id: documentId,
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    documentGroupId: 'eng_org_a_ISO-101',
    documentCode: 'ISO-101',
    title: 'Isométrico da linha de produto',
    documentType: 'isometrico',
    revision: 'A',
    filePath: `engineering-documents/org_a/${documentId}/upload_12345678`,
    fileName: 'ISO-101-Rev-A.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
    createdByUid: uid,
    createdByName: 'Engenharia',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

function validEngineeringEvent(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    documentId,
    eventType: 'submitted_internal',
    recordedByUid: uid,
    recordedByName: 'Engenharia',
    recordedAt: serverTimestamp(),
    comment: 'Documento enviado para revisão interna.',
    ...overrides,
  };
}

async function createDocumentAndInitialEvent(uid: string, role = 'Operacional') {
  const db = dbFor(uid, role);
  const batch = writeBatch(db);
  batch.set(doc(db, 'engineering_documents', documentId), validEngineeringDocument(uid));
  batch.set(doc(db, 'engineering_document_events', 'event_initial'), validEngineeringEvent(uid));
  await batch.commit();
}

test('Operations editor creates document and initial history in one atomic batch', async () => {
  await seedReferences();
  const db = dbFor('field_user', 'Operacional');
  const batch = writeBatch(db);
  batch.set(doc(db, 'engineering_documents', documentId), validEngineeringDocument('field_user'));
  batch.set(doc(db, 'engineering_document_events', 'event_initial'), validEngineeringEvent('field_user'));
  await assertSucceeds(batch.commit());

  const saved = await assertSucceeds(getDoc(doc(db, 'engineering_documents', documentId)));
  assert.equal(saved.data()?.documentCode, 'ISO-101');
  const event = await assertSucceeds(getDoc(doc(db, 'engineering_document_events', 'event_initial')));
  assert.equal(event.data()?.eventType, 'submitted_internal');
});

test('document creation rejects another user identity and mismatched deterministic identifiers', async () => {
  await seedReferences();
  const db = dbFor('field_user', 'Operacional');

  await assertFails(setDoc(
    doc(db, 'engineering_documents', documentId),
    validEngineeringDocument('someone_else'),
  ));

  const wrongId = { ...validEngineeringDocument('field_user'), id: 'some_other_id' };
  await assertFails(setDoc(doc(db, 'engineering_documents', documentId), wrongId));
});

test('document creation validates file metadata and links to records in the same company', async () => {
  await seedReferences();
  const db = dbFor('field_user', 'Operacional');

  await assertFails(setDoc(
    doc(db, 'engineering_documents', documentId),
    validEngineeringDocument('field_user', { contentType: 'application/acad' }),
  ));

  await assertFails(setDoc(
    doc(db, 'engineering_documents', documentId),
    validEngineeringDocument('field_user', { fileSize: 20 * 1024 * 1024 + 1 }),
  ));

  await assertFails(setDoc(
    doc(db, 'engineering_documents', documentId),
    validEngineeringDocument('field_user', { filePath: 'operacoes/org_a/file.pdf' }),
  ));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'contracts/contract_other'), {
      id: 'contract_other', orgId: 'org_b', title: 'Contrato de outra empresa',
    });
  });
  await assertFails(setDoc(
    doc(db, 'engineering_documents', documentId),
    validEngineeringDocument('field_user', { contractId: 'contract_other' }),
  ));
});

test('Viewer can read engineering documents but cannot create a new revision', async () => {
  await seedReferences();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'engineering_documents', documentId), validEngineeringDocument('field_user'));
  });

  const viewer = dbFor('viewer_user', 'Visualizador');
  await assertSucceeds(getDoc(doc(viewer, 'engineering_documents', documentId)));
  await assertFails(setDoc(
    doc(viewer, 'engineering_documents/eng_org_a_ISO-102_A'),
    {
      ...validEngineeringDocument('viewer_user'),
      id: 'eng_org_a_ISO-102_A',
      documentGroupId: 'eng_org_a_ISO-102',
      documentCode: 'ISO-102',
    },
  ));
});

test('another company cannot read an engineering document or its workflow history', async () => {
  await seedReferences();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'engineering_documents', documentId), validEngineeringDocument('field_user'));
    await setDoc(doc(ctx.firestore(), 'engineering_document_events/event_initial'), validEngineeringEvent('field_user'));
  });

  const otherOrg = dbFor('other_user', 'Admin', 'org_b');
  await assertFails(getDoc(doc(otherOrg, 'engineering_documents', documentId)));
  await assertFails(getDoc(doc(otherOrg, 'engineering_document_events/event_initial')));
});

test('only Supervisor, Manager or Admin can record internal approval events', async () => {
  await seedReferences();
  await createDocumentAndInitialEvent('field_user');

  const operator = dbFor('field_user', 'Operacional');
  await assertFails(setDoc(
    doc(operator, 'engineering_document_events/event_operator_approval'),
    validEngineeringEvent('field_user', { eventType: 'approved_internal' }),
  ));

  const supervisor = dbFor('supervisor_user', 'Supervisor');
  await assertSucceeds(setDoc(
    doc(supervisor, 'engineering_document_events/event_supervisor_approval'),
    validEngineeringEvent('supervisor_user', { eventType: 'approved_internal', recordedByName: 'Supervisor' }),
  ));
});

test('client return events require a named contact and an auditable reference', async () => {
  await seedReferences();
  await createDocumentAndInitialEvent('field_user');

  const supervisor = dbFor('supervisor_user', 'Supervisor');
  await assertFails(setDoc(
    doc(supervisor, 'engineering_document_events/event_client_missing'),
    validEngineeringEvent('supervisor_user', { eventType: 'approved_client', recordedByName: 'Supervisor' }),
  ));

  await assertSucceeds(setDoc(
    doc(supervisor, 'engineering_document_events/event_client_ok'),
    validEngineeringEvent('supervisor_user', {
      eventType: 'approved_client',
      recordedByName: 'Supervisor',
      clientName: 'Contato informado pelo responsável interno',
      clientReference: 'E-mail de 24/11/2026',
    }),
  ));
});

test('engineering documents and workflow events are append-only', async () => {
  await seedReferences();
  await createDocumentAndInitialEvent('field_user');

  const operator = dbFor('field_user', 'Operacional');
  await assertFails(updateDoc(doc(operator, 'engineering_documents', documentId), { title: 'Alterado' }));
  await assertFails(deleteDoc(doc(operator, 'engineering_documents', documentId)));
  await assertFails(updateDoc(doc(operator, 'engineering_document_events/event_initial'), { comment: 'Alterado' }));
  await assertFails(deleteDoc(doc(operator, 'engineering_document_events/event_initial')));
});
