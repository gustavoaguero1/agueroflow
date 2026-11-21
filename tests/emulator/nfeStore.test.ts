import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { parseNfeXml } from '../../server/nfe/parseNfe.ts';
import { upsertNfe, upsertNfeSummary, createNfeRouter } from '../../server/nfe/nfeStore.ts';

const PROJECT = 'demo-agueroflow';
const h = getAdmin() as AdminHandles;
assert.ok(h);
const xml = readFileSync(new URL('../fixtures/nfe-sample.xml', import.meta.url), 'utf8');
const parsed = parseNfeXml(xml);
const id = `org_a_${parsed.chave}`;

beforeEach(async () => {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await h.db.doc('organizations/org_a').set({ id: 'org_a', cnpj: '22.222.222/0001-22' });
});

async function call(body: unknown, orgId = 'org_a') {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, _res, next) => { req.user = { uid: 'u', master: false, orgs: { [orgId]: 'Admin' } }; next(); });
  app.use('/api/nfe', createNfeRouter(() => h));
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/nfe/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json() as any;
  } finally { srv.close(); }
}

test('import twice creates once', async () => {
  const a = await call({ files: [{ name: 'a.xml', content: xml }] });
  assert.deepEqual(a.results[0], { name: 'a.xml', ok: true, chave: parsed.chave, created: true });
  await h.db.doc(`nfe_documents/${id}`).update({ status: 'classificada' });
  const b = await call({ files: [{ name: 'b.xml', content: xml }] });
  assert.equal(b.results[0].created, false);
  assert.equal((await h.db.collection('nfe_documents').get()).size, 1);
  assert.equal((await h.db.doc(`nfe_documents/${id}`).get()).data()!.status, 'classificada');
});

test('rejects other destinatario CNPJ', async () => {
  await h.db.doc('organizations/org_a').update({ cnpj: '33.333.333/0001-33' });
  const r = await call({ files: [{ name: 'a.xml', content: xml }] });
  assert.equal(r.results[0].ok, false);
  assert.match(r.results[0].error, /^Nota não emitida para o CNPJ da empresa/);
  assert.equal((await h.db.collection('nfe_documents').get()).size, 0);
});

test('rejects when org has no CNPJ', async () => {
  await h.db.doc('organizations/org_a').set({ id: 'org_a' });
  const r = await call({ files: [{ name: 'a.xml', content: xml }] });
  assert.equal(r.results[0].error, 'Cadastre o CNPJ da empresa em Estrutura antes de importar notas.');
});

test('reports invalid xml per file', async () => {
  const r = await call({ files: [{ name: 'x.xml', content: '<a/>' }] });
  assert.deepEqual(r.results[0], { name: 'x.xml', ok: false, error: 'XML não é uma NF-e válida' });
});

test('summary then full upgrades status', async () => {
  const resumo = { chave: parsed.chave, emitente: { cnpj: '11111111000111', nome: 'FORNECEDOR TESTE LTDA' }, valorTotal: 585, emitidaEm: '2026-11-10T10:30:00-03:00', situacao: '1' };
  assert.equal((await upsertNfeSummary(h, 'org_a', resumo)).created, true);
  assert.equal((await h.db.doc(`nfe_documents/${id}`).get()).data()!.status, 'resumo');
  assert.equal((await upsertNfeSummary(h, 'org_a', resumo)).created, false);
  const r = await upsertNfe(h, 'org_a', parsed, 'sefaz');
  assert.equal(r.created, false);
  const d = (await h.db.doc(`nfe_documents/${id}`).get()).data()!;
  assert.equal(d.status, 'aguardando_classificacao');
  assert.equal(d.itens.length, 2);
  // summary after full never downgrades
  await upsertNfeSummary(h, 'org_a', resumo);
  assert.equal((await h.db.doc(`nfe_documents/${id}`).get()).data()!.status, 'aguardando_classificacao');
});

test('reupload does not overwrite stored xml', async () => {
  let saves = 0;
  const stub = { ...h, bucket: { file: () => ({ save: async () => { saves++; } }) } } as unknown as AdminHandles;
  await upsertNfe(stub, 'org_a', parsed, 'upload', xml);
  await upsertNfe(stub, 'org_a', parsed, 'upload', xml);
  assert.equal(saves, 1);
  assert.equal((await h.db.doc(`nfe_documents/${id}`).get()).data()!.xmlPath, `nfe-xml/org_a/${parsed.chave}.xml`);
});

test('rejects oversize and non-string content', async () => {
  const r = await call({ files: [{ name: 'big.xml', content: 'x'.repeat(1_000_001) }, { name: 'n.xml', content: 5 }] });
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[1].ok, false);
  assert.equal((await call({ files: Array(51).fill({ name: 'a', content: '' }) })).error, 'Máximo de 50 arquivos por envio.');
});

test('retry backfills missing xmlPath', async () => {
  const failing = { ...h, bucket: { file: () => ({ save: async () => { throw new Error('down'); } }) } } as unknown as AdminHandles;
  assert.equal((await upsertNfe(failing, 'org_a', parsed, 'upload', xml)).created, true);
  assert.equal((await h.db.doc(`nfe_documents/${id}`).get()).data()!.xmlPath, undefined);
  let saves = 0;
  const ok = { ...h, bucket: { file: () => ({ save: async () => { saves++; } }) } } as unknown as AdminHandles;
  assert.equal((await upsertNfe(ok, 'org_a', parsed, 'upload', xml)).created, false);
  assert.equal((await h.db.doc(`nfe_documents/${id}`).get()).data()!.xmlPath, `nfe-xml/org_a/${parsed.chave}.xml`);
  await upsertNfe(ok, 'org_a', parsed, 'upload', xml);
  assert.equal(saves, 1);
});
