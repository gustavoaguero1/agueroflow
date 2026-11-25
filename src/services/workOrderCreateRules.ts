import type { OrderEvent, WorkOrder, WorkOrderPriority, WorkOrderType } from '../types/index.ts';
import type { SafetyPermitType } from '../types/safety.ts';

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,180}$/;

const VALID_ORDER_TYPES: ReadonlySet<WorkOrderType> = new Set<WorkOrderType>([
  'preventiva',
  'corretiva',
  'emergencial',
  'solicitacao',
  'instalacao',
  'atendimento',
  'inspecao',
  'outros',
]);

const VALID_PRIORITIES: ReadonlySet<WorkOrderPriority> = new Set<WorkOrderPriority>([
  'baixa',
  'media',
  'alta',
  'critica',
]);

const VALID_SAFETY_PERMIT_TYPES: ReadonlySet<SafetyPermitType> = new Set([
  'trabalho_a_quente',
  'trabalho_em_altura',
  'espaco_confinado',
  'eletrico',
  'icamento',
  'abertura_de_linha',
  'geral',
]);

export interface WorkOrderCreateInput {
  id?: string;
  orgId: string;
  unitId: string;
  projectId?: string;
  contractId?: string;
  costCenterId?: string;
  assetId?: string;
  orderNumber?: string;
  title: string;
  description?: string;
  orderType: string;
  priority: string;
  status?: string;
  assignedTeam?: string;
  assignedTo?: string;
  assignedEmployeeIds?: string[];
  requiresSafetyPermit?: boolean;
  safetyPermitType?: string;
  safetyPermitId?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  estimatedHours?: number;
  estimatedCost?: number;
  isRework?: boolean;
  reworkReason?: string;
  notes?: string;
}

export interface WorkOrderCreateActor {
  uid: string;
  name: string;
}

export interface WorkOrderCreateValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: {
    unitId: string;
    projectId?: string;
    contractId?: string;
    costCenterId?: string;
    assetId?: string;
    orderNumber?: string;
    title: string;
    description: string;
    orderType: WorkOrderType;
    priority: WorkOrderPriority;
    status?: string;
    assignedTeam?: string;
    assignedTo?: string;
    assignedEmployeeIds?: string[];
    requiresSafetyPermit?: boolean;
    safetyPermitType?: SafetyPermitType;
    safetyPermitId?: string;
    scheduledStartDate?: string;
    scheduledEndDate?: string;
    estimatedHours: number;
    estimatedCost: number;
    isRework: boolean;
    reworkReason?: string;
    notes?: string;
  };
}

function cleanOptionalId(value: unknown, fieldLabel: string, errors: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (!SAFE_ID_RE.test(trimmed)) {
    errors.push(`${fieldLabel} contém formato inválido.`);
    return undefined;
  }
  return trimmed;
}

export function validateWorkOrderCreateInput(
  input: WorkOrderCreateInput,
): WorkOrderCreateValidationResult {
  const errors: string[] = [];
  const orgId = String(input.orgId || '').trim();
  if (!orgId || !SAFE_ID_RE.test(orgId)) {
    errors.push('Empresa inválida para criação de ordem de serviço.');
  }

  const unitId = String(input.unitId || '').trim();
  if (!unitId || unitId === 'default_unit' || !SAFE_ID_RE.test(unitId)) {
    errors.push('Selecione uma unidade operacional válida (default_unit não é permitido).');
  }

  const title = String(input.title || '').trim();
  if (title.length < 3 || title.length > 200) {
    errors.push('Informe um título válido entre 3 e 200 caracteres.');
  }

  const orderType = String(input.orderType || '').trim() as WorkOrderType;
  if (!VALID_ORDER_TYPES.has(orderType)) {
    errors.push('Tipo de ordem de serviço inválido.');
  }

  const priority = String(input.priority || '').trim() as WorkOrderPriority;
  if (!VALID_PRIORITIES.has(priority)) {
    errors.push('Prioridade da ordem de serviço inválida.');
  }

  const projectId = cleanOptionalId(input.projectId, 'Projeto/Obra', errors);
  const contractId = cleanOptionalId(input.contractId, 'Contrato', errors);
  const costCenterId = cleanOptionalId(input.costCenterId, 'Centro de Custo', errors);
  const assetId = cleanOptionalId(input.assetId, 'Ativo/Equipamento', errors);
  const safetyPermitId = cleanOptionalId(input.safetyPermitId, 'Permissão de Trabalho (PT)', errors);

  const rawPermitType = typeof input.safetyPermitType === 'string' ? input.safetyPermitType.trim() : '';
  let safetyPermitType: SafetyPermitType | undefined;
  if (rawPermitType) {
    if (!VALID_SAFETY_PERMIT_TYPES.has(rawPermitType as SafetyPermitType)) {
      errors.push('Tipo de Permissão de Trabalho (PT) inválido.');
    } else {
      safetyPermitType = rawPermitType as SafetyPermitType;
    }
  }

  let assignedEmployeeIds: string[] | undefined;
  if (Array.isArray(input.assignedEmployeeIds)) {
    const cleaned = Array.from(
      new Set(input.assignedEmployeeIds.map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (cleaned.some((id) => !SAFE_ID_RE.test(id))) {
      errors.push('Lista de colaboradores alocados contém identificador inválido.');
    } else if (cleaned.length > 0) {
      assignedEmployeeIds = cleaned;
    }
  }

  const estimatedHours = Number.isFinite(Number(input.estimatedHours)) ? Math.max(0, Number(input.estimatedHours)) : 0;
  const estimatedCost = Number.isFinite(Number(input.estimatedCost)) ? Math.max(0, Number(input.estimatedCost)) : 0;

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const isRework = input.isRework === true;
  const normalized = {
    unitId,
    projectId,
    contractId,
    costCenterId,
    assetId,
    orderNumber: typeof input.orderNumber === 'string' && input.orderNumber.trim() ? input.orderNumber.trim() : undefined,
    title,
    description: String(input.description || '').trim(),
    orderType,
    priority,
    status: typeof input.status === 'string' && input.status.trim() ? input.status.trim() : undefined,
    assignedTeam: typeof input.assignedTeam === 'string' && input.assignedTeam.trim() ? input.assignedTeam.trim() : undefined,
    assignedTo: typeof input.assignedTo === 'string' && input.assignedTo.trim() ? input.assignedTo.trim() : undefined,
    assignedEmployeeIds,
    requiresSafetyPermit: input.requiresSafetyPermit === true || Boolean(safetyPermitType),
    safetyPermitType,
    safetyPermitId,
    scheduledStartDate: typeof input.scheduledStartDate === 'string' && input.scheduledStartDate.trim() ? input.scheduledStartDate.trim() : undefined,
    scheduledEndDate: typeof input.scheduledEndDate === 'string' && input.scheduledEndDate.trim() ? input.scheduledEndDate.trim() : undefined,
    estimatedHours,
    estimatedCost,
    isRework,
    reworkReason: isRework && typeof input.reworkReason === 'string' && input.reworkReason.trim()
      ? input.reworkReason.trim()
      : undefined,
    notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : undefined,
  };

  return { valid: true, errors: [], normalized };
}

export function buildWorkOrderAndCreationEvent(params: {
  orderId: string;
  orgId: string;
  orderNumber: string;
  statusId: string;
  statusName: string;
  normalized: NonNullable<WorkOrderCreateValidationResult['normalized']>;
  actor: WorkOrderCreateActor;
  nowIso: string;
  canViewFinancials?: boolean;
}): { order: WorkOrder; creationEvent: OrderEvent } {
  const { orderId, orgId, orderNumber, statusId, statusName, normalized, actor, nowIso } = params;
  const order: WorkOrder = {
    id: orderId,
    orgId,
    unitId: normalized.unitId,
    ...(normalized.projectId ? { projectId: normalized.projectId } : {}),
    ...(normalized.contractId ? { contractId: normalized.contractId } : {}),
    ...(normalized.costCenterId ? { costCenterId: normalized.costCenterId } : {}),
    ...(normalized.assetId ? { assetId: normalized.assetId } : {}),
    orderNumber,
    title: normalized.title,
    description: normalized.description,
    orderType: normalized.orderType,
    priority: normalized.priority,
    status: statusId,
    requesterId: actor.uid,
    requesterName: actor.name,
    ...(normalized.assignedTeam ? { assignedTeam: normalized.assignedTeam } : {}),
    ...(normalized.assignedTo ? { assignedTo: normalized.assignedTo } : {}),
    ...(normalized.assignedEmployeeIds?.length ? { assignedEmployeeIds: normalized.assignedEmployeeIds } : {}),
    ...(normalized.requiresSafetyPermit ? { requiresSafetyPermit: true } : {}),
    ...(normalized.safetyPermitType ? { safetyPermitType: normalized.safetyPermitType } : {}),
    ...(normalized.safetyPermitId ? { safetyPermitId: normalized.safetyPermitId } : {}),
    ...(normalized.scheduledStartDate ? { scheduledStartDate: normalized.scheduledStartDate } : {}),
    ...(normalized.scheduledEndDate ? { scheduledEndDate: normalized.scheduledEndDate } : {}),
    estimatedHours: normalized.estimatedHours,
    estimatedCost: params.canViewFinancials === false ? 0 : normalized.estimatedCost,
    isRework: normalized.isRework,
    ...(normalized.reworkReason ? { reworkReason: normalized.reworkReason } : {}),
    ...(normalized.notes ? { notes: normalized.notes } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const creationEvent: OrderEvent = {
    id: `${orderId}_created`,
    orgId,
    orderId,
    userId: actor.uid,
    userName: actor.name,
    eventType: 'criacao',
    description: `Demanda / OS ${orderNumber} cadastrada no estado "${statusName}".`,
    newStatus: statusId,
    timestamp: nowIso,
  };

  return { order, creationEvent };
}
