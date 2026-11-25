export type CmmsTriggerType = 'calendario' | 'horimetro' | 'ciclos';

export interface CmmsPreventivePlan {
  id: string;
  orgId: string;
  assetId: string;
  assetTag: string;
  assetName: string;
  unitId: string;
  title: string;
  triggerType: CmmsTriggerType;
  intervalDays?: number;
  intervalHours?: number;
  intervalCycles?: number;
  nextDueDate?: string;
  nextDueHourmeter?: number;
  criticality: 'baixa' | 'media' | 'alta' | 'critica';
  active: boolean;
  lastTriggeredAt?: string;
  lastWorkOrderId?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CmmsMaintenanceRecord {
  id: string;
  orgId: string;
  assetId: string;
  assetTag: string;
  unitId: string;
  projectId?: string;
  workOrderId?: string;
  type: 'preventiva' | 'corretiva' | 'preditiva' | 'calibracao';
  failureMode?: string;
  rootCause?: string;
  downtimeHours: number;
  laborHours: number;
  partsCost: number;
  laborCost: number;
  hourmeterReading?: number;
  performedAt: string;
  notes?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export interface AssetReliabilityKpis {
  assetId: string;
  correctiveFailuresCount: number;
  totalDowntimeHours: number;
  operatingWindowHours: number;
  mtbfHours: number | null;
  mttrHours: number | null;
  availabilityPct: number | null;
  sufficientData: boolean;
  coverageNote: string;
}
