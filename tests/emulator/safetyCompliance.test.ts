import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

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

async function seedEmployee(id: string, orgId = 'org_a') {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'rh_directory', id), {
      id, orgId, name: 'Colaborador SMS', role: 'Soldador', active: true,
      admissionDate: '2024-01-01', unitId: 'unit_a',
    });
  });
}

const ppeCatalog = (id: string, orgId = 'org_a') => ({
  id, orgId, name: 'Cinto paraquedista', category: 'Cinto paraquedista',
  caNumber: 'CA-12345', caExpiresAt: '2027-11-25',
  requiredForPermitTypes: ['trabalho_em_altura'], active: true,
  createdByUid: 'admin_1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});

test('only management can create catalogs; PPE and training history are server-only and immutable', async () => {
  await seedEmployee('employee_01');
  const admin = dbFor('admin_1', 'Admin');
  const operator = dbFor('operator_1', 'Operacional');

  await assertSucceeds(setDoc(doc(admin, 'safety_ppe_catalog/ppe_01'), ppeCatalog('ppe_01')));
  await assertFails(setDoc(doc(operator, 'safety_ppe_catalog/ppe_02'), ppeCatalog('ppe_02')));

  await assertSucceeds(setDoc(doc(admin, 'safety_training_catalog/training_01'), {
    id: 'training_01', orgId: 'org_a', code: 'NR-35', title: 'Trabalho em Altura',
    requiredForPermitTypes: ['trabalho_em_altura'], active: true, createdByUid: 'admin_1',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(operator, 'safety_ppe_movements/movement_01'), {
    id: 'movement_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Colaborador SMS',
    ppeId: 'ppe_01', ppeName: 'Cinto paraquedista', eventType: 'entregue',
    movementDate: '2026-11-25', createdByUid: 'operator_1', createdByName: 'Operador',
    createdAt: serverTimestamp(),
  }));

  await assertFails(setDoc(doc(operator, 'safety_training_records/record_01'), {
    id: 'record_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Colaborador SMS',
    trainingCode: 'NR-35', title: 'Trabalho em Altura', issueDate: '2026-01-01',
    expirationDate: '2027-01-01', createdByUid: 'operator_1', createdByName: 'Operador',
    recordedAt: serverTimestamp(),
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'safety_ppe_movements/movement_01'), {
      id: 'movement_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Colaborador SMS',
      ppeId: 'ppe_01', ppeName: 'Cinto paraquedista', eventType: 'entregue',
      movementDate: '2026-11-25', createdByUid: 'operator_1', createdAt: serverTimestamp(),
    });
    await setDoc(doc(context.firestore(), 'safety_training_records/record_01'), {
      id: 'record_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Colaborador SMS',
      trainingCode: 'NR-35', title: 'Trabalho em Altura', issueDate: '2026-01-01',
      expirationDate: '2027-01-01', createdByUid: 'operator_1', createdByName: 'Operador',
      recordedAt: serverTimestamp(),
    });
  });

  await assertFails(updateDoc(doc(operator, 'safety_ppe_movements/movement_01'), { eventType: 'devolvido' }));
  await assertFails(deleteDoc(doc(operator, 'safety_ppe_movements/movement_01')));
  await assertFails(updateDoc(doc(operator, 'safety_training_records/record_01'), { expirationDate: '2030-01-01' }));
  await assertFails(deleteDoc(doc(operator, 'safety_training_records/record_01')));
  await assertFails(deleteDoc(doc(admin, 'safety_ppe_catalog/ppe_01')));
});

test('PPE and training records cannot reference employees from another tenant or inactive employees', async () => {
  await seedEmployee('employee_org_b', 'org_b');
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'rh_directory', 'employee_inactive'), {
      id: 'employee_inactive', orgId: 'org_a', name: 'Inativo', role: 'Ajudante', active: false,
    });
    await setDoc(doc(context.firestore(), 'safety_ppe_catalog', 'ppe_01'), {
      ...ppeCatalog('ppe_01'), createdByUid: 'admin_1',
    });
  });

  const operator = dbFor('operator_1', 'Operacional');
  const wrongTenant = {
    id: 'wrong_tenant', orgId: 'org_a', employeeId: 'employee_org_b', employeeName: 'Outro tenant',
    ppeId: 'ppe_01', ppeName: 'Cinto paraquedista', eventType: 'entregue',
    movementDate: '2026-11-25', createdByUid: 'operator_1', createdAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(operator, 'safety_ppe_movements/wrong_tenant'), wrongTenant));
  await assertFails(setDoc(doc(operator, 'safety_training_records/inactive_employee'), {
    id: 'inactive_employee', orgId: 'org_a', employeeId: 'employee_inactive', employeeName: 'Inativo',
    trainingCode: 'NR-35', title: 'Trabalho em Altura', issueDate: '2026-01-01',
    expirationDate: '2027-01-01', createdByUid: 'operator_1', recordedAt: serverTimestamp(),
  }));
});

test('PPE movement history is server-only and cannot be forged from a client', async () => {
  await seedEmployee('employee_01');
  const admin = dbFor('admin_1', 'Admin');
  const operator = dbFor('operator_1', 'Operacional');
  await assertSucceeds(setDoc(doc(admin, 'safety_ppe_catalog/ppe_01'), ppeCatalog('ppe_01')));
  await assertFails(setDoc(doc(operator, 'safety_ppe_movements/movement_01'), {
    id: 'movement_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Colaborador SMS',
    ppeId: 'ppe_01', ppeName: 'Cinto paraquedista', eventType: 'entregue',
    movementDate: '2026-11-25', createdByUid: 'operator_1', createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(operator, 'safety_ppe_movements/return_01'), {
    id: 'return_01', orgId: 'org_a', employeeId: 'employee_01', employeeName: 'Colaborador SMS',
    ppeId: 'ppe_01', ppeName: 'Cinto paraquedista', eventType: 'devolvido',
    movementDate: '2026-11-25', referenceMovementId: 'movement_01',
    createdByUid: 'operator_1', createdAt: serverTimestamp(),
  }));
});
