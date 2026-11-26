import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import * as XLSX from 'xlsx';
import {
  weekRange, spDate, phonesMatch, resolveWorker, enrichmentFor, weeklySummary, weeklyMessage, weeklyDue,
  isoDate, createReembolsosRouter, weekWorkbookBuffer, weeklyCheck, validYmd, summaryMarker,
} from '../server/reembolsos.ts';

test('weekRange: previous full week in São Paulo, Sunday-night edge', () => {
  // Monday 24/11/2026 10:00 SP
  assert.deepEqual(weekRange(undefined, new Date('2026-11-24T13:00:00Z')), { inicio: '2026-11-16', fim: '2026-11-22' });
  // Sunday 29/11 23:30 SP = Monday 02:30 UTC: still the week of 23/11 in SP, so previous = 16..22
  assert.deepEqual(weekRange(undefined, new Date('2026-11-30T02:30:00Z')), { inicio: '2026-11-16', fim: '2026-11-22' });
  // explicit inicio snaps to its Monday
  assert.deepEqual(weekRange('2026-11-19'), { inicio: '2026-11-16', fim: '2026-11-22' });
  assert.deepEqual(weekRange('2026-11-22'), { inicio: '2026-11-16', fim: '2026-11-22' });
  assert.ok(validYmd('2026-02-28') && !validYmd('2026-02-31') && !validYmd('2026-13-01') && !validYmd('26-11-01'));
  assert.equal(spDate('2026-11-23T02:30:00Z'), '2026-11-22');
});

test('phonesMatch: last 10/11 digits, country code and missing 9th digit', () => {
  assert.ok(phonesMatch('+55 19 98123-4567', '19981234567'));
  assert.ok(phonesMatch('5519981234567@s.whatsapp.net', '(19) 98123-4567'));
  assert.ok(phonesMatch('551981234567', '19 98123-4567')); // old WhatsApp JID without the 9
  assert.ok(!phonesMatch('21981234567', '19981234567'));
  assert.ok(!phonesMatch('', '19981234567'));
  assert.ok(!phonesMatch('4567', '4567'));
});

const workers = [
  { id: 'w1', name: 'José da Silva', whatsapp: '(19) 98123-4567', currentSite: 'CD Marília' },
  { id: 'w2', name: 'Ana Souza', currentSite: '' },
];

test('resolveWorker: phone first, then exact normalized name', () => {
  assert.equal(resolveWorker({ employeePhone: '5519981234567', employeeName: 'Ana Souza' }, workers)?.id, 'w1');
  assert.equal(resolveWorker({ employeePhone: '11999990000', employeeName: '  ANA  souza ' }, workers)?.id, 'w2');
  assert.equal(resolveWorker({ employeePhone: '', employeeName: 'Jose da Silva' }, workers)?.id, 'w1');
  assert.equal(resolveWorker({ employeePhone: '11999990000', employeeName: 'Ana' }, workers), undefined);
  const dup = [...workers, { id: 'w3', name: 'Ana Souza', whatsapp: '19 98123-4567' }];
  assert.equal(resolveWorker({ employeePhone: '19981234567', employeeName: 'José da Silva' }, dup), undefined); // phone fits 2
  assert.equal(resolveWorker({ employeePhone: '', employeeName: 'Ana Souza' }, dup), undefined); // name fits 2
  assert.equal(enrichmentFor({ employeeName: 'Ana Souza' }, dup, () => []).workerStatus, 'a_identificar');
});

test('enrichmentFor: apontamento > cadastro > a definir; unknown worker', () => {
  const logs = (id: string, date: string) => (id === 'w1' && date === '2026-11-18' ? [{ workerId: 'w1', date, siteName: 'Obra X', contractId: 'c1' }] : []);
  assert.deepEqual(enrichmentFor({ employeePhone: '19981234567', receiptDate: '18/11/2026' }, workers, logs), {
    workerId: 'w1', workerStatus: 'identificado', employeeName: 'José da Silva', obraName: 'Obra X', contractId: 'c1', obraSource: 'apontamento', obraStatus: 'ok',
  });
  const cad = enrichmentFor({ employeePhone: '19981234567', receiptDate: '2026-11-19' }, workers, logs);
  assert.deepEqual([cad.obraName, cad.obraSource, cad.obraStatus], ['CD Marília', 'cadastro', 'ok']);
  const none = enrichmentFor({ employeeName: 'Ana Souza', receiptDate: '2026-11-19' }, workers, logs);
  assert.deepEqual([none.workerId, none.obraSource, none.obraStatus], ['w2', 'a_definir', 'a_definir']);
  assert.deepEqual(enrichmentFor({ employeeName: 'Fulano' }, workers, logs), { workerStatus: 'a_identificar', obraSource: 'a_definir', obraStatus: 'a_definir' });
  assert.equal(isoDate('2026-11-18'), '2026-11-18');
});

const week = { inicio: '2026-11-16', fim: '2026-11-22' };
const receipts = () => [
  { id: 'a', organizationId: 'o', workerId: 'w1', employeeName: 'José', status: 'aprovado', totalAmount: 0.1, category: 'alimentacao', obraName: 'Obra X', obraStatus: 'ok', receivedAt: '2026-11-16T03:00:00Z' },
  { id: 'b', organizationId: 'o', workerId: 'w1', employeeName: 'José', status: 'aprovado', totalAmount: 0.2, category: 'alimentacao', obraName: 'Obra X', obraStatus: 'ok', receivedAt: '2026-11-18T12:00:00Z' },
  { id: 'c', organizationId: 'o', workerId: 'w1', employeeName: 'José', status: 'pendente', totalAmount: 10.05, category: 'pedagio', obraStatus: 'a_definir', receivedAt: '2026-11-23T02:59:00Z' }, // Sunday 23:59 SP
  { id: 'd', organizationId: 'o', employeeName: 'Fulano', status: 'reembolsado', totalAmount: 5, category: 'outros', obraName: 'Obra Y', workerStatus: 'a_identificar', receivedAt: '2026-11-20T12:00:00Z' },
  { id: 'e', organizationId: 'o', workerId: 'w1', employeeName: 'José', status: 'rejeitado', totalAmount: 99, receivedAt: '2026-11-18T12:00:00Z' },
  { id: 'f', organizationId: 'o', workerId: 'w1', employeeName: 'José', status: 'pendente', totalAmount: 7, receivedAt: '2026-11-23T03:00:00Z' }, // Monday 00:00 SP: next week
  { id: 'g', organizationId: 'o', workerId: 'w1', employeeName: 'José', status: 'pendente', totalAmount: 7, receivedAt: '2026-11-16T02:59:00Z' }, // Sunday before
];

test('weeklySummary: cents math, grouping, SP week bounds', () => {
  const s = weeklySummary(receipts(), week);
  assert.equal(s.funcionarios.length, 2);
  const jose = s.funcionarios.find((f) => f.workerId === 'w1')!;
  assert.equal(jose.totalAprovado, 0.3); // not 0.30000000000000004
  assert.equal(jose.totalPendente, 10.05);
  assert.equal(jose.pendentes, 1);
  assert.deepEqual(jose.porCategoria, { alimentacao: 0.3, pedagio: 10.05 });
  assert.deepEqual(jose.porObra, { 'Obra X': 0.3, 'A definir': 10.05 });
  assert.deepEqual(jose.notas.map((n) => n.id), ['a', 'b', 'c']);
  assert.deepEqual(s.totais, { totalAprovado: 5.3, totalPendente: 10.05, pendentes: 1, notas: 4 });
  assert.deepEqual(s.avisos, { obraADefinir: 1, funcionarioAIdentificar: 1 });
});

test('weeklyMessage: totals, one line per employee, avisos', () => {
  const m = weeklyMessage(weeklySummary(receipts(), week));
  assert.match(m, /16\/11 a 22\/11/);
  assert.match(m, /Total aprovado: R\$ 5,30 \| Pendentes: 1 \(R\$ 10,05\)/);
  assert.match(m, /• José: R\$ 0,30 aprovado, 1 pendente\(s\) — Obras: Obra X, A definir/);
  assert.match(m, /• Fulano: R\$ 5,00 aprovado/);
  assert.match(m, /1 nota\(s\) com obra a definir/);
  assert.match(m, /1 nota\(s\) com funcionário a identificar/);
  assert.match(weeklyMessage(weeklySummary([], week)), /Nenhuma nota/);
});

test('weeklyDue: Monday from 08:00 SP, once per week', () => {
  assert.equal(weeklyDue(new Date('2026-11-23T10:59:00Z'), undefined), null); // 07:59 SP
  assert.equal(weeklyDue(new Date('2026-11-23T11:00:00Z'), undefined), '2026-11-16');
  assert.equal(weeklyDue(new Date('2026-11-23T11:00:00Z'), '2026-11-16'), null);
  assert.equal(weeklyDue(new Date('2026-11-24T11:00:00Z'), undefined), '2026-11-16'); // Tuesday retries a missed Monday
  assert.equal(weeklyDue(new Date('2026-11-24T11:00:00Z'), '2026-11-16'), null);
  assert.equal(weeklyDue(new Date('2026-11-23T02:00:00Z'), '2026-11-09'), null); // Monday UTC, Sunday SP: still the week of 09/11
});

test('weekWorkbookBuffer: Resumo and Notas sheets', () => {
  const wb = XLSX.read(weekWorkbookBuffer(weeklySummary(receipts(), week)));
  assert.deepEqual(wb.SheetNames, ['Resumo', 'Notas']);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Notas).length, 4);
});

test('router: org scoping, roles, approve/reimburse week, obra manual', async () => {
  const data: any[] = [...receipts(), { id: 'x', organizationId: 'other', employeeName: 'X', status: 'pendente', totalAmount: 1, receivedAt: '2026-11-18T12:00:00Z' }];
  let persisted = 0;
  let user: any = { uid: 'u', email: 'g@x', master: false, orgs: { o: 'Gerente' } };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  const contracts: Record<string, any> = { c1: { orgId: 'o', title: 'Contrato Obra Z' }, cx: { orgId: 'other', title: 'Alheio' } };
  let db: any = null;
  const moduleGrants = new Map<string, any>([['o__u', { orgId: 'o', uid: 'u', modules: { 'ops-reembolso': 3 } }]]);
  const permissionAdmin = {
    db: { collection: (name: string) => ({ doc: (id: string) => ({
      get: async () => { const data = name === 'org_module_access' ? moduleGrants.get(id) : undefined; return { exists: data !== undefined, data: () => data }; },
    }) }) },
  } as any;
  const fakeDb = { collection: (c: string) => ({ doc: (id: string) => ({ get: async () => ({ data: () => (c === 'contracts' ? contracts[id] : undefined) }) }) }) };
  app.use('/r', createReembolsosRouter({
    receipts: () => data, persist: () => persisted++, db: () => db,
    getAdminHandles: () => permissionAdmin,
    now: () => new Date('2026-11-23T12:00:00Z'),
  }));
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as any).port}/r`;
  const post = (p: string, body: object, method = 'POST') => fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const s = await (await fetch(`${base}/semana`)).json();
    assert.equal(s.inicio, '2026-11-16'); // default: previous week
    assert.equal(s.totais.notas, 4); // other org's receipt hidden
    assert.equal((await fetch(`${base}/semana.xlsx?inicio=2026-11-16`)).headers.get('content-type')?.includes('spreadsheetml'), true);

    const ap = await (await post('/semana/aprovar', { inicio: '2026-11-16' })).json();
    assert.equal(ap.alterados, 1);
    assert.deepEqual([data[2].status, data[2].approvedBy], ['aprovado', 'g@x']);
    assert.equal(data[5].status, 'pendente'); // next week untouched
    assert.equal(data[7].status, 'pendente'); // other org untouched

    const rb = await (await post('/semana/reembolsado', { inicio: '2026-11-16' })).json();
    assert.equal(rb.alterados, 3);
    assert.ok(data[0].reimbursedAt && data[0].reimbursedBy === 'g@x');

    assert.equal((await fetch(`${base}/semana?inicio=2026-02-31`)).status, 400);
    assert.equal((await post('/semana/aprovar', { inicio: '2026-13-01' })).status, 400);
    assert.equal((await post('/c/obra', { contractId: 'c1' }, 'PUT')).status, 503); // cannot verify without Admin SDK
    db = fakeDb;
    assert.equal((await post('/c/obra', { contractId: 'cx', obraName: 'forjado' }, 'PUT')).status, 400); // other org's contract
    assert.equal((await post('/c/obra', { contractId: 'nao-existe' }, 'PUT')).status, 400);
    assert.equal((await post('/c/obra', { contractId: 'c1', obraName: 'ignorado' }, 'PUT')).status, 200);
    assert.deepEqual([data[2].obraName, data[2].contractId, data[2].obraSource, data[2].obraStatus], ['Contrato Obra Z', 'c1', 'manual', 'ok']);
    assert.equal((await post('/d/obra', { obraName: 'Obra livre' }, 'PUT')).status, 200);
    assert.deepEqual([data[3].obraName, data[3].contractId], ['Obra livre', '']);
    db = null;
    assert.equal((await post('/x/obra', { obraName: 'Z' }, 'PUT')).status, 404);
    assert.equal((await fetch(`${base}/a/imagem`)).status, 404); // no Admin SDK
    assert.ok(persisted >= 3);

    user = { uid: 'm', master: true, orgs: {} };
    assert.equal((await post('/semana/aprovar', { inicio: '2026-11-16' })).status, 400); // master must name the org
    assert.equal((await post('/semana/aprovar', { inicio: '2026-11-16', orgId: 'o' })).status, 200);

    user = { uid: 'op', master: false, orgs: { o: 'Operacional' } };
    assert.equal((await post('/semana/aprovar', { inicio: '2026-11-16' })).status, 403);
    assert.equal((await post('/a/obra', { obraName: 'Z' }, 'PUT')).status, 403);
    assert.equal((await fetch(`${base}/semana?inicio=2026-11-16`)).status, 200);
  } finally {
    srv.close();
  }
});

test('weeklyCheck: skips without phone/connection, marks only on success, once per week', async () => {
  let marker: string | undefined;
  const sent: string[] = [], skipped: string[] = [];
  let ok = false;
  const run = (over: object = {}) => weeklyCheck({
    now: new Date('2026-11-23T12:00:00Z'), org: 'o', receipts: receipts(), ownerPhone: '5519900000000', connected: true,
    lastSent: () => marker, markSent: (i) => { marker = i; }, send: async (_to, t) => { sent.push(t); return { success: ok }; },
    skipped: (w) => skipped.push(w), ...over,
  });
  assert.equal(await run({ ownerPhone: '' }), false);
  assert.equal(await run({ connected: false }), false);
  assert.deepEqual(skipped, ['OWNER_PHONE não configurado', 'WhatsApp desconectado']);
  assert.equal(await run(), false); // send failed: no marker, retried next check
  assert.equal(marker, undefined);
  ok = true;
  assert.equal(await run(), true);
  assert.equal(marker, '2026-11-16');
  assert.match(sent[1], /Total aprovado: R\$ 5,30/);
  assert.equal(await run(), false); // already sent this week
  assert.equal(sent.length, 2);
});

test('summaryMarker: file fallback without Admin SDK, read back by a new instance', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const file = join(mkdtempSync(join(tmpdir(), 'reemb-')), 'marker.json');
  assert.equal(await summaryMarker(null, 'o', file).get(), undefined);
  await summaryMarker(null, 'o', file).set('2026-11-16');
  assert.equal(await summaryMarker(null, 'o', file).get(), '2026-11-16');
});
