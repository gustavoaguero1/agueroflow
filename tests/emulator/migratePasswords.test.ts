import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, type AdminHandles } from '../../server/firebaseAdmin.ts';
import { verifyPassword } from '../../server/passwords.ts';
import { runMigration } from '../../server/scripts/migratePasswords.ts';

const h = getAdmin() as AdminHandles;

beforeEach(async () => {
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-agueroflow/databases/(default)/documents', { method: 'DELETE' });
});

test('migrate script migrates all plaintext members', async () => {
  await h.db.doc('org_members/a').set({ id: 'a', passwordHash: 'plain-a' });
  await h.db.doc('org_members/b').set({ id: 'b', passwordHash: 'plain-b' });
  await h.db.doc('org_members/c').set({ id: 'c' });
  await h.db.doc('system_security/master_auth').set({ passwordHash: 'plain-master' });

  assert.deepEqual(await runMigration(h), { migrated: 3, skipped: 1 });
  assert.ok(await verifyPassword('plain-a', (await h.db.doc('member_credentials/a').get()).get('hash')));
  assert.ok(await verifyPassword('plain-master', (await h.db.doc('member_credentials/_master_').get()).get('hash')));
  assert.equal((await h.db.doc('org_members/b').get()).get('passwordHash'), undefined);
  assert.equal((await h.db.doc('system_security/master_auth').get()).get('passwordHash'), undefined);
  assert.deepEqual(await runMigration(h), { migrated: 0, skipped: 4 });
});
