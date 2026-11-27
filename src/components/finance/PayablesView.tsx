import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { ArrowLeftRight, CheckCircle2, Download, Plus, Wallet, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { brl, payableKpis } from '../../services/financeService';
import type { FinanceCategory, FinancePayable, FinancePayableAuthorization, FinancePayableAuthorizationDifference, FinancePayableSettlement, FinancePaymentMethod } from '../../types/finance';
import { createFinancePayableSettlement } from '../../services/financePayableSettlementService';
import { BankReconciliationView } from './BankReconciliationView';
import { financePayableBalance, getFinancePayableAuthorizationDifferences } from '../../services/financePayableSettlementRules';
import { btnGhost, btnPrimary, card, fmtDate, input, label, msgErr, today } from './ui';

const STATUS_CLS: Record<FinancePayable['status'], string> = {
  aberto: 'bg-amber-950/70 text-amber-300 border-amber-800/50',
  pago: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/50',
  cancelado: 'bg-slate-800 text-slate-400 border-slate-700',
};
const emptyForm = { nome: '', cnpj: '', documento: '', valor: '', vencimento: '', categoriaId: '', contractId: '' };
const PAYMENT_METHOD_LABELS: Record<FinancePaymentMethod, string> = { pix: 'PIX', transferencia: 'Transferência bancária', boleto: 'Boleto', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro' };
const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS) as [FinancePaymentMethod, string][];

export const PayablesView: React.FC<{ orgId: string; categories: FinanceCategory[] }> = ({ orgId, categories }) => {
  const { user, role, contracts, isSupervisorOrAbove, isMaster, areaLevel, logAudit } = useAuth();
  const [ps, setPs] = useState<FinancePayable[]>([]);
  const [authorizations, setAuthorizations] = useState<FinancePayableAuthorization[]>([]);
  const [settlements, setSettlements] = useState<FinancePayableSettlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settlementTarget, setSettlementTarget] = useState<FinancePayable | null>(null);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementRequestKey, setSettlementRequestKey] = useState('');
  const [settlementForm, setSettlementForm] = useState({ paymentDate: today(), paymentAmount: '', discountAmount: '0', paymentMethod: 'pix' as FinancePaymentMethod, discountReason: '', paymentReference: '', proofReference: '', notes: '', confirmAuthorizationDivergence: false });
  const [f, setF] = useState({ status: 'aberto', de: '', ate: '', categoriaId: '', contractId: '' });
  const [duePreset, setDuePreset] = useState<'custom' | 'vencidos' | 'hoje' | '7d'>('custom');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<'payables' | 'bank'>('payables');

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
    const stopSettlements = onSnapshot(
      query(collection(db, 'finance_payable_settlements'), where('orgId', '==', orgId)),
      (snapshot) => setSettlements(snapshot.docs.map((d) => ({ ...(d.data() as FinancePayableSettlement), id: d.id }))),
      (err) => setError(`Falha ao carregar histórico de baixas: ${err.message}`),
    );
    return () => { stopPayables(); stopAuthorizations(); stopSettlements(); };
  }, [orgId]);

  const t = today();
  const in7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const kpis = useMemo(() => payableKpis(ps, t, settlements), [ps, t, settlements]);
  const dueTodayCount = useMemo(() => ps.filter((p) => p.status === 'aberto' && p.vencimento === t).length, [ps, t]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.nome ?? 'Sem categoria';
  const ctName = (id?: string) => { const c = contracts.find((x) => x.id === id); return c ? c.title || c.name || c.contractNumber : ''; };
  const shown = ps.filter((p) => {
    if (duePreset === 'vencidos' && !(p.status === 'aberto' && p.vencimento < t)) return false;
    if (duePreset === 'hoje' && !(p.status === 'aberto' && p.vencimento === t)) return false;
    if (duePreset === '7d' && !(p.status === 'aberto' && p.vencimento >= t && p.vencimento <= in7d)) return false;
    return (!f.status || p.status === f.status)
      && (!f.de || p.vencimento >= f.de) && (!f.ate || p.vencimento <= f.ate)
      && (!f.categoriaId || p.categoriaId === f.categoriaId || p.rateio?.some((r) => r.categoriaId === f.categoriaId))
      && (!f.contractId || p.contractId === f.contractId || p.rateio?.some((r) => r.contractId === f.contractId));
  });

  const exportCsv = () => {
    const headers = ['Fornecedor', 'CNPJ', 'Documento', 'Vencimento', 'Valor Original', 'Saldo Aberto', 'Status', 'Categoria', 'Contrato/Obra'];
    const rows = shown.map((p) => [
      p.fornecedor?.nome || '',
      p.fornecedor?.cnpj || '',
      p.documento || '',
      fmtDate(p.vencimento),
      p.valor.toFixed(2).replace('.', ','),
      (p.status === 'pago' ? 0 : financePayableBalance(p)).toFixed(2).replace('.', ','),
      p.status,
      catName(p.categoriaId),
      ctName(p.contractId),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['\uFEFF' + [headers.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas_a_pagar_${t}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canSettle = isSupervisorOrAbove && areaLevel('financeiro') >= (role === 'Supervisor' ? 1 : 2);
  const canApplyDiscount = isMaster || ((role === 'Admin' || role === 'Gerente') && areaLevel('financeiro') >= 2);
  const openSettlement = (payable: FinancePayable) => {
    setSettlementTarget(payable);
    setSettlementRequestKey(crypto.randomUUID());
    setSettlementForm({ paymentDate: today(), paymentAmount: financePayableBalance(payable).toFixed(2), discountAmount: '0', paymentMethod: 'pix', discountReason: '', paymentReference: '', proofReference: '', notes: '', confirmAuthorizationDivergence: false });
    setError(null); setSuccess(null);
  };

  const submitSettlement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settlementTarget || !user || !settlementRequestKey) return;
    setSettlementBusy(true); setError(null); setSuccess(null);
    const paymentAmount = Number(settlementForm.paymentAmount);
    const discountAmount = Number(settlementForm.discountAmount);
    try {
      const settlementId = await createFinancePayableSettlement({
        orgId, payableId: settlementTarget.id, idempotencyKey: settlementRequestKey, paymentDate: settlementForm.paymentDate,
        paymentAmount, discountAmount,
        ...(paymentAmount > 0 ? { paymentMethod: settlementForm.paymentMethod } : {}),
        ...(discountAmount > 0 ? { discountReason: settlementForm.discountReason } : {}),
        ...(settlementForm.paymentReference ? { paymentReference: settlementForm.paymentReference } : {}),
        ...(settlementForm.proofReference ? { proofReference: settlementForm.proofReference } : {}),
        ...(settlementForm.notes ? { notes: settlementForm.notes } : {}),
        confirmAuthorizationDivergence: settlementForm.confirmAuthorizationDivergence,
      });
      setSettlementTarget(null);
      setSuccess(`Movimento financeiro registrado. Evento ${settlementId}.`);
      void logAudit('Financeiro', 'Pagamento parcial ou quitação registrada', 'Título ' + settlementTarget.id + ': pagamento ' + brl.format(paymentAmount) + ', abatimento ' + brl.format(discountAmount) + ', evento ' + settlementId + '.', settlementId).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o movimento financeiro.');
    } finally { setSettlementBusy(false); }
  };

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
    { l: 'Atrasadas', k: kpis.atrasadas, cls: 'text-red-400', preset: 'vencidos' as const },
    { l: 'Vencem em 7 dias', k: kpis.vence7, cls: 'text-amber-300', preset: '7d' as const },
    { l: 'A pagar no mês', k: kpis.aPagarMes, cls: 'text-blue-300', preset: 'custom' as const },
    { l: 'Pago no mês', k: kpis.pagoMes, cls: 'text-emerald-400', preset: 'custom' as const },
  ];
  const activeCats = categories.filter((c) => c.ativo !== false);

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2"><Wallet className="w-5 h-5 text-blue-400" />Contas a Pagar</h2>
          <p className="text-xs text-slate-400 mt-0.5">Parcelas geradas pelas NF-e classificadas e lançamentos manuais.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnGhost} onClick={exportCsv} disabled={shown.length === 0}>
            <Download className="w-3.5 h-3.5" />Exportar CSV ({shown.length})
          </button>
          {isSupervisorOrAbove && (
            <button type="button" className={btnPrimary} onClick={() => setShowForm((v) => !v)}><Plus className="w-3.5 h-3.5" />Lançamento manual</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-1">
        <button type="button" onClick={() => setActiveView('payables')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeView === 'payables' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}>Contas a pagar</button>
        <button type="button" onClick={() => setActiveView('bank')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeView === 'bank' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}><ArrowLeftRight className="h-3.5 w-3.5" />Conciliação bancária</button>
      </div>
      {activeView === 'bank' ? <BankReconciliationView orgId={orgId} /> : <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((c) => (
          <div key={c.l} className={card} data-testid="kpi">
            <p className="text-[11px] text-slate-400">{c.l}</p>
            <p className={`text-base sm:text-lg font-extrabold font-mono ${c.cls}`}>{brl.format(c.k.valor)}</p>
            <p className="text-[11px] text-slate-500">{c.k.qtd} título(s)</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {([
          ['custom', 'Todos os filtrados'],
          ['vencidos', `Vencidos (${kpis.atrasadas.qtd})`],
          ['hoje', `Vence hoje (${dueTodayCount})`],
          ['7d', `Próximos 7 dias (${kpis.vence7.qtd})`],
        ] as const).map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setDuePreset(key);
              if (key !== 'custom') setF((cur) => ({ ...cur, status: 'aberto', de: '', ate: '' }));
            }}
            className={`px-3 py-1.5 rounded-xl font-semibold border transition cursor-pointer ${
              duePreset === key
                ? key === 'vencidos'
                  ? 'bg-rose-600 text-white border-rose-500 apple-solid-btn'
                  : 'bg-blue-600 text-white border-blue-500 apple-solid-btn'
                : 'bg-[#121826] border-slate-800 text-slate-300 hover:border-slate-600'
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {error && <p className={msgErr}>{error}</p>}
      {success && <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">{success}</p>}

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
            const payableSettlements = settlements.filter((entry) => entry.payableId === p.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
            const eventPaid = payableSettlements.reduce((sum, entry) => sum + (entry.paymentAmount ?? entry.settledValue ?? 0), 0);
            const eventDiscount = payableSettlements.reduce((sum, entry) => sum + (entry.discountAmount ?? 0), 0);
            const paidTotal = p.valorPago ?? (payableSettlements.length ? eventPaid : (p.status === 'pago' ? p.valor : 0));
            const discountTotal = p.valorAbatido ?? eventDiscount;
            const remainingBalance = p.status === 'pago' ? 0 : financePayableBalance({ ...p, valorPago: paidTotal, valorAbatido: discountTotal });
            const isPartial = p.status === 'aberto' && (paidTotal > 0 || discountTotal > 0);
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
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${late ? 'bg-red-950/70 text-red-400 border-red-800/50' : isPartial ? 'bg-sky-950/70 text-sky-300 border-sky-800/50' : STATUS_CLS[p.status]}`}>
                    {late ? (isPartial ? 'Atrasada · parcial' : 'Atrasada') : isPartial ? 'Parcialmente paga' : p.status === 'aberto' ? 'Em aberto' : p.status === 'pago' ? `Paga ${fmtDate(p.pagoEm)}` : 'Cancelada'}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-[11px] text-slate-400 min-w-0">
                    <p>Vence {fmtDate(p.vencimento)}</p>
                    <p className="truncate">{catName(p.categoriaId)}{ctName(p.contractId) ? ` · ${ctName(p.contractId)}` : ''}</p>
                    {(p.purchaseOrderCode || p.workOrderNumber || p.receiptId) && <p className="truncate text-sky-300">{p.purchaseOrderCode ? `OC ${p.purchaseOrderCode}` : ''}{p.workOrderNumber ? ` · OS ${p.workOrderNumber}` : ''}{p.receiptId ? ` · Recibo ${p.receiptId}` : ''}</p>}
                    {p.rateio && p.rateio.length > 1 && <p className="truncate">Rateio: {p.rateio.map((r) => `${catName(r.categoriaId)} ${brl.format(r.valor)}`).join(' · ')}</p>}
                    {(paidTotal > 0 || discountTotal > 0) && <p className="text-[10px] text-slate-400">Original {brl.format(p.valor)} · Pago {brl.format(paidTotal)} · Abatido {brl.format(discountTotal)}</p>}
                  </div>
                  <div className="text-right shrink-0"><p className="text-[9px] text-slate-500">{p.status === 'aberto' ? 'Saldo em aberto' : 'Valor original'}</p><p className="text-base font-extrabold text-white font-mono">{brl.format(p.status === 'aberto' ? remainingBalance : p.valor)}</p></div>
                </div>
                {(payableSettlements.length > 0 || paidTotal > 0 || discountTotal > 0) && (
                  <div className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-2 space-y-2" data-testid="payable-settlement">
                    <p className="text-[10px] font-semibold text-sky-300">Histórico de pagamentos e abatimentos</p>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                      <p>Pago em dinheiro: <span className="font-semibold">{brl.format(paidTotal)}</span></p>
                      <p>Abatimentos: <span className="font-semibold">{brl.format(discountTotal)}</span></p>
                      <p>Saldo restante: <span className="font-semibold">{brl.format(remainingBalance)}</span></p>
                      <p>Valor original: <span className="font-semibold">{brl.format(p.valor)}</span></p>
                    </div>
                    {payableSettlements.map((entry, index) => (
                      <div key={entry.id} className="border-t border-sky-900/40 pt-2 space-y-0.5">
                        <p className="text-[10px] text-slate-200">Movimento {entry.paymentSequence ?? (payableSettlements.length - index)} · {fmtDate(entry.paymentDate)} · {entry.paymentMethod ? PAYMENT_METHOD_LABELS[entry.paymentMethod] : 'Somente abatimento'}</p>
                        <p className="text-[10px] text-slate-300">Pagamento: {brl.format(entry.paymentAmount ?? entry.settledValue)} · Abatimento: {brl.format(entry.discountAmount ?? 0)}</p>
                        {entry.discountReason && <p className="text-[10px] text-amber-300">Motivo do abatimento: {entry.discountReason}</p>}
                        <p className="text-[10px] text-slate-400">Registrado por {entry.settledByEmail || entry.settledBy}</p>
                        {entry.paymentReference && <p className="text-[10px] text-slate-400">Referência: {entry.paymentReference}</p>}
                        {entry.proofReference && (/^https?:\/\//i.test(entry.proofReference) ? <a href={entry.proofReference} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-300 underline">Abrir referência do comprovante</a> : <p className="text-[10px] text-slate-400">Comprovante: {entry.proofReference}</p>)}
                        {entry.notes && <p className="text-[10px] text-slate-400">Observações: {entry.notes}</p>}
                        <p className="text-[9px] text-slate-500">Evento imutável {entry.id}</p>
                      </div>
                    ))}
                  </div>
                )}
                {p.status === 'pago' && payableSettlements.length === 0 && paidTotal === 0 && discountTotal === 0 && (
                  <div className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-2 text-[10px] text-slate-400">Título quitado antes do histórico detalhado, sem evento de baixa associado.</div>
                )}
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
                {canSettle && p.status === 'aberto' && (
                  <button type="button" className={`${btnGhost} w-full`} onClick={() => openSettlement(p)}>
                    <CheckCircle2 className="w-3.5 h-3.5" />Registrar baixa
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {settlementTarget && (() => {
        const linkedAuthorization = authorizations.find((item) => item.payableId === settlementTarget.id);
        const differences = getFinancePayableAuthorizationDifferences(settlementTarget, linkedAuthorization);
        const differenceLabels: Record<FinancePayableAuthorizationDifference, string> = { valor: 'valor do título', vencimento: 'vencimento', fornecedor_nome: 'razão social do fornecedor', fornecedor_cnpj: 'CNPJ do fornecedor' };
        const remaining = financePayableBalance(settlementTarget);
        const paymentAmount = Number(settlementForm.paymentAmount) || 0;
        const discountAmount = Number(settlementForm.discountAmount) || 0;
        const projectedBalance = Math.max(0, remaining - paymentAmount - discountAmount);
        const invalidAmounts = paymentAmount < 0 || discountAmount < 0 || paymentAmount + discountAmount <= 0 || paymentAmount + discountAmount > remaining + 0.005;
        const invalidDiscount = discountAmount > 0 && (!canApplyDiscount || settlementForm.discountReason.trim().length < 5);
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
            <form onSubmit={submitSettlement} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div><h3 id="settlement-title" className="text-sm font-bold text-white">Registrar pagamento ou abatimento</h3><p className="text-[11px] text-slate-400 mt-1">{settlementTarget.documento} · {settlementTarget.fornecedor.nome}</p></div>
                <button type="button" onClick={() => setSettlementTarget(null)} className="text-slate-400 hover:text-white" aria-label="Fechar"><X className="w-4 h-4" /></button>
              </div>
              {error && <p className={msgErr}>{error}</p>}
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 flex items-center justify-between gap-3">
                <div><p className="text-[10px] text-slate-400">Saldo atual em aberto</p><p className="text-lg font-extrabold text-white font-mono">{brl.format(remaining)}</p><p className="text-[10px] text-slate-500">Valor original: {brl.format(settlementTarget.valor)}</p></div>
                <div className="text-right"><p className="text-[10px] text-slate-400">Vencimento atual</p><p className="text-xs text-slate-200">{fmtDate(settlementTarget.vencimento)}</p></div>
              </div>
              {linkedAuthorization && differences.length > 0 && (
                <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-300">O título mudou após a autorização</p>
                  <p className="text-[11px] text-slate-300">Foram identificadas alterações em: {differences.map((item) => differenceLabels[item]).join(', ')}. Confira a autorização original e confirme a revalidação antes da baixa.</p>
                  <label className="flex items-start gap-2 text-[11px] text-slate-200"><input type="checkbox" checked={settlementForm.confirmAuthorizationDivergence} onChange={(event) => setSettlementForm((previous) => ({ ...previous, confirmAuthorizationDivergence: event.target.checked }))} className="mt-0.5" />Revisei as diferenças e confirmo a baixa pelo valor e dados atuais do título.</label>
                </div>
              )}
              {linkedAuthorization && differences.length === 0 && <p className="text-[10px] text-emerald-300">Os dados atuais do título correspondem ao snapshot da autorização vinculada.</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={label}>Data do pagamento / quitação *</label><input type="date" required className={input} value={settlementForm.paymentDate} onChange={(event) => setSettlementForm((previous) => ({ ...previous, paymentDate: event.target.value }))} /></div>
                <div><label className={label}>Valor efetivamente pago (R$) *</label><input type="number" min="0" step="0.01" max={remaining} required className={input} value={settlementForm.paymentAmount} onChange={(event) => setSettlementForm((previous) => ({ ...previous, paymentAmount: event.target.value }))} /></div>
                {paymentAmount > 0 && <div className="sm:col-span-2"><label className={label}>Forma de pagamento *</label><select required className={input} value={settlementForm.paymentMethod} onChange={(event) => setSettlementForm((previous) => ({ ...previous, paymentMethod: event.target.value as FinancePaymentMethod }))}>{PAYMENT_METHOD_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>}
                {canApplyDiscount ? (
                  <div><label className={label}>Abatimento concedido (R$)</label><input type="number" min="0" step="0.01" max={remaining} className={input} value={settlementForm.discountAmount} onChange={(event) => setSettlementForm((previous) => ({ ...previous, discountAmount: event.target.value }))} /></div>
                ) : <p className="sm:col-span-2 text-[10px] text-slate-500">Abatimentos exigem perfil Admin/Gerente com Financeiro nível 2.</p>}
                {discountAmount > 0 && canApplyDiscount && <div><label className={label}>Justificativa do abatimento *</label><input required minLength={5} maxLength={500} className={input} value={settlementForm.discountReason} onChange={(event) => setSettlementForm((previous) => ({ ...previous, discountReason: event.target.value }))} placeholder="Desconto negociado, crédito do fornecedor…" /></div>}
                {paymentAmount > 0 && <div className="sm:col-span-2"><label className={label}>Referência da transação</label><input maxLength={200} className={input} value={settlementForm.paymentReference} onChange={(event) => setSettlementForm((previous) => ({ ...previous, paymentReference: event.target.value }))} placeholder="ID PIX, autenticação bancária ou número do documento" /></div>}
                {paymentAmount > 0 && <div className="sm:col-span-2"><label className={label}>Referência do comprovante</label><input maxLength={1000} className={input} value={settlementForm.proofReference} onChange={(event) => setSettlementForm((previous) => ({ ...previous, proofReference: event.target.value }))} placeholder="Link ou caminho interno do comprovante" /></div>}
                <div className="sm:col-span-2"><label className={label}>Observações</label><textarea maxLength={1000} rows={3} className={input} value={settlementForm.notes} onChange={(event) => setSettlementForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Informações adicionais para conferência" /></div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 grid grid-cols-2 gap-2 text-[11px]">
                <p className="text-slate-400">Pagamento: <strong className="text-slate-100">{brl.format(paymentAmount)}</strong></p>
                <p className="text-slate-400">Abatimento: <strong className="text-slate-100">{brl.format(discountAmount)}</strong></p>
                <p className="text-slate-400 col-span-2">Saldo após o movimento: <strong className="text-white">{brl.format(projectedBalance)}</strong></p>
              </div>
              {invalidAmounts && <p className={msgErr}>Pagamento mais abatimento devem ser maiores que zero e não podem ultrapassar o saldo em aberto.</p>}
              {invalidDiscount && <p className={msgErr}>Informe uma justificativa válida e tenha perfil autorizado para aplicar o abatimento.</p>}
              <p className="text-[10px] text-slate-500">O valor original da parcela não é alterado. Cada movimento é registrado em evento imutável; pagamentos parciais mantêm o título aberto, e o status muda para Pago somente quando o saldo chegar a zero.</p>
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3"><button type="button" onClick={() => setSettlementTarget(null)} disabled={settlementBusy} className={btnGhost}>Cancelar</button><button type="submit" disabled={settlementBusy || invalidAmounts || invalidDiscount || (differences.length > 0 && !settlementForm.confirmAuthorizationDivergence)} className={btnPrimary}>{settlementBusy ? 'Registrando…' : 'Confirmar movimento'}</button></div>
            </form>
          </div>
        );
      })()}

      </>}
    </div>
  );
};
