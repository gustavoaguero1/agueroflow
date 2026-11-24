import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Operações lê pessoas do diretório, não do cadastro com salários', () => {
  const people = src('src/modules/operations/peopleSource.ts');
  assert.match(people, /collection\(db, 'rh_directory'\)/);
  // rh_employees só é lido quando quem usa tem acesso ao RH
  assert.match(people, /canSeeSalaries/);
  const diario = src('src/modules/operations/diarioSync.ts');
  assert.match(diario, /'rh_directory'/);
  assert.doesNotMatch(diario, /'rh_employees'/);
});

test('todo lugar que grava rh_employees também grava rh_directory', () => {
  const rh = src('src/services/rhPayrollService.ts');
  assert.match(rh, /doc\(db, 'rh_directory', employee\.id\)/);
  assert.match(rh, /deleteDoc\(doc\(db, 'rh_directory', id\)\)/);
  assert.match(rh, /export async function syncRhDirectory\(orgId: string\)/);
  assert.match(rh, /batch\.set\(doc\(db, 'rh_directory', empId\)/);
  const bridge = src('src/modules/operations/opsBridge.ts');
  assert.match(bridge, /path: `rh_directory\/\$\{eid\}`/);
  assert.match(bridge, /createPeopleSource\(ctx\.orgId, track, \{ canSeeSalaries: /);
});
