import type { MaterialReceiptRecord, PurchaseOrder, PurchaseOrderItem } from '../types/purchasing';
import type { NfeDocument, NfeItem } from '../types/finance';

export type PurchaseReconciliationStatus =
  | 'divergente'
  | 'aguardando_xml'
  | 'aguardando_recebimento'
  | 'aguardando_faturamento'
  | 'aguardando_qualidade'
  | 'parcialmente_conciliada'
  | 'conciliada';

export interface PurchaseReconciliationLine {
  purchaseOrderItemId: string;
  itemNumber: number;
  description: string;
  unit: string;
  quantityOrdered: number;
  quantityInvoiced: number;
  quantityPhysicallyReceived: number;
  quantityAccepted: number;
  quantityInStock: number;
  orderUnitPrice: number;
  invoiceUnitPrice?: number;
  unitPriceDelta?: number;
  orderValueForInvoicedQuantity: number;
  invoiceValue: number;
  issues: string[];
}

export interface UnmatchedReconciliationItem {
  invoiceNumber: string;
  invoiceItemNumber: number;
  description: string;
  code?: string;
  unit: string;
  quantity: number;
  reason: string;
}

export interface PurchaseReconciliation {
  purchaseOrder: PurchaseOrder;
  status: PurchaseReconciliationStatus;
  invoices: NfeDocument[];
  receipts: MaterialReceiptRecord[];
  lines: PurchaseReconciliationLine[];
  unmatchedInvoiceItems: UnmatchedReconciliationItem[];
  unmatchedReceiptLines: Array<{ receiptId: string; description: string; reason: string }>;
  invoiceProductsValue: number;
  orderValueForInvoicedQuantity: number;
  productValueDelta: number;
  orderSubtotal: number;
  physicalQuantity: number;
  invoicedQuantity: number;
  acceptedQuantity: number;
  stockQuantity: number;
  missingXmlReceipts: number;
  issues: string[];
}

const QTY_TOLERANCE = 0.0001;
const PRICE_TOLERANCE = 0.02;
const VALUE_TOLERANCE = 0.05;

const asNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const normalizeText = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleUpperCase('pt-BR')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');
const normalizeCode = (value: unknown): string => normalizeText(value).replace(/\s/g, '');
const normalizeUnit = (value: unknown): string => {
  const unit = normalizeText(value).replace(/\s/g, '');
  const aliases: Record<string, string> = {
    UNIDADE: 'UN', UNID: 'UN', UND: 'UN', UN: 'UN',
    PECA: 'PC', PECAS: 'PC', 'P C': 'PC', PC: 'PC',
    METRO: 'M', METROS: 'M', MT: 'M', MTS: 'M', M: 'M',
    QUILOGRAMA: 'KG', QUILOGRAMAS: 'KG', KILO: 'KG', QUILO: 'KG', KG: 'KG',
    LITRO: 'L', LITROS: 'L', LT: 'L', LTS: 'L', L: 'L',
  };
  return aliases[unit] ?? unit;
};

function invoiceMatchesReceipt(invoice: NfeDocument, receipt: MaterialReceiptRecord, order: PurchaseOrder): boolean {
  if (invoice.orgId !== order.organizationId || digits(invoice.emitente?.cnpj) !== digits(order.supplierCnpj)) return false;
  if (receipt.invoiceKey) {
    const invoiceKey = String(invoice.chave || '').trim();
    const receiptKey = String(receipt.invoiceKey || '').trim();
    const invoiceDigits = digits(invoiceKey);
    const receiptDigits = digits(receiptKey);
    return invoiceDigits.length === 44 && receiptDigits.length === 44
      ? invoiceDigits === receiptDigits
      : invoiceKey === receiptKey;
  }
  return digits(invoice.numero) === digits(receipt.invoiceNumber)
    && digits(invoice.emitente?.cnpj) === digits(order.supplierCnpj);
}

function findInvoiceLine(orderItems: PurchaseOrderItem[], invoiceItem: NfeItem): { item?: PurchaseOrderItem; reason?: string } {
  const code = normalizeCode(invoiceItem.codigo);
  if (code) {
    const codeMatches = orderItems.filter((item) =>
      [item.internalCode, item.manufacturerCode].some((candidate) => normalizeCode(candidate) === code),
    );
    if (codeMatches.length > 1) return { reason: 'Código do fornecedor aparece em mais de uma linha da OC; vínculo manual necessário.' };
    if (codeMatches.length === 1) {
      const candidate = codeMatches[0];
      if (normalizeUnit(candidate.unit) !== normalizeUnit(invoiceItem.unidade)) {
        return { reason: 'Código localizado na OC, mas a unidade da NF-e é diferente da unidade contratada.' };
      }
      return { item: candidate };
    }
  }

  const description = normalizeText(invoiceItem.descricao);
  const descriptionMatches = orderItems.filter((item) => normalizeText(item.description) === description);
  if (descriptionMatches.length > 1) {
    const sameUnit = descriptionMatches.filter((item) => normalizeUnit(item.unit) === normalizeUnit(invoiceItem.unidade));
    if (sameUnit.length === 1) return { item: sameUnit[0] };
    return { reason: 'Descrição repetida na OC; vínculo automático não é seguro.' };
  }
  if (descriptionMatches.length === 1) {
    if (normalizeUnit(descriptionMatches[0].unit) !== normalizeUnit(invoiceItem.unidade)) {
      return { reason: 'Descrição localizada, mas a unidade da NF-e é diferente da unidade contratada.' };
    }
    return { item: descriptionMatches[0] };
  }
  return { reason: 'Nenhuma linha da OC possui código ou descrição/unidade exatamente compatíveis.' };
}

function findReceiptOrderItem(orderItems: PurchaseOrderItem[], receiptItem: MaterialReceiptRecord['itemsReceived'][number]): PurchaseOrderItem | undefined {
  const id = receiptItem.purchaseOrderItemId || receiptItem.itemId;
  const byId = orderItems.find((item) => item.id === id);
  if (byId) return byId;
  const description = normalizeText(receiptItem.description);
  const candidates = orderItems.filter((item) =>
    normalizeText(item.description) === description && normalizeUnit(item.unit) === normalizeUnit(receiptItem.unit),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Builds a read-only reconciliation for one OC, aggregating every linked NF-e and every physical receipt.
 * Item auto-linking is deliberately conservative: exact supplier/internal code first, then exact description + unit.
 */
export function buildPurchaseReconciliation(
  purchaseOrder: PurchaseOrder,
  allInvoices: NfeDocument[],
  allReceipts: MaterialReceiptRecord[],
): PurchaseReconciliation | null {
  const receipts = allReceipts.filter((receipt) =>
    receipt.organizationId === purchaseOrder.organizationId && receipt.purchaseOrderId === purchaseOrder.id,
  );
  const receiptInvoices = allInvoices.filter((invoice) =>
    receipts.some((receipt) => invoiceMatchesReceipt(invoice, receipt, purchaseOrder)),
  );
  const invoicesById = new Map<string, NfeDocument>();
  for (const invoice of allInvoices) {
    if (invoice.orgId === purchaseOrder.organizationId
      && digits(invoice.emitente?.cnpj) === digits(purchaseOrder.supplierCnpj)
      && invoice.classificacao?.purchaseOrderId === purchaseOrder.id) {
      invoicesById.set(invoice.id || invoice.chave, invoice);
    }
  }
  for (const invoice of receiptInvoices) invoicesById.set(invoice.id || invoice.chave, invoice);
  const invoices = [...invoicesById.values()].sort((a, b) => (a.numero || '').localeCompare(b.numero || '', 'pt-BR'));

  if (invoices.length === 0 && receipts.length === 0) return null;

  const byOrderItem = new Map<string, {
    orderItem: PurchaseOrderItem;
    quantityInvoiced: number;
    invoiceValue: number;
    weightedInvoiceUnitPrice: number;
    invoicePriceQuantity: number;
    quantityPhysicallyReceived: number;
    quantityAccepted: number;
    quantityInStock: number;
  }>();
  for (const item of purchaseOrder.items) {
    byOrderItem.set(item.id, {
      orderItem: item,
      quantityInvoiced: 0,
      invoiceValue: 0,
      weightedInvoiceUnitPrice: 0,
      invoicePriceQuantity: 0,
      quantityPhysicallyReceived: 0,
      quantityAccepted: 0,
      quantityInStock: 0,
    });
  }

  const unmatchedInvoiceItems: UnmatchedReconciliationItem[] = [];
  const unmatchedReceiptLines: Array<{ receiptId: string; description: string; reason: string }> = [];
  let invoiceProductsValue = 0;
  let missingXmlReceipts = 0;
  const issues: string[] = [];

  for (const receipt of receipts) {
    const hasXml = invoices.some((invoice) => invoiceMatchesReceipt(invoice, receipt, purchaseOrder) && (invoice.itens?.length ?? 0) > 0);
    if (!hasXml) missingXmlReceipts++;
  }

  for (const invoice of invoices) {
    if (!invoice.itens?.length) continue;
    for (const invoiceItem of invoice.itens) {
      const quantity = asNumber(invoiceItem.quantidade);
      const lineValue = asNumber(invoiceItem.valorTotal);
      invoiceProductsValue += lineValue;
      const match = findInvoiceLine(purchaseOrder.items, invoiceItem);
      if (!match.item) {
        unmatchedInvoiceItems.push({
          invoiceNumber: invoice.numero || invoice.chave,
          invoiceItemNumber: invoiceItem.n,
          description: invoiceItem.descricao,
          code: invoiceItem.codigo || undefined,
          unit: invoiceItem.unidade,
          quantity,
          reason: match.reason || 'Linha sem correspondência segura na OC.',
        });
        continue;
      }
      const entry = byOrderItem.get(match.item.id)!;
      entry.quantityInvoiced += quantity;
      entry.invoiceValue += lineValue;
      const unitPrice = asNumber(invoiceItem.valorUnitario);
      if (quantity > 0) {
        entry.weightedInvoiceUnitPrice += unitPrice * quantity;
        entry.invoicePriceQuantity += quantity;
      }
    }
  }

  for (const receipt of receipts) {
    for (const receiptItem of receipt.itemsReceived || []) {
      const orderItem = findReceiptOrderItem(purchaseOrder.items, receiptItem);
      if (!orderItem) {
        unmatchedReceiptLines.push({
          receiptId: receipt.id,
          description: receiptItem.description,
          reason: 'Linha do recebimento não corresponde a um item identificável da OC.',
        });
        continue;
      }
      const entry = byOrderItem.get(orderItem.id)!;
      const received = Math.max(0, asNumber(receiptItem.quantityReceived));
      const accepted = receiptItem.quantityAccepted === undefined
        ? (receiptItem.isConform && receipt.status !== 'rejeitado' ? received : 0)
        : Math.max(0, asNumber(receiptItem.quantityAccepted));
      entry.quantityPhysicallyReceived += received;
      entry.quantityAccepted += accepted;
      entry.quantityInStock += Math.max(0, asNumber(receiptItem.quantityInStock));
    }
  }

  const lines: PurchaseReconciliationLine[] = purchaseOrder.items.map((orderItem) => {
    const entry = byOrderItem.get(orderItem.id)!;
    const invoiceUnitPrice = entry.invoicePriceQuantity > 0
      ? entry.weightedInvoiceUnitPrice / entry.invoicePriceQuantity
      : undefined;
    const unitPriceDelta = invoiceUnitPrice === undefined ? undefined : invoiceUnitPrice - asNumber(orderItem.unitPrice);
    const orderValueForInvoicedQuantity = entry.quantityInvoiced * asNumber(orderItem.unitPrice);
    const lineIssues: string[] = [];
    if (entry.quantityInvoiced > asNumber(orderItem.quantityOrdered) + QTY_TOLERANCE) {
      lineIssues.push('Quantidade faturada acima da quantidade contratada na OC.');
    }
    if (unitPriceDelta !== undefined && Math.abs(unitPriceDelta) > PRICE_TOLERANCE) {
      lineIssues.push('Preço unitário da NF-e difere do preço unitário da OC.');
    }
    if (purchaseOrder.status === 'recebida_total' && Math.abs(entry.quantityPhysicallyReceived - entry.quantityInvoiced) > QTY_TOLERANCE) {
      lineIssues.push('Quantidade faturada e quantidade física recebida não fecham após recebimento total da OC.');
    }
    if (entry.quantityPhysicallyReceived > entry.quantityInvoiced + QTY_TOLERANCE) {
      lineIssues.push('Quantidade física recebida supera a quantidade faturada vinculada a esta OC.');
    }
    if (entry.quantityAccepted + QTY_TOLERANCE < entry.quantityPhysicallyReceived) {
      lineIssues.push('Há material recebido que ainda não foi aceito pela qualidade.');
    }
    return {
      purchaseOrderItemId: orderItem.id,
      itemNumber: orderItem.itemNumber,
      description: orderItem.description,
      unit: orderItem.unit,
      quantityOrdered: asNumber(orderItem.quantityOrdered),
      quantityInvoiced: entry.quantityInvoiced,
      quantityPhysicallyReceived: entry.quantityPhysicallyReceived,
      quantityAccepted: entry.quantityAccepted,
      quantityInStock: entry.quantityInStock,
      orderUnitPrice: asNumber(orderItem.unitPrice),
      ...(invoiceUnitPrice !== undefined ? { invoiceUnitPrice, unitPriceDelta } : {}),
      orderValueForInvoicedQuantity,
      invoiceValue: entry.invoiceValue,
      issues: lineIssues,
    };
  });

  const invoiceQuantity = lines.reduce((sum, line) => sum + line.quantityInvoiced, 0);
  const physicalQuantity = lines.reduce((sum, line) => sum + line.quantityPhysicallyReceived, 0);
  const acceptedQuantity = lines.reduce((sum, line) => sum + line.quantityAccepted, 0);
  const stockQuantity = lines.reduce((sum, line) => sum + line.quantityInStock, 0);
  const orderValueForInvoicedQuantity = lines.reduce((sum, line) => sum + line.orderValueForInvoicedQuantity, 0);
  const productValueDelta = invoiceProductsValue - orderValueForInvoicedQuantity;

  if (unmatchedInvoiceItems.length) issues.push(unmatchedInvoiceItems.length + ' item(ns) da NF-e não possuem vínculo automático seguro com a OC.');
  if (unmatchedReceiptLines.length) issues.push(unmatchedReceiptLines.length + ' linha(s) de recebimento não puderam ser associadas a um item da OC.');
  if (lines.some((line) => line.issues.some((issue) => issue.includes('Preço unitário')))) issues.push('Existem divergências de preço unitário entre OC e NF-e.');
  if (Math.abs(productValueDelta) > VALUE_TOLERANCE) issues.push('O valor dos produtos da NF-e difere do valor equivalente previsto na OC para as quantidades faturadas.');
  if (lines.some((line) => line.issues.some((issue) => issue.includes('faturada acima')))) issues.push('Há quantidade faturada acima do pedido.');
  if (lines.some((line) => line.issues.some((issue) => issue.includes('não fecham')))) issues.push('A OC aparece como totalmente recebida, mas faturamento e recebimento físico não fecham.');
  if (lines.some((line) => line.issues.some((issue) => issue.includes('supera a quantidade faturada')))) issues.push('Há quantidade recebida sem NF-e vinculada suficiente.');
  if (lines.some((line) => line.issues.some((issue) => issue.includes('qualidade')))) issues.push('Há materiais aguardando liberação da qualidade.');
  if (missingXmlReceipts) issues.push(missingXmlReceipts + ' recebimento(s) sem XML completo da NF-e correspondente nesta empresa.');

  const hasDivergence = unmatchedInvoiceItems.length > 0
    || unmatchedReceiptLines.length > 0
    || Math.abs(productValueDelta) > VALUE_TOLERANCE
    || lines.some((line) => line.issues.some((issue) =>
      issue.includes('Preço unitário') || issue.includes('acima da quantidade') || issue.includes('não fecham') || issue.includes('supera a quantidade faturada'),
    ));
  const awaitingReceipt = lines.some((line) => line.quantityInvoiced > line.quantityPhysicallyReceived + QTY_TOLERANCE);
  const awaitingInvoice = lines.some((line) => line.quantityPhysicallyReceived > line.quantityInvoiced + QTY_TOLERANCE);
  const awaitingQuality = lines.some((line) => line.quantityAccepted + QTY_TOLERANCE < line.quantityPhysicallyReceived);
  const allComplete = lines.length > 0 && lines.every((line) =>
    line.quantityInvoiced + QTY_TOLERANCE >= line.quantityOrdered
      && line.quantityPhysicallyReceived + QTY_TOLERANCE >= line.quantityOrdered
      && line.quantityAccepted + QTY_TOLERANCE >= line.quantityOrdered,
  );

  let status: PurchaseReconciliationStatus;
  if (hasDivergence) status = 'divergente';
  else if (missingXmlReceipts > 0 || invoices.some((invoice) => !invoice.itens?.length)) status = 'aguardando_xml';
  else if (awaitingReceipt && purchaseOrder.status === 'recebida_total') status = 'divergente';
  else if (awaitingReceipt) status = 'aguardando_recebimento';
  else if (awaitingQuality) status = 'aguardando_qualidade';
  else if (awaitingInvoice && purchaseOrder.status === 'recebida_total') status = 'divergente';
  else if (awaitingInvoice) status = 'aguardando_faturamento';
  else if (allComplete) status = 'conciliada';
  else status = 'parcialmente_conciliada';

  if (!invoices.length && receipts.length) status = 'aguardando_xml';

  return {
    purchaseOrder,
    status,
    invoices,
    receipts,
    lines,
    unmatchedInvoiceItems,
    unmatchedReceiptLines,
    invoiceProductsValue,
    orderValueForInvoicedQuantity,
    productValueDelta,
    orderSubtotal: purchaseOrder.items.reduce((sum, item) => sum + (
      asNumber(item.totalPrice) > 0 ? asNumber(item.totalPrice) : asNumber(item.quantityOrdered) * asNumber(item.unitPrice)
    ), 0),
    physicalQuantity,
    invoicedQuantity: invoiceQuantity,
    acceptedQuantity,
    stockQuantity,
    missingXmlReceipts,
    issues,
  };
}

export function buildPurchaseReconciliations(
  invoices: NfeDocument[],
  orders: PurchaseOrder[],
  receipts: MaterialReceiptRecord[],
): PurchaseReconciliation[] {
  return orders
    .map((order) => buildPurchaseReconciliation(order, invoices, receipts))
    .filter((item): item is PurchaseReconciliation => item !== null)
    .sort((a, b) => (b.purchaseOrder.updatedAt || b.purchaseOrder.createdAt).localeCompare(a.purchaseOrder.updatedAt || a.purchaseOrder.createdAt));
}

export const RECONCILIATION_STATUS_LABELS: Record<PurchaseReconciliationStatus, string> = {
  divergente: 'Divergente',
  aguardando_xml: 'Aguardando XML',
  aguardando_recebimento: 'Aguardando recebimento',
  aguardando_faturamento: 'Aguardando faturamento',
  aguardando_qualidade: 'Aguardando qualidade',
  parcialmente_conciliada: 'Parcialmente conciliada',
  conciliada: 'Conciliada',
};

export const RECONCILIATION_STATUS_CLASSES: Record<PurchaseReconciliationStatus, string> = {
  divergente: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
  aguardando_xml: 'bg-slate-800 text-slate-300 border-slate-700',
  aguardando_recebimento: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  aguardando_faturamento: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  aguardando_qualidade: 'bg-orange-950/60 text-orange-300 border-orange-800/60',
  parcialmente_conciliada: 'bg-blue-950/60 text-blue-300 border-blue-800/60',
  conciliada: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
};
