// Gravação/leitura da equipe de campo com o salário separado (ver fieldWorkerPay.ts).
import { collection, deleteField, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PAY_COLLECTION, splitWorkerPay } from './fieldWorkerPay';

type Row = Record<string, unknown> & { id: string };

/** Grava a pessoa em field_workers sem salário; o salário vai para field_worker_pay (só quem edita o RH consegue). */
export async function saveFieldWorker(data: Row, mode: 'set' | 'update' = 'set'): Promise<void> {
  const { worker, pay } = splitWorkerPay(data);
  const { id, ...rest } = worker;
  if (mode === 'update') await updateDoc(doc(db, 'field_workers', id), { ...rest, salaryHistory: deleteField() });
  else await setDoc(doc(db, 'field_workers', id), rest);
  if (pay) {
    await setDoc(doc(db, PAY_COLLECTION, id), pay, { merge: true })
      .catch((e) => console.warn('Salário não gravado (precisa editar o RH):', e));
  }
}

export function subscribeWorkerPay(
  orgId: string,
  next: (pay: Map<string, { baseSalary?: number; salaryHistory?: unknown[] }>) => void,
): () => void {
  return onSnapshot(
    query(collection(db, PAY_COLLECTION), where('orgId', '==', orgId)),
    (s) => next(new Map(s.docs.map((d) => [d.id, d.data() as { baseSalary?: number; salaryHistory?: unknown[] }]))),
    () => next(new Map()),
  );
}
