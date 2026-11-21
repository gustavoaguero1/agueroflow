import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { runNfeSync as runRaw, createNfeSyncRouter, type SyncResult } from '../../server/nfe/nfeSync.ts';
import type { SefazCfg } from '../../server/nfe/sefaz.ts';
import { distResponse, resNFe, eventoResponse, testPfx } from '../fixtures/sefaz.ts';

const PROJECT = 'demo-agueroflow';
const h = getAdmin() as AdminHandles;
assert.ok(h);
const full = readFileSync(new URL('../fixtures/nfe-sample.xml', import.meta.url), 'utf8');
const A = '35261111111111111111550010000099991000099991';
const B = '35261111111111111111550010000088881000088881';
const T0 = new Date('2026-11-21T13:00:00Z');
const MIN = 60_000;

beforeEach(async () => {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
});

type Call = { url: string; body: string };
function fake(dist: (ultNSU: string, n: number) => string, evento = () => eventoResponse('135')) {
  const calls: Call[] = [];
  let clock = T0;
  const cfg: SefazCfg = {
    pfx: testPfx().pfx, passphrase: 'teste', cnpj: '22222222000122', uf: '35', ambiente: '2', orgId: 'org_a', now: () => clock,
    transport: async (url, body) => {
      calls.push({ url, body });
      if (url.includes('Distribuicao')) return dist(/<ultNSU>(\d+)<\/ultNSU>/.exec(body)![1], calls.filter((c) => c.url.includes('Distribuicao')).length);
      return evento();
    },
  };
  return { cfg, calls, setNow: (d: Date) => { clock = d; } };
}
const state = async () => (await h.db.doc('nfe_sync/org_a').get()).data()!;
const doc = async (chave: string) => (await h.db.doc(`nfe_documents/org_a_${chave}`).get()).data();
const runNfeSync = async (hh: AdminHandles, cfg: SefazCfg) => (await runRaw(hh, cfg)) as Extract<SyncResult, { fetched: number }>;
const n15 = (n: number) => String(n).padStart(15, '0');

test('cStat 137 schedules backoff', async () => {
  await h.db.doc('nfe_sync/org_a').set({ orgId: 'org_a', ultNSU: n15(5) });
  const f = fake(() => distResponse({ cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: n15(5), maxNSU: n15(5) }));
  const r = await runNfeSync(h, f.cfg);
  assert.equal(f.calls.length, 1);
  assert.equal(r.nextRunAt, new Date(T0.getTime() + 61 * MIN).toISOString());
  const s = await state();
  assert.equal(s.ultNSU, n15(5)); assert.equal(s.nextRunAt, r.nextRunAt); assert.equal(s.lastRunAt, T0.toISOString());
  assert.match(s.lastStatus, /^137/);
});

test('cStat 656 keeps ultNSU and backs off', async () => {
  await h.db.doc('nfe_sync/org_a').set({ orgId: 'org_a', ultNSU: n15(7) });
  const f = fake(() => distResponse({ cStat: '656', xMotivo: 'Consumo Indevido', ultNSU: n15(0), maxNSU: n15(0) }));
  const r = await runNfeSync(h, f.cfg);
  assert.equal((await state()).ultNSU, n15(7));
  assert.equal(r.nextRunAt, new Date(T0.getTime() + 61 * MIN).toISOString());
});

test('sync skips before nextRunAt', async () => {
  const next = new Date(T0.getTime() + 10 * MIN).toISOString();
  await h.db.doc('nfe_sync/org_a').set({ orgId: 'org_a', ultNSU: n15(5), nextRunAt: next });
  const f = fake(() => { throw new Error('não deveria chamar'); });
  assert.deepEqual(await runNfeSync(h, f.cfg), { skipped: true, nextRunAt: next });
  assert.equal(f.calls.length, 0);
});

test('stores summaries and full notes, sends ciência once per chave', async () => {
  const docs = [
    { nsu: n15(1), schema: 'resNFe_v1.01.xsd', xml: resNFe(A) },
    { nsu: n15(2), schema: 'resNFe_v1.01.xsd', xml: resNFe(B, '3') },
    { nsu: n15(3), schema: 'procNFe_v4.00.xsd', xml: full },
    { nsu: n15(4), schema: 'resEvento_v1.01.xsd', xml: '<resEvento/>' },
  ];
  const f = fake((ult) => ult === n15(0)
    ? distResponse({ cStat: '138', ultNSU: n15(4), maxNSU: n15(4), docs })
    : distResponse({ cStat: '137', ultNSU: ult, maxNSU: ult }));
  const r = await runNfeSync(h, f.cfg);
  assert.deepEqual({ ...r, nextRunAt: undefined }, { fetched: 4, summaries: 2, full: 1, ciencia: 1, nextRunAt: undefined });
  assert.equal(r.nextRunAt, new Date(T0.getTime() + 61 * MIN).toISOString()); // caught up: SEFAZ asks ≥ 1h
  assert.equal(f.calls.filter((c) => c.url.includes('RecepcaoEvento')).length, 1);
  assert.ok(f.calls.find((c) => c.url.includes('RecepcaoEvento'))!.body.includes(`<chNFe>${A}</chNFe>`));
  const a = await doc(A);
  assert.equal(a!.status, 'resumo'); assert.equal(a!.cienciaEnviadaEm, T0.toISOString());
  const b = await doc(B);
  assert.equal(b!.situacao, 'cancelada'); assert.equal(b!.cienciaEnviadaEm, undefined);
  const c = await doc('35261111111111111111550010000012341000012345');
  assert.equal(c!.source, 'sefaz'); assert.equal(c!.status, 'aguardando_classificacao');
  assert.equal((await state()).ultNSU, n15(4));

  // Same summary delivered again later → no second ciência.
  f.setNow(new Date(T0.getTime() + 62 * MIN));
  await h.db.doc('nfe_sync/org_a').update({ ultNSU: n15(0) });
  const r2 = await runNfeSync(h, f.cfg);
  assert.equal(r2.ciencia, 0);
  assert.equal(f.calls.filter((c) => c.url.includes('RecepcaoEvento')).length, 1);
});

test('ciência duplicada (573) counts as done; failures stay pending', async () => {
  let cStat = '999';
  const f = fake((ult) => ult === n15(0)
    ? distResponse({ cStat: '138', ultNSU: n15(1), maxNSU: n15(1), docs: [{ nsu: n15(1), schema: 'resNFe_v1.01.xsd', xml: resNFe(A) }] })
    : distResponse({ cStat: '137', ultNSU: ult, maxNSU: ult }), () => eventoResponse(cStat));
  assert.equal((await runNfeSync(h, f.cfg)).ciencia, 0);
  assert.equal((await doc(A))!.cienciaEnviadaEm, undefined);
  cStat = '573';
  f.setNow(new Date(T0.getTime() + 62 * MIN));
  assert.equal((await runNfeSync(h, f.cfg)).ciencia, 1);
  assert.ok((await doc(A))!.cienciaEnviadaEm);
});

test('stops after 20 calls and resumes in 5 minutes when more remain', async () => {
  const f = fake((ult) => {
    const n = Number(ult) + 1;
    return distResponse({ cStat: '138', ultNSU: n15(n), maxNSU: n15(100), docs: [{ nsu: n15(n), schema: 'resEvento_v1.01.xsd', xml: '<resEvento/>' }] });
  });
  const r = await runNfeSync(h, f.cfg);
  assert.equal(f.calls.length, 20);
  assert.equal(r.fetched, 20);
  assert.equal(r.nextRunAt, new Date(T0.getTime() + 5 * MIN).toISOString());
  assert.equal((await state()).ultNSU, n15(20));
});

test('full NF-e for another destinatário is not imported', async () => {
  const other = full.replace('<dest><CNPJ>22222222000122', '<dest><CNPJ>33333333000133');
  const f = fake(() => distResponse({ cStat: '138', ultNSU: n15(1), maxNSU: n15(1), docs: [{ nsu: n15(1), schema: 'procNFe_v4.00.xsd', xml: other }] }));
  assert.equal((await runNfeSync(h, f.cfg)).full, 0);
  assert.equal((await h.db.collection('nfe_documents').get()).size, 0);
});

test('transport failure keeps ultNSU and backs off', async () => {
  await h.db.doc('nfe_sync/org_a').set({ orgId: 'org_a', ultNSU: n15(3) });
  const f = fake(() => { throw new Error('ECONNRESET'); });
  const r = await runNfeSync(h, f.cfg);
  assert.equal(r.nextRunAt, new Date(T0.getTime() + 61 * MIN).toISOString());
  const s = await state();
  assert.equal(s.ultNSU, n15(3)); assert.match(s.lastStatus, /ECONNRESET/);
});

async function route(method: string, path: string, role: string, cfg: SefazCfg | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { uid: 'u', master: false, orgs: { org_a: role as any } }; next(); });
  app.use('/api/nfe', createNfeSyncRouter(() => h, () => cfg));
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/nfe/${path}`, { method });
    return { status: r.status, body: await r.json() as any };
  } finally { srv.close(); }
}

test('sync routes: role check, honours nextRunAt, status for members', async () => {
  const f = fake(() => distResponse({ cStat: '137', ultNSU: n15(0), maxNSU: n15(0) }));
  assert.equal((await route('POST', 'sync-now', 'Operacional', f.cfg)).status, 403);
  const first = await route('POST', 'sync-now', 'Gerente', f.cfg);
  assert.equal(first.status, 200); assert.equal(first.body.fetched, 0);
  const again = await route('POST', 'sync-now', 'Admin', f.cfg);
  assert.equal(again.body.skipped, true);
  const st = await route('GET', 'sync-status', 'Visualizador', f.cfg);
  assert.equal(st.body.configured, true); assert.match(st.body.lastStatus, /^137/);
  assert.equal((await route('POST', 'sync-now', 'Admin', null)).status, 503);
  assert.equal((await route('GET', 'sync-status', 'Visualizador', null)).body.configured, false);
});

const oneSummary = (...chaves: string[]) => (ult: string) => ult === n15(0)
  ? distResponse({ cStat: '138', ultNSU: n15(chaves.length), maxNSU: n15(chaves.length), docs: chaves.map((c, i) => ({ nsu: n15(i + 1), schema: 'resNFe_v1.01.xsd', xml: resNFe(c) })) })
  : distResponse({ cStat: '137', ultNSU: ult, maxNSU: ult });
const eventos = (calls: Call[]) => calls.filter((c) => c.url.includes('RecepcaoEvento')).length;

test('permanent ciencia rejection leaves queue', async () => {
  const f = fake(oneSummary(A), () => eventoResponse('650'));
  await runNfeSync(h, f.cfg);
  const a = (await doc(A))!;
  assert.equal(a.cienciaPendente, undefined);
  assert.deepEqual(a.cienciaErro, { cStat: '650', xMotivo: 'Evento registrado', at: T0.toISOString() });
  f.setNow(new Date(T0.getTime() + 62 * MIN));
  await runNfeSync(h, f.cfg);
  assert.equal(eventos(f.calls), 1);
});

test('transient retried max 3', async () => {
  const f = fake(oneSummary(A), () => eventoResponse('999'));
  for (let i = 0; i < 4; i++) { f.setNow(new Date(T0.getTime() + i * 62 * MIN)); await runNfeSync(h, f.cfg); }
  assert.equal(eventos(f.calls), 3);
  const a = (await doc(A))!;
  assert.equal(a.cienciaTentativas, 3); assert.equal(a.cienciaPendente, undefined); assert.equal(a.cienciaErro.cStat, '999');
});

test('transport error stops the ciência loop and stays pending', async () => {
  const f = fake(oneSummary(A, B), () => { throw new Error('ETIMEDOUT'); });
  await runNfeSync(h, f.cfg);
  assert.equal(eventos(f.calls), 1);
  const docs = [(await doc(A))!, (await doc(B))!];
  assert.equal(docs.filter((d) => d.cienciaPendente === true).length, 2);
  assert.equal(docs.filter((d) => d.cienciaTentativas === 1).length, 1);
});

test('lease covers the run (25 min) and a skip during the lease returns lockedUntil', async () => {
  let leased: string | undefined;
  const f = fake(() => distResponse({ cStat: '137', ultNSU: n15(0), maxNSU: n15(0) }));
  const base = f.cfg.transport!;
  f.cfg.transport = async (url, body, action) => { leased = (await state()).lockedUntil; return base(url, body, action); };
  await runNfeSync(h, f.cfg);
  assert.equal(leased, new Date(T0.getTime() + 25 * MIN).toISOString());
  assert.equal((await state()).lockedUntil, undefined);
  const until = new Date(T0.getTime() + 20 * MIN).toISOString();
  await h.db.doc('nfe_sync/org_a').set({ orgId: 'org_a', ultNSU: n15(0), lockedUntil: until });
  assert.deepEqual(await runRaw(h, f.cfg), { skipped: true, nextRunAt: until });
});

test('full XML arriving after the summary cancels the pending ciência', async () => {
  const chave = '35261111111111111111550010000012341000012345';
  const f = fake(() => distResponse({ cStat: '138', ultNSU: n15(2), maxNSU: n15(2), docs: [
    { nsu: n15(1), schema: 'resNFe_v1.01.xsd', xml: resNFe(chave) },
    { nsu: n15(2), schema: 'procNFe_v4.00.xsd', xml: full },
  ] }));
  const r = await runNfeSync(h, f.cfg);
  assert.equal(r.ciencia, 0); assert.equal(eventos(f.calls), 0);
  const d = (await doc(chave))!;
  assert.equal(d.status, 'aguardando_classificacao'); assert.equal(d.cienciaPendente, undefined);
});
