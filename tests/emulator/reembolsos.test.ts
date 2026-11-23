import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { enrichReceipt, saveReceiptImage, MAX_IMAGE_BASE64 } from '../../server/reembolsos.ts';

const h = getAdmin() as AdminHandles;
assert.ok(h);
const set = (p: string, d: object) => h.db.doc(p).set(d);

beforeEach(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-agueroflow/databases/(default)/documents', { method: 'DELETE' });
  await set('field_workers/w1', { orgId: 'o', name: 'José da Silva', whatsapp: '(19) 98123-4567', currentSite: 'CD Marília' });
  await set('field_workers/wx', { orgId: 'other', name: 'Ana', whatsapp: '11 99999-0000' });
  await set('worker_time_logs/t1', { orgId: 'o', workerId: 'w1', date: '2026-11-18', siteName: 'Obra X', contractId: 'c1' });
});

test('enrichReceipt: worker by phone in the receipt org, obra from the timesheet of the receipt date', async () => {
  const e = await enrichReceipt(h.db, { organizationId: 'o', employeePhone: '5519981234567', employeeName: 'Zé', receiptDate: '2026-11-18' });
  assert.deepEqual([e.workerId, e.employeeName, e.obraName, e.contractId, e.obraSource], ['w1', 'José da Silva', 'Obra X', 'c1', 'apontamento']);
  const cad = await enrichReceipt(h.db, { organizationId: 'o', employeePhone: '19981234567', receiptDate: '2026-11-19' });
  assert.deepEqual([cad.obraName, cad.obraSource], ['CD Marília', 'cadastro']);
  const other = await enrichReceipt(h.db, { organizationId: 'o', employeePhone: '11999990000', employeeName: 'Ana' });
  assert.equal(other.workerStatus, 'a_identificar'); // worker of another org never matches
  assert.deepEqual(await enrichReceipt(null, {}), {});
});

test('saveReceiptImage: stores base64 with orgId, skips oversized', async () => {
  assert.equal(await saveReceiptImage(h.db, 'r1', 'o', Buffer.from('img').toString('base64'), 'image/png'), 'salva');
  const d = (await h.db.doc('receipt_images/r1').get()).data()!;
  assert.deepEqual([d.orgId, d.mimeType, d.bytes, Buffer.from(d.base64, 'base64').toString()], ['o', 'image/png', 3, 'img']);
  assert.equal(await saveReceiptImage(h.db, 'r2', 'o', 'A'.repeat(MAX_IMAGE_BASE64 + 1)), 'grande_demais');
  assert.equal((await h.db.doc('receipt_images/r2').get()).exists, false);
});
