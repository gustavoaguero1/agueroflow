import { areaOfSection, type AreaLevels } from './areas';
import type { UserRole } from '../types';

export type ModuleAccessLevel = 0 | 1 | 2 | 3 | 4;
export type ModuleAccessOverrides = Partial<Record<string, ModuleAccessLevel>>;
export type ModuleAccessDefaults = Partial<Record<UserRole, ModuleAccessOverrides>>;

export const MODULE_ACCESS_LABELS: Record<ModuleAccessLevel, string> = {
  0: 'Sem acesso',
  1: 'Consulta',
  2: 'Operar',
  3: 'Aprovar',
  4: 'Administrar',
};

/** Todas as seções navegáveis. O mesmo catálogo alimenta menu, tela de permissões e autorização. */
export const MODULE_PERMISSIONS = [
  ['painel', 'Painel', 'Painel'],
  ['ordens', 'Ordens de Serviço', 'Ordens'],
  ['ordens-aprovacoes', 'Aprovações LPU', 'Ordens'],
  ['ordens-recorrencias', 'Ordens recorrentes', 'Ordens'],
  ['checklists', 'Checklists', 'Campo'],
  ['inspecoes', 'Inspeções', 'Campo'],
  ['pecas-catalogo', 'Peças', 'Peças e Serviços'],
  ['servicos-catalogo', 'Serviços', 'Peças e Serviços'],
  ['mao-de-obra', 'Mão de Obra (HxH)', 'Peças e Serviços'],
  ['subcategorias-servicos', 'Subcategorias e gestão', 'Peças e Serviços'],
  ['estoque', 'Estoque', 'Estoque e Compras'],
  ['ocorrencias', 'Ocorrências', 'Campo'],
  ['relatorios', 'Relatórios', 'Relatórios e IA'],
  ['suporte', 'Suporte', 'Suporte'],
  ['ia', 'AgueroFlow IA', 'Relatórios e IA'],
  ['configuracoes', 'Configurações', 'Configurações'],
  ['whatsapp-central', 'Central WhatsApp e OCR', 'WhatsApp'],
  ['whatsapp-nds', 'Automação NDs e Outlook', 'WhatsApp'],
  ['whatsapp-comandos', 'Comandos programados', 'WhatsApp'],
  ['estrutura', 'Visão geral e unidades', 'Estrutura'],
  ['contratos', 'Contratos', 'Estrutura'],
  ['auditoria', 'Auditoria e logs', 'Estrutura'],
  ['ops-inicio', 'Painel de Operações', 'Operações'],
  ['ops-direcionar', 'Gerenciamento de operações', 'Operações'],
  ['obras', 'Obras e RDO', 'Operações'],
  ['obras-medicoes', 'Medições e Boletins (BM)', 'Operações'],
  ['ops-diario', 'Diário de obras', 'Operações'],
  ['ops-viagem', 'Hora viagem', 'Operações'],
  ['viagens-painel', 'Passagens e solicitações', 'Viagens'],
  ['viagens-busca', 'Busca de viagens', 'Viagens'],
  ['viagens-resultados', 'Resultados de viagens', 'Viagens'],
  ['viagens-historico', 'Histórico de viagens', 'Viagens'],
  ['viagens-solicitacoes', 'Solicitações de viagens', 'Viagens'],
  ['viagens-reembolsos', 'Reembolsos', 'Operações'],
  ['viagens-configuracoes', 'Configurações de viagens', 'Viagens'],
  ['ops-reembolso', 'Reembolso operacional', 'Operações'],
  ['ops-contratacao', 'Contratação', 'Operações'],
  ['ops-tarefas', 'Auxiliares', 'Operações'],
  ['ops-gases', 'Controle de gases', 'Operações'],
  ['ops-base', 'Base de dados', 'Operações'],
  ['ops-config', 'Configurações de Operações', 'Operações'],
  ['bens-painel', 'Painel de Bens Coletivos', 'Bens Coletivos'],
  ['bens-lista', 'Bens', 'Bens Coletivos'],
  ['bens-movimentacoes', 'Retiradas e devoluções', 'Bens Coletivos'],
  ['bens-manutencoes', 'Manutenção e calibração', 'Bens Coletivos'],
  ['bens-categorias', 'Categorias', 'Bens Coletivos'],
  ['bens-colaboradores', 'Colaboradores', 'Bens Coletivos'],
  ['bens-relatorios', 'Relatórios de bens', 'Bens Coletivos'],
  ['rh-painel', 'Painel RH e Salários', 'RH'],
  ['rh-funcionarios', 'Funcionários', 'RH'],
  ['rh-pendencias', 'Pendências legadas', 'RH'],
  ['rh-admissoes', 'Admissão digital', 'RH'],
  ['rh-importacao', 'Importação de planilha', 'RH'],
  ['rh-calculo', 'Cálculo do 13º', 'RH'],
  ['rh-historico', 'Histórico de cálculos', 'RH'],
  ['rh-relatorios', 'Relatórios de RH', 'RH'],
  ['rh-holerites', 'Demonstrativos e holerites', 'RH'],
  ['rh-ponto', 'Ponto eletrônico', 'RH'],
  ['comercial-painel', 'Painel de propostas', 'Comercial'],
  ['comercial-funil', 'Funil de vendas', 'Comercial'],
  ['comercial-nova', 'Nova proposta', 'Comercial'],
  ['comercial-composicao', 'Composição de custos', 'Comercial'],
  ['comercial-revisao', 'Revisão de BOM', 'Comercial'],
  ['comercial-comunicacao', 'Comunicação WhatsApp', 'Comercial'],
  ['comercial-importacoes', 'Importações', 'Comercial'],
  ['comercial-materiais', 'Materiais e preços', 'Comercial'],
  ['comercial-configuracoes', 'Configurações comerciais', 'Comercial'],
  ['comercial-relatorios', 'Relatórios comerciais', 'Comercial'],
  ['compras-painel', 'Painel de compras', 'Estoque e Compras'],
  ['compras-requisicoes', 'Requisições (RC)', 'Estoque e Compras'],
  ['compras-cotacoes', 'Mapa 3-Bid de cotações', 'Estoque e Compras'],
  ['compras-tomada-precos', 'Tomada de preços', 'Estoque e Compras'],
  ['compras-pedidos', 'Ordens de compra (OC)', 'Estoque e Compras'],
  ['compras-historico', 'Histórico de compras', 'Estoque e Compras'],
  ['compras-inteligencia', 'Inteligência de fornecedores', 'Estoque e Compras'],
  ['compras-fornecedores', 'Fornecedores', 'Estoque e Compras'],
  ['compras-recebimento', 'Recebimento e corrida', 'Estoque e Compras'],
  ['financeiro-notas', 'Caixa de notas', 'Financeiro'],
  ['financeiro-pagar', 'Contas a pagar', 'Financeiro'],
  ['financeiro-receber', 'Contas a receber', 'Financeiro'],
  ['financeiro-plano', 'Plano de contas', 'Financeiro'],
  ['marketing-painel', 'Visão geral de Marketing', 'Marketing'],
  ['marketing-calendario', 'Calendário e radar IA', 'Marketing'],
  ['marketing-campanhas', 'Campanhas', 'Marketing'],
  ['marketing-eventos', 'Eventos corporativos', 'Marketing'],
  ['marketing-estudio', 'Estúdio criativo', 'Marketing'],
  ['marketing-conteudo-obras', 'Obras em conteúdo', 'Marketing'],
  ['marketing-biblioteca', 'Identidade visual', 'Marketing'],
  ['marketing-desempenho', 'Desempenho e tráfego', 'Marketing'],
  ['marketing-configuracoes', 'Configurações de Marketing', 'Marketing'],
] as const satisfies ReadonlyArray<readonly [string, string, string]>;

export type ModulePermissionId = (typeof MODULE_PERMISSIONS)[number][0];
export const MODULE_PERMISSION_ID_LIST: readonly string[] = MODULE_PERMISSIONS.map(([id]) => id);
const MODULE_PERMISSION_IDS = new Set<string>(MODULE_PERMISSION_ID_LIST);

export const MODULE_PERMISSION_DETAILS = MODULE_PERMISSIONS.map(([id, label, group]) => ({
  id, label, group, area: areaOfSection(id),
}));

const validLevel = (value: unknown): value is ModuleAccessLevel =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function sanitizeModuleOverrides(value: unknown): ModuleAccessOverrides {
  if (!isObject(value)) return {};
  const out: ModuleAccessOverrides = {};
  for (const [id] of MODULE_PERMISSIONS) {
    if (validLevel(value[id])) out[id] = value[id] as ModuleAccessLevel;
  }
  return out;
}

export function sanitizeModuleDefaults(value: unknown): ModuleAccessDefaults {
  if (!isObject(value)) return {};
  const out: ModuleAccessDefaults = {};
  for (const role of ['Admin', 'Gerente', 'Supervisor', 'Operacional', 'Visualizador'] as UserRole[]) {
    if (role in value) out[role] = sanitizeModuleOverrides(value[role]);
  }
  return out;
}

export function resolveModuleLevel(
  section: string,
  role: UserRole,
  areas: AreaLevels,
  orgDefaults?: ModuleAccessDefaults | null,
  userOverrides?: ModuleAccessOverrides | null,
): ModuleAccessLevel {
  if (!MODULE_PERMISSION_IDS.has(section)) return 0;
  const userValue = userOverrides?.[section];
  if (validLevel(userValue)) return userValue;
  const orgValue = orgDefaults?.[role]?.[section];
  if (validLevel(orgValue)) return orgValue;
  const area = areaOfSection(section);
  if (!area) return 0;
  const areaLevel = Math.max(0, Math.min(2, areas[area])) as ModuleAccessLevel;
  // Admin herda administração (4) nos módulos com edição na área; uma restrição explícita da área continua prevalecendo.
  return role === 'Admin' && areaLevel === 2 ? 4 : areaLevel;
}

export function resolveModuleLevels(
  role: UserRole,
  areas: AreaLevels,
  orgDefaults?: ModuleAccessDefaults | null,
  userOverrides?: ModuleAccessOverrides | null,
): Record<string, ModuleAccessLevel> {
  return Object.fromEntries(MODULE_PERMISSIONS.map(([id]) => [
    id, resolveModuleLevel(id, role, areas, orgDefaults, userOverrides),
  ]));
}

export function canAccessModule(
  section: string,
  areas: AreaLevels,
  overrides?: Record<string, number> | null,
): boolean {
  if (!MODULE_PERMISSION_IDS.has(section)) return false;
  const value = overrides?.[section];
  if (validLevel(value)) return value >= 1;
  const area = areaOfSection(section);
  return !!area && areas[area] >= 1;
}
