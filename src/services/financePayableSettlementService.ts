import { postJson } from '../apiAuthFetch';
import type { FinancePayableSettlementRequest } from '../types/finance';

export { financePayableSettlementId, getFinancePayableAuthorizationDifferences, validateFinancePayableSettlementEligibility, validateFinancePayableSettlementRequest } from './financePayableSettlementRules';

/** The server records the immutable settlement event and updates the payable atomically. */
export async function createFinancePayableSettlement(input: FinancePayableSettlementRequest): Promise<string> {
  const response = await postJson<{ settlementId: string }>('/api/finance/payable-settlements', input);
  if (!response.ok || !response.data?.settlementId) throw new Error(response.error || 'Não foi possível registrar a baixa do título.');
  return response.data.settlementId;
}
