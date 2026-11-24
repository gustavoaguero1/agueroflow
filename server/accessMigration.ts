/**
 * Ajusta dados antigos ao acesso por área, ao subir o servidor (Admin SDK, sem regras):
 * completa o diretório de pessoas (rh_directory) e tira salários de field_workers.
 * Sem nada a fazer, não grava nada (pode rodar a cada início).
 */
import { FieldValue } from 'firebase-admin/firestore';
import type { AdminHandles } from './firebaseAdmin.ts';
import { planAccessMigration } from '../src/services/fieldWorkerPay.ts';
import type { RhEmployee } from '../src/types/rhPayroll.ts';

export async function runAccessMigration(h: AdminHandles): Promise<number> {
  const [emps, dir, workers] = await Promise.all([
    h.db.collection('rh_employees').get(),
    h.db.collection('rh_directory').select().get(),
    h.db.collection('field_workers').get(),
  ]);
  const ops = planAccessMigration({
    employees: emps.docs.map((d) => ({ ...(d.data() as RhEmployee), id: d.id })),
    directoryIds: new Set(dir.docs.map((d) => d.id)),
    workers: workers.docs.map((d) => ({ ...d.data(), id: d.id })),
  });
  for (let i = 0; i < ops.length; i += 400) {
    const batch = h.db.batch();
    for (const op of ops.slice(i, i + 400)) {
      const ref = h.db.doc(op.path);
      if (op.kind === 'set') batch.set(ref, op.data!, { merge: true });
      else batch.update(ref, { baseSalary: 0, salaryHistory: FieldValue.delete() });
    }
    await batch.commit();
  }
  return ops.length;
}
