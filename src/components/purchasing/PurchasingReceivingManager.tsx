import React, { useEffect, useState } from 'react';
import {
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Plus,
  ShieldAlert,
  ClipboardList,
  X
} from 'lucide-react';
import {
  MaterialReceiptRecord,
  PurchaseOrder
} from '../../types/purchasing';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { getReceivingInventorySetup, registerPurchaseReceipt } from '../../services/purchasingReceivingService';
import type { Item, Unit } from '../../types';

type ItemReceiptFormState = {
  quantity: number;
  heatNumber: string;
  isConform: boolean;
  notes: string;
  stockDisposition: 'estoque' | 'nao_estocavel';
  catalogItemId: string;
};

interface PurchasingReceivingManagerProps {
  receipts: MaterialReceiptRecord[];
  orders: PurchaseOrder[];
  currentOrgId: string;
  currentUserName: string;
  onRefresh: () => void;
}

export const PurchasingReceivingManager: React.FC<PurchasingReceivingManagerProps> = ({
  receipts,
  orders,
  currentOrgId,
  currentUserName,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceKey, setInvoiceKey] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockUnitId, setStockUnitId] = useState('');
  const [status, setStatus] = useState<MaterialReceiptRecord['status']>('conforme');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [itemReceiptState, setItemReceiptState] = useState<Record<string, ItemReceiptFormState>>({});

  useEffect(() => {
    let active = true;
    setInventoryLoading(true);
    getReceivingInventorySetup(currentOrgId)
      .then(({ items, units: loadedUnits }) => {
        if (!active) return;
        setCatalogItems(items);
        setUnits(loadedUnits);
        setStockUnitId((previous) => previous || loadedUnits[0]?.id || '');
      })
      .catch((error) => {
        if (active) setFormError(error instanceof Error ? error.message : 'Falha ao carregar catálogo e unidades.');
      })
      .finally(() => {
        if (active) setInventoryLoading(false);
      });
    return () => { active = false; };
  }, [currentOrgId]);

  const initializeOrderLines = (order: PurchaseOrder) => {
    const initial: Record<string, ItemReceiptFormState> = {};
    order.items.forEach((orderItem) => {
      const matched = catalogItems.find((item) =>
        (orderItem.internalCode && [item.sku, item.code].some((code) => code?.trim().toLowerCase() === orderItem.internalCode?.trim().toLowerCase()))
        || (orderItem.manufacturerCode && [item.sku, item.code].some((code) => code?.trim().toLowerCase() === orderItem.manufacturerCode?.trim().toLowerCase()))
      );
      initial[orderItem.id] = {
        quantity: Math.max(0, orderItem.quantityOrdered - (orderItem.quantityReceived || 0)),
        heatNumber: orderItem.heatNumber || '',
        isConform: true,
        notes: '',
        stockDisposition: 'estoque',
        catalogItemId: matched?.id || '',
      };
    });
    setItemReceiptState(initial);
  };

  // Eligible orders for receipt (not fully received yet and not cancelled)
  const openOrders = orders.filter(
    (o) => o.status !== 'recebida_total' && o.status !== 'cancelada'
  );

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);

  const handleOpenReceiptModal = (order?: PurchaseOrder) => {
    const targetOrder = order || openOrders[0];
    if (targetOrder) {
      setSelectedOrderId(targetOrder.id);
      initializeOrderLines(targetOrder);
    }
    setInvoiceNumber('');
    setInvoiceKey('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setStatus('conforme');
    setNotes('');
    setFormError(null);
    setIsReceivingModalOpen(true);
  };

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    const order = orders.find((candidate) => candidate.id === orderId);
    if (order) initializeOrderLines(order);
  };

  const updateReceiptLine = (itemId: string, patch: Partial<ItemReceiptFormState>) => {
    setItemReceiptState((previous) => ({
      ...previous,
      [itemId]: { ...previous[itemId], ...patch },
    }));
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !user) {
      setFormError('Não foi possível identificar a Ordem de Compra ou o usuário responsável.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setFormError('Informe o número da NF-e de entrada.');
      return;
    }
    if (invoiceKey.trim() && !/^\\d{44}$/.test(invoiceKey.trim())) {
      setFormError('A chave de acesso deve conter exatamente 44 dígitos.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const lines = selectedOrder.items.map((orderItem) => {
        const state = itemReceiptState[orderItem.id] || {
          quantity: 0,
          heatNumber: '',
          isConform: true,
          notes: '',
          stockDisposition: 'estoque' as const,
          catalogItemId: '',
        };
        return {
          purchaseOrderItemId: orderItem.id,
          quantityReceived: Number(state.quantity) || 0,
          heatNumber: state.heatNumber.trim() || undefined,
          isConform: state.isConform,
          nonConformityNotes: state.notes.trim() || undefined,
          stockDisposition: state.stockDisposition,
          catalogItemId: state.stockDisposition === 'estoque' ? state.catalogItemId || undefined : undefined,
        };
      }).filter((line) => line.quantityReceived > 0);

      if (lines.length === 0) {
        throw new Error('Informe a quantidade recebida em pelo menos um item.');
      }

      const result = await registerPurchaseReceipt(db, {
        organizationId: currentOrgId,
        purchaseOrderId: selectedOrder.id,
        invoiceNumber: invoiceNumber.trim(),
        invoiceKey: invoiceKey.trim() || undefined,
        receiptDate,
        receivedBy: user.uid,
        receivedByName: currentUserName,
        stockUnitId: stockUnitId || undefined,
        itemsReceived: lines,
        status,
        notes: notes.trim() || undefined,
      });

      setIsReceivingModalOpen(false);
      onRefresh();
      const stockMessage = result.quantityAddedToStock > 0
        ? ` ${result.quantityAddedToStock} unidade(s) lançada(s) no estoque.`
        : ' Nenhum item foi liberado para o estoque.';
      alert(`Recebimento ${invoiceNumber} registrado. ${result.stockLines} linha(s) movimentada(s).${stockMessage}`);
    } catch (err) {
      console.error('Erro ao registrar recebimento e integrar estoque:', err);
      setFormError(err instanceof Error ? err.message : 'Erro ao registrar recebimento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PackageCheck className="text-cyan-400" size={22} />
            Recebimento Físico & Controle de Corrida (Heat Number)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Inspeção de almoxarifado, conferência de DANFE/NF-e e rastreabilidade metalúrgica de usina.
          </p>
        </div>
        <button
          onClick={() => handleOpenReceiptModal()}
          disabled={openOrders.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow transition"
        >
          <Plus size={16} /> Registrar Entrada / NF-e
        </button>
      </div>

      {/* History of Receipts Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="bg-slate-950/70 px-5 py-3 border-b border-slate-800 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <ClipboardList size={16} className="text-cyan-400" />
            Histórico de Recebimentos Realizados ({receipts.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/40 text-slate-400 border-b border-slate-800">
                <th className="p-3.5">Data Entrada</th>
                <th className="p-3.5">NF-e</th>
                <th className="p-3.5">Ordem de Compra</th>
                <th className="p-3.5">Fornecedor</th>
                <th className="p-3.5">Responsável / Recebedor</th>
                <th className="p-3.5">Itens Conferidos</th>
                <th className="p-3.5 text-center">Status Inspeção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-500">
                    Nenhum recebimento registrado no almoxarifado ainda.
                  </td>
                </tr>
              ) : (
                receipts.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 text-slate-300">
                      {new Date(rec.receiptDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-cyan-300">
                      NF-e {rec.invoiceNumber}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-white">
                      {rec.purchaseOrderCode}
                    </td>
                    <td className="p-3.5 text-slate-300">{rec.supplierName}</td>
                    <td className="p-3.5 text-slate-400">{rec.receivedByName}</td>
                    <td className="p-3.5">
                      <div className="space-y-1">
                        {rec.itemsReceived.map((it, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[11px]">
                            <span className="text-white font-medium">
                              {it.quantityReceived} {it.unit}
                            </span>
                            <span className="text-slate-400 truncate max-w-[150px]">
                              {it.description}
                            </span>
                            {it.heatNumber && (
                              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                                Corrida: {it.heatNumber}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                          rec.status === 'conforme'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : rec.status === 'conforme_com_ressalva'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {rec.status === 'conforme' ? (
                          <>
                            <CheckCircle2 size={12} /> Conforme 100%
                          </>
                        ) : rec.status === 'conforme_com_ressalva' ? (
                          <>
                            <AlertTriangle size={12} /> Com Ressalva
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={12} /> Rejeitado
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Registrar Recebimento */}
      {isReceivingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PackageCheck className="text-cyan-400" size={20} />
                  Check-in de Materiais & Inspeção de Entrada
                </h3>
                <p className="text-xs text-slate-400">
                  Preencha a NF-e e anote a Corrida Metalúrgica (Heat Number) dos certificados.
                </p>
              </div>
              <button
                onClick={() => setIsReceivingModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitReceipt} className="space-y-4">
              {formError && (
                <div className="rounded-lg border border-rose-800 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ordem de Compra (OC) *
                  </label>
                  <select
                    value={selectedOrderId}
                    onChange={(e) => handleOrderChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  >
                    {openOrders.map((ord) => (
                      <option key={ord.id} value={ord.id}>
                        {ord.code} — {ord.supplierName} ({ord.items.length} itens)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número da NF-e (DANFE) *
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Ex: 000.184.920"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Chave de Acesso da NF-e (opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={44}
                    value={invoiceKey}
                    onChange={(e) => setInvoiceKey(e.target.value.replace(/\\D/g, '').slice(0, 44))}
                    placeholder="44 dígitos"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data do Recebimento Físico
                  </label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              </div>

              {/* Items Verification Table */}
              {selectedOrder && (
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-950 px-4 py-2 text-xs font-bold text-slate-300 flex flex-wrap justify-between gap-2">
                    <span>CONFERÊNCIA DOS ITENS</span>
                    <span className="text-slate-400">
                      Fornecedor: {selectedOrder.supplierName}
                    </span>
                  </div>

                  <div className="border-b border-slate-800 bg-slate-900/80 p-3">
                    <label className="text-[10px] text-cyan-300 font-semibold block mb-1">
                      Unidade / Almoxarifado de destino do estoque
                    </label>
                    <select
                      value={stockUnitId}
                      onChange={(e) => setStockUnitId(e.target.value)}
                      disabled={inventoryLoading || units.length === 0}
                      className="w-full max-w-xl bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                    >
                      <option value="">Selecione a unidade de destino...</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name} {unit.code ? `(${unit.code})` : ''}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      O saldo será atualizado somente para linhas aprovadas, marcadas como estocáveis e vinculadas a um material ativo do catálogo.
                    </p>
                    {inventoryLoading && <p className="text-[10px] text-slate-400 mt-1">Carregando catálogo e unidades...</p>}
                    {!inventoryLoading && units.length === 0 && <p className="text-[10px] text-amber-300 mt-1">Cadastre uma unidade antes de lançar materiais no estoque.</p>}
                  </div>

                  <div className="divide-y divide-slate-800 max-h-[32rem] overflow-y-auto">
                    {selectedOrder.items.map((it) => {
                      const state = itemReceiptState[it.id] || {
                        quantity: 0,
                        heatNumber: '',
                        isConform: true,
                        notes: '',
                        stockDisposition: 'estoque' as const,
                        catalogItemId: '',
                      };
                      const remaining = Math.max(0, it.quantityOrdered - (it.quantityReceived || 0));

                      return (
                        <div key={it.id} className="p-3 bg-slate-900/70 space-y-3">
                          <div className="flex justify-between items-start text-xs gap-3">
                            <div>
                              <span className="font-semibold text-white">{it.description}</span>
                              <div className="text-[11px] text-slate-400">
                                Pedido: {it.quantityOrdered} {it.unit} • Já recebido: {it.quantityReceived || 0} {it.unit} • Pendente: {remaining} {it.unit} • Custo unit.: {Number(it.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                            </div>
                            {remaining <= 0 && <span className="shrink-0 text-[10px] text-emerald-300">Quantidade completa</span>}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">
                                Quantidade física recebida ({it.unit})
                              </label>
                              <input
                                type="number"
                                min="0"
                                max={remaining}
                                step="any"
                                value={state.quantity}
                                onChange={(e) => updateReceiptLine(it.id, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] text-cyan-400 font-semibold block mb-0.5">
                                Corrida metalúrgica (Heat No.)
                              </label>
                              <input
                                type="text"
                                value={state.heatNumber}
                                onChange={(e) => updateReceiptLine(it.id, { heatNumber: e.target.value })}
                                placeholder="Ex.: C-98240-B"
                                className="w-full bg-slate-950 border border-cyan-800/60 rounded-lg px-2.5 py-2 text-white font-mono"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Destino da quantidade</label>
                              <select
                                value={state.stockDisposition}
                                onChange={(e) => updateReceiptLine(it.id, { stockDisposition: e.target.value as ItemReceiptFormState['stockDisposition'] })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                              >
                                <option value="estoque">Material para estoque</option>
                                <option value="nao_estocavel">Serviço / consumo direto / não estocável</option>
                              </select>
                            </div>

                            <div className="flex items-end">
                              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 w-full">
                                <input
                                  type="checkbox"
                                  checked={state.isConform}
                                  onChange={(e) => updateReceiptLine(it.id, { isConform: e.target.checked })}
                                  className="rounded accent-emerald-500"
                                />
                                <span className="text-xs text-slate-300 font-medium">Qualidade aprovada</span>
                              </label>
                            </div>
                          </div>

                          {state.stockDisposition === 'estoque' && (
                            <div>
                              <label className="text-[10px] text-cyan-300 font-semibold block mb-0.5">
                                Vincular ao item do catálogo (obrigatório para entrada em estoque)
                              </label>
                              <select
                                value={state.catalogItemId}
                                onChange={(e) => updateReceiptLine(it.id, { catalogItemId: e.target.value })}
                                disabled={inventoryLoading}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                              >
                                <option value="">Selecione o material no catálogo...</option>
                                {catalogItems.map((item) => (
                                  <option key={item.id} value={item.id}>{item.sku} — {item.name} ({item.unitOfMeasure})</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {!state.isConform && (
                            <div>
                              <label className="text-[10px] text-rose-300 font-semibold block mb-0.5">
                                Motivo da não conformidade (obrigatório)
                              </label>
                              <input
                                type="text"
                                value={state.notes}
                                onChange={(e) => updateReceiptLine(it.id, { notes: e.target.value })}
                                placeholder="Descreva a divergência dimensional, especificação ou documentação..."
                                className="w-full bg-slate-950 border border-rose-800/60 rounded-lg px-2.5 py-2 text-xs text-white"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Parecer Geral da Inspeção
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="conforme">Conforme 100% (Aprovado)</option>
                    <option value="conforme_com_ressalva">Conforme com Ressalva</option>
                    <option value="rejeitado">Rejeitado na Entrada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Observações de Almoxarifado
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Certificados de qualidade arquivados na pasta da obra..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReceivingModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow"
                >
                  {submitting ? 'Gravando Entrada...' : 'Concluir Recebimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
