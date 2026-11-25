import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  SafetyDocumentType,
  SafetyPermitControls,
  SafetyPermitEventType,
  SafetyPermitRecord,
  SafetyPermitState,
  SafetyPermitStatus,
  SafetyPermitType,
  SafetyRiskLevel,
} from '../types/safety';

export const SAFETY_PERMIT_TYPES: readonly { value: SafetyPermitType; label: string }[] = [
  { value: 'trabalho_a_quente', label: 'Trabalho a quente / soldagem' },
  { value: 'trabalho_em_altura', label: 'Trabalho em altura' },
  { value: 'espaco_confinado', label: 'Espaço confinado' },
  { value: 'eletrico', label: 'Serviço elétrico / energia' },
  { value: 'icamento', label: 'Içamento de cargas' },
  { value: 'abertura_de_linha', label: 'Abertura de linha / intervenção de processo' },
  { value: 'geral', label: 'Atividade geral' },
];

const REQUIRED_CONTROLS: Record<SafetyPermitType, (keyof SafetyPermitControls)[]> = {
  trabalho_a_quente: ['fireWatch'],
  trabalho_em_altura: ['fallProtection', 'anchorVerified'],
  espaco_confinado: ['gasTest', 'rescuePlan', 'standbyWatch'],
  eletrico: ['lockoutTagout', 'zeroEnergyVerified'],
  icamento: ['liftPlanReviewed'],
  abertura_de_linha: ['lockoutTagout', 'zeroEnergyVerified'],
  geral: [],
};

const CONTROL_LABELS: Partial<Record<keyof SafetyPermitControls, string>> = {
  teamBriefed: 'Equipe orientada antes do início',
  ppeInspected: 'EPIs conferidos para a atividade',
  areaIsolated: 'Área sinalizada, isolada e controlada',
  fireWatch: 'Vigia de trabalho a quente designado e disponível',
  fallProtection: 'Sistema de proteção contra quedas inspecionado',
  anchorVerified: 'Pontos de ancoragem verificados',
  gasTest: 'Teste atmosférico realizado e registrado',
  rescuePlan: 'Plano e recursos de resgate disponíveis',
  standbyWatch: 'Vigia externo designado para espaço confinado',
  lockoutTagout: 'Bloqueio e etiquetagem aplicados',
  zeroEnergyVerified: 'Ausência de energia perigosa verificada',
  liftPlanReviewed: 'Plano de içamento/rigging conferido',
};

const RISK_SCORE: Record<SafetyRiskLevel, number> = {
  baixo: 1,
  medio: 2,
  alto: 3,
  critico: 4,
};

export interface SafetyPermitInput {
  unitId: string;
  contractId: string;
  workOrderId?: string;
  relatedAprId?: string;
  documentType: SafetyDocumentType;
  validFrom: string;
  validUntil: string;
  permitType: SafetyPermitType;
  activityTitle: string;
  description: string;
  location: string;
  supervisorName: string;
  teamMembers: string[];
  risks: Array<{
    hazard: string;
    consequence: string;
    initialRisk: SafetyRiskLevel;
    controlMeasures: string;
    residualRisk: SafetyRiskLevel;
  }>;
  controls: SafetyPermitControls;
  emergencyPlan: string;
}

export interface SafetyActor {
  uid: string;
  name: string;
}

function isValidLocalDateTime(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(value)) return false;
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year && date.getMonth() === month - 1
    && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute;
}

export function requiredSafetyControls(type: SafetyPermitType): Array<{ key: keyof SafetyPermitControls; label: string }> {
  const keys: (keyof SafetyPermitControls)[] = [
    'teamBriefed',
    'ppeInspected',
    'areaIsolated',
    ...REQUIRED_CONTROLS[type],
  ];
  return keys.map((key) => ({ key, label: CONTROL_LABELS[key] || key }));
}

export function validateSafetyPermitInput(input: SafetyPermitInput): string[] {
  const errors: string[] = [];
  if (!input.unitId.trim()) errors.push('Selecione a unidade/obra.');
  if (!input.contractId.trim()) errors.push('Selecione o contrato.');
  if (input.documentType !== 'apr' && input.documentType !== 'pt') errors.push('Selecione APR ou Permissão de Trabalho.');
  if (input.documentType === 'pt' && !input.relatedAprId?.trim()) {
    errors.push('Vincule a Permissão de Trabalho a uma APR aprovada.');
  }
  if (input.documentType === 'apr' && input.relatedAprId) {
    errors.push('Uma APR não pode ser vinculada a outra APR.');
  }
  if (!isValidLocalDateTime(input.validFrom)) errors.push('Informe uma data/hora inicial válida.');
  if (!isValidLocalDateTime(input.validUntil)) errors.push('Informe uma data/hora final válida.');
  if (isValidLocalDateTime(input.validFrom) && isValidLocalDateTime(input.validUntil)
    && new Date(input.validUntil).getTime() <= new Date(input.validFrom).getTime()) {
    errors.push('A validade final deve ser posterior ao início da atividade.');
  }
  if (!SAFETY_PERMIT_TYPES.some((item) => item.value === input.permitType)) errors.push('Selecione um tipo de atividade válido.');
  if (input.activityTitle.trim().length < 3 || input.activityTitle.trim().length > 160) {
    errors.push('A atividade deve ter entre 3 e 160 caracteres.');
  }
  if (input.description.trim().length < 10 || input.description.trim().length > 2000) {
    errors.push('Descreva a atividade em até 2.000 caracteres (mínimo de 10).');
  }
  if (input.location.trim().length < 2 || input.location.trim().length > 180) errors.push('Informe o local/frente de serviço.');
  if (input.supervisorName.trim().length < 2 || input.supervisorName.trim().length > 120) errors.push('Informe o responsável pela frente.');
  if (input.teamMembers.length < 1 || input.teamMembers.length > 30
    || input.teamMembers.some((name) => name.trim().length < 2 || name.trim().length > 120)) {
    errors.push('Informe de 1 a 30 participantes, com nomes válidos.');
  }
  const normalizedTeam = input.teamMembers.map((name) => name.trim().toLocaleLowerCase('pt-BR'));
  if (new Set(normalizedTeam).size !== normalizedTeam.length) errors.push('Remova nomes duplicados da equipe.');
  if (input.risks.length < 1 || input.risks.length > 5) errors.push('Registre de 1 a 5 perigos/riscos da atividade.');

  input.risks.forEach((risk, index) => {
    if (risk.hazard.trim().length < 3 || risk.hazard.trim().length > 180) errors.push('Perigo ' + (index + 1) + ': informe o perigo identificado.');
    if (risk.consequence.trim().length < 3 || risk.consequence.trim().length > 300) errors.push('Perigo ' + (index + 1) + ': informe a consequência possível.');
    if (risk.controlMeasures.trim().length < 5 || risk.controlMeasures.trim().length > 700) errors.push('Perigo ' + (index + 1) + ': descreva as medidas de controle.');
    if (RISK_SCORE[risk.residualRisk] > RISK_SCORE[risk.initialRisk]) {
      errors.push('O risco residual não pode ser maior que o risco inicial após os controles.');
    }
  });

  const required = requiredSafetyControls(input.permitType).map((item) => item.key);
  required.forEach((key) => {
    if (!input.controls[key]) errors.push('Confirme: ' + (CONTROL_LABELS[key] || key) + '.');
  });
  if (input.emergencyPlan.trim().length < 10 || input.emergencyPlan.trim().length > 1500) {
    errors.push('Informe um plano de emergência/resposta compatível com a atividade (10 a 1.500 caracteres).');
  }
  return errors;
}

export function safetyPermitCode(type: SafetyDocumentType, permitDate: string, id: string): string {
  const year = permitDate.slice(0, 4);
  const suffix = id.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase().padStart(8, '0');
  return (type === 'apr' ? 'APR-' : 'PT-') + year + '-' + suffix;
}

export function getSafetyNextStatus(
  currentStatus: SafetyPermitStatus,
  eventType: SafetyPermitEventType,
): SafetyPermitStatus | null {
  if (eventType === 'note_added') return ['closed', 'cancelled'].includes(currentStatus) ? null : currentStatus;
  if (eventType === 'submitted_for_approval' && ['draft', 'rejected'].includes(currentStatus)) return 'awaiting_approval';
  if (eventType === 'approved' && currentStatus === 'awaiting_approval') return 'approved';
  if (eventType === 'rejected' && currentStatus === 'awaiting_approval') return 'rejected';
  if (eventType === 'closed' && currentStatus === 'approved') return 'closed';
  if (eventType === 'cancelled' && ['draft', 'awaiting_approval', 'rejected', 'approved'].includes(currentStatus)) return 'cancelled';
  return null;
}

export function safetyPermitStatusLabel(status: SafetyPermitStatus): string {
  const labels: Record<SafetyPermitStatus, string> = {
    draft: 'Rascunho',
    awaiting_approval: 'Aguardando aprovação',
    approved: 'Aprovada',
    rejected: 'Reprovada',
    closed: 'Encerrada',
    cancelled: 'Cancelada',
  };
  return labels[status];
}

export function safetyPermitTypeLabel(type: SafetyPermitType): string {
  return SAFETY_PERMIT_TYPES.find((item) => item.value === type)?.label || 'Atividade geral';
}

export function safetyEventLabel(eventType: SafetyPermitEventType): string {
  const labels: Record<SafetyPermitEventType, string> = {
    created: 'Registro criado',
    submitted_for_approval: 'Enviado para aprovação',
    approved: 'Aprovado internamente',
    rejected: 'Reprovado',
    closed: 'Encerrado',
    cancelled: 'Cancelado',
    note_added: 'Observação registrada',
  };
  return labels[eventType];
}

export function localSafetyDate(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

export async function createSafetyPermit(
  orgId: string,
  actor: SafetyActor,
  input: SafetyPermitInput,
): Promise<string> {
  const errors = validateSafetyPermitInput(input);
  if (errors.length) throw new Error(errors.join(' '));

  const permitRef = doc(collection(db, 'safety_permits'));
  const eventRef = doc(collection(db, 'safety_permit_events'));
  const stateRef = doc(db, 'safety_permit_states', permitRef.id);
  const permitDate = input.validFrom.slice(0, 10);
  const permitCode = safetyPermitCode(input.documentType, permitDate, permitRef.id);

  const record = {
    ...input,
    id: permitRef.id,
    orgId,
    permitCode,
    permitDate,
    createdByUid: actor.uid,
    createdByName: actor.name,
    createdAt: serverTimestamp(),
  };
  await setDoc(permitRef, record);

  await setDoc(eventRef, {
    id: eventRef.id,
    orgId,
    unitId: input.unitId,
    contractId: input.contractId,
    permitId: permitRef.id,
    eventType: 'created',
    actorUid: actor.uid,
    actorName: actor.name,
    recordedAt: serverTimestamp(),
  });

  await setDoc(stateRef, {
    id: permitRef.id,
    orgId,
    unitId: input.unitId,
    contractId: input.contractId,
    permitId: permitRef.id,
    status: 'draft',
    latestEventId: eventRef.id,
    updatedByUid: actor.uid,
    updatedByName: actor.name,
    updatedAt: serverTimestamp(),
  });
  return permitRef.id;
}

export async function transitionSafetyPermit(
  permit: SafetyPermitRecord,
  state: SafetyPermitState,
  eventType: SafetyPermitEventType,
  actor: SafetyActor,
  comment?: string,
): Promise<void> {
  const nextStatus = getSafetyNextStatus(state.status, eventType);
  if (!nextStatus) throw new Error('Movimentação não permitida para o status atual.');
  if (['rejected', 'closed', 'cancelled', 'note_added'].includes(eventType) && !comment?.trim()) {
    throw new Error('Informe uma justificativa para esta movimentação.');
  }

  const eventRef = doc(collection(db, 'safety_permit_events'));
  const stateRef = doc(db, 'safety_permit_states', permit.id);
  await setDoc(eventRef, {
    id: eventRef.id,
    orgId: permit.orgId,
    unitId: permit.unitId,
    contractId: permit.contractId,
    permitId: permit.id,
    previousEventId: state.latestEventId,
    eventType,
    actorUid: actor.uid,
    actorName: actor.name,
    recordedAt: serverTimestamp(),
    ...(comment?.trim() ? { comment: comment.trim() } : {}),
  });

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    if (!snapshot.exists()) throw new Error('Estado da APR/PT não encontrado.');
    const current = snapshot.data() as SafetyPermitState;
    if (current.latestEventId !== state.latestEventId) {
      throw new Error('A APR/PT foi movimentada por outra pessoa. Atualize a tela e tente novamente.');
    }
    const actualNextStatus = getSafetyNextStatus(current.status, eventType);
    if (!actualNextStatus) throw new Error('O fluxo da APR/PT mudou; a movimentação não foi aplicada.');
    transaction.update(stateRef, {
      status: actualNextStatus,
      latestEventId: eventRef.id,
      updatedByUid: actor.uid,
      updatedByName: actor.name,
      updatedAt: serverTimestamp(),
    });
  });
}
