export type CollectiveAssetCondition =
  | 'ativo'
  | 'em_manutencao'
  | 'baixado'
  | 'active'
  | 'in_maintenance'
  | 'retired';

export type CollectiveAssetSituation =
  | 'DISPONIVEL'
  | 'EM_USO'
  | 'EM_MANUTENCAO'
  | 'BLOQUEADO'
  | 'BAIXADO';

export type CollectiveAssetAlert =
  | 'VENCIDO'
  | 'A_VENCER'
  | 'SEM_DATA'
  | 'EM_DIA'
  | 'NAO_APLICAVEL';

export type CollectiveMovementStatus =
  | 'EM_USO'
  | 'ATRASADO'
  | 'DEVOLVIDO'
  | 'em_uso'
  | 'atrasado'
  | 'devolvido';

export type CollectiveReturnCondition =
  | 'ok'
  | 'danificado'
  | 'faltando_acessorio'
  | 'precisa_manutencao'
  | 'damaged'
  | 'missing_accessory'
  | 'needs_maintenance';

export type CollectiveServiceType =
  | 'manutencao_preventiva'
  | 'manutencao_corretiva'
  | 'calibracao'
  | 'preventive_maintenance'
  | 'corrective_maintenance'
  | 'calibration';

export type CollectiveServiceResult =
  | 'aprovado'
  | 'aprovado_com_ajuste'
  | 'reprovado'
  | 'approved'
  | 'approved_with_adjustment'
  | 'disapproved';

export type CollectiveAssetServiceType = CollectiveServiceType;
export type CollectiveAssetServiceResult = CollectiveServiceResult;

export interface CollectiveAssetCategory {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  preventiveMaintenanceIntervalMonths?: number | null; // 0 to 120 (0 or undefined = N/A)
  preventiveMaintenancePeriodMonths?: number | null; // alias
  calibrationIntervalMonths?: number | null; // 0 to 120 (0 or undefined = N/A)
  calibrationPeriodMonths?: number | null; // alias
  warningDays?: number; // 0 to 120, default 30
  warningDaysBeforeExpiration?: number; // alias
  active: boolean; // Cannot hard delete if linked to assets; use inactivation
  isActive?: boolean; // alias
  createdAt: string;
  updatedAt: string;
}

export interface CollectiveAsset {
  id: string;
  orgId: string;
  unitId?: string;
  code: string; // Unique within organization
  description: string;
  categoryId: string;
  categoryName?: string;
  brandModel?: string;
  serialNumber?: string; // Patrimônio / Série
  storageLocation?: string; // Local de guarda
  condition: CollectiveAssetCondition; // Informada: ativo, em_manutencao, baixado
  overrideMaintenanceIntervalMonths?: number | null; // null/empty: herda categoria; 0: desativa; >0: sobrescreve
  overrideCalibrationIntervalMonths?: number | null; // null/empty: herda categoria; 0: desativa; >0: sobrescreve
  notes?: string;
  attachments?: Array<{
    url: string;
    name: string;
    type?: string;
    uploadedAt: string;
  }>;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;

  // Campos calculados dinamicamente em runtime
  situation?: CollectiveAssetSituation;
  currentCheckout?: {
    movementId: string;
    workerId: string;
    workerName: string;
    workerRegistration: string;
    checkoutDate: string;
    isLate: boolean;
  } | null;
  lastMaintenanceDate?: string | null;
  nextMaintenanceDate?: string | null;
  lastCalibrationDate?: string | null;
  nextCalibrationDate?: string | null;
  nextDueDate?: string | null;
  nextExpirationDate?: string | null; // alias
  daysRemaining?: number | null;
  alert?: CollectiveAssetAlert;
  alertLevel?: CollectiveAssetAlert; // alias
  effectiveWarningDays?: number;
  currentSituation?: CollectiveAssetSituation; // alias
  currentHolderName?: string; // alias
}

export interface CollectiveAssetWorker {
  id: string;
  orgId: string;
  registrationNumber: string; // Matrícula única na org
  registration?: string; // alias
  name: string;
  department: string; // Setor
  sector?: string; // alias
  role: string; // Função
  contactPhone?: string; // Telefone / Contato
  active: boolean; // Inativo impede novas retiradas
  isActive?: boolean; // alias
  notes?: string;
  linkedUserId?: string; // Vínculo explícito com usuário se houver
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectiveAssetMovement {
  id: string;
  orgId: string;
  unitId?: string;
  contractId?: string;
  assetId: string;
  assetCode: string;
  assetDescription: string;
  workerId: string;
  workerName: string;
  workerRegistration: string;
  checkoutDate: string; // ISO string DD/MM/AAAA HH:mm
  checkoutNotes?: string;
  releasedBy: string; // Usuário do AgueroFlow que liberou
  expectedReturnDate?: string; // Previsão opcional
  returnDate?: string | null; // ISO string
  returnCondition?: CollectiveReturnCondition | null;
  receivedBy?: string | null; // Usuário que recebeu
  returnNotes?: string | null;
  returnAttachments?: Array<{
    url: string;
    name: string;
    type?: string;
    uploadedAt: string;
  }>;
  status: CollectiveMovementStatus;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectiveAssetService {
  id: string;
  orgId: string;
  unitId?: string;
  assetId: string;
  assetCode: string;
  assetDescription?: string; // alias
  serviceDate: string; // YYYY-MM-DD (não permite data futura)
  type: CollectiveServiceType;
  serviceType?: CollectiveServiceType; // alias
  performer: string; // Empresa / técnico executante
  performedBy?: string; // alias
  certificateOrOsNumber?: string;
  certificateOrOrderNumber?: string; // alias
  result: CollectiveServiceResult;
  notes?: string;
  attachmentUrl?: string; // alias
  attachments?: Array<{
    url: string;
    name: string;
    type?: string;
    uploadedAt: string;
  }>;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectiveAssetPolicy {
  orgId: string;
  organizationId?: string; // alias
  blockOnNoHistory: boolean; // Se 'SEM DATA REGISTRADA' bloqueia retirada (default: false)
  blockCheckoutOnMissingHistory?: boolean; // alias
  defaultWarningDays: number; // default: 30
  defaultWarningDaysBeforeExpiration?: number; // alias
  updatedAt?: string;
  updatedBy?: string;
}

export type CollectiveAssetCalculations = CollectiveAsset;
export type CollectiveAssetReturnCondition = CollectiveReturnCondition;

// ==========================================
// FUNÇÕES MATEMÁTICAS E DE CÁLCULO
// ==========================================

/**
 * Adiciona N meses a uma data respeitando o calendário (EDATE do Excel).
 * Ex: 31/01 + 1 mês = 28 ou 29/02; 31/08 + 1 mês = 30/09.
 */
export function addMonthsCalendar(dateStr: string, monthsToAdd: number): string {
  if (!dateStr || monthsToAdd <= 0) return '';
  const [yearStr, monthStr, dayStr] = dateStr.split('T')[0].split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  const day = parseInt(dayStr, 10);

  const targetDate = new Date(year, month + monthsToAdd, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

  // Quantidade de dias no mês alvo
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  const y = targetYear;
  const m = String(targetMonth + 1).padStart(2, '0');
  const d = String(clampedDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retorna a diferença em dias entre a data alvo e hoje (em dias inteiros no fuso local).
 */
export function calculateDaysRemaining(targetDateStr: string, referenceDate = new Date()): number {
  if (!targetDateStr) return 0;
  const todayStr = referenceDate.toISOString().split('T')[0];
  const [tY, tM, tD] = targetDateStr.split('T')[0].split('-').map(Number);
  const [rY, rM, rD] = todayStr.split('-').map(Number);

  const utcTarget = Date.UTC(tY, tM - 1, tD);
  const utcToday = Date.UTC(rY, rM - 1, rD);

  const diffMs = utcTarget - utcToday;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calcula situação, datas de vencimento e status de alerta para um bem.
 */
export function computeCollectiveAssetCalculations(
  asset: CollectiveAsset,
  category: CollectiveAssetCategory | undefined,
  services: CollectiveAssetService[],
  openMovement: CollectiveAssetMovement | undefined,
  policy: CollectiveAssetPolicy | undefined
): CollectiveAsset {
  // 1. Determina periodicidade efetiva de Manutenção Preventiva
  let maintInterval = 0;
  if (asset.overrideMaintenanceIntervalMonths !== undefined && asset.overrideMaintenanceIntervalMonths !== null) {
    maintInterval = asset.overrideMaintenanceIntervalMonths;
  } else if (category && category.preventiveMaintenanceIntervalMonths !== undefined && category.preventiveMaintenanceIntervalMonths !== null) {
    maintInterval = category.preventiveMaintenanceIntervalMonths;
  }
  const maintApplicable = maintInterval > 0;

  // 2. Determina periodicidade efetiva de Calibração
  let calibInterval = 0;
  if (asset.overrideCalibrationIntervalMonths !== undefined && asset.overrideCalibrationIntervalMonths !== null) {
    calibInterval = asset.overrideCalibrationIntervalMonths;
  } else if (category && category.calibrationIntervalMonths !== undefined && category.calibrationIntervalMonths !== null) {
    calibInterval = category.calibrationIntervalMonths;
  }
  const calibApplicable = calibInterval > 0;

  // 3. Antecedência de alerta
  const warningDays = category?.warningDays ?? policy?.defaultWarningDays ?? 30;

  // 4. Última manutenção preventiva válida (aprovado ou aprovado_com_ajuste)
  const validMaints = services
    .filter(
      (s) =>
        s.assetId === asset.id &&
        s.type === 'manutencao_preventiva' &&
        (s.result === 'aprovado' || s.result === 'aprovado_com_ajuste')
    )
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));

  const lastMaint = validMaints[0];
  const lastMaintenanceDate = lastMaint ? lastMaint.serviceDate : null;
  const nextMaintenanceDate =
    maintApplicable && lastMaintenanceDate
      ? addMonthsCalendar(lastMaintenanceDate, maintInterval)
      : null;

  // 5. Última calibração aprovada (aprovado ou aprovado_com_ajuste)
  const validCalibs = services
    .filter(
      (s) =>
        s.assetId === asset.id &&
        s.type === 'calibracao' &&
        (s.result === 'aprovado' || s.result === 'aprovado_com_ajuste')
    )
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));

  const lastCalib = validCalibs[0];
  const lastCalibrationDate = lastCalib ? lastCalib.serviceDate : null;
  const nextCalibrationDate =
    calibApplicable && lastCalibrationDate
      ? addMonthsCalendar(lastCalibrationDate, calibInterval)
      : null;

  // 6. Próximo Vencimento (menor data entre próxima manutenção e próxima calibração)
  let nextDueDate: string | null = null;
  if (nextMaintenanceDate && nextCalibrationDate) {
    nextDueDate = nextMaintenanceDate < nextCalibrationDate ? nextMaintenanceDate : nextCalibrationDate;
  } else if (nextMaintenanceDate) {
    nextDueDate = nextMaintenanceDate;
  } else if (nextCalibrationDate) {
    nextDueDate = nextCalibrationDate;
  }

  // 7. Dias Restantes
  const daysRemaining = nextDueDate ? calculateDaysRemaining(nextDueDate) : null;

  // 8. Determina Alerta
  let alert: CollectiveAssetAlert = 'NAO_APLICAVEL';
  const hasApplicableControl = maintApplicable || calibApplicable;

  if (asset.condition === 'baixado') {
    alert = 'NAO_APLICAVEL';
  } else if (!hasApplicableControl) {
    alert = 'NAO_APLICAVEL';
  } else {
    const maintMissing = maintApplicable && !lastMaintenanceDate;
    const calibMissing = calibApplicable && !lastCalibrationDate;
    const hasMissingHistory = maintMissing || calibMissing;

    // Checagem de vencimento calculável
    const isPastDue = daysRemaining !== null && daysRemaining < 0;

    // Regra de prioridade: Se coexistirem vencimento passado e falta de histórico, priorizar VENCIDO
    if (isPastDue) {
      alert = 'VENCIDO';
    } else if (hasMissingHistory) {
      alert = 'SEM_DATA';
    } else if (daysRemaining !== null) {
      if (daysRemaining <= warningDays) {
        alert = 'A_VENCER'; // Inclusive dia do vencimento (0 dias)
      } else {
        alert = 'EM_DIA';
      }
    } else {
      alert = 'NAO_APLICAVEL';
    }
  }

  // 9. Situação do Bem
  let situation: CollectiveAssetSituation = 'DISPONIVEL';
  const todayStr = new Date().toISOString().split('T')[0];

  let currentCheckout: CollectiveAsset['currentCheckout'] = null;
  if (openMovement && !openMovement.returnDate) {
    const moveDateStr = openMovement.checkoutDate.split('T')[0];
    const isLate = moveDateStr < todayStr;
    currentCheckout = {
      movementId: openMovement.id,
      workerId: openMovement.workerId,
      workerName: openMovement.workerName,
      workerRegistration: openMovement.workerRegistration,
      checkoutDate: openMovement.checkoutDate,
      isLate,
    };
  }

  if (currentCheckout) {
    situation = 'EM_USO';
  } else if (asset.condition === 'em_manutencao') {
    situation = 'EM_MANUTENCAO';
  } else if (asset.condition === 'baixado') {
    situation = 'BAIXADO';
  } else if (alert === 'VENCIDO') {
    situation = 'BLOQUEADO';
  } else if (alert === 'SEM_DATA' && policy?.blockOnNoHistory) {
    situation = 'BLOQUEADO';
  } else {
    situation = 'DISPONIVEL';
  }

  return {
    ...asset,
    situation,
    currentCheckout,
    lastMaintenanceDate,
    nextMaintenanceDate,
    lastCalibrationDate,
    nextCalibrationDate,
    nextDueDate,
    daysRemaining,
    alert,
    effectiveWarningDays: warningDays,
  };
}
