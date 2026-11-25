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

export interface MeasurementBulletin {
  id: string;
  orgId: string;
  code: string;
  number: number;
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
  items: MeasurementLineItem[];
  totalMeasuredAmount: number;
  totalApprovedAmount: number;
  totalGlosaAmount: number;
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
