import React, { useMemo, useState } from 'react';
import {
  Users,
  DollarSign,
  TrendingUp,
  Building,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  PieChart as PieIcon,
  BarChart3,
  HardHat,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Lock,
  Eye,
  RefreshCw,
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

interface RhVisualSummaryProps {
  employees: RhEmployee[];
  calculations: RhThirteenthCalculation[];
  canViewFinancials: boolean;
  orgName: string;
  referenceYear: number;
  onNavigateToTab?: (tabId: string) => void;
  onSyncWithConstruction?: () => Promise<void>;
  isSyncingWithConstruction?: boolean;
}

export const RhVisualSummary: React.FC<RhVisualSummaryProps> = ({
  employees,
  calculations,
  canViewFinancials,
  orgName,
  referenceYear,
  onNavigateToTab,
  onSyncWithConstruction,
  isSyncingWithConstruction = false,
}) => {
  const [selectedObraFilter, setSelectedObraFilter] = useState<string>('todos');

  // Format currency respecting financial viewing permission
  const formatCurrency = (val: number) => {
    if (!canViewFinancials) return 'R$ ••••••';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // 1. Efetivo e Status dos Colaboradores
  const employeeStatusCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let withPorFora = 0;
    let totalHourlyCarteira = 0;
    let totalHourlyPorFora = 0;

    employees.forEach((e) => {
      if (e.active) {
        active++;
        totalHourlyCarteira += e.hourlyRateCarteira || 0;
        totalHourlyPorFora += e.hourlyRatePorFora || 0;
      } else {
        inactive++;
      }
      if ((e.hourlyRatePorFora || 0) > 0 || (e.baseSalaryPorFora || 0) > 0) {
        withPorFora++;
      }
    });

    const total = employees.length;
    const activePercent = total > 0 ? Math.round((active / total) * 100) : 0;

    return {
      total,
      active,
      inactive,
      withPorFora,
      activePercent,
      avgHourlyCarteira: active > 0 ? totalHourlyCarteira / active : 0,
      avgHourlyPorFora: active > 0 ? totalHourlyPorFora / active : 0,
    };
  }, [employees]);

  // 2. Provisão Consolidada de 13º Salário
  const payrollProvision = useMemo(() => {
    const totalThirteenthFullCarteira = calculations.reduce(
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
    const totalFirstInstallmentTotal =
      totalFirstInstallmentCarteira + totalFirstInstallmentPorFora;

    const totalSecondInstallmentGrossCarteira = calculations.reduce(
      (sum, c) => sum + (c.secondInstallmentGrossCarteira || 0),
      0
    );
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
    const totalSecondInstallmentTotalNet =
      totalSecondInstallmentNetCarteira + totalSecondInstallmentPorFora;

    const totalThirteenthCarteiraNet = calculations.reduce(
      (sum, c) => sum + (c.totalThirteenthCarteiraNet || 0),
      0
    );
    const totalPorForaFull = calculations.reduce(
      (sum, c) => sum + ((c.firstInstallmentPorFora || 0) + (c.secondInstallmentPorFora || 0)),
      0
    );
    const totalCombinedNet = totalFirstInstallmentTotal + totalSecondInstallmentTotalNet;
    const totalGrossCombined = totalThirteenthFullCarteira + totalPorForaFull;

    return {
      totalGrossCombined,
      totalThirteenthFullCarteira,
      totalPorForaFull,
      totalFirstInstallmentTotal,
      totalFirstInstallmentCarteira,
      totalFirstInstallmentPorFora,
      totalInssDeduction,
      totalSecondInstallmentTotalNet,
      totalSecondInstallmentNetCarteira,
      totalSecondInstallmentPorFora,
      totalCombinedNet,
      totalThirteenthCarteiraNet,
    };
  }, [calculations]);

  // 3. Distribuição de Custos por Canteiro de Obra (Código da Obra - Coluna Q)
  const obraBreakdown = useMemo(() => {
    const map: {
      [obraCode: string]: {
        obraCode: string;
        label: string;
        workerCount: number;
        activeWorkers: number;
        baseCarteira: number;
        basePorFora: number;
        cltNet: number;
        porForaNet: number;
        inssRetido: number;
        total1aParcela: number;
        total2aParcelaNet: number;
        totalNet: number;
      };
    } = {};

    // Group calculations by Obra
    calculations.forEach((c) => {
      const code = c.codigoObra || c.registrationNumber || '198';
      const label = `Obra ${code}`;

      if (!map[code]) {
        map[code] = {
          obraCode: code,
          label,
          workerCount: 0,
          activeWorkers: 0,
          baseCarteira: 0,
          basePorFora: 0,
          cltNet: 0,
          porForaNet: 0,
          inssRetido: 0,
          total1aParcela: 0,
          total2aParcelaNet: 0,
          totalNet: 0,
        };
      }

      const clt = c.totalThirteenthCarteiraNet || 0;
      const fora = (c.firstInstallmentPorFora || 0) + (c.secondInstallmentPorFora || 0);
      const inss = c.inssDeductionCarteira || 0;

      map[code].workerCount += 1;
      map[code].cltNet += clt;
      map[code].porForaNet += fora;
      map[code].inssRetido += inss;
      map[code].total1aParcela += c.firstInstallmentTotal || 0;
      map[code].total2aParcelaNet += c.secondInstallmentTotalNet || 0;
      map[code].totalNet += c.totalThirteenthCombinedNet || 0;
    });

    // Also account for employees without calculations yet
    employees.forEach((emp) => {
      const code = emp.codigoObra || emp.registrationNumber || '198';
      const label = `Obra ${code}`;
      if (!map[code]) {
        map[code] = {
          obraCode: code,
          label,
          workerCount: 0,
          activeWorkers: 0,
          baseCarteira: 0,
          basePorFora: 0,
          cltNet: 0,
          porForaNet: 0,
          inssRetido: 0,
          total1aParcela: 0,
          total2aParcelaNet: 0,
          totalNet: 0,
        };
      }
      if (emp.active) {
        map[code].activeWorkers += 1;
      }
      map[code].baseCarteira += emp.baseSalaryCarteira || 0;
      map[code].basePorFora += emp.baseSalaryPorFora || 0;
    });

    const list = Object.values(map);
    // Sort by total net cost descending
    list.sort((a, b) => b.totalNet - a.totalNet);
    return list;
  }, [calculations, employees]);

  // Data for Recharts BarChart (Costs per Obra)
  const barChartData = useMemo(() => {
    return obraBreakdown.map((item) => ({
      name: item.label,
      obraCode: item.obraCode,
      'CLT Líquido': Math.round(item.cltNet),
      'Verba Complementar': Math.round(item.porForaNet),
      'Retenção INSS': Math.round(item.inssRetido),
      total: Math.round(item.totalNet),
      colaboradores: item.workerCount,
    }));
  }, [obraBreakdown]);

  // Data for Recharts PieChart (Composition of Total Payroll Provision)
  const pieChartData = useMemo(() => {
    const items = [
      {
        name: 'CLT Líquido (Folha)',
        value: Math.round(payrollProvision.totalThirteenthCarteiraNet),
        color: '#10B981', // emerald-500
      },
      {
        name: 'Verba Complementar (Por Fora)',
        value: Math.round(payrollProvision.totalPorForaFull),
        color: '#8B5CF6', // purple-500
      },
      {
        name: 'Retenção INSS Oficial (EC 103/2019)',
        value: Math.round(payrollProvision.totalInssDeduction),
        color: '#F59E0B', // amber-500
      },
    ];
    return items.filter((i) => i.value > 0);
  }, [payrollProvision]);

  // Data for Status Donut
  const statusDonutData = useMemo(() => {
    return [
      { name: 'Ativos em Campo', value: employeeStatusCounts.active, color: '#10B981' },
      { name: 'Inativos / Desligados', value: employeeStatusCounts.inactive, color: '#64748B' },
    ].filter((i) => i.value > 0);
  }, [employeeStatusCounts]);

  return (
    <div className="space-y-5">
      {/* Executive Header */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <BarChart3 className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Resumo Visual & Provisão da Folha — {orgName}
                <span className="px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 text-[10px] font-mono border border-blue-800">
                  Exercício {referenceYear}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Métricas oficiais de colaboradores, provisões de 13º salário e rateio por canteiro de obra.
              </p>
            </div>
          </div>
        </div>

        {/* Permission & Integration Indicators */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!canViewFinancials ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Sigilo Salarial Ativo (Valores mascarados)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-[11px] text-emerald-300 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Acesso Salarial Homologado
            </span>
          )}

          {onSyncWithConstruction && (
            <button
              onClick={onSyncWithConstruction}
              disabled={isSyncingWithConstruction}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition disabled:opacity-50 cursor-pointer"
              title="Sincronizar colaboradores com o Módulo 13 (Obras / Colaboradores de Campo)"
            >
              <HardHat className={`w-3.5 h-3.5 ${isSyncingWithConstruction ? 'animate-spin' : ''}`} />
              <span>{isSyncingWithConstruction ? 'Sincronizando...' : 'Sincronizar com Módulo 13'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Colaboradores & Status */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-400" />
              Efetivo de Pessoal
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 font-bold border border-blue-800">
              {employeeStatusCounts.activePercent}% Ativos
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">
              {employeeStatusCounts.total}
            </span>
            <span className="text-xs text-slate-400">colaboradores cadastrados</span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {employeeStatusCounts.active} Ativos em Campo
            </span>
            <span className="text-slate-400">
              {employeeStatusCounts.inactive} Inativos
            </span>
          </div>
          <div className="text-[11px] text-purple-300">
            {employeeStatusCounts.withPorFora} com remuneração complementar
          </div>
        </div>

        {/* Card 2: Provisão Total da Folha */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Provisão Total de 13º
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-bold border border-emerald-800">
              Folha Consolidada
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-extrabold font-mono text-emerald-400">
              {formatCurrency(payrollProvision.totalCombinedNet + payrollProvision.totalInssDeduction)}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300">
              CLT: {formatCurrency(payrollProvision.totalThirteenthFullCarteira)}
            </span>
            <span className="text-purple-400 font-semibold">
              Fora: {formatCurrency(payrollProvision.totalPorForaFull)}
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Líquido a pagar aos funcionários: <strong className="text-cyan-300 font-mono">{formatCurrency(payrollProvision.totalCombinedNet)}</strong>
          </div>
        </div>

        {/* Card 3: Desembolso em Parcelas */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Parcelas de Pagamento
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 font-bold border border-cyan-800">
              50% Adiantamento
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-extrabold font-mono text-cyan-400">
              {formatCurrency(payrollProvision.totalFirstInstallmentTotal)}
            </span>
            <span className="text-[11px] text-slate-400">(1ª Parcela)</span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-blue-300">
              2ª Parc. Líq: {formatCurrency(payrollProvision.totalSecondInstallmentTotalNet)}
            </span>
            <span className="text-amber-400 font-semibold">
              INSS: -{formatCurrency(payrollProvision.totalInssDeduction)}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            1ª Parcela sem incidência de INSS; quitação na 2ª parcela.
          </div>
        </div>

        {/* Card 4: Obras & Canteiros Alocados */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-sm hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-amber-400" />
              Canteiros de Obra (Q)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 font-bold border border-amber-800">
              {obraBreakdown.length} Obras Mapeadas
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">
              {obraBreakdown.length}
            </span>
            <span className="text-xs text-slate-400">obras com colaboradores</span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-300">
            <span>Custo Médio / Obra:</span>
            <span className="font-bold text-amber-300">
              {obraBreakdown.length > 0
                ? formatCurrency(payrollProvision.totalCombinedNet / obraBreakdown.length)
                : 'R$ 0,00'}
            </span>
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <HardHat className="w-3.5 h-3.5" />
            Vinculado aos Apontamentos do Módulo 13
          </div>
        </div>
      </div>

      {/* Gráficos Recharts: 1. Distribuição de Custos por Canteiro de Obra + 2. Donut de Composição */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Gráfico 1: Barras Empilhadas de Custos por Obra (Ocupa 2 colunas) */}
        <div className="lg:col-span-2 bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Distribuição de Custos de 13º por Canteiro de Obra (Código da Obra - Coluna Q)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Abertura entre proventos em folha CLT, verba complementar informada e retenção de INSS.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
              {barChartData.length} canteiros
            </span>
          </div>

          <div className="h-72 w-full pt-3">
            {barChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Nenhum cálculo registrado para apurar os canteiros de obra.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 15, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    angle={-15}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    tickFormatter={(v) =>
                      canViewFinancials ? `R$ ${(v / 1000).toFixed(0)}k` : '•••'
                    }
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      canViewFinancials ? formatCurrency(Number(val)) : 'Valores confidenciais',
                      name,
                    ]}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="CLT Líquido" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Verba Complementar" stackId="a" fill="#8B5CF6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Retenção INSS" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gráfico 2: Donut Chart de Repartição da Provisão */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <PieIcon className="w-4 h-4 text-cyan-400" />
                Composição do Desembolso
              </h3>
              <span className="text-[10px] font-mono font-bold text-cyan-300">
                {formatCurrency(payrollProvision.totalCombinedNet + payrollProvision.totalInssDeduction)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Proporção entre valores líquidos aos trabalhadores e encargos da previdência oficial.
            </p>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            {pieChartData.length === 0 ? (
              <span className="text-xs text-slate-500">Sem dados financeiros para o gráfico</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) =>
                      canViewFinancials ? formatCurrency(Number(val)) : 'Valores confidenciais'
                    }
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] space-y-1">
            <div className="flex justify-between text-emerald-300 font-mono">
              <span>CLT Líquido:</span>
              <span>{formatCurrency(payrollProvision.totalThirteenthCarteiraNet)}</span>
            </div>
            <div className="flex justify-between text-purple-300 font-mono">
              <span>Complementar:</span>
              <span>{formatCurrency(payrollProvision.totalPorForaFull)}</span>
            </div>
            <div className="flex justify-between text-amber-300 font-mono">
              <span>INSS Retido:</span>
              <span>-{formatCurrency(payrollProvision.totalInssDeduction)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Consolidação por Canteiro de Obra */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <HardHat className="w-4 h-4 text-amber-400" />
              Consolidação de Provisões por Canteiro de Obra
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Detalhamento de custos de mão de obra e alocação por código de obra (Coluna Q).
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {obraBreakdown.length} canteiros identificados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Código / Canteiro</th>
                <th className="py-2.5 px-3 text-center">Colaboradores</th>
                <th className="py-2.5 px-3 text-right">1ª Parcela</th>
                <th className="py-2.5 px-3 text-right">2ª Parcela Líq.</th>
                <th className="py-2.5 px-3 text-right">Retenção INSS</th>
                <th className="py-2.5 px-3 text-right">Verba Por Fora</th>
                <th className="py-2.5 px-3 text-right text-cyan-300">Custo Total 13º</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans text-slate-200">
              {obraBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Nenhum colaborador alocado em canteiros de obra no momento.
                  </td>
                </tr>
              ) : (
                obraBreakdown.map((item) => (
                  <tr key={item.obraCode} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-cyan-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {item.obraCode}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">
                      <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60">
                        {item.workerCount} func.
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                      {formatCurrency(item.total1aParcela)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-blue-300">
                      {formatCurrency(item.total2aParcelaNet)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-400 font-semibold">
                      {item.inssRetido > 0 ? `-${formatCurrency(item.inssRetido)}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-purple-400">
                      {item.porForaNet > 0 ? formatCurrency(item.porForaNet) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300 bg-slate-900/40">
                      {formatCurrency(item.totalNet)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {onNavigateToTab && (
                        <button
                          onClick={() => onNavigateToTab('rh-calculo')}
                          className="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          Conferir
                        </button>
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
