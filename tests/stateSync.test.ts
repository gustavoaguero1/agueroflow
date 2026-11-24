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
    delete: async (n) => { m.delete(n); },
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

test('sessões de WhatsApp por usuário (credenciais e estado) vão para o bucket', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'data_whatsapp_auth', 'u_a'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data_whatsapp_auth', 'u_a', 'creds.json'), 'C');
  fs.mkdirSync(path.join(dir, 'data_whatsapp_bridge_state'));
  fs.writeFileSync(path.join(dir, 'data_whatsapp_bridge_state', 'u_a.json'), 'S');
  const { m, store } = memStore();
  await restoreState(store, dir, STATE_PATHS);
  assert.ok(m.has('server-state/data_whatsapp_auth/u_a/creds.json'));
  assert.ok(m.has('server-state/data_whatsapp_bridge_state/u_a.json'));
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

test('watches directory created after start', async () => {
  const dir = tmp();
  const { m, store } = memStore();
  const w = watchState(store, dir, STATE_PATHS, 20);
  fs.mkdirSync(path.join(dir, 'data_whatsapp_auth'));
  await new Promise((r) => setTimeout(r, 50));
  fs.writeFileSync(path.join(dir, 'data_whatsapp_auth', 'creds.json'), 'N');
  await new Promise((r) => setTimeout(r, 100));
  await w.flush();
  w.close();
  assert.equal(m.get('server-state/data_whatsapp_auth/creds.json')?.toString(), 'N');
});

test('deleted file removed from store', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'data_whatsapp_auth'));
  const f = path.join(dir, 'data_whatsapp_auth', 'creds.json');
  fs.writeFileSync(f, 'C');
  const { m, store } = memStore({ 'server-state/data_whatsapp_auth/creds.json': 'C' });
  const w = watchState(store, dir, STATE_PATHS, 20);
  fs.unlinkSync(f);
  await new Promise((r) => setTimeout(r, 100));
  await w.flush();
  w.close();
  assert.ok(!m.has('server-state/data_whatsapp_auth/creds.json'));
});

test('flush uploads change not yet seen by watcher', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'data_whatsapp_auth'));
  const { m, store } = memStore();
  const w = watchState(store, dir, STATE_PATHS, 5000);
  fs.writeFileSync(path.join(dir, 'data_whatsapp_auth', 'creds.json'), 'NEW');
  fs.writeFileSync(path.join(dir, 'data_z.json'), 'Z');
  await w.flush();
  w.close();
  assert.equal(m.get('server-state/data_whatsapp_auth/creds.json')?.toString(), 'NEW');
  assert.equal(m.get('server-state/data_z.json')?.toString(), 'Z');
});

test('watcher callback survives removed directory', async () => {
  const dir = tmp();
  const sub = path.join(dir, 'data_nd_pdfs');
  fs.mkdirSync(sub);
  const { m, store } = memStore();
  const w = watchState(store, dir, STATE_PATHS, 20);
  fs.rmSync(sub, { recursive: true });
  await new Promise((r) => setTimeout(r, 80));
  fs.mkdirSync(sub); // recreated: must be watched again
  await new Promise((r) => setTimeout(r, 80));
  fs.writeFileSync(path.join(sub, 'a.pdf'), 'A');
  await new Promise((r) => setTimeout(r, 100));
  await w.flush();
  w.close();
  assert.equal(m.get('server-state/data_nd_pdfs/a.pdf')?.toString(), 'A');
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
