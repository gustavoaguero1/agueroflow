import type { PurchaseRequisition } from '../types/purchasing.ts';

export type StockReservationStatus = 'ativa' | 'consumida' | 'liberada' | 'cancelada';

export interface StockReservation {
  id: string;
  orgId: string;
  unitId: string;
  projectId?: string;
  workOrderId: string;
  workOrderNumber?: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  unitOfMeasure: string;
  requestedQty: number;
  reservedQty: number;
  shortageQty: number;
  status: StockReservationStatus;
  linkedRequisitionId?: string;
  linkedRequisitionCode?: string;
  idempotencyKey: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  consumedAt?: string;
  releasedAt?: string;
}

export interface StockAvailabilityBreakdown {
  physicalBalance: number;
  activeReservedQty: number;
  availableBalance: number;
  qtyToReserve: number;
  shortageQty: number;
}

const round4 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;
const cleanKey = (v: string): string => String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');

export function reservationDocId(orgId: string, idempotencyKey: string): string {
  return `sres_${cleanKey(orgId)}_${cleanKey(idempotencyKey)}`.slice(0, 160);
}

/**
 * Separates physical balance, active reservations, available balance, reservable qty,
 * and shortage qty that should trigger a Purchase Requisition (RC).
 */
export function computeStockReservationSplit(params: {
  physicalBalance: number;
  existingActiveReservations: readonly Pick<StockReservation, 'reservedQty' | 'status'>[];
  requestedQty: number;
}): StockAvailabilityBreakdown {
  const requestedQty = round4(Number(params.requestedQty));
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    throw new Error('Quantidade solicitada para reserva deve ser maior que zero.');
  }
  const physicalBalance = round4(Math.max(0, Number(params.physicalBalance) || 0));
  const activeReservedQty = round4(
    params.existingActiveReservations
      .filter((r) => r.status === 'ativa')
      .reduce((acc, r) => acc + Math.max(0, Number(r.reservedQty) || 0), 0),
  );
  const availableBalance = round4(Math.max(0, physicalBalance - activeReservedQty));
  const qtyToReserve = round4(Math.min(availableBalance, requestedQty));
  const shortageQty = round4(Math.max(0, requestedQty - qtyToReserve));

  return {
    physicalBalance,
    activeReservedQty,
    availableBalance,
    qtyToReserve,
    shortageQty,
  };
}

export function buildShortageRequisition(params: {
  requisitionId: string;
  requisitionCode: string;
  orgId: string;
  projectId?: string;
  workOrderId: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  item: { id: string; sku: string; name: string; unitOfMeasure: string; unitCost?: number };
  shortageQty: number;
  currentStock: number;
  neededByDate: string;
  actor: { uid: string; name: string };
  nowIso: string;
}): PurchaseRequisition {
  if (params.shortageQty <= 0) {
    throw new Error('Não há falta de estoque para gerar Requisição de Compra.');
  }
  return {
    id: params.requisitionId,
    organizationId: params.orgId,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    code: params.requisitionCode,
    title: `Reposição de falta para ${params.workOrderNumber || params.workOrderId} — ${params.item.name}`,
    requestedBy: params.actor.uid,
    requestedByName: params.actor.name,
    department: 'Estoque & Manutenção',
    urgency: 'alta',
    neededByDate: params.neededByDate,
    items: [
      {
        id: `rci_${params.item.id}`,
        code: params.item.sku,
        description: params.item.name,
        unit: params.item.unitOfMeasure || 'UN',
        quantity: round4(params.shortageQty),
        ...(params.item.unitCost !== undefined ? { estimatedCost: params.item.unitCost } : {}),
        currentStock: round4(params.currentStock),
        notes: `Gerado automaticamente por falta na reserva da OS ${params.workOrderNumber || params.workOrderId}.`,
      },
    ],
    status: 'pendente',
    linkedWorkOrderId: params.workOrderId,
    ...(params.workOrderNumber ? { linkedWorkOrderNumber: params.workOrderNumber } : {}),
    ...(params.workOrderTitle ? { linkedWorkOrderTitle: params.workOrderTitle } : {}),
    notes: `RC automática de falta de material (saldo físico disponível: ${params.currentStock}, falta: ${params.shortageQty} ${params.item.unitOfMeasure}).`,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
}
