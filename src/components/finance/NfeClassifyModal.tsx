import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { PackagePlus, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  autoLines, brl, classifyNfe, createCatalogItem, duplicatasExcess, lineCost, parcelasOf, registeredEntries,
} from '../../services/financeService';
import type { CostCenter, Item, WorkOrder } from '../../types';
import type { PurchaseOrder } from '../../types/purchasing';
import type { ClassifyLine, Destino, FinanceCategory, FinanceRule, NfeDocument, NfeItem } from '../../types/finance';
import { btnGhost, btnPrimary, fmtDate, input, label, msgErr } from './ui';

type CatalogItem = Item & { ean?: string };
const DESTINOS: { v: Destino; l: string }[] = [
  { v: 'estoque', l: 'Estoque' }, { v: 'consumo', l: 'Consumo (uso imediato)' }, { v: 'despesa', l: 'Despesa' },
];
const digits = (s?: string) => (s ?? '').replace(/\D/g, '');
const NONE = 'none'; // "Sem obra (administrativo)"

/** Note-level taxes and charges (read-only). */
export const NfeTaxSummary: React.FC<{ nfe: NfeDocument }> = ({ nfe }) => {
  const rows: [string, number | undefined][] = [
    ['Produtos', nfe.valorProdutos], ['Frete', nfe.valorFrete], ['Seguro', nfe.valorSeguro], ['Desconto', nfe.valorDesconto],
    ['Outras despesas', nfe.valorOutros], ['ICMS', nfe.valorIcms], ['ICMS-ST', nfe.valorSt], ['IPI', nfe.valorIpi],
    ['PIS', nfe.valorPis], ['COFINS', nfe.valorCofins], ['Total da nota', nfe.valorTotal],
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]" data-testid="nfe-taxes">
      {rows.filter(([, v]) => v != null).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2"><dt className="text-slate-400">{k}</dt><dd className="font-mono text-slate-200">{brl.format(v!)}</dd></div>
      ))}
    </dl>
  );
};

const LineTaxes: React.FC<{ it: NfeItem }> = ({ it }) => {
  const parts: [string, number | undefined][] = [
    ['Frete', it.vFrete], ['Seguro', it.vSeg], ['Outras', it.vOutro], ['Desconto', it.vDesc && -it.vDesc],
    ['IPI', it.impostos?.vIPI], ['ICMS-ST', it.impostos?.vICMSST], ['ICMS (informativo)', it.impostos?.vICMS],
  ];
  return (
    <p className="text-[11px] text-slate-400" data-testid={`line-taxes-${it.n}`}>
      Produto {brl.format(it.valorTotal)}
      {parts.filter(([, v]) => v).map(([k, v]) => ` · ${k} ${brl.format(v!)}`).join('')}
      {' · '}<span className="text-slate-200">Custo {brl.format(lineCost(it))}</span>
    </p>
  );
};

interface Props {
  nfe: NfeDocument;
  orgId: string;
  categories: FinanceCategory[];
  costCenters: CostCenter[];
  onClose: () => void;
  onDone: () => void;
}

export const NfeClassifyModal: React.FC<Props> = ({ nfe, orgId, categories, costCenters, onClose, onDone }) => {
  const { user, member, units, contracts, selectedUnitId } = useAuth();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [rules, setRules] = useState<FinanceRule[] | null>(null);
  const [locked, setLocked] = useState<Map<number, { itemId: string; unitId: string }> | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [lines, setLines] = useState<ClassifyLine[]>([]);
  const [obra, setObraState] = useState('');
  const [all, setAll] = useState<Partial<ClassifyLine>>({});
  const [venc, setVenc] = useState<Record<string, string>>({});
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeCats = categories.filter((c) => c.ativo !== false);
  const itens = nfe.itens ?? [];

  useEffect(() => {
    const byOrg = (c: string, f = 'orgId') => getDocs(query(collection(db, c), where(f, '==', orgId))).then((s) => s.docs.map((d) => ({ ...d.data(), id: d.id }) as any));
    Promise.all([byOrg('items'), byOrg('finance_rules'), registeredEntries(db, orgId, nfe)])
      .then(([i, r, l]) => { setItems(i); setRules(r); setLocked(l); })
      .catch((e) => { setError(`Falha ao carregar catálogo/regras: ${e.message}`); setItems([]); setRules([]); setLocked(new Map()); });
    byOrg('work_orders').then(setWorkOrders).catch(() => setWorkOrders([]));
    byOrg('purchasing_orders', 'organizationId')
      .then((os: PurchaseOrder[]) => setOrders(os.filter((o) => digits(o.supplierCnpj) === digits(nfe.emitente.cnpj) && !['recebida_total', 'cancelada'].includes(o.status))))
      .catch(() => setOrders([]));
  }, [orgId, nfe.id]);

  // Everything but the obra is classified automatically; lines already in stock (earlier attempt) stay as registered.
  useEffect(() => {
    if (!items || !rules || !locked) return;
    const unitId = (selectedUnitId && selectedUnitId !== 'todas' ? selectedUnitId : '') || units[0]?.id || '';
    const auto = autoLines(nfe, rules, items, categories.map((c) => c.id), orgId, unitId);
    setLines(auto.map((l) => (locked.has(l.n) ? { ...l, destino: 'estoque', ...locked.get(l.n)! } : l)));
  }, [items, rules, locked, categories.length]);

  const parcelas = parcelasOf(nfe);
  const excess = duplicatasExcess(nfe);
  const set = (n: number, patch: Partial<ClassifyLine>) => setLines((ls) => ls.map((l) => (l.n === n ? { ...l, ...patch } : l)));
  const setObra = (v: string) => {
    setObraState(v);
    const [kind, id] = v.split(':');
    const patch = kind === 'ct' ? { contractId: id, centroCustoId: undefined } : kind === 'cc' ? { centroCustoId: id, contractId: undefined }
      : { contractId: undefined, centroCustoId: undefined };
    setLines((ls) => ls.map((l) => ({ ...l, ...patch })));
  };
  const applyAll = () => {
    const patch = Object.fromEntries(Object.entries(all).filter(([, v]) => v)) as Partial<ClassifyLine>;
    setLines((ls) => ls.map((l) => (locked?.has(l.n) ? { ...l, ...patch, destino: 'estoque' } : { ...l, ...patch })));
  };
  const ready = lines.length > 0 && (obra === NONE || lines.every((l) => l.contractId || l.centroCustoId));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // Stock lines without a catalog match get a new catalog item (from the NF-e description/unit).
      const final: ClassifyLine[] = [];
      for (const l of lines) {
        if (l.destino !== 'estoque') { final.push({ ...l, itemId: undefined, unitId: undefined }); continue; }
        if (l.itemId) { final.push(l); continue; }
        const created = await createCatalogItem(db, orgId, itens.find((x) => x.n === l.n)!);
        setItems((xs) => [...(xs ?? []), created]);
        set(l.n, { itemId: created.id });
        final.push({ ...l, itemId: created.id });
      }
      await classifyNfe(db, {
        orgId, nfeId: nfe.id, lines: final, vencimentos: venc, purchaseOrderId: purchaseOrderId || undefined, rememberRules: remember,
        user: { uid: user?.uid ?? '', name: member?.userName || user?.displayName || user?.email || 'Usuário' },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sel = (value: string | undefined, onChange: (v: string) => void, opts: { v: string; l: string }[], empty: string, testId?: string) => (
    <select className={input} value={value ?? ''} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
      <option value="">{empty}</option>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const catName = (id: string) => categories.find((c) => c.id === id)?.nome ?? 'Sem categoria';
  const ctLabel = (c: (typeof contracts)[number]) => c.title || c.name || c.contractNumber;
  const catOpts = activeCats.map((c) => ({ v: c.id, l: c.nome }));
  const ccOpts = costCenters.map((c) => ({ v: c.id, l: `${c.code} — ${c.name}` }));
  const ctOpts = contracts.map((c) => ({ v: c.id, l: ctLabel(c) }));
  const woOpts = workOrders.map((w) => ({ v: w.id, l: `${w.orderNumber} — ${w.title}` }));
  const itemOpts = (items ?? []).map((i) => ({ v: i.id, l: `${i.sku} — ${i.name}` }));
  const unitOpts = units.map((u) => ({ v: u.id, l: u.name }));
  const destinoLabel = (l: ClassifyLine) => {
    if (l.destino !== 'estoque') return DESTINOS.find((d) => d.v === l.destino)!.l;
    const item = items?.find((i) => i.id === l.itemId);
    return `Estoque → ${item ? item.name : 'novo item no catálogo'} em ${units.find((u) => u.id === l.unitId)?.name ?? '—'}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F1420] border border-slate-800 w-full sm:max-w-4xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 bg-[#0F1420] border-b border-slate-800 px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">NF-e {nfe.numero} — {nfe.emitente.nome}</h3>
            <p className="text-[11px] text-slate-400">Emitida {fmtDate(nfe.emitidaEm)} · {brl.format(nfe.valorTotal)} · {itens.length} item(ns)</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <NfeTaxSummary nfe={nfe} />
          {excess > 0 && (
            <p className={msgErr}>As duplicatas somam {brl.format(excess)} a mais que o total da nota. Corrija com o fornecedor (carta de correção / nova nota) antes de classificar.</p>
          )}
          {!items || !rules || !locked ? <p className="text-xs text-slate-400">Carregando catálogo e regras…</p> : (
            <>
              <div className="rounded-xl border border-blue-800/60 bg-blue-950/20 p-3 space-y-2">
                <label className="block text-xs font-bold text-slate-100" htmlFor="nfe-obra">Obra / centro de custo *</label>
                <select id="nfe-obra" className={input} value={obra} onChange={(e) => setObra(e.target.value)} data-testid="obra">
                  <option value="">Selecione…</option>
                  {contracts.length > 0 && <optgroup label="Obras / contratos">{contracts.map((c) => <option key={c.id} value={`ct:${c.id}`}>{ctLabel(c)}</option>)}</optgroup>}
                  {costCenters.length > 0 && <optgroup label="Centros de custo">{costCenters.map((c) => <option key={c.id} value={`cc:${c.id}`}>{c.code} — {c.name}</option>)}</optgroup>}
                  <option value={NONE}>Sem obra (administrativo)</option>
                </select>
                <p className="text-[11px] text-slate-400">Aplicado a todas as linhas. Destino e categoria já vêm preenchidos — ajuste em "Avançado" se precisar.</p>
              </div>

              <div className="space-y-1">
                {lines.map((l) => {
                  const it = itens.find((x) => x.n === l.n)!;
                  return (
                    <div key={l.n} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/60 pb-1" data-testid={`summary-${l.n}`}>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-100 truncate">{l.n}. {it.descricao} <span className="text-slate-500">({it.quantidade} {it.unidade})</span></p>
                        <p className="text-[11px] text-slate-400 truncate">{destinoLabel(l)} · {catName(l.categoriaId)}</p>
                      </div>
                      <p className="text-xs font-bold text-white font-mono shrink-0">{brl.format(lineCost(it))}</p>
                    </div>
                  );
                })}
              </div>

              <details className="rounded-xl border border-slate-800 p-3" data-testid="advanced">
                <summary className="text-xs font-semibold text-slate-300 cursor-pointer">Avançado: ajustar por linha, impostos, parcelas</summary>
                <div className="space-y-3 mt-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-300">Aplicar a todas as linhas</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {sel(all.destino, (v) => setAll({ ...all, destino: (v || undefined) as Destino }), DESTINOS, 'Destino…')}
                      {sel(all.categoriaId, (v) => setAll({ ...all, categoriaId: v }), catOpts, 'Categoria…')}
                      {sel(all.workOrderId, (v) => setAll({ ...all, workOrderId: v }), woOpts, 'OS…')}
                    </div>
                    <button type="button" className={btnGhost} onClick={applyAll}>Aplicar a todas</button>
                  </div>

                  {lines.map((l) => {
                    const it = itens.find((x) => x.n === l.n)!;
                    const isLocked = locked.has(l.n);
                    return (
                      <div key={l.n} className="rounded-xl border border-slate-800 p-3 space-y-2" data-testid={`line-${l.n}`}>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100">{l.n}. {it.descricao}</p>
                          <p className="text-[11px] text-slate-400">NCM {it.ncm} · CFOP {it.cfop} · {it.quantidade} {it.unidade} × {brl.format(it.valorUnitario)}</p>
                          <LineTaxes it={it} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                          <div><span className={label}>Destino</span>{isLocked
                            ? <p className={`${input} opacity-70`}>Estoque (entrada já registrada)</p>
                            : sel(l.destino, (v) => set(l.n, { destino: (v || 'despesa') as Destino }), DESTINOS, 'Destino…', `destino-${l.n}`)}</div>
                          <div><span className={label}>Categoria *</span>{sel(l.categoriaId, (v) => set(l.n, { categoriaId: v }), catOpts, 'Selecione…', `categoria-${l.n}`)}</div>
                          <div><span className={label}>Centro de custo</span>{sel(l.centroCustoId, (v) => set(l.n, { centroCustoId: v || undefined }), ccOpts, '—')}</div>
                          <div><span className={label}>Obra / contrato</span>{sel(l.contractId, (v) => set(l.n, { contractId: v || undefined }), ctOpts, '—')}</div>
                          <div><span className={label}>OS</span>{sel(l.workOrderId, (v) => set(l.n, { workOrderId: v || undefined }), woOpts, '—')}</div>
                        </div>
                        {l.destino === 'estoque' && isLocked && (
                          <p className="text-[11px] text-slate-400">Entrada já registrada: {items.find((i) => i.id === l.itemId)?.name ?? l.itemId} em {units.find((u) => u.id === l.unitId)?.name ?? l.unitId}.</p>
                        )}
                        {l.destino === 'estoque' && !isLocked && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                            <div><span className={label}>Item do catálogo</span>{sel(l.itemId, (v) => set(l.n, { itemId: v || undefined }), itemOpts, 'Criar item novo ao confirmar', `item-${l.n}`)}</div>
                            <div><span className={label}>Unidade (almoxarifado) *</span>{sel(l.unitId, (v) => set(l.n, { unitId: v || undefined }), unitOpts, 'Selecione…', `unit-${l.n}`)}</div>
                            {!l.itemId && <p className="text-[11px] text-slate-400 flex items-center gap-1 sm:col-span-2"><PackagePlus className="w-3.5 h-3.5" />Sem item correspondente: será criado no catálogo como "{it.descricao}".</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="rounded-xl border border-slate-800 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-300">Contas a pagar ({parcelas.length} parcela{parcelas.length > 1 ? 's' : ''})</p>
                    {parcelas.map((p) => (
                      <div key={p.parcela} className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-xs text-slate-300 sm:w-40">Parcela {p.parcela} · {brl.format(p.valor)}</span>
                        <input type="date" className={`${input} sm:w-48`} value={venc[p.parcela] ?? p.vencimento}
                          onChange={(e) => setVenc({ ...venc, [p.parcela]: e.target.value })} aria-label={`Vencimento parcela ${p.parcela}`} />
                      </div>
                    ))}
                    {orders.length > 0 && (
                      <div><span className={label}>Vincular à ordem de compra (mesmo fornecedor)</span>
                        {sel(purchaseOrderId, setPurchaseOrderId, orders.map((o) => ({ v: o.id, l: `${o.code} — ${brl.format(o.totalValue ?? 0)}` })), 'Sem vínculo')}
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Lembrar esta classificação para próximas notas deste fornecedor/NCM
                  </label>
                </div>
              </details>
            </>
          )}
          {error && <p className={msgErr}>{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-[#0F1420] border-t border-slate-800 px-4 py-3 flex flex-col-reverse sm:flex-row justify-end items-stretch sm:items-center gap-2">
          {!ready && lines.length > 0 && <span className="text-[11px] text-amber-300 sm:mr-auto">Informe a obra / centro de custo para confirmar.</span>}
          <button type="button" className={btnGhost} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={busy || !ready || excess > 0}>
            {busy ? 'Classificando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};
