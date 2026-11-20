import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createRequireAuth, requireRole, requireWebhookSecret, PUBLIC_API_PATTERNS } from '../server/authMiddleware.ts';

type Out = { status?: number; body?: unknown; nexted: boolean; user?: unknown };

async function run(handler: (req: Request, res: Response, next: () => void) => unknown, req: Partial<Request>): Promise<Out> {
  const out: Out = { nexted: false };
  const res = {
    status(c: number) { out.status = c; return this; },
    json(b: unknown) { out.body = b; return this; },
  } as unknown as Response;
  const r = { headers: {}, params: {}, query: {}, body: {}, originalUrl: '/api/x', ...req } as Request;
  await handler(r, res, () => { out.nexted = true; });
  if (r.user && !req.user) out.user = r.user;
  return out;
}

const verifier = (claims: Record<string, unknown> | Error) => () => ({
  verifyIdToken: async (token: string, checkRevoked?: boolean) => {
    assert.equal(checkRevoked, true);
    if (claims instanceof Error) throw claims;
    if (token !== 'good') throw new Error('bad token');
    return { uid: 'u1', email: 'u1@x.com', email_verified: true, ...claims } as never;
  },
});

test('public path passes without token', async () => {
  const auth = createRequireAuth(verifier({}));
  for (const p of ['/api/health', '/api/auth/credential-login', '/api/auth/first-access/check/abc', '/api/auth/first-access/complete',
    '/api/hr/onboarding/check/t1', '/api/hr/onboarding/submit', '/api/leads/demo', '/api/outlook/oauth/callback?code=1',
    '/api/composio/whatsapp/webhook', '/api/webhooks/whatsapp-receipts']) {
    assert.equal((await run(auth, { originalUrl: p })).nexted, true, p);
  }
  for (const p of ['/api/healthz', '/api/auth/first-access/check/a/b', '/api/auth/session', '/api/hr/onboarding/list']) {
    assert.equal(PUBLIC_API_PATTERNS.some((r) => r.test(p)), false, p);
  }
});

test('missing token 401', async () => {
  const auth = createRequireAuth(verifier({}));
  assert.deepEqual(await run(auth, {}), { status: 401, body: { error: 'unauthenticated' }, nexted: false });
  const bad = await run(auth, { headers: { authorization: 'Bearer nope' } });
  assert.equal(bad.status, 401);
});

test('valid token sets req.user', async () => {
  const out = await run(createRequireAuth(verifier({ orgs: { o1: 'Admin' } })), { headers: { authorization: 'Bearer good' } });
  assert.equal(out.nexted, true);
  assert.deepEqual(out.user, { uid: 'u1', email: 'u1@x.com', emailVerified: true, master: false, orgs: { o1: 'Admin' } });
});

test('revoked token rejected', async () => {
  const err = Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
  const out = await run(createRequireAuth(verifier(err)), { headers: { authorization: 'Bearer good' } });
  assert.equal(out.status, 401);
});

test('admin disabled 503', async () => {
  const out = await run(createRequireAuth(() => null), { headers: { authorization: 'Bearer good' } });
  assert.deepEqual(out, { status: 503, body: { error: 'auth_unavailable' }, nexted: false });
});

const user = (orgs: Record<string, string>, master = false) => ({ uid: 'u1', master, orgs }) as Request['user'];

test('role allowed', async () => {
  const mw = requireRole('Admin', 'Gerente');
  assert.equal((await run(mw, { user: user({ o1: 'Gerente' }), params: { orgId: 'o1' } })).nexted, true);
  assert.equal((await run(mw, { user: user({ o1: 'Admin', o2: 'Operacional' }), query: { orgId: 'o1' } })).nexted, true);
  assert.equal((await run(mw, { user: user({ o1: 'Admin' }), body: { organizationId: 'o1' } })).nexted, true);
  assert.equal((await run(mw, { user: user({ o1: 'Admin' }) })).nexted, true); // sole org
});

test('role denied 403', async () => {
  const mw = requireRole('Admin', 'Gerente');
  assert.equal((await run(mw, { user: user({ o1: 'Operacional' }), params: { orgId: 'o1' } })).status, 403);
  assert.equal((await run(mw, { user: user({ o1: 'Admin' }), body: { orgId: 'o2' } })).status, 403);
  assert.equal((await run(mw, { user: user({ o1: 'Admin', o2: 'Admin' }) })).status, 403); // ambiguous org
  assert.equal((await run(mw, {})).status, 401);
});

test('master passes any role', async () => {
  assert.equal((await run(requireRole('Admin'), { user: user({}, true) })).nexted, true);
});

test('webhook secret missing 403', async () => {
  const prev = process.env.WEBHOOK_SECRET;
  try {
    delete process.env.WEBHOOK_SECRET;
    assert.equal((await run(requireWebhookSecret, { query: { token: '' } })).status, 403);
    process.env.WEBHOOK_SECRET = 's3cret';
    assert.equal((await run(requireWebhookSecret, { query: { token: 'nope' } })).status, 403);
    assert.equal((await run(requireWebhookSecret, {})).status, 403);
    assert.equal((await run(requireWebhookSecret, { query: { token: 's3cret' } })).nexted, true);
    assert.equal((await run(requireWebhookSecret, { headers: { 'x-webhook-token': 's3cret' } })).nexted, true);
  } finally {
    if (prev === undefined) delete process.env.WEBHOOK_SECRET; else process.env.WEBHOOK_SECRET = prev;
  }
});
