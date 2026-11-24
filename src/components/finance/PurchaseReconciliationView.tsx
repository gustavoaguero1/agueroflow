import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, ClipboardCheck, FileWarning } from 'lucide-react';
import { db } from '../../firebase';
import type { NfeDocument } from '../../types/finance';
import type { MaterialReceiptRecord, PurchaseOrder } from '../../types/purchasing';
import {
  buildPurchaseReconciliations,
  RECONCILIATION_STATUS_CLASSES,
  RECONCILIATION_STATUS_LABELS,
} from '../../services/purchasingReconciliationService';
import { brl } from '../../services/financeService';
import { card, msgErr } from './ui';

const qty = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const date = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';

export const PurchaseReconciliationView: React.FC<{ orgId: string; invoices: NfeDocument[] }> = ({ orgId, invoices }) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ordersReady = false;
    let receiptsReady = false;
    const finishLoading = () => { if (ordersReady && receiptsReady) setLoading(false); };
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
    return () => { stopOrders(); stopReceipts(); };
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

  if (loading) return <div className={card + ' text-center text-xs text-slate-400 py-10'}>Carregando ordens, notas e recebimentos para conciliação…</div>;
  if (error) return <p className={msgErr}>{error}</p>;

  return (
    <div className="space-y-4" data-testid="purchase-reconciliation-view">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className={card}><p className="text-[11px] text-slate-400">Com divergência</p><p className="text-xl font-bold text-rose-300">{counts.divergence}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Pendentes de etapa</p><p className="text-xl font-bold text-amber-300">{counts.pending}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Parcialmente conciliadas</p><p className="text-xl font-bold text-blue-300">{counts.partial}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Conciliadas</p><p className="text-xl font-bold text-emerald-300">{counts.complete}</p></div>
      </div>

      <div className={card + ' flex items-start gap-2'}>
        <ClipboardCheck className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400">Relatório calculado em tempo real a partir das OCs, XML das NF-e e recibos. O comparativo de valor considera os itens (produtos), sem somar impostos e frete ao subtotal da OC. Esta tela não altera documentos nem bloqueia pagamentos automaticamente.</p>
      </div>

      {reconciliations.length === 0 ? (
        <div className={card + ' text-center text-xs text-slate-400 py-10'}>
          Nenhuma OC vinculada a uma NF-e ou a um recebimento foi encontrada.
          <p className="text-[11px] text-slate-500 mt-2">Classifique uma NF-e vinculando-a à OC ou registre o recebimento com a chave de acesso para iniciar a conciliação.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reconciliations.map((entry) => (
            <details key={entry.purchaseOrder.id} className={card + ' space-y-3'} open={entry.status === 'divergente'}>
              <summary className="cursor-pointer list-none flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">{entry.purchaseOrder.code}</span>
                    <span className={'px-2 py-0.5 rounded-full border text-[10px] font-semibold ' + RECONCILIATION_STATUS_CLASSES[entry.status]}>{RECONCILIATION_STATUS_LABELS[entry.status]}</span>
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
            </details>
          ))}
        </div>
      )}
    </div>
  );
};
