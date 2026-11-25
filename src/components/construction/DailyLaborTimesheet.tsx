import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { FieldWorker, WorkerTimeLog, Unit, Contract, OvertimeCalculationRules } from '../../types';
import {
  Clock,
  Calendar,
  Building,
  Save,
  Download,
  FileSpreadsheet,
  Zap,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Sparkles,
  Info,
  BarChart3,
  Settings,
  Upload,
  Users,
  Layers,
  Filter,
  CheckSquare,
  Square,
  X,
  Plus,
  FileUp,
} from 'lucide-react';

interface DailyLaborTimesheetProps {
  organizationId: string;
  units: Unit[];
  contracts: Contract[];
  canViewFinancials?: boolean;
  currentUserEmail?: string;
  onOpenShiftConfig?: () => void;
  onGoToCostDashboard?: () => void;
}

interface TimesheetRow {
  workerId: string;
  workerName: string;
  role: string;
  hourlyRate: number;
  normalHours: number;
  overtime50Hours: number;
  overtime100Hours: number;
  travelHours: number;
  nightShiftHours: number;
  mealAllowance: number;
  lodgingAllowance: number;
  otherExpenses: number;
  activities: string;
  existingLogId?: string;
}

export const DailyLaborTimesheet: React.FC<DailyLaborTimesheetProps> = ({
  organizationId,
  units,
  contracts,
  canViewFinancials = true,
  currentUserEmail = 'Encarregado de Obra',
  onOpenShiftConfig,
  onGoToCostDashboard,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedSite, setSelectedSite] = useState<string>('CD Marília (BMDV)');
  const [workers, setWorkers] = useState<FieldWorker[]>([]);
  const [rules, setRules] = useState<OvertimeCalculationRules | null>(null);
  const [timeLogs, setTimeLogs] = useState<WorkerTimeLog[]>([]);
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Batch Hour Assignment State (Deixados limpos para digitação pelo usuário)
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchScope, setBatchScope] = useState<'obra' | 'equipe' | 'colaborador'>('obra');
  const [batchRole, setBatchRole] = useState<string>('');
  const [batchWorkerIds, setBatchWorkerIds] = useState<string[]>([]);
  const [batchWorkerSearch, setBatchWorkerSearch] = useState<string>('');
  const [batchNormalHours, setBatchNormalHours] = useState<string>('');
  const [batchOt50Hours, setBatchOt50Hours] = useState<string>('');
  const [batchOt100Hours, setBatchOt100Hours] = useState<string>('');
  const [batchTravelHours, setBatchTravelHours] = useState<string>('');
  const [batchNightShiftHours, setBatchNightShiftHours] = useState<string>('');
  const [batchMealAllowance, setBatchMealAllowance] = useState<string>('');
  const [batchLodgingAllowance, setBatchLodgingAllowance] = useState<string>('');
  const [batchOtherExpenses, setBatchOtherExpenses] = useState<string>('');
  const [batchActivities, setBatchActivities] = useState<string>('');
  const [batchMode, setBatchMode] = useState<'substituir' | 'somar'>('substituir');

  // Hidden File Input Ref for CSV Upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load workers
  useEffect(() => {
    if (!organizationId) return;
    const qW = query(collection(db, 'field_workers'), where('orgId', '==', organizationId));
    const unsub = onSnapshot(qW, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FieldWorker));
      setWorkers(list.filter((w) => w.status === 'ativo' && w.isDemo !== true));
    });
    return () => unsub();
  }, [organizationId]);

  // Load time logs for selected date & site
  useEffect(() => {
    if (!organizationId) return;
    const qLogs = query(
      collection(db, 'worker_time_logs'),
      where('orgId', '==', organizationId),
      where('date', '==', selectedDate)
    );
    const unsub = onSnapshot(qLogs, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkerTimeLog));
      setTimeLogs(list);
    });
    return () => unsub();
  }, [organizationId, selectedDate]);

  // Sync rows when workers or timeLogs change
  useEffect(() => {
    if (workers.length === 0) return;

    // Filter workers by currentSite or include active workers
    const siteWorkers = workers.filter(
      (w) => selectedSite === 'todas' || w.currentSite.toLowerCase().includes(selectedSite.toLowerCase()) || selectedSite.includes(w.currentSite)
    );

    const targetWorkers = siteWorkers.length > 0 ? siteWorkers : workers;

    const initialRows: TimesheetRow[] = targetWorkers.map((w) => {
      const existing = timeLogs.find((l) => l.workerId === w.id);
      if (existing) {
        return {
          workerId: w.id,
          workerName: w.name,
          role: w.role,
          hourlyRate: w.hourlyRate || 0,
          normalHours: existing.normalHours,
          overtime50Hours: existing.overtime50Hours,
          overtime100Hours: existing.overtime100Hours,
          travelHours: existing.travelHours,
          nightShiftHours: existing.nightShiftHours,
          mealAllowance: existing.mealAllowance,
          lodgingAllowance: existing.lodgingAllowance,
          otherExpenses: existing.otherExpenses,
          activities: existing.activities || '',
          existingLogId: existing.id,
        };
      }
      return {
        workerId: w.id,
        workerName: w.name,
        role: w.role,
        hourlyRate: w.hourlyRate || 0,
        normalHours: 0,
        overtime50Hours: 0,
        overtime100Hours: 0,
        travelHours: 0,
        nightShiftHours: 0,
        mealAllowance: 0,
        lodgingAllowance: 0,
        otherExpenses: 0,
        activities: '',
      };
    });

    setRows(initialRows);
  }, [workers, timeLogs, selectedSite]);

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

  // Helper to calculate total day cost for a single row
  const calculateRowCost = (r: TimesheetRow): number => {
    const rate = r.hourlyRate || 0;
    const worker = workers.find((w) => w.id === r.workerId);
    const ot50Mul = worker?.customCalculationRules?.overtime50Multiplier ?? rules?.overtime50Multiplier ?? 1.5;
    const ot100Mul = worker?.customCalculationRules?.overtime100Multiplier ?? rules?.overtime100Multiplier ?? 2.0;
    const travelMul = worker?.customCalculationRules?.travelHourMultiplier ?? rules?.travelHourMultiplier ?? 1.0;
    const nightShiftBonusPercent = worker?.customCalculationRules?.nightShiftBonusPercent ?? rules?.nightShiftBonusPercent ?? 20;
    const nightShiftMul = nightShiftBonusPercent / 100;

    const normalCost = r.normalHours * rate;
    const ot50Cost = r.overtime50Hours * rate * ot50Mul;
    const ot100Cost = r.overtime100Hours * rate * ot100Mul;
    const travelCost = r.travelHours * rate * travelMul;
    const nightShiftCost = r.nightShiftHours * rate * nightShiftMul;
    const allowances = (r.mealAllowance || 0) + (r.lodgingAllowance || 0) + (r.otherExpenses || 0);

    return Number((normalCost + ot50Cost + ot100Cost + travelCost + nightShiftCost + allowances).toFixed(2));
  };

  // Update a field in a row
  const updateRow = (index: number, field: keyof TimesheetRow, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Fill 8h standard for all
  const handleFillStandardHours = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        normalHours: 8,
        overtime50Hours: 0,
        overtime100Hours: 0,
        travelHours: 0,
        nightShiftHours: 0,
      }))
    );
  };

  // Load realistic simulation (with OT 50%, travel time, etc. from real site)
  const handleLoadSimulation = () => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i === 0) {
          // Gilfran (Serralheiro líder)
          return {
            ...r,
            normalHours: 8,
            overtime50Hours: 2.5,
            overtime100Hours: 0,
            travelHours: 2.0,
            nightShiftHours: 0,
            mealAllowance: 45,
            lodgingAllowance: 120, // hospedagem dupla técnica
            activities: 'Manutenção dos ralos da reembalagem CD Marília (BMDV) e medição',
          };
        }
        if (i === 1) {
          // Soldador TIG
          return {
            ...r,
            normalHours: 8,
            overtime50Hours: 2.5,
            overtime100Hours: 0,
            travelHours: 2.0,
            nightShiftHours: 0,
            mealAllowance: 45,
            lodgingAllowance: 120,
            activities: 'Solda TIG em aço inox dos ralos e acabamento sanitário',
          };
        }
        return {
          ...r,
          normalHours: 8,
          overtime50Hours: 1.0,
          overtime100Hours: 0,
          travelHours: 1.0,
          nightShiftHours: 0,
          mealAllowance: 35,
          lodgingAllowance: 0,
          activities: 'Apoio de caldeiraria e preparação de materiais',
        };
      })
    );
  };

  // Save timesheet to Firestore
  const handleSaveTimesheet = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      for (const r of rows) {
        const cost = calculateRowCost(r);
        const logId = r.existingLogId || `log_${selectedDate}_${r.workerId}_${organizationId}`;

        const logData: WorkerTimeLog = {
          id: logId,
          orgId: organizationId,
          workerId: r.workerId,
          workerName: r.workerName,
          role: r.role,
          date: selectedDate,
          siteName: selectedSite,
          normalHours: Number(r.normalHours) || 0,
          overtime50Hours: Number(r.overtime50Hours) || 0,
          overtime100Hours: Number(r.overtime100Hours) || 0,
          travelHours: Number(r.travelHours) || 0,
          nightShiftHours: Number(r.nightShiftHours) || 0,
          mealAllowance: Number(r.mealAllowance) || 0,
          lodgingAllowance: Number(r.lodgingAllowance) || 0,
          otherExpenses: Number(r.otherExpenses) || 0,
          hourlyRate: r.hourlyRate,
          totalLaborCost: cost,
          activities: r.activities.trim(),
          registeredBy: currentUserEmail,
          createdAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'worker_time_logs', logId), logData);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Erro ao salvar apontamentos:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Export to CSV (clean spreadsheet replacement)
  const handleExportCSV = () => {
    const headers = [
      'Data',
      'Obra / Planta',
      'Colaborador',
      'Cargo',
      'Valor Hora (R$)',
      'Horas Normais',
      'HE 50%',
      'HE 100%',
      'Hora Viagem',
      'Adicional Noturno (h)',
      'Diárias Alimentação (R$)',
      'Hospedagem (R$)',
      'Custo Total Dia (R$)',
      'Atividades Executadas',
    ];

    const csvRows = rows.map((r) => [
      selectedDate,
      `"${selectedSite}"`,
      `"${r.workerName}"`,
      `"${r.role}"`,
      r.hourlyRate.toFixed(2),
      r.normalHours,
      r.overtime50Hours,
      r.overtime100Hours,
      r.travelHours,
      r.nightShiftHours,
      r.mealAllowance.toFixed(2),
      r.lodgingAllowance.toFixed(2),
      calculateRowCost(r).toFixed(2),
      `"${r.activities.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...csvRows.map((e) => e.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Diario_Obra_Apontamento_${selectedSite.replace(/\s+/g, '_')}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Distinct roles for "Por Equipe"
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.role) set.add(r.role);
    });
    return Array.from(set);
  }, [rows]);

  // Target count preview for batch application
  const targetCountPreview = useMemo(() => {
    if (batchScope === 'obra') return rows.length;
    if (batchScope === 'equipe') {
      if (!batchRole) return rows.length;
      return rows.filter((r) => r.role.toLowerCase().includes(batchRole.toLowerCase())).length;
    }
    return batchWorkerIds.length;
  }, [batchScope, batchRole, batchWorkerIds, rows]);

  // Batch hour assigner (Por Obra, Por Equipe, Por Colaborador)
  const handleApplyBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const normal = Number(batchNormalHours) || 0;
    const ot50 = Number(batchOt50Hours) || 0;
    const ot100 = Number(batchOt100Hours) || 0;
    const travel = Number(batchTravelHours) || 0;
    const night = Number(batchNightShiftHours) || 0;
    const meal = Number(batchMealAllowance) || 0;
    const lodging = Number(batchLodgingAllowance) || 0;
    const other = Number(batchOtherExpenses) || 0;
    const act = batchActivities.trim();

    let count = 0;
    setRows((prev) =>
      prev.map((r) => {
        let matches = false;
        if (batchScope === 'obra') {
          matches = true;
        } else if (batchScope === 'equipe') {
          matches = batchRole ? r.role.toLowerCase().includes(batchRole.toLowerCase()) : true;
        } else if (batchScope === 'colaborador') {
          matches = batchWorkerIds.includes(r.workerId);
        }

        if (!matches) return r;
        count++;

        if (batchMode === 'somar') {
          return {
            ...r,
            normalHours: r.normalHours + normal,
            overtime50Hours: r.overtime50Hours + ot50,
            overtime100Hours: r.overtime100Hours + ot100,
            travelHours: r.travelHours + travel,
            nightShiftHours: r.nightShiftHours + night,
            mealAllowance: meal > 0 ? meal : r.mealAllowance,
            lodgingAllowance: lodging > 0 ? lodging : r.lodgingAllowance,
            otherExpenses: r.otherExpenses + other,
            activities: act ? (r.activities ? `${r.activities}; ${act}` : act) : r.activities,
          };
        }

        return {
          ...r,
          normalHours: normal,
          overtime50Hours: ot50,
          overtime100Hours: ot100,
          travelHours: travel,
          nightShiftHours: night,
          mealAllowance: meal,
          lodgingAllowance: lodging,
          otherExpenses: other,
          activities: act || r.activities,
        };
      })
    );

    setShowBatchModal(false);
    setBatchNotice(`Lançamento em lote realizado com sucesso para ${count} colaborador(es)!`);
    setTimeout(() => setBatchNotice(null), 5000);
  };

  // Upload and parse CSV (Excel)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) return;

        // Auto-detect delimiter (; or ,)
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map((h) => h.replace(/"/g, '').trim().toLowerCase());

        const nameIdx = headers.findIndex((h) => h.includes('colaborador') || h.includes('nome') || h.includes('funcionario'));
        const normalIdx = headers.findIndex((h) => h.includes('normal') || h === 'h. norm' || h === 'normais');
        const ot50Idx = headers.findIndex((h) => h.includes('50%') || h.includes('he 50'));
        const ot100Idx = headers.findIndex((h) => h.includes('100%') || h.includes('he 100'));
        const travelIdx = headers.findIndex((h) => h.includes('viagem') || h.includes('deslocamento'));
        const nightIdx = headers.findIndex((h) => h.includes('noturno') || h.includes('adicional noturno'));
        const mealIdx = headers.findIndex((h) => h.includes('refeicao') || h.includes('alimentacao') || h.includes('diaria'));
        const lodgingIdx = headers.findIndex((h) => h.includes('hospedagem') || h.includes('alojamento'));
        const actIdx = headers.findIndex((h) => h.includes('atividade') || h.includes('tarefa') || h.includes('descricao'));

        let updatedCount = 0;
        setRows((prev) => {
          const next = [...prev];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(delimiter).map((c) => c.replace(/"/g, '').trim());
            if (cols.length < 2) continue;

            const nameVal = nameIdx >= 0 ? cols[nameIdx]?.toLowerCase() : '';
            if (!nameVal) continue;

            const rowIdx = next.findIndex(
              (r) => r.workerName.toLowerCase().includes(nameVal) || nameVal.includes(r.workerName.toLowerCase())
            );
            if (rowIdx >= 0) {
              const current = next[rowIdx];
              next[rowIdx] = {
                ...current,
                normalHours: normalIdx >= 0 && cols[normalIdx] ? parseFloat(cols[normalIdx].replace(',', '.')) || current.normalHours : current.normalHours,
                overtime50Hours: ot50Idx >= 0 && cols[ot50Idx] ? parseFloat(cols[ot50Idx].replace(',', '.')) || 0 : current.overtime50Hours,
                overtime100Hours: ot100Idx >= 0 && cols[ot100Idx] ? parseFloat(cols[ot100Idx].replace(',', '.')) || 0 : current.overtime100Hours,
                travelHours: travelIdx >= 0 && cols[travelIdx] ? parseFloat(cols[travelIdx].replace(',', '.')) || 0 : current.travelHours,
                nightShiftHours: nightIdx >= 0 && cols[nightIdx] ? parseFloat(cols[nightIdx].replace(',', '.')) || 0 : current.nightShiftHours,
                mealAllowance: mealIdx >= 0 && cols[mealIdx] ? parseFloat(cols[mealIdx].replace(',', '.')) || 0 : current.mealAllowance,
                lodgingAllowance: lodgingIdx >= 0 && cols[lodgingIdx] ? parseFloat(cols[lodgingIdx].replace(',', '.')) || 0 : current.lodgingAllowance,
                activities: actIdx >= 0 && cols[actIdx] ? cols[actIdx] : current.activities,
              };
              updatedCount++;
            }
          }
          return next;
        });

        setBatchNotice(`Planilha importada com sucesso! ${updatedCount} colaboradores atualizados na grade.`);
        setTimeout(() => setBatchNotice(null), 5000);
      } catch (err) {
        console.error('Erro ao ler CSV:', err);
        alert('Erro ao processar planilha CSV. Verifique a formatação do arquivo.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Download template CSV for offline filling
  const handleDownloadTemplateCSV = () => {
    const headers = [
      'Colaborador',
      'Cargo',
      'Horas Normais',
      'HE 50%',
      'HE 100%',
      'Horas Viagem',
      'Adicional Noturno (h)',
      'Diaria Alimentacao (R$)',
      'Hospedagem (R$)',
      'Atividades Executadas',
    ];
    const dataRows = rows.map((r) => [
      `"${r.workerName}"`,
      `"${r.role}"`,
      r.normalHours || 8,
      r.overtime50Hours || 0,
      r.overtime100Hours || 0,
      r.travelHours || 0,
      r.nightShiftHours || 0,
      r.mealAllowance || 35,
      r.lodgingAllowance || 0,
      `"${r.activities || 'Manutenção e montagem em campo'}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...dataRows.map((e) => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Modelo_Importacao_Horas_${selectedSite.replace(/\s+/g, '_')}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculations for summary KPI cards
  const totalNormalHours = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.normalHours) || 0), 0), [rows]);
  const totalOt50Hours = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.overtime50Hours) || 0), 0), [rows]);
  const totalOt100Hours = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.overtime100Hours) || 0), 0), [rows]);
  const totalTravelHours = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.travelHours) || 0), 0), [rows]);
  const totalDayCost = useMemo(() => rows.reduce((acc, r) => acc + calculateRowCost(r), 0), [rows]);

  return (
    <div className="space-y-4">
      {/* Excel Comparison Banner */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <strong className="text-white text-sm block">Substituto Ágil da Planilha Excel de Obra</strong>
            <span className="text-slate-400 text-[11px]">
              Cálculo automático de HE 50%, HE 100%, Horas de Viagem, Adicional Noturno e Diárias sem lentidão ou erro de fórmula.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenShiftConfig && (
            <button
              onClick={onOpenShiftConfig}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold cursor-pointer transition-colors"
              title="Configurar turnos de trabalho, regras de HE 50/100%, viagem e adicional noturno"
            >
              <Settings className="w-3.5 h-3.5 text-blue-400" />
              <span>Configurar Regras & Turnos</span>
            </button>
          )}

          {onGoToCostDashboard && (
            <button
              onClick={onGoToCostDashboard}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 font-semibold cursor-pointer transition-colors"
              title="Ir para o Dashboard de Custo Diário da Força de Trabalho"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ver Dashboard de Custos</span>
            </button>
          )}

          <button
            onClick={handleLoadSimulation}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-semibold cursor-pointer transition-colors"
            title="Preencher dados fictícios de demonstração para validar a tela; não usar como apontamento real"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Simular dados de demonstração</span>
          </button>

          <button
            onClick={handleFillStandardHours}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer transition-colors"
            title="Preencher 8 horas normais para todos"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>8h para Todos</span>
          </button>
        </div>
      </div>

      {/* KPI Dashboard da Jornada do Dia */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Horas Normais</span>
          <strong className="text-base text-white font-mono">{totalNormalHours.toFixed(1)}h</strong>
          <span className="text-[10px] text-slate-500 block">Jornada contratual</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[10px] text-amber-400 uppercase font-semibold block">Horas Extras 50%</span>
          <strong className="text-base text-amber-300 font-mono">{totalOt50Hours.toFixed(1)}h</strong>
          <span className="text-[10px] text-slate-500 block">Dias úteis (+50%)</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[10px] text-red-400 uppercase font-semibold block">Horas Extras 100%</span>
          <strong className="text-base text-red-300 font-mono">{totalOt100Hours.toFixed(1)}h</strong>
          <span className="text-[10px] text-slate-500 block">Domingos / Feriados</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[10px] text-blue-400 uppercase font-semibold block">Horas Viagem</span>
          <strong className="text-base text-blue-300 font-mono">{totalTravelHours.toFixed(1)}h</strong>
          <span className="text-[10px] text-slate-500 block">Deslocamento</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Custo Folha do Dia</span>
          <strong className="text-base text-emerald-400 font-mono">
            {canViewFinancials
              ? `R$ ${totalDayCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : 'R$ ••••••'}
          </strong>
          <span className="text-[10px] text-slate-500 block">Com encargos & diárias</span>
        </div>
      </div>

      {/* Date & Site Filter Controls */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 font-semibold">Data do Diário:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white cursor-pointer font-mono"
            />
          </div>

          <div className="flex items-center space-x-1.5">
            <Building className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 font-semibold">Obra / Local:</span>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white cursor-pointer"
            >
              <option value="CD Marília (BMDV)">CD Marília (BMDV)</option>
              <option value="Oficina Central de Caldeiraria">Oficina Central de Caldeiraria</option>
              <option value="Obra Montagem Inox Planta 2">Obra Montagem Inox Planta 2</option>
              <option value="todas">Todos os Locais</option>
            </select>
          </div>
        </div>

        {/* Hidden file input for spreadsheet CSV upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".csv,.txt"
          className="hidden"
        />

        <div className="flex flex-wrap items-center gap-2">
          {/* Subir Horas em Lote (Obra / Equipe / Colaborador) */}
          <button
            onClick={() => setShowBatchModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold shadow cursor-pointer transition-colors"
            title="Subir horas extras, viagens e adicional noturno em lote por obra, por equipe ou por colaborador"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Subir Horas em Lote</span>
          </button>

          {/* Importar Planilha CSV do Excel */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 border border-slate-700 font-semibold cursor-pointer transition-colors"
            title="Subir arquivo de planilha CSV preenchida offline"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Importar CSV</span>
          </button>

          {/* Baixar Modelo CSV */}
          <button
            onClick={handleDownloadTemplateCSV}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold cursor-pointer transition-colors"
            title="Baixar modelo de planilha CSV pré-formatado"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Modelo CSV</span>
          </button>

          {/* Exportar Planilha preenchida */}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer transition-colors"
            title="Exportar planilha formatada em CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Exportar CSV</span>
          </button>

          {/* Salvar Apontamentos */}
          <button
            onClick={handleSaveTimesheet}
            disabled={isSaving}
            className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Gravando...' : 'Salvar Apontamentos do Dia'}</span>
          </button>
        </div>
      </div>

      {/* Batch Notice Banner */}
      {batchNotice && (
        <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{batchNotice}</span>
          </div>
          <button
            onClick={() => setBatchNotice(null)}
            className="text-emerald-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Apontamentos gravados com sucesso! Os custos foram sincronizados com o banco de dados.</span>
        </div>
      )}

      {/* Grid: Timesheet Matrix Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-semibold">
                <th className="py-2.5 px-3 min-w-[160px]">Colaborador & Função</th>
                <th className="py-2.5 px-2 text-center w-16" title="Horas Normais (Turno 8h)">H. Norm</th>
                <th className="py-2.5 px-2 text-center w-16 text-amber-300" title="Horas Extras 50% (dias úteis)">HE 50%</th>
                <th className="py-2.5 px-2 text-center w-16 text-red-300" title="Horas Extras 100% (domingos e feriados)">HE 100%</th>
                <th className="py-2.5 px-2 text-center w-16 text-blue-300" title="Horas de Viagem / Deslocamento">H. Viag</th>
                <th className="py-2.5 px-2 text-center w-16 text-purple-300" title="Adicional Noturno (22h às 05h)">Adic. Not</th>
                <th className="py-2.5 px-2 text-center w-20" title="Diária de Alimentação">Diária Alim.</th>
                <th className="py-2.5 px-2 text-center w-20" title="Diária de Hospedagem">Hospedagem</th>
                <th className="py-2.5 px-3 text-right w-24">Custo Dia</th>
                <th className="py-2.5 px-3 min-w-[200px]">Frentes & Atividades de Campo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 text-xs">
                    Nenhum colaborador encontrado para a obra selecionada. Cadastre colaboradores na aba "Equipe & Salários" ou clique em Simular.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const cost = calculateRowCost(row);
                  return (
                    <tr key={row.workerId} className="hover:bg-slate-800/40 transition-colors">
                      {/* Name & Role */}
                      <td className="py-2.5 px-3">
                        <strong className="text-white block font-medium">{row.workerName}</strong>
                        <span className="text-[10px] text-slate-400 block">{row.role}</span>
                        <span className="text-[9px] text-emerald-400 font-mono">
                          {canViewFinancials ? `R$ ${row.hourlyRate.toFixed(2)}/h` : 'R$ ••/h'}
                        </span>
                      </td>

                      {/* H. Normais */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={row.normalHours}
                          onChange={(e) => updateRow(idx, 'normalHours', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:border-blue-500 text-xs"
                        />
                      </td>

                      {/* HE 50% */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={row.overtime50Hours}
                          onChange={(e) => updateRow(idx, 'overtime50Hours', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 font-mono font-bold focus:border-amber-500 text-xs"
                        />
                      </td>

                      {/* HE 100% */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={row.overtime100Hours}
                          onChange={(e) => updateRow(idx, 'overtime100Hours', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 rounded bg-red-950/40 border border-red-800/60 text-red-300 font-mono font-bold focus:border-red-500 text-xs"
                        />
                      </td>

                      {/* H. Viagem */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={row.travelHours}
                          onChange={(e) => updateRow(idx, 'travelHours', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 rounded bg-blue-950/40 border border-blue-800/60 text-blue-300 font-mono font-bold focus:border-blue-500 text-xs"
                        />
                      </td>

                      {/* Adic. Noturno */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={row.nightShiftHours}
                          onChange={(e) => updateRow(idx, 'nightShiftHours', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 rounded bg-purple-950/40 border border-purple-800/60 text-purple-300 font-mono font-bold focus:border-purple-500 text-xs"
                        />
                      </td>

                      {/* Diária Alimentação */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="5"
                          min="0"
                          value={row.mealAllowance}
                          onChange={(e) => updateRow(idx, 'mealAllowance', parseFloat(e.target.value) || 0)}
                          className="w-16 text-center py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs"
                        />
                      </td>

                      {/* Hospedagem */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="number"
                          step="10"
                          min="0"
                          value={row.lodgingAllowance}
                          onChange={(e) => updateRow(idx, 'lodgingAllowance', parseFloat(e.target.value) || 0)}
                          className="w-16 text-center py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs"
                        />
                      </td>

                      {/* Custo Total Dia */}
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                        {canViewFinancials
                          ? `R$ ${cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : 'R$ •••••'}
                      </td>

                      {/* Atividades */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.activities}
                          onChange={(e) => updateRow(idx, 'activities', e.target.value)}
                          placeholder="Frentes de trabalho / detalhes operacionais..."
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 placeholder:text-slate-600 text-xs focus:border-blue-500"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* MODAL: Lançamento em Lote / Subir Horas em Massa */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8 text-xs text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Layers className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Subir Horas Extras, Viagens & Adicionais em Massa
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Lançamento ágil e simultâneo visando eficiência operacional no canteiro de obras.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBatchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyBatch} className="space-y-4">
              {/* 1. Seleção do Escopo */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5 uppercase text-[10px] tracking-wider">
                  1. Escopo de Aplicação do Lançamento:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchScope('obra')}
                    className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                      batchScope === 'obra'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Building className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <span>Por Obra Inteira</span>
                    <span className="block text-[10px] text-slate-500 font-normal">
                      ({rows.length} colaboradores)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBatchScope('equipe')}
                    className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                      batchScope === 'equipe'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                    <span>Por Equipe / Cargo</span>
                    <span className="block text-[10px] text-slate-500 font-normal">
                      (Caldeiraria, Solda...)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBatchScope('colaborador');
                      if (batchWorkerIds.length === 0 && rows.length > 0) {
                        setBatchWorkerIds([rows[0].workerId]);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                      batchScope === 'colaborador'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                    <span>Por Colaborador</span>
                    <span className="block text-[10px] text-slate-500 font-normal">
                      (Seleção específica)
                    </span>
                  </button>
                </div>
              </div>

              {/* Sub-opções de Escopo */}
              {batchScope === 'obra' && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 flex items-center justify-between">
                  <span>
                    Obra Selecionada: <strong className="text-white">{selectedSite}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {rows.length} colaboradores receberão os lançamentos
                  </span>
                </div>
              )}

              {batchScope === 'equipe' && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                  <label className="block text-slate-300 font-semibold text-[11px]">
                    Selecione a Equipe / Função:
                  </label>
                  <select
                    value={batchRole}
                    onChange={(e) => setBatchRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-medium focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Todas as Funções da Obra ({rows.length} pessoas)</option>
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role} ({rows.filter((r) => r.role.toLowerCase().includes(role.toLowerCase())).length} profissionais)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {batchScope === 'colaborador' && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Selecione os colaboradores desejados ({batchWorkerIds.length} selecionados):
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setBatchWorkerIds(rows.map((r) => r.workerId))}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchWorkerIds([])}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Filtrar por nome do colaborador..."
                    value={batchWorkerSearch}
                    onChange={(e) => setBatchWorkerSearch(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-xs mb-2 focus:outline-none"
                  />

                  <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-slate-800/40">
                    {rows
                      .filter((r) =>
                        batchWorkerSearch.trim()
                          ? r.workerName.toLowerCase().includes(batchWorkerSearch.toLowerCase())
                          : true
                      )
                      .map((r) => {
                        const checked = batchWorkerIds.includes(r.workerId);
                        return (
                          <label
                            key={r.workerId}
                            className="flex items-center space-x-2 py-1 px-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  setBatchWorkerIds((prev) => prev.filter((id) => id !== r.workerId));
                                } else {
                                  setBatchWorkerIds((prev) => [...prev, r.workerId]);
                                }
                              }}
                              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
                            />
                            <span className="font-semibold text-white">{r.workerName}</span>
                            <span className="text-slate-400 text-[10px]">({r.role})</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 2. Modo de Aplicação */}
              <div className="flex items-center space-x-4 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-300">Modo de Aplicação:</span>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="batchMode"
                    value="substituir"
                    checked={batchMode === 'substituir'}
                    onChange={() => setBatchMode('substituir')}
                    className="text-amber-500 cursor-pointer"
                  />
                  <span>Substituir valores existentes</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="batchMode"
                    value="somar"
                    checked={batchMode === 'somar'}
                    onChange={() => setBatchMode('somar')}
                    className="text-amber-500 cursor-pointer"
                  />
                  <span>Somar às horas já lançadas (+ HE / Viagem)</span>
                </label>
              </div>

              {/* 3. Grade de Horas a Lançar */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-200 uppercase text-[10px] tracking-wider">
                  2. Horas e Adicionais a Aplicar na Força de Trabalho:
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Horas Normais (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={batchNormalHours}
                      onChange={(e) => setBatchNormalHours(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-amber-400 mb-1">Horas Extras 50% (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={batchOt50Hours}
                      onChange={(e) => setBatchOt50Hours(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300 font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-red-400 mb-1">Horas Extras 100% (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={batchOt100Hours}
                      onChange={(e) => setBatchOt100Hours(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-red-950/40 border border-red-800/60 text-red-300 font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-blue-400 mb-1">Horas Viagem (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={batchTravelHours}
                      onChange={(e) => setBatchTravelHours(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-blue-950/40 border border-blue-800/60 text-blue-300 font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-purple-400 mb-1">Adic. Noturno (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={batchNightShiftHours}
                      onChange={(e) => setBatchNightShiftHours(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-purple-950/40 border border-purple-800/60 text-purple-300 font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Alimentação (R$)</label>
                    <input
                      type="number"
                      step="5"
                      min="0"
                      value={batchMealAllowance}
                      onChange={(e) => setBatchMealAllowance(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Hospedagem (R$)</label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={batchLodgingAllowance}
                      onChange={(e) => setBatchLodgingAllowance(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Outras Despesas (R$)</label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={batchOtherExpenses}
                      onChange={(e) => setBatchOtherExpenses(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Atividades / Frente de Trabalho Aplicada:
                  </label>
                  <input
                    type="text"
                    value={batchActivities}
                    onChange={(e) => setBatchActivities(e.target.value)}
                    placeholder="Ex.: Montagem dos ralos sanitários e solda TIG em aço inox"
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Total de profissionais impactados: <strong className="text-amber-400">{targetCountPreview}</strong>
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowBatchModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={targetCountPreview === 0}
                    className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold shadow-md cursor-pointer transition-colors disabled:opacity-50"
                  >
                    Aplicar para {targetCountPreview} Colaborador(es)
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
