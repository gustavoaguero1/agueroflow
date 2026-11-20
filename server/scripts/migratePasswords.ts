import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin, adminStatus, type AdminHandles } from '../firebaseAdmin.ts';
import { migratePlaintextPassword, MASTER_CRED_ID } from '../authService.ts';
import { hashPassword } from '../passwords.ts';

/** Hashes every plaintext password (members + legacy master). Prints nothing sensitive. */
export async function runMigration(h: AdminHandles): Promise<{ migrated: number; skipped: number }> {
  let migrated = 0, skipped = 0;
  for (const d of (await h.db.collection('org_members').get()).docs) {
    if (await migratePlaintextPassword(h, d.id)) migrated++; else skipped++;
  }
  // authService only migrates the master inline at login, so mirror that here.
  const legacyRef = h.db.doc('system_security/master_auth');
  const legacy = (await legacyRef.get()).get('passwordHash');
  if (typeof legacy === 'string' && legacy) {
    const batch = h.db.batch();
    batch.set(h.db.doc(`member_credentials/${MASTER_CRED_ID}`), { hash: await hashPassword(legacy), updatedAt: new Date().toISOString() });
    batch.update(legacyRef, { passwordHash: FieldValue.delete() });
    await batch.commit();
    migrated++;
  } else skipped++;
  return { migrated, skipped };
}

if (process.argv[1]?.endsWith('migratePasswords.ts')) {
  const h = getAdmin();
  if (!h) { console.error(`Firebase Admin desativado: ${adminStatus().reason}`); process.exit(1); }
  const { migrated, skipped } = await runMigration(h);
  console.log(`Senhas migradas: ${migrated}. Ignoradas (sem senha em texto): ${skipped}.`);
}
