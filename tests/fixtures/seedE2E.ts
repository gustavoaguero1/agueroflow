// Manual E2E seed for the Auth/Firestore emulators (not shipped). Run with FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST/GCLOUD_PROJECT set.
import { getAdmin } from '../../server/firebaseAdmin.ts';
import { hashPassword } from '../../server/passwords.ts';
import { MASTER_CRED_ID } from '../../server/authService.ts';

const h = getAdmin()!;
const now = new Date().toISOString();
await h.db.doc('organizations/org_a').set({ id: 'org_a', name: 'Aguero Inox', slug: 'aguero-inox', createdAt: now, updatedAt: now });
const member = (id: string, role: string, extra: object = {}) => h.db.doc(`org_members/${id}`).set({
  id, orgId: 'org_a', userId: '', userEmail: `${id}@x.com`, userName: `User ${id}`, role, active: true,
  createdAt: now, updatedAt: now, ...extra,
});
await member('adm', 'Admin', { passwordSet: true });
await h.db.doc('member_credentials/adm').set({ hash: await hashPassword('senha123'), updatedAt: now });
await member('ana', 'Operacional', { passwordSet: false });
await member('bia', 'Operacional', { passwordSet: false });
await h.db.doc(`member_credentials/${MASTER_CRED_ID}`).set({ hash: await hashPassword('master123'), updatedAt: now });
console.log('seeded');
process.exit(0);
