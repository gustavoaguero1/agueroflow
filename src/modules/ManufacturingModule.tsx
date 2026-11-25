import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Factory, PackageCheck, Plus } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../apiAuthFetch';
import type { Project } from '../types/project';
import type { FabricationOrder } from '../types/manufacturing';
import { computeFabricationMetrics } from '../services/manufacturingRules';

export const ManufacturingModule: React.FC = () => {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [projects, setProjects] = useState<Project[]>([]);
  const [orders, setOrders] = useState<FabricationOrder[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [plannedQty, setPlannedQty] = useState('1');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    if (!orgId) return;
    const [pSnap, oSnap] = await Promise.all([
      getDocs(query(collection(db, 'projects'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'fabrication_orders'), where('orgId', '==', orgId))).catch(() => null),
    ]);
    const projs = pSnap ? pSnap.docs.map((d) => ({ ...(d.data() as Project), id: d.id })) : [];
    setProjects(projs);
    if (!projectId && projs.length > 0) setProjectId(projs[0].id);
    setOrders(oSnap ? oSnap.docs.map((d) => ({ ...(d.data() as FabricationOrder), id: d.id })) : []);
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/manufacturing/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        spoolOrPartTag: tag,
        description,
        plannedQuantity: Number(plannedQty) || 1,
        unitOfMeasure: 'UN',
        routing: [
          { stage: 'corte', description: 'Corte e Preparação', plannedHours: 2 },
          { stage: 'montagem', description: 'Montagem de Subconjunto', plannedHours: 4 },
          { stage: 'solda', description: 'Soldagem em Oficina', plannedHours: 4 },
          { stage: 'inspecao', description: 'Inspeção Dimensional e END', plannedHours: 1, isHoldPoint: true },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error || 'Não foi possível criar Ordem de Fabricação.');
      return;
    }
    setTag('');
    setDescription('');
    setFeedback(`Ordem de Fabricação ${data.order.code} criada com sucesso.`);
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Factory className="w-5 h-5 text-indigo-500" />
          <span>Produção &amp; Fabricação (Oficina)</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Ordens de fabricação vinculadas a Projeto/Obra, roteiro por operação, rastreabilidade de corridas, pontos de inspeção e expedição.
        </p>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-200">
          {feedback}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs items-end">
        <div>
          <label className="block font-semibold mb-1">Projeto / Obra</label>
          <select required value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700">
            <option value="">Selecione...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">Tag Spool / Peça</label>
          <input required value={tag} onChange={(e) => setTag(e.target.value)} placeholder="SP-316L-01" className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-semibold mb-1">Descrição</label>
          <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Spool sanitário 3'' com derivações" className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
        </div>
        <div className="flex gap-2">
          <input type="number" min="1" value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} className="w-20 px-2 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
          <button type="submit" className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Criar OF
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orders.length === 0 ? (
          <div className="md:col-span-2 py-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            Nenhuma Ordem de Fabricação cadastrada.
          </div>
        ) : (
          orders.map((of) => {
            const m = computeFabricationMetrics(of);
            return (
              <div key={of.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{of.code} · {of.spoolOrPartTag}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 uppercase text-[10px] font-bold">{of.status}</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{of.description}</p>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Avanço roteiro: <strong>{m.progressPct}%</strong></span>
                  <span>HH: {m.totalActualHours}/{m.totalPlannedHours}h · Sucata: {m.totalScrapQty}</span>
                </div>
                {of.packingVolumeCode && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <PackageCheck className="w-3.5 h-3.5" /> Volume expedido: {of.packingVolumeCode}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
