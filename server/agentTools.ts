import { Type } from '@google/genai';
import type { AdminHandles } from './firebaseAdmin.ts';
import { funnelSummary } from '../src/services/commercialFunnelService.ts';

type H = Pick<AdminHandles, 'db'>;
type Args = Record<string, any>;

const TZ = 'America/Sao_Paulo';
const spDate = (iso?: string) => (iso ? (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString('sv', { timeZone: TZ })) : '');
const todaySP = () => new Date().toLocaleDateString('sv', { timeZone: TZ });
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;
const list = async (h: H, col: string, orgField: string, orgId: string) =>
  (await h.db.collection(col).where(orgField, '==', orgId).get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
const posInt = (v: unknown, def: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : def);

export const agentToolDeclarations = [
  { name: 'contas_a_pagar', description: 'Contas a pagar em aberto: total atrasado, total vencendo nos próximos N dias, e totais por categoria.', parameters: { type: Type.OBJECT, properties: { dias: { type: Type.NUMBER, description: 'Janela em dias a partir de hoje (padrão 7)' } } } },
  { name: 'notas_pendentes', description: 'Notas fiscais (NF-e) aguardando classificação ou com erro de classificação: quantidade e as 5 maiores.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'estoque_critico', description: 'Itens de estoque com saldo igual ou abaixo do estoque mínimo/crítico.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'os_abertas', description: 'Ordens de serviço não concluídas, com contagem de atrasadas (prazo vencido).', parameters: { type: Type.OBJECT, properties: { atrasadas: { type: Type.BOOLEAN, description: 'Se true, lista somente as atrasadas' } } } },
  { name: 'nr_vencendo', description: 'Certificações NR/ASO de funcionários de campo vencidas ou vencendo nos próximos N dias.', parameters: { type: Type.OBJECT, properties: { dias: { type: Type.NUMBER, description: 'Janela em dias (padrão 30)' } } } },
  { name: 'funil_comercial', description: 'Funil comercial: propostas por status (quantidade e valor), previsão ponderada e taxa de ganho.', parameters: { type: Type.OBJECT, properties: {} } },
];

const tools: Record<string, (h: H, orgId: string, a: Args) => Promise<object>> = {
  async contas_a_pagar(h, orgId, a) {
    const dias = posInt(a.dias, 7), today = todaySP(), limit = addDays(today, dias);
    const [pay, cats] = await Promise.all([list(h, 'finance_payables', 'orgId', orgId), list(h, 'finance_categories', 'orgId', orgId)]);
    const catName = new Map(cats.map((c) => [c.id, c.nome as string]));
    const open = pay.filter((p) => p.status === 'aberto');
    const sum = (xs: any[]) => round(xs.reduce((s, p) => s + (Number(p.valor) || 0), 0));
    const late = open.filter((p) => p.vencimento < today), soon = open.filter((p) => p.vencimento >= today && p.vencimento <= limit);
    const porCategoria: Record<string, number> = {};
    for (const p of [...late, ...soon]) { const n = catName.get(p.categoriaId) ?? 'Sem categoria'; porCategoria[n] = round((porCategoria[n] ?? 0) + (Number(p.valor) || 0)); }
    const top = (xs: any[]) => [...xs].sort((x, y) => y.valor - x.valor).slice(0, 5).map((p) => ({ fornecedor: p.fornecedor?.nome, valor: p.valor, vencimento: p.vencimento }));
    return { hoje: today, dias, atrasadas: { qtd: late.length, total: sum(late), maiores: top(late) }, vencendo: { qtd: soon.length, total: sum(soon), maiores: top(soon) }, porCategoria };
  },
  async notas_pendentes(h, orgId) {
    const nfe = (await list(h, 'nfe_documents', 'orgId', orgId)).filter((n) => n.status === 'aguardando_classificacao' || n.status === 'erro_classificacao');
    const top = [...nfe].sort((x, y) => (y.valorTotal || 0) - (x.valorTotal || 0)).slice(0, 5).map((n) => ({ numero: n.numero, emitente: n.emitente?.nome, valorTotal: n.valorTotal, status: n.status }));
    return { quantidade: nfe.length, total: round(nfe.reduce((s, n) => s + (n.valorTotal || 0), 0)), maiores: top };
  },
  async estoque_critico(h, orgId) {
    const [bal, items] = await Promise.all([list(h, 'stock_balances', 'orgId', orgId), list(h, 'items', 'orgId', orgId)]);
    const saldo = new Map<string, number>();
    for (const b of bal) saldo.set(b.itemId, (saldo.get(b.itemId) ?? 0) + (Number(b.currentBalance) || 0));
    const crit = items.flatMap((i) => {
      const s = saldo.get(i.id) ?? 0, min = i.criticalStock || i.minStock || 0;
      return min > 0 && s <= min ? [{ item: i.name, saldo: s, minimo: min, critico: !!i.criticalStock && s <= i.criticalStock }] : [];
    }).sort((x, y) => Number(y.critico) - Number(x.critico) || x.saldo / x.minimo - y.saldo / y.minimo);
    return { quantidade: crit.length, itens: crit.slice(0, 5) };
  },
  async os_abertas(h, orgId, a) {
    const [wos, st] = await Promise.all([list(h, 'work_orders', 'orgId', orgId), list(h, 'work_order_statuses', 'orgId', orgId)]);
    const done = st.length ? st.filter((s) => s.isCompleted).map((s) => s.id.replace(`${orgId}_`, '')) : ['concluido', 'validado', 'concluida', 'encerrada'];
    const today = todaySP();
    const open = wos.filter((w) => !done.includes(w.status));
    const late = open.filter((w) => w.scheduledEndDate && spDate(w.scheduledEndDate) < today);
    const shown = (a.atrasadas ? late : open).sort((x, y) => (x.scheduledEndDate || '9').localeCompare(y.scheduledEndDate || '9')).slice(0, 5)
      .map((w) => ({ numero: w.orderNumber, titulo: w.title, status: w.status, prazo: w.scheduledEndDate }));
    return { abertas: open.length, atrasadas: late.length, lista: shown };
  },
  async nr_vencendo(h, orgId, a) {
    const dias = posInt(a.dias, 30), today = todaySP(), limit = addDays(today, dias);
    const workers = (await list(h, 'field_workers', 'orgId', orgId)).filter((w) => w.status !== 'desligado');
    const rows = workers.flatMap((w) => (w.nrCertifications ?? []).filter((c: any) => c.expirationDate && c.expirationDate <= limit)
      .map((c: any) => ({ funcionario: w.name, nr: c.nrCode, vencimento: c.expirationDate, vencida: c.expirationDate < today })))
      .sort((x, y) => x.vencimento.localeCompare(y.vencimento));
    return { hoje: today, dias, quantidade: rows.length, vencidas: rows.filter((r) => r.vencida).length, lista: rows.slice(0, 5) };
  },
  async funil_comercial(h, orgId) {
    const s = funnelSummary((await list(h, 'commercial_proposals', 'organizationId', orgId)) as any);
    return { porStatus: s.byStatus, previsaoPonderada: round(s.forecast), taxaGanho: s.winRate, motivosPerda: s.lossReasons.slice(0, 3) };
  },
};

/** Read-only ERP lookup for the agent; errors come back as data so the model can say what is unavailable. */
export async function runAgentTool(h: H, orgId: string, name: string, args: Args = {}): Promise<object> {
  const fn = tools[name];
  if (!fn) return { erro: `ferramenta desconhecida: ${name}` };
  try { return await fn(h, orgId, args ?? {}); } catch (e) { console.warn(`[agentTools] ${name}:`, e); return { erro: `dados indisponíveis (${name})` }; }
}

/** WhatsApp gate: ERP data only for the connected owner or an explicitly authorized phone. */
export function canUseErpTools(o: { isOwner: boolean; senderDigits: string; authorizedPhones: string[] }): boolean {
  return o.isOwner || (!!o.senderDigits && o.authorizedPhones.includes(o.senderDigits));
}

/** Web gate: master or Admin/Gerente/Supervisor in the org. */
export function canQueryErp(user: { master: boolean; orgs: Record<string, string> } | undefined, orgId: string): boolean {
  return !!user && (user.master || ['Admin', 'Gerente', 'Supervisor'].includes(user.orgs[orgId]));
}

export const ERP_QUESTION = /\b(contas?|pagar|vencid[oa]s?|vencendo|notas?|nf-?e|estoque|os|ordens?|servi[cç]os?|nr-?\d*|certifica[cç][aã]o|funil|propostas?|comercial|atrasad[oa]s?)\b/i;

export type AgentGen = (p: { contents: any[]; config: any }) => Promise<any>;
const SYSTEM = `Você é o @aguero, assistente do ERP AgueroFlow no WhatsApp. Responda em português do Brasil, de forma curta, com formatação WhatsApp (*negrito*, listas curtas com •). Use as ferramentas para consultar dados da empresa. Cite APENAS números retornados pelas ferramentas; nunca invente. Se uma ferramenta retornar erro, diga qual dado está indisponível.`;

export async function answerWithTools(
  h: H, orgId: string, question: string, history: { role: string; text: string }[] = [], gen: AgentGen,
): Promise<string> {
  const contents: any[] = [
    ...history.slice(-6).map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text).slice(0, 1000) }] })),
    { role: 'user', parts: [{ text: question }] },
  ];
  const config = { systemInstruction: SYSTEM, temperature: 0.2, tools: [{ functionDeclarations: agentToolDeclarations }] };
  for (let round = 0; round < 4; round++) {
    const res = await gen({ contents, config });
    const calls: { name: string; args?: Args }[] = res.functionCalls ?? [];
    if (!calls.length) return (res.text || '').trim();
    contents.push(res.candidates?.[0]?.content ?? { role: 'model', parts: calls.map((functionCall) => ({ functionCall })) });
    const parts = [];
    for (const c of calls.slice(0, 6)) parts.push({ functionResponse: { name: c.name, response: await runAgentTool(h, orgId, c.name, c.args) } });
    contents.push({ role: 'user', parts });
  }
  // Rounds exhausted: force a text answer from what was gathered.
  const last = await gen({ contents, config: { ...config, tools: undefined } });
  return (last.text || '').trim();
}
