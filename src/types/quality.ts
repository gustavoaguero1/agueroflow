export type QualityRecordType =
  | 'visual_inspection'
  | 'weld_inspection'
  | 'dimensional_inspection'
  | 'material_receipt'
  | 'hydrostatic_test'
  | 'leak_test'
  | 'functional_test'
  | 'commissioning'
  | 'nonconformity'
  | 'punch_item';

export type QualityResult = 'conforme' | 'nao_conforme' | 'pendente';
export type QualitySeverity = 'baixa' | 'media' | 'alta' | 'critica';

export type QualityEventType =
  | 'submitted_for_review'
  | 'opened'
  | 'approved'
  | 'rejected'
  | 'corrective_action_submitted'
  | 'verified'
  | 'closed'
  | 'reopened'
  | 'note_added';

export interface QualityRecord {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  recordCode: string;
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
  engineeringDocumentCode?: string;
  checklistRunId?: string;
  checklistTitle?: string;
  responsibleName?: string;
  dueDate?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: unknown;
}

export interface QualityRecordEvent {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  recordId: string;
  eventType: QualityEventType;
  actorUid: string;
  actorName: string;
  recordedAt: unknown;
  comment?: string;
}

export interface QualityRecordState {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  recordId: string;
  status: QualityRecordStatus;
  latestEventId: string;
  updatedByUid: string;
  updatedByName: string;
  updatedAt: unknown;
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
