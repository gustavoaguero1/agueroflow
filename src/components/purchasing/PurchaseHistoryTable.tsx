import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  Building2,
  DollarSign,
  Truck,
  CheckCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Layers,
  Database,
  X,
  ChevronDown
} from 'lucide-react';
import { PurchaseOrder, PurchaseOrderStatus, PurchasingSupplier } from '../../types/purchasing';
import { exportPurchaseOrderPdf } from '../../services/purchasingService';

interface PurchaseHistoryTableProps {
  orders: PurchaseOrder[];
  suppliers: PurchasingSupplier[];
  currentOrgId: string;
  onRefresh: () => void;
}

export const PurchaseHistoryTable: React.FC<PurchaseHistoryTableProps> = ({
  orders,
  suppliers,
  currentOrgId,
  onRefresh,
}) => {
  // Filter States
  const [supplierFilter, setSupplierFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<'date' | 'value' | 'code'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filtered and Sorted Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Supplier filter
      if (supplierFilter !== 'todos' && order.supplierId !== supplierFilter) {
        return false;
      }

      // 2. Status filter
      if (statusFilter !== 'todos' && order.status !== statusFilter) {
        return false;
      }

      // 3. Date range filter
      if (startDate) {
        const orderDate = order.emissionDate.split('T')[0];
        if (orderDate < startDate) return false;
      }
      if (endDate) {
        const orderDate = order.emissionDate.split('T')[0];
        if (orderDate > endDate) return false;
      }

      // 4. Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesCode = order.code.toLowerCase().includes(term);
        const matchesSupplier = order.supplierName.toLowerCase().includes(term);
        const matchesCnpj = order.supplierCnpj?.toLowerCase().includes(term);
        const matchesReq = order.requisitionCode?.toLowerCase().includes(term);
        const matchesItems = order.items.some((it) =>
          it.description.toLowerCase().includes(term)
        );
        if (!matchesCode && !matchesSupplier && !matchesCnpj && !matchesReq && !matchesItems) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = new Date(a.emissionDate).getTime();
        const timeB = new Date(b.emissionDate).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortBy === 'value') {
        return sortOrder === 'asc' ? a.totalValue - b.totalValue : b.totalValue - a.totalValue;
      }
      if (sortBy === 'code') {
        return sortOrder === 'asc'
          ? a.code.localeCompare(b.code)
          : b.code.localeCompare(a.code);
      }
      return 0;
    });
  }, [orders, supplierFilter, statusFilter, startDate, endDate, searchTerm, sortBy, sortOrder]);

  // Aggregate Metrics on filtered dataset
  const totalSpend = useMemo(() => {
    return filteredOrders.reduce((acc, o) => acc + (o.status !== 'cancelada' ? o.totalValue : 0), 0);
  }, [filteredOrders]);

  const totalItemsCount = useMemo(() => {
    return filteredOrders.reduce(
      (acc, o) => acc + o.items.reduce((sum, it) => sum + it.quantityOrdered, 0),
      0
    );
  }, [filteredOrders]);

  const handleClearFilters = () => {
    setSupplierFilter('todos');
    setStatusFilter('todos');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'emitida':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center gap-1">
            <Clock size={12} /> Emitida
          </span>
        );
      case 'confirmada_fornecedor':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center gap-1">
            <CheckCircle size={12} /> Confirmada
          </span>
        );
      case 'em_transito':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
            <Truck size={12} /> Em Trânsito
          </span>
        );
      case 'recebida_parcial':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center gap-1">
            <Clock size={12} /> Parcial
          </span>
        );
      case 'recebida_total':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
            <CheckCircle size={12} /> Recebida Total
          </span>
        );
      case 'cancelada':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center gap-1">
            <AlertTriangle size={12} /> Cancelada
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header and Controls */}
      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="text-cyan-400" size={20} />
              Histórico Geral de Compras & Ordens (Schema NoSQL)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Consulta analítica de pedidos de compra, filtros combinados por fornecedor, período e status com persistência em tempo real no Firestore.
            </p>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            {(supplierFilter !== 'todos' ||
              statusFilter !== 'todos' ||
              startDate ||
              endDate ||
              searchTerm) && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition cursor-pointer"
              >
                <RotateCcw size={13} /> Limpar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Search Term */}
          <div className="lg:col-span-1">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Buscar Termo / Código
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="OC, RC, fornecedor..."
                className="w-full pl-8 pr-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          {/* Supplier Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Fornecedor Homologado
            </label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
            >
              <option value="todos">Todos os Fornecedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Status da Ordem
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
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

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
            />
          </div>
        </div>

        {/* Aggregated Quick Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Ordens Filtradas
            </span>
            <span className="text-base font-bold text-white mt-0.5 block">
              {filteredOrders.length}{' '}
              <span className="text-xs text-slate-400 font-normal">de {orders.length}</span>
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Total Homologado
            </span>
            <span className="text-base font-mono font-bold text-cyan-400 mt-0.5 block">
              {totalSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Volume de Peças / Tubos
            </span>
            <span className="text-base font-mono font-medium text-slate-200 mt-0.5 block">
              {totalItemsCount.toLocaleString('pt-BR')} un/m
            </span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Fornecedores Ativos
            </span>
            <span className="text-base font-bold text-emerald-400 mt-0.5 block">
              {new Set(filteredOrders.map((o) => o.supplierId)).size} empresas
            </span>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 text-slate-300 border-b border-slate-800">
                <th className="p-3.5 font-semibold cursor-pointer" onClick={() => { setSortBy('code'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  Código OC {sortBy === 'code' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3.5 font-semibold">Fornecedor / CNPJ</th>
                <th className="p-3.5 font-semibold cursor-pointer" onClick={() => { setSortBy('date'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  Emissão {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3.5 font-semibold">Previsão Entrega</th>
                <th className="p-3.5 font-semibold cursor-pointer text-right" onClick={() => { setSortBy('value'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  Valor Total {sortBy === 'value' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3.5 font-semibold">Frete & Condição</th>
                <th className="p-3.5 font-semibold text-center">Status</th>
                <th className="p-3.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    Nenhuma ordem de compra encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5">
                      <div className="font-mono font-bold text-cyan-400">{order.code}</div>
                      {order.requisitionCode && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          RC: {order.requisitionCode}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5">
                      <div className="font-semibold text-white">{order.supplierName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{order.supplierCnpj}</div>
                    </td>

                    <td className="p-3.5 text-slate-300">
                      {new Date(order.emissionDate).toLocaleDateString('pt-BR')}
                    </td>

                    <td className="p-3.5 text-slate-300">
                      {new Date(order.expectedDeliveryDate).toLocaleDateString('pt-BR')}
                    </td>

                    <td className="p-3.5 text-right font-mono font-bold text-white">
                      {order.totalValue.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>

                    <td className="p-3.5">
                      <span className="font-medium text-slate-300 block">
                        {order.freightType} {order.freightValue > 0 && `(+R$ ${order.freightValue})`}
                      </span>
                      <span className="text-[10px] text-slate-400 block">{order.paymentTerms}</span>
                    </td>

                    <td className="p-3.5 text-center">{getStatusBadge(order.status)}</td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition cursor-pointer"
                          title="Visualizar Itens & Rastreio"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => exportPurchaseOrderPdf(order)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 rounded-lg transition cursor-pointer"
                          title="Exportar Espelho PDF Formal"
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

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-extrabold text-cyan-400">
                    {selectedOrder.code}
                  </span>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <h4 className="text-sm font-bold text-white mt-1">
                  {selectedOrder.supplierName} • CNPJ: {selectedOrder.supplierCnpj}
                </h4>
                <p className="text-xs text-slate-400">
                  Comprador: {selectedOrder.buyerName} • Emitida em{' '}
                  {new Date(selectedOrder.emissionDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Valor Total</span>
                <p className="font-mono font-bold text-white mt-0.5">
                  {selectedOrder.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Previsão Entrega</span>
                <p className="font-mono text-slate-200 mt-0.5">
                  {new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Condição Pagamento</span>
                <p className="text-slate-200 mt-0.5">{selectedOrder.paymentTerms}</p>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase">Frete</span>
                <p className="text-slate-200 mt-0.5">{selectedOrder.freightType}</p>
              </div>
            </div>

            {/* Items */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-950 px-4 py-2 text-xs font-bold text-slate-300">
                Itens da Ordem de Compra ({selectedOrder.items.length})
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                    <th className="p-2.5">Item</th>
                    <th className="p-2.5">Descrição Técnica</th>
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
                          <span className="inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                            Corrida: {it.heatNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        {it.quantityOrdered} {it.unit}
                      </td>
                      <td className="p-2.5 text-center font-mono text-emerald-400">
                        {it.quantityReceived || 0} {it.unit}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-300">
                        {it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-white">
                        {it.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => exportPurchaseOrderPdf(selectedOrder)}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
              >
                <Download size={14} /> Baixar PDF Oficial da OC
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
