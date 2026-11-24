/**
 * Acesso por área. Cada pessoa tem, em cada área, 0 (sem acesso), 1 (ver) ou 2 (editar).
 * O perfil dá o padrão; a empresa pode mudar o padrão de cada perfil; o Admin pode ajustar por pessoa.
 * Usado pelo navegador (menu) e pelo servidor (token de login e rotas). Funções puras.
 */
import type { UserRole } from '../types';

export const AREA_IDS = [
  'painel', 'operacoes', 'estoque', 'comercial', 'financeiro', 'rh',
  'whatsapp', 'relatorios', 'estrutura', 'configuracoes', 'suporte',
] as const;
export type AreaId = (typeof AREA_IDS)[number];
export type AreaLevel = 0 | 1 | 2;
export type AreaLevels = Record<AreaId, AreaLevel>;
export type AreaOverrides = Partial<Record<AreaId, AreaLevel>>;

export const LEVEL_LABELS: Record<AreaLevel, string> = { 0: 'Sem acesso', 1: 'Ver', 2: 'Editar' };

/** Seções do menu de cada área (a seção é o nome ou começa com "nome-"). */
export const AREAS: Array<{ id: AreaId; label: string; description: string; sections: string[] }> = [
  { id: 'painel', label: 'Painel', description: 'Visão geral e pendências. Todo mundo vê.', sections: ['painel'] },
  { id: 'operacoes', label: 'Operações', description: 'OS, checklists, inspeções, ocorrências, obras e RDO, diário, viagens, reembolsos e bens coletivos.', sections: ['ordens', 'checklists', 'inspecoes', 'ocorrencias', 'operacoes', 'ops', 'obras', 'viagens', 'bens'] },
  { id: 'estoque', label: 'Estoque e compras', description: 'Peças e serviços, estoque e compras.', sections: ['pecas', 'estoque', 'compras'] },
  { id: 'comercial', label: 'Comercial', description: 'Propostas, clientes, composições e marketing.', sections: ['comercial', 'marketing'] },
  { id: 'financeiro', label: 'Financeiro', description: 'Contas a pagar, categorias e notas fiscais.', sections: ['financeiro'] },
  { id: 'rh', label: 'RH e salários', description: 'Funcionários, salários, admissões, 13º e relatórios de RH.', sections: ['rh'] },
  { id: 'whatsapp', label: 'WhatsApp', description: 'Central de conversas, automações, NDs e recibos.', sections: ['whatsapp'] },
  { id: 'relatorios', label: 'Relatórios e IA', description: 'Relatórios gerais e assistente de IA.', sections: ['relatorios', 'ia'] },
  { id: 'estrutura', label: 'Estrutura', description: 'Unidades, equipes e organização.', sections: ['estrutura'] },
  { id: 'configuracoes', label: 'Configurações', description: 'Empresa, equipe e permissões.', sections: ['configuracoes'] },
  { id: 'suporte', label: 'Suporte', description: 'Chamados de suporte. Todo mundo usa.', sections: ['suporte'] },
];

const row = (v: number[]): AreaLevels => Object.fromEntries(AREA_IDS.map((a, i) => [a, v[i] as AreaLevel])) as AreaLevels;
//                         painel ops est com fin rh  wa  rel estr conf sup
export const ROLE_DEFAULTS: Record<UserRole, AreaLevels> = {
  Admin: row([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
  Gerente: row([2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2]),
  Supervisor: row([1, 2, 2, 1, 1, 0, 2, 1, 1, 0, 2]),
  Operacional: row([1, 2, 1, 0, 0, 0, 1, 0, 1, 0, 2]),
  Visualizador: row([1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 2]),
};

/** Áreas que todo mundo precisa ver: nunca abaixo de "ver". */
const MINIMUM: AreaOverrides = { painel: 1, suporte: 1 };

const isLevel = (v: unknown): v is AreaLevel => v === 0 || v === 1 || v === 2;

/** Nível final: perfil → padrão da empresa para o perfil → ajuste da pessoa; com os mínimos. */
export function resolveAreas(
  role: UserRole,
  orgDefaults?: Partial<Record<UserRole, AreaOverrides>> | null,
  overrides?: AreaOverrides | null,
): AreaLevels {
  const out = { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.Visualizador) };
  for (const layer of [orgDefaults?.[role], overrides]) {
    for (const a of AREA_IDS) {
      const v = layer?.[a];
      if (isLevel(v)) out[a] = v;
    }
  }
  for (const a of AREA_IDS) {
    const min = MINIMUM[a];
    if (min !== undefined && out[a] < min) out[a] = min;
  }
  if (role === 'Admin') out.configuracoes = 2; // Admin não se tranca para fora
  return out;
}

export function areaOfSection(section: string): AreaId | null {
  const s = String(section || '');
  for (const area of AREAS) {
    if (area.sections.some((k) => s === k || s.startsWith(`${k}-`))) return area.id;
  }
  return null;
}

/** Seção aparece no menu se a área dela tiver pelo menos "ver" (seção sem área: sempre). */
export function canSeeSection(section: string, levels: AreaLevels | null | undefined): boolean {
  const a = areaOfSection(section);
  if (!a || !levels) return true;
  return levels[a] >= 1;
}
