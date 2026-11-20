import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { LpuApproval, LpuItem } from '../types';
import {
  Plus,
  CheckCircle2,
  XCircle,
  FileCheck,
  AlertCircle,
  DollarSign,
  User,
  X,
} from 'lucide-react';

export const LpuApprovalsModule: React.FC = () => {
  const { user, organization, logAudit } = useAuth();
  const [approvals, setApprovals] = useState<LpuApproval[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<LpuApproval | null>(null);
  const [justification, setJustification] = useState('');
  const [actionType, setActionType] = useState<'aprovar' | 'rejeitar' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // New LPU modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [items, setItems] = useState<LpuItem[]>([
    { id: '1', description: 'Mão de Obra Especializada Torneiro', unit: 'HORA', quantity: 8, unitPrice: 120, totalPrice: 960 },
  ]);

  useEffect(() => {
    if (!organization) return;
    const q = query(collection(db, 'lpu_approvals'), where('orgId', '==', organization.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LpuApproval));
      setApprovals(list);
    });
    return () => unsub();
  }, [organization]);

  const handleDecision = async () => {
    if (!selectedApproval || !actionType || !organization || !user) return;
    if (!justification.trim()) {
      alert('A justificativa é obrigatória para aprovar ou rejeitar uma solicitação de LPU.');
      return;
    }

    setIsProcessing(true);
    try {
      const newStatus = actionType === 'aprovar' ? 'aprovado' : 'rejeitado';
      const docRef = doc(db, 'lpu_approvals', selectedApproval.id);

      await updateDoc(docRef, {
        status: newStatus,
        justification: justification.trim(),
        approvedBy: user.displayName || user.email || 'Aprovador',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await logAudit(
        'Aprovações LPU',
        `LPU ${newStatus.toUpperCase()}`,
        `Solicitação ${selectedApproval.title} foi ${newStatus}. Justificativa: ${justification.trim()}`,
        selectedApproval.id
      );

      setSelectedApproval(null);
      setActionType(null);
      setJustification('');
    } catch (err) {
      console.error('Erro ao registrar decisão LPU:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        description: '',
        unit: 'UN',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
      },
    ]);
  };

  const handleUpdateItem = (index: number, field: keyof LpuItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      const q = field === 'quantity' ? parseFloat(value) || 0 : item.quantity;
      const p = field === 'unitPrice' ? parseFloat(value) || 0 : item.unitPrice;
      item.totalPrice = q * p;
    }
    updated[index] = item;
    setItems(updated);
  };

  const handleCreateApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setIsProcessing(true);

    try {
      const total = items.reduce((sum, it) => sum + it.totalPrice, 0);
      const appRef = doc(collection(db, 'lpu_approvals'));
      const newDoc: LpuApproval = {
        id: appRef.id,
        orgId: organization.id,
        title: newTitle.trim(),
        orderNumber: newOrderNumber.trim() || undefined,
        requestedBy: user.displayName || user.email || 'Solicitante',
        items,
        totalValue: total,
        status: 'pendente',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(appRef, newDoc);
      await logAudit('Aprovações LPU', 'Criar Solicitação LPU', `Criada solicitação ${newTitle} - Total R$ ${total.toFixed(2)}`, appRef.id);

      setShowCreateModal(false);
      setNewTitle('');
      setNewOrderNumber('');
    } catch (err) {
      console.error('Erro ao criar solicitação LPU:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Aprovações de Custos (LPU)</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Validação de orçamentos e serviços baseados em Lista de Preços Unitários com justificativa obrigatória.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Solicitação de LPU</span>
        </button>
      </div>

      {/* Approvals Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Título / Ordem</th>
                <th className="py-3 px-4">Solicitante</th>
                <th className="py-3 px-4">Itens</th>
                <th className="py-3 px-4">Valor Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Decisão / Justificativa</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {approvals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Nenhuma solicitação de aprovação LPU registrada.
                  </td>
                </tr>
              ) : (
                approvals.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-slate-100">
                      <p>{app.title}</p>
                      {app.orderNumber && (
                        <span className="text-[10px] font-mono text-blue-400">Ref: {app.orderNumber}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{app.requestedBy}</td>
                    <td className="py-3 px-4 text-slate-400">{app.items?.length || 0} item(ns)</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      R$ {(app.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          app.status === 'aprovado'
                            ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                            : app.status === 'rejeitado'
                            ? 'bg-red-950/70 text-red-400 border border-red-800/50'
                            : 'bg-amber-950/70 text-amber-300 border border-amber-800/50'
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs text-[11px] text-slate-400">
                      {app.justification ? (
                        <p className="truncate" title={app.justification}>
                          "{app.justification}"
                        </p>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {app.status === 'pendente' ? (
                        <button
                          onClick={() => {
                            setSelectedApproval(app);
                            setActionType('aprovar');
                            setJustification('');
                          }}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
                        >
                          Avaliar
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Concluído</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evaluation Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Avaliação de Solicitação LPU</h3>
              <button onClick={() => setSelectedApproval(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <p className="text-slate-400">Solicitação:</p>
                <p className="font-bold text-white text-sm">{selectedApproval.title}</p>
                <p className="text-emerald-400 font-bold mt-1">
                  Valor Total: R$ {selectedApproval.totalValue.toFixed(2)}
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionType('aprovar')}
                  className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${
                    actionType === 'aprovar'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ✓ Aprovar LPU
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('rejeitar')}
                  className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${
                    actionType === 'rejeitar'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ✕ Rejeitar LPU
                </button>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Justificativa Obrigatória *
                </label>
                <textarea
                  rows={3}
                  required
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Informe o motivo da aprovação ou rejeição técnica do orçamento..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedApproval(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessing || !actionType}
                  onClick={handleDecision}
                  className={`px-5 py-2 rounded-lg text-white font-semibold text-xs shadow-md disabled:opacity-50 ${
                    actionType === 'aprovar' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {isProcessing ? 'Gravando...' : 'Confirmar Decisão'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Nova Solicitação de Aprovação LPU</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateApproval} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Título da Solicitação *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Fornecimento de Peças e Mão de Obra Usinagem"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Referência de OS (opcional)</label>
                  <input
                    type="text"
                    value={newOrderNumber}
                    onChange={(e) => setNewOrderNumber(e.target.value)}
                    placeholder="OS-2026-001"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-300">Itens da Lista de Preços Unitários</label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-blue-400 hover:text-blue-300 text-[11px] font-semibold cursor-pointer"
                  >
                    + Adicionar Item
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={it.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input
                          type="text"
                          required
                          value={it.description}
                          onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                          placeholder="Descrição do serviço/peça"
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px]"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          required
                          value={it.unit}
                          onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                          placeholder="UN / HORA"
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px] uppercase"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="1"
                          required
                          value={it.quantity}
                          onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                          placeholder="Qtd"
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px]"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={it.unitPrice}
                          onChange={(e) => handleUpdateItem(idx, 'unitPrice', e.target.value)}
                          placeholder="Preço Unit. (R$)"
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
                >
                  {isProcessing ? 'Salvando...' : 'Enviar para Aprovação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
