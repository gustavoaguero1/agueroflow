import { postJson } from '../apiAuthFetch';
import type { FinanceReceivableReceiptRequest } from '../types/finance';

export { financeReceivableReceiptId, financeReceivableBalance, isValidReceivableDate, validateFinanceReceivableReceiptRequest, validateFinanceReceivableReceiptEligibility } from './financeReceivableRules';

/** The server writes the immutable receipt event and updates the receivable atomically. */
export async function createFinanceReceivableReceipt(input: FinanceReceivableReceiptRequest): Promise<string> {
  const response = await postJson<{ receiptId: string }>('/api/finance/receivable-receipts', input);
  if (!response.ok || !response.data?.receiptId) throw new Error(response.error || 'Não foi possível registrar o recebimento.');
  return response.data.receiptId;
}
