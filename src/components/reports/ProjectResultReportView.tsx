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
import type { Project } from '../../types/project';
import type { PurchaseOrder } from '../../types/purchasing';
import { computeProjectResultReport } from '../../services/projectCostLedger';

interface ProjectResultReportViewProps {
  orgId: string;
  orgSlug?: string;
}

const fmtBrl = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [timeLogs, setTimeLogs] = useState<WorkerTimeLog[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [payables, setPayables] = useState<FinancePayable[]>([]);
  const [persistedFacts, setPersistedFacts] = useState<ProjectCostFact[]>([]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [projs, wos, logs, movs, bals, pos, pays, facts] = await Promise.all([
        safeOrgDocs<Project>('projects', 'orgId', orgId),
        safeOrgDocs<WorkOrder>('work_orders', 'orgId', orgId),
        safeOrgDocs<WorkerTimeLog>('worker_time_logs', 'orgId', orgId),
        safeOrgDocs<StockMovement>('stock_movements', 'orgId', orgId),
        safeOrgDocs<StockBalance>('stock_balances', 'orgId', orgId),
        safeOrgDocs<PurchaseOrder>('purchasing_orders', 'organizationId', orgId),
        safeOrgDocs<FinancePayable>('finance_payables', 'orgId', orgId),
        safeOrgDocs<ProjectCostFact>('project_cost_facts', 'orgId', orgId),
      ]);
      setProjects(projs);
      setWorkOrders(wos);
      setTimeLogs(logs);
      setStockMovements(movs);
      setStockBalances(bals);
      setPurchaseOrders(pos);
      setPayables(pays);
      setPersistedFacts(facts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const report = useMemo(
    () =>
      computeProjectResultReport({
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

  return (
    <div className="space-y-5">
      {/* KPI Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Receita Contratada</span>
          <p className="text-lg font-bold font-mono text-white mt-1">{fmtBrl(report.totals.contractedRevenue)}</p>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Previsto (Baseline)</span>
          <p className="text-lg font-bold font-mono text-cyan-400 mt-1">{fmtBrl(report.totals.plannedDirectCost)}</p>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Comprometido (OCs)</span>
          <p className="text-lg font-bold font-mono text-amber-400 mt-1">{fmtBrl(report.totals.committedCost)}</p>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Realizado Total</span>
          <p className="text-lg font-bold font-mono text-rose-300 mt-1">{fmtBrl(report.totals.realizedTotalCost)}</p>
          <span className="text-[10px] text-slate-500">
            HH {fmtBrl(report.totals.realizedLaborCost)} • Mat {fmtBrl(report.totals.realizedMaterialCost)}
          </span>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Margem Realizada</span>
          <p
            className={`text-lg font-bold font-mono mt-1 flex items-center gap-1.5 ${
              report.totals.grossMarginRealized >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {report.totals.grossMarginRealized >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{fmtBrl(report.totals.grossMarginRealized)}</span>
          </p>
          <span className="text-[10px] text-slate-400">
            {report.totals.grossMarginPercent !== null ? `${report.totals.grossMarginPercent.toFixed(1)}% s/ receita` : 'Sem receita baseline'}
          </span>
        </div>
      </div>

      {/* Coverage Warning Banner */}
      {(report.totals.unpricedLaborHours > 0 || report.totals.unpricedStockMovementsCount > 0) && (
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-700/50 text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Atenção de cobertura de custos (nenhum valor foi estimado ficticiamente)</p>
            <p className="text-[11px] text-amber-200/80 mt-0.5">
              {report.totals.unpricedLaborHours > 0 && `• ${report.totals.unpricedLaborHours}h de apontamento HH sem custo horário. `}
              {report.totals.unpricedStockMovementsCount > 0 && `• ${report.totals.unpricedStockMovementsCount} saída(s) de estoque sem custo médio valorizado.`}
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#121826] p-3.5 rounded-xl border border-slate-800 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar obra por código ou nome..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
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
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Projeto / Obra</th>
                <th className="py-3 px-3 text-right">Previsto</th>
                <th className="py-3 px-3 text-right">Comprometido</th>
                <th className="py-3 px-3 text-right">Realizado (HH)</th>
                <th className="py-3 px-3 text-right">Realizado (Mat/OC)</th>
                <th className="py-3 px-3 text-right">Realizado Total</th>
                <th className="py-3 px-3 text-right">Desvio Orç.</th>
                <th className="py-3 px-4 text-right">Margem Real.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Consolidando livro de custos por obra...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum projeto/obra encontrado para exibir o resultado.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.projectId} className="hover:bg-slate-900/50">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-cyan-300">{row.projectCode}</div>
                      <div className="text-slate-200 font-medium">{row.projectName}</div>
                      {row.coverageWarnings.length > 0 && (
                        <div className="text-[10px] text-amber-400 mt-0.5">
                          {row.coverageWarnings.join(' • ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">{fmtBrl(row.plannedDirectCost)}</td>
                    <td className="py-3 px-3 text-right font-mono text-amber-300">{fmtBrl(row.committedCost)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{fmtBrl(row.realizedLaborCost)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {fmtBrl(row.realizedMaterialCost + row.realizedPurchasingCost)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-white">{fmtBrl(row.realizedTotalCost)}</td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-semibold ${
                        row.budgetVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {fmtBrl(row.budgetVariance)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div className={row.grossMarginRealized >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {fmtBrl(row.grossMarginRealized)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {row.grossMarginPercent !== null ? `${row.grossMarginPercent.toFixed(1)}%` : '—'}
                      </div>
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
