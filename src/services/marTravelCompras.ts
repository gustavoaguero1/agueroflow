// Compras da Mar Travel puxadas da API Lemontech (GET /api/travel/lemontech/solicitacoes).
export interface PessoaMT { nome?: string; matricula?: string; email?: string }
export interface CompraMarTravel {
  id: string;
  status: string;
  tipo?: string;
  criadaEm?: string;
  centroDeCusto: { codigo?: string; nome?: string } | null;
  projeto: { codigo?: string; nome?: string } | null;
  solicitante: PessoaMT | null;
  passageiros: PessoaMT[];
  produtos: Record<'aereos' | 'hoteis' | 'carros' | 'rodoviarios' | 'outros' | 'seguros' | 'traslados', number>;
  valorTotal: number | null;
  unitId: string | null;
  unitName: string | null;
  syncedAt?: string;
}

export const STATUS_LABEL: Record<string, string> = {
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  PENDENTE_APROVACAO: 'Aguardando aprovação',
  APROVADA: 'Aprovada',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const contaNoCusto = (c: CompraMarTravel) => c.status !== 'CANCELADA';

export function summarizeCompras(items: CompraMarTravel[]) {
  const porStatus: Record<string, number> = {};
  const obras = new Map<string, { chave: string; nome: string; custo: number; qtd: number }>();
  let custoTotal = 0;
  let semObra = 0;
  for (const c of items) {
    porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;
    const valor = contaNoCusto(c) ? c.valorTotal ?? 0 : 0;
    custoTotal += valor;
    if (!c.unitId) semObra += 1;
    const chave = c.unitId ?? `cc:${c.centroDeCusto?.codigo ?? '—'}`;
    const nome = c.unitName ?? c.centroDeCusto?.nome ?? c.centroDeCusto?.codigo ?? 'Sem centro de custo';
    const o = obras.get(chave) ?? { chave, nome, custo: 0, qtd: 0 };
    o.custo = round2(o.custo + valor);
    o.qtd += 1;
    obras.set(chave, o);
  }
  return {
    custoTotal: round2(custoTotal),
    porStatus,
    semObra,
    porObra: [...obras.values()].sort((a, b) => b.custo - a.custo || a.nome.localeCompare(b.nome)),
  };
}

export function filterCompras(items: CompraMarTravel[], f: { status?: string; busca?: string }) {
  const q = f.busca?.trim().toLowerCase();
  return items.filter((c) => {
    if (f.status && c.status !== f.status) return false;
    if (!q) return true;
    const campos = [
      c.id, c.unitName, c.centroDeCusto?.codigo, c.centroDeCusto?.nome, c.projeto?.nome,
      c.solicitante?.nome, ...c.passageiros.map((p) => p.nome),
    ];
    return campos.some((v) => v?.toLowerCase().includes(q));
  });
}
