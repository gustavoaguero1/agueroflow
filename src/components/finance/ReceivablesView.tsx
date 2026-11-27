import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { ArrowDownToLine, CheckCircle2, Plus, Receipt, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { FinanceReceivable, FinanceReceivableReceipt, FinancePaymentMethod } from '../../types/finance';
import { createFinanceReceivableReceipt, financeReceivableBalance } from '../../services/financeReceivableReceiptService';
import { brl } from '../../services/financeService';
import { btnGhost, btnPrimary, card, fmtDate, input, label, msgErr, today } from './ui';

const METHODS: Record<FinancePaymentMethod, string> = {
  pix: 'PIX', transferencia: 'Transferência', boleto: 'Boleto', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro',
};
const moneyInput = (value: string) => {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};
const moneyText = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ReceiptRecord = FinanceReceivableReceipt & { id: string };

export const ReceivablesView: React.FC<{ orgId: string }> = ({ orgId }) => {
  const { user, contracts, moduleLevel } = useAuth();
  const canCreate = moduleLevel('financeiro-receber') >= 2;
  const canReceive = moduleLevel('financeiro-receber') >= 2;
  const [receivables, setReceivables] = useState<FinanceReceivable[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState('');
  const [form, setForm] = useState({ client: '', cnpj: '', document: '', installment: '', amount: '', dueDate: '', contractId: '', proposalId: '', notes: '' });
  const [receiptForm, setReceiptForm] = useState({ date: today(), amount: '', method: 'pix' as FinancePaymentMethod, reference: '', proof: '', notes: '' });

  useEffect(() => {
    const stopReceivables = onSnapshot(
      query(collection(db, 'finance_receivables'), where('orgId', '==', orgId)),
      (snapshot) => setReceivables(snapshot.docs.map((d) => ({ ...(d.data() as FinanceReceivable), id: d.id })).sort((a, b) => a.vencimento.localeCompare(b.vencimento))),
      (err) => setError('Falha ao carregar contas a receber: ' + err.message),
    );
    const stopReceipts = onSnapshot(
      query(collection(db, 'finance_receivable_receipts'), where('orgId', '==', orgId)),
      (snapshot) => setReceipts(snapshot.docs.map((d) => ({ ...(d.data() as ReceiptRecord), id: d.id })).sort((a, b) => b.receiptDate.localeCompare(a.receiptDate))),
      (err) => setError('Falha ao carregar histórico de recebimentos: ' + err.message),
    );
    return () => { stopReceivables(); stopReceipts(); };
  }, [orgId]);

  const t = today();
  const totals = useMemo(() => {
    const open = receivables.filter((item) => item.status === 'aberto');
    return {
      openValue: open.reduce((sum, item) => sum + financeReceivableBalance(item), 0),
      lateCount: open.filter((item) => item.vencimento < t).length,
      dueSoon: open.filter((item) => item.vencimento >= t && item.vencimento <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length,
      receivedMonth: receipts.filter((item) => item.receiptDate.slice(0, 7) === t.slice(0, 7)).reduce((sum, item) => sum + item.receiptAmount, 0),
    };
  }, [receivables, receipts, t]);

  const saveReceivable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canCreate) return;
    const value = moneyInput(form.amount);
    if (!form.client.trim() || !form.document.trim() || !(value > 0) || !form.dueDate) {
      setError('Preencha cliente, documento, valor original e vencimento.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    const id = 'recv_' + orgId.replace(/[^A-Za-z0-9_-]/g, '_') + '_man_' + crypto.randomUUID().replace(/-/g, '');
    const record: FinanceReceivable = {
      id, orgId, origem: 'manual',
      cliente: { nome: form.client.trim(), ...(form.cnpj.trim() ? { cnpj: form.cnpj.replace(/\D/g, '') } : {}) },
      documento: form.document.trim(), ...(form.installment.trim() ? { parcela: form.installment.trim() } : {}),
      valor: value, vencimento: form.dueDate, status: 'aberto',
      ...(form.contractId ? { contractId: form.contractId } : {}),
      ...(form.proposalId.trim() ? { commercialProposalId: form.proposalId.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      createdAt: new Date().toISOString(), createdBy: user.uid,
    };
    try {
      await setDoc(doc(db, 'finance_receivables', id), record);
      setForm({ client: '', cnpj: '', document: '', installment: '', amount: '', dueDate: '', contractId: '', proposalId: '', notes: '' });
      setShowForm(false);
      setNotice('Conta a receber registrada. O controle não emite nota fiscal nem gera cobrança bancária.');
    } catch (err) {
      setError('Falha ao salvar: ' + (err instanceof Error ? err.message : String(err)));
    } finally { setSaving(false); }
  };

  const openReceipt = (item: FinanceReceivable) => {
    setReceivingId(item.id);
    setReceiptForm({ date: today(), amount: moneyText(financeReceivableBalance(item)), method: 'pix', reference: '', proof: '', notes: '' });
    setError(''); setNotice('');
  };

  const submitReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    const item = receivables.find((r) => r.id === receivingId);
    if (!item || !user || !canReceive) return;
    const amount = moneyInput(receiptForm.amount);
    setSaving(true); setError(''); setNotice('');
    try {
      const receiptId = await createFinanceReceivableReceipt({
        orgId, receivableId: item.id, idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        receiptDate: receiptForm.date, receiptAmount: amount, paymentMethod: receiptForm.method,
        ...(receiptForm.reference.trim() ? { paymentReference: receiptForm.reference.trim() } : {}),
        ...(receiptForm.proof.trim() ? { proofReference: receiptForm.proof.trim() } : {}),
        ...(receiptForm.notes.trim() ? { notes: receiptForm.notes.trim() } : {}),
      });
      setReceivingId('');
      setNotice('Recebimento registrado com sucesso. Evento ' + receiptId + '.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o recebimento.');
    } finally { setSaving(false); }
  };

  const receiptsByReceivable = useMemo(() => {
    const map = new Map<string, ReceiptRecord[]>();
    for (const receipt of receipts) map.set(receipt.receivableId, [...(map.get(receipt.receivableId) || []), receipt]);
    return map;
  }, [receipts]);

  return (
    <div className="space-y-4">
      <div className={card + ' flex flex-col sm:flex-row sm:items-center justify-between gap-3'}>
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white"><ArrowDownToLine className="h-5 w-5 text-emerald-400" />Contas a Receber</h2>
          <p className="mt-1 text-xs text-slate-400">Controle interno de valores a receber de clientes, com baixas parciais e histórico auditável.</p>
        </div>
        {canCreate && <button type="button" className={btnPrimary} onClick={() => setShowForm((value) => !value)}><Plus className="h-3.5 w-3.5" />Novo recebível</button>}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className={card}><p className="text-[11px] text-slate-400">Saldo em aberto</p><p className="mt-1 text-lg font-bold font-mono text-amber-300">{brl.format(totals.openValue)}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Contas vencidas</p><p className="mt-1 text-xl font-bold text-rose-300">{totals.lateCount}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Vencem em 7 dias</p><p className="mt-1 text-xl font-bold text-cyan-300">{totals.dueSoon}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Recebido no mês</p><p className="mt-1 text-lg font-bold font-mono text-emerald-300">{brl.format(totals.receivedMonth)}</p></div>
      </div>

      {error && <p className={msgErr}>{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

      {showForm && (
        <form onSubmit={saveReceivable} className={card + ' grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'}>
          <div><label className={label}>Cliente *</label><input required maxLength={180} className={input} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
          <div><label className={label}>CNPJ/CPF</label><input maxLength={24} className={input} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
          <div><label className={label}>Documento *</label><input required maxLength={120} className={input} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} placeholder="Ex.: proposta, medição, fatura" /></div>
          <div><label className={label}>Parcela</label><input maxLength={60} className={input} value={form.installment} onChange={(e) => setForm({ ...form, installment: e.target.value })} /></div>
          <div><label className={label}>Valor original (R$) *</label><input required inputMode="decimal" className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" /></div>
          <div><label className={label}>Vencimento *</label><input required type="date" className={input} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div><label className={label}>Obra / contrato</label><select className={input} value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}><option value="">—</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.title || c.name || c.contractNumber}</option>)}</select></div>
          <div><label className={label}>Código da proposta (opcional)</label><input maxLength={120} className={input} value={form.proposalId} onChange={(e) => setForm({ ...form, proposalId: e.target.value })} placeholder="ID da proposta comercial" /></div>
          <div className="sm:col-span-2 lg:col-span-4"><label className={label}>Observações</label><input maxLength={500} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2 lg:col-span-4 flex gap-2"><button type="submit" className={btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Salvar conta a receber'}</button><button type="button" className={btnGhost} onClick={() => setShowForm(false)}>Cancelar</button></div>
        </form>
      )}

      {receivingId && (
        <form onSubmit={submitReceipt} className={card + ' space-y-3'}>
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white">Registrar recebimento</h3><button type="button" className={btnGhost} onClick={() => setReceivingId('')}><X className="h-3.5 w-3.5" />Fechar</button></div>
          <p className="text-xs text-slate-400">{receivables.find((r) => r.id === receivingId)?.cliente.nome} · Saldo: {brl.format(receivables.find((r) => r.id === receivingId) ? financeReceivableBalance(receivables.find((r) => r.id === receivingId)!) : 0)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className={label}>Data do recebimento *</label><input required type="date" className={input} value={receiptForm.date} onChange={(e) => setReceiptForm({ ...receiptForm, date: e.target.value })} /></div>
            <div><label className={label}>Valor recebido (R$) *</label><input required inputMode="decimal" className={input} value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} /></div>
            <div><label className={label}>Forma de recebimento *</label><select className={input} value={receiptForm.method} onChange={(e) => setReceiptForm({ ...receiptForm, method: e.target.value as FinancePaymentMethod })}>{Object.entries(METHODS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
            <div><label className={label}>Referência bancária</label><input maxLength={200} className={input} value={receiptForm.reference} onChange={(e) => setReceiptForm({ ...receiptForm, reference: e.target.value })} /></div>
            <div><label className={label}>Comprovante / referência</label><input maxLength={1000} className={input} value={receiptForm.proof} onChange={(e) => setReceiptForm({ ...receiptForm, proof: e.target.value })} /></div>
            <div><label className={label}>Observações</label><input maxLength={1000} className={input} value={receiptForm.notes} onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })} /></div>
          </div>
          <button type="submit" className={btnPrimary} disabled={saving || !canReceive}>{saving ? 'Registrando...' : 'Confirmar recebimento'}</button>
        </form>
      )}

      {receivables.length === 0 ? <div className={card + ' py-10 text-center text-xs text-slate-500'}>Nenhuma conta a receber cadastrada.</div> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {receivables.map((item) => {
            const balance = financeReceivableBalance(item);
            const history = receiptsByReceivable.get(item.id) || [];
            const late = item.status === 'aberto' && item.vencimento < t;
            return (
              <article key={item.id} className={card + ' space-y-3'}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{item.cliente.nome}</p><p className="text-[11px] text-slate-400">{item.documento}{item.parcela ? ' · Parcela ' + item.parcela : ''}</p><p className="mt-1 text-[10px] text-slate-500">Vencimento: {fmtDate(item.vencimento)}{item.contractId ? ' · Contrato vinculado' : ''}</p></div>
                  <span className={'rounded-full border px-2 py-1 text-[10px] font-semibold ' + (item.status === 'recebido' ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300' : late ? 'border-rose-800 bg-rose-950/50 text-rose-300' : 'border-amber-800 bg-amber-950/50 text-amber-300')}>{item.status === 'recebido' ? 'Recebido' : late ? 'Vencido' : 'Em aberto'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-950/50 p-3">
                  <div><p className="text-[10px] text-slate-500">Original</p><p className="font-mono text-xs font-bold text-white">{brl.format(item.valor)}</p></div>
                  <div><p className="text-[10px] text-slate-500">Recebido</p><p className="font-mono text-xs font-bold text-emerald-300">{brl.format(item.valorRecebido || 0)}</p></div>
                  <div><p className="text-[10px] text-slate-500">Saldo</p><p className="font-mono text-xs font-bold text-amber-300">{brl.format(balance)}</p></div>
                </div>
                {item.status === 'aberto' && canReceive && <button type="button" className={btnPrimary} onClick={() => openReceipt(item)}><Receipt className="h-3.5 w-3.5" />Registrar recebimento</button>}
                {history.length > 0 && <div className="space-y-2 border-t border-slate-800 pt-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Histórico de recebimentos ({history.length})</p>{history.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-[10px]"><span className="text-slate-300">{fmtDate(entry.receiptDate)} · {METHODS[entry.paymentMethod]}</span><span className="font-mono font-bold text-emerald-300">{brl.format(entry.receiptAmount)}</span><span className="text-slate-500">{entry.paymentReference || entry.proofReference || entry.id}</span></div>)}</div>}
              </article>
            );
          })}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-slate-500">Este painel é um controle financeiro interno. Não emite NF-e, boleto, cobrança ou lançamento fiscal. Registre somente valores efetivamente recebidos; não há recebimento automático nem compensação sem conferência.</p>
    </div>
  );
};
