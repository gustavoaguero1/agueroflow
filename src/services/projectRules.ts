import {
  PROJECT_DISCIPLINES,
  PROJECT_STATUSES,
  type Project,
  type ProjectBudgetBaseline,
  type ProjectDiscipline,
  type ProjectStatus,
} from '../types/project';

export interface CreateProjectInput {
  id?: string;
  orgId: string;
  code: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  clientId?: string;
  clientName?: string;
  contractId: string;
  unitId: string;
  costCenterId?: string;
  proposalId?: string;
  proposalCode?: string;
  disciplines?: ProjectDiscipline[];
  managerUid?: string;
  managerName?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  budgetBaseline?: ProjectBudgetBaseline;
  createdByUid: string;
  createdByName: string;
}

export interface UpdateProjectInput {
  code?: string;
  name?: string;
  description?: string;
  status?: ProjectStatus;
  clientId?: string;
  clientName?: string;
  contractId?: string;
  unitId?: string;
  costCenterId?: string | null;
  disciplines?: ProjectDiscipline[];
  managerUid?: string;
  managerName?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,180}$/;
const PROJECT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/;

function isValidIsoDate(val: string | undefined): boolean {
  if (!val) return true;
  if (!ISO_DATE_RE.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function normalizeProjectCode(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

export function buildProjectId(orgId: string, code: string, suffix?: string): string {
  const safeOrg = String(orgId).replace(/[^A-Za-z0-9_-]/g, '_');
  const safeCode = normalizeProjectCode(code).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
  const tail = suffix || Date.now().toString(36);
  return `prj_${safeOrg}_${safeCode}_${tail}`;
}

export function validateBudgetBaseline(baseline: ProjectBudgetBaseline): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(baseline.version) || baseline.version < 1) {
    errors.push('Versão do orçamento-base deve ser um inteiro positivo.');
  }
  if (!baseline.frozenAt || Number.isNaN(Date.parse(baseline.frozenAt))) {
    errors.push('Data de congelamento do orçamento-base inválida.');
  }
  if (!baseline.frozenByUid?.trim() || !baseline.frozenByName?.trim()) {
    errors.push('Responsável pelo congelamento do orçamento-base é obrigatório.');
  }
  const numericFields: Array<[string, number | undefined]> = [
    ['plannedDirectCost', baseline.plannedDirectCost],
    ['plannedLaborCost', baseline.plannedLaborCost],
    ['plannedMaterialCost', baseline.plannedMaterialCost],
    ['plannedEquipmentCost', baseline.plannedEquipmentCost],
    ['plannedSubcontractCost', baseline.plannedSubcontractCost],
    ['plannedIndirectCost', baseline.plannedIndirectCost],
    ['contractedRevenue', baseline.contractedRevenue],
  ];
  for (const [label, value] of numericFields) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      errors.push(`Campo numérico inválido no orçamento-base: ${label}.`);
    }
  }
  if (!baseline.currency?.trim()) {
    errors.push('Moeda do orçamento-base é obrigatória.');
  }
  return errors;
}

export function validateProjectInput(input: CreateProjectInput): string[] {
  const errors: string[] = [];
  const orgId = (input.orgId || '').trim();
  const code = normalizeProjectCode(input.code);
  const name = (input.name || '').trim();
  const unitId = (input.unitId || '').trim();
  const contractId = (input.contractId || '').trim();
  const costCenterId = (input.costCenterId || '').trim();
  const status = input.status ?? 'planejamento';

  if (!orgId || !SAFE_ID_RE.test(orgId)) errors.push('Organização (orgId) inválida.');
  if (!code || !PROJECT_CODE_RE.test(code)) {
    errors.push('Código do projeto inválido (2 a 40 caracteres alfanuméricos, ".", "_", "/" ou "-").');
  }
  if (name.length < 3 || name.length > 180) {
    errors.push('Nome do projeto/obra deve ter entre 3 e 180 caracteres.');
  }
  if (!unitId || unitId === 'default_unit' || !SAFE_ID_RE.test(unitId)) {
    errors.push('Selecione uma unidade/planta válida da empresa (default_unit não é permitido).');
  }
  if (!contractId || !SAFE_ID_RE.test(contractId)) {
    errors.push('Vincule um contrato válido da empresa ao projeto/obra.');
  }
  if (costCenterId && !SAFE_ID_RE.test(costCenterId)) {
    errors.push('Centro de custo inválido.');
  }
  if (!PROJECT_STATUSES.includes(status)) {
    errors.push('Status de projeto inválido.');
  }
  if (input.disciplines) {
    const invalid = input.disciplines.filter((d) => !PROJECT_DISCIPLINES.includes(d));
    if (invalid.length > 0) {
      errors.push(`Disciplina(s) inválida(s): ${invalid.join(', ')}.`);
    }
  }
  if (!isValidIsoDate(input.plannedStartDate)) {
    errors.push('Data de início prevista inválida (use AAAA-MM-DD).');
  }
  if (!isValidIsoDate(input.plannedEndDate)) {
    errors.push('Data de término prevista inválida (use AAAA-MM-DD).');
  }
  if (
    input.plannedStartDate &&
    input.plannedEndDate &&
    isValidIsoDate(input.plannedStartDate) &&
    isValidIsoDate(input.plannedEndDate) &&
    input.plannedEndDate < input.plannedStartDate
  ) {
    errors.push('Data de término prevista não pode ser anterior ao início previsto.');
  }
  if (!input.createdByUid?.trim() || !input.createdByName?.trim()) {
    errors.push('Autor autenticado é obrigatório para criar o projeto/obra.');
  }
  if (input.budgetBaseline) {
    errors.push(...validateBudgetBaseline(input.budgetBaseline));
  }
  return errors;
}

export function buildProjectRecord(input: CreateProjectInput, nowIso = new Date().toISOString()): Project {
  const errors = validateProjectInput(input);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const code = normalizeProjectCode(input.code);
  const id = input.id?.trim() || buildProjectId(input.orgId.trim(), code);
  const record: Project = {
    id,
    orgId: input.orgId.trim(),
    code,
    name: input.name.trim(),
    status: input.status ?? 'planejamento',
    contractId: input.contractId.trim(),
    unitId: input.unitId.trim(),
    createdByUid: input.createdByUid.trim(),
    createdByName: input.createdByName.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (input.description?.trim()) record.description = input.description.trim();
  if (input.clientId?.trim()) record.clientId = input.clientId.trim();
  if (input.clientName?.trim()) record.clientName = input.clientName.trim();
  if (input.costCenterId?.trim()) record.costCenterId = input.costCenterId.trim();
  if (input.proposalId?.trim()) record.proposalId = input.proposalId.trim();
  if (input.proposalCode?.trim()) record.proposalCode = input.proposalCode.trim();
  if (input.disciplines && input.disciplines.length > 0) {
    record.disciplines = Array.from(new Set(input.disciplines));
  }
  if (input.managerUid?.trim()) record.managerUid = input.managerUid.trim();
  if (input.managerName?.trim()) record.managerName = input.managerName.trim();
  if (input.plannedStartDate?.trim()) record.plannedStartDate = input.plannedStartDate.trim();
  if (input.plannedEndDate?.trim()) record.plannedEndDate = input.plannedEndDate.trim();
  if (input.budgetBaseline) record.budgetBaseline = input.budgetBaseline;

  return record;
}

export function validateProjectUpdatePatch(
  existing: Pick<Project, 'plannedStartDate' | 'plannedEndDate' | 'actualStartDate' | 'actualEndDate'>,
  patch: UpdateProjectInput,
): string[] {
  const errors: string[] = [];
  if (patch.code !== undefined) {
    const code = normalizeProjectCode(patch.code);
    if (!code || !PROJECT_CODE_RE.test(code)) errors.push('Código do projeto inválido.');
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 3 || name.length > 180) {
      errors.push('Nome do projeto/obra deve ter entre 3 e 180 caracteres.');
    }
  }
  if (patch.unitId !== undefined) {
    const u = patch.unitId.trim();
    if (!u || u === 'default_unit' || !SAFE_ID_RE.test(u)) {
      errors.push('Selecione uma unidade/planta válida da empresa.');
    }
  }
  if (patch.contractId !== undefined) {
    const c = patch.contractId.trim();
    if (!c || !SAFE_ID_RE.test(c)) errors.push('Contrato inválido.');
  }
  if (patch.costCenterId !== undefined && patch.costCenterId !== null && patch.costCenterId.trim() !== '') {
    if (!SAFE_ID_RE.test(patch.costCenterId.trim())) errors.push('Centro de custo inválido.');
  }
  if (patch.status !== undefined && !PROJECT_STATUSES.includes(patch.status)) {
    errors.push('Status de projeto inválido.');
  }
  if (patch.disciplines !== undefined) {
    const invalid = patch.disciplines.filter((d) => !PROJECT_DISCIPLINES.includes(d));
    if (invalid.length > 0) errors.push(`Disciplina(s) inválida(s): ${invalid.join(', ')}.`);
  }

  const nextPlannedStart = patch.plannedStartDate !== undefined ? patch.plannedStartDate : existing.plannedStartDate;
  const nextPlannedEnd = patch.plannedEndDate !== undefined ? patch.plannedEndDate : existing.plannedEndDate;
  if (!isValidIsoDate(nextPlannedStart)) errors.push('Data de início prevista inválida.');
  if (!isValidIsoDate(nextPlannedEnd)) errors.push('Data de término prevista inválida.');
  if (nextPlannedStart && nextPlannedEnd && isValidIsoDate(nextPlannedStart) && isValidIsoDate(nextPlannedEnd) && nextPlannedEnd < nextPlannedStart) {
    errors.push('Data de término prevista não pode ser anterior ao início previsto.');
  }

  const nextActualStart = patch.actualStartDate !== undefined ? patch.actualStartDate : existing.actualStartDate;
  const nextActualEnd = patch.actualEndDate !== undefined ? patch.actualEndDate : existing.actualEndDate;
  if (!isValidIsoDate(nextActualStart)) errors.push('Data de início real inválida.');
  if (!isValidIsoDate(nextActualEnd)) errors.push('Data de término real inválida.');
  if (nextActualStart && nextActualEnd && isValidIsoDate(nextActualStart) && isValidIsoDate(nextActualEnd) && nextActualEnd < nextActualStart) {
    errors.push('Data de término real não pode ser anterior ao início real.');
  }

  return errors;
}
