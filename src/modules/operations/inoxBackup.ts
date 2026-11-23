/** Formato do backup do "Aguero Inox 2.0" gerado por tools/exportar-inox.js (funções puras, testadas). */

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
