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
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

async function seedReferences() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'units/unit_a'), { id: 'unit_a', orgId: 'org_a', name: 'Unidade A' });
    await setDoc(doc(db, 'contracts/contract_a'), { id: 'contract_a', orgId: 'org_a', title: 'Montagem Industrial' });
    await setDoc(doc(db, 'contracts/contract_b'), { id: 'contract_b', orgId: 'org_b', title: 'Outra empresa' });
    await setDoc(doc(db, 'engineering_documents/eng_org_a_ISO-101_A'), {
      id: 'eng_org_a_ISO-101_A',
      orgId: 'org_a',
      unitId: 'unit_a',
      contractId: 'contract_a',
      documentCode: 'ISO-101',
      revision: 'A',
      title: 'Isométrico da linha',
    });
    await setDoc(doc(db, 'engineering_documents/eng_org_b_ISO-202_A'), {
      id: 'eng_org_b_ISO-202_A',
      orgId: 'org_b',
      unitId: 'unit_b',
      contractId: 'contract_b',
      documentCode: 'ISO-202',
      revision: 'A',
      title: 'Documento de outra empresa',
    });
    await setDoc(doc(db, 'checklist_runs/run_a'), {
      id: 'run_a',
      orgId: 'org_a',
      unitId: 'unit_a',
      templateTitle: 'Checklist de montagem',
      inspectorName: 'Inspetor',
      status: 'concluido',
    });
  });
}

const recordId = 'quality_record_01';
const initialEventId = 'quality_event_initial';

type RecordOverrides = Record<string, unknown>;

function validQualityRecord(uid: string, overrides: RecordOverrides = {}) {
  return {
    id: recordId,
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    recordCode: 'QLD-2026-ABC12345',
    recordDate: '2026-11-24',
    recordType: 'visual_inspection',
    title: 'Inspeção visual da linha',
    description: 'Inspeção realizada após a montagem do trecho.',
    result: 'conforme',
    acceptanceCriteria: 'Sem danos, vazamentos ou descontinuidades visíveis.',
    createdByUid: uid,
    createdByName: 'Inspetor',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

function initialEventFor(record: Record<string, unknown>) {
  return record.recordType === 'nonconformity'
    || record.recordType === 'punch_item'
    || record.result === 'nao_conforme'
    ? 'opened'
    : 'submitted_for_review';
}

function initialStatusFor(eventType: string) {
  return eventType === 'opened' ? 'open' : 'review_pending';
}

function validQualityEvent(
  uid: string,
  eventType: string,
  overrides: RecordOverrides = {},
) {
  return {
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    recordId,
    eventType,
    actorUid: uid,
    actorName: uid === 'inspector_1' ? 'Inspetor' : 'Responsável',
    recordedAt: serverTimestamp(),
    ...(['rejected', 'corrective_action_submitted', 'verified', 'closed', 'reopened', 'note_added'].includes(eventType)
      ? { comment: 'Movimentação registrada com justificativa.' }
      : {}),
    ...overrides,
  };
}

async function createQualityRecord(
  uid: string,
  role = 'Operacional',
  recordOverrides: RecordOverrides = {},
) {
  const db = dbFor(uid, role);
  const record = validQualityRecord(uid, recordOverrides);
  const initialEvent = initialEventFor(record);
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_records', recordId), record);
  batch.set(doc(db, 'quality_record_events', initialEventId), validQualityEvent(uid, initialEvent));
  batch.set(doc(db, 'quality_record_states', recordId), {
    id: recordId,
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    recordId,
    status: initialStatusFor(initialEvent),
    latestEventId: initialEventId,
    updatedByUid: uid,
    updatedByName: 'Inspetor',
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return db;
}

function nextStatus(current: string, eventType: string): string | null {
  if (eventType === 'note_added' && current !== 'unknown') return current;
  if (eventType === 'approved' && current === 'review_pending') return 'approved';
  if (eventType === 'rejected' && current === 'review_pending') return 'rejected';
  if (eventType === 'corrective_action_submitted' && ['open', 'rejected', 'reopened'].includes(current)) return 'correction_pending_verification';
  if (eventType === 'verified' && current === 'correction_pending_verification') return 'verified';
  if (eventType === 'closed' && current === 'verified') return 'closed';
  if (eventType === 'reopened' && current === 'closed') return 'reopened';
  return null;
}

async function transitionQualityRecord(
  uid: string,
  role: string,
  eventType: string,
  eventId: string,
  comment = 'Movimentação registrada com justificativa.',
) {
  const db = dbFor(uid, role);
  const stateRef = doc(db, 'quality_record_states', recordId);
  const stateSnapshot = await getDoc(stateRef);
  assert.equal(stateSnapshot.exists(), true, 'The quality state should exist before a transition.');
  if (!stateSnapshot.exists()) throw new Error('Quality state not found.');
  const state = stateSnapshot.data();
  const status = nextStatus(String(state.status), eventType);
  assert.ok(status, `Transition ${state.status} -> ${eventType} should be invalid in this helper.`);

  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_record_events', eventId), validQualityEvent(uid, eventType, {
    previousEventId: state.latestEventId,
    comment,
  }));
  batch.update(stateRef, {
    status,
    latestEventId: eventId,
    updatedByUid: uid,
    updatedByName: 'Responsável',
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return db;
}

async function attemptOutOfOrderTransition(
  uid: string,
  role: string,
  eventType: string,
  attemptedStatus: string,
  eventId: string,
) {
  const db = dbFor(uid, role);
  const stateRef = doc(db, 'quality_record_states', recordId);
  const stateSnapshot = await getDoc(stateRef);
  const state = stateSnapshot.data()!;
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_record_events', eventId), validQualityEvent(uid, eventType, {
    previousEventId: state.latestEventId,
    comment: 'Tentativa fora de ordem.',
  }));
  batch.update(stateRef, {
    status: attemptedStatus,
    latestEventId: eventId,
    updatedByUid: uid,
    updatedByName: 'Responsável',
    updatedAt: serverTimestamp(),
  });
  await assertFails(batch.commit());
}

test('Operations editor creates a quality record, initial event and state atomically', async () => {
  await seedReferences();
  const db = dbFor('inspector_1', 'Operacional');
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_records', recordId), validQualityRecord('inspector_1', {
    engineeringDocumentId: 'eng_org_a_ISO-101_A',
    engineeringDocumentCode: 'ISO-101 Rev. A',
  }));
  batch.set(doc(db, 'quality_record_events', initialEventId), validQualityEvent('inspector_1', 'submitted_for_review'));
  batch.set(doc(db, 'quality_record_states', recordId), {
    id: recordId,
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    recordId,
    status: 'review_pending',
    latestEventId: initialEventId,
    updatedByUid: 'inspector_1',
    updatedByName: 'Inspetor',
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());

  const saved = await assertSucceeds(getDoc(doc(db, 'quality_records', recordId)));
  assert.equal(saved.data()?.recordCode, 'QLD-2026-ABC12345');
  const event = await assertSucceeds(getDoc(doc(db, 'quality_record_events', initialEventId)));
  assert.equal(event.data()?.eventType, 'submitted_for_review');
  const state = await assertSucceeds(getDoc(doc(db, 'quality_record_states', recordId)));
  assert.equal(state.data()?.status, 'review_pending');
  assert.equal(state.data()?.latestEventId, initialEventId);
});

test('a failed inspection/test opens a corrective-action workflow instead of approval', async () => {
  await seedReferences();
  const db = await createQualityRecord('inspector_1', 'Operacional', {
    recordType: 'hydrostatic_test',
    result: 'nao_conforme',
    measuredValue: 8.5,
    measuredUnit: 'bar',
    testMedium: 'Água',
    holdDurationMinutes: 60,
    acceptanceCriteria: 'Manter 10 bar sem queda.',
    severity: 'alta',
    responsibleName: 'Encarregado',
    dueDate: '2026-11-28',
  });
  const state = await assertSucceeds(getDoc(doc(db, 'quality_record_states', recordId)));
  assert.equal(state.data()?.status, 'open');
  await assertFails(setDoc(
    doc(db, 'quality_record_events/failed_result_approval'),
    validQualityEvent('inspector_1', 'approved'),
  ));
  await transitionQualityRecord('inspector_1', 'Operacional', 'corrective_action_submitted', 'failed_result_correction');
  const corrected = await assertSucceeds(getDoc(doc(db, 'quality_record_states', recordId)));
  assert.equal(corrected.data()?.status, 'correction_pending_verification');
  assert.ok(db);
});

test('quality records can link an existing checklist run when no engineering document is selected', async () => {
  await seedReferences();
  await createQualityRecord('inspector_checklist', 'Operacional', {
    checklistRunId: 'run_a',
    checklistTitle: 'Checklist de montagem',
  });
  const saved = await assertSucceeds(getDoc(doc(dbFor('inspector_checklist', 'Operacional'), 'quality_records', recordId)));
  assert.equal(saved.data()?.checklistRunId, 'run_a');
});

test('quality records reject simultaneous engineering-document and checklist links', async () => {
  await seedReferences();
  const db = dbFor('inspector_both', 'Operacional');
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_both', {
      engineeringDocumentId: 'eng_org_a_ISO-101_A',
      engineeringDocumentCode: 'ISO-101 Rev. A',
      checklistRunId: 'run_a',
      checklistTitle: 'Checklist de montagem',
    }),
  ));
});

test('Operations Viewer can read quality records, events and state but cannot create them', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');
  const viewer = dbFor('viewer_1', 'Visualizador');
  await assertSucceeds(getDoc(doc(viewer, 'quality_records', recordId)));
  await assertSucceeds(getDoc(doc(viewer, 'quality_record_events', initialEventId)));
  await assertSucceeds(getDoc(doc(viewer, 'quality_record_states', recordId)));
  await assertFails(setDoc(
    doc(viewer, 'quality_records/quality_record_02'),
    { ...validQualityRecord('viewer_1'), id: 'quality_record_02', recordCode: 'QLD-2026-ABC12346' },
  ));
});

test('quality records reject spoofed authors and invalid record identifiers', async () => {
  await seedReferences();
  const db = dbFor('inspector_1', 'Operacional');
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('different_user'),
  ));
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', { id: 'some_other_id' }),
  ));
});

test('quality records enforce test measurements and hydrostatic test details', async () => {
  await seedReferences();
  const db = dbFor('inspector_1', 'Operacional');
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', {
      recordType: 'hydrostatic_test',
      measuredValue: 10,
      measuredUnit: 'bar',
      acceptanceCriteria: 'Manter pressão sem queda.',
    }),
  ));
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', {
      recordType: 'functional_test',
      measuredValue: -1,
      measuredUnit: 'bar',
    }),
  ));
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', {
      recordType: 'hydrostatic_test',
      measuredValue: 10,
      measuredUnit: 'bar',
      testMedium: 'Água',
      holdDurationMinutes: 60,
      acceptanceCriteria: 'Sem queda de pressão.',
    }),
  ));
});

test('quality references must belong to the same organization, unit and contract', async () => {
  await seedReferences();
  const db = dbFor('inspector_1', 'Operacional');
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', { contractId: 'contract_b' }),
  ));
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', { engineeringDocumentId: 'eng_org_b_ISO-202_A' }),
  ));
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', { checklistRunId: 'missing_run' }),
  ));
});

test('nonconformities and punch items require severity, responsible person and due date', async () => {
  await seedReferences();
  const db = dbFor('inspector_1', 'Operacional');
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', {
      recordType: 'nonconformity',
      result: 'nao_conforme',
    }),
  ));
  await createQualityRecord('inspector_1', 'Operacional', {
    recordType: 'punch_item',
    result: 'nao_conforme',
    severity: 'alta',
    responsibleName: 'Encarregado',
    dueDate: '2026-11-28',
  });
  const state = await assertSucceeds(getDoc(doc(dbFor('inspector_1', 'Operacional'), 'quality_record_states', recordId)));
  assert.equal(state.data()?.status, 'open');
});

test('only Supervisor, Manager or Admin can approve a conforming technical inspection', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');

  const operator = dbFor('inspector_1', 'Operacional');
  await assertFails(setDoc(
    doc(operator, 'quality_record_events/operator_approval'),
    validQualityEvent('inspector_1', 'approved'),
  ));

  await transitionQualityRecord('supervisor_1', 'Supervisor', 'approved', 'supervisor_approval');
  const state = await assertSucceeds(getDoc(doc(dbFor('supervisor_1', 'Supervisor'), 'quality_record_states', recordId)));
  assert.equal(state.data()?.status, 'approved');

  await assertFails(setDoc(
    doc(dbFor('supervisor_2', 'Supervisor'), 'quality_record_events/supervisor_reject_without_reason'),
    validQualityEvent('supervisor_2', 'rejected', { comment: '' }),
  ));
});

test('nonconformity correction, independent verification, closure and reopening follow a strict sequence', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1', 'Operacional', {
    recordType: 'nonconformity',
    result: 'nao_conforme',
    severity: 'alta',
    responsibleName: 'Encarregado',
    dueDate: '2026-11-28',
  });

  await attemptOutOfOrderTransition('supervisor_1', 'Supervisor', 'closed', 'closed', 'close_before_correction');
  await transitionQualityRecord('inspector_1', 'Operacional', 'corrective_action_submitted', 'corrective_action');
  await transitionQualityRecord('supervisor_1', 'Supervisor', 'verified', 'verified');
  await transitionQualityRecord('supervisor_1', 'Supervisor', 'closed', 'closed');
  await transitionQualityRecord('supervisor_1', 'Supervisor', 'reopened', 'reopened');

  const state = await assertSucceeds(getDoc(doc(dbFor('supervisor_1', 'Supervisor'), 'quality_record_states', recordId)));
  assert.equal(state.data()?.status, 'reopened');
});

test('concurrent or stale workflow events cannot overwrite the latest state', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');
  const db = dbFor('supervisor_1', 'Supervisor');
  const stateRef = doc(db, 'quality_record_states', recordId);
  const state = (await getDoc(stateRef)).data()!;
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_record_events/stale_approval'), validQualityEvent('supervisor_1', 'approved', {
    previousEventId: 'old_event_id',
  }));
  batch.update(stateRef, {
    status: 'approved',
    latestEventId: 'stale_approval',
    updatedByUid: 'supervisor_1',
    updatedByName: 'Supervisor',
    updatedAt: serverTimestamp(),
  });
  assert.notEqual(state.latestEventId, 'old_event_id');
  await assertFails(batch.commit());
});

test('another organization cannot read a quality record, its event history or current state', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');
  const otherOrg = dbFor('other_user', 'Admin', 'org_b');
  await assertFails(getDoc(doc(otherOrg, 'quality_records', recordId)));
  await assertFails(getDoc(doc(otherOrg, 'quality_record_events', initialEventId)));
  await assertFails(getDoc(doc(otherOrg, 'quality_record_states', recordId)));
});

test('quality records and events are append-only and the state cannot be deleted', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');
  const db = dbFor('inspector_1', 'Operacional');
  await assertFails(updateDoc(doc(db, 'quality_records', recordId), { title: 'Título alterado' }));
  await assertFails(deleteDoc(doc(db, 'quality_records', recordId)));
  await assertFails(updateDoc(doc(db, 'quality_record_events', initialEventId), { comment: 'Alterado' }));
  await assertFails(deleteDoc(doc(db, 'quality_record_events', initialEventId)));
  await assertFails(deleteDoc(doc(db, 'quality_record_states', recordId)));
  await assertFails(updateDoc(doc(db, 'quality_record_states', recordId), { status: 'closed' }));
});

test('quality event cannot reference another company or fake another author', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');
  const supervisor = dbFor('supervisor_1', 'Supervisor');
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/mismatched_org'),
    validQualityEvent('supervisor_1', 'approved', { orgId: 'org_b' }),
  ));
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/spoofed_author'),
    validQualityEvent('different_uid', 'approved'),
  ));
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/wrong_parent'),
    validQualityEvent('supervisor_1', 'approved', { recordId: 'missing_record' }),
  ));
});

test('queries scoped by org return only authorized quality records and states', async () => {
  await seedReferences();
  await createQualityRecord('inspector_1');
  const db = dbFor('viewer_1', 'Visualizador');
  const rows = await assertSucceeds(getDocs(query(collection(db, 'quality_records'), where('orgId', '==', 'org_a'))));
  const states = await assertSucceeds(getDocs(query(collection(db, 'quality_record_states'), where('orgId', '==', 'org_a'))));
  assert.equal(rows.size, 1);
  assert.equal(states.size, 1);
});
