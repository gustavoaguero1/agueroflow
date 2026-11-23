import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiFetch } from '../src/apiAuthFetch.ts';

function setup(token: string | null) {
  const calls: { input: unknown; init?: RequestInit }[] = [];
  const target = {
    location: { origin: 'http://app.test' },
    fetch: async (input: unknown, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response('ok');
    },
  };
  const fetchFn = createApiFetch(async () => token, target);
  const auth = (i = 0) => {
    const c = calls[i];
    const h = new Headers(c.init?.headers ?? (c.input instanceof Request ? c.input.headers : undefined));
    return h.get('authorization');
  };
  return { target: { fetch: fetchFn }, calls, auth };
}

test('adds bearer to /api calls', async () => {
  const { target, auth } = setup('tok');
  await target.fetch('/api/x');
  await target.fetch(new URL('http://app.test/api/y'));
  await target.fetch(new Request('http://app.test/api/z', { method: 'POST' }));
  assert.equal(auth(0), 'Bearer tok');
  assert.equal(auth(1), 'Bearer tok');
  assert.equal(auth(2), 'Bearer tok');
});

test('leaves external urls untouched', async () => {
  const { target, calls, auth } = setup('tok');
  await target.fetch('https://evil.test/api/x');
  await target.fetch('/other');
  assert.equal(auth(0), null);
  assert.equal(auth(1), null);
  assert.equal(calls[0].init, undefined);
});

test('keeps existing authorization header', async () => {
  const { target, auth } = setup('tok');
  await target.fetch('/api/x', { headers: { Authorization: 'Bearer mine' } });
  await target.fetch(new Request('http://app.test/api/x', { headers: { Authorization: 'Bearer req' } }));
  assert.equal(auth(0), 'Bearer mine');
  assert.equal(auth(1), 'Bearer req');
});

test('no token → no header', async () => {
  const { target, auth } = setup(null);
  await target.fetch('/api/x');
  assert.equal(auth(0), null);
});

test('works when the global fetch is a read-only getter (AI Studio)', async () => {
  const calls: unknown[] = [];
  const target = { location: { origin: 'http://app.test' } } as any;
  Object.defineProperty(target, 'fetch', { get: () => async (i: unknown) => { calls.push(i); return new Response('ok'); } });
  const f = createApiFetch(async () => 'tok', target);
  await f('/api/x');
  assert.equal(calls.length, 1);
});

test('mirrors the token in X-Firebase-Auth (proxies may strip Authorization)', async () => {
  const { target, calls } = setup('tok');
  await target.fetch('/api/x');
  await target.fetch('/api/y', { headers: { Authorization: 'Bearer mine' } });
  const h = (i: number) => new Headers(calls[i].init?.headers);
  assert.equal(h(0).get('x-firebase-auth'), 'Bearer tok');
  assert.equal(h(1).get('x-firebase-auth'), 'Bearer mine');
});
