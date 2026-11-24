import test from 'node:test';
import assert from 'node:assert/strict';
import {
  financeReceivableReceiptId, financeReceivableBalance, isValidReceivableDate,
  validateFinanceReceivableReceiptRequest, validateFinanceReceivableReceiptEligibility,
  receivableReceiptRequestMatches,
} from '../src/services/financeReceivableRules.ts';
import type { FinanceReceivable, FinanceReceivableReceiptRequest } from '../src/types/finance.ts';

const receivable = (extra: Partial<FinanceReceivable> = {}): FinanceReceivable => ({
  id: 'recv_org_a_1', orgId: 'org_a', origem: 'manual',
  cliente: { nome: 'Cliente A' }, documento: 'PROP-001',
  valor: 1000, vencimento: '2026-12-10', status: 'aberto',
  valorRecebido: 250, createdAt: '2026-11-24T00:00:00Z', createdBy: 'u1',
  ...extra,
});
const request = (extra: Partial<FinanceReceivableReceiptRequest> = {}): FinanceReceivableReceiptRequest => ({
  orgId: 'org_a', receivableId: 'recv_org_a_1', idempotencyKey: 'request-0001',
  receiptDate: '2026-11-24', receiptAmount: 300, paymentMethod: 'pix', ...extra,
});

test('receivable balance is based on original amount minus received cash', () => {
  assert.equal(financeReceivableBalance(receivable()), 750);
  assert.equal(financeReceivableBalance(receivable({ valorRecebido: 1200 })), 0);
});
test('receipt identifier is stable and tenant-scoped', () => {
  assert.equal(financeReceivableReceiptId('org_a', 'recv_1', 'request-0001'), financeReceivableReceiptId('org_a', 'recv_1', 'request-0001'));
  assert.notEqual(financeReceivableReceiptId('org_a', 'recv_1', 'request-0001'), financeReceivableReceiptId('org_b', 'recv_1', 'request-0001'));
});
test('valid dates reject malformed and impossible calendar days', () => {
  assert.ok(isValidReceivableDate('2026-11-24'));
  assert.ok(!isValidReceivableDate('2026-02-30'));
  assert.ok(!isValidReceivableDate('24/11/2026'));
});
test('request requires positive money with at most two decimals and valid method', () => {
  assert.equal(validateFinanceReceivableReceiptRequest(request()), null);
  assert.ok(validateFinanceReceivableReceiptRequest(request({ receiptAmount: 0 })));
  assert.ok(validateFinanceReceivableReceiptRequest(request({ receiptAmount: 1.001 })));
  assert.ok(validateFinanceReceivableReceiptRequest(request({ paymentMethod: 'cheque' as any })));
});
test('eligibility prevents cross-tenant, closed and over-balance receipts', () => {
  assert.equal(validateFinanceReceivableReceiptEligibility(receivable(), 'org_a', request()), null);
  assert.ok(validateFinanceReceivableReceiptEligibility(receivable(), 'org_b', request()));
  assert.ok(validateFinanceReceivableReceiptEligibility(receivable({ status: 'recebido' }), 'org_a', request()));
  assert.ok(validateFinanceReceivableReceiptEligibility(receivable(), 'org_a', request({ receiptAmount: 751 })));
});
test('idempotency replay only accepts an identical request', () => {
  const input = request();
  const stored = { ...input };
  assert.ok(receivableReceiptRequestMatches(stored, input));
  assert.ok(!receivableReceiptRequestMatches({ ...stored, receiptAmount: 299 }, input));
});
