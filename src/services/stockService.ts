import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { StockMovement, StockMovementType } from '../types';

export interface StockMovementInput {
  orgId: string;
  unitId: string;
  item: { id: string; sku: string; name: string; unitOfMeasure: string };
  type: StockMovementType;
  quantity: number;
  toUnitId?: string;
  unitCost?: number;
  reason: string;
  orderId?: string;
  orderNumber?: string;
  sourceRef?: string;
  user: { uid: string; name: string };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function weightedAvg(oldQty: number, oldAvg: number, qty: number, cost: number) {
  if (oldQty <= 0 || oldAvg === 0) return round4(cost); // uncosted stock: incoming cost becomes the average
  return round4((oldQty * oldAvg + qty * cost) / (oldQty + qty));
}

/** Applies a stock movement atomically (balance + immutable movement docs). */
export async function applyStockMovement(
  db: Firestore,
  input: StockMovementInput,
): Promise<{ balanceAfter: number; movementIds: string[] }> {
  const { orgId, unitId, item, type, quantity: qty, toUnitId, unitCost, user } = input;
  const reason = (input.reason || '').trim();
  if (!Number.isFinite(qty) || (!(qty > 0) && !(type === 'ajuste' && qty === 0))) throw new Error('A quantidade deve ser maior que zero.');
  if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) throw new Error('Custo unitário inválido.');
  if (type === 'ajuste' && reason.length < 5) throw new Error('Ajuste exige justificativa (mínimo 5 caracteres).');
  if (type === 'transferencia' && (!toUnitId || toUnitId === unitId)) throw new Error('Selecione uma unidade de destino diferente da origem.');

  const balId = (u: string) => `bal_${u}_${item.id}`;
  const movId = (suffix: string) =>
    input.sourceRef ? `mov_${orgId}_${input.sourceRef.replace(/[^A-Za-z0-9_-]/g, '_')}${suffix}` : `mov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`;

  return runTransaction(db, async (tx) => {
    const now = new Date().toISOString();
    const readBal = async (u: string) => {
      const s = await tx.get(doc(db, 'stock_balances', balId(u)));
      return { qty: (s.data()?.currentBalance as number) ?? 0, avg: (s.data()?.averageCost as number) ?? 0 };
    };
    const ids = type === 'transferencia' ? [movId('_out'), movId('_in')] : [movId('')];
    if (input.sourceRef) {
      for (const id of ids) {
        if ((await tx.get(doc(db, 'stock_movements', id))).exists()) throw new Error('Movimento já registrado');
      }
    }
    const origin = await readBal(unitId);
    const dest = type === 'transferencia' ? await readBal(toUnitId!) : null;

    const writeBal = (u: string, balance: number, avg: number) =>
      tx.set(doc(db, 'stock_balances', balId(u)), {
        id: balId(u), orgId, unitId: u, itemId: item.id, currentBalance: balance, averageCost: avg, updatedAt: now,
      });
    const writeMov = (id: string, u: string, t: StockMovementType, balanceAfter: number, why: string) =>
      tx.set(doc(db, 'stock_movements', id), clean<StockMovement>({
        id, orgId, unitId: u, itemId: item.id, itemSku: item.sku, itemName: item.name, type: t, quantity: qty,
        balanceAfter, reason: why || 'Movimentação operacional', orderId: input.orderId, orderNumber: input.orderNumber,
        createdBy: user.uid, userName: user.name, createdAt: now,
      }));

    if (type === 'entrada') {
      const avg = unitCost != null ? weightedAvg(origin.qty, origin.avg, qty, unitCost) : origin.avg;
      const after = origin.qty + qty;
      writeBal(unitId, after, avg);
      writeMov(ids[0], unitId, type, after, reason);
      return { balanceAfter: after, movementIds: ids };
    }
    if (type === 'ajuste') {
      writeBal(unitId, qty, origin.avg);
      writeMov(ids[0], unitId, type, qty, reason);
      return { balanceAfter: qty, movementIds: ids };
    }
    if (qty > origin.qty) {
      throw new Error(`Saldo insuficiente: disponível ${origin.qty} ${item.unitOfMeasure}, solicitado ${qty} ${item.unitOfMeasure}.`);
    }
    const after = origin.qty - qty;
    writeBal(unitId, after, origin.avg);
    writeMov(ids[0], unitId, type, after, reason);
    if (dest) {
      const destAfter = dest.qty + qty;
      // origin uncosted: keep destination average untouched
      writeBal(toUnitId!, destAfter, origin.avg === 0 ? dest.avg : weightedAvg(dest.qty, dest.avg, qty, origin.avg));
      writeMov(ids[1], toUnitId!, 'entrada', destAfter, `Transferência recebida. ${reason}`.trim());
    }
    return { balanceAfter: after, movementIds: ids };
  });
}
