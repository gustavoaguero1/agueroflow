import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { CheckCircle2, Plus, Wallet } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { brl, payableKpis } from '../../services/financeService';
import type { FinanceCategory, FinancePayable, FinancePayableAuthorization } from '../../types/finance';
import { btnGhost, btnPrimary, card, fmtDate, input, label, msgErr, today } from './ui';

const STATUS_CLS: Record<FinancePayable['status'], string> = {
  aberto: 'bg-amber-950/70 text-amber-300 border-amber-800/50',
  pago: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/50',
  cancelado: 'bg-slate-800 text-slate-400 border-slate-700',
};
const emptyForm = { nome: '', cnpj: '', documento: '', valor: '', vencimento: '', categoriaId: '', contractId: '' };

export const PayablesView: React.FC<{ orgId: string; categories: FinanceCategory[] }> = ({ orgId, categories }) => {
  const { user, contracts, isSupervisorOrAbove } = useAuth();
  const [ps, setPs] = useState<FinancePayable[]>([]);
  const [authorizations, setAuthorizations] = useState<FinancePayableAuthorization[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ status: 'aberto', de: '', ate: '', categoriaId: '', contractId: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stopPayables = onSnapshot(
      query(collection(db, 'finance_payables'), where('orgId', '==', orgId)),
      (snapshot) => setPs(snapshot.docs.map((d) => ({ ...(d.data() as FinancePayable), id: d.id })).sort((a, b) => a.vencimento.localeCompare(b.vencimento))),
      (err) => setError(`Falha ao carregar contas a pagar: ${err.message}`),
    );
    const stopAuthorizations = onSnapshot(
      query(collection(db, 'finance_payable_authorizations'), where('orgId', '==', orgId)),
      (snapshot) => setAuthorizations(snapshot.docs.map((d) => ({ ...(d.data() as FinancePayableAuthorization), id: d.id }))),
      (err) => setError(`Falha ao carregar autorizações de pagamento: ${err.message}`),
    );
    return () => { stopPayables(); stopAuthorizations(); };
  }, [orgId]);

  const t = today();
  const kpis = useMemo(() => payableKpis(ps, t), [ps, t]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.nome ?? 'Sem categoria';
  const ctName = (id?: string) => { const c = contracts.find((x) => x.id === id); return c ? c.title || c.name || c.contractNumber : ''; };
  const shown = ps.filter((p) => (!f.status || p.status === f.status)
    && (!f.de || p.vencimento >= f.de) && (!f.ate || p.vencimento <= f.ate)
    && (!f.categoriaId || p.categoriaId === f.categoriaId || p.rateio?.some((r) => r.categoriaId === f.categoriaId))
    && (!f.contractId || p.contractId === f.contractId || p.rateio?.some((r) => r.contractId === f.contractId)));

  const pay = (p: FinancePayable) => updateDoc(doc(db, 'finance_payables', p.id), { status: 'pago', pagoEm: today(), pagoPor: user?.uid ?? '', updatedAt: new Date().toISOString() })
    .catch((e) => setError(`Falha ao marcar como pago: ${e.message}`));

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Math.round(parseFloat(form.valor.replace(/\./g, '').replace(',', '.')) * 100) / 100;
    if (!form.nome.trim() || !form.documento.trim() || !(valor > 0) || !form.vencimento || !form.categoriaId) {
      setError('Preencha fornecedor, documento, valor, vencimento e categoria.');
      return;
    }
    setBusy(true);
    setError(null);
    const id = `pay_${orgId}_man_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const p: FinancePayable = {
      id, orgId, origem: 'manual', fornecedor: { nome: form.nome.trim(), ...(form.cnpj.trim() ? { cnpj: form.cnpj.replace(/\D/g, '') } : {}) },
      documento: form.documento.trim(), valor, vencimento: form.vencimento, status: 'aberto', categoriaId: form.categoriaId,
      ...(form.contractId ? { contractId: form.contractId } : {}), createdAt: new Date().toISOString(), createdBy: user?.uid ?? '',
    };
    try {
      await setDoc(doc(db, 'finance_payables', id), p);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const kpiCards = [
    { l: 'Atrasadas', k: kpis.atrasadas, cls: 'text-red-400' },
    { l: 'Vencem em 7 dias', k: kpis.vence7, cls: 'text-amber-300' },
    { l: 'A pagar no mês', k: kpis.aPagarMes, cls: 'text-blue-300' },
    { l: 'Pago no mês', k: kpis.pagoMes, cls: 'text-emerald-400' },
  ];
  const activeCats = categories.filter((c) => c.ativo !== false);

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2"><Wallet className="w-5 h-5 text-blue-400" />Contas a Pagar</h2>
          <p className="text-xs text-slate-400 mt-0.5">Parcelas geradas pelas NF-e classificadas e lançamentos manuais.</p>
        </div>
        {isSupervisorOrAbove && (
          <button type="button" className={btnPrimary} onClick={() => setShowForm((v) => !v)}><Plus className="w-3.5 h-3.5" />Lançamento manual</button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((c) => (
          <div key={c.l} className={card} data-testid="kpi">
            <p className="text-[11px] text-slate-400">{c.l}</p>
            <p className={`text-base sm:text-lg font-extrabold font-mono ${c.cls}`}>{brl.format(c.k.valor)}</p>
            <p className="text-[11px] text-slate-500">{c.k.qtd} título(s)</p>
          </div>
        ))}
      </div>

      {error && <p className={msgErr}>{error}</p>}

      {showForm && (
        <form onSubmit={saveManual} className={`${card} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`}>
          <div><span className={label}>Fornecedor *</span><input className={input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div><span className={label}>CNPJ</span><input className={input} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
          <div><span className={label}>Documento *</span><input className={input} value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} placeholder="Boleto, recibo…" /></div>
          <div><span className={label}>Valor (R$) *</span><input className={input} inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" /></div>
          <div><span className={label}>Vencimento *</span><input type="date" className={input} value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></div>
          <div><span className={label}>Categoria *</span>
            <select className={input} value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
              <option value="">Selecione…</option>{activeCats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></div>
          <div><span className={label}>Obra / contrato</span>
            <select className={input} value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}>
              <option value="">—</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.title || c.name || c.contractNumber}</option>)}
            </select></div>
          <div className="flex items-end gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
            <button type="button" className={btnGhost} onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className={`${card} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2`}>
        <div><span className={label}>Status</span>
          <select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Todos</option><option value="aberto">Em aberto</option><option value="pago">Pagos</option><option value="cancelado">Cancelados</option>
          </select></div>
        <div><span className={label}>Vencimento de</span><input type="date" className={input} value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></div>
        <div><span className={label}>até</span><input type="date" className={input} value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></div>
        <div><span className={label}>Categoria</span>
          <select className={input} value={f.categoriaId} onChange={(e) => setF({ ...f, categoriaId: e.target.value })}>
            <option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></div>
        <div><span className={label}>Obra / contrato</span>
          <select className={input} value={f.contractId} onChange={(e) => setF({ ...f, contractId: e.target.value })}>
            <option value="">Todas</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.title || c.name || c.contractNumber}</option>)}
          </select></div>
      </div>

      {shown.length === 0 ? (
        <div className={`${card} text-center text-xs text-slate-400 py-10`}>Nenhum título nesta visão.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((p) => {
            const late = p.status === 'aberto' && p.vencimento < t;
            const authorization = authorizations.find((entry) => entry.payableId === p.id);
            const currentSupplierCnpj = String(p.fornecedor.cnpj || '').replace(/\D/g, '');
            const authorizedSupplierCnpj = String(authorization?.fornecedorCnpj || '').replace(/\D/g, '');
            const changedAfterAuthorization = !!authorization && (
              p.valor !== authorization.authorizedValue
              || p.vencimento !== authorization.dueDate
              || p.fornecedor.nome.trim().toLocaleLowerCase('pt-BR') !== authorization.fornecedorNome.trim().toLocaleLowerCase('pt-BR')
              || currentSupplierCnpj !== authorizedSupplierCnpj
            );
            return (
              <div key={p.id} className={`${card} space-y-2`} data-testid="payable-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{p.fornecedor.nome}</p>
                    <p className="text-[11px] text-slate-400">{p.documento}{p.parcela ? ` · parcela ${p.parcela}` : ''}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${late ? 'bg-red-950/70 text-red-400 border-red-800/50' : STATUS_CLS[p.status]}`}>
                    {late ? 'Atrasada' : p.status === 'aberto' ? 'Em aberto' : p.status === 'pago' ? `Paga ${fmtDate(p.pagoEm)}` : 'Cancelada'}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-[11px] text-slate-400 min-w-0">
                    <p>Vence {fmtDate(p.vencimento)}</p>
                    <p className="truncate">{catName(p.categoriaId)}{ctName(p.contractId) ? ` · ${ctName(p.contractId)}` : ''}</p>
                    {(p.purchaseOrderCode || p.workOrderNumber || p.receiptId) && <p className="truncate text-sky-300">{p.purchaseOrderCode ? `OC ${p.purchaseOrderCode}` : ''}{p.workOrderNumber ? ` · OS ${p.workOrderNumber}` : ''}{p.receiptId ? ` · Recibo ${p.receiptId}` : ''}</p>}
                    {p.rateio && p.rateio.length > 1 && <p className="truncate">Rateio: {p.rateio.map((r) => `${catName(r.categoriaId)} ${brl.format(r.valor)}`).join(' · ')}</p>}
                  </div>
                  <p className="text-base font-extrabold text-white font-mono shrink-0">{brl.format(p.valor)}</p>
                </div>
                {authorization && (
                  <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-2 space-y-1" data-testid="payable-authorization">
                    <p className="text-[10px] font-semibold text-emerald-300">Decisão de divergência vinculada</p>
                    <p className="text-[10px] text-slate-300">{authorization.issueTitle} · OC {authorization.purchaseOrderCode}</p>
                    <p className="text-[10px] text-slate-400">Autorização {authorization.id} · aprovada por {authorization.approvedByName} · registrada por {authorization.authorizedByName} · {brl.format(authorization.authorizedValue)} · {fmtDate(String(authorization.dueDate))}</p>
                    {changedAfterAuthorization && <p className="text-[10px] text-amber-300">Atenção: valor, vencimento ou fornecedor do título mudou após a autorização. Revalidar antes de qualquer pagamento.</p>}
                    {p.status !== 'aberto' && <p className="text-[10px] text-slate-400">A autorização foi registrada quando o título estava em aberto. Status atual: {p.status === 'pago' ? 'pago' : 'cancelado'}.</p>}
                    <p className="text-[9px] text-slate-500">Registro documental; não representa comprovante bancário nem baixa automática.</p>
                  </div>
                )}
                {isSupervisorOrAbove && p.status === 'aberto' && (
                  <button type="button" className={`${btnGhost} w-full`} onClick={() => pay(p)}><CheckCircle2 className="w-3.5 h-3.5" />Marcar como pago</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
