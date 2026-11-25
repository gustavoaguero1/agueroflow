export type FabricationOperationStage =
  | 'corte'
  | 'preparacao'
  | 'conformacao'
  | 'montagem'
  | 'solda'
  | 'acabamento'
  | 'inspecao'
  | 'expedicao';

export type FabricationOrderStatus =
  | 'planejada'
  | 'em_fabricacao'
  | 'aguardando_inspecao'
  | 'liberada_expedicao'
  | 'expedida'
  | 'cancelada';

export interface FabricationRoutingStep {
  id: string;
  sequence: number;
  stage: FabricationOperationStage;
  description: string;
  isHoldPoint?: boolean;
  plannedHours: number;
  actualHours: number;
  goodQty: number;
  scrapQty: number;
  reworkQty: number;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'reprovada';
  operatorName?: string;
  completedAt?: string;
}

export interface FabricationOrder {
  id: string;
  orgId: string;
  code: string; // Ex: OF-2026-0001
  projectId: string;
  unitId: string;
  contractId: string;
  spoolOrPartTag: string;
  description: string;
  engineeringDocumentId?: string;
  engineeringDocRevision?: string;
  plannedQuantity: number;
  unitOfMeasure: string;
  materialLotIds: string[];
  heatNumbers: string[];
  routing: FabricationRoutingStep[];
  packingVolumeCode?: string;
  status: FabricationOrderStatus;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
}
