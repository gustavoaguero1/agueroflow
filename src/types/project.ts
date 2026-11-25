export type ProjectStatus =
  | 'planejamento'
  | 'mobilizacao'
  | 'em_execucao'
  | 'paralisado'
  | 'concluido'
  | 'encerrado'
  | 'cancelado';

export type ProjectDiscipline =
  | 'montagem_industrial'
  | 'tubulacao'
  | 'caldeiraria'
  | 'mecanica'
  | 'eletrica'
  | 'instrumentacao'
  | 'civil'
  | 'manutencao'
  | 'comissionamento'
  | 'outros';

export interface ProjectBudgetBaseline {
  version: number;
  frozenAt: string;
  frozenByUid: string;
  frozenByName: string;
  sourceProposalId?: string;
  sourceProposalCode?: string;
  plannedDirectCost: number;
  plannedLaborCost?: number;
  plannedMaterialCost?: number;
  plannedEquipmentCost?: number;
  plannedSubcontractCost?: number;
  plannedIndirectCost?: number;
  contractedRevenue: number;
  currency: string;
  notes?: string;
}

/**
 * Entidade mestre Projeto/Obra: eixo de gestão de execução, cronograma, custos e resultado.
 * Contrato representa o compromisso comercial/jurídico; Unidade representa a planta/local.
 */
export interface Project {
  id: string;
  orgId: string;
  code: string;
  name: string;
  description?: string;
  status: ProjectStatus;
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
  actualStartDate?: string;
  actualEndDate?: string;
  budgetBaseline?: ProjectBudgetBaseline;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'planejamento',
  'mobilizacao',
  'em_execucao',
  'paralisado',
  'concluido',
  'encerrado',
  'cancelado',
] as const;

export const PROJECT_DISCIPLINES: readonly ProjectDiscipline[] = [
  'montagem_industrial',
  'tubulacao',
  'caldeiraria',
  'mecanica',
  'eletrica',
  'instrumentacao',
  'civil',
  'manutencao',
  'comissionamento',
  'outros',
] as const;
