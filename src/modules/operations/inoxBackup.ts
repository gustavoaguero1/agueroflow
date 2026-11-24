/** Formato do backup do "Aguero Inox 2.0" gerado por tools/exportar-inox.js (funções puras, testadas). */
import type { RhEmployee } from '../../types/rhPayroll';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Casa por nome (sem acento/caixa) só quando há exatamente um candidato; homônimos → null. */
export function matchByName<T extends { name: string }>(nome: string, candidates: T[]): T | null {
  const k = norm(nome || '');
  if (!k) return null;
  const hits = candidates.filter((c) => norm(c.name || '') === k);
  if (hits.length === 1) return hits[0];
  return null;
}

/**
 * Pareia itens do backup com registros que JÁ existiam (nunca com os criados na importação):
 * 1) ligação anterior (`linkedId`, reimportação); 2) código único (obras); 3) nome único.
 * Cada registro existente só pode ser reivindicado por um item. Sem par → null (será criado).
 */
export function claimMatches(
  items: Array<{ id: string; name: string; code?: string; linkedId?: string }>,
  existing: Array<{ id: string; name: string; code?: string }>,
): Map<string, string | null> {
  const claimed = new Set<string>();
  const out = new Map<string, string | null>();
  const free = () => existing.filter((e) => !claimed.has(e.id));
  const take = (itemId: string, e: { id: string } | null | undefined) => {
    if (!e) return false;
    claimed.add(e.id);
    out.set(itemId, e.id);
    return true;
  };
  for (const it of items) {
    if (it.linkedId) take(it.id, free().find((e) => e.id === it.linkedId));
  }
  for (const it of items) {
    if (out.has(it.id) || !it.code) continue;
    const hits = free().filter((e) => e.code && String(e.code) === String(it.code));
    if (hits.length === 1) take(it.id, hits[0]);
  }
  for (const it of items) {
    if (out.has(it.id)) continue;
    if (!take(it.id, matchByName(it.name, free()))) out.set(it.id, null);
  }
  return out;
}

/** Funcionário do RH criado a partir de um colaborador do Inox que não existia no RH. */
export function rhEmployeeFromInox(
  orgId: string,
  inoxId: string,
  c: Record<string, unknown>,
  sal: { clt?: unknown; pj?: unknown } | null,
): RhEmployee {
  const now = new Date().toISOString();
  const carteira = Number(c.regime === 'PJ' ? sal?.pj : sal?.clt) || Number(sal?.clt) || Number(sal?.pj) || 0;
  return {
    id: `rh_ops_${orgId}_${inoxId}`.replace(/[^\w-]/g, '_'),
    orgId, registrationNumber: '', name: String(c.nome || ''), role: String(c.funcao || ''),
    admissionDate: String(c.admissao || ''), active: c.status !== 'Desligado', department: 'Operações', companyName: '',
    hourlyRateCarteira: Math.round((carteira / 220) * 100) / 100, hourlyRatePorFora: 0, monthlyHours: 220,
    baseSalaryCarteira: carteira, baseSalaryPorFora: 0, notes: 'Importado do Aguero Inox', createdAt: now, updatedAt: now,
  };
}

export interface InoxBackup {
  formato: 'aguero-inox-backup';
  versao: number;
  geradoEm: string;
  colecoes: Record<string, Array<{ id: string } & Record<string, unknown>>>;
  docs: Record<string, Record<string, unknown> | null>;
  arquivos: Record<string, unknown>;
  anexos: Record<string, string>; // url original -> data URL
  erros?: string[];
}

export const INOX_COLLECTIONS = ['passagens', 'candidatos', 'indicacoes', 'colaboradores', 'obras', 'direcionamentos',
  'tarefas', 'notificacoes', 'economias', 'reemb_notas', 'reemb_lotes', 'vales', 'diario', 'viagens', 'contatos',
  'fat_pedidos', 'fat_nfs', 'fat_cobrancas', 'membros', 'salarios'] as const;

export function parseInoxBackup(text: string): InoxBackup {
  const b = JSON.parse(text);
  if (!b || b.formato !== 'aguero-inox-backup' || typeof b.colecoes !== 'object') {
    throw new Error('Este arquivo não é um backup do Inox (gere com tools/exportar-inox.js).');
  }
  return { docs: {}, arquivos: {}, anexos: {}, ...b };
}

export function summarizeInoxBackup(b: InoxBackup) {
  return {
    colecoes: Object.fromEntries(Object.entries(b.colecoes).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])),
    docs: Object.keys(b.docs).filter((k) => b.docs[k]),
    arquivos: Object.keys(b.arquivos),
    anexos: Object.keys(b.anexos).length,
    avisos: b.erros || [],
  };
}

/** Troca as URLs antigas de anexos pelas novas, em qualquer profundidade. */
export function rewriteUrls<T>(v: T, map: Map<string, string>): T {
  if (Array.isArray(v)) return v.map((x) => rewriteUrls(x, map)) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = k === 'url' && typeof x === 'string' && map.has(x) ? map.get(x) : rewriteUrls(x, map);
    }
    return out as T;
  }
  return v;
}
