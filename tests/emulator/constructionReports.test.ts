import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
});

const dbFor = (uid: string, role: string) =>
  env.authenticatedContext(uid, { orgs: { org_a: role } }).firestore();

function validReport(uid: string, orgId = 'org_a') {
  const confirmedAt = '2026-11-24T20:00:00.000Z';
  return {
    id: 'rdo-valid-001',
    orgId,
    unitId: 'unit_a',
    contractId: 'contract_a',
    reportNumber: 'RDO-2026-12345678',
    date: '2026-11-24',
    weather: 'nublado',
    workforce: [{ role: 'Soldador TIG', count: 2, hours: 8 }],
    equipment: [{ name: 'Inversora TIG', quantity: 1, operationalHours: 6 }],
    activitiesCompleted: 'Montagem e soldagem de tubulação inox.',
    preparedBy: 'Encarregado da Obra',
    confirmedByUid: uid,
    confirmedByName: 'Encarregado da Obra',
    confirmedAt,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
  };
}

test('Operações com nível editar pode criar RDO confirmado pelo próprio usuário', async () => {
  const db = dbFor('field_user', 'Operacional');
  await assertSucceeds(setDoc(doc(db, 'construction_reports/rdo1'), validReport('field_user')));
});

test('RDO rejeita confirmação informada em nome de outro usuário', async () => {
  const db = dbFor('field_user', 'Operacional');
  await assertFails(setDoc(doc(db, 'construction_reports/rdo2'), validReport('someone_else')));
});

test('RDO exige identificação, data, local, contrato, clima e confirmação', async () => {
  const db = dbFor('field_user', 'Operacional');
  const missingConfirmation = { ...validReport('field_user') };
  delete (missingConfirmation as Partial<typeof missingConfirmation>).confirmedAt;
  await assertFails(setDoc(doc(db, 'construction_reports/rdo3'), missingConfirmation));

  const missingSite = { ...validReport('field_user'), unitId: '' };
  await assertFails(setDoc(doc(db, 'construction_reports/rdo4'), missingSite));

  const missingWeather = { ...validReport('field_user'), weather: '' };
  await assertFails(setDoc(doc(db, 'construction_reports/rdo5'), missingWeather));
});

test('RDO não aceita assinatura simulada no campo legado', async () => {
  const db = dbFor('field_user', 'Operacional');
  const report = { ...validReport('field_user'), supervisorSignature: 'Assinado digitalmente por alguém' };
  await assertFails(setDoc(doc(db, 'construction_reports/rdo6'), report));
});

test('Visualizador pode ler RDO da empresa mas não criar', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'construction_reports/rdo7'), validReport('field_user'));
  });

  const viewer = dbFor('viewer_user', 'Visualizador');
  await assertSucceeds(getDoc(doc(viewer, 'construction_reports/rdo7')));
  await assertFails(setDoc(doc(viewer, 'construction_reports/rdo8'), validReport('viewer_user')));
});

test('RDO é append-only: usuário não pode atualizar nem excluir o documento', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'construction_reports/rdo9'), validReport('field_user'));
  });

  const db = dbFor('field_user', 'Operacional');
  await assertFails(updateDoc(doc(db, 'construction_reports/rdo9'), { activitiesCompleted: 'Texto alterado' }));
  await assertFails(deleteDoc(doc(db, 'construction_reports/rdo9')));
});

test('RDO mantém isolamento entre empresas', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'construction_reports/rdo10'), validReport('field_user'));
  });

  const otherOrg = env.authenticatedContext('other_user', {
    orgs: { org_b: 'Operacional' },
  }).firestore();
  await assertFails(getDoc(doc(otherOrg, 'construction_reports/rdo10')));
  await assertFails(setDoc(doc(otherOrg, 'construction_reports/rdo11'), validReport('other_user', 'org_a')));
});

test('consulta por empresa retorna apenas RDOs autorizados', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'construction_reports/rdo12'), validReport('field_user'));
  });

  const db = dbFor('viewer_user', 'Visualizador');
  const rows = await assertSucceeds(getDocs(query(
    collection(db, 'construction_reports'),
    where('orgId', '==', 'org_a'),
  )));
  assert.equal(rows.size, 1);
});
