export type UserRole = 'Admin' | 'Gerente' | 'Supervisor' | 'Operacional' | 'Visualizador';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  /** Acesso por área ajustado pela empresa, por perfil (ver src/permissions/areas.ts). */
  areaDefaults?: Partial<Record<UserRole, Partial<Record<string, 0 | 1 | 2>>>>;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: UserRole;
  active: boolean;
  passwordHash?: string;
  passwordSet?: boolean;
  passwordSetAt?: string;
  initialPasswordSetByAdmin?: boolean;
  /** Ajuste de acesso só desta pessoa, por cima do padrão do perfil. */
  areaOverrides?: Partial<Record<string, 0 | 1 | 2>>;
  /** Muda quando o acesso da pessoa muda; o navegador renova o login ao ver a mudança. */
  areasUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  orgId: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  managerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenter {
  id: string;
  orgId: string;
  code: string;
  name: string;
  budget?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  orgId: string;
  code?: string;
  name?: string;
  title: string;
  contractNumber: string;
  reference?: string;
  description?: string;
  avatarUrl?: string;
  pdfUrl?: string;
  pdfFileName?: string;
  active?: boolean;
  partyName?: string;
  type?: 'cliente' | 'fornecedor' | 'prestador';
  startDate?: string;
  endDate?: string;
  status: 'ativo' | 'suspenso' | 'encerrado';
  value?: number;
  unitIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  orgId: string;
  unitId: string;
  tag: string;
  name: string;
  category: string;
  model?: string;
  serialNumber?: string;
  status: 'operacional' | 'em_manutencao' | 'inativo';
  location?: string;
  lastMaintenanceDate?: string;
  calibrationDueDate?: string;
  hourmeter?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderActivity {
  id: string;
  title: string;
  responsibleEmployeeId?: string;
  responsibleName?: string;
  plannedHours: number;
  actualHours?: number;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'bloqueada';
  precedenceIds?: string[];
  notes?: string;
}

export type WorkOrderTimeCategory = 'producao' | 'espera' | 'deslocamento' | 'improdutivo';

export interface WorkOrderTimeEntry {
  id: string;
  date: string;
  rhEmployeeId: string;
  employeeName: string;
  activityId?: string;
  category: WorkOrderTimeCategory;
  hours: number;
  reason?: string;
  createdByUid: string;
  createdAt: string;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  specialty: string;
  leaderName: string;
  memberCount: number;
  unitId?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderStatus =
  | 'aberto'
  | 'em_execucao'
  | 'aguardando_pecas'
  | 'concluido'
  | 'validado'
  | 'rascunho'
  | 'planejada'
  | 'agendada'
  | 'pausada'
  | 'concluida'
  | 'encerrada'
  | string;

export interface WorkOrderStatusConfig {
  id: string; // ex: 'aberto', 'em_execucao', 'aguardando_pecas', 'concluido', 'validado'
  orgId: string;
  name: string; // Ex: 'Aberto', 'Em Execução', 'Aguardando Peças', 'Concluído', 'Validado'
  description?: string;
  color: 'slate' | 'blue' | 'indigo' | 'cyan' | 'amber' | 'orange' | 'emerald' | 'purple' | 'rose' | string;
  badgeBg: string; // ex: 'bg-blue-950/70'
  badgeText: string; // ex: 'text-blue-300'
  badgeBorder?: string; // ex: 'border border-blue-800/40'
  order: number;
  isInitial?: boolean;
  isCompleted?: boolean;
  requiresNotes?: boolean;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type WorkOrderType =
  | 'preventiva'
  | 'corretiva'
  | 'emergencial'
  | 'solicitacao'
  | 'instalacao'
  | 'atendimento'
  | 'inspecao'
  | 'outros';

export type WorkOrderPriority = 'baixa' | 'media' | 'alta' | 'critica';

export interface WorkOrder {
  id: string;
  orgId: string;
  unitId: string;
  projectId?: string;
  contractId?: string;
  costCenterId?: string;
  assetId?: string;
  orderNumber: string;
  title: string;
  description: string;
  orderType?: WorkOrderType;
  type?: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  requesterId?: string;
  requesterName?: string;
  assignedTeam?: string;
  assignedTo?: string;
  assignedUsers?: string[];
  /** RH directory ids allocated for execution (used by SMS compliance gate). */
  assignedEmployeeIds?: string[];
  requiresSafetyPermit?: boolean;
  safetyPermitType?: import('./safety').SafetyPermitType;
  safetyPermitId?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  estimatedCost?: number;
  isRework?: boolean;
  reworkReason?: string;
  checklistPending?: boolean;
  checklistStatus?: string;
  specificService?: string;
  checklistTemplateId?: string;
  notes?: string;
  plannedServices?: PlannedService[];
  plannedLabor?: PlannedLabor[];
  plannedParts?: PlannedPart[];
  activities?: WorkOrderActivity[];
  timeEntries?: WorkOrderTimeEntry[];
  messageCount?: number;
  pendingQuestionCount?: number;
  lastDiscussionAt?: string;
  usedParts?: {
    itemId: string;
    itemSku: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  laborHours?: {
    laborId: string;
    laborCode: string;
    laborName: string;
    hours: number;
    hourlyRate: number;
    totalCost: number;
  }[];
  evidencePhotos?: {
    before?: string[];
    after?: string[];
  };
  /** Storage metadata for evidencePhotos (same order is not guaranteed; match by url). */
  evidencePhotoMeta?: {
    kind: 'antes' | 'depois';
    path: string;
    url: string;
    takenAt: string;
    lat: number | null;
    lng: number | null;
  }[];
  executionEvidences?: OrderExecutionEvidence[];
  executionChecklist?: OrderChecklistItem[];
  executionGps?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    capturedAt: string;
    capturedBy?: string;
  } | null;
  signatureUrl?: string;
  signedBy?: string;
  signedAt?: string;
  technicianSignatureUrl?: string;
  technicianSignaturePath?: string;
  technicianSignedBy?: string;
  technicianSignedAt?: string;
  clientSignatureUrl?: string;
  clientSignaturePath?: string;
  clientSignedBy?: string;
  clientSignedAt?: string;
  isBlockedByReservation?: boolean;
  reservationApprovalStatus?: 'pendente' | 'aprovado' | 'rejeitado';
  reservationApprovedBy?: string;
  reservationApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedService {
  id: string;
  description: string;
  category?: 'mecanica' | 'eletrica' | 'caldeiraria' | 'instrumentacao' | 'lubrificacao' | 'civil' | 'geral';
  estimatedHours: number;
  actualHours?: number;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  assignedWorker?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

export interface PlannedLabor {
  id: string;
  workerName: string;
  role: string;
  estimatedHours: number;
  actualHours: number;
  hourlyRate: number;
  totalCost: number;
  status: 'alocado' | 'em_campo' | 'finalizado';
}

export interface PlannedPart {
  id: string;
  itemId?: string;
  sku: string;
  name: string;
  quantityPlanned: number;
  quantityUsed: number;
  unit: string;
  unitPrice: number;
  totalCost: number;
  status: 'solicitado' | 'em_separacao' | 'disponivel' | 'aplicado' | 'aguardando_compra';
}

export type OrderMessageRole = 'Superior' | 'Responsavel' | 'Tecnico' | 'Supervisor' | 'Solicitante';
export type OrderMessageType = 'pergunta' | 'resposta' | 'orientacao' | 'apontamento' | 'liberacao';

export interface OrderMessage {
  id: string;
  orgId: string;
  orderId: string;
  senderId: string;
  senderName: string;
  senderRole: OrderMessageRole;
  messageType: OrderMessageType;
  content: string;
  replyToId?: string;
  replyToContent?: string;
  replyToAuthor?: string;
  resolved?: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  createdAt: string;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  userEmail: string;
  orgId: string;
  deviceId: string;
  deviceName: string;
  ip?: string;
  createdAt: string;
  expiresAt: string;
  status: 'ativo' | 'revogado';
}

export interface OrderEvent {
  id: string;
  orgId: string;
  orderId: string;
  userId: string;
  userName: string;
  eventType:
    | 'criacao'
    | 'mudanca_status'
    | 'comentario'
    | 'checklist'
    | 'inspecao'
    | 'pecas'
    | 'aprovacao'
    | 'dialogo'
    | 'planejamento'
    | 'servico'
    | string;
  description: string;
  previousStatus?: WorkOrderStatus;
  newStatus?: WorkOrderStatus;
  timestamp: string;
  meta?: Record<string, any>;
}

export interface LpuItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface LpuApproval {
  id: string;
  orgId: string;
  orderId?: string;
  orderNumber?: string;
  title: string;
  requestedBy: string;
  items: LpuItem[];
  totalValue: number;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  justification?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringOrder {
  id: string;
  orgId: string;
  unitId: string;
  assetId?: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  frequency: 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'trimestral' | 'semestral' | 'anual';
  nextRunDate: string;
  assignedTeam?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ChecklistItemType = 'sim_nao' | 'multipla_escolha' | 'texto' | 'numerico' | 'foto' | 'assinatura';

export interface ChecklistItemDef {
  id: string;
  title: string;
  description?: string;
  type: ChecklistItemType;
  options?: string[];
  required: boolean;
}

export interface ChecklistTemplate {
  id: string;
  orgId: string;
  title: string;
  description: string;
  category: string;
  items: ChecklistItemDef[];
  /** Revision number; existing templates without this field are treated as version 1. */
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItemAnswer {
  itemId: string;
  itemTitle: string;
  type: ChecklistItemType;
  value: any;
  conforme?: boolean;
  notes?: string;
}

export interface ChecklistRun {
  id: string;
  orgId: string;
  orderId?: string;
  templateId: string;
  templateTitle: string;
  unitId?: string;
  inspectorId: string;
  inspectorName: string;
  progressPercent: number;
  /** Number of explicitly negative/non-conforming answers captured at completion. */
  nonConformityCount?: number;
  hasNonConformities?: boolean;
  answers: Record<string, ChecklistItemAnswer>;
  /** Exact template revision and snapshot used for this completed execution. */
  templateVersion?: number;
  templateSnapshot?: ChecklistTemplate;
  status: 'em_andamento' | 'concluido' | 'cancelado';
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Inspection {
  id: string;
  orgId: string;
  unitId: string;
  assetId?: string;
  orderId?: string;
  title: string;
  inspectorId: string;
  inspectorName: string;
  status: 'agendada' | 'em_campo' | 'aguardando_revisao' | 'aprovada' | 'reprovada' | 'concluida';
  result: 'conforme' | 'nao_conforme' | 'pendente';
  findings: string;
  checklistRunId?: string;
  startedAt?: string;
  startedBy?: string;
  completedAt?: string;
  submittedBy?: string;
  submittedByName?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewComment?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type ItemType = 'peca' | 'servico' | 'mao_de_obra';

export interface Item {
  id: string;
  orgId: string;
  sku: string;
  code?: string;
  name: string;
  description?: string;
  type: ItemType;
  category: string;
  subcategory?: string;
  unitOfMeasure: string;
  referencePrice: number;
  basePrice?: number;
  proposedPrice?: number;
  hourlyRate?: number;
  averageCost?: number;
  manufacturer?: string;
  brand?: string;
  model?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  minStock?: number;
  maxStock?: number;
  criticalStock?: number;
  supplier?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCategory {
  id: string;
  orgId: string;
  name: string;
  type: ItemType;
  subcategories?: string[];
  createdAt: string;
}

export interface StockBalance {
  id: string;
  orgId: string;
  unitId: string;
  itemId: string;
  currentBalance: number;
  averageCost?: number;
  updatedAt: string;
}

export type StockMovementType = 'entrada' | 'saida' | 'transferencia' | 'ajuste';

export interface StockMovement {
  id: string;
  orgId: string;
  unitId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  reason: string;
  projectId?: string;
  orderId?: string;
  orderNumber?: string;
  unitCost?: number;
  totalCost?: number;
  purchaseOrderId?: string;
  purchaseOrderCode?: string;
  receiptId?: string;
  invoiceNumber?: string;
  supplierName?: string;
  sourceRef?: string;
  createdBy: string;
  userName: string;
  createdAt: string;
}

export type OccurrenceStatus = 'aberta' | 'analise' | 'acao_corretiva' | 'fechada' | 'verificacao';

export interface Occurrence {
  id: string;
  orgId: string;
  unitId: string;
  projectId?: string;
  assetId?: string;
  orderId?: string;
  linkedOrderNumber?: string;
  inspectionId?: string;
  title: string;
  description: string;
  type: 'seguranca' | 'qualidade' | 'ambiental' | 'operacional' | 'falha_equipamento';
  urgency: 'baixa' | 'media' | 'alta' | 'critica';
  status: OccurrenceStatus;
  reportedBy: string;
  assignedTo?: string;
  resolutionNotes?: string;
  deadline?: string;
  rootCauseAnalysis?: {
    ishikawaCategory: 'metodo' | 'maquina' | 'mao_de_obra' | 'material' | 'medicao' | 'meio_ambiente';
    why1?: string;
    why2?: string;
    why3?: string;
    why4?: string;
    why5?: string;
    actionPlan?: string;
    completedAt?: string;
  };
  gutScore?: {
    gravidade: number; // 1 a 5
    urgencia: number;  // 1 a 5
    tendencia: number; // 1 a 5
    total: number;     // G x U x T (1 a 125)
  };
  createdAt: string;
  updatedAt: string;
}

export interface ConstructionDailyReport {
  id: string;
  orgId: string;
  unitId: string;
  projectId?: string;
  contractId?: string;
  reportNumber: string;
  date: string;
  weather: 'ensolarado' | 'nublado' | 'chuvoso' | 'chuva_paralisante';
  workforce: {
    role: string;
    count: number;
    hours: number;
  }[];
  equipment: {
    name: string;
    quantity: number;
    operationalHours: number;
  }[];
  activitiesCompleted: string;
  impedimentsOrStoppages?: string;
  progressPercentage?: number;
  photos?: string[];
  preparedBy: string;
  /** Authenticated user who explicitly confirmed the report contents. */
  confirmedByUid?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  /** Legacy field from historical records; new RDOs do not generate a fake signature. */
  supervisorSignature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkShift {
  id: string;
  orgId: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  standardDailyHours: number;
  isNightShift?: boolean;
  description?: string;
}

export interface OvertimeCalculationRules {
  overtime50Multiplier: number; // default 1.5 (50%)
  overtime100Multiplier: number; // default 2.0 (100%)
  travelHourMultiplier: number; // default 1.0 (100% da hora normal)
  nightShiftBonusPercent: number; // default 20 (20%)
  dsrPercent: number; // Descanso Semanal Remunerado sobre HE (ex.: 20%)
  socialChargesPercent: number; // Encargos sociais complementares (ex.: 0%)
  monthlyHoursDivisor: number; // default 220 (ou 200, 180)
  standardDailyMealAllowance?: number; // default 35
  standardDailyLodgingAllowance?: number; // default 120
}

export interface NRRegulatoryCertification {
  id: string;
  nrCode: string; // Ex: NR-35, NR-33, NR-10, NR-12, NR-18, NR-06, ASO, etc.
  title: string; // Ex: Trabalho em Altura, Espaço Confinado, Eletricidade
  issueDate?: string; // Data de emissão/treinamento
  expirationDate: string; // Data de vencimento da certificação/exame
  issuingEntity?: string; // Entidade / Instrutor / Clínica
  certificateNumber?: string; // Número do registro / certificado

  // Anexo do documento digital
  documentUrl?: string; // Base64 ou URL pública
  documentName?: string; // Nome do arquivo anexado
  documentType?: string; // Tipo mime / extensão

  // Programação de notificação e alertas antes do vencimento
  alertDaysWarning: number; // Dias para alerta leve (ex: 30 dias)
  alertDaysCritical: number; // Dias para urgência média (ex: 10 dias)
  alertDaysUrgent: number; // Dias para urgência crítica (ex: 1 dia)

  notes?: string;
}

export interface FieldWorker {
  id: string;
  orgId: string;
  rhEmployeeId?: string; // vínculo com o cadastro oficial do RH
  isDemo?: boolean; // dado ilustrativo, nunca entra em apuração real
  name: string;
  cpf: string;
  whatsapp?: string;
  role: string;
  baseSalary: number;
  hourlyRate: number;
  currentSite: string;
  status: 'ativo' | 'em_ferias' | 'afastado' | 'desligado';
  admissionDate: string;
  shiftId?: string;
  shiftName?: string;
  customCalculationRules?: Partial<OvertimeCalculationRules>;
  certifications?: string[];
  nrCertifications?: NRRegulatoryCertification[];
  salaryHistory?: {
    date: string;
    previousSalary: number;
    newSalary: number;
    previousRole: string;
    newRole: string;
    reason: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkerTimeLog {
  id: string;
  orgId: string;
  workerId: string;
  workerName: string;
  role: string;
  date: string;
  siteName: string;
  projectId?: string;
  unitId?: string;
  contractId?: string;
  shiftId?: string;
  shiftName?: string;
  normalHours: number;
  overtime50Hours: number;
  overtime100Hours: number;
  travelHours: number;
  nightShiftHours: number;
  mealAllowance: number;
  lodgingAllowance: number;
  otherExpenses: number;
  hourlyRate: number;
  totalLaborCost: number;
  breakdown?: {
    baseSalaryCost: number;
    ot50Cost: number;
    ot100Cost: number;
    travelCost: number;
    nightShiftCost: number;
    dsrCost: number;
    allowancesCost: number;
  };
  notes?: string;
  activities?: string;
  registeredBy: string;
  createdAt: string;
}

export interface OrderExecutionEvidence {
  id: string;
  type: 'antes' | 'durante' | 'depois' | 'documento';
  photoUrl: string;
  caption: string;
  timestamp: string;
  takenBy: string;
  coordinates?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface OrderChecklistItem {
  id: string;
  task: string;
  isMandatory: boolean;
  status: 'pendente' | 'em_andamento' | 'concluido' | 'nao_se_aplica';
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

export interface ConstructionMilestone {
  id: string;
  orgId: string;
  projectId?: string;
  contractId?: string;
  unitId: string;
  name: string;
  orderIndex: number;
  weightPercentage: number;
  completedPercentage: number;
  status: 'nao_iniciado' | 'em_andamento' | 'concluido';
  plannedStartDate?: string;
  targetDate?: string;
  actualStartDate?: string;
  completedDate?: string;
  responsibleName?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupportTicket {
  id: string;
  orgId: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: 'duvida' | 'problema_tecnico' | 'sugestao' | 'financeiro';
  priority: 'baixa' | 'media' | 'alta' | 'critica';
  subject: string;
  message: string;
  workOrderId?: string;
  workOrderNumber?: string;
  projectId?: string;
  projectCode?: string;
  status: 'aberto' | 'em_atendimento' | 'resolvido';
  resolutionMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string;
  userEmail: string;
  module: string;
  action: string;
  targetId?: string;
  details: string;
  timestamp: string;
}

export * from './collectiveAssets';
export * from './rhPayroll';
export * from './project';
