export type WeldingProcess = 'TIG' | 'MIG' | 'MAG' | 'ER' | 'SAW' | 'FCAW' | 'ORBITAL';

export interface WeldingProcedure {
  id: string;
  orgId: string;
  code: string; // Ex: EPS-INOX-316L-001
  title: string;
  process: WeldingProcess;
  baseMetal: string;
  fillerMetal: string;
  thicknessRangeMm?: string;
  revision: string;
  status: 'ativa' | 'obsoleta';
  engineeringDocumentId?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WelderQualification {
  id: string;
  orgId: string;
  rhEmployeeId: string;
  employeeName: string;
  stampCode: string; // Sinete do soldador (ex: S-014)
  process: WeldingProcess;
  epsIds: string[];
  epsCodes: string[];
  qualifiedAt: string;
  qualifiedUntil: string;
  certificateStoragePath?: string;
  status: 'ativa' | 'vencida' | 'suspensa';
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialLot {
  id: string;
  orgId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  lotCode: string;
  heatNumber: string; // Corrida metalúrgica
  manufacturer?: string;
  certificateNumber?: string;
  certificateStoragePath?: string;
  receiptId?: string;
  projectId?: string;
  unitId?: string;
  receivedQuantity: number;
  unitOfMeasure: string;
  expiryDate?: string;
  appliedOrderIds: string[];
  appliedJointIds: string[];
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export type WeldJointStatus = 'pendente' | 'soldada' | 'em_end' | 'aprovada' | 'reprovada' | 'reparada';

export interface WeldJoint {
  id: string;
  orgId: string;
  projectId: string;
  unitId: string;
  contractId: string;
  orderId?: string;
  lineOrSpool: string;
  jointCode: string; // Ex: J-001
  engineeringDocumentId?: string;
  materialLotId?: string;
  heatNumber: string;
  baseMaterialSpec: string;
  diameterInch?: string;
  scheduleOrThickness?: string;
  epsId: string;
  epsCode: string;
  welderQualificationId: string;
  welderEmployeeId: string;
  welderName: string;
  welderStamp: string;
  weldDate: string;
  visualResult: 'pendente' | 'aprovada' | 'reprovada';
  ndtRequiredMethods: Array<'LP' | 'PM' | 'US' | 'RX'>;
  ndtReportIds: string[];
  status: WeldJointStatus;
  notes?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export type NdtMethod = 'LP' | 'PM' | 'US' | 'RX' | 'hidrostatico' | 'pneumatico';

export interface NdtReport {
  id: string;
  orgId: string;
  projectId: string;
  unitId: string;
  contractId: string;
  reportCode: string;
  method: NdtMethod;
  jointIds: string[];
  circuitOrLine?: string;
  instrumentAssetId: string;
  instrumentTag: string;
  instrumentCalibrationDueDate?: string;
  testPressureBar?: number;
  testFluid?: string;
  durationMinutes?: number;
  acceptanceCriteria: string;
  result: 'aprovado' | 'reprovado';
  inspectorName: string;
  inspectedAt: string;
  storagePath?: string;
  notes?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export type ItpInspectionPointType = 'H' | 'W' | 'R'; // Hold, Witness, Review

export interface ItpStep {
  id: string;
  stepNumber: string;
  activity: string;
  discipline: string;
  acceptanceCriteria: string;
  pointType: ItpInspectionPointType;
  status: 'pendente' | 'liberado' | 'reprovado';
  evidenceRef?: string;
  verifiedByName?: string;
  verifiedAt?: string;
}

export interface QualityItpMatrix {
  id: string;
  orgId: string;
  projectId: string;
  contractId: string;
  code: string;
  title: string;
  revision: string;
  steps: ItpStep[];
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataBookBlocker {
  category: 'solda' | 'end' | 'certificado' | 'itp' | 'engenharia' | 'qualidade';
  code: string;
  message: string;
  refId?: string;
}

export interface ProjectDataBookReport {
  projectId: string;
  orgId: string;
  generatedAt: string;
  completenessPercent: number;
  readyForRelease: boolean;
  counts: {
    engineeringDocsTotal: number;
    engineeringDocsApproved: number;
    weldJointsTotal: number;
    weldJointsApproved: number;
    ndtReportsTotal: number;
    ndtReportsApproved: number;
    materialLotsTotal: number;
    materialLotsWithCertificate: number;
    itpHoldPointsTotal: number;
    itpHoldPointsReleased: number;
    openQualityNcs: number;
  };
  blockers: DataBookBlocker[];
}
