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
  serverTimestamp,
  setDoc,
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

function validQualityRecord(uid: string, overrides: Record<string, unknown> = {}) {
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

function validQualityEvent(uid: string, eventType = 'submitted_for_review', overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    recordId,
    eventType,
    actorUid: uid,
    actorName: 'Inspetor',
    recordedAt: serverTimestamp(),
    ...(eventType === 'rejected' ? { comment: 'Ajustar a identificação do trecho.' } : {}),
    ...overrides,
  };
}

async function createInspectionWithInitialEvent(uid: string, eventType = 'submitted_for_review', recordOverrides: Record<string, unknown> = {}) {
  const db = dbFor(uid, 'Operacional');
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_records', recordId), validQualityRecord(uid, recordOverrides));
  batch.set(doc(collection(db, 'quality_record_events')), validQualityEvent(uid, eventType));
  await batch.commit();
}

test('Operations editor creates an inspection and its initial review event atomically', async () => {
  await seedReferences();
  const db = dbFor('inspector_1', 'Operacional');
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_records', recordId), validQualityRecord('inspector_1', {
    engineeringDocumentId: 'eng_org_a_ISO-101_A',
    engineeringDocumentCode: 'ISO-101 Rev. A',
  }));
  batch.set(doc(db, 'quality_record_events/event_initial'), validQualityEvent('inspector_1'));
  await assertSucceeds(batch.commit());

  const saved = await assertSucceeds(getDoc(doc(db, 'quality_records', recordId)));
  assert.equal(saved.data()?.recordCode, 'QLD-2026-ABC12345');
  const event = await assertSucceeds(getDoc(doc(db, 'quality_record_events/event_initial')));
  assert.equal(event.data()?.eventType, 'submitted_for_review');
});

test('quality records can link an existing checklist run when no engineering document is selected', async () => {
  await seedReferences();
  const db = dbFor('inspector_checklist', 'Operacional');
  const batch = writeBatch(db);
  batch.set(doc(db, 'quality_records', recordId), validQualityRecord('inspector_checklist', {
    checklistRunId: 'run_a',
    checklistTitle: 'Checklist de montagem',
  }));
  batch.set(doc(db, 'quality_record_events/event_checklist'), validQualityEvent('inspector_checklist'));
  await assertSucceeds(batch.commit());
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

test('Operations Viewer can read quality records but cannot create records or events', async () => {
  await seedReferences();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'quality_records', recordId), validQualityRecord('inspector_1'));
    await setDoc(doc(ctx.firestore(), 'quality_record_events/event_initial'), validQualityEvent('inspector_1'));
  });
  const viewer = dbFor('viewer_1', 'Visualizador');
  await assertSucceeds(getDoc(doc(viewer, 'quality_records', recordId)));
  await assertSucceeds(getDoc(doc(viewer, 'quality_record_events/event_initial')));
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
      // Required medium and duration intentionally omitted.
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
  await assertFails(setDoc(
    doc(db, 'quality_records', recordId),
    validQualityRecord('inspector_1', {
      recordType: 'punch_item',
      result: 'conforme',
      severity: 'alta',
      responsibleName: 'Encarregado',
      dueDate: '2026-11-28',
    }),
  ));
  await assertSucceeds(createInspectionWithInitialEvent('inspector_1', 'opened', {
    recordType: 'punch_item',
    result: 'nao_conforme',
    severity: 'alta',
    responsibleName: 'Encarregado',
    dueDate: '2026-11-28',
  }));
});

test('only Supervisor, Manager or Admin can approve/reject an inspection', async () => {
  await seedReferences();
  await createInspectionWithInitialEvent('inspector_1');

  const operator = dbFor('inspector_1', 'Operacional');
  await assertFails(setDoc(
    doc(operator, 'quality_record_events/operator_approval'),
    validQualityEvent('inspector_1', 'approved', { actorName: 'Inspetor' }),
  ));

  const supervisor = dbFor('supervisor_1', 'Supervisor');
  await assertSucceeds(setDoc(
    doc(supervisor, 'quality_record_events/supervisor_approval'),
    validQualityEvent('supervisor_1', 'approved', { actorName: 'Supervisor' }),
  ));
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/supervisor_reject_without_reason'),
    validQualityEvent('supervisor_1', 'rejected', { actorName: 'Supervisor', comment: '' }),
  ));
});

test('nonconformity correction, verification and closure are attributed to their authors', async () => {
  await seedReferences();
  await createInspectionWithInitialEvent('inspector_1', 'opened', {
    recordType: 'nonconformity',
    result: 'nao_conforme',
    severity: 'alta',
    responsibleName: 'Encarregado',
    dueDate: '2026-11-28',
  });

  const operator = dbFor('inspector_1', 'Operacional');
  await assertSucceeds(setDoc(
    doc(operator, 'quality_record_events/corrective_action'),
    validQualityEvent('inspector_1', 'corrective_action_submitted', {
      actorName: 'Encarregado',
      comment: 'Trecho corrigido e submetido para reinspeção.',
    }),
  ));

  const supervisor = dbFor('supervisor_1', 'Supervisor');
  await assertSucceeds(setDoc(
    doc(supervisor, 'quality_record_events/verified'),
    validQualityEvent('supervisor_1', 'verified', {
      actorName: 'Supervisor',
      comment: 'Correção verificada em campo.',
    }),
  ));
  await assertSucceeds(setDoc(
    doc(supervisor, 'quality_record_events/closed'),
    validQualityEvent('supervisor_1', 'closed', {
      actorName: 'Supervisor',
      comment: 'Apontamento encerrado após verificação.',
    }),
  ));
});

test('another organization cannot read a quality record or its event history', async () => {
  await seedReferences();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'quality_records', recordId), validQualityRecord('inspector_1'));
    await setDoc(doc(ctx.firestore(), 'quality_record_events/event_initial'), validQualityEvent('inspector_1'));
  });
  const otherOrg = dbFor('other_user', 'Admin', 'org_b');
  await assertFails(getDoc(doc(otherOrg, 'quality_records', recordId)));
  await assertFails(getDoc(doc(otherOrg, 'quality_record_events/event_initial')));
});

test('quality records and events are append-only and cannot be edited or deleted', async () => {
  await seedReferences();
  await createInspectionWithInitialEvent('inspector_1');

  const db = dbFor('inspector_1', 'Operacional');
  await assertFails(updateDoc(doc(db, 'quality_records', recordId), { title: 'Título alterado' }));
  await assertFails(deleteDoc(doc(db, 'quality_records', recordId)));
  await assertFails(updateDoc(doc(db, 'quality_record_events', 'event_initial'), { comment: 'Alterado' }));
  await assertFails(deleteDoc(doc(db, 'quality_record_events', 'event_initial')));
});

test('quality workflow events cannot be attached to another company or fake another author', async () => {
  await seedReferences();
  await createInspectionWithInitialEvent('inspector_1');

  const supervisor = dbFor('supervisor_1', 'Supervisor');
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/mismatched_org'),
    validQualityEvent('supervisor_1', 'approved', { orgId: 'org_b', actorName: 'Supervisor' }),
  ));
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/spoofed_author'),
    validQualityEvent('different_uid', 'approved', { actorName: 'Supervisor' }),
  ));
  await assertFails(setDoc(
    doc(supervisor, 'quality_record_events/wrong_parent'),
    validQualityEvent('supervisor_1', 'approved', { recordId: 'missing_record', actorName: 'Supervisor' }),
  ));
});
