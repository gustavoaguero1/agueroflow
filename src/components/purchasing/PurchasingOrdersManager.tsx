import React, { useState } from 'react';
import {
  ShoppingCart,
  Download,
  Plus,
  Search,
  Filter,
  Truck,
  CheckCircle,
  Clock,
  AlertTriangle,
  Building,
  Calendar,
  DollarSign,
  FileText,
  ChevronRight,
  Eye,
  Hash,
  X
} from 'lucide-react';
import { PurchaseOrder, PurchaseOrderStatus } from '../../types/purchasing';
import { exportPurchaseOrderPdf, updatePurchaseOrderStatus } from '../../services/purchasingService';

interface PurchasingOrdersManagerProps {
  orders: PurchaseOrder[];
  onRefresh: () => void;
  onOpenNewOrderModal: () => void;
}

export const PurchasingOrdersManager: React.FC<PurchasingOrdersManagerProps> = ({
  orders,
  onRefresh,
  onOpenNewOrderModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [updating, setUpdating] = useState(false);

  // Status transition modal
  const [isTransitModalOpen, setIsTransitModalOpen] = useState(false);
  const [carrierName, setCarrierName] = useState('');
  const [trackingCode, setTrackingCode] = useState('');

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.requisitionCode && o.requisitionCode.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'todos' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'emitida':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
            <Clock size={12} /> Emitida
          </span>
        );
      case 'confirmada_fornecedor':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
            <CheckCircle size={12} /> Confirmada
          </span>
        );
      case 'em_transito':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
            <Truck size={12} /> Em Trânsito
          </span>
        );
      case 'recebida_parcial':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
            <Clock size={12} /> Recebimento Parcial
          </span>
        );
      case 'recebida_total':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <CheckCircle size={12} /> Recebida Total
          </span>
        );
      case 'cancelada':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
            <AlertTriangle size={12} /> Cancelada
          </span>
        );
    }
  };

  const handleDownloadPdf = (order: PurchaseOrder) => {
    exportPurchaseOrderPdf(order);
  };

  const handleMarkInTransit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setUpdating(true);
    try {
      await updatePurchaseOrderStatus(selectedOrder.id, 'em_transito', {
        carrierName: carrierName.trim() || 'Transportadora Terceirizada',
        trackingCode: trackingCode.trim() || undefined,
      });
      setIsTransitModalOpen(false);
      onRefresh();
      setSelectedOrder({
        ...selectedOrder,
        status: 'em_transito',
        carrierName,
        trackingCode,
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar status da OC.');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateStatusDirect = async (orderId: string, newStatus: PurchaseOrderStatus) => {
    setUpdating(true);
    try {
      await updatePurchaseOrderStatus(orderId, newStatus);
      onRefresh();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao alterar status.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="text-cyan-400" size={22} />
            Ordens de Compra Autorizadas (OCs)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Gestão formal de pedidos industriais, exportação de espelho PDF para fornecedor e rastreio de entrega.
          </p>
        </div>
        <button
          onClick={onOpenNewOrderModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-cyan-600/20 transition"
        >
          <Plus size={16} /> Emitir Nova OC Direta
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, fornecedor ou RC..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={16} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="todos">Todos os Status</option>
            <option value="emitida">Emitida</option>
            <option value="confirmada_fornecedor">Confirmada Fornecedor</option>
            <option value="em_transito">Em Trânsito</option>
            <option value="recebida_parcial">Recebida Parcial</option>
            <option value="recebida_total">Recebida Total</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                <th className="p-3.5 font-semibold">Código OC</th>
                <th className="p-3.5 font-semibold">Fornecedor</th>
                <th className="p-3.5 font-semibold">Origem / Ref</th>
                <th className="p-3.5 font-semibold">Data Emissão</th>
                <th className="p-3.5 font-semibold">Previsão Entrega</th>
                <th className="p-3.5 font-semibold">Valor Total</th>
                <th className="p-3.5 font-semibold text-center">Status</th>
                <th className="p-3.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    Nenhuma ordem de compra localizada.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5">
                      <div className="font-mono font-bold text-cyan-400">{order.code}</div>
                      <div className="text-[10px] text-slate-500">
                        {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-white">{order.supplierName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{order.supplierCnpj}</div>
                    </td>
                    <td className="p-3.5 font-mono text-slate-400">
                      {order.requisitionCode ? (
                        <span className="text-slate-300">RC: {order.requisitionCode}</span>
                      ) : (
                        <span className="text-slate-500">Direta</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-300">
                      {new Date(order.emissionDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3.5 text-slate-300">
                      {new Date(order.expectedDeliveryDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-white">
                      {order.totalValue.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                    <td className="p-3.5 text-center">{getStatusBadge(order.status)}</td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition"
                          title="Ver Detalhes da OC"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(order)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 rounded-lg transition"
                          title="Baixar PDF Oficial"
                        >
                          <Download size={13} /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal / Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-extrabold text-cyan-400">
                    {selectedOrder.code}
                  </span>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  Fornecedor: {selectedOrder.supplierName}
                </h3>
                <p className="text-xs text-slate-400">
                  Comprador: {selectedOrder.buyerName} • Emitida em{' '}
                  {new Date(selectedOrder.emissionDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Valor Total</span>
                <p className="text-sm font-mono font-bold text-white mt-1">
                  {selectedOrder.totalValue.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Previsão Entrega</span>
                <p className="text-sm font-mono font-medium text-slate-200 mt-1">
                  {new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Condição Pagamento</span>
                <p className="text-xs font-medium text-slate-200 mt-1">
                  {selectedOrder.paymentTerms}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Tipo Frete</span>
                <p className="text-xs font-medium text-slate-200 mt-1">
                  {selectedOrder.freightType}{' '}
                  {selectedOrder.freightValue > 0 && `(+R$ ${selectedOrder.freightValue})`}
                </p>
              </div>
            </div>

            {/* Transport details if present */}
            {selectedOrder.carrierName && (
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3 text-xs text-amber-200">
                <Truck size={18} className="text-amber-400 shrink-0" />
                <div>
                  <span className="font-semibold">Transportadora:</span> {selectedOrder.carrierName}
                  {selectedOrder.trackingCode && ` • Rastreio / Conhecimento: ${selectedOrder.trackingCode}`}
                </div>
              </div>
            )}

            {/* Items List */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-950 px-4 py-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                Itens da Ordem de Compra ({selectedOrder.items.length})
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 border-b border-slate-800">
                    <th className="p-2.5">Item</th>
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5 text-center">Qtd Pedida</th>
                    <th className="p-2.5 text-center">Qtd Recebida</th>
                    <th className="p-2.5 text-right">Preço Unit.</th>
                    <th className="p-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {selectedOrder.items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-800/30">
                      <td className="p-2.5 font-mono text-slate-500">#{it.itemNumber}</td>
                      <td className="p-2.5">
                        <div className="font-semibold text-white">{it.description}</div>
                        {it.specs && <div className="text-[10px] text-slate-400">{it.specs}</div>}
                        {it.heatNumber && (
                          <span className="inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                            Corrida: {it.heatNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        {it.quantityOrdered} {it.unit}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        <span
                          className={
                            it.quantityReceived >= it.quantityOrdered
                              ? 'text-emerald-400 font-bold'
                              : it.quantityReceived > 0
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }
                        >
                          {it.quantityReceived || 0} {it.unit}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-300">
                        {it.unitPrice.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-white">
                        {it.totalPrice.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Workflow Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                {selectedOrder.status === 'emitida' && (
                  <button
                    onClick={() => handleUpdateStatusDirect(selectedOrder.id, 'confirmada_fornecedor')}
                    disabled={updating}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Confirmar c/ Fornecedor
                  </button>
                )}

                {(selectedOrder.status === 'emitida' || selectedOrder.status === 'confirmada_fornecedor') && (
                  <button
                    onClick={() => setIsTransitModalOpen(true)}
                    disabled={updating}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Truck size={14} /> Registrar Despacho / Trânsito
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadPdf(selectedOrder)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow transition"
                >
                  <Download size={15} /> Baixar PDF Oficial da OC
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Trânsito */}
      {isTransitModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Truck className="text-amber-400" size={18} />
                Registrar Envio / Em Trânsito
              </h3>
              <button onClick={() => setIsTransitModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleMarkInTransit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome da Transportadora
                </label>
                <input
                  type="text"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  placeholder="Ex: Braspress, TNT Mercúrio, Frota Própria Fornecedor"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Código de Rastreio / Nº CTE
                </label>
                <input
                  type="text"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="Ex: CTE-928172 ou BR-829103"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTransitModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold shadow"
                >
                  {updating ? 'Gravando...' : 'Confirmar Trânsito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
