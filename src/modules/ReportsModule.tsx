import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { WorkOrder, Occurrence, StockBalance, Item, Inspection, Asset } from '../types';
import {
  FileBarChart,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  TrendingUp,
  Zap,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import { PredictiveAnalysisView } from '../components/reports/PredictiveAnalysisView';
import { OperationalExportModal } from '../components/reports/OperationalExportModal';

export const ReportsModule: React.FC = () => {
  const { organization, units } = useAuth();
  const [activeTab, setActiveTab] = useState<'preditiva' | 'geral'>('preditiva');
  const [showExportModal, setShowExportModal] = useState(false);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    if (!organization) return;
    setLoading(true);

    Promise.all([
      getDocs(query(collection(db, 'work_orders'), where('orgId', '==', organization.id))),
      getDocs(query(collection(db, 'occurrences'), where('orgId', '==', organization.id))),
      getDocs(query(collection(db, 'stock_balances'), where('orgId', '==', organization.id))),
      getDocs(query(collection(db, 'items'), where('orgId', '==', organization.id))),
      getDocs(query(collection(db, 'inspections'), where('orgId', '==', organization.id))),
      getDocs(query(collection(db, 'assets'), where('orgId', '==', organization.id))),
    ]).then(([snapWO, snapOcc, snapBal, snapItems, snapInsp, snapAssets]) => {
      setOrders(snapWO.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)));
      setOccurrences(snapOcc.docs.map((d) => ({ id: d.id, ...d.data() } as Occurrence)));
      setBalances(snapBal.docs.map((d) => ({ id: d.id, ...d.data() } as StockBalance)));
      setItems(snapItems.docs.map((d) => ({ id: d.id, ...d.data() } as Item)));
      setInspections(snapInsp.docs.map((d) => ({ id: d.id, ...d.data() } as Inspection)));
      setAssets(snapAssets.docs.map((d) => ({ id: d.id, ...d.data() } as Asset)));
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, [organization]);

  // Derived metrics
  const completedCount = orders.filter((o) => o.status === 'concluida' || o.status === 'encerrada').length;
  const completionRate = orders.length > 0 ? Math.round((completedCount / orders.length) * 100) : 0;
  const totalCost = orders.reduce((sum, o) => sum + (o.estimatedCost || 0), 0);
  const avgCost = orders.length > 0 ? totalCost / orders.length : 0;

  const conformeInspections = inspections.filter((i) => i.result === 'conforme').length;
  const complianceRate = inspections.length > 0 ? Math.round((conformeInspections / inspections.length) * 100) : 100;

  // Real CSV Export
  const handleExportCSV = () => {
    if (orders.length === 0) {
      alert('Não há dados suficientes para exportação no momento.');
      return;
    }

    const headers = ['Numero_OS', 'Titulo', 'Prioridade', 'Status', 'Solicitante', 'Equipe', 'Previsao_Inicio', 'Custo_Estimado_BRL'];
    const rows = orders.map((o) => [
      `"${o.orderNumber}"`,
      `"${o.title.replace(/"/g, '""')}"`,
      `"${o.priority}"`,
      `"${o.status}"`,
      `"${o.requesterName || ''}"`,
      `"${o.assignedTeam || ''}"`,
      `"${o.scheduledStartDate || ''}"`,
      (o.estimatedCost || 0).toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `agueroflow_relatorio_os_${organization?.slug || 'empresa'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Inteligência Operacional & Relatórios</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Confiabilidade preditiva, análise de falhas (MTBF/MTTR) e indicadores executivos em tempo real.
          </p>
        </div>

        {/* Right Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('preditiva')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'preditiva'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Análise Preditiva (MTBF)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('geral')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'geral'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileBarChart className="w-3.5 h-3.5" />
              <span>Indicadores Gerais</span>
            </button>
          </div>

          {/* Export PDF / Excel Button */}
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            title="Exportar relatórios em PDF ou Excel com filtros e colunas personalizadas"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar PDF & Excel</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Predictive Analysis View */}
      {activeTab === 'preditiva' && (
        <PredictiveAnalysisView
          orders={orders}
          assets={assets}
          occurrences={occurrences}
          units={units}
          onRefresh={fetchData}
        />
      )}

      {/* Tab 2: General KPIs and Breakdowns */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportador Avançado (PDF / Excel)</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              <span>CSV Simples</span>
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800">
              <span className="text-xs text-slate-400">Taxa de Conclusão de OS</span>
              <p className="text-3xl font-extrabold text-blue-400 mt-2">{completionRate}%</p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {completedCount} de {orders.length} ordens concluídas
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800">
              <span className="text-xs text-slate-400">Conformidade em Vistorias</span>
              <p className="text-3xl font-extrabold text-emerald-400 mt-2">{complianceRate}%</p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {conformeInspections} de {inspections.length} inspeções conformes
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800">
              <span className="text-xs text-slate-400">Custo Total de Ordens</span>
              <p className="text-2xl font-extrabold text-white mt-2">
                R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Média: R$ {avgCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / OS
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800">
              <span className="text-xs text-slate-400">Ocorrências Ativas</span>
              <p className="text-3xl font-extrabold text-amber-400 mt-2">{occurrences.length}</p>
              <span className="text-[11px] text-slate-400 mt-1 block">Rastreamento de não conformidades</span>
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Work Orders by Priority */}
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">Distribuição de OS por Prioridade</h3>
              <div className="space-y-3">
                {(['critica', 'alta', 'media', 'baixa'] as const).map((p) => {
                  const count = orders.filter((o) => o.priority === p).length;
                  const pct = orders.length > 0 ? Math.round((count / orders.length) * 100) : 0;
                  return (
                    <div key={p} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-200 capitalize">{p}</span>
                        <span className="text-slate-400">
                          {count} OS ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p === 'critica'
                              ? 'bg-red-500'
                              : p === 'alta'
                              ? 'bg-amber-500'
                              : p === 'media'
                              ? 'bg-blue-500'
                              : 'bg-slate-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Occurrences by Type */}
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">Ocorrências por Categoria</h3>
              <div className="space-y-3">
                {[
                  { type: 'seguranca', label: 'Segurança do Trabalho' },
                  { type: 'qualidade', label: 'Qualidade / Não Conformidade' },
                  { type: 'falha_equipamento', label: 'Falha de Equipamento' },
                  { type: 'operacional', label: 'Operacional' },
                ].map((cat) => {
                  const count = occurrences.filter((o) => o.type === cat.type).length;
                  const pct = occurrences.length > 0 ? Math.round((count / occurrences.length) * 100) : 0;
                  return (
                    <div key={cat.type} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-200">{cat.label}</span>
                        <span className="text-slate-400">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Operational Performance Exporter Modal (PDF & Excel) */}
      <OperationalExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        orders={orders}
        assets={assets}
        units={units}
      />
    </div>
  );
};
