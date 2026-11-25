import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { calculateLaborCost } from '../../services/laborCostIntegrity';
import { FieldWorker, WorkerTimeLog, Unit, Contract, OvertimeCalculationRules } from '../../types';
import {
  DollarSign,
  TrendingUp,
  Clock,
  Calendar,
  Building,
  Users,
  Download,
  Printer,
  PieChart,
  BarChart3,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';

interface DailyLaborCostDashboardProps {
  organizationId: string;
  units: Unit[];
  contracts: Contract[];
  canViewFinancials?: boolean;
  onOpenShiftConfig?: () => void;
}

export const DailyLaborCostDashboard: React.FC<DailyLaborCostDashboardProps> = ({
  organizationId,
  units,
  contracts,
  canViewFinancials = true,
  onOpenShiftConfig,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedSite, setSelectedSite] = useState<string>('todos');
  const [timeLogs, setTimeLogs] = useState<WorkerTimeLog[]>([]);
  const [workers, setWorkers] = useState<FieldWorker[]>([]);
  const [rules, setRules] = useState<OvertimeCalculationRules | null>(null);

  // Load all workers for the organization
  useEffect(() => {
    if (!organizationId) return;
    const qW = query(collection(db, 'field_workers'), where('orgId', '==', organizationId));
    const unsub = onSnapshot(qW, (snap) => {
      setWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FieldWorker)));
    });
    return () => unsub();
  }, [organizationId]);

  // Load calculation rules for the organization
  useEffect(() => {
    if (!organizationId) return;
    const unsub = onSnapshot(doc(db, 'overtime_rules', organizationId), (snap) => {
      if (snap.exists()) {
        setRules(snap.data() as OvertimeCalculationRules);
      }
    });
    return () => unsub();
  }, [organizationId]);

  // Fast worker lookup map
  const workerMap = useMemo(() => {
    const map = new Map<string, FieldWorker>();
    workers.forEach((w) => map.set(w.id, w));
    return map;
  }, [workers]);

  // Load time logs for selected date (or all dates if desired)
  useEffect(() => {
    if (!organizationId) return;
    const qLogs = query(
      collection(db, 'worker_time_logs'),
      where('orgId', '==', organizationId),
      where('date', '==', selectedDate)
    );
    const unsub = onSnapshot(qLogs, (snap) => {
      setTimeLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkerTimeLog)));
    });
    return () => unsub();
  }, [organizationId, selectedDate]);

  // Demo personnel never enters production cost or productivity totals.
  const operationalLogs = useMemo(
    () => timeLogs.filter((log) => workerMap.get(log.workerId)?.isDemo !== true),
    [timeLogs, workerMap],
  );

  // Filter logs by selected site
  const filteredLogs = useMemo(() => {
    if (selectedSite === 'todos') return operationalLogs;
    return operationalLogs.filter((l) =>
      (l.siteName || '').toLowerCase().includes(selectedSite.toLowerCase())
    );
  }, [operationalLogs, selectedSite]);

  const calculateLogCost = (log: WorkerTimeLog) => {
    const worker = workerMap.get(log.workerId);
    return calculateLaborCost({
      logHourlyRate: log.hourlyRate,
      workerHourlyRate: worker?.hourlyRate,
      normalHours: log.normalHours,
      overtime50Hours: log.overtime50Hours,
      overtime100Hours: log.overtime100Hours,
      travelHours: log.travelHours,
      nightShiftHours: log.nightShiftHours,
      mealAllowance: log.mealAllowance,
      lodgingAllowance: log.lodgingAllowance,
      otherExpenses: log.otherExpenses,
      overtime50Multiplier: worker?.customCalculationRules?.overtime50Multiplier ?? rules?.overtime50Multiplier ?? 1.5,
      overtime100Multiplier: worker?.customCalculationRules?.overtime100Multiplier ?? rules?.overtime100Multiplier ?? 2.0,
      travelHourMultiplier: worker?.customCalculationRules?.travelHourMultiplier ?? rules?.travelHourMultiplier ?? 1.0,
      nightShiftBonusPercent: worker?.customCalculationRules?.nightShiftBonusPercent ?? rules?.nightShiftBonusPercent ?? 20,
      recordedTotal: log.totalLaborCost,
    });
  };

  // Financial computation only uses recorded or source-backed hourly rates.
  const totals = useMemo(() => {
    let baseSalaryCost = 0;
    let ot50Cost = 0;
    let ot100Cost = 0;
    let travelCost = 0;
    let nightShiftCost = 0;
    let allowancesCost = 0;
    let totalLaborCost = 0;
    let totalNormalHours = 0;
    let totalOt50Hours = 0;
    let totalOt100Hours = 0;
    let totalTravelHours = 0;
    let unpricedHours = 0;
    let missingRateCount = 0;
    let unclassifiedRecordedCost = 0;

    filteredLogs.forEach((log) => {
      const cost = calculateLogCost(log);
      baseSalaryCost += cost.baseSalaryCost;
      ot50Cost += cost.overtime50Cost;
      ot100Cost += cost.overtime100Cost;
      travelCost += cost.travelCost;
      nightShiftCost += cost.nightShiftCost;
      allowancesCost += cost.allowancesCost;
      totalLaborCost += cost.totalLaborCost;
      unpricedHours += cost.unpricedHours;
      missingRateCount += cost.hasMissingHourlyRate ? 1 : 0;
      unclassifiedRecordedCost += cost.unclassifiedRecordedCost;
      totalNormalHours += Number(log.normalHours) || 0;
      totalOt50Hours += Number(log.overtime50Hours) || 0;
      totalOt100Hours += Number(log.overtime100Hours) || 0;
      totalTravelHours += Number(log.travelHours) || 0;
    });

    return {
      baseSalaryCost, ot50Cost, ot100Cost, travelCost, nightShiftCost, allowancesCost,
      totalLaborCost, totalNormalHours, totalOt50Hours, totalOt100Hours, totalTravelHours,
      workerCount: filteredLogs.length, unpricedHours, missingRateCount, unclassifiedRecordedCost,
    };
  }, [filteredLogs, workerMap, rules]);

  // Group all operational logs by project / site, independently of the selected site filter.
  const costsByProject = useMemo(() => {
    const map: Record<string, {
      siteName: string;
      totalCost: number;
      baseCost: number;
      overtimeCost: number;
      travelCost: number;
      allowancesCost: number;
      workersCount: number;
      totalHours: number;
      unpricedHours: number;
      missingRateCount: number;
    }> = {};

    operationalLogs.forEach((log) => {
      const site = log.siteName || 'Obra sem identificação';
      if (!map[site]) {
        map[site] = {
          siteName: site, totalCost: 0, baseCost: 0, overtimeCost: 0, travelCost: 0,
          allowancesCost: 0, workersCount: 0, totalHours: 0, unpricedHours: 0, missingRateCount: 0,
        };
      }
      const cost = calculateLogCost(log);
      map[site].totalCost += cost.totalLaborCost;
      map[site].baseCost += cost.baseSalaryCost;
      map[site].overtimeCost += cost.overtime50Cost + cost.overtime100Cost;
      map[site].travelCost += cost.travelCost;
      map[site].allowancesCost += cost.allowancesCost;
      map[site].workersCount += 1;
      map[site].totalHours += cost.totalHours;
      map[site].unpricedHours += cost.unpricedHours;
      map[site].missingRateCount += cost.hasMissingHourlyRate ? 1 : 0;
    });

    return Object.values(map).sort((a, b) => b.totalCost - a.totalCost);
  }, [operationalLogs, workerMap, rules]);

  // Export summary to CSV
  const handleExportSummaryCSV = () => {
    const headers = [
      'Data', 'Obra / Projeto', 'Colaborador', 'Cargo', 'Valor Hora (R$)',
      'Horas Normais', 'Custo Base (R$)', 'HE 50%', 'Custo HE 50% (R$)',
      'HE 100%', 'Custo HE 100% (R$)', 'Hora Viagem', 'Custo Viagem (R$)',
      'Diárias & Hospedagem (R$)', 'Custo Total Força de Trabalho (R$)', 'Status do custo',
    ];

    const csvData = filteredLogs.map((log) => {
      const cost = calculateLogCost(log);
      return [
        selectedDate, `"${log.siteName}"`, `"${log.workerName}"`, `"${log.role}"`,
        cost.hourlyRate === null ? '' : cost.hourlyRate.toFixed(2),
        log.normalHours,
        cost.hourlyRate === null ? '' : cost.baseSalaryCost.toFixed(2),
        log.overtime50Hours,
        cost.hourlyRate === null ? '' : cost.overtime50Cost.toFixed(2),
        log.overtime100Hours,
        cost.hourlyRate === null ? '' : cost.overtime100Cost.toFixed(2),
        log.travelHours,
        cost.hourlyRate === null ? '' : cost.travelCost.toFixed(2),
        cost.allowancesCost.toFixed(2),
        cost.totalLaborCost.toFixed(2),
        cost.hasMissingHourlyRate ? (cost.unclassifiedRecordedCost > 0 ? 'Valor total registrado; taxa ausente' : 'Sem taxa horária; horas não custeadas') : 'Custeio com taxa cadastrada',
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\\uFEFF' + [headers.join(';'), ...csvData.map((row) => row.join(';'))].join('\\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Relatorio_Custo_MaoDeObra_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export summary to CSV

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Top Filter and Actions Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-slate-300">Data de Apuração:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono cursor-pointer"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-300">Filtrar Projeto / Obra:</span>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white cursor-pointer"
            >
              <option value="todos">Todos os Projetos</option>
              <option value="CD Marília (BMDV)">CD Marília (BMDV)</option>
              <option value="Oficina Central de Caldeiraria">Oficina Central de Caldeiraria</option>
              <option value="Obra Montagem Inox Planta 2">Obra Montagem Inox Planta 2</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          {onOpenShiftConfig && (
            <button
              onClick={onOpenShiftConfig}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold cursor-pointer transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Configurar Turnos & Regras de HE</span>
            </button>
          )}

          <button
            onClick={handleExportSummaryCSV}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold cursor-pointer transition-colors"
            title="Exportar CSV analítico"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow cursor-pointer transition-colors"
            title="Imprimir relatório"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {totals.missingRateCount > 0 && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-xs text-amber-100 space-y-1">
          <strong>{totals.missingRateCount} apontamento(s) sem taxa horária válida.</strong>
          <p>
            {totals.unpricedHours.toFixed(1)}h não foram custeadas por falta de valor-hora.
            {totals.unclassifiedRecordedCost > 0
              ? ` R$ ${totals.unclassifiedRecordedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} têm valor total registrado, mas não possuem composição por taxa.`
              : ' Os totais não incluem essas horas como custo salarial.'}
          </p>
        </div>
      )}

      {/* KPI Cards: Big Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Custo Força de Trabalho */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/70 to-slate-900 border border-emerald-800/60 shadow-lg space-y-1 col-span-1 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider">
              Custo Total Força de Trabalho
            </span>
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <strong className="text-xl sm:text-2xl font-mono font-black text-white block">
            {canViewFinancials
              ? `R$ ${totals.totalLaborCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'R$ ••••••'}
          </strong>
          <span className="text-[10px] text-slate-400 block">
            {totals.workerCount} colaboradores apurados no dia
          </span>
        </div>

        {/* Salário Base (Horas Normais) */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">
              1. Salário Base (Horas Normais)
            </span>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Briefcase className="w-4 h-4" />
            </span>
          </div>
          <strong className="text-lg font-mono font-bold text-slate-100 block">
            {canViewFinancials
              ? `R$ ${totals.baseSalaryCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'R$ ••••••'}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            {totals.totalNormalHours.toFixed(1)} horas contratuais
          </span>
        </div>

        {/* Incidência Horas Extras 50% & 100% */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-amber-400 font-semibold uppercase">
              2. Incidência Horas Extras
            </span>
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <strong className="text-lg font-mono font-bold text-amber-300 block">
            {canViewFinancials
              ? `R$ ${(totals.ot50Cost + totals.ot100Cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'R$ ••••••'}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            HE 50%: {totals.totalOt50Hours.toFixed(1)}h • HE 100%: {totals.totalOt100Hours.toFixed(1)}h
          </span>
        </div>

        {/* Horas de Viagem & Deslocamento */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-blue-400 font-semibold uppercase">
              3. Horas de Viagem (Deslocamento)
            </span>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <strong className="text-lg font-mono font-bold text-blue-300 block">
            {canViewFinancials
              ? `R$ ${totals.travelCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'R$ ••••••'}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            {totals.totalTravelHours.toFixed(1)}h em trânsito entre plantas
          </span>
        </div>

        {/* Diárias, Alimentação & Hospedagem */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-purple-400 font-semibold uppercase">
              4. Diárias & Despesas de Campo
            </span>
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <strong className="text-lg font-mono font-bold text-purple-300 block">
            {canViewFinancials
              ? `R$ ${totals.allowancesCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'R$ ••••••'}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            Alimentação + Hospedagem técnica
          </span>
        </div>
      </div>

      {/* Visual Breakdown Bar */}
      {totals.totalLaborCost > 0 && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center space-x-1.5">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>Composição da Força de Trabalho no Dia</span>
            </span>
            <span className="text-slate-400 text-[11px]">
              Total 100% = R$ {totals.totalLaborCost.toFixed(2)}
            </span>
          </div>

          {/* Stacked Percentage Bar */}
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${(totals.baseSalaryCost / totals.totalLaborCost) * 100}%` }}
              className="bg-blue-500 h-full transition-all"
              title={`Salário Base: ${(totals.baseSalaryCost / totals.totalLaborCost * 100).toFixed(1)}%`}
            />
            <div
              style={{ width: `${((totals.ot50Cost + totals.ot100Cost) / totals.totalLaborCost) * 100}%` }}
              className="bg-amber-500 h-full transition-all"
              title={`Horas Extras: ${((totals.ot50Cost + totals.ot100Cost) / totals.totalLaborCost * 100).toFixed(1)}%`}
            />
            <div
              style={{ width: `${(totals.travelCost / totals.totalLaborCost) * 100}%` }}
              className="bg-cyan-500 h-full transition-all"
              title={`Horas Viagem: ${(totals.travelCost / totals.totalLaborCost * 100).toFixed(1)}%`}
            />
            <div
              style={{ width: `${(totals.allowancesCost / totals.totalLaborCost) * 100}%` }}
              className="bg-purple-500 h-full transition-all"
              title={`Diárias / Despesas: ${(totals.allowancesCost / totals.totalLaborCost * 100).toFixed(1)}%`}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Salário Base: R$ {totals.baseSalaryCost.toFixed(2)} ({((totals.baseSalaryCost / totals.totalLaborCost) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Horas Extras (50%+100%): R$ {(totals.ot50Cost + totals.ot100Cost).toFixed(2)} ({(((totals.ot50Cost + totals.ot100Cost) / totals.totalLaborCost) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
              <span>Horas Viagem: R$ {totals.travelCost.toFixed(2)} ({((totals.travelCost / totals.totalLaborCost) * 100).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>Diárias/Hospedagem: R$ {totals.allowancesCost.toFixed(2)} ({((totals.allowancesCost / totals.totalLaborCost) * 100).toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Custos por Projeto / Obra */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-amber-400" />
            <h4 className="font-bold text-white text-xs uppercase tracking-wide">
              Distribuição de Custo por Projeto / Obra no Dia
            </h4>
          </div>
          <span className="text-[11px] text-slate-400">
            {costsByProject.length} projetos com força de trabalho alocada
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {costsByProject.map((p) => {
            const sharePercent = totals.totalLaborCost > 0 ? (p.totalCost / totals.totalLaborCost) * 100 : 0;
            return (
              <div
                key={p.siteName}
                onClick={() => setSelectedSite(p.siteName)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                  selectedSite === p.siteName
                    ? 'bg-blue-950/30 border-blue-600 shadow-md ring-1 ring-blue-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <strong className="text-white text-xs block font-bold">{p.siteName}</strong>
                    <span className="text-[10px] text-slate-400">
                      {p.workersCount} profissionais • {p.totalHours.toFixed(1)}h totais
                    </span>
                    {p.unpricedHours > 0 && (
                      <span className="text-[10px] text-amber-300 block">{p.unpricedHours.toFixed(1)}h sem taxa horária</span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {sharePercent.toFixed(1)}% do dia
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-slate-400">Total do Projeto:</span>
                  <strong className="text-base font-mono font-bold text-emerald-400">
                    {canViewFinancials
                      ? `R$ ${p.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : 'R$ ••••••'}
                  </strong>
                </div>

                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, sharePercent)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1 text-[9px] text-slate-400 font-mono border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">Base:</span>
                    R$ {p.baseCost.toFixed(0)}
                  </div>
                  <div>
                    <span className="text-amber-500 block">Extras:</span>
                    R$ {p.overtimeCost.toFixed(0)}
                  </div>
                  <div>
                    <span className="text-blue-500 block">Viagem:</span>
                    R$ {p.travelCost.toFixed(0)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Table: Collaborator Cost Breakdown */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wide">
              Detalhamento de Custo por Colaborador & Frentes de Trabalho
            </h4>
            <span className="text-[11px] text-slate-400">
              Soma analítica de salários e incidências registradas no dia {selectedDate}.
            </span>
          </div>

          <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
            Total Linhas: {filteredLogs.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Colaborador & Função</th>
                <th className="py-2.5 px-3">Projeto / Obra</th>
                <th className="py-2.5 px-2 text-right">Taxa/Hora</th>
                <th className="py-2.5 px-2 text-right">Custo Base (HN)</th>
                <th className="py-2.5 px-2 text-right text-amber-300">Incid. HE 50%</th>
                <th className="py-2.5 px-2 text-right text-red-300">Incid. HE 100%</th>
                <th className="py-2.5 px-2 text-right text-blue-300">Hora Viagem</th>
                <th className="py-2.5 px-2 text-right text-purple-300">Diárias</th>
                <th className="py-2.5 px-3 text-right">Custo Total Dia</th>
                <th className="py-2.5 px-3">Atividades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 text-xs">
                    Nenhum apontamento registrado para a data {selectedDate} no projeto selecionado.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const cost = calculateLogCost(log);

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <strong className="text-white block font-medium">{log.workerName}</strong>
                        <span className="text-[10px] text-slate-400 block">{log.role}</span>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300 font-medium">
                        {log.siteName}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                        {canViewFinancials ? (cost.hourlyRate === null ? 'Sem taxa' : `R$ ${cost.hourlyRate.toFixed(2)}`) : 'R$ ••'}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-slate-200">
                        {canViewFinancials ? (cost.hourlyRate === null ? '—' : `R$ ${cost.baseSalaryCost.toFixed(2)}`) : 'R$ ••'}
                        <span className="text-[9px] text-slate-500 block">({log.normalHours}h)</span>
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-amber-300">
                        {canViewFinancials ? (cost.hourlyRate === null ? '—' : `R$ ${cost.overtime50Cost.toFixed(2)}`) : 'R$ ••'}
                        {log.overtime50Hours > 0 && (
                          <span className="text-[9px] text-amber-500 block">({log.overtime50Hours}h)</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-red-300">
                        {canViewFinancials ? (cost.hourlyRate === null ? '—' : `R$ ${cost.overtime100Cost.toFixed(2)}`) : 'R$ ••'}
                        {log.overtime100Hours > 0 && (
                          <span className="text-[9px] text-red-500 block">({log.overtime100Hours}h)</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-blue-300">
                        {canViewFinancials ? (cost.hourlyRate === null ? '—' : `R$ ${cost.travelCost.toFixed(2)}`) : 'R$ ••'}
                        {log.travelHours > 0 && (
                          <span className="text-[9px] text-blue-500 block">({log.travelHours}h)</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-purple-300">
                        {canViewFinancials ? `R$ ${cost.allowancesCost.toFixed(2)}` : 'R$ ••'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        {canViewFinancials ? `R$ ${cost.totalLaborCost.toFixed(2)}` : 'R$ •••••'}
                      </td>

                      <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-xs truncate" title={log.activities}>
                        {log.activities || 'Atividades regulares de canteiro'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredLogs.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 border-t-2 border-slate-700 font-bold text-white text-xs">
                  <td colSpan={3} className="py-3 px-3">
                    TOTAL GERAL CONSOLIDADO ({filteredLogs.length} profissionais)
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-slate-200">
                    R$ {totals.baseSalaryCost.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-amber-300">
                    R$ {totals.ot50Cost.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-red-300">
                    R$ {totals.ot100Cost.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-blue-300">
                    R$ {totals.travelCost.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-purple-300">
                    R$ {totals.allowancesCost.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400 text-sm">
                    R$ {totals.totalLaborCost.toFixed(2)}
                  </td>
                  <td className="py-3 px-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
