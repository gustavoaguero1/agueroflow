import type { AreaId, AreaLevel } from '../permissions/areas.ts';
import type { UserRole } from '../types/index.ts';

export type DashboardPersona = 'gestao' | 'campo' | 'financeiro' | 'compras' | 'rh';

export interface DashboardPersonaMeta {
  id: DashboardPersona;
  label: string;
  description: string;
}

export const DASHBOARD_PERSONA_CATALOG: Record<DashboardPersona, DashboardPersonaMeta> = {
  gestao: {
    id: 'gestao',
    label: 'Visão Executiva',
    description: 'Consolidado operacional, cobertura de dados e separação econômica.',
  },
  campo: {
    id: 'campo',
    label: 'Campo & OS',
    description: 'Ordens em execução, atrasos, checklists e pendências de SMS.',
  },
  financeiro: {
    id: 'financeiro',
    label: 'Financeiro',
    description: 'Contas a vencer, medições aprovadas aguardando faturamento e caixa.',
  },
  compras: {
    id: 'compras',
    label: 'Compras & Estoque',
    description: 'RCs pendentes, estoque crítico, reservas e OCs aguardando alçada.',
  },
  rh: {
    id: 'rh',
    label: 'RH & Conformidade',
    description: 'Colaboradores ativos, NRs vencendo e pendências cadastrais.',
  },
};

export function getAvailableDashboardPersonas(params: {
  areaLevels: Partial<Record<AreaId, AreaLevel>>;
  role?: UserRole | string;
  isMaster?: boolean;
}): DashboardPersona[] {
  const { areaLevels, role, isMaster } = params;
  const lvl = (area: AreaId): number => (isMaster ? 2 : Number(areaLevels[area] ?? 0));
  const out: DashboardPersona[] = [];

  if (isMaster || role === 'Admin' || role === 'Gerente' || role === 'Supervisor') {
    out.push('gestao');
  }
  if (lvl('operacoes') >= 1) out.push('campo');
  if (lvl('financeiro') >= 1) out.push('financeiro');
  if (lvl('estoque') >= 1) out.push('compras');
  if (lvl('rh') >= 1) out.push('rh');

  if (out.length === 0) out.push('campo');
  return out;
}

export function resolveDefaultDashboardPersona(params: {
  areaLevels: Partial<Record<AreaId, AreaLevel>>;
  role?: UserRole | string;
  isMaster?: boolean;
}): DashboardPersona {
  const available = getAvailableDashboardPersonas(params);
  if (params.isMaster || params.role === 'Admin' || params.role === 'Gerente') {
    return 'gestao';
  }
  if (available.length === 1) return available[0];
  // Non-management specialist: prioritize their primary specialized area if they do not have full management role
  const lvl = (area: AreaId): number => Number(params.areaLevels[area] ?? 0);
  if (lvl('financeiro') >= 2 && lvl('operacoes') < 2) return 'financeiro';
  if (lvl('rh') >= 2 && lvl('operacoes') < 2) return 'rh';
  if (lvl('estoque') >= 2 && lvl('operacoes') < 2) return 'compras';
  if (available.includes('campo')) return 'campo';
  return available[0];
}
