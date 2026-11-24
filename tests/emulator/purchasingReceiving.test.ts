import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { purchaseReceiptId, registerPurchaseReceipt, type RegisterPurchaseReceiptInput } from '../../src/services/purchasingReceivingService.ts';

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-agueroflow',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8085 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = () => env.authenticatedContext('admin_u1', { orgs: { org_a: 'Admin' } }).firestore() as any;
const baseOrder = {
  id: 'po_1',
  organizationId: 'org_a',
  code: 'OC-2026-0001',
  supplierId: 'sup_1',
  supplierName: 'Fornecedor Teste',
  supplierCnpj: '12345678000199',
  buyerId: 'buyer_1',
  buyerName: 'Comprador',
  emissionDate: '2026-11-01T10:00:00.000Z',
  expectedDeliveryDate: '2026-11-30',
  deliveryLocation: 'Almoxarifado Central',
  billingAddress: 'Matriz',
  paymentTerms: '28 DDL',
  freightType: 'CIF' as const,
  freightValue: 0,
  subtotal: 1000,
  taxValue: 0,
  totalValue: 1000,
  status: 'emitida' as const,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  items: [{
    id: 'po_line_1',
    itemNumber: 1,
    internalCode: 'SKU-001',
    description: 'Parafuso inox A4',
    unit: 'UN',
    quantityOrdered: 10,
    quantityReceived: 0,
    unitPrice: 100,
    totalPrice: 1000,
  }],
};

const seed = async (order: Record<string, any> = baseOrder) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const firestore = ctx.firestore();
    await setDoc(doc(firestore, 'purchasing_orders', 'po_1'), order);
    await setDoc(doc(firestore, 'units', 'unit_main'), {
      id: 'unit_main', orgId: 'org_a', name: 'Almoxarifado Central', code: 'MAT',
    });
    await setDoc(doc(firestore, 'items', 'item_1'), {
      id: 'item_1', orgId: 'org_a', sku: 'SKU-001', name: 'Parafuso inox A4',
      type: 'peca', category: 'Fixadores', unitOfMeasure: 'UN', active: true, status: 'ACTIVE',
    });
  });
};

const receiptInput = (overrides: Partial<RegisterPurchaseReceiptInput> = {}): RegisterPurchaseReceiptInput => ({
  organizationId: 'org_a',
  purchaseOrderId: 'po_1',
  invoiceNumber: 'NF-0001',
  invoiceKey: '1'.repeat(44),
  receiptDate: '2026-11-24',
  receivedBy: 'admin_u1',
  receivedByName: 'Admin Teste',
  stockUnitId: 'unit_main',
  status: 'conforme',
  itemsReceived: [{
    purchaseOrderItemId: 'po_line_1',
    quantityReceived: 4,
    isConform: true,
    stockDisposition: 'estoque',
    catalogItemId: 'item_1',
  }],
  ...overrides,
});

const readDoc = async (collectionName: string, id: string) =>
  (await getDoc(doc(db(), collectionName, id))).data() as Record<string, any> | undefined;

test('recebimento parcial atualiza OC, saldo, custo médio e histórico na mesma operação', async () => {
  await seed();
  const result = await registerPurchaseReceipt(db(), receiptInput());
  const order = await readDoc('purchasing_orders', 'po_1');
  const balance = await readDoc('stock_balances', 'bal_unit_main_item_1');
  const receipt = await readDoc('purchasing_receipts', result.receiptId);
  const movement = await readDoc('stock_movements', result.stockMovementIds[0]);

  assert.equal(result.stockLines, 1);
  assert.equal(result.quantityAddedToStock, 4);
  assert.equal(order?.status, 'recebida_parcial');
  assert.equal(order?.items[0].quantityReceived, 4);
  assert.equal(balance?.currentBalance, 4);
  assert.equal(balance?.averageCost, 100);
  assert.equal(receipt?.itemsReceived[0].quantityInStock, 4);
  assert.equal(receipt?.itemsReceived[0].stockStatus, 'entrada_registrada');
  assert.equal(movement?.quantity, 4);
  assert.equal(movement?.purchaseOrderCode, 'OC-2026-0001');
  assert.equal(movement?.receiptId, result.receiptId);
});

test('não permite lançar a mesma NF-e duas vezes, mesmo em outra OC da mesma empresa', async () => {
  await seed();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'purchasing_orders', 'po_2'), {
      ...baseOrder, id: 'po_2', code: 'OC-2026-0002',
    });
  });
  const input = receiptInput();
  const first = await registerPurchaseReceipt(db(), input);
  await assert.rejects(registerPurchaseReceipt(db(), input), /já foi registrada/);
  await assert.rejects(
    registerPurchaseReceipt(db(), receiptInput({ purchaseOrderId: 'po_2' })),
    /já foi registrada/,
  );
  const balance = await readDoc('stock_balances', 'bal_unit_main_item_1');
  const receipt = await readDoc('purchasing_receipts', first.receiptId);
  assert.equal(balance?.currentBalance, 4);
  assert.ok(receipt);
});

test('impede recebimento acima da quantidade pendente sem gravar parcialmente', async () => {
  await seed();
  await assert.rejects(
    registerPurchaseReceipt(db(), receiptInput({
      itemsReceived: [{
        purchaseOrderItemId: 'po_line_1',
        quantityReceived: 11,
        isConform: true,
        stockDisposition: 'estoque',
        catalogItemId: 'item_1',
      }],
    })),
    /excede o saldo pendente/,
  );
  assert.equal(await readDoc('stock_balances', 'bal_unit_main_item_1'), undefined);
  assert.equal(await readDoc('purchasing_receipts', purchaseReceiptId(receiptInput(), '12345678000199')), undefined);
  const order = await readDoc('purchasing_orders', 'po_1');
  assert.equal(order?.items[0].quantityReceived, 0);
});

test('entrada de recebimento pondera custo médio com o saldo anterior', async () => {
  await seed();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'stock_balances/bal_unit_main_item_1'), {
      id: 'bal_unit_main_item_1', orgId: 'org_a', unitId: 'unit_main',
      itemId: 'item_1', currentBalance: 6, averageCost: 50,
    });
  });
  await registerPurchaseReceipt(db(), receiptInput());
  const balance = await readDoc('stock_balances', 'bal_unit_main_item_1');
  assert.equal(balance?.currentBalance, 10);
  assert.equal(balance?.averageCost, 70);
});

test('material não conforme fica bloqueado e não reduz saldo pendente da OC', async () => {
  await seed();
  const result = await registerPurchaseReceipt(db(), receiptInput({
    status: 'conforme_com_ressalva',
    itemsReceived: [{
      purchaseOrderItemId: 'po_line_1',
      quantityReceived: 3,
      isConform: false,
      nonConformityNotes: 'Diâmetro fora da tolerância.',
      stockDisposition: 'estoque',
      catalogItemId: 'item_1',
    }],
  }));
  const order = await readDoc('purchasing_orders', 'po_1');
  const receipt = await readDoc('purchasing_receipts', result.receiptId);
  assert.equal(result.stockLines, 0);
  assert.equal(order?.items[0].quantityReceived, 0);
  assert.equal(receipt?.itemsReceived[0].quantityAccepted, 0);
  assert.equal(receipt?.itemsReceived[0].stockStatus, 'bloqueado_qualidade');
  assert.equal(await readDoc('stock_balances', 'bal_unit_main_item_1'), undefined);
});

test('rejeita unidade de catálogo diferente da unidade comprada', async () => {
  await seed();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'items/item_1'), { unitOfMeasure: 'M' });
  });
  await assert.rejects(registerPurchaseReceipt(db(), receiptInput()), /não corresponde à unidade da OC/);
  assert.equal(await readDoc('stock_balances', 'bal_unit_main_item_1'), undefined);
  const order = await readDoc('purchasing_orders', 'po_1');
  assert.equal(order?.items[0].quantityReceived, 0);
});

test('serviço/consumo explicitamente não estocável fecha quantidade sem movimentar estoque', async () => {
  await seed();
  const result = await registerPurchaseReceipt(db(), receiptInput({
    stockUnitId: undefined,
    itemsReceived: [{
      purchaseOrderItemId: 'po_line_1',
      quantityReceived: 2,
      isConform: true,
      stockDisposition: 'nao_estocavel',
    }],
  }));
  const order = await readDoc('purchasing_orders', 'po_1');
  const receipt = await readDoc('purchasing_receipts', result.receiptId);
  assert.equal(result.stockLines, 0);
  assert.equal(order?.items[0].quantityReceived, 2);
  assert.equal(receipt?.itemsReceived[0].stockStatus, 'nao_estocavel');
  assert.equal(await readDoc('stock_balances', 'bal_unit_main_item_1'), undefined);
});

test('frete FOB é rateado no custo unitário de estoque', async () => {
  await seed({
    ...baseOrder,
    freightType: 'FOB',
    freightValue: 100,
  });
  const result = await registerPurchaseReceipt(db(), receiptInput());
  const balance = await readDoc('stock_balances', 'bal_unit_main_item_1');
  const movement = await readDoc('stock_movements', result.stockMovementIds[0]);
  assert.equal(balance?.averageCost, 110);
  assert.equal(movement?.unitCost, 110);
  assert.equal(movement?.totalCost, 440);
});

test('entrada em estoque exige unidade pertencente à empresa e item de catálogo com unidade compatível', async () => {
  await seed();
  await assert.rejects(
    registerPurchaseReceipt(db(), receiptInput({ stockUnitId: 'unit_outro_org' })),
    /unidade de destino não pertence à empresa/,
  );
  await assert.rejects(
    registerPurchaseReceipt(db(), receiptInput({
      itemsReceived: [{
        purchaseOrderItemId: 'po_line_1',
        quantityReceived: 2,
        isConform: true,
        stockDisposition: 'estoque',
        catalogItemId: 'missing_item',
      }],
    })),
    /material vinculado não existe/,
  );
  const order = await readDoc('purchasing_orders', 'po_1');
  assert.equal(order?.items[0].quantityReceived, 0);
});
