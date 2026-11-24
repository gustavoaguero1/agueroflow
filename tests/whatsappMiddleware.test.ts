import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { memberOrgOf } from '../server/authMiddleware';
import { createWhatsAppMiddlewares } from '../server/whatsappMiddleware';

const req = (user: object | undefined, query: Record<string, string> = {}) => ({ user, query, body: {}, params: {} }) as never;

test('memberOrgOf: empresa pedida só vale se a pessoa for membro dela', () => {
  assert.equal(memberOrgOf(req({ uid: 'a', master: false, orgs: { o1: 'Operacional', o2: 'Admin' } }, { orgId: 'o2' })), 'o2');
  assert.equal(memberOrgOf(req({ uid: 'a', master: false, orgs: { o1: 'Operacional' } }, { orgId: 'o9' })), undefined);
  assert.equal(memberOrgOf(req({ uid: 'm', master: true, orgs: {} }, { orgId: 'o9' })), 'o9');
});

test('memberOrgOf: com uma empresa só, usa ela; sem usuário, nada', () => {
  assert.equal(memberOrgOf(req({ uid: 'a', master: false, orgs: { o1: 'Operacional' } })), 'o1');
  assert.equal(memberOrgOf(req(undefined, { orgId: 'o1' })), undefined);
});

/** App de teste com a cadeia real: usuário falso → middlewares do WhatsApp → rota que mostra o contexto. */
async function serve(user: object) {
  const calls: string[] = [];
  const mws = createWhatsAppMiddlewares({
    runInSession: (s, fn) => { calls.push(`own:${s.key}:${s.orgId}`); return fn(); },
    runAsOrgSender: (org, fn) => { calls.push(`org:${org}`); return fn(); },
  });
  const app = express();
  app.use((r, _s, n) => { (r as { user?: object }).user = user; n(); });
  app.use('/api', mws.companyContext);
  app.use('/api/whatsapp/bridge', mws.ownSessionContext);
  app.all('/api/*', (_r, s) => s.json({ ok: true }));
  const srv = app.listen(0);
  const port = (srv.address() as AddressInfo).port;
  const get = async (p: string) => { calls.length = 0; await fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST' }); return [...calls]; };
  return { get, close: () => srv.close() };
}

test('cadeia real: conectar roda na sessão do próprio usuário, na empresa escolhida', async () => {
  const s = await serve({ uid: 'ana', master: false, orgs: { o1: 'Operacional', o2: 'Gerente' } });
  try {
    assert.deepEqual(await s.get('/api/whatsapp/bridge/connect?orgId=o2'), ['org:o2', 'own:u_ana:o2']);
    assert.deepEqual(await s.get('/api/whatsapp/bridge/status?orgId=o1'), ['org:o1', 'own:u_ana:o1']);
  } finally { s.close(); }
});

test('cadeia real: canal da empresa (enviar, grupos, keepalive) usa o número oficial, não o pessoal', async () => {
  const s = await serve({ uid: 'ana', master: false, orgs: { o1: 'Operacional' } });
  try {
    assert.deepEqual(await s.get('/api/whatsapp/bridge/send'), ['org:o1']);
    assert.deepEqual(await s.get('/api/whatsapp/bridge/groups'), ['org:o1']);
    assert.deepEqual(await s.get('/api/whatsapp/bridge/keepalive'), ['org:o1']);
    assert.deepEqual(await s.get('/api/whatsapp/nd/scan-pending'), ['org:o1']);
  } finally { s.close(); }
});

test('dados do WhatsApp sem empresa válida: 403 para quem não é master (não cai na empresa padrão)', async () => {
  const mws = createWhatsAppMiddlewares({ runInSession: (_s, fn) => fn(), runAsOrgSender: (_o, fn) => fn() });
  const app = express();
  app.use((r, _s, n) => { (r as { user?: object }).user = { uid: 'b', master: false, orgs: { B: 'Operacional', C: 'Admin' } }; n(); });
  app.use('/api', mws.companyContext);
  app.all('/api/*', (_r, s) => s.json({ ok: true }));
  const srv = app.listen(0);
  const port = (srv.address() as AddressInfo).port;
  try {
    const st = async (p: string) => (await fetch(`http://127.0.0.1:${port}${p}`)).status;
    assert.equal(await st('/api/whatsapp/contacts?orgId=X'), 403);
    assert.equal(await st('/api/whatsapp/contacts'), 403);
    assert.equal(await st('/api/composio/whatsapp/status'), 403);
    assert.equal(await st('/api/whatsapp/contacts?orgId=B'), 200);
    assert.equal(await st('/api/rh/qualquer'), 200);
  } finally { srv.close(); }
});

test('cadeia real: empresa de que a pessoa não é membro não abre sessão nenhuma', async () => {
  const s = await serve({ uid: 'ana', master: false, orgs: { o1: 'Operacional', o3: 'Admin' } });
  try {
    assert.deepEqual(await s.get('/api/whatsapp/bridge/connect?orgId=o9'), []);
  } finally { s.close(); }
});
