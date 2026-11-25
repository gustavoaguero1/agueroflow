export type SafetyPermitType =
  | 'trabalho_a_quente'
  | 'trabalho_em_altura'
  | 'espaco_confinado'
  | 'eletrico'
  | 'icamento'
  | 'abertura_de_linha'
  | 'geral';

export type SafetyDocumentType = 'apr' | 'pt';
export type SafetyRiskLevel = 'baixo' | 'medio' | 'alto' | 'critico';

export type SafetyPermitStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'cancelled';

export type SafetyPermitEventType =
  | 'created'
  | 'submitted_for_approval'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'cancelled'
  | 'note_added';

export type SafetyOccurrenceCategory =
  | 'quase_acidente'
  | 'condicao_insegura'
  | 'ato_inseguro'
  | 'incidente_sem_lesao'
  | 'acidente_com_lesao'
  | 'incidente_ambiental';

export interface SafetyRiskAssessment {
  id: string;
  hazard: string;
  consequence: string;
  initialRisk: SafetyRiskLevel;
  controlMeasures: string;
  residualRisk: SafetyRiskLevel;
}

export interface SafetyPermitControls {
  teamBriefed: boolean;
  ppeInspected: boolean;
  areaIsolated: boolean;
  fireWatch?: boolean;
  fallProtection?: boolean;
  anchorVerified?: boolean;
  gasTest?: boolean;
  rescuePlan?: boolean;
  standbyWatch?: boolean;
  lockoutTagout?: boolean;
  zeroEnergyVerified?: boolean;
  liftPlanReviewed?: boolean;
}

export interface SafetyPermitRecord {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  workOrderId?: string;
  relatedAprId?: string;
  permitCode: string;
  permitDate: string;
  documentType: SafetyDocumentType;
  permitType: SafetyPermitType;
  activityTitle: string;
  description: string;
  location: string;
  validFrom: string;
  validUntil: string;
  supervisorName: string;
  teamMembers: string[];
  risks: SafetyRiskAssessment[];
  controls: SafetyPermitControls;
  emergencyPlan: string;
  createdByUid: string;
  createdByName: string;
  createdAt: unknown;
}

export interface SafetyPermitEvent {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  permitId: string;
  eventType: SafetyPermitEventType;
  actorUid: string;
  actorName: string;
  recordedAt: unknown;
  previousEventId?: string;
  comment?: string;
}

export interface SafetyPermitState {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  permitId: string;
  status: SafetyPermitStatus;
  latestEventId: string;
  updatedByUid: string;
  updatedByName: string;
  updatedAt: unknown;
}
