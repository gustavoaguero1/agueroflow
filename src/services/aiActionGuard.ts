import type { AreaId } from '../permissions/areas.ts';
import type { UserRole } from '../types/index.ts';

export type AiActionType =
  | 'create_work_order_draft'
  | 'create_purchase_requisition_draft'
  | 'register_occurrence_draft'
  | 'schedule_preventive_review';

export interface AiActionPolicy {
  actionType: AiActionType;
  requiredArea: AreaId;
  requiredAreaLevel: 1 | 2;
  allowedRoles: UserRole[];
  requiresHumanConfirmation: true;
}

export const AI_ACTION_POLICIES: Record<AiActionType, AiActionPolicy> = {
  create_work_order_draft: {
    actionType: 'create_work_order_draft',
    requiredArea: 'operacoes',
    requiredAreaLevel: 2,
    allowedRoles: ['Admin', 'Gerente', 'Supervisor', 'Operacional'],
    requiresHumanConfirmation: true,
  },
  create_purchase_requisition_draft: {
    actionType: 'create_purchase_requisition_draft',
    requiredArea: 'estoque',
    requiredAreaLevel: 2,
    allowedRoles: ['Admin', 'Gerente', 'Supervisor'],
    requiresHumanConfirmation: true,
  },
  register_occurrence_draft: {
    actionType: 'register_occurrence_draft',
    requiredArea: 'operacoes',
    requiredAreaLevel: 2,
    allowedRoles: ['Admin', 'Gerente', 'Supervisor', 'Operacional'],
    requiresHumanConfirmation: true,
  },
  schedule_preventive_review: {
    actionType: 'schedule_preventive_review',
    requiredArea: 'operacoes',
    requiredAreaLevel: 2,
    allowedRoles: ['Admin', 'Gerente', 'Supervisor'],
    requiresHumanConfirmation: true,
  },
};

export interface AiActionProposal {
  id: string;
  orgId: string;
  actionType: AiActionType;
  summary: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: 'aguardando_confirmacao' | 'confirmada' | 'rejeitada' | 'expirada';
  proposedByUid: string;
  proposedByName: string;
  proposedAt: string;
  expiresAt: string;
  confirmedByUid?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  resultRefId?: string;
}

export function validateAiActionConfirmation(params: {
  proposal: AiActionProposal | null;
  actorUid: string;
  actorOrgId: string;
  actorRole: UserRole;
  actorAreaLevel: number;
  isMaster?: boolean;
  explicitConfirmation: boolean;
  nowIso?: string;
}): { allowed: boolean; reason?: string } {
  const { proposal, actorOrgId, actorRole, actorAreaLevel, isMaster, explicitConfirmation } = params;
  const nowIso = params.nowIso || new Date().toISOString();

  if (!explicitConfirmation) {
    return { allowed: false, reason: 'Ações sugeridas pela IA exigem confirmação humana explícita antes de gravar dados.' };
  }
  if (!proposal || proposal.orgId !== actorOrgId) {
    return { allowed: false, reason: 'Proposta de ação da IA não encontrada nesta empresa.' };
  }
  if (proposal.status !== 'aguardando_confirmacao') {
    return { allowed: false, reason: `Proposta já processada (status: ${proposal.status}).` };
  }
  if (proposal.expiresAt <= nowIso) {
    return { allowed: false, reason: 'Proposta da IA expirou. Solicite uma nova análise antes de confirmar.' };
  }

  const policy = AI_ACTION_POLICIES[proposal.actionType];
  if (!policy) {
    return { allowed: false, reason: 'Tipo de ação da IA não autorizado.' };
  }
  if (!isMaster) {
    if (actorAreaLevel < policy.requiredAreaLevel) {
      return { allowed: false, reason: `Permissão insuficiente na área "${policy.requiredArea}" para confirmar esta ação.` };
    }
    if (!policy.allowedRoles.includes(actorRole)) {
      return { allowed: false, reason: `Perfil "${actorRole}" não tem alçada para confirmar esta ação da IA.` };
    }
  }
  return { allowed: true };
}
