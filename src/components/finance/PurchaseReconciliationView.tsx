import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, ClipboardCheck, FileWarning, ShieldCheck, PlusCircle, CheckCircle2, XCircle, Clock3, FileCheck2, LockKeyhole } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  FinancePayable,
  FinancePayableAuthorization,
  FinanceReconciliationCase,
  FinanceReconciliationCaseStatus,
  FinanceReconciliationIssueType,
  NfeDocument,
} from '../../types/finance';
import type { MaterialReceiptRecord, PurchaseOrder } from '../../types/purchasing';
import {
  buildPurchaseReconciliations,
  RECONCILIATION_STATUS_CLASSES,
  RECONCILIATION_STATUS_LABELS,
} from '../../services/purchasingReconciliationService';
import {
  buildFinanceReconciliationCaseSnapshot,
  createFinanceReconciliationCase,
  transitionFinanceReconciliationCase,
} from '../../services/financeReconciliationCases';
import { createFinancePayableAuthorization } from '../../services/financePayableAuthorizationService';
import { brl } from '../../services/financeService';
import { card, msgErr, msgOk } from './ui';

const qty = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const date = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const dateTime = (value: unknown) => {
  if (!value) return '—';
  const d = value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
};
const CASE_STATUS_LABELS: Record<FinanceReconciliationCaseStatus, string> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
};
const CASE_STATUS_CLASSES: Record<FinanceReconciliationCaseStatus, string> = {
  aberta: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  em_analise: 'bg-blue-950/60 text-blue-300 border-blue-800/60',
  aprovada: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  rejeitada: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
};
const ISSUE_OPTIONS: Array<{ value: FinanceReconciliationIssueType; label: string }> = [
  { value: 'divergencia_valor_produtos', label: 'Diferença no valor total dos produtos' },
  { value: 'divergencia_preco_unitario', label: 'Preço unitário divergente' },
  { value: 'quantidade_faturada_acima', label: 'Quantidade faturada acima da OC' },
  { value: 'quantidade_recebida_sem_nf', label: 'Quantidade recebida sem NF-e suficiente' },
  { value: 'qualidade_pendente', label: 'Material pendente de liberação da qualidade' },
  { value: 'item_sem_vinculo', label: 'Item sem correspondência segura' },
  { value: 'xml_ausente', label: 'XML da NF-e ausente ou incompleto' },
  { value: 'outra', label: 'Outra divergência' },
];

const defaultIssueType = (entry: ReturnType<typeof buildPurchaseReconciliations>[number]): FinanceReconciliationIssueType => {
  if (Math.abs(entry.productValueDelta) > 0.05) return 'divergencia_valor_produtos';
  if (entry.unmatchedInvoiceItems.length || entry.unmatchedReceiptLines.length) return 'item_sem_vinculo';
  if (entry.missingXmlReceipts) return 'xml_ausente';
  if (entry.issues.some((issue) => issue.toLowerCase().includes('qualidade'))) return 'qualidade_pendente';
  if (entry.lines.some((line) => line.issues.some((issue) => issue.toLowerCase().includes('preço unitário')))) return 'divergencia_preco_unitario';
  if (entry.lines.some((line) => line.issues.some((issue) => issue.toLowerCase().includes('quantidade faturada acima')))) return 'quantidade_faturada_acima';
  if (entry.lines.some((line) => line.issues.some((issue) => issue.toLowerCase().includes('sem nf-e')))) return 'quantidade_recebida_sem_nf';
  return 'outra';
};

export const PurchaseReconciliationView: React.FC<{ orgId: string; invoices: NfeDocument[] }> = ({ orgId, invoices }) => {
  const { user, member, isSupervisorOrAbove, isManagerOrAbove, areaLevel, logAudit } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceiptRecord[]>([]);
  const [cases, setCases] = useState<FinanceReconciliationCase[]>([]);
  const [payables, setPayables] = useState<FinancePayable[]>([]);
  const [authorizations, setAuthorizations] = useState<FinancePayableAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [draftFor, setDraftFor] = useState<ReturnType<typeof buildPurchaseReconciliations>[number] | null>(null);
  const [draftType, setDraftType] = useState<FinanceReconciliationIssueType>('outra');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftEvidence, setDraftEvidence] = useState('');
  const [savingCase, setSavingCase] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [busyCaseId, setBusyCaseId] = useState<string | null>(null);
  const [busyPayableId, setBusyPayableId] = useState<string | null>(null);

  useEffect(() => {
    let ordersReady = false;
    let receiptsReady = false;
    let casesReady = false;
    let payablesReady = false;
    let authorizationsReady = false;
    const finishLoading = () => {
      if (ordersReady && receiptsReady && casesReady && payablesReady && authorizationsReady) setLoading(false);
    };
    const stopOrders = onSnapshot(
      query(collection(db, 'purchasing_orders'), where('organizationId', '==', orgId)),
      (snapshot) => {
        setOrders(snapshot.docs.map((entry) => ({ ...(entry.data() as PurchaseOrder), id: entry.id })));
        ordersReady = true;
        finishLoading();
      },
      (err) => { setError('Falha ao carregar ordens de compra: ' + err.message); ordersReady = true; finishLoading(); },
    );
    const stopReceipts = onSnapshot(
      query(collection(db, 'purchasing_receipts'), where('organizationId', '==', orgId)),
      (snapshot) => {
        setReceipts(snapshot.docs.map((entry) => ({ ...(entry.data() as MaterialReceiptRecord), id: entry.id })));
        receiptsReady = true;
        finishLoading();
      },
      (err) => { setError('Falha ao carregar recebimentos: ' + err.message); receiptsReady = true; finishLoading(); },
    );
    const stopCases = onSnapshot(
      query(collection(db, 'finance_reconciliation_cases'), where('orgId', '==', orgId)),
      (snapshot) => {
        setCases(snapshot.docs.map((entry) => ({ ...(entry.data() as FinanceReconciliationCase), id: entry.id })));
        casesReady = true;
        finishLoading();
      },
      (err) => { setError('Falha ao carregar registros de divergência: ' + err.message); casesReady = true; finishLoading(); },
    );
    const stopPayables = onSnapshot(
      query(collection(db, 'finance_payables'), where('orgId', '==', orgId)),
      (snapshot) => {
        setPayables(snapshot.docs.map((entry) => ({ ...(entry.data() as FinancePayable), id: entry.id })));
        payablesReady = true;
        finishLoading();
      },
      (err) => { setError('Falha ao carregar títulos relacionados: ' + err.message); payablesReady = true; finishLoading(); },
    );
    const stopAuthorizations = onSnapshot(
      query(collection(db, 'finance_payable_authorizations'), where('orgId', '==', orgId)),
      (snapshot) => {
        setAuthorizations(snapshot.docs.map((entry) => ({ ...(entry.data() as FinancePayableAuthorization), id: entry.id })));
        authorizationsReady = true;
        finishLoading();
      },
      (err) => { setError('Falha ao carregar autorizações existentes: ' + err.message); authorizationsReady = true; finishLoading(); },
    );
    return () => { stopOrders(); stopReceipts(); stopCases(); stopPayables(); stopAuthorizations(); };
  }, [orgId]);

  const reconciliations = useMemo(
    () => buildPurchaseReconciliations(invoices, orders, receipts),
    [invoices, orders, receipts],
  );

  const counts = useMemo(() => ({
    divergence: reconciliations.filter((entry) => entry.status === 'divergente').length,
    pending: reconciliations.filter((entry) => entry.status.startsWith('aguardando_')).length,
    partial: reconciliations.filter((entry) => entry.status === 'parcialmente_conciliada').length,
    complete: reconciliations.filter((entry) => entry.status === 'conciliada').length,
  }), [reconciliations]);

  const caseCounts = useMemo(() => ({
    open: cases.filter((item) => item.status === 'aberta').length,
    analysis: cases.filter((item) => item.status === 'em_analise').length,
    approved: cases.filter((item) => item.status === 'aprovada').length,
    rejected: cases.filter((item) => item.status === 'rejeitada').length,
  }), [cases]);

  const canCreateCase = isSupervisorOrAbove && areaLevel('financeiro') === 2;
  const canReviewCase = isManagerOrAbove && areaLevel('financeiro') === 2;

  const openCaseForm = (entry: ReturnType<typeof buildPurchaseReconciliations>[number]) => {
    setDraftFor(entry);
    setDraftType(defaultIssueType(entry));
    setDraftTitle('Divergência — ' + entry.purchaseOrder.code);
    setDraftDescription(entry.issues.length ? entry.issues.join('\n') : 'Descreva o que foi identificado na conferência da Ordem de Compra.');
    setDraftEvidence('');
    setActionMessage(null);
  };

  const submitCase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftFor || !user) {
      setActionMessage({ ok: false, text: 'Não foi possível identificar a empresa ou o usuário responsável.' });
      return;
    }
    setSavingCase(true);
    setActionMessage(null);
    try {
      const id = await createFinanceReconciliationCase(db, {
        orgId,
        purchaseOrderId: draftFor.purchaseOrder.id,
        purchaseOrderCode: draftFor.purchaseOrder.code,
        supplierName: draftFor.purchaseOrder.supplierName,
        supplierCnpj: draftFor.purchaseOrder.supplierCnpj,
        workOrderId: draftFor.purchaseOrder.linkedWorkOrderId,
        workOrderNumber: draftFor.purchaseOrder.linkedWorkOrderNumber,
        issueType: draftType,
        issueTitle: draftTitle,
        description: draftDescription,
        evidenceReference: draftEvidence,
        snapshot: buildFinanceReconciliationCaseSnapshot(draftFor),
        actor: { uid: user.uid, name: member?.userName || user.displayName || user.email || 'Usuário' },
      });
      await logAudit('Financeiro', 'Divergência de compra aberta', 'Registro ' + id + ' aberto para a OC ' + draftFor.purchaseOrder.code + ': ' + draftTitle, id);
      setDraftFor(null);
      setActionMessage({ ok: true, text: 'Divergência registrada. Ela já aparece no histórico desta Ordem de Compra.' });
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível registrar a divergência.' });
    } finally {
      setSavingCase(false);
    }
  };

  const changeCaseStatus = async (item: FinanceReconciliationCase, nextStatus: FinanceReconciliationCaseStatus) => {
    if (!user) return;
    const notes = (decisionNotes[item.id] || '').trim();
    setBusyCaseId(item.id);
    setActionMessage(null);
    try {
      await transitionFinanceReconciliationCase(db, {
        caseId: item.id,
        orgId,
        nextStatus,
        actor: { uid: user.uid, name: member?.userName || user.displayName || user.email || 'Revisor' },
        resolutionNotes: notes,
      });
      await logAudit(
        'Financeiro',
        nextStatus === 'em_analise' ? 'Divergência em análise' : nextStatus === 'aprovada' ? 'Divergência aprovada' : 'Divergência rejeitada',
        'Registro ' + item.id + ' da OC ' + item.purchaseOrderCode + (notes ? '. Justificativa: ' + notes : ''),
        item.id,
      );
      setDecisionNotes((previous) => ({ ...previous, [item.id]: '' }));
      setActionMessage({ ok: true, text: 'Etapa do registro atualizada com sucesso.' });
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível atualizar o registro.' });
    } finally {
      setBusyCaseId(null);
    }
  };

  const authorizePayable = async (item: FinanceReconciliationCase, payable: FinancePayable) => {
    if (!user) return;
    setBusyPayableId(payable.id);
    setActionMessage(null);
    try {
      const id = await createFinancePayableAuthorization(db, {
        orgId,
        caseId: item.id,
        payableId: payable.id,
        actor: { uid: user.uid, name: member?.userName || user.displayName || user.email || 'Gerente' },
      });
      await logAudit(
        'Financeiro',
        'Autorização documental vinculada ao título',
        'Autorização ' + id + ' registrada para o título ' + payable.id + ', vinculada à ocorrência ' + item.id + '. Nenhuma baixa ou pagamento foi executado.',
        id,
      );
      setActionMessage({ ok: true, text: 'Autorização documental registrada no título existente. O status do pagamento não foi alterado.' });
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível registrar a autorização.' });
    } finally {
      setBusyPayableId(null);
    }
  };

  if (loading) return <div className={card + ' text-center text-xs text-slate-400 py-10'}>Carregando ordens, notas, recebimentos e divergências…</div>;
  if (error) return <p className={msgErr}>{error}</p>;

  return (
    <div className="space-y-4" data-testid="purchase-reconciliation-view">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className={card}><p className="text-[11px] text-slate-400">Com divergência</p><p className="text-xl font-bold text-rose-300">{counts.divergence}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Pendentes de etapa</p><p className="text-xl font-bold text-amber-300">{counts.pending}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Parcialmente conciliadas</p><p className="text-xl font-bold text-blue-300">{counts.partial}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Conciliadas</p><p className="text-xl font-bold text-emerald-300">{counts.complete}</p></div>
      </div>

      <div className={card + ' grid grid-cols-2 sm:grid-cols-4 gap-3'}>
        <div><p className="text-[11px] text-slate-400">Divergências abertas</p><p className="text-xl font-bold text-amber-300">{caseCounts.open}</p></div>
        <div><p className="text-[11px] text-slate-400">Em análise</p><p className="text-xl font-bold text-blue-300">{caseCounts.analysis}</p></div>
        <div><p className="text-[11px] text-slate-400">Aprovadas</p><p className="text-xl font-bold text-emerald-300">{caseCounts.approved}</p></div>
        <div><p className="text-[11px] text-slate-400">Rejeitadas</p><p className="text-xl font-bold text-rose-300">{caseCounts.rejected}</p></div>
      </div>

      <div className={card + ' flex items-start gap-2'}>
        <ClipboardCheck className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400">Conciliação calculada em tempo real a partir de OCs, XML das NF-e e recibos. O registro de divergência guarda um retrato dos dados no momento da abertura. Aprovar ou rejeitar documenta a decisão, mas não bloqueia nem libera pagamentos automaticamente e não altera estoque, OC ou NF-e.</p>
      </div>

      {actionMessage && <p className={actionMessage.ok ? msgOk : msgErr}>{actionMessage.text}</p>}

      {reconciliations.length === 0 ? (
        <div className={card + ' text-center text-xs text-slate-400 py-10'}>
          Nenhuma OC vinculada a uma NF-e ou a um recebimento foi encontrada.
          <p className="text-[11px] text-slate-500 mt-2">Classifique uma NF-e vinculando-a à OC ou registre o recebimento com a chave de acesso para iniciar a conciliação.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reconciliations.map((entry) => {
            const entryCases = cases.filter((item) => item.purchaseOrderId === entry.purchaseOrder.id);
            return (
              <details key={entry.purchaseOrder.id} className={card + ' space-y-3'} open={entry.status === 'divergente'}>
                <summary className="cursor-pointer list-none flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">{entry.purchaseOrder.code}</span>
                      <span className={'px-2 py-0.5 rounded-full border text-[10px] font-semibold ' + RECONCILIATION_STATUS_CLASSES[entry.status]}>{RECONCILIATION_STATUS_LABELS[entry.status]}</span>
                      {entryCases.length > 0 && <span className="px-2 py-0.5 rounded-full border border-slate-700 text-[10px] text-slate-300">{entryCases.length} ocorrência(s)</span>}
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{entry.purchaseOrder.supplierName} · {entry.purchaseOrder.linkedWorkOrderNumber ? 'OS ' + entry.purchaseOrder.linkedWorkOrderNumber : 'Sem OS vinculada'}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10px] text-slate-400">
                    <span>{entry.invoices.length} NF-e</span>
                    <span>{entry.receipts.length} recebimento(s)</span>
                    <span>{qty(entry.invoicedQuantity)} faturado</span>
                    <span>{qty(entry.physicalQuantity)} recebido</span>
                  </div>
                </summary>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 pt-3 border-t border-slate-800">
                  <div className="bg-slate-950/70 rounded-lg p-3"><p className="text-[10px] text-slate-400">OC — subtotal de itens</p><p className="text-sm font-bold font-mono text-white">{brl.format(entry.orderSubtotal)}</p><p className="text-[10px] text-slate-500">Total OC com frete: {brl.format(entry.purchaseOrder.totalValue)}</p></div>
                  <div className="bg-slate-950/70 rounded-lg p-3"><p className="text-[10px] text-slate-400">NF-e — produtos faturados</p><p className="text-sm font-bold font-mono text-white">{brl.format(entry.invoiceProductsValue)}</p><p className="text-[10px] text-slate-500">Total NF-e: {brl.format(entry.invoices.reduce((sum, invoice) => sum + (invoice.valorTotal || 0), 0))}</p></div>
                  <div className="bg-slate-950/70 rounded-lg p-3"><p className="text-[10px] text-slate-400">OC equivalente à qtd faturada</p><p className="text-sm font-bold font-mono text-white">{brl.format(entry.orderValueForInvoicedQuantity)}</p><p className={'text-[10px] mt-1 ' + (Math.abs(entry.productValueDelta) > 0.05 ? 'text-amber-300' : 'text-emerald-300')}>Diferença: {brl.format(entry.productValueDelta)}</p></div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] min-w-[850px]">
                    <thead><tr className="text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-3">Item da OC</th><th className="py-2 px-2 text-right">Qtd. OC</th><th className="py-2 px-2 text-right">Qtd. NF-e</th><th className="py-2 px-2 text-right">Qtd. física</th><th className="py-2 px-2 text-right">Qtd. aceita</th><th className="py-2 px-2 text-right">Qtd. estoque</th><th className="py-2 px-2 text-right">Preço OC</th><th className="py-2 px-2 text-right">Preço NF-e</th><th className="py-2 pl-2">Conferência</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-800">
                      {entry.lines.map((line) => (
                        <tr key={line.purchaseOrderItemId}>
                          <td className="py-2 pr-3 text-slate-200"><span className="text-slate-500 mr-1">#{line.itemNumber}</span>{line.description}<span className="text-slate-500 ml-1">({line.unit})</span></td>
                          <td className="py-2 px-2 text-right font-mono">{qty(line.quantityOrdered)}</td>
                          <td className="py-2 px-2 text-right font-mono">{qty(line.quantityInvoiced)}</td>
                          <td className="py-2 px-2 text-right font-mono">{qty(line.quantityPhysicallyReceived)}</td>
                          <td className="py-2 px-2 text-right font-mono">{qty(line.quantityAccepted)}</td>
                          <td className="py-2 px-2 text-right font-mono">{qty(line.quantityInStock)}</td>
                          <td className="py-2 px-2 text-right font-mono">{brl.format(line.orderUnitPrice)}</td>
                          <td className="py-2 px-2 text-right font-mono">{line.invoiceUnitPrice === undefined ? '—' : brl.format(line.invoiceUnitPrice)}</td>
                          <td className="py-2 pl-2">
                            {line.issues.length
                              ? <span className="text-rose-300">{line.issues.join(' ')}</span>
                              : line.quantityInvoiced > 0 || line.quantityPhysicallyReceived > 0
                                ? <span className="text-emerald-300">Sem divergência identificada</span>
                                : <span className="text-slate-500">Aguardando faturamento</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {entry.invoices.length > 0 && <p className="text-[10px] text-slate-500">NF-e vinculadas: {entry.invoices.map((invoice) => (invoice.numero || invoice.chave) + ' · ' + brl.format(invoice.valorTotal || 0)).join(' | ')}</p>}

                {entry.unmatchedInvoiceItems.length > 0 && (
                  <div className="rounded-lg border border-rose-800/50 bg-rose-950/20 p-3 space-y-1">
                    <p className="text-xs font-semibold text-rose-300 flex items-center gap-2"><FileWarning className="w-3.5 h-3.5" />Itens da NF-e sem vínculo automático seguro</p>
                    {entry.unmatchedInvoiceItems.map((item, index) => <p key={index} className="text-[11px] text-slate-300">{item.invoiceNumber} · {item.description} ({item.code || 'sem código'}) — {item.reason}</p>)}
                  </div>
                )}

                {entry.unmatchedReceiptLines.length > 0 && (
                  <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-300 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />Linhas de recebimento sem vínculo com a OC</p>
                    {entry.unmatchedReceiptLines.map((line, index) => <p key={index} className="text-[11px] text-slate-300">{line.receiptId} · {line.description} — {line.reason}</p>)}
                  </div>
                )}

                {entry.missingXmlReceipts > 0 && <p className="text-[11px] text-amber-300 flex items-center gap-2"><FileWarning className="w-3.5 h-3.5" />Há recebimento(s) sem XML completo da NF-e correspondente. Importe o XML para conferir os itens e os preços.</p>}
                {entry.issues.length > 0 && <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-300">{entry.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}

                <div className="border-t border-slate-800 pt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-200 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-300" />Tratamento de divergências</p>
                    {canCreateCase && (entry.issues.length > 0 || entry.status === 'divergente') && (
                      <button type="button" onClick={() => openCaseForm(entry)} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 px-3 py-2 text-[11px] font-semibold text-white">
                        <PlusCircle size={14} /> Registrar ocorrência
                      </button>
                    )}
                  </div>
                  {entryCases.length === 0
                    ? <p className="text-[11px] text-slate-500">Nenhuma ocorrência formal registrada para esta OC.</p>
                    : <div className="space-y-2">
                      {entryCases.map((item) => {
                        const invoiceKeys = item.snapshot?.invoiceKeys || [];
                        const linkedPayables = payables.filter((payable) =>
                          payable.purchaseOrderId === item.purchaseOrderId
                          && digits(payable.fornecedor.cnpj) === digits(item.supplierCnpj)
                          && !!payable.nfeChave
                          && invoiceKeys.some((key) => digits(key) === digits(payable.nfeChave)),
                        );
                        return (
                        <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2" data-testid="finance-reconciliation-case">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-100">{item.issueTitle}</p>
                              <p className="text-[10px] text-slate-500">Aberta por {item.createdByName} · {dateTime(item.createdAt)} · {item.id}</p>
                            </div>
                            <span className={'rounded-full border px-2 py-0.5 text-[10px] font-semibold ' + CASE_STATUS_CLASSES[item.status]}>{CASE_STATUS_LABELS[item.status]}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 whitespace-pre-wrap">{item.description}</p>
                          {item.evidenceReference && <p className="text-[10px] text-slate-400">Evidência: {item.evidenceReference}</p>}
                          {item.resolutionNotes && <p className="text-[11px] text-slate-300">Decisão: {item.resolutionNotes} <span className="text-slate-500">— {item.reviewedByName || 'Revisor'} · {dateTime(item.reviewedAt)}</span></p>}
                          {canReviewCase && item.status === 'aberta' && (
                            <button type="button" disabled={busyCaseId === item.id} onClick={() => changeCaseStatus(item, 'em_analise')} className="rounded-lg border border-blue-800 px-3 py-1.5 text-[11px] text-blue-300 hover:bg-blue-950/40 disabled:opacity-50">
                              <Clock3 className="inline w-3.5 h-3.5 mr-1" />Iniciar análise
                            </button>
                          )}
                          {canReviewCase && item.status === 'em_analise' && (
                            <div className="space-y-2">
                              <textarea
                                rows={2}
                                maxLength={2000}
                                value={decisionNotes[item.id] || ''}
                                onChange={(event) => setDecisionNotes((previous) => ({ ...previous, [item.id]: event.target.value }))}
                                placeholder="Justificativa obrigatória para aprovar ou rejeitar (mínimo 5 caracteres)"
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-white"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={busyCaseId === item.id || (decisionNotes[item.id] || '').trim().length < 5} onClick={() => changeCaseStatus(item, 'aprovada')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
                                  <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" />Aprovar
                                </button>
                                <button type="button" disabled={busyCaseId === item.id || (decisionNotes[item.id] || '').trim().length < 5} onClick={() => changeCaseStatus(item, 'rejeitada')} className="rounded-lg bg-rose-800 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
                                  <XCircle className="inline w-3.5 h-3.5 mr-1" />Rejeitar
                                </button>
                              </div>
                            </div>
                          )}
                          {item.status === 'aprovada' && (
                            <div className="mt-3 border-t border-slate-800 pt-3 space-y-2" data-testid="payable-authorization-panel">
                              <p className="text-[11px] font-semibold text-slate-200 flex items-center gap-2">
                                <LockKeyhole className="w-3.5 h-3.5 text-emerald-300" />Autorização documental em Contas a Pagar
                              </p>
                              <p className="text-[10px] text-slate-500">Vincula a decisão aprovada ao título NF-e já existente. Não cria parcela, não altera vencimento e não executa pagamento.</p>
                              {linkedPayables.length === 0
                                ? <p className="text-[11px] text-amber-300">{invoiceKeys.length === 0 ? 'Esta ocorrência é anterior ao registro das chaves das NF-e; não é possível vincular títulos automaticamente com segurança.' : 'Nenhum título em Contas a Pagar corresponde à NF-e, fornecedor e OC deste registro.'}</p>
                                : <div className="space-y-2">
                                  {linkedPayables.map((payable) => {
                                    const authorization = authorizations.find((entry) => entry.payableId === payable.id);
                                    return (
                                      <div key={payable.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-[11px] text-slate-200">{payable.documento}{payable.parcela ? ' · parcela ' + payable.parcela : ''} · {brl.format(payable.valor)}</p>
                                          <p className="text-[10px] text-slate-500">Vencimento {date(payable.vencimento)} · {payable.status === 'aberto' ? 'Em aberto' : payable.status === 'pago' ? 'Pago' : 'Cancelado'}</p>
                                          {authorization && <p className="text-[10px] text-emerald-300">Autorização {authorization.id} · {authorization.authorizedByName} · valor registrado {brl.format(authorization.authorizedValue)}</p>}
                                        </div>
                                        {authorization
                                          ? <span className="shrink-0 rounded border border-emerald-800 px-2 py-1 text-[10px] text-emerald-300"><FileCheck2 className="inline w-3 h-3 mr-1" />Autorização registrada</span>
                                          : payable.status !== 'aberto'
                                            ? <span className="text-[10px] text-slate-500">Título não está em aberto</span>
                                            : canReviewCase
                                              ? <button type="button" disabled={busyPayableId === payable.id} onClick={() => authorizePayable(item, payable)} className="shrink-0 rounded-lg border border-emerald-800 px-3 py-1.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50">{busyPayableId === payable.id ? 'Registrando…' : 'Registrar autorização'}</button>
                                              : <span className="text-[10px] text-slate-500">Aguardando Admin/Gerente</span>}
                                      </div>
                                    );
                                  })}
                                </div>}
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {draftFor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Registrar divergência financeira</h3>
                <p className="text-[11px] text-slate-400 mt-1">{draftFor.purchaseOrder.code} · {draftFor.purchaseOrder.supplierName}</p>
              </div>
              <button type="button" onClick={() => setDraftFor(null)} className="text-slate-400 hover:text-white" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={submitCase} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tipo de divergência</label>
                <select value={draftType} onChange={(event) => setDraftType(event.target.value as FinanceReconciliationIssueType)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                  {ISSUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Título</label>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={140} required className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Descrição e providência necessária</label>
                <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={5} maxLength={4000} required placeholder="Informe o que divergiu, o impacto e qual conferência precisa ser realizada." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                <p className="text-[10px] text-slate-500 mt-1">Mínimo de 10 caracteres. O resumo da conciliação será anexado automaticamente ao registro.</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Referência de evidência (opcional)</label>
                <input value={draftEvidence} onChange={(event) => setDraftEvidence(event.target.value)} maxLength={1000} placeholder="Link ou caminho do DANFE, e-mail, laudo ou documento interno" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                <p className="text-[10px] text-slate-500 mt-1">Este campo guarda uma referência; não faz upload de arquivos nesta etapa.</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-[10px] text-slate-400 space-y-1">
                <p>O registro preserva os valores, quantidades, NF-e, recibos e alertas existentes no momento da abertura.</p>
                <p>O fluxo começa como Aberta e exige análise e justificativa do Admin/Gerente para aprovação ou rejeição.</p>
                <p>A decisão não altera nem libera automaticamente contas a pagar.</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setDraftFor(null)} disabled={savingCase} className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300">Cancelar</button>
                <button type="submit" disabled={savingCase || !draftTitle.trim() || draftDescription.trim().length < 10} className="rounded-lg bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{savingCase ? 'Registrando…' : 'Salvar ocorrência'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
