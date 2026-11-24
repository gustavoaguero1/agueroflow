import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualCollection } from '../src/modules/operations/virtualCollections';

/** Fonte falsa: guarda o callback para o teste disparar quando quiser. */
function fakeSource<T>() {
  let cb: ((rows: T[]) => void) | null = null;
  let unsubscribed = false;
  return {
    subscribe: (f: (rows: T[]) => void) => { cb = f; return () => { unsubscribed = true; }; },
    emit: (rows: T[]) => cb?.(rows),
    get unsubscribed() { return unsubscribed; },
  };
}

const join = (a: { id: string }[], b: { id: string }[]) => [...a, ...b];

test('não emite antes de as duas fontes responderem', () => {
  const a = fakeSource<{ id: string }>();
  const b = fakeSource<{ id: string }>();
  const seen: unknown[] = [];
  createVirtualCollection({ subscribeA: a.subscribe, subscribeB: b.subscribe, join }).onSnapshot((s) => seen.push(s));
  a.emit([{ id: 'a1' }]);
  assert.equal(seen.length, 0);
  b.emit([]);
  assert.equal(seen.length, 1);
});

test('reemite quando qualquer fonte muda, com o formato de snapshot', () => {
  const a = fakeSource<{ id: string }>();
  const b = fakeSource<{ id: string }>();
  const seen: Array<{ docs: Array<{ id: string; data: () => unknown }> }> = [];
  createVirtualCollection({ subscribeA: a.subscribe, subscribeB: b.subscribe, join }).onSnapshot((s) => seen.push(s));
  a.emit([{ id: 'a1' }]);
  b.emit([{ id: 'b1' }]);
  b.emit([{ id: 'b1' }, { id: 'b2' }]);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].docs.map((d) => d.id), ['a1', 'b1', 'b2']);
  assert.deepEqual(seen[1].docs[2].data(), { id: 'b2' });
});

test('cancelar a assinatura cancela as duas fontes', () => {
  const a = fakeSource<{ id: string }>();
  const b = fakeSource<{ id: string }>();
  const u = createVirtualCollection({ subscribeA: a.subscribe, subscribeB: b.subscribe, join }).onSnapshot(() => {});
  u();
  assert.equal(a.unsubscribed, true);
  assert.equal(b.unsubscribed, true);
});

test('erro em uma fonte chega ao callback de erro', () => {
  const sources: Array<(e: unknown) => void> = [];
  const vc = createVirtualCollection<{ id: string }, { id: string }>({
    subscribeA: (_cb, err) => { sources.push(err!); return () => {}; },
    subscribeB: () => () => {},
    join,
  });
  let got: unknown = null;
  vc.onSnapshot(() => {}, (e) => { got = e; });
  sources[0]({ code: 'permission-denied' });
  assert.deepEqual(got, { code: 'permission-denied' });
});
