import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { Item, StockMovement, Unit } from '../types';
import type { MaterialReceiptRecord, PurchaseOrder } from '../types/purchasing';
import { weightedAverageCost, movementIdFor } from './stockService';

export type ReceiptStockDisposition = 'estoque' | 'nao_estocavel';

export interface PurchaseReceiptLineInput {
  purchaseOrderItemId: string;
  quantityReceived: number;
  heatNumber?: string;
  isConform: boolean;
  nonConformityNotes?: string;
  stockDisposition: ReceiptStockDisposition;
  catalogItemId?: string;
}

export interface RegisterPurchaseReceiptInput {
  organizationId: string;
  purchaseOrderId: string;
  invoiceNumber: string;
  invoiceKey?: string;
  receiptDate: string;
  receivedBy: string;
  receivedByName: string;
  stockUnitId?: string;
  itemsReceived: PurchaseReceiptLineInput[];
  status: MaterialReceiptRecord['status'];
  notes?: string;
}

export interface RegisterPurchaseReceiptResult {
  receiptId: string;
  purchaseOrderStatus: PurchaseOrder['status'];
  stockMovementIds: string[];
  stockLines: number;
  quantityAddedToStock: number;
}

const cleanIdPart = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 90);

export function purchaseReceiptId(input: Pick<RegisterPurchaseReceiptInput, 'organizationId' | 'invoiceNumber' | 'invoiceKey'>, supplierCnpj: string): string {
  const invoiceToken = input.invoiceKey?.trim() || `${cleanIdPart(supplierCnpj || 'sem_cnpj')}_${cleanIdPart(input.invoiceNumber)}`;
  // One NF-e can be applied only once per organization; this prevents reusing it against another PO.
  return `rec_${cleanIdPart(input.organizationId)}_${cleanIdPart(invoiceToken)}`;
}

const normalizeUnit = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
const round4 = (value: number) => Math.round(value * 10000) / 10000;
const safe = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;

/**
 * Registers a physical receipt and, in the same Firestore transaction, updates
 * the PO quantities, accepted stock balances and immutable stock movements.
 * An invoice can be applied once per purchase order. The deterministic receipt/movement IDs make retries idempotent.
 */
export async function registerPurchaseReceipt(
  firestore: Firestore,
  input: RegisterPurchaseReceiptInput,
): Promise<RegisterPurchaseReceiptResult> {
  const invoiceNumber = input.invoiceNumber.trim();
  if (!input.organizationId.trim()) throw new Error('Empresa não identificada.');
  if (!input.purchaseOrderId.trim()) throw new Error('Selecione uma Ordem de Compra.');
  if (!invoiceNumber) throw new Error('Informe o número da NF-e.');
  if (input.invoiceKey && !/^\d{44}$/.test(input.invoiceKey.trim())) {
    throw new Error('A chave de acesso da NF-e deve conter exatamente 44 dígitos.');
  }
  const parsedReceiptDate = new Date(`${input.receiptDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receiptDate) || Number.isNaN(parsedReceiptDate.getTime()) || parsedReceiptDate.toISOString().slice(0, 10) !== input.receiptDate) {
    throw new Error('Data de recebimento inválida.');
  }
  if (!input.receivedBy.trim() || !input.receivedByName.trim()) {
    throw new Error('Não foi possível identificar o usuário responsável pelo recebimento.');
  }
  if (!Array.isArray(input.itemsReceived) || input.itemsReceived.length === 0) {
    throw new Error('Informe ao menos um item recebido.');
  }
  if (input.status === 'rejeitado' && (input.notes || '').trim().length < 5) {
    throw new Error('Informe o motivo da rejeição (mínimo 5 caracteres).');
  }

  const seenLines = new Set<string>();
  for (const line of input.itemsReceived) {
    if (!line.purchaseOrderItemId || seenLines.has(line.purchaseOrderItemId)) {
      throw new Error('Há itens repetidos ou inválidos neste recebimento.');
    }
    seenLines.add(line.purchaseOrderItemId);
    if (!Number.isFinite(line.quantityReceived) || line.quantityReceived < 0) {
      throw new Error('As quantidades recebidas devem ser números iguais ou maiores que zero.');
    }
    if (!line.isConform && (line.nonConformityNotes || '').trim().length < 5) {
      throw new Error('Descreva a não conformidade do material (mínimo 5 caracteres).');
    }
  }
  if (!input.itemsReceived.some((line) => line.quantityReceived > 0)) {
    throw new Error('Informe uma quantidade maior que zero em pelo menos um item.');
  }

  const now = new Date().toISOString();
  const orderRef = doc(firestore, 'purchasing_orders', input.purchaseOrderId);
  const orderSnapData = await runTransaction(firestore, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Ordem de Compra não encontrada.');
    const order = { id: orderSnap.id, ...orderSnap.data() } as PurchaseOrder;
    if (order.organizationId !== input.organizationId) throw new Error('A Ordem de Compra não pertence à empresa selecionada.');
    if (order.status === 'cancelada') throw new Error('Não é possível receber uma Ordem de Compra cancelada.');

    const receiptId = purchaseReceiptId(input, order.supplierCnpj);
    const receiptRef = doc(firestore, 'purchasing_receipts', receiptId);
    const receiptSnap = await tx.get(receiptRef);
    if (receiptSnap.exists()) throw new Error('Esta NF-e já foi registrada para esta Ordem de Compra.');

    const orderItems = new Map(order.items.map((item) => [item.id, item]));
    const requestedLines = input.itemsReceived
      .filter((line) => line.quantityReceived > 0)
      .map((line) => {
        const orderItem = orderItems.get(line.purchaseOrderItemId);
        if (!orderItem) throw new Error('Um dos itens informados não pertence a esta Ordem de Compra.');
        const alreadyReceived = Number(orderItem.quantityReceived || 0);
        const remaining = Number(orderItem.quantityOrdered) - alreadyReceived;
        if (!Number.isFinite(orderItem.quantityOrdered) || orderItem.quantityOrdered <= 0 || !Number.isFinite(alreadyReceived) || alreadyReceived < 0 || remaining < -0.0001) {
          throw new Error(`A quantidade recebida anteriormente de "${orderItem.description}" é inválida.`);
        }
        if (line.quantityReceived > remaining + 0.0001) {
          throw new Error(`A quantidade de "${orderItem.description}" excede o saldo pendente de ${round4(Math.max(0, remaining))} ${orderItem.unit}.`);
        }
        const stockEligible = input.status !== 'rejeitado' && line.isConform && line.stockDisposition === 'estoque';
        if (stockEligible && !line.catalogItemId) {
          throw new Error(`Vincule "${orderItem.description}" a um item do catálogo ou marque como não estocável.`);
        }
        if (stockEligible && (!input.stockUnitId || !input.stockUnitId.trim())) {
          throw new Error('Selecione a unidade de destino do estoque.');
        }
        if (stockEligible && (!Number.isFinite(orderItem.unitPrice) || orderItem.unitPrice < 0 || !Number.isFinite(order.freightValue || 0) || (order.freightValue || 0) < 0)) {
          throw new Error(`O custo unitário de "${orderItem.description}" na OC é inválido.`);
        }
        return { line, orderItem, stockEligible };
      });

    const stockLines = requestedLines.filter((entry) => entry.stockEligible);
    const unitRef = stockLines.length
      ? doc(firestore, 'units', input.stockUnitId!)
      : null;
    const catalogIds = [...new Set(stockLines.map((entry) => entry.line.catalogItemId!))];
    const catalogRefs = catalogIds.map((id) => doc(firestore, 'items', id));
    const balanceRefs = catalogIds.map((id) => doc(firestore, 'stock_balances', `bal_${input.stockUnitId}_${id}`));
    const movementRefs = stockLines.map((entry) => {
      const id = movementIdFor(input.organizationId, `receipt:${receiptId}:${entry.line.purchaseOrderItemId}`);
      return { id, ref: doc(firestore, 'stock_movements', id), line: entry };
    });

    // All transaction reads happen before the first write.
    const [unitSnap, catalogSnaps, balanceSnaps, movementSnaps] = await Promise.all([
      unitRef ? tx.get(unitRef) : Promise.resolve(null),
      Promise.all(catalogRefs.map((ref) => tx.get(ref))),
      Promise.all(balanceRefs.map((ref) => tx.get(ref))),
      Promise.all(movementRefs.map((entry) => tx.get(entry.ref))),
    ]);

    if (unitSnap && (!unitSnap.exists() || unitSnap.data()?.orgId !== input.organizationId)) {
      throw new Error('A unidade de destino não pertence à empresa selecionada.');
    }
    const catalogById = new Map<string, Item>();
    catalogSnaps.forEach((snap, index) => {
      if (!snap.exists()) throw new Error('Um dos materiais vinculados não existe mais no catálogo.');
      const item = { id: snap.id, ...snap.data() } as Item;
      if (item.orgId !== input.organizationId || item.type !== 'peca' || item.active === false || item.status === 'INACTIVE') {
        throw new Error(`O item "${item.name}" não é um material ativo e estocável desta empresa.`);
      }
      catalogById.set(catalogIds[index], item);
    });

    const balanceById = new Map<string, { ref: typeof balanceRefs[number]; quantity: number; averageCost?: number }>();
    balanceSnaps.forEach((snap, index) => {
      const data = snap.data();
      const quantity = Number(data?.currentBalance ?? 0);
      if (!Number.isFinite(quantity) || quantity < 0 || (data?.averageCost !== undefined && (!Number.isFinite(Number(data.averageCost)) || Number(data.averageCost) < 0))) throw new Error('O saldo ou custo médio atual do estoque está inválido; corrija-o antes de receber.');
      balanceById.set(catalogIds[index], {
        ref: balanceRefs[index],
        quantity,
        averageCost: data?.averageCost === undefined ? undefined : Number(data.averageCost),
      });
    });

    movementSnaps.forEach((snap) => {
      if (snap.exists()) throw new Error('Este recebimento já possui uma movimentação de estoque registrada.');
    });

    const orderSubtotal = Number(order.subtotal) > 0
      ? Number(order.subtotal)
      : order.items.reduce((sum, item) => sum + (Number(item.totalPrice) || Number(item.quantityOrdered) * Number(item.unitPrice)), 0);
    const landedUnitCost = (orderItem: PurchaseOrder['items'][number]) => {
      const baseCost = Number(orderItem.unitPrice);
      if (order.freightType !== 'FOB' || !(Number(order.freightValue) > 0) || !(orderSubtotal > 0)) return round4(baseCost);
      const lineTotal = Number(orderItem.totalPrice) || Number(orderItem.quantityOrdered) * baseCost;
      const freightPerUnit = Number(order.freightValue) * (lineTotal / orderSubtotal) / Number(orderItem.quantityOrdered);
      return round4(baseCost + freightPerUnit);
    };

    const receiptLines = requestedLines.map(({ line, orderItem, stockEligible }) => {
      const catalogItem = stockEligible ? catalogById.get(line.catalogItemId!) : undefined;
      if (catalogItem && normalizeUnit(catalogItem.unitOfMeasure) !== normalizeUnit(orderItem.unit)) {
        throw new Error(`A unidade do catálogo (${catalogItem.unitOfMeasure}) não corresponde à unidade da OC (${orderItem.unit}) para "${orderItem.description}".`);
      }
      const accepted = input.status !== 'rejeitado' && line.isConform;
      const stockMovement = stockEligible
        ? movementRefs.find((entry) => entry.line.line.purchaseOrderItemId === line.purchaseOrderItemId)!
        : undefined;
      return {
        itemId: orderItem.id,
        purchaseOrderItemId: orderItem.id,
        description: orderItem.description,
        quantityReceived: line.quantityReceived,
        unit: orderItem.unit,
        heatNumber: line.heatNumber?.trim() || undefined,
        isConform: accepted,
        nonConformityNotes: line.nonConformityNotes?.trim() || (accepted ? undefined : input.notes?.trim() || undefined),
        catalogItemId: catalogItem?.id,
        catalogItemSku: catalogItem?.sku,
        stockUnitId: stockEligible ? input.stockUnitId : undefined,
        unitCost: input.status !== 'rejeitado' && line.isConform ? landedUnitCost(orderItem) : undefined,
        quantityAccepted: accepted ? line.quantityReceived : 0,
        quantityInStock: stockEligible ? line.quantityReceived : 0,
        stockMovementId: stockMovement?.id,
        stockStatus: stockEligible ? 'entrada_registrada' : accepted ? 'nao_estocavel' : 'bloqueado_qualidade',
      };
    });

    const nextOrderItems = order.items.map((item) => {
      const received = requestedLines.find((entry) => entry.orderItem.id === item.id);
      if (!received || input.status === 'rejeitado' || !received.line.isConform) return item;
      return { ...item, quantityReceived: round4(Number(item.quantityReceived || 0) + received.line.quantityReceived) };
    });
    const allDelivered = nextOrderItems.every((item) => Number(item.quantityReceived || 0) >= Number(item.quantityOrdered) - 0.0001);
    const anyDelivered = nextOrderItems.some((item) => Number(item.quantityReceived || 0) > 0);
    const nextStatus: PurchaseOrder['status'] = allDelivered ? 'recebida_total' : anyDelivered ? 'recebida_parcial' : order.status;

    const stockTotals = new Map<string, { quantity: number; totalCost: number; item: Item; startingQuantity: number; averageCost?: number }>();
    for (const { line, orderItem, stockEligible } of requestedLines) {
      if (!stockEligible) continue;
      const item = catalogById.get(line.catalogItemId!)!;
      const current = balanceById.get(item.id)!;
      const total = stockTotals.get(item.id) || {
        quantity: 0,
        totalCost: 0,
        item,
        startingQuantity: current.quantity,
        averageCost: current.averageCost,
      };
      total.quantity += line.quantityReceived;
      total.totalCost += line.quantityReceived * landedUnitCost(orderItem);
      stockTotals.set(item.id, total);
    }

    for (const [itemId, total] of stockTotals) {
      const averageIncomingCost = total.quantity > 0 ? total.totalCost / total.quantity : 0;
      const nextAverage = weightedAverageCost(total.startingQuantity, total.averageCost, total.quantity, averageIncomingCost);
      const nextQuantity = round4(total.startingQuantity + total.quantity);
      tx.set(doc(firestore, 'stock_balances', `bal_${input.stockUnitId}_${itemId}`), {
        id: `bal_${input.stockUnitId}_${itemId}`,
        orgId: input.organizationId,
        unitId: input.stockUnitId,
        itemId,
        currentBalance: nextQuantity,
        averageCost: nextAverage,
        updatedAt: now,
      });
    }

    const cumulativeByItem = new Map<string, number>();
    const movementIds: string[] = [];
    let quantityAddedToStock = 0;
    for (const movement of movementRefs) {
      const { line, orderItem } = movement.line;
      const catalogItem = catalogById.get(line.catalogItemId!)!;
      const balance = balanceById.get(catalogItem.id)!;
      const cumulative = (cumulativeByItem.get(catalogItem.id) || 0) + line.quantityReceived;
      cumulativeByItem.set(catalogItem.id, cumulative);
      const movementDoc: StockMovement & {
        purchaseOrderId: string;
        purchaseOrderCode: string;
        receiptId: string;
        invoiceNumber: string;
        supplierName: string;
        sourceRef: string;
        unitCost: number;
        totalCost: number;
      } = {
        id: movement.id,
        orgId: input.organizationId,
        unitId: input.stockUnitId!,
        itemId: catalogItem.id,
        itemSku: catalogItem.sku,
        itemName: catalogItem.name,
        type: 'entrada',
        quantity: line.quantityReceived,
        balanceAfter: round4(balance.quantity + cumulative),
        reason: `Recebimento da OC ${order.code} — NF-e ${invoiceNumber}`,
        createdBy: input.receivedBy,
        userName: input.receivedByName,
        createdAt: now,
        purchaseOrderId: order.id,
        purchaseOrderCode: order.code,
        receiptId,
        invoiceNumber,
        supplierName: order.supplierName,
        sourceRef: `receipt:${receiptId}:${orderItem.id}`,
        unitCost: landedUnitCost(orderItem),
        totalCost: round4(line.quantityReceived * landedUnitCost(orderItem)),
      };
      tx.set(movement.ref, safe(movementDoc));
      movementIds.push(movement.id);
      quantityAddedToStock += line.quantityReceived;
    }

    const receipt: MaterialReceiptRecord = {
      id: receiptId,
      organizationId: input.organizationId,
      purchaseOrderId: order.id,
      purchaseOrderCode: order.code,
      supplierName: order.supplierName,
      invoiceNumber,
      invoiceKey: input.invoiceKey?.trim() || undefined,
      receiptDate: input.receiptDate,
      receivedBy: input.receivedBy,
      receivedByName: input.receivedByName,
      itemsReceived: receiptLines,
      stockUnitId: stockLines.length ? input.stockUnitId : undefined,
      stockMovementIds: movementIds,
      status: input.status,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
    };
    tx.set(receiptRef, safe(receipt));

    tx.update(orderRef, {
      items: nextOrderItems,
      status: nextStatus,
      receiptDate: input.receiptDate,
      invoiceNumber,
      updatedAt: now,
    });

    return {
      receiptId,
      purchaseOrderStatus: nextStatus,
      stockMovementIds: movementIds,
      stockLines: stockLines.length,
      quantityAddedToStock: round4(quantityAddedToStock),
    };
  });

  return orderSnapData;
}

/** Catalog and destination units shown in the material receipt form. */
export async function getReceivingInventorySetup(organizationId: string): Promise<{ items: Item[]; units: Unit[] }> {
  const [itemSnap, unitSnap] = await Promise.all([
    getDocs(query(collection(db, 'items'), where('orgId', '==', organizationId))),
    getDocs(query(collection(db, 'units'), where('orgId', '==', organizationId))),
  ]);
  const items = itemSnap.docs
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Item))
    .filter((item) => item.type === 'peca' && item.active !== false && item.status !== 'INACTIVE')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const units = unitSnap.docs
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Unit))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { items, units };
}
