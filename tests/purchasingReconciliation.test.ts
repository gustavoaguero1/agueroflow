import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchaseReconciliation, buildPurchaseReconciliations } from '../src/services/purchasingReconciliationService.ts';
import type { MaterialReceiptRecord, PurchaseOrder } from '../src/types/purchasing';
import type { NfeDocument } from '../src/types/finance';

const order = (patch: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'po1', organizationId: 'org1', code: 'OC-2026-001',
  supplierId: 's1', supplierName: 'Fornecedor A', supplierCnpj: '11111111000111',
  buyerId: 'u1', buyerName: 'Comprador', emissionDate: '2026-11-01',
  expectedDeliveryDate: '2026-11-15', deliveryLocation: 'Almoxarifado',
  billingAddress: 'Empresa', paymentTerms: '28 DDL', freightType: 'CIF',
  freightValue: 0,
  items: [
    { id: 'line1', itemNumber: 1, internalCode: 'MP-001', description: 'Chapa inox 304 2mm', unit: 'KG', quantityOrdered: 100, quantityReceived: 0, unitPrice: 25, totalPrice: 2500 },
    { id: 'line2', itemNumber: 2, internalCode: 'MP-002', description: 'Tubo inox 316L', unit: 'M', quantityOrdered: 20, quantityReceived: 0, unitPrice: 80, totalPrice: 1600 },
  ],
  subtotal: 4100, taxValue: 0, totalValue: 4100, status: 'emitida',
  createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z',
  ...patch,
});

const invoice = (patch: Partial<NfeDocument> = {}): NfeDocument => ({
  id: 'org1_KEY1', orgId: 'org1', chave: 'KEY1', numero: '1001',
  emitidaEm: '2026-11-03T10:00:00.000Z',
  emitente: { cnpj: '11111111000111', nome: 'Fornecedor A' },
  valorTotal: 2500, valorProdutos: 2500,
  itens: [{ n: 1, codigo: 'MP-001', descricao: 'Chapa inox 304 2mm', unidade: 'KG', quantidade: 100, valorUnitario: 25, valorTotal: 2500, ncm: '7219', cfop: '5102' }],
  status: 'classificada',
  classificacao: { purchaseOrderId: 'po1', purchaseOrderCode: 'OC-2026-001' },
  ...patch,
});

const receipt = (patch: Partial<MaterialReceiptRecord> = {}): MaterialReceiptRecord => ({
  id: 'rec1', organizationId: 'org1', purchaseOrderId: 'po1', purchaseOrderCode: 'OC-2026-001',
  supplierName: 'Fornecedor A', invoiceNumber: '1001', invoiceKey: 'KEY1',
  receiptDate: '2026-11-04', receivedBy: 'u1', receivedByName: 'Recebedor',
  itemsReceived: [{
    itemId: 'line1', purchaseOrderItemId: 'line1', description: 'Chapa inox 304 2mm',
    quantityReceived: 100, quantityAccepted: 100, quantityInStock: 100,
    unit: 'KG', isConform: true,
  }],
  stockMovementIds: [], status: 'conforme', createdAt: '2026-11-04T10:00:00.000Z',
  ...patch,
});

test('concilia por código exato e soma NF-e e recebimentos parciais da mesma OC', () => {
  const secondInvoice = invoice({
    id: 'org1_KEY2', chave: 'KEY2', numero: '1002',
    itens: [{ n: 1, codigo: 'MP-002', descricao: 'Tubo inox 316L', unidade: 'M', quantidade: 20, valorUnitario: 80, valorTotal: 1600, ncm: '7306', cfop: '5102' }],
    valorTotal: 1600,
    classificacao: { purchaseOrderId: 'po1', purchaseOrderCode: 'OC-2026-001' },
  });
  const secondReceipt = receipt({
    id: 'rec2', invoiceNumber: '1002', invoiceKey: 'KEY2',
    itemsReceived: [{ itemId: 'line2', purchaseOrderItemId: 'line2', description: 'Tubo inox 316L', quantityReceived: 20, quantityAccepted: 20, quantityInStock: 20, unit: 'M', isConform: true }],
  });
  const result = buildPurchaseReconciliation(order({ status: 'recebida_total' }), [invoice(), secondInvoice], [receipt(), secondReceipt]);
  assert.ok(result);
  assert.equal(result.status, 'conciliada');
  assert.equal(result.invoicedQuantity, 120);
  assert.equal(result.physicalQuantity, 120);
  assert.equal(result.acceptedQuantity, 120);
  assert.equal(result.invoiceProductsValue, 4100);
  assert.equal(result.productValueDelta, 0);
});

test('classifies quantity invoiced above the OC as divergence', () => {
  const over = invoice({ itens: [{ n: 1, codigo: 'MP-001', descricao: 'Chapa inox 304 2mm', unidade: 'KG', quantidade: 120, valorUnitario: 25, valorTotal: 3000, ncm: '7219', cfop: '5102' }] });
  const result = buildPurchaseReconciliation(order(), [over], []);
  assert.equal(result?.status, 'divergente');
  assert.ok(result?.issues.some((issue) => issue.includes('acima do pedido')));
});

test('marks price differences and conservative unmatched invoice lines', () => {
  const price = invoice({ itens: [{ n: 1, codigo: 'MP-001', descricao: 'Chapa inox 304 2mm', unidade: 'KG', quantidade: 100, valorUnitario: 27, valorTotal: 2700, ncm: '7219', cfop: '5102' }] });
  const unmatched = invoice({ id: 'org1_KEY2', chave: 'KEY2', numero: '1002', itens: [{ n: 2, codigo: 'OUTRO', descricao: 'Válvula sanitária', unidade: 'UN', quantidade: 2, valorUnitario: 50, valorTotal: 100, ncm: '7219', cfop: '5102' }] });
  const result = buildPurchaseReconciliation(order(), [price, unmatched], []);
  assert.equal(result?.status, 'divergente');
  assert.equal(result?.unmatchedInvoiceItems.length, 1);
  assert.ok(result?.lines[0].issues.some((issue) => issue.includes('Preço unitário')));
});

test('distinguishes pending physical receipt from quality hold', () => {
  const pending = buildPurchaseReconciliation(order(), [invoice()], []);
  assert.equal(pending?.status, 'aguardando_recebimento');

  const blockedReceipt = receipt({
    status: 'conforme_com_ressalva',
    itemsReceived: [{
      itemId: 'line1', purchaseOrderItemId: 'line1', description: 'Chapa inox 304 2mm',
      quantityReceived: 100, quantityAccepted: 40, quantityInStock: 40,
      unit: 'KG', isConform: false, nonConformityNotes: 'Laudo dimensional pendente',
    }],
  });
  const quality = buildPurchaseReconciliation(order({ status: 'recebida_parcial' }), [invoice()], [blockedReceipt]);
  assert.equal(quality?.status, 'aguardando_qualidade');
  assert.equal(quality?.physicalQuantity, 100);
  assert.equal(quality?.acceptedQuantity, 40);
});

test('matches exact normalized descriptions and common units, but never fuzzy descriptions', () => {
  const byDescription = invoice({
    itens: [{ n: 1, codigo: 'FORN-XYZ', descricao: 'CHAPA INÓX 304 2MM', unidade: 'quilograma', quantidade: 100, valorUnitario: 25, valorTotal: 2500, ncm: '7219', cfop: '5102' }],
  });
  const matched = buildPurchaseReconciliation(order(), [byDescription], []);
  assert.equal(matched?.unmatchedInvoiceItems.length, 0);
  const fuzzy = invoice({ itens: [{ n: 1, codigo: 'FORN-XYZ', descricao: 'Chapa inox 304 2mm polida', unidade: 'KG', quantidade: 100, valorUnitario: 25, valorTotal: 2500, ncm: '7219', cfop: '5102' }] });
  const unmatched = buildPurchaseReconciliation(order(), [fuzzy], []);
  assert.equal(unmatched?.unmatchedInvoiceItems.length, 1);
});

test('receipt without matching XML is clearly identified', () => {
  const result = buildPurchaseReconciliation(order(), [], [receipt()]);
  assert.equal(result?.status, 'aguardando_xml');
  assert.equal(result?.missingXmlReceipts, 1);
});


test('flags accumulated product-value differences even below the unit-price tolerance', () => {
  const smallUnitDelta = invoice({
    itens: [{ n: 1, codigo: 'MP-001', descricao: 'Chapa inox 304 2mm', unidade: 'KG', quantidade: 100, valorUnitario: 25.01, valorTotal: 2501, ncm: '7219', cfop: '5102' }],
  });
  const result = buildPurchaseReconciliation(order(), [smallUnitDelta], []);
  assert.equal(result?.status, 'divergente');
  assert.ok(result?.issues.some((issue) => issue.includes('valor dos produtos')));
  assert.ok(Math.abs(result!.productValueDelta - 1) < 0.001);
});

test('does not import linked invoices from a different supplier or organization', () => {
  const foreign = invoice({
    id: 'org2_KEY1', orgId: 'org2', emitente: { cnpj: '22222222000122', nome: 'Outro Fornecedor' },
    valorTotal: 5000, itens: [{ n: 1, codigo: 'MP-001', descricao: 'Chapa inox 304 2mm', unidade: 'KG', quantidade: 200, valorUnitario: 25, valorTotal: 5000, ncm: '7219', cfop: '5102' }],
    classificacao: { purchaseOrderId: 'po1', purchaseOrderCode: 'OC-2026-001' },
  });
  const foreignSupplier = invoice({
    id: 'org1_KEY3', chave: 'KEY3', emitente: { cnpj: '22222222000122', nome: 'Outro Fornecedor' },
    valorTotal: 9000, itens: [{ n: 1, codigo: 'MP-001', descricao: 'Chapa inox 304 2mm', unidade: 'KG', quantidade: 300, valorUnitario: 30, valorTotal: 9000, ncm: '7219', cfop: '5102' }],
    classificacao: { purchaseOrderId: 'po1', purchaseOrderCode: 'OC-2026-001' },
  });
  const result = buildPurchaseReconciliation(order(), [invoice(), foreign, foreignSupplier], []);
  assert.ok(result);
  assert.equal(result.invoices.length, 1);
  assert.equal(result.invoiceProductsValue, 2500);
  assert.equal(result.invoicedQuantity, 100);
});

test('buildPurchaseReconciliations only returns orders with a related invoice or receipt', () => {
  const all = buildPurchaseReconciliations([invoice()], [order(), order({ id: 'po2', code: 'OC-2' })], []);
  assert.equal(all.length, 1);
  assert.equal(all[0].purchaseOrder.id, 'po1');
});
