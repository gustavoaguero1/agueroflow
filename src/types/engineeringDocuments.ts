export type EngineeringDocumentKind =
  | 'desenho'
  | 'isometrico'
  | 'pid'
  | 'especificacao'
  | 'mapa_solda'
  | 'wps_pqr'
  | 'certificado_material'
  | 'relatorio_ensaios'
  | 'procedimento'
  | 'as_built'
  | 'outro';

export type EngineeringDocumentEventType =
  | 'submitted_internal'
  | 'approved_internal'
  | 'rejected_internal'
  | 'submitted_client'
  | 'approved_client'
  | 'rejected_client'
  | 'marked_as_built';

export interface EngineeringDocument {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  documentGroupId: string;
  documentCode: string;
  title: string;
  documentType: EngineeringDocumentKind;
  revision: string;
  filePath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  documentDate?: string;
  notes?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: unknown;
}

export interface EngineeringDocumentEvent {
  id: string;
  orgId: string;
  unitId: string;
  contractId: string;
  documentId: string;
  previousEventId?: string;
  eventType: EngineeringDocumentEventType;
  recordedByUid: string;
  recordedByName: string;
  recordedAt: unknown;
  comment?: string;
  clientName?: string;
  clientReference?: string;
}
