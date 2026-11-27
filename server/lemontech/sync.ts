// Sincronização das solicitações da Mar Travel (Lemontech) para o AgueroFlow.
// Puxa tudo: concluídas, canceladas, pendentes e aprovadas, todos os produtos, mês a mês e
// página a página. Guarda o registro original inteiro (raw) para nada se perder.
import { MAX_REGISTROS } from './wsSelfBooking.ts';
import { monthRanges } from '../../src/services/marTravelCompras.ts';

export { monthRanges };
export interface SolicitacaoClient { pesquisarSolicitacao(p: any): Promise<any[]> }

/** 60 requisições por minuto na API: uma a cada ~1,1 s. */
export const RATE_DELAY_MS = 1100;
const MAX_CALLS = 1000;

export async function fetchAllSolicitacoes(
  client: SolicitacaoClient, from: string, to: string,
  opts: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<any[]> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const byId = new Map<string, any>();
  let calls = 0;
  for (const range of monthRanges(from, to)) {
    for (let registroInicial = 0; ; registroInicial += MAX_REGISTROS) {
      if (calls > 0) await sleep(RATE_DELAY_MS);
      if (++calls > MAX_CALLS) throw new Error('Período grande demais para uma sincronização; reduza o intervalo.');
      const page = await client.pesquisarSolicitacao({
        ...range, registroInicial, quantidadeRegistros: MAX_REGISTROS,
        exibirCancelados: true, exibirPendentesAprovacao: true, exibirAprovadas: true,
      });
      for (const s of page) byId.set(String(s?.idSolicitacao ?? s?.id ?? JSON.stringify(s)), s);
      if (page.length < MAX_REGISTROS) break;
    }
  }
  return [...byId.values()];
}

export const PRODUTOS = ['aereos', 'hoteis', 'carros', 'rodoviarios', 'outros', 'seguros', 'traslados'] as const;
export type Produto = typeof PRODUTOS[number];

const list = (v: any): any[] => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);
/** Contêiner XML vira lista: { aereo: [...] } ou { aereo: {...} } ou já um array. */
const items = (container: any): any[] => {
  if (Array.isArray(container)) return container;
  if (container && typeof container === 'object') {
    const vals = Object.values(container);
    if (vals.length === 1) return list(vals[0]);
    return [container];
  }
  return [];
};
const num = (v: any): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
};
const firstNum = (o: any, keys: string[]) => {
  for (const k of keys) { const n = num(o?.[k]); if (n !== null) return n; }
  return null;
};
const VALOR_KEYS = ['valorTotal', 'total', 'valor', 'tarifaTotal'];

export interface Pessoa { nome?: string; matricula?: string; email?: string }
export interface SolicitacaoNormalizada {
  id: string; status: string; tipo?: string; criadaEm?: string;
  centroDeCusto: { codigo?: string; nome?: string } | null;
  projeto: { codigo?: string; nome?: string } | null;
  solicitante: Pessoa | null; passageiros: Pessoa[];
  produtos: Record<Produto, number>;
  valorTotal: number | null;
  raw: any;
}

const pessoa = (p: any): Pessoa => ({ nome: p?.nome, matricula: p?.matricula, email: p?.email });

export function normalizeSolicitacao(raw: any): SolicitacaoNormalizada {
  const produtos = {} as Record<Produto, number>;
  let soma = 0; let temValor = false;
  for (const p of PRODUTOS) {
    const its = items(raw?.[p]);
    produtos[p] = its.length;
    for (const it of its) { const v = firstNum(it, VALOR_KEYS); if (v !== null) { soma += v; temValor = true; } }
  }
  const totalProprio = firstNum(raw?.totais, VALOR_KEYS) ?? firstNum(raw, ['valorTotal']);
  const ref = (o: any) => (o && typeof o === 'object' ? { codigo: o.codigo, nome: o.nome } : null);
  return {
    id: String(raw?.idSolicitacao ?? raw?.id ?? ''),
    status: String(raw?.status ?? ''),
    tipo: raw?.tipoSolicitacao ?? raw?.tipo,
    criadaEm: raw?.dataCriacao ?? raw?.dataSolicitacao ?? raw?.data,
    centroDeCusto: ref(raw?.centroDeCusto),
    projeto: ref(raw?.projeto),
    solicitante: raw?.solicitante ? pessoa(raw.solicitante) : null,
    passageiros: items(raw?.passageiros).map(pessoa),
    produtos,
    valorTotal: totalProprio ?? (temValor ? Math.round(soma * 100) / 100 : null),
    raw,
  };
}

export interface UnitRef { id: string; code?: string; name?: string }

/** Obra = centro de custo: casa pelo código, ou pelo código no começo do nome ("1040/24- Yakult…"). */
export function matchUnit(cc: { codigo?: string; nome?: string } | null, units: UnitRef[]): UnitRef | null {
  if (!cc) return null;
  const codigo = cc.codigo?.trim();
  const byCode = codigo ? units.find((u) => u.code?.trim() === codigo) : undefined;
  if (byCode) return byCode;
  const nome = cc.nome?.trim() ?? '';
  return units.find((u) => u.code && new RegExp(`^${u.code.trim().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(\\D|$)`).test(nome)) ?? null;
}
