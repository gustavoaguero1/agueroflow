import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Activity, Play, Wrench } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../apiAuthFetch';
import type { Asset } from '../../types';
import type { CmmsMaintenanceRecord, CmmsPreventivePlan } from '../../types/cmms';
import { computeAssetReliabilityKpis } from '../../services/cmmsRules';

export const CmmsReliabilityPanel: React.FC = () => {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [assets, setAssets] = useState<Asset[]>([]);
  const [plans, setPlans] = useState<CmmsPreventivePlan[]>([]);
  const [records, setRecords] = useState<CmmsMaintenanceRecord[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    if (!orgId) return;
    const [aSnap, pSnap, rSnap] = await Promise.all([
      getDocs(query(collection(db, 'assets'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'cmms_plans'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'cmms_records'), where('orgId', '==', orgId))).catch(() => null),
    ]);
    setAssets(aSnap ? aSnap.docs.map((d) => ({ ...(d.data() as Asset), id: d.id })) : []);
    setPlans(pSnap ? pSnap.docs.map((d) => ({ ...(d.data() as CmmsPreventivePlan), id: d.id })) : []);
    setRecords(rSnap ? rSnap.docs.map((d) => ({ ...(d.data() as CmmsMaintenanceRecord), id: d.id })) : []);
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const handleTriggerPlan = async (planId: string) => {
    setFeedback(null);
    const res = await apiFetch(`/api/cmms/plans/${encodeURIComponent(planId)}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error || 'Não foi possível disparar preventiva CMMS.');
      return;
    }
    setFeedback(
      data.replayed
        ? `Preventiva já havia gerado a OS ${data.workOrderNumber} (idempotente).`
        : `OS preventiva ${data.workOrderNumber} gerada com sucesso pelo plano CMMS.`,
    );
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wrench className="w-5 h-5 text-cyan-500" />
          <span>CMMS &amp; Confiabilidade de Ativos</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Evolução do cadastro mestre de ativos com planos preventivos idempotentes (calendário/horímetro), histórico de falhas e indicadores reais de MTBF/MTTR.
        </p>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs text-cyan-800 dark:text-cyan-200">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white">Planos Preventivos CMMS ({plans.length})</h3>
          {plans.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Nenhum plano preventivo cadastrado em <code>cmms_plans</code>.</p>
          ) : (
            plans.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.assetTag} — {p.title}</p>
                  <p className="text-[11px] text-slate-500">Gatilho: {p.triggerType} · Próx.: {p.nextDueDate || (p.nextDueHourmeter !== undefined ? `${p.nextDueHourmeter}h` : '—')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTriggerPlan(p.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 text-white font-semibold hover:bg-cyan-700"
                >
                  <Play className="w-3.5 h-3.5" /> Gerar OS
                </button>
              </div>
            ))
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-500" />
            <span>Confiabilidade por Ativo (MTBF / MTTR / Disponibilidade)</span>
          </h3>
          {assets.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Nenhum ativo cadastrado em <code>assets</code>.</p>
          ) : (
            assets.slice(0, 12).map((a) => {
              const kpi = computeAssetReliabilityKpis({ assetId: a.id, records, operatingWindowHours: 720 });
              return (
                <div key={a.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="font-mono font-bold">{a.tag} — {a.name}</span>
                    <span className="uppercase text-[10px] font-bold">{a.status}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    MTBF: <strong>{kpi.mtbfHours !== null ? `${kpi.mtbfHours}h` : 'Dados insuficientes'}</strong> · MTTR: <strong>{kpi.mttrHours !== null ? `${kpi.mttrHours}h` : '—'}</strong> · Disp.: <strong>{kpi.availabilityPct !== null ? `${kpi.availabilityPct}%` : '—'}</strong>
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
