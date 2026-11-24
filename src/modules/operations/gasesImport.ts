/**
 * Importação da Central de Controle de Gases (três .json: lançamentos, pendências, boletos).
 * Grava em ops_orgs/{empresa}/gases_lancamentos | gases_pendencias | gases_boletos, com todos os
 * campos do arquivo. Códigos estáveis: importar de novo atualiza em vez de duplicar. Funções puras.
 */
export type GasKind = 'lancamentos' | 'pendencias' | 'boletos';
export const GAS_COLLECTIONS: Record<GasKind, string> = {
  lancamentos: 'gases_lancamentos',
  pendencias: 'gases_pendencias',
  boletos: 'gases_boletos',
};
export const GAS_LABELS: Record<GasKind, string> = {
  lancamentos: 'Lançamentos de gases',
  pendencias: 'Pendências de gases',
  boletos: 'Boletos de gases',
};

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (r: Row, keys: string[]) => keys.every((k) => k in r);

/** Qual arquivo é, pelo formato das linhas (null se não for um arquivo de gases). */
export function detectGasesFile(json: unknown): GasKind | null {
  if (!Array.isArray(json) || !json.length || !json.every(isObj)) return null;
  const r = json[0] as Row;
  if (has(r, ['ref', 'gas', 'cilindros', 'valor', 'obra'])) return 'lancamentos';
  if (has(r, ['pendencia', 'situacao', 'referencia'])) return 'pendencias';
  if (has(r, ['documento', 'vencimento', 'valor'])) return 'boletos';
  return null;
}

/** Texto vira pedaço de código: sem acento, sem barra, minúsculo. */
const slug = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

function baseKey(kind: GasKind, r: Row): string {
  if (kind === 'lancamentos') return `${slug(r.fonte)}_${slug(r.ref)}_${slug(r.gas)}`;
  if (kind === 'pendencias') return `p${slug(r.id ?? r.referencia)}`;
  return `b_${slug(r.documento)}`;
}

/** Linhas com código. Repetição da mesma chave no arquivo (ex.: dois itens de argônio na mesma NF) ganha -2, -3… */
export function gasesRows(kind: GasKind, rows: unknown[]): Array<{ id: string; data: Row }> {
  const seen = new Map<string, number>();
  return rows.filter(isObj).map((r) => {
    const k = baseKey(kind, r);
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    return { id: n === 1 ? k : `${k}-${n}`, data: { ...r } };
  });
}

export type GasWrite = { path: string; data: Row; merge?: boolean };

/**
 * O que gravar. Pendência já existente: não mexe na situação (quem resolveu continua resolvido).
 * Tudo com merge: o que foi feito no AgueroFlow (ajuste de "considerar", baixa de boleto) fica.
 */
export function planGasesWrites(
  orgId: string,
  files: Array<{ kind: GasKind; rows: unknown[] }>,
  existingPendencias: Map<string, unknown>,
): GasWrite[] {
  const out: GasWrite[] = [];
  const importedAt = new Date().toISOString();
  for (const f of files) {
    const col = `ops_orgs/${orgId}/${GAS_COLLECTIONS[f.kind]}`;
    for (const { id, data } of gasesRows(f.kind, f.rows)) {
      const d: Row = { ...data, importadoEm: importedAt };
      if (f.kind === 'pendencias' && existingPendencias.has(id)) delete d.situacao;
      // merge: o que foi decidido no AgueroFlow (considerarAjuste, baixa do boleto, resolução) fica.
      out.push({ path: `${col}/${id}`, data: d, merge: true });
    }
  }
  return out;
}
