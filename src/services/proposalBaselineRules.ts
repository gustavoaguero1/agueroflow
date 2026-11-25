import type { Contract } from '../types';
import type { Project, ProjectBudgetBaseline } from '../types/project';

export interface ProposalWinSource {
  id: string;
  organizationId?: string;
  orgId?: string;
  code?: string;
  title?: string;
  clientId?: string;
  clientName?: string;
  scopeDescription?: string;
  currency?: string;
  unitId?: string;
  contractId?: string;
  costCenterId?: string;
  projectId?: string;
  totalBaseCost?: number;
  totalFreightCost?: number;
  totalTaxCost?: number;
  proposedTotal?: number;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

export function validateProposalWinUnitId(unitId: unknown): string {
  const clean = typeof unitId === 'string' ? unitId.trim() : '';
  if (!clean || clean === 'default_unit') {
    throw new Error('Vincule uma unidade real válida à proposta antes de convertê-la (default_unit não é permitido).');
  }
  return clean;
}

export function buildFrozenBudgetBaselineFromProposal(params: {
  proposal: ProposalWinSource;
  actorUid: string;
  actorName: string;
  frozenAt: string;
}): ProjectBudgetBaseline {
  const { proposal, actorUid, actorName, frozenAt } = params;
  const baseCost = roundMoney(Number(proposal.totalBaseCost) || 0);
  const freightCost = roundMoney(Number(proposal.totalFreightCost) || 0);
  const taxCost = roundMoney(Number(proposal.totalTaxCost) || 0);
  const plannedDirectCost = roundMoney(baseCost + freightCost + taxCost);
  const contractedRevenue = roundMoney(Number(proposal.proposedTotal) || 0);

  return {
    version: 1,
    frozenAt,
    frozenByUid: actorUid,
    frozenByName: actorName,
    sourceProposalId: proposal.id,
    ...(proposal.code ? { sourceProposalCode: proposal.code } : {}),
    plannedDirectCost,
    plannedMaterialCost: baseCost,
    plannedIndirectCost: roundMoney(freightCost + taxCost),
    contractedRevenue,
    currency: (proposal.currency || 'BRL').trim().toUpperCase(),
    notes: `Orçamento-base congelado automaticamente a partir da proposta ${proposal.code || proposal.id}.`,
  };
}

export function buildDerivedContractFromProposal(params: {
  orgId: string;
  unitId: string;
  proposal: ProposalWinSource;
  now: string;
}): Contract & { proposalId: string; updatedAt: string } {
  const { orgId, unitId, proposal, now } = params;
  const code = (proposal.code || proposal.id).trim();
  const title = proposal.title?.trim()
    ? `${code} - ${proposal.title.trim()}`
    : `Contrato ${code}`;
  return {
    id: `ct_prop_${proposal.id}`,
    orgId,
    code: `CT-${code}`.slice(0, 40),
    title: title.slice(0, 180),
    contractNumber: `CT-${code}`.slice(0, 60),
    reference: code,
    ...(proposal.scopeDescription?.trim() ? { description: proposal.scopeDescription.trim() } : {}),
    ...(proposal.clientName?.trim() ? { partyName: proposal.clientName.trim() } : {}),
    type: 'cliente',
    status: 'ativo',
    active: true,
    value: roundMoney(Number(proposal.proposedTotal) || 0),
    unitIds: [unitId],
    startDate: now.slice(0, 10),
    proposalId: proposal.id,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDerivedProjectFromProposal(params: {
  orgId: string;
  unitId: string;
  contractId: string;
  costCenterId?: string;
  proposal: ProposalWinSource;
  budgetBaseline: ProjectBudgetBaseline;
  actorUid: string;
  actorName: string;
  now: string;
}): Project {
  const { orgId, unitId, contractId, costCenterId, proposal, budgetBaseline, actorUid, actorName, now } = params;
  const rawCode = (proposal.code || proposal.id).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');
  const code = `OBRA-${rawCode}`.slice(0, 40);
  const name = (proposal.title?.trim() || `Obra ${proposal.code || proposal.id}`).slice(0, 180);

  return {
    id: `prj_prop_${proposal.id}`,
    orgId,
    code,
    name,
    ...(proposal.scopeDescription?.trim() ? { description: proposal.scopeDescription.trim() } : {}),
    status: 'planejamento',
    ...(proposal.clientId?.trim() ? { clientId: proposal.clientId.trim() } : {}),
    ...(proposal.clientName?.trim() ? { clientName: proposal.clientName.trim() } : {}),
    contractId,
    unitId,
    ...(costCenterId ? { costCenterId } : {}),
    proposalId: proposal.id,
    ...(proposal.code?.trim() ? { proposalCode: proposal.code.trim() } : {}),
    budgetBaseline,
    createdByUid: actorUid,
    createdByName: actorName,
    createdAt: now,
    updatedAt: now,
  };
}
