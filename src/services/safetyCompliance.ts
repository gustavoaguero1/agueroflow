import type { SafetyPermitType } from '../types/safety';

export interface SafetyEmployee {
  id: string;
  orgId: string;
  name: string;
  role?: string;
  active: boolean;
  dismissalDate?: string | null;
  unitId?: string | null;
}

export interface SafetyPpeCatalogItem {
  id: string;
  orgId: string;
  name: string;
  category: string;
  caNumber: string;
  caExpiresAt: string;
  requiredForPermitTypes: SafetyPermitType[];
  active: boolean;
  notes?: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SafetyPpeMovement {
  id: string;
  orgId: string;
  employeeId: string;
  employeeName: string;
  ppeId: string;
  ppeName: string;
  eventType: 'entregue' | 'devolvido';
  movementDate: string;
  referenceMovementId?: string;
  notes?: string;
  createdByUid: string;
  createdAt?: unknown;
}

export interface SafetyTrainingCatalogItem {
  id: string;
  orgId: string;
  code: string;
  title: string;
  requiredForPermitTypes: SafetyPermitType[];
  active: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SafetyTrainingRecord {
  id: string;
  orgId: string;
  employeeId: string;
  employeeName: string;
  trainingCode: string;
  title: string;
  issueDate: string;
  expirationDate: string;
  issuingEntity?: string;
  certificateNumber?: string;
  certificateUrl?: string;
  certificateName?: string;
  notes?: string;
  createdByUid: string;
  recordedAt?: unknown;
}

export interface SafetyLegacyTrainingRecord {
  employeeId: string;
  code: string;
  title: string;
  issueDate?: string;
  expirationDate?: string;
  documentUrl?: string;
  documentName?: string;
}

export interface SafetyComplianceSnapshot {
  loading: boolean;
  employees: SafetyEmployee[];
  ppeCatalog: SafetyPpeCatalogItem[];
  ppeMovements: SafetyPpeMovement[];
  trainingCatalog: SafetyTrainingCatalogItem[];
  trainingRecords: SafetyTrainingRecord[];
  legacyTrainingRecords: SafetyLegacyTrainingRecord[];
}

export interface SafetyComplianceBlocker {
  employeeId: string;
  employeeName: string;
  category: 'cadastro' | 'treinamento' | 'epi';
  message: string;
}

export const DEFAULT_ACTIVITY_TRAINING_REQUIREMENTS: Partial<Record<SafetyPermitType, string[]>> = {
  trabalho_em_altura: ['NR-35'],
  espaco_confinado: ['NR-33'],
  eletrico: ['NR-10'],
};

export const SAFETY_PPE_CATEGORIES = [
  'Capacete', 'Calçado de segurança', 'Óculos de proteção', 'Protetor facial',
  'Luvas', 'Proteção auditiva', 'Proteção respiratória', 'Cinto paraquedista',
  'Vestimenta de proteção', 'Outro',
] as const;

function timestampValue(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value
    && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestPpeMovement(movements: SafetyPpeMovement[], employeeId: string, ppeId: string): SafetyPpeMovement | undefined {
  return movements
    .filter((item) => item.employeeId === employeeId && item.ppeId === ppeId)
    .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)
      || b.movementDate.localeCompare(a.movementDate))[0];
}

function trainingIsCurrent(record: { issueDate?: string; expirationDate?: string }, today: string): boolean {
  return Boolean(record.issueDate && record.expirationDate
    && record.issueDate <= today && record.expirationDate >= today);
}

export function evaluateEmployeeSafetyCompliance(
  snapshot: SafetyComplianceSnapshot,
  employeeId: string,
  permitType: SafetyPermitType,
  today = new Date().toISOString().slice(0, 10),
): SafetyComplianceBlocker[] {
  const employee = snapshot.employees.find((item) => item.id === employeeId);
  if (!employee) {
    return [{ employeeId, employeeName: 'Colaborador não localizado no RH', category: 'cadastro',
      message: 'O colaborador não existe no diretório oficial do RH desta empresa.' }];
  }

  const blockers: SafetyComplianceBlocker[] = [];
  if (!employee.active || employee.dismissalDate) {
    blockers.push({ employeeId, employeeName: employee.name, category: 'cadastro',
      message: 'Colaborador inativo ou desligado no RH.' });
    return blockers;
  }

  const requiredCodes = new Set([
    ...(DEFAULT_ACTIVITY_TRAINING_REQUIREMENTS[permitType] || []),
    ...snapshot.trainingCatalog
      .filter((item) => item.active && item.requiredForPermitTypes.includes(permitType))
      .map((item) => item.code.trim().toUpperCase()),
  ]);

  for (const code of requiredCodes) {
    const currentRecord = [
      ...snapshot.trainingRecords.filter((item) => item.employeeId === employeeId && item.trainingCode.toUpperCase() === code),
      ...snapshot.legacyTrainingRecords.filter((item) => item.employeeId === employeeId && item.code.toUpperCase() === code),
    ].some((item) => trainingIsCurrent(item, today));
    if (!currentRecord) {
      blockers.push({ employeeId, employeeName: employee.name, category: 'treinamento',
        message: `${code} ausente ou vencido para ${employee.name}.` });
    }
  }

  const requiredPpe = snapshot.ppeCatalog.filter((item) => (
    item.active && item.requiredForPermitTypes.includes(permitType)
  ));
  if (requiredPpe.length === 0) {
    blockers.push({ employeeId, employeeName: employee.name, category: 'epi',
      message: 'Nenhum EPI obrigatório foi configurado para esta atividade. Cadastre e vincule os EPIs antes de liberar a equipe.' });
  }

  for (const ppe of requiredPpe) {
    if (!ppe.caNumber.trim() || !ppe.caExpiresAt || ppe.caExpiresAt < today) {
      blockers.push({ employeeId, employeeName: employee.name, category: 'epi',
        message: `${ppe.name}: CA ausente ou vencido.` });
      continue;
    }
    const movement = latestPpeMovement(snapshot.ppeMovements, employeeId, ppe.id);
    if (!movement || movement.eventType !== 'entregue') {
      blockers.push({ employeeId, employeeName: employee.name, category: 'epi',
        message: `${ppe.name}: não consta como entregue ao colaborador.` });
    }
  }

  return blockers;
}

export function evaluateSafetyCrewCompliance(
  snapshot: SafetyComplianceSnapshot,
  employeeIds: string[],
  permitType: SafetyPermitType,
  today?: string,
): SafetyComplianceBlocker[] {
  const uniqueIds = [...new Set(employeeIds)];
  if (!uniqueIds.length) {
    return [{ employeeId: '', employeeName: 'Equipe não selecionada', category: 'cadastro',
      message: 'Selecione pelo menos um colaborador cadastrado no RH.' }];
  }
  if (snapshot.loading) {
    return [{ employeeId: '', employeeName: 'Dados de conformidade', category: 'cadastro',
      message: 'Aguarde a sincronização dos cadastros de EPIs e treinamentos antes de liberar a PT.' }];
  }
  return uniqueIds.flatMap((id) => evaluateEmployeeSafetyCompliance(snapshot, id, permitType, today));
}

export function legacyFieldWorkerIdForEmployee(employeeId: string): string {
  return `fw_${employeeId.replace(/^emp_/, '')}`;
}
