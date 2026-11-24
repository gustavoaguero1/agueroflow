import test from 'node:test';
import assert from 'node:assert/strict';
import {
  financeReconciliationCaseId,
  validateFinanceReconciliationCaseInput,
  validateFinanceReconciliationTransition,
} from '../src/services/financeReconciliationCases.ts';
import type { CreateFinanceReconciliationCaseInput } from '../src/services/financeReconciliationCases.ts';

const input: CreateFinanceReconciliationCaseInput = {
  orgId: 'org_a',
  purchaseOrderId: 'po1',
  purchaseOrderCode: 'OC-2026-001',
  supplierName: 'Fornecedor A',
  supplierCnpj: '11111111000111',
  issueType: 'divergencia_valor_produtos',
  issueTitle: 'Diferença no valor dos produtos',
  description: 'A NF-e está R$ 800,00 acima do valor previsto para os itens faturados na OC.',
  snapshot: {
    reconciliationStatus: 'divergente', orderSubtotal: 10000, orderTotal: 10000,
    invoiceProductsValue: 10800, invoiceTotalValue: 10800, orderValueForInvoicedQuantity: 10000,
    productValueDelta: 800, orderedQuantity: 10, invoicedQuantity: 10, physicalQuantity: 10,
    acceptedQuantity: 10, stockQuantity: 10, invoiceNumbers: ['123'], receiptIds: ['rec1'],
    sourceIssues: ['Valor de produtos divergente'],
  },
  actor: { uid: 'user1', name: 'Responsável' },
};

test('reconciliation case IDs are org-scoped and safe for Firestore document IDs', () => {
  assert.equal(financeReconciliationCaseId('org/a', 'abc 123'), 'rcase_org_a_abc_123');
  assert.notEqual(financeReconciliationCaseId('org_a', 'abc'), financeReconciliationCaseId('org_b', 'abc'));
});

test('valid case drafts require a title, actionable description, actor and reconciliation snapshot', () => {
  assert.deepEqual(validateFinanceReconciliationCaseInput(input), []);
  assert.ok(validateFinanceReconciliationCaseInput({ ...input, description: 'curto' }).some((error) => error.includes('10 caracteres')));
  assert.ok(validateFinanceReconciliationCaseInput({ ...input, issueTitle: 'x' }).some((error) => error.includes('5 caracteres')));
  assert.ok(validateFinanceReconciliationCaseInput({ ...input, actor: { uid: '', name: '' } }).some((error) => error.includes('responsável')));
  assert.ok(validateFinanceReconciliationCaseInput({ ...input, evidenceReference: 'x'.repeat(1001) }).some((error) => error.includes('1.000')));
});

test('case workflow allows only open → analysis → approved/rejected with decision justification', () => {
  assert.equal(validateFinanceReconciliationTransition('aberta', 'em_analise'), null);
  assert.equal(validateFinanceReconciliationTransition('em_analise', 'aprovada', 'Conferido com o fornecedor.'), null);
  assert.equal(validateFinanceReconciliationTransition('em_analise', 'rejeitada', 'Valor não autorizado.'), null);
  assert.ok(validateFinanceReconciliationTransition('em_analise', 'aprovada', '   '));
  assert.ok(validateFinanceReconciliationTransition('aberta', 'aprovada', 'Aprovado.'));
  assert.ok(validateFinanceReconciliationTransition('aprovada', 'aberta'));
  assert.ok(validateFinanceReconciliationTransition('rejeitada', 'aprovada'));
});
