import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

let env: RulesTestEnvironment;
const jpg = new Uint8Array([1, 2, 3]);
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: 'localhost', port: 9199 },
  });
});
after(async () => { await env?.cleanup(); });

const st = (claims?: Record<string, unknown>, uid = 'u1') =>
  (claims ? env.authenticatedContext(uid, claims) : env.unauthenticatedContext()).storage();

test('org member writes/reads own org photos only', async () => {
  const s = st({ orgs: { org_a: 'Operacional' } });
  await assertSucceeds(uploadBytes(ref(s, 'work-orders/org_a/wo1/antes_1.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(s, 'work-orders/org_a/wo1/antes_1.jpg')));
  await assertFails(uploadBytes(ref(s, 'work-orders/org_b/wo1/antes_1.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertFails(getBytes(ref(st({ orgs: { org_b: 'Admin' } }), 'work-orders/org_a/wo1/antes_1.jpg')));
});

test('work-order evidence and Operations attachments require Operations area access', async () => {
  const editor = st({ orgs: { org_a: 'Operacional' } }, 'operations-editor');
  const viewer = st({ orgs: { org_a: 'Visualizador' } }, 'viewer');

  const workOrderPath = 'work-orders/org_a/wo1/area_access.jpg';
  await assertSucceeds(uploadBytes(ref(editor, workOrderPath), jpg, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(viewer, workOrderPath)));
  await assertFails(uploadBytes(ref(viewer, 'work-orders/org_a/wo1/viewer_blocked.jpg'), jpg, { contentType: 'image/jpeg' }));

  const operationsPath = 'operacoes/org_a/receipt_area_access.pdf';
  await assertSucceeds(uploadBytes(ref(editor, operationsPath), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(viewer, operationsPath)));
  await assertFails(uploadBytes(ref(viewer, 'operacoes/org_a/viewer_blocked.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(getBytes(ref(st({ orgs: { org_b: 'Admin' } }), operationsPath)));
});

test('work-order evidence is immutable, size-limited and restricted to safe image types', async () => {
  const editor = st({ orgs: { org_a: 'Operacional' } }, 'evidence-editor');
  const path = 'work-orders/org_a/wo1/evidence.jpg';
  await assertSucceeds(uploadBytes(ref(editor, path), jpg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(editor, path), jpg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(editor, 'work-orders/org_a/wo1/evidence.svg'), jpg, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(editor, 'work-orders/org_a/wo1/evidence.pdf'), pdf, { contentType: 'application/pdf' }));
  const large = new Uint8Array(10 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(ref(editor, 'work-orders/org_a/wo1/large.jpg'), large, { contentType: 'image/jpeg' }));
  await assertFails(deleteObject(ref(editor, path)));
});

test('Operations attachments are immutable except authorized legacy JSON backup replacement', async () => {
  const editor = st({ orgs: { org_a: 'Operacional' } }, 'operations-editor');
  const filePath = 'operacoes/org_a/ctps_1234.pdf';
  await assertSucceeds(uploadBytes(ref(editor, filePath), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(editor, filePath), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(editor, 'operacoes/org_a/vector.svg'), jpg, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(editor, 'operacoes/org_a/large.pdf'), new Uint8Array(15 * 1024 * 1024 + 1), { contentType: 'application/pdf' }));

  const backupPath = 'operacoes/org_a/arquivos_historico.json';
  await assertSucceeds(uploadBytes(ref(editor, backupPath), new TextEncoder().encode('{}'), { contentType: 'application/json' }));
  await assertSucceeds(uploadBytes(ref(editor, backupPath), new TextEncoder().encode('{"revision":2}'), { contentType: 'application/json' }));
  await assertFails(uploadBytes(ref(editor, backupPath), pdf, { contentType: 'application/pdf' }));
  await assertFails(deleteObject(ref(editor, backupPath)));
});

test('non-image, anonymous and other paths are denied; master allowed', async () => {
  const s = st({ orgs: { org_a: 'Admin' } });
  await assertFails(uploadBytes(ref(s, 'work-orders/org_a/wo1/x.svg'), jpg, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(s, 'work-orders/org_a/wo1/x.pdf'), jpg, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(s, 'other/org_a/x.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st(), 'work-orders/org_a/wo1/x.jpg'), jpg, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(st({ master: true }), 'work-orders/org_z/wo1/x.jpg'), jpg, { contentType: 'image/jpeg' }));
});

test('engineering documents: Operations editor can upload and download only inside own organization', async () => {
  const s = st({ orgs: { org_a: 'Operacional' } });
  const path = 'engineering-documents/org_a/eng_org_a_ISO-101_A/upload_12345678';
  await assertSucceeds(uploadBytes(ref(s, path), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(s, path)));
  await assertFails(getBytes(ref(st({ orgs: { org_b: 'Admin' } }), path)));
  await assertFails(uploadBytes(ref(s, 'engineering-documents/org_b/eng_org_b_ISO-101_A/upload_12345678'), pdf, { contentType: 'application/pdf' }));
});

test('engineering documents: Viewer can read, but cannot upload', async () => {
  const editor = st({ orgs: { org_a: 'Operacional' } }, 'editor');
  const path = 'engineering-documents/org_a/eng_org_a_PID-101_00/upload_12345678';
  await assertSucceeds(uploadBytes(ref(editor, path), pdf, { contentType: 'application/pdf' }));

  const operationsEditor = st({ orgs: { org_a: 'Operacional' } }, 'operations-editor');
  await assertFails(uploadBytes(ref(operationsEditor, 'safety-certificates/org_a/employee_01/record_05_certificate.pdf'), pdf, { contentType: 'application/pdf' }));
  const viewer = st({ orgs: { org_a: 'Visualizador' } }, 'viewer');
  await assertSucceeds(getBytes(ref(viewer, path)));
  await assertFails(uploadBytes(ref(viewer, 'engineering-documents/org_a/eng_org_a_PID-102_00/upload_12345678'), pdf, { contentType: 'application/pdf' }));
});

test('engineering documents: only PDF and safe raster images, max 20 MB, immutable object', async () => {
  const s = st({ orgs: { org_a: 'Admin' } });
  const root = 'engineering-documents/org_a/eng_org_a_DOC-100_A';
  await assertFails(uploadBytes(ref(s, `${root}/drawing.dwg`), jpg, { contentType: 'application/acad' }));
  await assertFails(uploadBytes(ref(s, `${root}/drawing.svg`), jpg, { contentType: 'image/svg+xml' }));

  const large = new Uint8Array(20 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(ref(s, `${root}/large.pdf`), large, { contentType: 'application/pdf' }));

  const objectPath = `${root}/upload_12345678`;
  await assertSucceeds(uploadBytes(ref(s, objectPath), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(s, objectPath), pdf, { contentType: 'application/pdf' }));
  await assertFails(deleteObject(ref(s, objectPath)));
});

test('engineering document uploads deny anonymous users and preserve master access', async () => {
  const path = 'engineering-documents/org_z/eng_org_z_PID-1_A/master_upload_1234';
  await assertFails(uploadBytes(ref(st(), path), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(uploadBytes(ref(st({ master: true }), path), pdf, { contentType: 'application/pdf' }));
});


test('safety training certificates are tenant-scoped, role-protected and immutable', async () => {
  const supervisor = st({ orgs: { org_a: 'Supervisor' } }, 'supervisor');
  const path = 'safety-certificates/org_a/employee_01/record_01_certificate.pdf';
  await assertSucceeds(uploadBytes(ref(supervisor, path), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(supervisor, path)));

  const viewer = st({ orgs: { org_a: 'Visualizador' } }, 'viewer');
  await assertSucceeds(getBytes(ref(viewer, path)));
  await assertFails(uploadBytes(ref(viewer, 'safety-certificates/org_a/employee_01/record_02_certificate.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(getBytes(ref(st({ orgs: { org_b: 'Admin' } }), path)));
  await assertFails(uploadBytes(ref(supervisor, 'safety-certificates/org_b/employee_01/record_03_certificate.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(supervisor, 'safety-certificates/org_a/employee_01/record_04_certificate.svg'), jpg, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(supervisor, path), pdf, { contentType: 'application/pdf' }));
  await assertFails(deleteObject(ref(supervisor, path)));
});
