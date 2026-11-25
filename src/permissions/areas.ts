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
// enforcedInDatabase: o banco/servidor também bloqueia; false = a área só some do menu (dados ainda legíveis por quem é da empresa).
export const AREAS: Array<{ id: AreaId; label: string; description: string; sections: string[]; enforcedInDatabase: boolean }> = [
  { id: 'painel', label: 'Painel', description: 'Visão geral e pendências. Todo mundo vê.', sections: ['painel'], enforcedInDatabase: false },
  { id: 'operacoes', label: 'Operações', description: 'OS, checklists, inspeções, ocorrências, obras e RDO, diário, viagens, reembolsos e bens coletivos.', sections: ['ordens', 'checklists', 'inspecoes', 'ocorrencias', 'operacoes', 'ops', 'obras', 'viagens', 'bens'], enforcedInDatabase: true },
  { id: 'estoque', label: 'Estoque e compras', description: 'Catálogo mestre, categorias, saldos e movimentos de estoque; compras, requisições, cotações, pedidos, recebimentos e fornecedores.', sections: ['pecas', 'servicos', 'mao', 'subcategorias', 'estoque', 'compras'], enforcedInDatabase: true },
  { id: 'comercial', label: 'Comercial', description: 'Propostas, clientes, composições e marketing.', sections: ['comercial', 'marketing'], enforcedInDatabase: true },
  { id: 'financeiro', label: 'Financeiro', description: 'Contas a pagar, categorias e notas fiscais.', sections: ['financeiro'], enforcedInDatabase: true },
  { id: 'rh', label: 'RH e salários', description: 'Funcionários, salários, admissões, 13º e relatórios de RH.', sections: ['rh'], enforcedInDatabase: true },
  { id: 'whatsapp', label: 'WhatsApp', description: 'Central de conversas, automações, NDs e recibos.', sections: ['whatsapp'], enforcedInDatabase: true },
  { id: 'relatorios', label: 'Relatórios e IA', description: 'Relatórios gerais e assistente de IA.', sections: ['relatorios', 'ia'], enforcedInDatabase: false },
  { id: 'estrutura', label: 'Estrutura', description: 'Unidades, contratos, equipes e auditoria.', sections: ['estrutura', 'contratos', 'auditoria'], enforcedInDatabase: false },
  { id: 'configuracoes', label: 'Configurações', description: 'Tema e dispositivos (todo mundo); empresa, equipe e acessos (quem edita).', sections: ['configuracoes'], enforcedInDatabase: true },
  { id: 'suporte', label: 'Suporte', description: 'Chamados de suporte. Todo mundo usa.', sections: ['suporte'], enforcedInDatabase: false },
];

const row = (v: number[]): AreaLevels => Object.fromEntries(AREA_IDS.map((a, i) => [a, v[i] as AreaLevel])) as AreaLevels;
//                         painel ops est com fin rh  wa  rel estr conf sup
export const ROLE_DEFAULTS: Record<UserRole, AreaLevels> = {
  Admin: row([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
  Gerente: row([2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2]),
  Supervisor: row([1, 2, 2, 1, 2, 0, 2, 1, 1, 1, 2]),
  Operacional: row([1, 2, 1, 0, 0, 0, 1, 0, 1, 1, 2]),
  Visualizador: row([1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 2]),
};

/** Áreas que todo mundo precisa ver: nunca abaixo de "ver". */
const MINIMUM: AreaOverrides = { painel: 1, configuracoes: 1, suporte: 1 };
const NONE = row([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const isLevel = (v: unknown): v is AreaLevel => v === 0 || v === 1 || v === 2;

/** Nível final: perfil → padrão da empresa para o perfil → ajuste da pessoa; com os mínimos. */
export function resolveAreas(
  role: UserRole,
  orgDefaults?: Partial<Record<UserRole, AreaOverrides>> | null,
  overrides?: AreaOverrides | null,
): AreaLevels {
  const out = { ...(ROLE_DEFAULTS[role] || NONE) }; // perfil desconhecido: só os mínimos
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

/** Níveis no token: um dígito por área, na ordem de AREA_IDS (o token tem limite de tamanho). */
export function encodeAreas(levels: AreaLevels): string {
  return AREA_IDS.map((a) => String(levels[a] ?? 0)).join('');
}

export function decodeAreas(s: unknown): AreaLevels | null {
  if (typeof s !== 'string' || !new RegExp(`^[012]{${AREA_IDS.length}}$`).test(s)) return null;
  const out = {} as AreaLevels;
  AREA_IDS.forEach((a, i) => { out[a] = Number(s[i]) as AreaLevel; });
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Ajuste vindo de fora (tela, banco): só áreas conhecidas com nível 0, 1 ou 2. */
export function sanitizeOverrides(v: unknown): AreaOverrides {
  const out: AreaOverrides = {};
  if (!isPlainObject(v)) return out;
  for (const a of AREA_IDS) if (isLevel(v[a])) out[a] = v[a] as AreaLevel;
  return out;
}

export function sanitizeOrgDefaults(v: unknown): Partial<Record<UserRole, AreaOverrides>> {
  const out: Partial<Record<UserRole, AreaOverrides>> = {};
  if (!isPlainObject(v)) return out;
  for (const role of Object.keys(ROLE_DEFAULTS) as UserRole[]) {
    if (role in v) out[role] = sanitizeOverrides(v[role]);
  }
  return out;
}

export function areaOfSection(section: string): AreaId | null {
  const s = String(section || '');
  for (const area of AREAS) {
    if (area.sections.some((k) => s === k || s.startsWith(`${k}-`))) return area.id;
  }
  return null;
}

/** Níveis que valem no navegador: master edita tudo; senão o token; sem token válido, o padrão do perfil. */
export function effectiveLevels(master: boolean, role: UserRole, code: unknown): AreaLevels {
  if (master) return Object.fromEntries(AREA_IDS.map((a) => [a, 2])) as AreaLevels;
  return decodeAreas(code) ?? resolveAreas(role);
}

/** O acesso mudou (areasUpdatedAt) depois que o token atual foi emitido? Então renova o login. */
export function needsTokenRefresh(areasUpdatedAt: unknown, tokenIssuedAt: unknown): boolean {
  const changed = typeof areasUpdatedAt === 'string' ? Date.parse(areasUpdatedAt) : NaN;
  const issued = typeof tokenIssuedAt === 'string' ? Date.parse(tokenIssuedAt) : NaN;
  return Number.isFinite(changed) && Number.isFinite(issued) && changed > issued;
}

type NavLike = { id: string; subItems?: Array<{ id: string }> };

/** Menu com só o que a pessoa pode ver; grupo sem nenhum subitem visível some. */
export function visibleNav<T extends NavLike>(items: T[], levels: AreaLevels): T[] {
  const out: T[] = [];
  for (const it of items) {
    if (!it.subItems) {
      if (canSeeSection(it.id, levels)) out.push(it);
      continue;
    }
    const subItems = it.subItems.filter((s) => canSeeSection(s.id, levels));
    if (subItems.length) out.push({ ...it, subItems });
  }
  return out;
}

/** Seção aparece no menu se a área dela tiver pelo menos "ver" (seção sem área: sempre). */
export function canSeeSection(section: string, levels: AreaLevels | null | undefined): boolean {
  const a = areaOfSection(section);
  if (!a || !levels) return true;
  return levels[a] >= 1;
}
