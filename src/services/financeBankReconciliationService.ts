import { postJson } from '../apiAuthFetch';
import type { FinanceBankStatementRow } from './financeBankStatementParser';

export interface FinanceBankTransaction extends FinanceBankStatementRow {
  id: string;
  orgId: string;
  accountLabel?: string;
  sourceFileName: string;
  importBatchId: string;
  importedBy: string;
  importedAt?: unknown;
}

export interface FinanceBankMatch {
  id: string;
  orgId: string;
  transactionId: string;
  settlementId?: string;
  payableId?: string;
  receiptId?: string;
  receivableId?: string;
  matchType?: 'payable' | 'receivable';
  amount: number;
  bankDate: string;
  paymentDate: string;
  createdBy: string;
  createdByEmail: string;
  createdAt?: unknown;
}

export async function importFinanceBankTransactions(input: {
  orgId: string;
  importBatchId: string;
  sourceFileName: string;
  accountLabel?: string;
  rows: FinanceBankStatementRow[];
}): Promise<{ imported: number; duplicates: number }> {
  const response = await postJson<{ imported: number; duplicates: number }>('/api/finance/bank-reconciliation/import', input);
  if (!response.ok || !response.data) throw new Error(response.error || 'Não foi possível importar o extrato.');
  return response.data;
}

export async function matchFinanceBankTransaction(input: {
  orgId: string;
  transactionId: string;
  settlementId: string;
}): Promise<string> {
  const response = await postJson<{ matchId: string }>(
    '/api/finance/bank-reconciliation/' + encodeURIComponent(input.transactionId) + '/match', input,
  );
  if (!response.ok || !response.data?.matchId) throw new Error(response.error || 'Não foi possível conciliar o lançamento.');
  return response.data.matchId;
}

export async function matchFinanceBankReceiptTransaction(input: {
  orgId: string;
  transactionId: string;
  receiptId: string;
}): Promise<string> {
  const response = await postJson<{ matchId: string }>(
    '/api/finance/bank-reconciliation/' + encodeURIComponent(input.transactionId) + '/match-receipt', input,
  );
  if (!response.ok || !response.data?.matchId) throw new Error(response.error || 'Não foi possível conciliar o recebimento.');
  return response.data.matchId;
}
