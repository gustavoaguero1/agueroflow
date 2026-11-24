import test from 'node:test';
import assert from 'node:assert/strict';
import type { FinancePayable, FinancePayableAuthorization, FinancePayableSettlementRequest } from '../src/types/finance.ts';
import { financePayableSettlementId, getFinancePayableAuthorizationDifferences, isValidPaymentDate, validateFinancePayableSettlementEligibility, validateFinancePayableSettlementRequest } from '../src/services/financePayableSettlementRules.ts';

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
const request: FinancePayableSettlementRequest = { orgId: 'org_a', payableId: payable.id, paymentDate: '2026-11-24', paymentMethod: 'pix', paymentReference: 'E2E-123' };

test('settlement id is deterministic and company-scoped', () => {
  assert.equal(financePayableSettlementId('org_a', payable.id), financePayableSettlementId('org_a', payable.id));
  assert.notEqual(financePayableSettlementId('org_a', payable.id), financePayableSettlementId('org_b', payable.id));
  assert.ok(financePayableSettlementId('org_a', 'pay/a').startsWith('pays_org_a_'));
});

test('payment date accepts only real YYYY-MM-DD calendar dates', () => {
  assert.equal(isValidPaymentDate('2026-11-24'), true);
  assert.equal(isValidPaymentDate('2026-02-30'), false);
  assert.equal(isValidPaymentDate('24/11/2026'), false);
  assert.equal(isValidPaymentDate(''), false);
});

test('settlement request validates payment method and optional reference lengths', () => {
  assert.equal(validateFinancePayableSettlementRequest(request), null);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentMethod: 'cheque' as any }) || '', /forma de pagamento/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, paymentDate: '2026-02-30' }) || '', /data de pagamento/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, proofReference: 'x'.repeat(1001) }) || '', /comprovante/);
  assert.match(validateFinancePayableSettlementRequest({ ...request, notes: 'x'.repeat(1001) }) || '', /observações/);
});

test('only an open title in the same company can be settled', () => {
  assert.equal(validateFinancePayableSettlementEligibility(payable, 'org_a', request), null);
  assert.match(validateFinancePayableSettlementEligibility({ ...payable, status: 'pago' }, 'org_a', request) || '', /em aberto/);
  assert.match(validateFinancePayableSettlementEligibility(payable, 'org_b', { ...request, orgId: 'org_b' }) || '', /empresa selecionada/);
  assert.match(validateFinancePayableSettlementEligibility({ ...payable, valor: 0 }, 'org_a', request) || '', /valor/);
});

test('authorization changes require acknowledgement and the changed fields are enumerated', () => {
  assert.deepEqual(getFinancePayableAuthorizationDifferences(payable, authorization), []);
  const changed = { ...payable, valor: 5450, vencimento: '2026-12-15', fornecedor: { nome: 'Fornecedor B', cnpj: '22222222000122' } };
  assert.deepEqual(getFinancePayableAuthorizationDifferences(changed, authorization), ['valor', 'vencimento', 'fornecedor_nome', 'fornecedor_cnpj']);
  assert.match(validateFinancePayableSettlementEligibility(changed, 'org_a', request, authorization) || '', /diverge dos dados atuais/);
  assert.equal(validateFinancePayableSettlementEligibility(changed, 'org_a', { ...request, confirmAuthorizationDivergence: true }, authorization), null);
});
