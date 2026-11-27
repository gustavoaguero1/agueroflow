import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Gauge, RefreshCw } from 'lucide-react';
import { db } from '../../firebase';
import type { WorkerTimeLog } from '../../types';
import type { Project } from '../../types/project';
import type { WeldJoint } from '../../types/industrialQuality';
import type { FabricationOrder } from '../../types/manufacturing';
import { computeAssemblyProductivity } from '../../services/productivityAndPurchasingRules';

interface AssemblyProductivityViewProps {
  orgId: string;
}

export const AssemblyProductivityView: React.FC<AssemblyProductivityViewProps> = ({ orgId }) => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [timeLogs, setTimeLogs] = useState<WorkerTimeLog[]>([]);
  const [joints, setJoints] = useState<WeldJoint[]>([]);
  const [fabOrders, setFabOrders] = useState<FabricationOrder[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('todos');
  const [targetHhPerJoint, setTargetHhPerJoint] = useState('2.5');
  const [targetHhPerUnit, setTargetHhPerUnit] = useState('4.0');

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const safe = async <T,>(coll: string): Promise<T[]> => {
        try {
          const snap = await getDocs(query(collection(db, coll), where('orgId', '==', orgId)));
          return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
        } catch {
          return [];
        }
      };
      const [projs, logs, wJoints, fabs] = await Promise.all([
        safe<Project>('projects'),
        safe<WorkerTimeLog>('worker_time_logs'),
        safe<WeldJoint>('weld_joints'),
        safe<FabricationOrder>('fabrication_orders'),
      ]);
      setProjects(projs);
      setTimeLogs(logs);
      setJoints(wJoints);
      setFabOrders(fabs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const rows = useMemo(() => {
    const scopeProjects =
      selectedProjectId === 'todos' ? projects : projects.filter((p) => p.id === selectedProjectId);
    const hhJointMeta = Math.max(0.1, Number(targetHhPerJoint) || 2.5);
    const hhUnitMeta = Math.max(0.1, Number(targetHhPerUnit) || 4.0);

    return scopeProjects.map((project) => {
      const projLogs = timeLogs.filter(
        (l) => (l as unknown as { projectId?: string }).projectId === project.id || l.contractId === project.contractId,
      );
      const totalHours = projLogs.reduce(
        (s, l) =>
          s +
          (Number(l.normalHours) || 0) +
          (Number(l.overtime50Hours) || 0) +
          (Number(l.overtime100Hours) || 0),
        0,
      );

      const projJoints = joints.filter((j) => j.projectId === project.id);
      const approvedJoints = projJoints.filter((j) => j.status === 'aprovada').length;
      const weldMetric = computeAssemblyProductivity({
        benchmark: {
          discipline: 'Soldagem Industrial',
          unit: 'junta',
          plannedHhPerUnit: hhJointMeta,
          sourceLabel: 'Meta operacional configurada',
          revision: 'v1',
        },
        plannedQuantity: projJoints.length,
        actualQuantity: approvedJoints,
        actualHours: totalHours,
      });

      const projFabs = fabOrders.filter((f) => f.projectId === project.id);
      const plannedFabQty = projFabs.reduce((s, f) => s + (Number(f.plannedQuantity) || 0), 0);
      const fabActualHours = projFabs.reduce(
        (s, f) => s + (f.routing || []).reduce((rs, st) => rs + (Number(st.actualHours) || 0), 0),
        0,
      );
      const fabGoodQty = projFabs.reduce((s, f) => {
        const last = (f.routing || []).find((st) => st.status === 'concluida');
        return s + (Number(last?.goodQty) || 0);
      }, 0);

      const fabMetric = computeAssemblyProductivity({
        benchmark: {
          discipline: 'Fabricação / Oficina',
          unit: 'kg',
          plannedHhPerUnit: hhUnitMeta,
          sourceLabel: 'Roteiro de oficina',
          revision: 'v1',
        },
        plannedQuantity: plannedFabQty,
        actualQuantity: fabGoodQty,
        actualHours: fabActualHours,
      });

      return { project, weldMetric, fabMetric };
    });
  }, [projects, timeLogs, joints, fabOrders, selectedProjectId, targetHhPerJoint, targetHhPerUnit]);

  return (
    <div className="space-y-4 text-xs">
      <div className="af-card rounded-2xl p-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center gap-2">
            <Gauge className="w-4 h-4 text-[#0071E3] dark:text-[#409CFF]" />
            <span>Produtividade Real de Montagem &amp; Oficina (HH / unidade)</span>
          </h3>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
            Cruza apontamentos reais de HH com juntas aprovadas no Passaporte de Solda e peças produzidas em Fabricação.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] text-[#6E6E73] dark:text-[#98989D] mb-1">Obra</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10]"
            >
              <option value="todos">Todas as obras</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-[#6E6E73] dark:text-[#98989D] mb-1">Meta HH/junta</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={targetHhPerJoint}
              onChange={(e) => setTargetHhPerJoint(e.target.value)}
              className="w-20 px-2.5 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[10px] text-[#6E6E73] dark:text-[#98989D] mb-1">Meta HH/peça</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={targetHhPerUnit}
              onChange={(e) => setTargetHhPerUnit(e.target.value)}
              className="w-20 px-2.5 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] font-mono tabular-nums"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="af-btn-glass px-3 py-1.5 rounded-xl font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <div className="af-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F5F5F7] dark:bg-[#1C1F26] text-[10px] uppercase tracking-wider text-[#6E6E73] dark:text-[#98989D] border-b border-black/[0.08] dark:border-white/[0.08]">
              <tr>
                <th className="py-3 px-4">Obra</th>
                <th className="py-3 px-3 text-right">Juntas Aprov.</th>
                <th className="py-3 px-3 text-right">HH/junta Real</th>
                <th className="py-3 px-3 text-right">Eficiência Solda</th>
                <th className="py-3 px-3 text-right">Peças Oficina</th>
                <th className="py-3 px-3 text-right">HH/peça Real</th>
                <th className="py-3 px-4 text-right">Eficiência Oficina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#6E6E73] dark:text-[#98989D]">
                    Calculando índices reais de produtividade...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#86868B]">
                    Nenhuma obra cadastrada para cálculo de produtividade.
                  </td>
                </tr>
              ) : (
                rows.map(({ project, weldMetric, fabMetric }) => (
                  <tr key={project.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#0071E3] dark:text-[#409CFF]">{project.code}</div>
                      <div className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">{project.name}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {weldMetric.actualQuantity} / {weldMetric.plannedQuantity}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {weldMetric.actualHhPerUnit !== null ? `${weldMetric.actualHhPerUnit.toFixed(2)}h` : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                      {weldMetric.efficiencyIndex !== null ? (
                        <span
                          className={
                            weldMetric.status === 'acima_meta'
                              ? 'text-[#1E7E34] dark:text-[#30D158]'
                              : weldMetric.status === 'na_meta'
                              ? 'text-[#0071E3] dark:text-[#409CFF]'
                              : 'text-[#D70015] dark:text-[#FF453A]'
                          }
                        >
                          {(weldMetric.efficiencyIndex * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[#86868B] font-normal">Sem base</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {fabMetric.actualQuantity} / {fabMetric.plannedQuantity}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {fabMetric.actualHhPerUnit !== null ? `${fabMetric.actualHhPerUnit.toFixed(2)}h` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {fabMetric.efficiencyIndex !== null ? (
                        <span
                          className={
                            fabMetric.status === 'acima_meta'
                              ? 'text-[#1E7E34] dark:text-[#30D158]'
                              : fabMetric.status === 'na_meta'
                              ? 'text-[#0071E3] dark:text-[#409CFF]'
                              : 'text-[#D70015] dark:text-[#FF453A]'
                          }
                        >
                          {(fabMetric.efficiencyIndex * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[#86868B] font-normal">Sem base</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
