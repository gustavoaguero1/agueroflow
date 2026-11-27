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

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Quebra o período em meses (sem buracos nem sobreposição). Usado no navegador e no servidor. */
export function monthRanges(from: string, to: string): { dataInicial: string; dataFinal: string }[] {
  const out: { dataInicial: string; dataFinal: string }[] = [];
  let start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (start <= end) {
    const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const stop = monthEnd < end ? monthEnd : end;
    out.push({ dataInicial: isoDia(start), dataFinal: isoDia(stop) });
    start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  }
  return out;
}

/** Lê a resposta de um pedaço da sincronização; qualquer coisa fora do esperado vira erro com mensagem clara. */
export async function lerRespostaSync(res: Response): Promise<{ total: number; totalGeral: number }> {
  const texto = await res.text();
  let j: any = null;
  try { j = texto ? JSON.parse(texto) : null; } catch { j = null; }
  if (!res.ok) throw new Error(j?.error || `Falha na sincronização (HTTP ${res.status}). Tente de novo em instantes.`);
  if (!j || typeof j.total !== 'number') throw new Error(`Resposta inesperada (HTTP ${res.status}) ao sincronizar. Republique o app no AI Studio e tente de novo.`);
  return { total: j.total, totalGeral: typeof j.totalGeral === 'number' ? j.totalGeral : j.total };
}
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
