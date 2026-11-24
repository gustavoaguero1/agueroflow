import test from 'node:test';
import assert from 'node:assert/strict';
import {
  financePayableAuthorizationId,
  validateFinancePayableAuthorizationEligibility,
} from '../src/services/financePayableAuthorizationRules.ts';
import type { FinancePayable, FinanceReconciliationCase } from '../src/types/finance';

const reconciliationCase: FinanceReconciliationCase = {
  id: 'rcase_org_a_1',
  orgId: 'org_a',
  purchaseOrderId: 'po1',
  purchaseOrderCode: 'OC-2026-001',
  supplierName: 'Fornecedor A',
  supplierCnpj: '11111111000111',
  issueType: 'divergencia_valor_produtos',
  issueTitle: 'Divergência de valores da NF-e',
  description: 'O valor dos produtos está diferente do valor equivalente da OC.',
  snapshot: {
    reconciliationStatus: 'divergente', orderSubtotal: 10000, orderTotal: 10000,
    invoiceProductsValue: 10800, invoiceTotalValue: 10800, orderValueForInvoicedQuantity: 10000,
    productValueDelta: 800, orderedQuantity: 10, invoicedQuantity: 10, physicalQuantity: 10,
    acceptedQuantity: 10, stockQuantity: 10, invoiceNumbers: ['123'], invoiceKeys: ['K1'],
    receiptIds: ['rec1'], sourceIssues: ['Valor divergente'],
  },
  status: 'aprovada',
  createdBy: 'op1',
  createdByName: 'Operador',
  createdAt: '2026-11-24T10:00:00.000Z',
  updatedAt: '2026-11-24T11:00:00.000Z',
  reviewedBy: 'manager1',
  reviewedByName: 'Gerente',
  reviewedAt: '2026-11-24T11:00:00.000Z',
  resolutionNotes: 'Diferença conferida e autorizada pela gerência.',
};

const payable: FinancePayable = {
  id: 'pay_org_a_K1_001',
  orgId: 'org_a',
  origem: 'nfe',
  fornecedor: { cnpj: '11111111000111', nome: 'Fornecedor A' },
  documento: 'NF-e 123',
  parcela: '001',
  valor: 5400,
  vencimento: '2026-12-10',
  status: 'aberto',
  categoriaId: 'cat_material',
  nfeChave: 'K1',
  purchaseOrderId: 'po1',
  purchaseOrderCode: 'OC-2026-001',
  createdAt: '2026-11-24T10:00:00.000Z',
  createdBy: 'op1',
};

test('authorization id is deterministic per company and payable', () => {
  assert.equal(financePayableAuthorizationId('org_a', 'pay_org_a_K1_001'), 'paya_org_a_pay_org_a_K1_001');
  assert.notEqual(financePayableAuthorizationId('org_a', 'pay1'), financePayableAuthorizationId('org_b', 'pay1'));
  assert.equal(financePayableAuthorizationId('org_a', 'pay/1'), financePayableAuthorizationId('org_a', 'pay_1'));
});

test('only an approved case can authorize an open NF-e title linked to the same PO, supplier and access key', () => {
  assert.equal(validateFinancePayableAuthorizationEligibility(reconciliationCase, payable, 'org_a'), null);
  assert.match(validateFinancePayableAuthorizationEligibility({ ...reconciliationCase, status: 'em_analise' }, payable, 'org_a') || '', /precisa estar aprovada/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, { ...payable, status: 'pago' }, 'org_a') || '', /títulos em aberto/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, { ...payable, purchaseOrderId: 'po2' }, 'org_a') || '', /não pertence à Ordem de Compra/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, { ...payable, fornecedor: { cnpj: '22222222000122', nome: 'Outro' } }, 'org_a') || '', /fornecedor/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, { ...payable, fornecedor: { cnpj: '', nome: 'Fornecedor A' } }, 'org_a') || '', /CNPJ/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, { ...payable, nfeChave: 'K2' }, 'org_a') || '', /snapshot aprovado/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, payable, 'org_b') || '', /Empresa diferente/);
  assert.match(validateFinancePayableAuthorizationEligibility({ ...reconciliationCase, reviewedBy: undefined, resolutionNotes: '' }, payable, 'org_a') || '', /responsável e justificativa/);
  assert.match(validateFinancePayableAuthorizationEligibility(reconciliationCase, { ...payable, origem: 'manual' }, 'org_a') || '', /originado de NF-e/);
});
