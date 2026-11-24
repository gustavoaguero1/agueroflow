import { postJson } from '../apiAuthFetch';

export { financePayableAuthorizationId, validateFinancePayableAuthorizationEligibility } from './financePayableAuthorizationRules';

/** Ask the authenticated backend to create a single immutable authorization for an existing payable. */
export async function createFinancePayableAuthorization(
  input: { orgId: string; caseId: string; payableId: string },
): Promise<string> {
  const response = await postJson<{ authorizationId: string }>(
    '/api/finance/payable-authorizations',
    { orgId: input.orgId, caseId: input.caseId, payableId: input.payableId },
  );
  if (!response.ok || !response.data?.authorizationId) {
    throw new Error(response.error || 'Não foi possível registrar a autorização financeira.');
  }
  return response.data.authorizationId;
}
