import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkNdRetroactiveDate, originalMessageAllowsRetroactive, FileBackedMap } from '../server/ndRetroactive.ts';

test('retroactive check uses the given São Paulo day', () => {
  assert.deepEqual(checkNdRetroactiveDate('20/11/2026', '2026-11-23'), { isRetroactive: true, paymentDateBr: '20/11/2026', todayBrFormatted: '23/11/2026', daysAgo: 3 });
  assert.equal(checkNdRetroactiveDate('23/11/26', '2026-11-23').isRetroactive, false);
  assert.equal(checkNdRetroactiveDate('5/12/2026', '2026-11-23').paymentDateBr, '05/12/2026');
  assert.equal(checkNdRetroactiveDate('lixo', '2026-11-23').isRetroactive, false);
});

test('ordinary wording in the ND message does not skip the date check', () => {
  for (const t of ['favor confirmar ND do almoço do dia 10/11', 'manter data de sempre', 'pode gerar mesmo assim', 'segue nd para confirmar a nd']) {
    assert.equal(originalMessageAllowsRetroactive(t), false, t);
  }
  for (const t of ['ND com data retroativa, já combinado', 'já foi pago dia 10/11', 'pagamento retroativo autorizado']) {
    assert.equal(originalMessageAllowsRetroactive(t), true, t);
  }
});

test('FileBackedMap survives a restart and drops non-persistable fields', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ndp-')), 'paused.json');
  const a = new FileBackedMap<{ id: string; rawMessage?: unknown }>(file, (v) => ({ ...v, rawMessage: undefined }));
  a.set('m1', { id: 'm1', rawMessage: { big: true } });
  a.set('m2', { id: 'm2' });
  a.delete('m2');
  const b = new FileBackedMap<{ id: string; rawMessage?: unknown }>(file, (v) => v);
  assert.deepEqual([...b.keys()], ['m1']);
  assert.equal(b.get('m1')?.rawMessage, undefined);
  assert.ok(readFileSync(file, 'utf8').includes('m1'));
  assert.deepEqual([...new FileBackedMap(join(tmpdir(), 'nao-existe-xyz.json'), (v) => v).keys()], []);
});
