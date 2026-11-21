import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { applyStockMovement } from '../services/stockService';
import { savePurchaseRequisition, getPurchaseRequisitions } from '../services/purchasingService';
import {
  StockBalance,
  StockMovement,
  StockMovementType,
  Item,
  Unit,
  WorkOrder,
} from '../types';
import {
  Boxes,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Filter,
  X,
  Search,
} from 'lucide-react';

export const StockModule: React.FC = () => {
  const { user, organization, logAudit } = useAuth();
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  const [selectedUnitId, setSelectedUnitId] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Movement Modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movItemId, setMovItemId] = useState('');
  const [movUnitId, setMovUnitId] = useState('');
  const [movType, setMovType] = useState<StockMovementType>('entrada');
  const [movQuantity, setMovQuantity] = useState('1');
  const [movReason, setMovReason] = useState('');
  const [movOrderId, setMovOrderId] = useState('');
  const [movToUnitId, setMovToUnitId] = useState('');
  const [rcBusy, setRcBusy] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!organization) return;

    const qBalances = query(collection(db, 'stock_balances'), where('orgId', '==', organization.id));
    const unsubBalances = onSnapshot(qBalances, (snap) => {
      setBalances(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockBalance)));
    });

    const qMovements = query(collection(db, 'stock_movements'), where('orgId', '==', organization.id));
    const unsubMovements = onSnapshot(qMovements, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockMovement));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMovements(list);
    });

    getDocs(query(collection(db, 'items'), where('orgId', '==', organization.id))).then((s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() } as Item)).filter((i) => i.type === 'peca'))
    );
    getDocs(query(collection(db, 'units'), where('orgId', '==', organization.id))).then((s) =>
      setUnits(s.docs.map((d) => ({ id: d.id, ...d.data() } as Unit)))
    );
    getDocs(query(collection(db, 'work_orders'), where('orgId', '==', organization.id))).then((s) =>
      setWorkOrders(s.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)))
    );

    return () => {
      unsubBalances();
      unsubMovements();
    };
  }, [organization]);

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setMovError(null);

    const qty = parseFloat(movQuantity);
    if (isNaN(qty) || qty <= 0) {
      setMovError('A quantidade da movimentação deve ser maior que zero.');
      return;
    }

    const item = items.find((i) => i.id === movItemId);
    if (!item) {
      setMovError('Selecione uma peça válida do catálogo.');
      return;
    }

    const unit = units.find((u) => u.id === movUnitId) || units[0];
    const unitIdTarget = unit?.id || 'default_unit';

    if (movType === 'ajuste' && movReason.trim().length < 5) {
      setMovError('Ajuste de inventário exige justificativa (mínimo 5 caracteres).');
      return;
    }
    if (movType === 'transferencia' && (!movToUnitId || movToUnitId === unitIdTarget)) {
      setMovError('Selecione uma unidade de destino diferente da origem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedWO = workOrders.find((w) => w.id === movOrderId);
      const { balanceAfter, movementIds } = await applyStockMovement(db, {
        orgId: organization.id,
        unitId: unitIdTarget,
        item: { id: item.id, sku: item.sku, name: item.name, unitOfMeasure: item.unitOfMeasure },
        type: movType,
        quantity: qty,
        toUnitId: movType === 'transferencia' ? movToUnitId : undefined,
        reason: movReason.trim() || 'Movimentação operacional',
        orderId: movOrderId || undefined,
        orderNumber: selectedWO?.orderNumber || undefined,
        user: { uid: user.uid, name: user.displayName || user.email || 'Almoxarife' },
      });
      await logAudit(
        'Estoque',
        `Movimentação de ${movType.toUpperCase()}`,
        `${qty} ${item.unitOfMeasure} de ${item.name} (${item.sku}) em ${unit?.name || 'Unidade'}. Saldo pós: ${balanceAfter}`,
        movementIds[0]
      );

      setShowMoveModal(false);
      setMovQuantity('1');
      setMovReason('');
      setMovToUnitId('');
    } catch (err: any) {
      console.error('Erro ao registrar movimentação de estoque:', err);
      setMovError(err?.message || 'Falha ao registrar movimentação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateRC = async (item: Item, balance: number, unitName: string) => {
    if (!organization || !user) return;
    const min = item.minStock ?? 0;
    const suggested = Math.max(min * 2 - balance, 1); // no minStock set: falls back to 1
    const now = new Date().toISOString();
    if (rcBusy) return;
    setRcBusy(true);
    try {
      const open = (await getPurchaseRequisitions(organization.id)).some(
        (r) => (r.status === 'pendente' || r.status === 'em_cotacao') && r.items.some((i) => i.id === item.id)
      );
      if (open) {
        alert(`Já existe uma requisição de compra em aberto para ${item.name}.`);
        return;
      }
      await savePurchaseRequisition({
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        organizationId: organization.id,
        code: `RC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
        title: `Reposição de estoque: ${item.name}`,
        requestedBy: user.uid,
        requestedByName: user.displayName || user.email || 'Almoxarife',
        department: 'Estoque & Manutenção',
        urgency: item.criticalStock !== undefined && balance <= item.criticalStock ? 'alta' : 'normal',
        neededByDate: now.slice(0, 10),
        items: [{ id: item.id, code: item.sku, description: item.name, unit: item.unitOfMeasure, quantity: suggested, currentStock: balance, notes: unitName }],
        status: 'pendente',
        notes: 'Reposição automática: estoque abaixo do mínimo',
        createdAt: now,
        updatedAt: now,
      });
      alert(`Requisição de compra gerada (${suggested} ${item.unitOfMeasure} de ${item.name}).`);
    } catch (err: any) {
      alert(err?.message || 'Falha ao gerar requisição de compra.');
    } finally {
      setRcBusy(false);
    }
  };

  // Filter balances
  const filteredBalances = balances.filter((b) => {
    if (selectedUnitId !== 'todas' && b.unitId !== selectedUnitId) return false;
    const item = items.find((i) => i.id === b.itemId);
    if (!item) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Controle de Estoque & Saldos</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Saldos em tempo real por localidade com validação de saldo e bloqueio de saídas a descoberto.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas as Unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setMovItemId(items[0]?.id || '');
              setMovUnitId(units[0]?.id || '');
              setMovType('entrada');
              setMovToUnitId('');
              setMovError(null);
              setShowMoveModal(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Movimentação</span>
          </button>
        </div>
      </div>

      {/* Balances Grid Table */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código ou descrição da peça em estoque..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#121826] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                  <th className="py-3 px-4">Código / SKU</th>
                  <th className="py-3 px-4">Peça / Material</th>
                  <th className="py-3 px-4">Unidade / Local</th>
                  <th className="py-3 px-4">Saldo Atual</th>
                  <th className="py-3 px-4">Níveis Mín / Crítico</th>
                  <th className="py-3 px-4">Status de Alerta</th>
                  <th className="py-3 px-4 text-right">Ação Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Nenhum registro de saldo encontrado. Utilize a "Carga de Demonstração" ou faça uma Entrada inicial.
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((bal) => {
                    const item = items.find((i) => i.id === bal.itemId);
                    const unit = units.find((u) => u.id === bal.unitId);
                    if (!item) return null;

                    const isCritical = item.criticalStock !== undefined && bal.currentBalance <= item.criticalStock;
                    const isWarning =
                      !isCritical && item.minStock !== undefined && bal.currentBalance <= item.minStock;

                    return (
                      <tr key={bal.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">{item.sku}</td>
                        <td className="py-3 px-4 font-semibold text-slate-100">{item.name}</td>
                        <td className="py-3 px-4 text-slate-300">{unit?.name || 'Local Central'}</td>
                        <td className="py-3 px-4 font-mono text-sm font-extrabold text-white">
                          {bal.currentBalance} <span className="text-[10px] text-slate-400 font-normal">{item.unitOfMeasure}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          Mín: {item.minStock ?? '—'} / Crít: {item.criticalStock ?? '—'}
                        </td>
                        <td className="py-3 px-4">
                          {isCritical ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-950/70 text-red-400 border border-red-800/50 flex items-center space-x-1 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span>Crítico</span>
                            </span>
                          ) : isWarning ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/70 text-amber-300 border border-amber-800/50 flex items-center space-x-1 w-fit">
                              <span>Atenção</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 flex items-center space-x-1 w-fit">
                              <span>Normal</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(isCritical || isWarning) && (
                            <button
                              disabled={rcBusy}
                              onClick={() => handleGenerateRC(item, bal.currentBalance, unit?.name || 'Local Central')}
                              className="mr-2 px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800/60 text-amber-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              Gerar RC
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setMovItemId(item.id);
                              setMovUnitId(bal.unitId);
                              setMovType('saida');
                              setMovError(null);
                              setShowMoveModal(true);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold cursor-pointer"
                          >
                            Dar Baixa
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Movements Audit Trail */}
      <div className="mt-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Histórico Recente de Movimentações
        </h3>
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                  <th className="py-2.5 px-4">Tipo</th>
                  <th className="py-2.5 px-4">Item / SKU</th>
                  <th className="py-2.5 px-4">Quantidade</th>
                  <th className="py-2.5 px-4">Saldo Após</th>
                  <th className="py-2.5 px-4">Motivo / Referência</th>
                  <th className="py-2.5 px-4">Responsável</th>
                  <th className="py-2.5 px-4">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-slate-500">
                      Nenhuma movimentação registrada.
                    </td>
                  </tr>
                ) : (
                  movements.slice(0, 15).map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            m.type === 'entrada'
                              ? 'bg-emerald-950/70 text-emerald-400'
                              : m.type === 'saida'
                              ? 'bg-red-950/70 text-red-400'
                              : 'bg-blue-950/70 text-blue-300'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-200">{m.itemName}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{m.itemSku}</p>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-white">{m.quantity}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">{m.balanceAfter}</td>
                      <td className="py-2.5 px-4 max-w-xs truncate text-[11px]">
                        {m.reason} {m.orderNumber && <span className="text-blue-400">({m.orderNumber})</span>}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{m.userName}</td>
                      <td className="py-2.5 px-4 text-slate-500">{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Movement Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Registrar Movimentação de Estoque</h3>
              <button onClick={() => setShowMoveModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {movError && (
              <div className="mt-3 p-3 rounded-lg bg-red-950/70 border border-red-800 text-red-300 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{movError}</span>
              </div>
            )}

            <form onSubmit={handleCreateMovement} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Peça / Material *</label>
                <select
                  required
                  value={movItemId}
                  onChange={(e) => setMovItemId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} - {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Tipo de Movimentação *</label>
                  <select
                    value={movType}
                    onChange={(e) => setMovType(e.target.value as StockMovementType)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="entrada">Entrada (Compra/Retorno)</option>
                    <option value="saida">Saída (Consumo em OS)</option>
                    <option value="transferencia">Transferência</option>
                    <option value="ajuste">Ajuste de Inventário</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Quantidade *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={movQuantity}
                    onChange={(e) => setMovQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Unidade / Localidade</label>
                <select
                  value={movUnitId}
                  onChange={(e) => setMovUnitId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {movType === 'transferencia' && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Unidade de Destino *</label>
                  <select
                    value={movToUnitId}
                    onChange={(e) => setMovToUnitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Selecione...</option>
                    {units.filter((u) => u.id !== movUnitId).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-300 mb-1">Vincular à Ordem de Serviço (opcional)</label>
                <select
                  value={movOrderId}
                  onChange={(e) => setMovOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Nenhuma OS vinculada</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.orderNumber} - {wo.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Motivo / Justificativa *</label>
                <textarea
                  rows={2}
                  required
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  placeholder="Ex: Troca preventiva de rolamento na caldeira..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowMoveModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Gravando...' : 'Confirmar Movimentação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
