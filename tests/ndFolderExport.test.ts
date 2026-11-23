import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ndFolderFor, exportFileName, isPendingExport, createNdExportRouter } from '../server/ndFolderExport.ts';

test('ND folder follows the finance share layout', () => {
  assert.equal(ndFolderFor('30/11/2026'), '2026\\11.2026\\30.11');
  assert.equal(ndFolderFor('5/1/27'), '2027\\01.2027\\05.01');
  assert.equal(ndFolderFor('31/02/2026'), null);
  assert.equal(ndFolderFor(''), null);
});

test('revised NDs get a distinct file name', () => {
  assert.equal(exportFileName({ fileName: 'ND 4925 - Almoço.pdf' }), 'ND 4925 - Almoço.pdf');
  assert.equal(exportFileName({ fileName: 'ND 4925 - Almoço.pdf', revisionNumber: 2 }), 'ND 4925 - Almoço - REVISADA (REV. 2).pdf');
});

test('pending = created/revised after start and not saved at the current revision', () => {
  const since = '2026-11-23T12:00:00.000Z';
  assert.equal(isPendingExport({ createdAt: '2026-11-23T13:00:00Z' }, since), true);
  assert.equal(isPendingExport({ createdAt: '2026-11-22T13:00:00Z' }, since), false);
  assert.equal(isPendingExport({ createdAt: '2026-11-23T13:00:00Z', folderExportedRev: 0 }, since), false);
  assert.equal(isPendingExport({ createdAt: '2026-11-20T13:00:00Z', revisionNumber: 1, revisedAt: '2026-11-23T14:00:00Z', folderExportedRev: 0 }, since), true);
});

test('router requires the export token and acknowledges saves', async () => {
  const recs: any[] = [{ id: 'n1', fileName: 'a.pdf', paymentDate: '30/11/2026', createdAt: '2026-11-23T13:00:00Z' }];
  let saved = 0;
  const app = express().use('/x', createNdExportRouter({
    token: () => 'segredo', since: () => '2026-11-23T12:00:00.000Z', records: () => recs,
    pdf: () => Buffer.from('%PDF'), persist: () => { saved++; },
  }));
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as any).port}/x`;
  try {
    assert.equal((await fetch(`${base}/pendentes`)).status, 401);
    assert.equal((await fetch(`${base}/pendentes`, { headers: { 'x-nd-export-token': 'errado' } })).status, 401);
    const h = { 'x-nd-export-token': 'segredo' };
    const list = await (await fetch(`${base}/pendentes`, { headers: h })).json();
    assert.deepEqual(list, [{ id: 'n1', fileName: 'a.pdf', folder: '2026\\11.2026\\30.11', revision: 0 }]);
    assert.equal(await (await fetch(`${base}/n1/pdf`, { headers: h })).text(), '%PDF');
    assert.equal((await fetch(`${base}/n1/salvo`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: '{"revision":0}' })).status, 200);
    assert.equal(saved, 1);
    assert.deepEqual(await (await fetch(`${base}/pendentes`, { headers: h })).json(), []);
  } finally { srv.close(); }
});
