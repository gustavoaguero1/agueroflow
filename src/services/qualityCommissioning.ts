import type {
  QualityEventType,
  QualityRecordType,
  QualityResult,
  QualitySeverity,
} from '../types/quality';

export const QUALITY_TEST_TYPES: readonly QualityRecordType[] = [
  'hydrostatic_test',
  'leak_test',
  'functional_test',
];

export const QUALITY_FINDING_TYPES: readonly QualityRecordType[] = [
  'nonconformity',
  'punch_item',
];

export interface QualityRecordInput {
  recordDate: string;
  recordType: QualityRecordType;
  title: string;
  description: string;
  result: QualityResult;
  severity?: QualitySeverity;
  measuredValue?: number;
  measuredUnit?: string;
  acceptanceCriteria?: string;
  referenceStandard?: string;
  testMedium?: string;
  holdDurationMinutes?: number;
  equipmentTag?: string;
  engineeringDocumentId?: string;
  checklistRunId?: string;
  responsibleName?: string;
  dueDate?: string;
}

export type QualityRecordStatus =
  | 'review_pending'
  | 'open'
  | 'rejected'
  | 'correction_pending_verification'
  | 'approved'
  | 'verified'
  | 'closed'
  | 'reopened'
  | 'unknown';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function qualityInitialEvent(recordType: QualityRecordType): QualityEventType {
  return QUALITY_FINDING_TYPES.includes(recordType) ? 'opened' : 'submitted_for_review';
}

export function validateQualityRecordInput(input: QualityRecordInput): string[] {
  const errors: string[] = [];
  if (!isRealIsoDate(input.recordDate)) errors.push('Informe uma data válida para o registro.');
  if (input.title.trim().length < 3 || input.title.trim().length > 180) {
    errors.push('O título deve ter entre 3 e 180 caracteres.');
  }
  if (input.description.trim().length < 3 || input.description.trim().length > 2000) {
    errors.push('A descrição deve ter entre 3 e 2.000 caracteres.');
  }

  const isFinding = QUALITY_FINDING_TYPES.includes(input.recordType);
  const isTest = QUALITY_TEST_TYPES.includes(input.recordType);

  if (isFinding) {
    if (input.result !== 'nao_conforme') errors.push('Não conformidades e itens de punch list devem ser registrados como não conformes.');
    if (!input.severity) errors.push('Informe a criticidade do apontamento.');
    if (!input.responsibleName?.trim()) errors.push('Informe o responsável pela correção.');
    if (!input.dueDate || !isRealIsoDate(input.dueDate)) errors.push('Informe um prazo válido para a correção.');
  } else {
    if (input.result === 'nao_conforme' && !input.acceptanceCriteria?.trim()) {
      errors.push('Descreva o critério de aceitação utilizado para registrar a reprovação.');
    }
    if (!input.acceptanceCriteria?.trim()) errors.push('Informe o critério de aceitação ou verificação.');
  }

  if (isTest) {
    if (input.measuredValue === undefined || !Number.isFinite(input.measuredValue) || input.measuredValue < 0) {
      errors.push('Informe um valor medido válido.');
    }
    if (!input.measuredUnit?.trim()) errors.push('Informe a unidade do valor medido.');
  }

  if (input.recordType === 'hydrostatic_test' || input.recordType === 'leak_test') {
    if (!input.testMedium?.trim()) errors.push('Informe o fluido ou meio utilizado no teste.');
    if (input.holdDurationMinutes === undefined || !Number.isInteger(input.holdDurationMinutes)
      || input.holdDurationMinutes < 1 || input.holdDurationMinutes > 1440) {
      errors.push('Informe o tempo de estabilização/observação entre 1 e 1.440 minutos.');
    }
  }

  if (input.measuredUnit && input.measuredUnit.trim().length > 20) errors.push('A unidade de medição deve ter até 20 caracteres.');
  if (input.acceptanceCriteria && input.acceptanceCriteria.trim().length > 500) errors.push('O critério de aceitação deve ter até 500 caracteres.');
  if (input.referenceStandard && input.referenceStandard.trim().length > 120) errors.push('A referência técnica deve ter até 120 caracteres.');
  if (input.testMedium && input.testMedium.trim().length > 80) errors.push('O fluido/meio deve ter até 80 caracteres.');
  if (input.equipmentTag && input.equipmentTag.trim().length > 80) errors.push('A identificação do equipamento deve ter até 80 caracteres.');
  if (input.responsibleName && input.responsibleName.trim().length > 120) errors.push('O responsável deve ter até 120 caracteres.');

  return errors;
}

export function getQualityRecordStatus(eventType?: QualityEventType): QualityRecordStatus {
  switch (eventType) {
    case 'submitted_for_review': return 'review_pending';
    case 'opened': return 'open';
    case 'rejected': return 'rejected';
    case 'corrective_action_submitted': return 'correction_pending_verification';
    case 'approved': return 'approved';
    case 'verified': return 'verified';
    case 'closed': return 'closed';
    case 'reopened': return 'reopened';
    default: return 'unknown';
  }
}

export function qualityStatusLabel(status: QualityRecordStatus): string {
  const labels: Record<QualityRecordStatus, string> = {
    review_pending: 'Aguardando aprovação',
    open: 'Aberta',
    rejected: 'Reprovada',
    correction_pending_verification: 'Correção enviada · aguarda verificação',
    approved: 'Aprovada',
    verified: 'Correção verificada',
    closed: 'Encerrada',
    reopened: 'Reaberta',
    unknown: 'Sem movimentação registrada',
  };
  return labels[status];
}

export function qualityRecordTypeLabel(type: QualityRecordType): string {
  const labels: Record<QualityRecordType, string> = {
    visual_inspection: 'Inspeção visual',
    weld_inspection: 'Inspeção de solda',
    dimensional_inspection: 'Inspeção dimensional',
    material_receipt: 'Inspeção de recebimento de material',
    hydrostatic_test: 'Teste hidrostático',
    leak_test: 'Teste de estanqueidade',
    functional_test: 'Teste funcional',
    commissioning: 'Comissionamento',
    nonconformity: 'Não conformidade',
    punch_item: 'Pendência de punch list',
  };
  return labels[type];
}

export function qualityEventLabel(eventType: QualityEventType): string {
  const labels: Record<QualityEventType, string> = {
    submitted_for_review: 'Enviado para aprovação',
    opened: 'Apontamento aberto',
    approved: 'Aprovado',
    rejected: 'Reprovado · correção necessária',
    corrective_action_submitted: 'Ação corretiva enviada para verificação',
    verified: 'Correção verificada',
    closed: 'Apontamento encerrado',
    reopened: 'Apontamento reaberto',
    note_added: 'Observação registrada',
  };
  return labels[eventType];
}

export function localQualityDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function qualityRecordEventTone(eventType?: QualityEventType): 'success' | 'danger' | 'warning' | 'neutral' {
  if (eventType === 'approved' || eventType === 'verified' || eventType === 'closed') return 'success';
  if (eventType === 'rejected' || eventType === 'reopened') return 'danger';
  if (eventType === 'submitted_for_review' || eventType === 'opened' || eventType === 'corrective_action_submitted') return 'warning';
  return 'neutral';
}
