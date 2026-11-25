import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { apiFetch } from '../apiAuthFetch';
import { RecurringOrder, WorkOrderPriority, Unit, Asset, Team } from '../types';
import {
  Repeat,
  Plus,
  Play,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';

export const RecurringOrdersModule: React.FC = () => {
  const { user, organization, logAudit } = useAuth();
  const [recurringOrders, setRecurringOrders] = useState<RecurringOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WorkOrderPriority>('media');
  const [frequency, setFrequency] = useState<RecurringOrder['frequency']>('mensal');
  const [nextRunDate, setNextRunDate] = useState(new Date().toISOString().split('T')[0]);
  const [unitId, setUnitId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;

    const q = query(collection(db, 'recurring_orders'), where('orgId', '==', organization.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringOrder));
      setRecurringOrders(list);
    });

    getDocs(query(collection(db, 'units'), where('orgId', '==', organization.id))).then((s) =>
      setUnits(s.docs.map((d) => ({ id: d.id, ...d.data() } as Unit)))
    );
    getDocs(query(collection(db, 'assets'), where('orgId', '==', organization.id))).then((s) =>
      setAssets(s.docs.map((d) => ({ id: d.id, ...d.data() } as Asset)))
    );
    getDocs(query(collection(db, 'teams'), where('orgId', '==', organization.id))).then((s) =>
      setTeams(s.docs.map((d) => ({ id: d.id, ...d.data() } as Team)))
    );

    return () => unsub();
  }, [organization]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    if (!unitId || !units.some((unit) => unit.id === unitId)) {
      alert('Selecione uma unidade cadastrada para criar a recorrência.');
      return;
    }
    setIsSubmitting(true);

    try {
      const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newRec: RecurringOrder = {
        id: recId,
        orgId: organization.id,
        unitId,
        assetId: assetId || undefined,
        title: title.trim(),
        description: description.trim(),
        priority,
        frequency,
        nextRunDate,
        assignedTeam: assignedTeam || undefined,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'recurring_orders', recId), newRec);
      await logAudit('Recorrências', 'Criar Modelo Recorrente', `Modelo de OS periódica: ${title} (${frequency})`, recId);

      setShowCreateModal(false);
      setTitle('');
      setDescription('');
    } catch (err) {
      console.error('Erro ao salvar recorrência:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateWorkOrder = async (rec: RecurringOrder) => {
    if (!organization || !user) return;
    if (!rec.unitId || !units.some((unit) => unit.id === rec.unitId)) {
      setActionFeedback('Esta recorrência não possui uma unidade válida. Edite o cadastro e selecione uma unidade antes de gerar a OS.');
      return;
    }
    setIsSubmitting(true);
    setActionFeedback(null);

    try {
      const response = await apiFetch(`/api/recurring-orders/${encodeURIComponent(rec.id)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: organization.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error || 'Não foi possível gerar a OS recorrente.');
      }

      const orderNumber = String(result.workOrderNumber || '');
      const orderId = String(result.workOrderId || '');
      const nextDate = String(result.nextRunDate || '');
      try {
        await logAudit('Recorrências', 'Gerar OS Recorrente', `OS ${orderNumber} gerada de forma idempotente a partir de ${rec.title}`, orderId);
      } catch (auditError) {
        console.warn('A OS foi criada, mas a auditoria complementar falhou:', auditError);
      }

      setActionFeedback(
        result.replayed
          ? `Esta ocorrência já havia gerado a OS ${orderNumber} (proteção contra duplicidade).`
          : `Ordem de Serviço ${orderNumber} gerada com sucesso! Próxima execução avançada para ${nextDate}.`
      );
    } catch (err) {
      console.error('Erro ao gerar OS a partir da recorrência:', err);
      setActionFeedback(err instanceof Error ? err.message : 'Não foi possível gerar a OS.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Recorrências de Ordens de Serviço</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure regras de manutenções periódicas e preventivas com geração controlada de novas ordens.
          </p>
        </div>

        <button
          onClick={() => {
            setUnitId('');
            setAssetId(assets[0]?.id || '');
            setAssignedTeam(teams[0]?.name || '');
            setShowCreateModal(true);
          }}
          disabled={units.length === 0}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Regra de Recorrência</span>
        </button>
      </div>

      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid of Recurrences */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recurringOrders.length === 0 ? (
          <div className="col-span-full bg-[#121826] border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
            Nenhuma regra de manutenção recorrente cadastrada. Crie uma para automatizar suas rotinas preventivas.
          </div>
        ) : (
          recurringOrders.map((rec) => (
            <div
              key={rec.id}
              className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all"
            >
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 font-semibold uppercase text-[10px] border border-blue-800/40">
                    {rec.frequency}
                  </span>
                  <span className="text-slate-400 text-[11px] flex items-center space-x-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Próx: {rec.nextRunDate}</span>
                  </span>
                </div>
                <h3 className="font-bold text-white text-sm">{rec.title}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{rec.description}</p>
                {rec.assignedTeam && (
                  <p className="text-[11px] text-slate-500 mt-2">Equipe: {rec.assignedTeam}</p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleGenerateWorkOrder(rec)}
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Gerar OS a partir desta recorrência</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Create */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Criar Regra de Recorrência Preventiva</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Título do Plano Preventivo *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Troca de filtros e lubrificação compressores"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição do Procedimento *</label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instruções para o técnico ao gerar a OS..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Periodicidade *</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="diaria">Diária</option>
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Próxima Execução *</label>
                  <input
                    type="date"
                    required
                    value={nextRunDate}
                    onChange={(e) => setNextRunDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Unidade</label>
                  <select
                    required
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="" disabled>Selecione a unidade</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Equipe Responsável</label>
                  <select
                    value={assignedTeam}
                    onChange={(e) => setAssignedTeam(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Não atribuído</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
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
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
