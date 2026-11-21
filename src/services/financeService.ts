import {
  collection, deleteField, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore';
import { applyStockMovement, movementIdFor } from './stockService';
import type { Item } from '../types';
import type {
  CategoryGroup, ClassifyLine, Destino, FinanceCategory, FinancePayable, FinanceRule, NfeDocument, NfeItem, Rateio,
} from '../types/finance';

// ---- Pure helpers ------------------------------------------------------------

export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const round2 = (n: number) => Math.round(n * 100) / 100;
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
/** Strips undefined (Firestore rejects it). */
const clean = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const catId = (orgId: string, slug: string) => `cat_${orgId}_${slug}`;

/** Default chart of accounts for industrial assembly (configuration, created only when the org has none). */
export const DEFAULT_CATEGORIES: { slug: string; nome: string; grupo: CategoryGroup }[] = [
  { slug: 'materiais-diretos', nome: 'Materiais diretos', grupo: 'Custo direto' },
  { slug: 'consumiveis-solda-corte', nome: 'Consumíveis de solda e corte', grupo: 'Custo direto' },
  { slug: 'gases-industriais', nome: 'Gases industriais', grupo: 'Custo direto' },
  { slug: 'epi-uniformes', nome: 'EPI e uniformes', grupo: 'Custo indireto' },
  { slug: 'ferramentas', nome: 'Ferramentas', grupo: 'Custo indireto' },
  { slug: 'locacao-equipamentos', nome: 'Locação de equipamentos (guindaste/munck/PTA)', grupo: 'Custo direto' },
  { slug: 'andaimes', nome: 'Andaimes', grupo: 'Custo direto' },
  { slug: 'combustivel-frota', nome: 'Combustível e frota', grupo: 'Custo indireto' },
  { slug: 'hospedagem', nome: 'Hospedagem', grupo: 'Custo indireto' },
  { slug: 'alimentacao', nome: 'Alimentação', grupo: 'Custo indireto' },
  { slug: 'passagens-deslocamento', nome: 'Passagens e deslocamento', grupo: 'Custo indireto' },
  { slug: 'servicos-terceiros', nome: 'Serviços de terceiros (END, usinagem, tratamento térmico)', grupo: 'Custo direto' },
  { slug: 'manutencao-equipamentos', nome: 'Manutenção de equipamentos', grupo: 'Custo indireto' },
  { slug: 'impostos-taxas', nome: 'Impostos e taxas', grupo: 'Impostos' },
  { slug: 'administrativo', nome: 'Administrativo', grupo: 'Despesa administrativa' },
];

export type Suggestion = { destino: Destino; categoriaId?: string; centroCustoId?: string; itemId?: string };

/** Learned rule for this supplier/NCM; priority cnpj_ncm > ncm > cnpj. */
export function suggestClassification(rules: FinanceRule[], nfe: Pick<NfeDocument, 'emitente'>, item: Pick<NfeItem, 'ncm'>): Suggestion | null {
  const cnpj = digits(nfe.emitente?.cnpj);
  for (const k of [`cnpj_ncm:${cnpj}_${item.ncm}`, `ncm:${item.ncm}`, `cnpj:${cnpj}`]) {
    const r = rules.find((x) => x.chave === k);
    if (r) return clean({ destino: r.destino, categoriaId: r.categoriaId, centroCustoId: r.centroCustoId, itemId: r.itemId });
  }
  return null;
}

/** Fallback by CFOP. The XML carries the issuer's CFOP (5/6/7.xxx); we map it to the entry side (1/2/3.xxx). */
export function cfopDefault(cfop: string, orgId: string): Suggestion {
  const d = digits(cfop);
  const entry = ({ '5': '1', '6': '2', '7': '3' } as Record<string, string>)[d[0]] ?? d[0];
  const c = entry + d.slice(1);
  if (c === '1556' || c === '2556') return { destino: 'consumo' };
  if (c === '1551' || c === '2551') return { destino: 'despesa', categoriaId: catId(orgId, 'ferramentas') };
  if (['1101', '1102', '2101', '2102'].includes(c)) return { destino: 'estoque' };
  return { destino: 'despesa' };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Existing catalog item for an NF-e line: by EAN, then by normalized description. */
export function matchCatalogItem<T extends { id: string; name: string; ean?: string }>(items: T[], it: Pick<NfeItem, 'ean' | 'descricao'>): T | undefined {
  const ean = /^\d{8,14}$/.test(it.ean ?? '') ? it.ean : undefined;
  return (ean && items.find((i) => i.ean === ean)) || items.find((i) => norm(i.name) === norm(it.descricao));
}

/** Splits `valor` across the line groups proportionally; the last share takes the rounding remainder. */
function allocate(valor: number, groups: Rateio[]): Rateio[] {
  const total = groups.reduce((s, g) => s + g.valor, 0);
  let left = round2(valor);
  return groups.map((g, i) => {
    const v = i === groups.length - 1 ? left : round2(total > 0 ? (valor * g.valor) / total : i === 0 ? valor : 0);
    left = round2(left - v);
    return { ...g, valor: v };
  });
}

/** Line acquisition cost: parsed custoTotal (vProd + frete + seguro + outros + ST + IPI − desconto), else vProd. */
export const lineCost = (it: Pick<NfeItem, 'valorTotal' | 'custoTotal'>) => it.custoTotal ?? it.valorTotal;

/**
 * Stock cost per unit: the line's custoTotal; for notes parsed before the tax extraction, vProd with the note's
 * extras spread by product value (vNF / Σ vProd).
 * shortcut: recoverable ICMS/IPI (Lucro Real) not deducted; add per-org tax setting when needed
 */
export function stockUnitCost(nfe: Pick<NfeDocument, 'valorTotal' | 'itens'>, it: Pick<NfeItem, 'quantidade' | 'valorTotal' | 'custoTotal'>): number {
  if (!(it.quantidade > 0)) return 0;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  if (it.custoTotal != null) return r4(it.custoTotal / it.quantidade);
  const sum = (nfe.itens ?? []).reduce((s, i) => s + i.valorTotal, 0);
  return r4((it.valorTotal * (sum > 0 ? nfe.valorTotal / sum : 1)) / it.quantidade);
}

/** Category used when neither a rule nor the CFOP names one (default chart slugs). */
const FALLBACK_CAT: Record<Destino, string> = { estoque: 'materiais-diretos', consumo: 'materiais-diretos', despesa: 'administrativo' };

/**
 * Automatic classification of every line: learned rule → CFOP default, then the default category for the destino, and
 * the catalog match + default unit for stock. Stock lines without a unit fall back to consumo (nowhere to stock them).
 * Leaves only the obra / centro de custo for the user.
 */
export function autoLines(
  nfe: Pick<NfeDocument, 'emitente' | 'itens'>, rules: FinanceRule[], items: { id: string; name: string; ean?: string }[],
  categoryIds: string[], orgId: string, unitId: string,
): ClassifyLine[] {
  const known = (id?: string) => (id && categoryIds.includes(id) ? id : undefined);
  return (nfe.itens ?? []).map((it) => {
    const s = suggestClassification(rules, nfe, it) ?? cfopDefault(it.cfop, orgId);
    const destino: Destino = s.destino === 'estoque' && !unitId ? 'consumo' : s.destino;
    const categoriaId = known(s.categoriaId) ?? known(catId(orgId, FALLBACK_CAT[destino])) ?? '';
    return clean<ClassifyLine>({
      n: it.n, destino, categoriaId, centroCustoId: s.centroCustoId,
      ...(destino === 'estoque' ? { itemId: s.itemId || matchCatalogItem(items, it)?.id, unitId } : {}),
    });
  });
}

const dupSum = (nfe: Pick<NfeDocument, 'duplicatas'>) => round2((nfe.duplicatas ?? []).reduce((s, d) => s + d.valor, 0));

/** How much the duplicatas exceed vNF (0 when they don't): such a note cannot be classified as-is. */
export function duplicatasExcess(nfe: Pick<NfeDocument, 'duplicatas' | 'valorTotal'>): number {
  return nfe.duplicatas?.length ? Math.max(0, round2(dupSum(nfe) - nfe.valorTotal)) : 0;
}

/** Installments: the duplicatas plus a 'saldo' due at emission when they fall short of vNF; none → one at emission + 30 days. */
export function parcelasOf(nfe: Pick<NfeDocument, 'duplicatas' | 'valorTotal' | 'emitidaEm'>): { parcela: string; valor: number; vencimento: string }[] {
  if (!nfe.duplicatas?.length) return [{ parcela: '1', valor: round2(nfe.valorTotal), vencimento: addDays(nfe.emitidaEm, 30) }];
  const ps = nfe.duplicatas.map((d, i) => ({ parcela: d.numero || String(i + 1), valor: d.valor, vencimento: d.vencimento }));
  const gap = round2(nfe.valorTotal - dupSum(nfe));
  return gap > 0.005 ? [...ps, { parcela: 'saldo', valor: gap, vencimento: nfe.emitidaEm.slice(0, 10) }] : ps;
}

export function buildPayables(
  nfe: Pick<NfeDocument, 'chave' | 'numero' | 'emitidaEm' | 'valorTotal' | 'emitente' | 'itens' | 'duplicatas'>,
  lines: ClassifyLine[],
  opts: { orgId: string; user: { uid: string; name: string }; now: string; vencimentos?: Record<string, string>; purchaseOrderId?: string },
): FinancePayable[] {
  const value = new Map((nfe.itens ?? []).map((i) => [i.n, lineCost(i)]));
  const groups = new Map<string, Rateio>();
  const byCat = new Map<string, number>();
  for (const l of lines) {
    const v = value.get(l.n) ?? 0;
    const k = [l.categoriaId, l.centroCustoId ?? '', l.contractId ?? '', l.workOrderId ?? ''].join('|');
    const g = groups.get(k) ?? { categoriaId: l.categoriaId, centroCustoId: l.centroCustoId, contractId: l.contractId, workOrderId: l.workOrderId, valor: 0 };
    g.valor += v;
    groups.set(k, g);
    byCat.set(l.categoriaId, (byCat.get(l.categoriaId) ?? 0) + v);
  }
  const categoriaId = [...byCat].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const only = (k: 'centroCustoId' | 'contractId' | 'workOrderId') => {
    const s = new Set(lines.map((l) => l[k]));
    return s.size === 1 ? [...s][0] : undefined;
  };
  return parcelasOf(nfe).map((p) => clean<FinancePayable>({
    id: `pay_${opts.orgId}_${nfe.chave}_${safeId(p.parcela)}`,
    orgId: opts.orgId,
    origem: 'nfe',
    fornecedor: { cnpj: digits(nfe.emitente.cnpj), nome: nfe.emitente.nome },
    documento: `NF-e ${nfe.numero ?? nfe.chave}`,
    parcela: p.parcela,
    valor: round2(p.valor),
    vencimento: opts.vencimentos?.[p.parcela] || p.vencimento,
    status: 'aberto',
    categoriaId,
    centroCustoId: only('centroCustoId'),
    contractId: only('contractId'),
    workOrderId: only('workOrderId'),
    nfeChave: nfe.chave,
    purchaseOrderId: opts.purchaseOrderId,
    rateio: allocate(p.valor, [...groups.values()]),
    createdAt: opts.now,
    createdBy: opts.user.uid,
  }));
}

type Kpi = { qtd: number; valor: number };
export function payableKpis(ps: Pick<FinancePayable, 'status' | 'valor' | 'vencimento' | 'pagoEm'>[], today: string) {
  const month = today.slice(0, 7);
  const in7 = addDays(today, 7);
  const k = { atrasadas: { qtd: 0, valor: 0 }, vence7: { qtd: 0, valor: 0 }, aPagarMes: { qtd: 0, valor: 0 }, pagoMes: { qtd: 0, valor: 0 } };
  const add = (x: Kpi, v: number) => { x.qtd++; x.valor = round2(x.valor + v); };
  for (const p of ps) {
    if (p.status === 'aberto') {
      if (p.vencimento < today) add(k.atrasadas, p.valor);
      else if (p.vencimento <= in7) add(k.vence7, p.valor);
      if (p.vencimento.startsWith(month)) add(k.aPagarMes, p.valor);
    } else if (p.status === 'pago' && (p.pagoEm ?? '').startsWith(month)) add(k.pagoMes, p.valor);
  }
  return k;
}

// ---- Firestore ---------------------------------------------------------------

/** Creates the default chart when the org has none. Deterministic ids: concurrent first opens write the same docs. */
export async function ensureDefaultCategories(db: Firestore, orgId: string): Promise<boolean> {
  const any = await getDocs(query(collection(db, 'finance_categories'), where('orgId', '==', orgId), limit(1)));
  if (!any.empty) return false;
  const b = writeBatch(db);
  for (const c of DEFAULT_CATEGORIES) {
    const id = catId(orgId, c.slug);
    b.set(doc(db, 'finance_categories', id), { id, orgId, nome: c.nome, grupo: c.grupo, ativo: true } satisfies FinanceCategory);
  }
  await b.commit();
  return true;
}

/**
 * Adds an NF-e line to the catalog with the shape ItemsServicesModule writes. With `id` it is create-if-absent
 * (classification retries reuse the item created by an earlier attempt).
 */
export async function createCatalogItem(db: Firestore, orgId: string, it: NfeItem, fixedId?: string): Promise<Item & { ean?: string }> {
  const now = new Date().toISOString();
  const id = fixedId ?? `item_peca_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  if (fixedId) {
    const existing = (await getDoc(doc(db, 'items', id))).data();
    if (existing) return existing as Item;
  }
  const item = clean<Item & { ean?: string }>({
    id, orgId, sku: it.codigo || id, code: it.codigo || undefined, name: it.descricao, description: `NCM ${it.ncm}`,
    type: 'peca', category: 'Sem categoria', unitOfMeasure: (it.unidade || 'UN').toUpperCase(), status: 'ACTIVE', active: true,
    referencePrice: it.valorUnitario, averageCost: it.valorUnitario, minStock: 0, maxStock: 0,
    ean: /^\d{8,14}$/.test(it.ean ?? '') ? it.ean : undefined, createdAt: now, updatedAt: now,
  });
  await setDoc(doc(db, 'items', id), item);
  return item;
}

export interface ClassifyInput {
  orgId: string;
  nfeId: string;
  lines: ClassifyLine[];
  vencimentos?: Record<string, string>;
  purchaseOrderId?: string;
  user: { uid: string; name: string };
  rememberRules: boolean;
}

/** Stock movement already registered for each NF-e line (by the deterministic sourceRef id), keyed by line n. */
export async function registeredEntries(db: Firestore, orgId: string, nfe: Pick<NfeDocument, 'chave' | 'itens'>) {
  const out = new Map<number, { itemId: string; unitId: string }>();
  await Promise.all((nfe.itens ?? []).map(async (it) => {
    const m = (await getDoc(doc(db, 'stock_movements', movementIdFor(orgId, `nfe:${nfe.chave}:${it.n}`)))).data();
    if (m) out.set(it.n, { itemId: m.itemId, unitId: m.unitId });
  }));
  return out;
}

/** Ends run `runId` with `patch` only if it still owns the note (not released / superseded). Returns false when stale. */
export async function finalizeRun(db: Firestore, nfeId: string, runId: string, patch: Record<string, unknown>): Promise<boolean> {
  const ref = doc(db, 'nfe_documents', nfeId);
  return runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data() as NfeDocument | undefined;
    if (d?.status !== 'classificando' || d.classificacao?.runId !== runId) return false;
    tx.update(ref, patch);
    return true;
  });
}

/**
 * Guard (transaction: aguardando_classificacao|erro_classificacao → classificando, with a runId), then stock, payables
 * and rules with deterministic ids, then → classificada. Any failure after the guard → erro_classificacao; a retry is
 * idempotent. A run released meanwhile (see releaseStuckNfe) ends quietly without touching the status.
 */
export async function classifyNfe(db: Firestore, input: ClassifyInput): Promise<void> {
  const ref = doc(db, 'nfe_documents', input.nfeId);
  const lines = clean(input.lines);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const autoItem = new Set<number>(); // stock lines without a catalog item: created in the run under a per-line id
  const nfe = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    const d = s.data() as NfeDocument | undefined;
    if (!d || d.orgId !== input.orgId) throw new Error('Nota não encontrada.');
    if (d.status !== 'aguardando_classificacao' && d.status !== 'erro_classificacao') throw new Error('Nota já classificada');
    const excess = duplicatasExcess(d);
    if (excess > 0) throw new Error(`As duplicatas somam ${brl.format(excess)} a mais que o total da nota; corrija com o fornecedor antes de classificar.`);
    for (const it of d.itens ?? []) {
      const l = lines.find((x) => x.n === it.n);
      if (!l?.categoriaId) throw new Error(`Item ${it.n}: informe a categoria.`);
      if (l.destino === 'estoque' && !l.unitId) throw new Error(`Item ${it.n}: estoque exige unidade (almoxarifado).`);
      // Resolve the auto-created item id now, so a retry compares against what an earlier attempt registered.
      if (l.destino === 'estoque' && (!l.itemId || autoItem.has(l.n))) {
        l.itemId = `item_nfe_${input.orgId}_${d.chave}_${l.n}`;
        autoItem.add(l.n);
      }
      // A previous attempt may already have put this line in stock: it must stay there, same item and unit.
      const m = (await tx.get(doc(db, 'stock_movements', movementIdFor(input.orgId, `nfe:${d.chave}:${it.n}`)))).data();
      if (m && (l.destino !== 'estoque' || l.itemId !== m.itemId || l.unitId !== m.unitId)) {
        throw new Error(`Item ${it.n}: entrada em estoque já registrada; mantenha destino estoque, mesmo item e unidade.`);
      }
    }
    tx.update(ref, {
      status: 'classificando', classificacao: { runId, by: input.user.uid, startedAt: serverTimestamp() }, updatedAt: new Date().toISOString(),
    });
    return { ...d, id: s.id };
  });

  try {
    const byN = new Map((nfe.itens ?? []).map((i) => [i.n, i]));
    for (const l of lines.filter((x) => x.destino === 'estoque')) {
      const it = byN.get(l.n)!;
      // No catalog match: create the item now (inside the run); create-if-absent, so a retry reuses it.
      if (autoItem.has(l.n)) await createCatalogItem(db, input.orgId, it, l.itemId);
      const cat = (await getDoc(doc(db, 'items', l.itemId!))).data() as Item | undefined;
      if (!cat) throw new Error(`Item ${l.n}: item do catálogo não encontrado.`);
      try {
        await applyStockMovement(db, {
          orgId: input.orgId, unitId: l.unitId!, type: 'entrada', quantity: it.quantidade,
          item: { id: l.itemId!, sku: cat.sku, name: cat.name, unitOfMeasure: cat.unitOfMeasure },
          unitCost: it.quantidade > 0 ? stockUnitCost(nfe, it) : undefined,
          reason: `Entrada NF-e ${nfe.numero ?? ''} - ${nfe.emitente.nome}`.trim(),
          sourceRef: `nfe:${nfe.chave}:${l.n}`, user: input.user,
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === 'Movimento já registrado')) throw e; // applied by an earlier attempt
      }
    }

    const now = new Date().toISOString();
    const payables = buildPayables(nfe, lines, { orgId: input.orgId, user: input.user, now, vencimentos: input.vencimentos, purchaseOrderId: input.purchaseOrderId });
    await runTransaction(db, async (tx) => {
      const refs = payables.map((p) => doc(db, 'finance_payables', p.id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((s, i) => { if (!s.exists()) tx.set(refs[i], payables[i]); }); // never overwrite (may be paid already)
    });

    if (input.rememberRules) {
      const b = writeBatch(db);
      const cnpj = digits(nfe.emitente.cnpj);
      for (const l of lines) {
        const ncm = byN.get(l.n)?.ncm;
        if (!ncm) continue;
        const chave = `cnpj_ncm:${cnpj}_${ncm}`;
        b.set(doc(db, 'finance_rules', `rule_${input.orgId}_${cnpj}_${safeId(ncm)}`), clean<FinanceRule>({
          orgId: input.orgId, chave, destino: l.destino, categoriaId: l.categoriaId, centroCustoId: l.centroCustoId, itemId: l.itemId, updatedAt: now,
        }));
      }
      await b.commit();
    }

    await finalizeRun(db, input.nfeId, runId, {
      status: 'classificada',
      classificacao: clean({ runId, lines, at: now, by: input.user.uid, byName: input.user.name, purchaseOrderId: input.purchaseOrderId }),
      erroClassificacao: deleteField(),
      updatedAt: now,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finalizeRun(db, input.nfeId, runId, { status: 'erro_classificacao', erroClassificacao: msg, updatedAt: new Date().toISOString() }).catch(() => {});
    throw e;
  }
}

export const STUCK_MS = 2 * 60_000;

/** Admin/Gerente: frees a note left 'classificando' ≥ 2 min (rules check server time); the stale run then cannot finish. */
export async function releaseStuckNfe(db: Firestore, nfeId: string): Promise<void> {
  await updateDoc(doc(db, 'nfe_documents', nfeId), {
    status: 'erro_classificacao', erroClassificacao: 'Classificação interrompida; classifique novamente.', updatedAt: new Date().toISOString(),
  });
}
