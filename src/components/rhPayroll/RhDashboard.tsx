import React, { useState } from 'react';
import {
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
  Calculator,
  ShieldCheck,
  PieChart as PieIcon,
  BarChart3,
  Presentation,
  Check,
  Building,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { RhEmployee, RhThirteenthCalculation } from '../../types/rhPayroll';
import { RhVisualSummary } from './RhVisualSummary';

interface RhDashboardProps {
  employees: RhEmployee[];
  calculations: RhThirteenthCalculation[];
  referenceYear: number;
  onNavigateTab: (tabId: string) => void;
  canViewFinancials: boolean;
  onQuickRecalculate: () => void;
  orgName?: string;
  onSyncWithConstruction?: () => Promise<void>;
  isSyncingWithConstruction?: boolean;
}

export const RhDashboard: React.FC<RhDashboardProps> = ({
  employees,
  calculations,
  referenceYear,
  onNavigateTab,
  canViewFinancials,
  onQuickRecalculate,
  orgName = 'Aguero Inox',
  onSyncWithConstruction,
  isSyncingWithConstruction = false,
}) => {
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [dashboardTab, setDashboardTab] = useState<'resumo_visual' | 'detalhado'>('resumo_visual');
  const activeEmployees = employees.filter((e) => e.active);
  const totalEmployeesCount = activeEmployees.length;

  // Cálculos consolidados
  const totalBaseCarteira = activeEmployees.reduce((sum, e) => sum + (e.baseSalaryCarteira || 0), 0);
  const totalBasePorFora = activeEmployees.reduce((sum, e) => sum + (e.baseSalaryPorFora || 0), 0);

  const totalThirteenthGrossCarteira = calculations.reduce(
    (sum, c) => sum + (c.thirteenthFullCarteira || 0),
    0
  );
  const totalFirstInstallmentCarteira = calculations.reduce(
    (sum, c) => sum + (c.firstInstallmentCarteira || 0),
    0
  );
  const totalFirstInstallmentPorFora = calculations.reduce(
    (sum, c) => sum + (c.firstInstallmentPorFora || 0),
    0
  );
  const totalFirstInstallmentCombined = totalFirstInstallmentCarteira + totalFirstInstallmentPorFora;

  const totalInssDeduction = calculations.reduce(
    (sum, c) => sum + (c.inssDeductionCarteira || 0),
    0
  );
  const totalSecondInstallmentNetCarteira = calculations.reduce(
    (sum, c) => sum + (c.secondInstallmentNetCarteira || 0),
    0
  );
  const totalSecondInstallmentPorFora = calculations.reduce(
    (sum, c) => sum + (c.secondInstallmentPorFora || 0),
    0
  );
  const totalSecondInstallmentCombined =
    totalSecondInstallmentNetCarteira + totalSecondInstallmentPorFora;

  const totalCombinedNet = totalFirstInstallmentCombined + totalSecondInstallmentCombined;

  // Divergências
  const divergentCalcs = calculations.filter((c) => c.hasDivergence);
  const approvedCalcs = calculations.filter((c) => c.status === 'aprovado');
  const pendingCalcs = calculations.filter((c) => c.status === 'rascunho' || c.status === 'conferido');

  // 1. Dados para Gráfico de Distribuição por Obra de Alocação (Cód. Obra)
  const departmentTotals: { [dept: string]: { carteira: number; porFora: number; count: number } } = {};
  calculations.forEach((c) => {
    const emp = employees.find((e) => e.id === c.employeeId);
    const obraCode = c.codigoObra || emp?.codigoObra || c.registrationNumber || '198';
    const dept = `Obra ${obraCode}`;
    if (!departmentTotals[dept]) {
      departmentTotals[dept] = { carteira: 0, porFora: 0, count: 0 };
    }
    departmentTotals[dept].carteira += c.totalThirteenthCarteiraNet || 0;
    departmentTotals[dept].porFora += (c.firstInstallmentPorFora + c.secondInstallmentPorFora) || 0;
    departmentTotals[dept].count += 1;
  });

  const departmentChartData = Object.entries(departmentTotals).map(([dept, data]) => ({
    name: dept,
    'CLT Líquido': Math.round(data.carteira),
    'Complementar (Por Fora)': Math.round(data.porFora),
    total: Math.round(data.carteira + data.porFora),
    colaboradores: data.count,
  }));

  // 2. Dados para Gráfico de Composição Financeira (Donut)
  const totalCltNet = calculations.reduce((sum, c) => sum + (c.totalThirteenthCarteiraNet || 0), 0);
  const totalPorForaFull = calculations.reduce(
    (sum, c) => sum + (c.firstInstallmentPorFora + c.secondInstallmentPorFora || 0),
    0
  );

  const compositionPieData = [
    { name: '13º Líquido CLT', value: Math.round(totalCltNet), color: '#10B981' }, // emerald-500
    { name: 'Verba Complementar', value: Math.round(totalPorForaFull), color: '#8B5CF6' }, // purple-500
    { name: 'Retenção INSS Oficial', value: Math.round(totalInssDeduction), color: '#F59E0B' }, // amber-500
  ].filter((item) => item.value > 0);

  // 3. Dados para Comparativo 1ª Parcela vs 2ª Parcela
  const installmentComparisonData = [
    {
      etapa: '1ª Parcela (Adiantamento)',
      CLT: Math.round(totalFirstInstallmentCarteira),
      'Verba Complementar': Math.round(totalFirstInstallmentPorFora),
      Total: Math.round(totalFirstInstallmentCombined),
    },
    {
      etapa: '2ª Parcela (Quitação)',
      CLT: Math.round(totalSecondInstallmentNetCarteira),
      'Verba Complementar': Math.round(totalSecondInstallmentPorFora),
      Total: Math.round(totalSecondInstallmentCombined),
    },
  ];

  // 4. Distribuição por Avos (0 a 12)
  const avosDistribution: { [key: number]: number } = {};
  for (let i = 1; i <= 12; i++) avosDistribution[i] = 0;
  calculations.forEach((c) => {
    const av = c.monthsWorked || 0;
    avosDistribution[av] = (avosDistribution[av] || 0) + 1;
  });

  const avosChartData = Array.from({ length: 12 }, (_, i) => ({
    avos: `${i + 1}/12`,
    colaboradores: avosDistribution[i + 1] || 0,
  }));

  const formatCurrency = (val: number) => {
    if (!canViewFinancials) return 'R$ ••••••';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Legal Disclaimer & Presentation Switcher */}
      <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-800/60 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl shadow-black/30">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 shrink-0">
            <Presentation className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">
                Painel Gerencial & Apuração de 13º Salário {referenceYear}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900 text-blue-300 font-semibold border border-blue-700/50">
                Oficial Aguero Inox
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Pré-cálculo para conferência do RH/contabilidade. Não constitui folha de pagamento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={() => setPresentationMode(!presentationMode)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${
              presentationMode
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700'
            }`}
            title="Alternar para visualização executiva de apresentação para diretoria"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {presentationMode ? 'Sair do Modo Apresentação' : 'Modo Apresentação Diretoria'}
          </button>
          <button
            onClick={() => onNavigateTab('importacao')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Importar
          </button>
          <button
            onClick={onQuickRecalculate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5" />
            Recalcular
          </button>
        </div>
      </div>

      {/* Sub-Tabs: Resumo Visual & Custos por Obra vs Detalhamento Operacional */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
          <button
            onClick={() => setDashboardTab('resumo_visual')}
            className={`flex items-center gap-1.5 px-3.5 py-2 font-bold transition cursor-pointer ${
              dashboardTab === 'resumo_visual'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-300" />
            Resumo Visual & Custos por Obra
          </button>
          <button
            onClick={() => setDashboardTab('detalhado')}
            className={`flex items-center gap-1.5 px-3.5 py-2 font-bold transition cursor-pointer ${
              dashboardTab === 'detalhado'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Detalhamento & Divergências
          </button>
        </div>

        <span className="text-[11px] text-slate-400 font-mono">
          {calculations.length} cálculos apurados • {departmentChartData.length} canteiros de obra
        </span>
      </div>

      {/* VISÃO 1: RESUMO VISUAL EXECUTIVO COM RECHARTS */}
      {dashboardTab === 'resumo_visual' && (
        <RhVisualSummary
          employees={employees}
          calculations={calculations}
          canViewFinancials={canViewFinancials}
          orgName={orgName}
          referenceYear={referenceYear}
          onNavigateToTab={onNavigateTab}
          onSyncWithConstruction={onSyncWithConstruction}
          isSyncingWithConstruction={isSyncingWithConstruction}
        />
      )}

      {/* VISÃO 2: DETALHAMENTO OPERACIONAL E CONFERÊNCIA */}
      {dashboardTab === 'detalhado' && (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Colaboradores */}
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total de Colaboradores</span>
                <div className="p-2 bg-blue-950/60 text-blue-400 rounded-lg">
                  <Users className="w-4 h-4" />
                </div>
              </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">{totalEmployeesCount}</div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              <span className="text-emerald-400 font-semibold">{calculations.length} apurados</span>
              <span>•</span>
              <span>{totalEmployeesCount - calculations.length} pendentes</span>
            </div>
          </div>
        </div>

        {/* Provisão Bruta CLT */}
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Provisão 13º Integral CLT</span>
            <div className="p-2 bg-indigo-950/60 text-indigo-400 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white font-mono">
              {formatCurrency(totalThirteenthGrossCarteira)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              <span>Base mensal CLT:</span>
              <span className="text-slate-200 font-semibold">{formatCurrency(totalBaseCarteira)}</span>
            </div>
          </div>
        </div>

        {/* 1ª Parcela (50% Sem INSS) */}
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">1ª Parcela (Adiantamento 50%)</span>
            <div className="p-2 bg-emerald-950/60 text-emerald-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {formatCurrency(totalFirstInstallmentCombined)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              <span>Carteira: {formatCurrency(totalFirstInstallmentCarteira)}</span>
              <span>|</span>
              <span>Fora: {formatCurrency(totalFirstInstallmentPorFora)}</span>
            </div>
          </div>
        </div>

        {/* 2ª Parcela (Quitação com INSS) */}
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">2ª Parcela (Líquida - Quitação)</span>
            <div className="p-2 bg-cyan-950/60 text-cyan-400 rounded-lg">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              {formatCurrency(totalSecondInstallmentCombined)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              <span>Retenção INSS: </span>
              <span className="text-amber-400 font-semibold">{formatCurrency(totalInssDeduction)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos Visuais de Alto Impacto para Apresentação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Gráfico 1: Desdobramento 1ª Parcela vs 2ª Parcela */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Desembolso por Parcela (1ª vs 2ª)
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">CLT + Por Fora</span>
            </div>
            <p className="text-[11px] text-slate-400">
              1ª Parcela sem incidência de INSS • 2ª Parcela com desconto da tabela progressiva 2025.
            </p>
          </div>

          <div className="h-60 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={installmentComparisonData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="etapa" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 9 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val: any) => formatCurrency(Number(val))}
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="CLT" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Verba Complementar" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Composição Financeira da Folha de 13º (Donut Chart) */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <PieIcon className="w-4 h-4 text-cyan-400" />
                Composição do Orçamento Total
              </h4>
              <span className="text-[10px] font-mono text-cyan-300 font-bold">
                {formatCurrency(totalCombinedNet + totalInssDeduction)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Distribuição proporcional entre proventos líquidos e encargos previdenciários retidos.
            </p>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            {compositionPieData.length === 0 ? (
              <span className="text-xs text-slate-500">Sem dados para exibição do gráfico</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={compositionPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {compositionPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => formatCurrency(Number(val))}
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gráfico 3: Provisão de 13º por Obra Alocada */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Building className="w-4 h-4 text-indigo-400" />
                Custo de 13º por Obra Alocada
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                {departmentChartData.length} obras
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Concentração e rateio de despesas de 13º por canteiro de obra.
            </p>
          </div>

          <div className="h-60 w-full pt-2">
            {departmentChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Nenhum setor registrado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChartData} layout="vertical" margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#64748B', fontSize: 9 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94A3B8', fontSize: 9 }} width={80} />
                  <Tooltip
                    formatter={(val: any) => formatCurrency(Number(val))}
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="total" name="Total 13º" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Visual Distribution by Avos (0 a 12 meses) */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              Distribuição de Colaboradores por Tempo de Direito (Avos Trabalhados em {referenceYear})
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Critério CLT: Fração igual ou superior a 15 dias trabalhados no mês assegura 1 avo (1/12).
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
            {calculations.length} colaboradores apurados
          </span>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 pt-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((monthNum) => {
            const count = avosDistribution[monthNum] || 0;
            const percentage =
              calculations.length > 0 ? Math.round((count / calculations.length) * 100) : 0;
            return (
              <div
                key={monthNum}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col justify-between ${
                  count > 0
                    ? 'bg-blue-950/30 border-blue-800/60 text-white'
                    : 'bg-slate-900/30 border-slate-800/60 text-slate-500'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-400">
                  {monthNum}/12
                </span>
                <span
                  className={`text-lg font-extrabold my-1 ${
                    count > 0 ? 'text-blue-400' : 'text-slate-600'
                  }`}
                >
                  {count}
                </span>
                <span className="text-[9px] text-slate-400 block font-mono">{percentage}%</span>
              </div>
            );
          })}
        </div>
      </div>
      </div>
      )}

      {/* Presentation Mode Summary Callout (when active) */}
      {presentationMode && (
        <div className="bg-gradient-to-br from-slate-900 via-[#121826] to-blue-950/50 border-2 border-cyan-500/60 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Resumo Executivo para Apresentação — Diretoria & Stakeholders
              </h3>
            </div>
            <span className="text-[11px] text-cyan-300 font-mono">Status: Apto para Homologação</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block font-sans text-[11px]">Desembolso 1ª Parcela (Adiantamento):</span>
              <span className="text-2xl font-bold text-emerald-400 block mt-1">
                {formatCurrency(totalFirstInstallmentCombined)}
              </span>
              <span className="text-[10px] text-slate-500 font-sans block mt-1">
                Previsto até 30 de Novembro de {referenceYear}
              </span>
            </div>

            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block font-sans text-[11px]">Desembolso 2ª Parcela (Quitação Líquida):</span>
              <span className="text-2xl font-bold text-cyan-400 block mt-1">
                {formatCurrency(totalSecondInstallmentCombined)}
              </span>
              <span className="text-[10px] text-slate-500 font-sans block mt-1">
                Previsto até 20 de Dezembro de {referenceYear}
              </span>
            </div>

            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <span className="text-slate-400 block font-sans text-[11px]">Custo Total Consolidado do 13º Salário:</span>
              <span className="text-2xl font-bold text-white block mt-1">
                {formatCurrency(totalCombinedNet + totalInssDeduction)}
              </span>
              <span className="text-[10px] text-slate-500 font-sans block mt-1">
                Inclui CLT Líquido + Encargos INSS + Verba Complementar
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
