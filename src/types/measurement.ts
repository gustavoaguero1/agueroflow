export type MeasurementStatus =
  | 'rascunho'
  | 'enviado_aprovacao'
  | 'aprovado'
  | 'aprovado_parcial'
  | 'glosado'
  | 'devolvido'
  | 'cancelado';

export type MeasurementEventType =
  | 'created'
  | 'submitted'
  | 'approved'
  | 'partially_approved'
  | 'glosado'
  | 'returned'
  | 'cancelled';

export interface MeasurementLineItem {
  id: string;
  itemCode?: string;
  description: string;
  unit: string;
  lpuItemId?: string;
  workOrderId?: string;
  stageName?: string;
  evidenceDocRef?: string;
  contractedQuantity?: number;
  previousAccumulatedQuantity?: number;
  measuredQuantity: number;
  approvedQuantity: number;
  unitPrice: number;
  measuredTotal: number;
  approvedTotal: number;
  glosaAmount: number;
  glosaReason?: string;
}

export interface LpuTableLine {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  unitPrice: number;
  contractedQuantity?: number;
}

export interface LpuPriceTable {
  id: string;
  orgId: string;
  contractId: string;
  code: string;
  version: number;
  effectiveFrom: string;
  effectiveUntil?: string;
  readjustmentIndex?: string;
  readjustmentPercent?: number;
  status: 'vigente' | 'substituida' | 'rascunho';
  items: LpuTableLine[];
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export interface MeasurementBulletin {
  id: string;
  orgId: string;
  code: string;
  number: number;
  revision?: number;
  previousBulletinId?: string;
  title: string;
  contractId: string;
  contractTitle?: string;
  projectId?: string;
  projectCode?: string;
  unitId: string;
  clientName: string;
  clientCnpj?: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: MeasurementStatus;
  lpuTableId?: string;
  lpuVersionSnapshot?: number;
  items: MeasurementLineItem[];
  totalMeasuredAmount: number;
  totalApprovedAmount: number;
  totalGlosaAmount: number;
  readjustmentPercent?: number;
  readjustmentAmount?: number;
  retentionPercent?: number;
  retentionAmount?: number;
  netApprovedReceivableAmount?: number;
  evidenceStoragePaths?: string[];
  lpuApprovalIds?: string[];
  receivableId?: string;
  notes?: string;
  createdByUid: string;
  createdByName: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedByUid?: string;
  approvedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeasurementEvent {
  id: string;
  orgId: string;
  bulletinId: string;
  eventType: MeasurementEventType;
  fromStatus?: MeasurementStatus;
  toStatus: MeasurementStatus;
  actorUid: string;
  actorName: string;
  comment?: string;
  receivableId?: string;
  timestamp: string;
}
