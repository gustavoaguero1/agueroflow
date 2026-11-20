import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreState, watchState, STATE_PATHS, type StateStore } from '../server/stateSync';

function memStore(init: Record<string, string> = {}) {
  const m = new Map<string, Buffer>(Object.entries(init).map(([k, v]) => [k, Buffer.from(v)]));
  const store: StateStore = {
    list: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
    download: async (n) => m.get(n)!,
    upload: async (n, d) => { m.set(n, d); },
  };
  return { m, store };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'state-'));

test('restore writes remote files locally', async () => {
  const dir = tmp();
  const { store } = memStore({ 'server-state/data_a.json': '{"a":1}' });
  const r = await restoreState(store, dir, STATE_PATHS);
  assert.equal(r.restored, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'data_a.json'), 'utf8'), '{"a":1}');
});

test('seeds bucket from local when remote empty', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'data_b.json'), 'B');
  fs.writeFileSync(path.join(dir, 'other.json'), 'x');
  fs.mkdirSync(path.join(dir, 'data_nd_pdfs'));
  fs.writeFileSync(path.join(dir, 'data_nd_pdfs', 'x.pdf'), 'P');
  const { m, store } = memStore();
  const r = await restoreState(store, dir, STATE_PATHS);
  assert.equal(r.seeded, 2);
  assert.equal(m.get('server-state/data_b.json')?.toString(), 'B');
  assert.ok(m.has('server-state/data_nd_pdfs/x.pdf'));
  assert.ok(!m.has('server-state/other.json'));
});

test('uploads changed file after debounce', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'data_whatsapp_auth'));
  const { m, store } = memStore();
  const w = watchState(store, dir, STATE_PATHS, 20);
  fs.writeFileSync(path.join(dir, 'data_whatsapp_auth', 'creds.json'), 'C');
  await new Promise((r) => setTimeout(r, 100));
  await w.flush();
  w.close();
  assert.equal(m.get('server-state/data_whatsapp_auth/creds.json')?.toString(), 'C');
});

test('null store is a no-op', async () => {
  const r = await restoreState(null, tmp(), STATE_PATHS);
  assert.deepEqual(r, { restored: 0, seeded: 0 });
  watchState(null, tmp(), STATE_PATHS).close();
});

test('restore completes before importer continues', async () => {
  const dir = tmp();
  process.env.TLA_DIR = dir;
  const mod = await import('./fixtures/tlaMain');
  assert.equal(mod.seen, 'REMOTE');
});
