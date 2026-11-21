import { doc, type Firestore, type Transaction } from 'firebase/firestore';

/** Highest NNN among OS-YYYY-NNN numbers (used to seed a missing counter so it never restarts at 1). */
export function maxOrderSeq(orders: Array<{ orderNumber?: string }>): number {
  return orders.reduce((m, o) => {
    const n = /^OS-\d{4}-(\d+)$/.exec(o.orderNumber || '')?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
}

/** Must be called before any write in the transaction. */
export async function nextOrderNumber(tx: Transaction, db: Firestore, orgId: string, seed = 0): Promise<string> {
  const ref = doc(db, 'counters', `${orgId}_work_orders`);
  const snap = await tx.get(ref);
  const seq = snap.exists() ? (snap.data().seq as number) + 1 : seed + 1;
  if (snap.exists()) tx.update(ref, { seq });
  else tx.set(ref, { orgId, seq });
  return `OS-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`;
}
