import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Building2,
  Download,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { db } from '../../firebase';
import type { StockBalance, StockMovement, WorkOrder, WorkerTimeLog } from '../../types';
import type { ProjectCostFact } from '../../types/costLedger';
import type { FinancePayable } from '../../types/finance';
import type { MeasurementBulletin } from '../../types/measurement';
import type { Project } from '../../types/project';
import type { PurchaseOrder } from '../../types/purchasing';
import { computeProjectResultReport, deriveProjectCostLedger } from '../../services/projectCostLedger';
import { computeProjectEac, computeProjectSCurve } from '../../services/projectEacAndSCurve';

interface ProjectResultReportViewProps {
  orgId: string;
  orgSlug?: string;
}

const fmtBrl = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtCompactBrl = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
};

async function safeOrgDocs<T>(collName: string, field: 'orgId' | 'organizationId', orgId: string): Promise<T[]> {
  try {
    const snap = await getDocs(query(collection(db, collName), where(field, '==', orgId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  } catch {
    return [];
  }
}

export const ProjectResultReportView: React.FC<ProjectResultReportViewProps> = ({ orgId, orgSlug }) => {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [selectedCurveProjectId, setSelectedCurveProjectId] = useState<string>('');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [timeLogs, setTimeLogs] = useState<WorkerTimeLog[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [payables, setPayables] = useState<FinancePayable[]>([]);
  const [persistedFacts, setPersistedFacts] = useState<ProjectCostFact[]>([]);
  const [bulletins, setBulletins] = useState<MeasurementBulletin[]>([]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [projs, wos, logs, movs, bals, pos, pays, facts, bms] = await Promise.all([
        safeOrgDocs<Project>('projects', 'orgId', orgId),
        safeOrgDocs<WorkOrder>('work_orders', 'orgId', orgId),
        safeOrgDocs<WorkerTimeLog>('worker_time_logs', 'orgId', orgId),
        safeOrgDocs<StockMovement>('stock_movements', 'orgId', orgId),
        safeOrgDocs<StockBalance>('stock_balances', 'orgId', orgId),
        safeOrgDocs<PurchaseOrder>('purchasing_orders', 'organizationId', orgId),
        safeOrgDocs<FinancePayable>('finance_payables', 'orgId', orgId),
        safeOrgDocs<ProjectCostFact>('project_cost_facts', 'orgId', orgId),
        safeOrgDocs<MeasurementBulletin>('measurement_bulletins', 'orgId', orgId),
      ]);
      setProjects(projs);
      setWorkOrders(wos);
      setTimeLogs(logs);
      setStockMovements(movs);
      setStockBalances(bals);
      setPurchaseOrders(pos);
      setPayables(pays);
      setPersistedFacts(facts);
      setBulletins(bms);
      if (!selectedCurveProjectId && projs.length > 0) {
        setSelectedCurveProjectId(projs[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const ledgerInputs = useMemo(
    () => ({
      orgId,
      projects,
      workOrders,
      timeLogs,
      stockMovements,
      stockBalances,
      purchaseOrders,
      payables,
      persistedFacts,
    }),
    [orgId, projects, workOrders, timeLogs, stockMovements, stockBalances, purchaseOrders, payables, persistedFacts],
  );

  const report = useMemo(() => computeProjectResultReport(ledgerInputs), [ledgerInputs]);
  const derivedLedger = useMemo(() => deriveProjectCostLedger(ledgerInputs), [ledgerInputs]);

  const activeCurveProject = useMemo(
    () => projects.find((p) => p.id === selectedCurveProjectId) || projects[0] || null,
    [projects, selectedCurveProjectId],
  );

  const sCurvePoints = useMemo(() => {
    if (!activeCurveProject) return [];
    return computeProjectSCurve({
      project: activeCurveProject,
      realizedFacts: derivedLedger.facts,
      approvedBulletins: bulletins,
    });
  }, [activeCurveProject, derivedLedger.facts, bulletins]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return report.rows.filter((row) => {
      if (statusFilter !== 'todos' && row.status !== statusFilter) return false;
      if (!q) return true;
      return `${row.projectCode} ${row.projectName}`.toLowerCase().includes(q);
    });
  }, [report.rows, searchTerm, statusFilter]);

  const handleExportCsv = () => {
    if (filteredRows.length === 0) return;
    const headers = [
      'Codigo_Obra',
      'Nome_Obra',
      'Status',
      'Receita_Contratada',
      'Orcamento_Previsto',
      'Comprometido_OC',
      'Realizado_HH',
      'Realizado_Estoque',
      'Realizado_Compras',
      'Realizado_Despesas',
      'Realizado_Total',
      'Desvio_Orcamento',
      'Margem_Realizada',
      'Margem_Percentual',
      'Horas_Sem_Custo',
      'Saidas_Estoque_Sem_Custo',
    ];
    const csvRows = filteredRows.map((r) => [
      `"${r.projectCode}"`,
      `"${r.projectName.replace(/"/g, '""')}"`,
      `"${r.status}"`,
      r.contractedRevenue.toFixed(2),
      r.plannedDirectCost.toFixed(2),
      r.committedCost.toFixed(2),
      r.realizedLaborCost.toFixed(2),
      r.realizedMaterialCost.toFixed(2),
      r.realizedPurchasingCost.toFixed(2),
      r.realizedFieldExpenseCost.toFixed(2),
      r.realizedTotalCost.toFixed(2),
      r.budgetVariance.toFixed(2),
      r.grossMarginRealized.toFixed(2),
      r.grossMarginPercent !== null ? r.grossMarginPercent.toFixed(2) : '',
      r.unpricedLaborHours.toFixed(2),
      String(r.unpricedStockMovementsCount),
    ]);
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...csvRows.map((c) => c.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = `agueroflow_resultado_por_obra_${orgSlug || 'empresa'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Precision Tech S-Curve geometry
  const chartW = 820;
  const chartH = 220;
  const padL = 56;
  const padR = 24;
  const padT = 18;
  const padB = 32;
  const maxVal = Math.max(
    1,
    ...sCurvePoints.flatMap((pt) => [
      pt.plannedCumulative,
      pt.realizedCumulative,
      pt.approvedMeasurementCumulative,
    ]),
  );
  const xAt = (idx: number) =>
    sCurvePoints.length <= 1
      ? padL + (chartW - padL - padR) / 2
      : padL + (idx * (chartW - padL - padR)) / (sCurvePoints.length - 1);
  const yAt = (v: number) => chartH - padB - (v / (maxVal * 1.1)) * (chartH - padT - padB);
  const buildPath = (getter: (pt: (typeof sCurvePoints)[number]) => number) =>
    sCurvePoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(getter(pt)).toFixed(1)}`)
      .join(' ');
  const hoveredPoint = hoveredPointIdx !== null ? sCurvePoints[hoveredPointIdx] : null;

  return (
    <div className="space-y-5">
      {/* KPI Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="af-card rounded-2xl p-4">
          <span className="text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D]">Receita Contratada</span>
          <p className="text-lg font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-white mt-1">
            {fmtBrl(report.totals.contractedRevenue)}
          </p>
        </div>
        <div className="af-card rounded-2xl p-4">
          <span className="text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D]">Previsto (Baseline)</span>
          <p className="text-lg font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#409CFF] mt-1">
            {fmtBrl(report.totals.plannedDirectCost)}
          </p>
        </div>
        <div className="af-card rounded-2xl p-4">
          <span className="text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D]">Comprometido (OCs)</span>
          <p className="text-lg font-bold font-mono tabular-nums text-[#B25000] dark:text-[#FF9F0A] mt-1">
            {fmtBrl(report.totals.committedCost)}
          </p>
        </div>
        <div className="af-card rounded-2xl p-4">
          <span className="text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D]">Realizado Total</span>
          <p className="text-lg font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-white mt-1">
            {fmtBrl(report.totals.realizedTotalCost)}
          </p>
          <span className="text-[11px] text-[#86868B] tabular-nums">
            HH {fmtBrl(report.totals.realizedLaborCost)} · Mat {fmtBrl(report.totals.realizedMaterialCost)}
          </span>
        </div>
        <div className="af-card rounded-2xl p-4">
          <span className="text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D]">Margem Realizada</span>
          <p
            className={`text-lg font-bold font-mono tabular-nums mt-1 flex items-center gap-1.5 ${
              report.totals.grossMarginRealized >= 0
                ? 'text-[#1E7E34] dark:text-[#30D158]'
                : 'text-[#D70015] dark:text-[#FF453A]'
            }`}
          >
            {report.totals.grossMarginRealized >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{fmtBrl(report.totals.grossMarginRealized)}</span>
          </p>
          <span className="text-[11px] text-[#86868B] tabular-nums">
            {report.totals.grossMarginPercent !== null ? `${report.totals.grossMarginPercent.toFixed(1)}% s/ receita` : 'Sem receita baseline'}
          </span>
        </div>
      </div>

      {/* Precision Tech Interactive S-Curve Panel */}
      {activeCurveProject && sCurvePoints.length > 0 && (
        <div className="af-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
                Curva S Financeira — {activeCurveProject.code}
              </h3>
              <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
                Separação real entre previsto (baseline), realizado no livro de custos e receita aprovada em medição (BM).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-3 text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full bg-slate-400" />
                  Previsto
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3]" />
                  Realizado
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  Medido (BM)
                </span>
              </div>
              {projects.length > 1 && (
                <select
                  value={activeCurveProject.id}
                  onChange={(e) => {
                    setSelectedCurveProjectId(e.target.value);
                    setHoveredPointIdx(null);
                  }}
                  className="af-btn-glass rounded-xl px-3 py-1.5 text-xs font-medium cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="relative w-full">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto select-none overflow-visible">
              <defs>
                <linearGradient id="afSCurveRealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0071E3" stopOpacity="0.20" />
                  <stop offset="100%" stopColor="#0071E3" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="afSCurveBmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const tickVal = maxVal * 1.1 * frac;
                const y = yAt(tickVal);
                return (
                  <g key={frac}>
                    <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="var(--af-grid)" strokeWidth="1" />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="var(--af-muted)"
                      className="font-mono"
                    >
                      {fmtCompactBrl(tickVal)}
                    </text>
                  </g>
                );
              })}

              {sCurvePoints.length > 1 && (
                <>
                  <path
                    d={`${buildPath((p) => p.approvedMeasurementCumulative)} L ${xAt(sCurvePoints.length - 1).toFixed(1)} ${(chartH - padB).toFixed(1)} L ${xAt(0).toFixed(1)} ${(chartH - padB).toFixed(1)} Z`}
                    fill="url(#afSCurveBmGrad)"
                  />
                  <path
                    d={`${buildPath((p) => p.realizedCumulative)} L ${xAt(sCurvePoints.length - 1).toFixed(1)} ${(chartH - padB).toFixed(1)} L ${xAt(0).toFixed(1)} ${(chartH - padB).toFixed(1)} Z`}
                    fill="url(#afSCurveRealGrad)"
                  />
                  <path
                    d={buildPath((p) => p.plannedCumulative)}
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="1.75"
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                  />
                  <path
                    d={buildPath((p) => p.approvedMeasurementCumulative)}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={buildPath((p) => p.realizedCumulative)}
                    fill="none"
                    stroke="#0071E3"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {sCurvePoints.map((pt, idx) => {
                const x = xAt(idx);
                const active = hoveredPointIdx === idx;
                return (
                  <g
                    key={pt.month}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPointIdx(idx)}
                    onMouseLeave={() => setHoveredPointIdx(null)}
                  >
                    <rect
                      x={x - Math.max(24, (chartW - padL - padR) / Math.max(sCurvePoints.length * 2, 2))}
                      y={padT}
                      width={Math.max(48, (chartW - padL - padR) / Math.max(sCurvePoints.length, 1))}
                      height={chartH - padT - padB}
                      fill="transparent"
                    />
                    {active && (
                      <line
                        x1={x}
                        y1={padT}
                        x2={x}
                        y2={chartH - padB}
                        stroke="#0071E3"
                        strokeOpacity="0.45"
                        strokeDasharray="3 3"
                      />
                    )}
                    <circle cx={x} cy={yAt(pt.approvedMeasurementCumulative)} r={active ? 5 : 3.5} fill="#10B981" />
                    <circle cx={x} cy={yAt(pt.realizedCumulative)} r={active ? 5.5 : 4} fill="#0071E3" />
                    <text x={x} y={chartH - 8} textAnchor="middle" fontSize="10" fill="var(--af-muted)" className="font-mono">
                      {pt.month}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Liquid Glass Floating Tooltip */}
            {hoveredPoint && (
              <div className="af-glass-strong pointer-events-none absolute top-2 right-2 rounded-2xl px-3.5 py-2.5 text-xs min-w-[215px] space-y-1">
                <div className="font-semibold font-mono text-[#1D1D1F] dark:text-white">{hoveredPoint.month}</div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6E6E73] dark:text-[#98989D]">Previsto</span>
                  <span className="font-mono tabular-nums font-medium">{fmtBrl(hoveredPoint.plannedCumulative)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#0071E3] dark:text-[#409CFF]">Realizado</span>
                  <span className="font-mono tabular-nums font-semibold">{fmtBrl(hoveredPoint.realizedCumulative)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#10B981]">Medido (BM)</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {fmtBrl(hoveredPoint.approvedMeasurementCumulative)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coverage Warning Banner */}
      {(report.totals.unpricedLaborHours > 0 || report.totals.unpricedStockMovementsCount > 0) && (
        <div className="p-3.5 rounded-2xl bg-[#FFF4E5] dark:bg-amber-950/30 border border-amber-500/30 text-[#8A3D00] dark:text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#B25000] dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Atenção de cobertura de custos (nenhum valor foi estimado ficticiamente)</p>
            <p className="text-[11px] opacity-85 mt-0.5">
              {report.totals.unpricedLaborHours > 0 && `• ${report.totals.unpricedLaborHours}h de apontamento HH sem custo horário. `}
              {report.totals.unpricedStockMovementsCount > 0 && `• ${report.totals.unpricedStockMovementsCount} saída(s) de estoque sem custo médio valorizado.`}
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 af-card p-3.5 rounded-2xl text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#86868B] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar obra por código ou nome..."
            className="w-full bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] rounded-xl pl-9 pr-3 py-2 text-[#1D1D1F] dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] rounded-xl px-3 py-2 text-[#1D1D1F] dark:text-white"
          >
            <option value="todos">Todos os status</option>
            <option value="planejamento">Planejamento</option>
            <option value="mobilizacao">Mobilização</option>
            <option value="em_execucao">Em Execução</option>
            <option value="paralisado">Paralisado</option>
            <option value="concluido">Concluído</option>
            <option value="encerrado">Encerrado</option>
          </select>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="px-3.5 py-2 af-btn-glass rounded-xl flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="px-3.5 py-2 af-btn-primary font-semibold rounded-xl flex items-center gap-1.5 disabled:opacity-50 cursor-pointer apple-solid-btn"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Table (Solid high-contrast Apple surface) */}
      <div className="af-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F5F7] dark:bg-[#1C1F26] text-[#6E6E73] dark:text-[#98989D] uppercase text-[10px] tracking-wider border-b border-black/[0.08] dark:border-white/[0.08]">
              <tr>
                <th className="py-3 px-4">Projeto / Obra</th>
                <th className="py-3 px-3 text-right">Previsto</th>
                <th className="py-3 px-3 text-right">Comprometido</th>
                <th className="py-3 px-3 text-right">Realizado (HH)</th>
                <th className="py-3 px-3 text-right">Realizado (Mat/OC)</th>
                <th className="py-3 px-3 text-right">Realizado Total</th>
                <th className="py-3 px-3 text-right">Projetado (EAC)</th>
                <th className="py-3 px-3 text-right">Desvio Orç.</th>
                <th className="py-3 px-4 text-right">Margem Real.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#6E6E73] dark:text-[#98989D]">
                    Consolidando livro de custos por obra...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#86868B]">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum projeto/obra encontrado para exibir o resultado.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const eac = computeProjectEac({
                    projectId: row.projectId,
                    baselineBudget: row.plannedDirectCost,
                    committedOpen: row.committedCost,
                    realizedToDate: row.realizedTotalCost,
                  });
                  return (
                    <tr
                      key={row.projectId}
                      onClick={() => setSelectedCurveProjectId(row.projectId)}
                      className="hover:bg-black/[0.025] dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#0071E3] dark:text-[#409CFF]">{row.projectCode}</div>
                        <div className="text-[#1D1D1F] dark:text-[#F5F5F7] font-medium">{row.projectName}</div>
                        {row.coverageWarnings.length > 0 && (
                          <div className="text-[10px] text-[#B25000] dark:text-[#FF9F0A] mt-0.5">
                            {row.coverageWarnings.join(' • ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{fmtBrl(row.plannedDirectCost)}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#B25000] dark:text-[#FF9F0A]">
                        {fmtBrl(row.committedCost)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{fmtBrl(row.realizedLaborCost)}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {fmtBrl(row.realizedMaterialCost + row.realizedPurchasingCost)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">{fmtBrl(row.realizedTotalCost)}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#0071E3] dark:text-[#409CFF]" title={eac.assumptionNote}>
                        <div>{fmtBrl(eac.eacProjectedCost)}</div>
                        <div className="text-[10px] text-[#86868B]">
                          {eac.varianceAtCompletion >= 0 ? 'Dentro' : `Estouro ${fmtBrl(Math.abs(eac.varianceAtCompletion))}`}
                        </div>
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono tabular-nums font-semibold ${
                          row.budgetVariance >= 0
                            ? 'text-[#1E7E34] dark:text-[#30D158]'
                            : 'text-[#D70015] dark:text-[#FF453A]'
                        }`}
                      >
                        {fmtBrl(row.budgetVariance)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div
                          className={
                            row.grossMarginRealized >= 0
                              ? 'text-[#1E7E34] dark:text-[#30D158] font-bold'
                              : 'text-[#D70015] dark:text-[#FF453A] font-bold'
                          }
                        >
                          {fmtBrl(row.grossMarginRealized)}
                        </div>
                        <div className="text-[10px] text-[#86868B]">
                          {row.grossMarginPercent !== null ? `${row.grossMarginPercent.toFixed(1)}%` : '—'}
                        </div>
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
  );
};
