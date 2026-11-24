import test from 'node:test';
import assert from 'node:assert/strict';
import type { FinancePayable, FinancePayableAuthorization, FinancePayableSettlementRequest } from '../src/types/finance.ts';
import {
  financePayableBalance,
  financePayableSettlementId,
  getFinancePayableAuthorizationDifferences,
  isValidPaymentDate,
  validateFinancePayableSettlementEligibility,
  validateFinancePayableSettlementRequest,
} from '../src/services/financePayableSettlementRules.ts';

const payable: FinancePayable = {
  id: 'pay_org_a_K1_001', orgId: 'org_a', origem: 'nfe',
  fornecedor: { nome: 'Fornecedor A', cnpj: '11111111000111' },
  documento: 'NF-e 123', parcela: '001', valor: 5400, vencimento: '2026-12-10',
  status: 'aberto', categoriaId: 'cat_mat', nfeChave: 'K1', purchaseOrderId: 'po_a', purchaseOrderCode: 'OC-2026-001',
  createdAt: '2026-11-24T10:00:00.000Z', createdBy: 'operator',
};
const authorization: FinancePayableAuthorization = {
  id: 'paya_org_a_pay_org_a_K1_001', orgId: 'org_a', payableId: payable.id, caseId: 'rcase_org_a_1',
  purchaseOrderId: 'po_a', purchaseOrderCode: 'OC-2026-001', nfeChave: 'K1', documento: 'NF-e 123', parcela: '001',
  fornecedorNome: 'Fornecedor A', fornecedorCnpj: '11111111000111', authorizedValue: 5400, dueDate: '2026-12-10',
  payableStatusAtAuthorization: 'aberto', authorizationStatus: 'registrada', issueTitle: 'Diferença aprovada',
  resolutionNotes: 'Diferença conferida e autorizada.', approvedBy: 'manager', approvedByName: 'Gerente',
  approvedAt: '2026-11-24T11:00:00.000Z', authorizedBy: 'manager', authorizedByName: 'gerente@empresa.com',
  authorizedAt: '2026-11-24T11:01:00.000Z', createdAt: '2026-11-24T11:01:00.000Z',
};
const request: FinancePayableSettlementRequest = {
  orgId: 'org_a', payableId: payable.id, idempotencyKey: 'operation_0001',
  paymentDate: '2026-11-24', paymentAmount: 5400, discountAmount: 0, paymentMethod: 'pix',
};

test('settlement IDs are deterministic per operation while preserving the legacy Etapa 2.7 ID', () => {
  assert.equal(financePayableSettlementId('org_a', payable.id), 'pays_org_a_pay_org_a_K1_001');
  assert.equal(financePayableSettlementId('org_a', payable.id, 'operation_0001'), financePayableSettlementId('org_a', payable.id, 'operation_0001'));
  assert.notEqual(financePayableSettlementId('org_a', payable.id, 'operation_0001'), financePayableSettlementId('org_a', payable.id, 'operation_0002'));
  assert.notEqual(financePayableSettlementId('org_a', payable.id, 'operation_0001'), financePayableSettlementId('org_b', payable.id, 'operation_0001'));
});

test('balance is calculated from original value, cash paid and approved abatements in cents', () => {
  assert.equal(financePayableBalance(payable), 5400);
  assert.equal(financePayableBalance({ ...payable, valorPago: 1500, valorAbatido: 100 }), 3800);
  assert.equal(financePayableBalance({ ...payable, valorPago: 5400 }), 0);
});

test('payment date accepts only real YYYY-MM-DD calendar dates', () => {
  assert.equal(isValidPaymentDate('2026-11-24'), true);
  assert.equal(isValidPaymentDate('2026-02-30'), false);
  assert.equal(isValidPaymentDate('24/11/2026'), false);
  assert.equal(isValidPaymentDate(''), false);
});

test('settlement request validates idempotency, method, amounts and references', () => {
  assert.equal(validateFinancePayableSettlementRequest(request), null);
  assert.match(validateFinancePayableSettlementRequest({ ...request, idempotencyKey: 'x' }) || '', /Identificador/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentMethod: 'cheque' as any }) || '', /forma de pagamento/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentDate: '2026-02-30' }) || '', /data de pagamento/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentAmount: 0 }) || '', /maior que zero/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, discountAmount: 20, discountReason: 'x' }) || '', /justificativa/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentAmount: 500, paymentMethod: undefined }) || '', /forma de pagamento/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentReference: 'x'.repeat(201) }) || '', /transação/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, proofReference: 'x'.repeat(1001) }) || '', /comprovante/);
});

test('partial payment and discount reduce outstanding balance without changing original amount', () => {
  const partial: FinancePayableSettlementRequest = { ...request, paymentAmount: 1500, discountAmount: 100, discountReason: 'Crédito negociado com fornecedor.' };
  assert.equal(validateFinancePayableSettlementEligibility(payable, 'org_a', partial), null);
  assert.equal(financePayableBalance({ ...payable, valorPago: 1500, valorAbatido: 100 }), 3800);
  assert.equal(payable.valor, 5400);
});

test('overpayment is rejected and an already paid title cannot receive another movement', () => {
  assert.match(validateFinancePayableSettlementEligibility(payable, 'org_a', { ...request, paymentAmount: 5400.01 }) || '', /ultrapassam o saldo/);
  assert.match(validateFinancePayableSettlementEligibility({ ...payable, status: 'pago' }, 'org_a', request) || '', /em aberto/);
  assert.match(validateFinancePayableSettlementEligibility(payable, 'org_b', { ...request, orgId: 'org_b' }) || '', /empresa selecionada/);
  assert.match(validateFinancePayableSettlementEligibility({ ...payable, valor: 0 }, 'org_a', request) || '', /original/);
});

test('discount-only settlement is valid without a payment method but requires a reason', () => {
  const discountOnly: FinancePayableSettlementRequest = { ...request, paymentAmount: 0, paymentMethod: undefined, discountAmount: 5400, discountReason: 'Quitação por crédito negociado.' };
  assert.equal(validateFinancePayableSettlementRequest(discountOnly), null);
  assert.equal(validateFinancePayableSettlementEligibility(payable, 'org_a', discountOnly), null);
});

test('authorization changes require acknowledgement and the changed fields are enumerated', () => {
  assert.deepEqual(getFinancePayableAuthorizationDifferences(payable, authorization), []);
  const changed = { ...payable, valor: 5450, vencimento: '2026-12-15', fornecedor: { nome: 'Fornecedor B', cnpj: '22222222000122' } };
  assert.deepEqual(getFinancePayableAuthorizationDifferences(changed, authorization), ['valor', 'vencimento', 'fornecedor_nome', 'fornecedor_cnpj']);
  assert.match(validateFinancePayableSettlementEligibility(changed, 'org_a', request, authorization) || '', /diverge dos dados atuais/);
  assert.equal(validateFinancePayableSettlementEligibility(changed, 'org_a', { ...request, confirmAuthorizationDivergence: true }, authorization), null);
});
