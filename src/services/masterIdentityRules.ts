import type { CollectiveAssetWorker } from '../types/collectiveAssets';
import type { DirectoryEntry } from './rhDirectory';
import { normalizePersonName } from './rhLegacyAudit';

export interface CollectiveWorkerLinkCandidate {
  rhEmployeeId: string;
  name: string;
  registrationNumber: string;
  active: boolean;
  matchBasis: 'normalized_name';
  requiresHumanReview: true;
}

export interface CollectiveWorkerLinkIssue {
  collectiveWorkerId: string;
  workerName: string;
  registrationNumber: string;
  issueType: 'missing_rh_link' | 'broken_rh_link' | 'duplicate_rh_link';
  currentRhEmployeeId?: string;
  reason: string;
  suggestedCandidates: CollectiveWorkerLinkCandidate[];
  requiresHumanReview: true;
}

export interface CollectiveWorkerAuditReport {
  orgId: string;
  totalCollectiveWorkers: number;
  linkedCount: number;
  unlinkedCount: number;
  brokenLinkCount: number;
  duplicateLinkCount: number;
  demoExcludedCount: number;
  issues: CollectiveWorkerLinkIssue[];
}

export function canonicalCollectiveWorkerId(rhEmployeeId: string): string {
  const clean = String(rhEmployeeId || '').trim().replace(/^emp_/, '');
  if (!clean) throw new Error('rhEmployeeId é obrigatório para projetar colaborador de patrimônio.');
  return `caw_${clean}`;
}

/**
 * Builds a CollectiveAssetWorker operational projection anchored to the master RH identity
 * (via rh_directory). Never matches by name and never fabricates missing fields.
 */
export function buildCollectiveWorkerProjectionFromDirectory(
  entry: DirectoryEntry,
  existing?: Partial<CollectiveAssetWorker> | null,
  nowIso = new Date().toISOString(),
): CollectiveAssetWorker {
  if (!entry.id || !entry.orgId) {
    throw new Error('Registro do diretório RH inválido: id e orgId são obrigatórios.');
  }
  const rhEmployeeId = entry.rhEmployeeId || entry.id;
  if (existing?.orgId && existing.orgId !== entry.orgId) {
    throw new Error('Não é permitido vincular colaborador de patrimônio de outra empresa.');
  }
  if (existing?.rhEmployeeId && existing.rhEmployeeId !== rhEmployeeId) {
    throw new Error('Este registro de patrimônio já está vinculado a outro colaborador RH.');
  }

  return {
    id: existing?.id || canonicalCollectiveWorkerId(rhEmployeeId),
    orgId: entry.orgId,
    rhEmployeeId,
    registrationNumber: (entry.codigoObra || entry.registrationNumber || existing?.registrationNumber || '').trim(),
    name: (entry.name || '').trim(),
    department: (entry.department || existing?.department || '').trim(),
    role: (entry.role || existing?.role || '').trim(),
    ...(existing?.contactPhone ? { contactPhone: existing.contactPhone } : {}),
    active: entry.active === true && !entry.dismissalDate,
    ...(existing?.notes ? { notes: existing.notes } : {}),
    ...(existing?.linkedUserId ? { linkedUserId: existing.linkedUserId } : {}),
    isDemo: existing?.isDemo ?? false,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Validates an explicit human-confirmed link between an operational worker projection
 * (field_workers or collective_asset_workers) and a master RH person.
 */
export function validateExplicitPersonLink(params: {
  targetOrgId: string;
  rhEntry: Pick<DirectoryEntry, 'id' | 'orgId' | 'name' | 'active' | 'dismissalDate'> | null | undefined;
  actorUid: string;
}): string[] {
  const errors: string[] = [];
  if (!params.actorUid?.trim()) errors.push('Usuário autenticado obrigatório para confirmar o vínculo.');
  if (!params.targetOrgId?.trim()) errors.push('Organização de destino inválida.');
  if (!params.rhEntry || !params.rhEntry.id?.trim()) {
    errors.push('Colaborador mestre do RH não encontrado.');
    return errors;
  }
  if (params.rhEntry.orgId !== params.targetOrgId) {
    errors.push('O colaborador selecionado no RH pertence a outra empresa.');
  }
  if (params.rhEntry.active !== true || params.rhEntry.dismissalDate) {
    errors.push('O colaborador selecionado no RH está inativo ou desligado.');
  }
  return errors;
}

/**
 * Audits collective_asset_workers against rh_directory to surface unlinked, broken, or
 * duplicate links for explicit human review (never auto-links or auto-merges).
 */
export function auditCollectiveWorkerLinks(params: {
  orgId: string;
  directory: readonly DirectoryEntry[];
  collectiveWorkers: readonly CollectiveAssetWorker[];
}): CollectiveWorkerAuditReport {
  const { orgId } = params;
  const dirById = new Map<string, DirectoryEntry>();
  const dirByNormName = new Map<string, DirectoryEntry[]>();

  for (const entry of params.directory) {
    if (orgId && entry.orgId !== orgId) continue;
    const key = entry.rhEmployeeId || entry.id;
    dirById.set(key, entry);
    const norm = normalizePersonName(entry.name);
    if (norm) {
      const list = dirByNormName.get(norm) || [];
      list.push(entry);
      dirByNormName.set(norm, list);
    }
  }

  let demoExcludedCount = 0;
  const workers = params.collectiveWorkers.filter((w) => {
    if (w.isDemo === true) {
      demoExcludedCount++;
      return false;
    }
    return !orgId || w.orgId === orgId;
  });

  const byRhId = new Map<string, CollectiveAssetWorker[]>();
  for (const w of workers) {
    const rhId = (w.rhEmployeeId || '').trim();
    if (rhId) {
      const list = byRhId.get(rhId) || [];
      list.push(w);
      byRhId.set(rhId, list);
    }
  }

  const issues: CollectiveWorkerLinkIssue[] = [];
  let linkedCount = 0;
  let unlinkedCount = 0;
  let brokenLinkCount = 0;
  let duplicateLinkCount = 0;

  for (const w of workers) {
    const rhId = (w.rhEmployeeId || '').trim();
    if (!rhId) {
      unlinkedCount++;
      const norm = normalizePersonName(w.name);
      const candidates = (norm ? dirByNormName.get(norm) || [] : []).map(
        (d): CollectiveWorkerLinkCandidate => ({
          rhEmployeeId: d.rhEmployeeId || d.id,
          name: d.name,
          registrationNumber: (d.codigoObra || d.registrationNumber || '').trim(),
          active: d.active,
          matchBasis: 'normalized_name',
          requiresHumanReview: true,
        }),
      );
      issues.push({
        collectiveWorkerId: w.id,
        workerName: w.name,
        registrationNumber: (w.registrationNumber || w.registration || '').trim(),
        issueType: 'missing_rh_link',
        reason: 'Colaborador de patrimônio sem rhEmployeeId (revisão humana necessária).',
        suggestedCandidates: candidates,
        requiresHumanReview: true,
      });
      continue;
    }

    if (!dirById.has(rhId)) {
      brokenLinkCount++;
      issues.push({
        collectiveWorkerId: w.id,
        workerName: w.name,
        registrationNumber: (w.registrationNumber || w.registration || '').trim(),
        issueType: 'broken_rh_link',
        currentRhEmployeeId: rhId,
        reason: `rhEmployeeId "${rhId}" não localizado no diretório oficial do RH.`,
        suggestedCandidates: [],
        requiresHumanReview: true,
      });
      continue;
    }

    const dupGroup = byRhId.get(rhId) || [];
    if (dupGroup.length > 1) {
      duplicateLinkCount++;
      issues.push({
        collectiveWorkerId: w.id,
        workerName: w.name,
        registrationNumber: (w.registrationNumber || w.registration || '').trim(),
        issueType: 'duplicate_rh_link',
        currentRhEmployeeId: rhId,
        reason: `${dupGroup.length} registros em collective_asset_workers apontam para o mesmo rhEmployeeId (${rhId}).`,
        suggestedCandidates: [],
        requiresHumanReview: true,
      });
      continue;
    }

    linkedCount++;
  }

  return {
    orgId,
    totalCollectiveWorkers: workers.length,
    linkedCount,
    unlinkedCount,
    brokenLinkCount,
    duplicateLinkCount,
    demoExcludedCount,
    issues,
  };
}
