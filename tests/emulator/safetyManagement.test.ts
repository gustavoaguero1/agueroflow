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
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
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

type Overrides = Record<string, unknown>;

function validPermit(uid: string, id = 'permit_01', overrides: Overrides = {}) {
  return {
    id,
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    permitCode: overrides.documentType === 'pt' ? 'PT-2026-ABC12345' : 'APR-2026-ABC12345',
    documentType: 'apr',
    permitDate: '2026-11-25',
    permitType: 'trabalho_a_quente',
    activityTitle: 'Soldagem TIG em tubulação inox',
    description: 'Execução de soldagem TIG em trecho isolado da linha de processo.',
    location: 'Planta industrial / Linha L-101',
    validFrom: '2026-11-25T07:00',
    validUntil: '2026-11-25T17:00',
    supervisorName: 'Encarregado de montagem',
    teamMembers: ['Soldador TIG', 'Ajudante'],
    ...(overrides.documentType === 'pt' ? { teamMemberIds: ['employee_01'] } : {}),
    risks: [
      {
        id: 'risk_1',
        hazard: 'Projeção de fagulhas durante soldagem',
        consequence: 'Queimaduras ou princípio de incêndio',
        initialRisk: 'alto',
        controlMeasures: 'Isolar a área, remover combustíveis e manter extintor e vigia de fogo.',
        residualRisk: 'medio',
      },
      {
        id: 'risk_2',
        hazard: 'Contato com superfície aquecida',
        consequence: 'Queimadura por contato durante a execução',
        initialRisk: 'medio',
        controlMeasures: 'Demarcar a superfície e aguardar resfriamento antes de liberar a área.',
        residualRisk: 'baixo',
      },
    ],
    controls: {
      teamBriefed: true,
      ppeInspected: true,
      areaIsolated: true,
      fireWatch: true,
    },
    emergencyPlan: 'Interromper o serviço, acionar o responsável da planta e utilizar os recursos de combate disponíveis.',
    createdByUid: uid,
    createdByName: uid === 'operator_1' ? 'Operador de Campo' : 'Responsável SMS',
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

function eventData(uid: string, permitId: string, eventType: string, overrides: Overrides = {}) {
  return {
    orgId: 'org_a',
    unitId: 'unit_a',
    contractId: 'contract_a',
    permitId,
    eventType,
    actorUid: uid,
    actorName: uid === 'operator_1' ? 'Operador de Campo' : 'Supervisor SMS',
    recordedAt: serverTimestamp(),
    ...(eventType === 'rejected' || eventType === 'closed' || eventType === 'cancelled'
      ? { comment: 'Movimentação justificada e registrada.' }
      : {}),
    ...overrides,
  };
}

async function createPermit(uid = 'operator_1', role = 'Operacional', id = 'permit_01') {
  const db = dbFor(uid, role);
  const initialEventId = id + '_created';
  await env.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'safety_permits', id), validPermit(uid, id));
    await setDoc(doc(adminDb, 'safety_permit_events', initialEventId), eventData(uid, id, 'created'));
    await setDoc(doc(adminDb, 'safety_permit_states', id), {
      id,
      orgId: 'org_a',
      unitId: 'unit_a',
      contractId: 'contract_a',
      permitId: id,
      status: 'draft',
      latestEventId: initialEventId,
      updatedByUid: uid,
      updatedByName: uid === 'operator_1' ? 'Operador de Campo' : 'Supervisor SMS',
      updatedAt: serverTimestamp(),
    });
  });
  return { db, initialEventId };
}

test('APR/PT, event and state writes are server-only while records remain readable', async () => {
  const { db, initialEventId } = await createPermit();
  const savedPermit = await assertSucceeds(getDoc(doc(db, 'safety_permits/permit_01')));
  const savedEvent = await assertSucceeds(getDoc(doc(db, 'safety_permit_events', initialEventId)));
  const savedState = await assertSucceeds(getDoc(doc(db, 'safety_permit_states/permit_01')));
  assert.equal(savedPermit.data()?.permitCode, 'APR-2026-ABC12345');
  assert.equal(savedPermit.data()?.documentType, 'apr');
  assert.equal(savedEvent.data()?.eventType, 'created');
  assert.equal(savedState.data()?.status, 'draft');
  await assertFails(setDoc(doc(db, 'safety_permits/client_permit'), validPermit('operator_1', 'client_permit')));
  await assertFails(setDoc(doc(db, 'safety_permit_events/client_event'), eventData('operator_1', 'permit_01', 'created')));
  await assertFails(setDoc(doc(db, 'safety_permit_states/client_state'), {
    id: 'client_state', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
    permitId: 'client_state', status: 'draft', latestEventId: 'client_event',
    updatedByUid: 'operator_1', updatedByName: 'Operador de Campo', updatedAt: serverTimestamp(),
  }));
});


test('PT documents can only be created by the trusted API, even with an approved APR linked', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'safety_permits/permit_01'), validPermit('operator_1', 'permit_01'));
    await setDoc(doc(adminDb, 'safety_permit_states/permit_01'), {
      id: 'permit_01', orgId: 'org_a', unitId: 'unit_a', contractId: 'contract_a',
      permitId: 'permit_01', status: 'approved', latestEventId: 'approved_by_server',
      updatedByUid: 'supervisor_1', updatedByName: 'Supervisor', updatedAt: serverTimestamp(),
    });
  });
  const operator = dbFor('operator_1', 'Operacional');
  const ptData = validPermit('operator_1', 'pt_01', {
    documentType: 'pt', permitCode: 'PT-2026-ABC12345', relatedAprId: 'permit_01',
    teamMemberIds: ['employee_01'],
  });
  await assertFails(setDoc(doc(operator, 'safety_permits/pt_01'), ptData));
});

test('client cannot bypass backend APR/PT validation with missing controls or increased residual risk', async () => {
  const db = dbFor('operator_1', 'Operacional');
  await assertFails(setDoc(doc(db, 'safety_permits/hot_work_without_fire_watch'), validPermit('operator_1', 'hot_work_without_fire_watch', {
    controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true, fireWatch: false },
  })));
  await assertFails(setDoc(doc(db, 'safety_permits/confined_space_without_rescue'), validPermit('operator_1', 'confined_space_without_rescue', {
    permitType: 'espaco_confinado',
    controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true, gasTest: true, rescuePlan: false, standbyWatch: true },
  })));
  await assertFails(setDoc(doc(db, 'safety_permits/risk_not_reduced'), validPermit('operator_1', 'risk_not_reduced', {
    risks: [{ hazard: 'Queda de altura', consequence: 'Lesão grave', initialRisk: 'baixo',
      controlMeasures: 'Linha de vida e inspeção dos pontos de ancoragem.', residualRisk: 'critico' }],
  })));
});

test('viewer reads APR/PT but cannot create or change it; another organization cannot read it', async () => {
  await createPermit();
  const viewer = dbFor('viewer_1', 'Visualizador');
  await assertSucceeds(getDoc(doc(viewer, 'safety_permits/permit_01')));
  await assertSucceeds(getDoc(doc(viewer, 'safety_permit_states/permit_01')));
  await assertFails(setDoc(
    doc(viewer, 'safety_permits/viewer_attempt'),
    validPermit('viewer_1', 'viewer_attempt'),
  ));
  const otherOrg = dbFor('other_org_user', 'Admin', 'org_b');
  await assertFails(getDoc(doc(otherOrg, 'safety_permits/permit_01')));
  await assertFails(getDoc(doc(otherOrg, 'safety_permit_states/permit_01')));
});

test('all permit state transitions are server-only and creator separation is enforced by the API', async () => {
  const { db, initialEventId } = await createPermit();
  const operator = dbFor('operator_1', 'Operacional');
  await assertFails(setDoc(
    doc(operator, 'safety_permit_events/operator_submission'),
    eventData('operator_1', 'permit_01', 'submitted_for_approval', { previousEventId: initialEventId }),
  ));
  await assertFails(updateDoc(doc(operator, 'safety_permit_states/permit_01'), {
    status: 'awaiting_approval',
    latestEventId: 'operator_submission',
    updatedByUid: 'operator_1',
    updatedByName: 'Operador de Campo',
    updatedAt: serverTimestamp(),
  }));

  const supervisor = dbFor('supervisor_2', 'Supervisor');
  await assertFails(setDoc(
    doc(supervisor, 'safety_permit_events/supervisor_approval'),
    eventData('supervisor_2', 'permit_01', 'approved', { previousEventId: initialEventId }),
  ));
  await assertFails(updateDoc(doc(supervisor, 'safety_permit_states/permit_01'), {
    status: 'approved', latestEventId: 'supervisor_approval',
    updatedByUid: 'supervisor_2', updatedByName: 'Supervisor SMS', updatedAt: serverTimestamp(),
  }));

  const own = await createPermit('supervisor_owner', 'Supervisor', 'supervisor_own_permit');
  await assertFails(setDoc(
    doc(own.db, 'safety_permit_events/own_approval'),
    eventData('supervisor_owner', 'supervisor_own_permit', 'approved', { previousEventId: 'supervisor_own_permit_created' }),
  ));
});
test('client cannot create submission events or change a permit state', async () => {
  const { db, initialEventId } = await createPermit();
  await assertFails(setDoc(
    doc(db, 'safety_permit_events/stale_submission'),
    eventData('operator_1', 'permit_01', 'submitted_for_approval', { previousEventId: initialEventId }),
  ));
  await assertFails(updateDoc(doc(db, 'safety_permit_states/permit_01'), {
    status: 'awaiting_approval',
    latestEventId: 'stale_submission',
    updatedByUid: 'operator_1',
    updatedByName: 'Operador de Campo',
    updatedAt: serverTimestamp(),
  }));
  const unchanged = await assertSucceeds(getDoc(doc(db, 'safety_permit_states/permit_01')));
  assert.equal(unchanged.data()?.status, 'draft');
  assert.equal(unchanged.data()?.latestEventId, initialEventId);
});
test('permit records and events are append-only; state cannot be deleted or edited outside a valid event', async () => {
  const { db, initialEventId } = await createPermit();
  await assertFails(updateDoc(doc(db, 'safety_permits/permit_01'), { activityTitle: 'Alterada' }));
  await assertFails(deleteDoc(doc(db, 'safety_permits/permit_01')));
  await assertFails(updateDoc(doc(db, 'safety_permit_events', initialEventId), { comment: 'Alterado' }));
  await assertFails(deleteDoc(doc(db, 'safety_permit_events', initialEventId)));
  await assertFails(deleteDoc(doc(db, 'safety_permit_states/permit_01')));
  await assertFails(updateDoc(doc(db, 'safety_permit_states/permit_01'), { status: 'approved' }));
});

test('SMS occurrences reuse the existing occurrences collection and validate related permit ownership', async () => {
  await createPermit();
  const db = dbFor('operator_1', 'Operacional');
  await assertSucceeds(setDoc(doc(db, 'occurrences/sms_incident_01'), {
    id: 'sms_incident_01',
    orgId: 'org_a',
    unitId: 'unit_a',
    type: 'seguranca',
    safetyCategory: 'quase_acidente',
    incidentDate: '2026-11-25',
    relatedPermitId: 'permit_01',
    title: 'Queda de ferramenta próxima à equipe',
    description: 'Uma ferramenta caiu de uma plataforma e atingiu o piso próximo aos trabalhadores.',
    immediateAction: 'Área isolada e ferramentas conferidas antes da retomada.',
    urgency: 'alta',
    status: 'aberta',
    reportedBy: 'Operador de Campo',
    reportedByUid: 'operator_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  await assertFails(updateDoc(doc(db, 'occurrences/sms_incident_01'), { safetyCategory: 'ato_inseguro' }));
  await assertFails(deleteDoc(doc(db, 'occurrences/sms_incident_01')));
  await assertFails(setDoc(doc(db, 'occurrences/sms_bad_category'), {
    id: 'sms_bad_category',
    orgId: 'org_a',
    unitId: 'unit_a',
    type: 'seguranca',
    safetyCategory: 'not_valid',
    incidentDate: '2026-11-25',
    title: 'Ocorrência de segurança',
    description: 'Descrição suficiente para passar pela validação de texto.',
    immediateAction: '',
    urgency: 'media',
    status: 'aberta',
    reportedBy: 'Operador',
    reportedByUid: 'operator_1',
  }));
  await assertFails(setDoc(doc(db, 'occurrences/sms_wrong_permit_org'), {
    id: 'sms_wrong_permit_org',
    orgId: 'org_a',
    unitId: 'unit_a',
    type: 'seguranca',
    safetyCategory: 'quase_acidente',
    incidentDate: '2026-11-25',
    relatedPermitId: 'permit_from_other_org',
    title: 'Ocorrência vinculada incorretamente',
    description: 'Tentativa de vincular permissão que pertence a outra empresa.',
    immediateAction: '',
    urgency: 'media',
    status: 'aberta',
    reportedBy: 'Operador',
    reportedByUid: 'operator_1',
  }));
});

