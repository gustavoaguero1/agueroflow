/**
 * Autorização granular do AgueroFlow.
 *
 * Perfis são modelos reutilizáveis, não cargos fixos. A autorização efetiva é:
 * nível legado da área → perfil de acesso da pessoa → exceções individuais.
 * O catálogo é estável porque também é codificado no token e consultado pelas regras.
 */
import { areaOfSection, type AreaLevels, type AreaLevel } from './areas.ts';

export const ACCESS_SECTIONS = [
  { id: 'painel', label: 'Painel', group: 'Painel' },
  { id: 'ordens', label: 'Lista de OS', group: 'Ordens de Serviço' },
  { id: 'ordens-aprovacoes', label: 'Aprovações (LPU)', group: 'Ordens de Serviço' },
  { id: 'ordens-recorrencias', label: 'Recorrências', group: 'Ordens de Serviço' },
  { id: 'checklists', label: 'Checklists', group: 'Campo' },
  { id: 'inspecoes', label: 'Inspeções', group: 'Campo' },
  { id: 'pecas-servicos', label: 'Peças e Serviços', group: 'Peças e Serviços' },
  { id: 'pecas-catalogo', label: 'Peças', group: 'Peças e Serviços' },
  { id: 'servicos-catalogo', label: 'Serviços', group: 'Peças e Serviços' },
  { id: 'mao-de-obra', label: 'Mão de Obra (HxH)', group: 'Peças e Serviços' },
  { id: 'subcategorias-servicos', label: 'Subcategorias e Gestão', group: 'Peças e Serviços' },
  { id: 'estoque', label: 'Estoque', group: 'Estoque' },
  { id: 'ocorrencias', label: 'Ocorrências', group: 'Campo' },
  { id: 'relatorios', label: 'Relatórios', group: 'Relatórios e IA' },
  { id: 'suporte', label: 'Suporte', group: 'Suporte' },
  { id: 'ia', label: 'AgueroFlow IA', group: 'Relatórios e IA' },
  { id: 'configuracoes', label: 'Configurações', group: 'Administração' },
  { id: 'whatsapp-automacao', label: 'Automação WhatsApp e NDs', group: 'WhatsApp' },
  { id: 'whatsapp-central', label: 'Central WhatsApp e OCR', group: 'WhatsApp' },
  { id: 'whatsapp-nds', label: 'Automação NDs e Outlook', group: 'WhatsApp' },
  { id: 'whatsapp-comandos', label: 'Comandos Programados', group: 'WhatsApp' },
  { id: 'estrutura', label: 'Visão Geral e Unidades', group: 'Estrutura e Contratos' },
  { id: 'contratos', label: 'Contratos', group: 'Estrutura e Contratos' },
  { id: 'auditoria', label: 'Auditoria e Logs', group: 'Estrutura e Contratos' },
  { id: 'obras', label: 'Obras e RDO', group: 'Operações' },
  { id: 'obras-medicoes', label: 'Medições e Boletins', group: 'Operações' },
  { id: 'operacoes', label: 'Operações (geral)', group: 'Operações' },
  { id: 'ops-inicio', label: 'Painel de Operações', group: 'Operações' },
  { id: 'ops-direcionar', label: 'Gerenciamento de Operações', group: 'Operações' },
  { id: 'ops-diario', label: 'Diário de Obras', group: 'Operações' },
  { id: 'ops-viagem', label: 'Hora Viagem', group: 'Operações' },
  { id: 'ops-reembolso', label: 'Reembolso', group: 'Operações' },
  { id: 'ops-contratacao', label: 'Contratação', group: 'Operações' },
  { id: 'ops-tarefas', label: 'Auxiliares', group: 'Operações' },
  { id: 'ops-gases', label: 'Controle de Gases', group: 'Operações' },
  { id: 'ops-base', label: 'Base de Dados', group: 'Operações' },
  { id: 'ops-config', label: 'Configurações de Operações', group: 'Operações' },
  { id: 'bens-coletivos', label: 'Bens Coletivos', group: 'Bens Coletivos' },
  { id: 'bens-painel', label: 'Painel de Bens', group: 'Bens Coletivos' },
  { id: 'bens-lista', label: 'Bens', group: 'Bens Coletivos' },
  { id: 'bens-movimentacoes', label: 'Retiradas e Devoluções', group: 'Bens Coletivos' },
  { id: 'bens-manutencoes', label: 'Manutenção e Calibração', group: 'Bens Coletivos' },
  { id: 'bens-categorias', label: 'Categorias de Bens', group: 'Bens Coletivos' },
  { id: 'bens-colaboradores', label: 'Colaboradores de Bens', group: 'Bens Coletivos' },
  { id: 'bens-relatorios', label: 'Relatórios de Bens', group: 'Bens Coletivos' },
  { id: 'rh-salarios', label: 'RH e Salários', group: 'RH e Salários' },
  { id: 'rh-painel', label: 'Painel RH e Salários', group: 'RH e Salários' },
  { id: 'rh-funcionarios', label: 'Funcionários', group: 'RH e Salários' },
  { id: 'rh-pendencias', label: 'Pendências Legadas', group: 'RH e Salários' },
  { id: 'rh-admissoes', label: 'Admissão Digital', group: 'RH e Salários' },
  { id: 'rh-importacao', label: 'Importação de Planilha', group: 'RH e Salários' },
  { id: 'rh-calculo', label: 'Cálculo do 13º', group: 'RH e Salários' },
  { id: 'rh-historico', label: 'Histórico de Cálculos', group: 'RH e Salários' },
  { id: 'rh-relatorios', label: 'Relatórios de RH', group: 'RH e Salários' },
  { id: 'rh-holerites', label: 'Demonstrativos e Holerites', group: 'RH e Salários' },
  { id: 'comercial', label: 'Comercial', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-painel', label: 'Painel de Propostas', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-funil', label: 'Funil de Vendas', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-nova', label: 'Nova Proposta', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-composicao', label: 'Composição de Custos', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-revisao', label: 'Revisão de BOM', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-comunicacao', label: 'Comunicação WhatsApp', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-importacoes', label: 'Importações', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-materiais', label: 'Materiais e Preços', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-configuracoes', label: 'Configurações Comerciais', group: 'Comercial (OrçaÁgil)' },
  { id: 'comercial-relatorios', label: 'Relatórios Comerciais', group: 'Comercial (OrçaÁgil)' },
  { id: 'compras', label: 'Compras e Suprimentos', group: 'Compras e Suprimentos' },
  { id: 'compras-painel', label: 'Painel Geral', group: 'Compras e Suprimentos' },
  { id: 'compras-requisicoes', label: 'Requisições', group: 'Compras e Suprimentos' },
  { id: 'compras-cotacoes', label: 'Mapa de Cotações', group: 'Compras e Suprimentos' },
  { id: 'compras-pedidos', label: 'Ordens de Compra', group: 'Compras e Suprimentos' },
  { id: 'compras-historico', label: 'Histórico de Compras', group: 'Compras e Suprimentos' },
  { id: 'compras-inteligencia', label: 'Inteligência de Fornecedores', group: 'Compras e Suprimentos' },
  { id: 'compras-fornecedores', label: 'Fornecedores', group: 'Compras e Suprimentos' },
  { id: 'compras-recebimento', label: 'Recebimento e Corrida', group: 'Compras e Suprimentos' },
  { id: 'financeiro', label: 'Financeiro', group: 'Financeiro' },
  { id: 'financeiro-notas', label: 'Caixa de Notas', group: 'Financeiro' },
  { id: 'financeiro-pagar', label: 'Contas a Pagar', group: 'Financeiro' },
  { id: 'financeiro-receber', label: 'Contas a Receber', group: 'Financeiro' },
  { id: 'financeiro-plano', label: 'Plano de Contas', group: 'Financeiro' },
  { id: 'viagens', label: 'Viagens', group: 'Viagens' },
  { id: 'viagens-painel', label: 'Passagens e Solicitações', group: 'Viagens' },
  { id: 'viagens-busca', label: 'Busca de Viagens', group: 'Viagens' },
  { id: 'viagens-resultados', label: 'Resultados de Viagens', group: 'Viagens' },
  { id: 'viagens-historico', label: 'Histórico de Viagens', group: 'Viagens' },
  { id: 'viagens-solicitacoes', label: 'Solicitações de Viagem', group: 'Viagens' },
  { id: 'viagens-reembolsos', label: 'Reembolsos de Viagem', group: 'Viagens' },
  { id: 'viagens-configuracoes', label: 'Configurações de Viagens', group: 'Viagens' },
  { id: 'marketing', label: 'Marketing e Eventos', group: 'Marketing e Eventos' },
  { id: 'marketing-painel', label: 'Visão Geral', group: 'Marketing e Eventos' },
  { id: 'marketing-calendario', label: 'Calendário e Radar IA', group: 'Marketing e Eventos' },
  { id: 'marketing-campanhas', label: 'Campanhas', group: 'Marketing e Eventos' },
  { id: 'marketing-eventos', label: 'Eventos Corporativos', group: 'Marketing e Eventos' },
  { id: 'marketing-estudio', label: 'Estúdio Criativo', group: 'Marketing e Eventos' },
  { id: 'marketing-conteudo-obras', label: 'Obras em Conteúdo', group: 'Marketing e Eventos' },
  { id: 'marketing-biblioteca', label: 'Identidade Visual', group: 'Marketing e Eventos' },
  { id: 'marketing-desempenho', label: 'Desempenho e Tráfego', group: 'Marketing e Eventos' },
  { id: 'marketing-configuracoes', label: 'Configurações de Marketing', group: 'Marketing e Eventos' },
] as const;

export type AccessSectionId = (typeof ACCESS_SECTIONS)[number]['id'];
export const ACCESS_SECTION_IDS = ACCESS_SECTIONS.map((s) => s.id) as AccessSectionId[];
export const ACCESS_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'manage'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];
export type DataScope = 'all' | 'assigned' | 'own';
export type PermissionGrant = Partial<Record<AccessAction, boolean>> & { scope?: DataScope };
export type PermissionMap = Partial<Record<AccessSectionId, PermissionGrant>>;
export type AccessProfile = { id: string; name: string; description?: string; permissions: PermissionMap; updatedAt?: string };

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const SCOPE_CODE: Record<DataScope, string> = { all: '0', assigned: '1', own: '2' };
const CODE_SCOPE: Record<string, DataScope> = { '0': 'all', '1': 'assigned', '2': 'own' };
const ACTION_BIT: Record<AccessAction, number> = { view: 1, create: 2, edit: 4, delete: 8, approve: 16, manage: 32 };
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validScope = (v: unknown): v is DataScope => v === 'all' || v === 'assigned' || v === 'own';

export function sanitizePermissionMap(raw: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (!isPlain(raw)) return out;
  for (const section of ACCESS_SECTION_IDS) {
    const value = raw[section];
    if (!isPlain(value)) continue;
    const grant: PermissionGrant = {};
    for (const action of ACCESS_ACTIONS) if (typeof value[action] === 'boolean') grant[action] = value[action] as boolean;
    if (validScope(value.scope)) grant.scope = value.scope;
    if (Object.keys(grant).length) out[section] = grant;
  }
  return out;
}

export function sanitizeAccessProfiles(raw: unknown): AccessProfile[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AccessProfile[] = [];
  for (const value of raw.slice(0, 100)) {
    if (!isPlain(value)) continue;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    const description = typeof value.description === 'string' ? value.description.trim().slice(0, 240) : '';
    out.push({
      id, name,
      ...(description ? { description } : {}),
      permissions: sanitizePermissionMap(value.permissions),
      ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    });
  }
  return out;
}

export function sanitizePermissionOverrides(raw: unknown): PermissionMap {
  return sanitizePermissionMap(raw);
}

function baseGrant(level: AreaLevel): PermissionGrant {
  return {
    view: level >= 1,
    create: level >= 2,
    edit: level >= 2,
    delete: level >= 2,
    approve: level >= 2,
    manage: level >= 2,
    scope: 'all',
  };
}

function mergeGrant(base: PermissionGrant, overlay?: PermissionGrant): PermissionGrant {
  const next: PermissionGrant = { ...base };
  if (!overlay) return next;
  for (const action of ACCESS_ACTIONS) if (typeof overlay[action] === 'boolean') next[action] = overlay[action] as boolean;
  if (overlay.scope) next.scope = overlay.scope;
  if (next.view === false) {
    next.create = false; next.edit = false; next.delete = false; next.approve = false; next.manage = false;
  }
  return next;
}

/** Matriz efetiva: permissões da área → modelo de acesso → exceções da pessoa. */
export function resolvePermissionMatrix(
  areas: AreaLevels,
  profile?: AccessProfile | null,
  overrides?: PermissionMap | null,
): Record<AccessSectionId, PermissionGrant> {
  const result = {} as Record<AccessSectionId, PermissionGrant>;
  for (const item of ACCESS_SECTIONS) {
    const area = areaOfSection(item.id);
    const level = area ? areas[area] : 0;
    result[item.id] = mergeGrant(
      mergeGrant(baseGrant(level), profile?.permissions[item.id]),
      overrides?.[item.id],
    );
  }
  return result;
}

/**
 * Claim compacto, um bloco de sete caracteres por seção:
 * seis flags (view/create/edit/delete/approve/manage) + escopo (0=todos, 1=atribuídos, 2=próprios).
 * Só é emitido quando há configuração granular; sem ele vale o legado por área.
 */
export function encodePermissionMatrix(matrix: Record<AccessSectionId, PermissionGrant>): string {
  return ACCESS_SECTIONS.map((item) => {
    const grant = matrix[item.id] || {};
    const flags = ACCESS_ACTIONS.map((action) => grant[action] === true ? '1' : '0').join('');
    return flags + SCOPE_CODE[grant.scope || 'all'];
  }).join('');
}

export function decodePermissionMatrix(raw: unknown): Record<AccessSectionId, PermissionGrant> | null {
  const expected = ACCESS_SECTIONS.length * 7;
  if (typeof raw !== 'string' || raw.length !== expected) return null;
  for (let i = 0; i < ACCESS_SECTIONS.length; i += 1) {
    const block = raw.slice(i * 7, i * 7 + 7);
    if (!/^[01]{6}[012]$/.test(block)) return null;
  }
  const result = {} as Record<AccessSectionId, PermissionGrant>;
  ACCESS_SECTIONS.forEach((item, index) => {
    const offset = index * 7;
    const grant: PermissionGrant = {};
    ACCESS_ACTIONS.forEach((action, bit) => { grant[action] = raw[offset + bit] === '1'; });
    grant.scope = CODE_SCOPE[raw[offset + 6]];
    result[item.id] = grant;
  });
  return result;
}

export function hasPermissionCustomization(profileId: unknown, overrides: unknown): boolean {
  return (typeof profileId === 'string' && !!profileId) ||
    (isPlain(overrides) && Object.keys(sanitizePermissionOverrides(overrides)).length > 0);
}

export function canAccessPermission(
  section: string,
  action: AccessAction,
  areas: AreaLevels,
  encoded?: unknown,
  master = false,
): boolean {
  if (master) return true;
  if (encoded !== undefined) {
    const decoded = decodePermissionMatrix(encoded);
    return decoded?.[section as AccessSectionId]?.[action] === true;
  }
  const area = areaOfSection(section);
  const level = area ? areas[area] : 0;
  return action === 'view' ? level >= 1 : level >= 2;
}

export function scopeOfPermission(section: string, areas: AreaLevels, encoded?: unknown): DataScope {
  if (encoded !== undefined) {
    const decoded = decodePermissionMatrix(encoded);
    return decoded?.[section as AccessSectionId]?.scope || 'own';
  }
  const area = areaOfSection(section);
  return area && areas[area] > 0 ? 'all' : 'own';
}

export function visibleNavWithPermissions<T extends { id: string; hasSubmenu?: boolean; subItems?: Array<{ id: string }> }>(
  items: T[],
  canSee: (section: string) => boolean,
): T[] {
  const visible: T[] = [];
  for (const item of items) {
    if (item.hasSubmenu && item.subItems) {
      const children = item.subItems.filter((child) => canSee(child.id));
      if (children.length) visible.push({ ...item, subItems: children });
    } else if (canSee(item.id)) {
      visible.push(item);
    }
  }
  return visible;
}


/** Confere escopos de registros em handlers/API. Campos de atribuição aceitos são explícitos. */
export function recordInDataScope(
  uid: string,
  scope: DataScope,
  record: Record<string, unknown>,
): boolean {
  if (scope === 'all') return true;
  const ownFields = ['createdByUid', 'ownerUid', 'userId', 'requestedByUid'];
  if (scope === 'own') return ownFields.some((field) => record[field] === uid);
  const assignedFields = ['assignedToUid', 'assigneeUid', 'responsibleUid', 'supervisorUid', 'ownerUid'];
  if (assignedFields.some((field) => record[field] === uid)) return true;
  return ['assignedUserIds', 'assigneeUids', 'memberUids'].some((field) =>
    Array.isArray(record[field]) && (record[field] as unknown[]).includes(uid),
  );
}

export function filterRecordsByDataScope<T extends Record<string, unknown>>(
  uid: string,
  scope: DataScope,
  records: T[],
): T[] {
  return scope === 'all' ? records : records.filter((record) => recordInDataScope(uid, scope, record));
}
