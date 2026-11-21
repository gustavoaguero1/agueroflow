import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { PackagePlus, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  addDays, brl, cfopDefault, classifyNfe, createCatalogItem, matchCatalogItem, suggestClassification,
} from '../../services/financeService';
import type { CostCenter, Item, WorkOrder } from '../../types';
import type { PurchaseOrder } from '../../types/purchasing';
import type { ClassifyLine, Destino, FinanceCategory, FinanceRule, NfeDocument } from '../../types/finance';
import { btnGhost, btnPrimary, fmtDate, input, label, msgErr } from './ui';

type CatalogItem = Item & { ean?: string };
const DESTINOS: { v: Destino; l: string }[] = [
  { v: 'estoque', l: 'Estoque' }, { v: 'consumo', l: 'Consumo (uso imediato)' }, { v: 'despesa', l: 'Despesa' },
];
const digits = (s?: string) => (s ?? '').replace(/\D/g, '');

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
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [lines, setLines] = useState<ClassifyLine[]>([]);
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
    Promise.all([byOrg('items'), byOrg('finance_rules')])
      .then(([i, r]) => { setItems(i); setRules(r); })
      .catch((e) => { setError(`Falha ao carregar catálogo/regras: ${e.message}`); setItems([]); setRules([]); });
    byOrg('work_orders').then(setWorkOrders).catch(() => setWorkOrders([]));
    byOrg('purchasing_orders', 'organizationId')
      .then((os: PurchaseOrder[]) => setOrders(os.filter((o) => digits(o.supplierCnpj) === digits(nfe.emitente.cnpj) && !['recebida_total', 'cancelada'].includes(o.status))))
      .catch(() => setOrders([]));
  }, [orgId, nfe.id]);

  // Initial lines: learned rule first, CFOP default as fallback; catalog match for stock lines.
  useEffect(() => {
    if (!items || !rules) return;
    const unitId = (selectedUnitId && selectedUnitId !== 'todas' ? selectedUnitId : '') || units[0]?.id || '';
    setLines(itens.map((it) => {
      const s = suggestClassification(rules, nfe, it) ?? cfopDefault(it.cfop, orgId);
      const known = (id?: string) => (id && categories.some((c) => c.id === id) ? id : '');
      return {
        n: it.n, destino: s.destino, categoriaId: known(s.categoriaId), centroCustoId: s.centroCustoId,
        itemId: s.itemId || matchCatalogItem(items, it)?.id, unitId,
      };
    }));
  }, [items, rules, categories.length]);

  const parcelas = useMemo(() => (nfe.duplicatas?.length
    ? nfe.duplicatas.map((d, i) => ({ parcela: d.numero || String(i + 1), valor: d.valor, vencimento: d.vencimento }))
    : [{ parcela: '1', valor: nfe.valorTotal, vencimento: addDays(nfe.emitidaEm, 30) }]), [nfe]);

  const set = (n: number, patch: Partial<ClassifyLine>) => setLines((ls) => ls.map((l) => (l.n === n ? { ...l, ...patch } : l)));
  const applyAll = () => {
    const patch = Object.fromEntries(Object.entries(all).filter(([, v]) => v)) as Partial<ClassifyLine>;
    setLines((ls) => ls.map((l) => ({ ...l, ...patch })));
  };

  const createItem = async (n: number) => {
    const it = itens.find((x) => x.n === n)!;
    setError(null);
    try {
      const created = await createCatalogItem(db, orgId, it);
      setItems((xs) => [...(xs ?? []), created]);
      set(n, { itemId: created.id });
    } catch (e) {
      setError(`Falha ao criar item no catálogo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await classifyNfe(db, {
        orgId, nfeId: nfe.id, lines: lines.map((l) => (l.destino === 'estoque' ? l : { ...l, itemId: undefined, unitId: undefined })),
        vencimentos: venc, purchaseOrderId: purchaseOrderId || undefined, rememberRules: remember,
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
  const catOpts = activeCats.map((c) => ({ v: c.id, l: c.nome }));
  const ccOpts = costCenters.map((c) => ({ v: c.id, l: `${c.code} — ${c.name}` }));
  const ctOpts = contracts.map((c) => ({ v: c.id, l: c.title || c.name || c.contractNumber }));
  const woOpts = workOrders.map((w) => ({ v: w.id, l: `${w.orderNumber} — ${w.title}` }));
  const itemOpts = (items ?? []).map((i) => ({ v: i.id, l: `${i.sku} — ${i.name}` }));
  const unitOpts = units.map((u) => ({ v: u.id, l: u.name }));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F1420] border border-slate-800 w-full sm:max-w-4xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 bg-[#0F1420] border-b border-slate-800 px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">Classificar NF-e {nfe.numero} — {nfe.emitente.nome}</h3>
            <p className="text-[11px] text-slate-400">Emitida {fmtDate(nfe.emitidaEm)} · {brl.format(nfe.valorTotal)} · {itens.length} item(ns)</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {!items || !rules ? <p className="text-xs text-slate-400">Carregando catálogo e regras…</p> : (
            <>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-300">Aplicar a todas as linhas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {sel(all.destino, (v) => setAll({ ...all, destino: (v || undefined) as Destino }), DESTINOS.map((d) => ({ v: d.v, l: d.l })), 'Destino…')}
                  {sel(all.categoriaId, (v) => setAll({ ...all, categoriaId: v }), catOpts, 'Categoria…')}
                  {sel(all.centroCustoId, (v) => setAll({ ...all, centroCustoId: v }), ccOpts, 'Centro de custo…')}
                  {sel(all.contractId, (v) => setAll({ ...all, contractId: v }), ctOpts, 'Obra / contrato…')}
                </div>
                <button type="button" className={btnGhost} onClick={applyAll}>Aplicar a todas</button>
              </div>

              {lines.map((l) => {
                const it = itens.find((x) => x.n === l.n)!;
                return (
                  <div key={l.n} className="rounded-xl border border-slate-800 p-3 space-y-2" data-testid={`line-${l.n}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100">{l.n}. {it.descricao}</p>
                        <p className="text-[11px] text-slate-400">NCM {it.ncm} · CFOP {it.cfop} · {it.quantidade} {it.unidade} × {brl.format(it.valorUnitario)}</p>
                      </div>
                      <p className="text-sm font-bold text-white font-mono shrink-0">{brl.format(it.valorTotal)}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                      <div><span className={label}>Destino</span>{sel(l.destino, (v) => set(l.n, { destino: (v || 'despesa') as Destino }), DESTINOS, 'Destino…', `destino-${l.n}`)}</div>
                      <div><span className={label}>Categoria *</span>{sel(l.categoriaId, (v) => set(l.n, { categoriaId: v }), catOpts, 'Selecione…', `categoria-${l.n}`)}</div>
                      <div><span className={label}>Centro de custo</span>{sel(l.centroCustoId, (v) => set(l.n, { centroCustoId: v || undefined }), ccOpts, '—')}</div>
                      <div><span className={label}>Obra / contrato</span>{sel(l.contractId, (v) => set(l.n, { contractId: v || undefined }), ctOpts, '—')}</div>
                      <div><span className={label}>OS</span>{sel(l.workOrderId, (v) => set(l.n, { workOrderId: v || undefined }), woOpts, '—')}</div>
                    </div>
                    {l.destino === 'estoque' && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                        <div><span className={label}>Item do catálogo *</span>{sel(l.itemId, (v) => set(l.n, { itemId: v || undefined }), itemOpts, 'Selecione…', `item-${l.n}`)}</div>
                        <div><span className={label}>Unidade (almoxarifado) *</span>{sel(l.unitId, (v) => set(l.n, { unitId: v || undefined }), unitOpts, 'Selecione…', `unit-${l.n}`)}</div>
                        {!l.itemId && (
                          <button type="button" className={btnGhost} onClick={() => createItem(l.n)}><PackagePlus className="w-3.5 h-3.5" />Criar item no catálogo</button>
                        )}
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
            </>
          )}
          {error && <p className={msgErr}>{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-[#0F1420] border-t border-slate-800 px-4 py-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={busy || !lines.length}>
            {busy ? 'Classificando…' : 'Confirmar classificação'}
          </button>
        </div>
      </div>
    </div>
  );
};
