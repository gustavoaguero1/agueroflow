import type { ClientPortalGrant, ClientPortalScope } from '../types/clientPortal.ts';

const VALID_SCOPES: ReadonlySet<ClientPortalScope> = new Set([
  'schedule',
  'rdo',
  'measurements',
  'databook',
  'acceptance',
]);

export function sanitizePortalScopes(rawScopes: unknown): ClientPortalScope[] {
  if (!Array.isArray(rawScopes)) return [];
  const out = new Set<ClientPortalScope>();
  for (const s of rawScopes) {
    const clean = String(s || '').trim() as ClientPortalScope;
    if (VALID_SCOPES.has(clean)) out.add(clean);
  }
  return Array.from(out);
}

export function evaluatePortalGrantAccess(params: {
  grant: ClientPortalGrant | null | undefined;
  requiredScope: ClientPortalScope;
  nowIso?: string;
}): { allowed: boolean; reason?: string } {
  const { grant, requiredScope } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  if (!grant) {
    return { allowed: false, reason: 'Token de acesso externo inválido ou não encontrado.' };
  }
  if (grant.revokedAt) {
    return { allowed: false, reason: 'Acesso externo revogado pela contratada.' };
  }
  if (!grant.expiresAt || grant.expiresAt <= nowIso) {
    return { allowed: false, reason: 'Acesso externo expirado. Solicite um novo link à gestão da obra.' };
  }
  if (!grant.orgId || !grant.contractId || !grant.projectId) {
    return { allowed: false, reason: 'Escopo do acesso externo incompleto.' };
  }
  if (!Array.isArray(grant.scopes) || !grant.scopes.includes(requiredScope)) {
    return { allowed: false, reason: `Este acesso externo não possui permissão para o escopo "${requiredScope}".` };
  }
  return { allowed: true };
}
