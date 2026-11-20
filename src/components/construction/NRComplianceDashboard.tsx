import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  FieldWorker,
  WorkShift,
  NRRegulatoryCertification,
} from '../../types';
import {
  Award,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Users,
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Paperclip,
  FileText,
  Clock,
  Building,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  HardHat,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { getCertificationAlertStatus } from './FieldPersonnelManager';
import { ExpandedWorkerFormModal } from './ExpandedWorkerFormModal';

interface NRComplianceDashboardProps {
  organizationId: string;
  onOpenCreateWorker?: () => void;
}

interface FlattenedCertItem {
  workerId: string;
  workerName: string;
  workerCpf: string;
  workerRole: string;
  workerSite: string;
  workerStatus: string;
  cert: NRRegulatoryCertification;
  statusInfo: ReturnType<typeof getCertificationAlertStatus>;
  workerObj: FieldWorker;
}

const STATUS_COLORS = {
  vencido: '#ef4444', // Red-500
  critico: '#f43f5e', // Rose-500
  medio: '#f59e0b', // Amber-500
  alerta: '#eab308', // Yellow-500
  em_dia: '#10b981', // Emerald-500
};

export const NRComplianceDashboard: React.FC<NRComplianceDashboardProps> = ({
  organizationId,
}) => {
  const [workers, setWorkers] = useState<FieldWorker[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<'todos' | 'vencido' | 'critico' | 'medio' | 'alerta' | 'em_dia'>('todos');
  const [nrCodeFilter, setNrCodeFilter] = useState<string>('todos');
  const [siteFilter, setSiteFilter] = useState<string>('todos');

  // Modal States
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<FieldWorker | null>(null);

  // Document Viewer Modal State
  const [viewingDoc, setViewingDoc] = useState<{
    workerName: string;
    certTitle: string;
    nrCode: string;
    url: string;
    fileName: string;
  } | null>(null);

  // Listen to Field Workers in Firestore
  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);

    const qWorkers = query(collection(db, 'field_workers'), where('orgId', '==', organizationId));
    const unsubW = onSnapshot(qWorkers, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FieldWorker));
      setWorkers(list);
      setLoading(false);
    });

    const qShifts = query(collection(db, 'work_shifts'), where('orgId', '==', organizationId));
    const unsubS = onSnapshot(qShifts, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkShift));
      setShifts(list);
    });

    return () => {
      unsubW();
      unsubS();
    };
  }, [organizationId]);

  // Flatten and calculate status for all NR certifications across all workers
  const allCertItems = useMemo<FlattenedCertItem[]>(() => {
    const items: FlattenedCertItem[] = [];

    workers.forEach((w) => {
      if (w.nrCertifications && w.nrCertifications.length > 0) {
        w.nrCertifications.forEach((c) => {
          items.push({
            workerId: w.id,
            workerName: w.name,
            workerCpf: w.cpf,
            workerRole: w.role,
            workerSite: w.currentSite || 'Não alocado',
            workerStatus: w.status,
            cert: c,
            statusInfo: getCertificationAlertStatus(c),
            workerObj: w,
          });
        });
      } else if (w.certifications && w.certifications.length > 0) {
        // Handle legacy array format
        w.certifications.forEach((legStr, idx) => {
          let code = 'Outra';
          const match = legStr.match(/NR-?\d+/i);
          if (match) code = match[0].toUpperCase();
          else if (legStr.toUpperCase().includes('ASO')) code = 'ASO';

          const syntheticCert: NRRegulatoryCertification = {
            id: `legacy_${w.id}_${idx}`,
            nrCode: code,
            title: legStr,
            expirationDate: '',
            alertDaysWarning: 30,
            alertDaysCritical: 10,
            alertDaysUrgent: 1,
          };

          items.push({
            workerId: w.id,
            workerName: w.name,
            workerCpf: w.cpf,
            workerRole: w.role,
            workerSite: w.currentSite || 'Não alocado',
            workerStatus: w.status,
            cert: syntheticCert,
            statusInfo: getCertificationAlertStatus(syntheticCert),
            workerObj: w,
          });
        });
      }
    });

    // Sort: expired first, then critical, medium, alert, and up-to-date
    items.sort((a, b) => a.statusInfo.daysRemaining - b.statusInfo.daysRemaining);
    return items;
  }, [workers]);

  // Statistics for KPIs & Charts
  const stats = useMemo(() => {
    let vencidos = 0;
    let criticos = 0;
    let medios = 0;
    let alerta = 0;
    let emDia = 0;

    const nrBreakdown: Record<string, { code: string; critico: number; medio: number; emDia: number; total: number }> = {};

    allCertItems.forEach((item) => {
      const u = item.statusInfo.status;
      if (u === 'vencido') vencidos++;
      else if (u === 'critico') criticos++;
      else if (u === 'medio') medios++;
      else if (u === 'alerta') alerta++;
      else if (u === 'em_dia') emDia++;

      const code = item.cert.nrCode || 'Outra';
      if (!nrBreakdown[code]) {
        nrBreakdown[code] = { code, critico: 0, medio: 0, emDia: 0, total: 0 };
      }
      nrBreakdown[code].total++;
      if (u === 'vencido' || u === 'critico') {
        nrBreakdown[code].critico++;
      } else if (u === 'medio' || u === 'alerta') {
        nrBreakdown[code].medio++;
      } else if (u === 'em_dia') {
        nrBreakdown[code].emDia++;
      }
    });

    const pieData = [
      { name: 'Vencidos (Bloqueio)', value: vencidos, color: STATUS_COLORS.vencido },
      { name: 'Urgência Alta (Crítico)', value: criticos, color: STATUS_COLORS.critico },
      { name: 'Urgência Média', value: medios, color: STATUS_COLORS.medio },
      { name: 'Alerta Preventivo', value: alerta, color: STATUS_COLORS.alerta },
      { name: 'Em Dia / Válidos', value: emDia, color: STATUS_COLORS.em_dia },
    ].filter((d) => d.value > 0);

    const barData = Object.values(nrBreakdown).sort((a, b) => b.total - a.total);

    return {
      totalDocs: allCertItems.length,
      vencidos,
      criticos,
      medios,
      alerta,
      emDia,
      pieData,
      barData,
      pendingActionTotal: vencidos + criticos + medios,
    };
  }, [allCertItems]);

  // Filtered List
  const filteredItems = useMemo(() => {
    return allCertItems.filter((item) => {
      const matchSearch =
        item.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.workerCpf.includes(searchQuery) ||
        item.workerRole.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.workerSite.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.cert.nrCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.cert.title.toLowerCase().includes(searchQuery.toLowerCase());

      const matchUrgency =
        urgencyFilter === 'todos' || item.statusInfo.status === urgencyFilter;

      const matchCode =
        nrCodeFilter === 'todos' || item.cert.nrCode === nrCodeFilter;

      const matchSite =
        siteFilter === 'todos' || item.workerSite.toLowerCase().includes(siteFilter.toLowerCase());

      return matchSearch && matchUrgency && matchCode && matchSite;
    });
  }, [allCertItems, searchQuery, urgencyFilter, nrCodeFilter, siteFilter]);

  // Distinct sites for dropdown filter
  const availableSites = useMemo(() => {
    const s = new Set<string>();
    workers.forEach((w) => {
      if (w.currentSite) s.add(w.currentSite);
    });
    return Array.from(s);
  }, [workers]);

  // Distinct NR codes for dropdown filter
  const availableNrCodes = useMemo(() => {
    const s = new Set<string>();
    allCertItems.forEach((i) => s.add(i.cert.nrCode));
    return Array.from(s);
  }, [allCertItems]);

  // Export CSV Report of NR Compliance
  const handleExportCSV = () => {
    const headers = [
      'Colaborador',
      'CPF',
      'Cargo',
      'Obra / Local',
      'Norma Regulamentadora',
      'Título do Treinamento',
      'Data Emissão',
      'Data Vencimento',
      'Dias Restantes',
      'Status de Urgência',
      'Aviso Crítico (dias)',
      'Aviso Médio (dias)',
      'Possui Anexo Digital',
    ];

    const rows = filteredItems.map((item) => [
      `"${item.workerName}"`,
      `"${item.workerCpf}"`,
      `"${item.workerRole}"`,
      `"${item.workerSite}"`,
      `"${item.cert.nrCode}"`,
      `"${item.cert.title}"`,
      item.cert.issueDate || 'N/A',
      item.cert.expirationDate || 'N/A',
      item.statusInfo.daysRemaining,
      `"${item.statusInfo.label}"`,
      item.cert.alertDaysUrgent ?? 1,
      item.cert.alertDaysCritical ?? 10,
      item.cert.documentUrl ? 'Sim' : 'Não',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Relatorio_Conformidade_NRs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 text-slate-100 font-sans">
      {/* Top Banner Header with Actions */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1424] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 border border-amber-500/30">
            <Award className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white">
                Painel Visual de Normas Regulamentadoras (NRs) & Conformidade
              </h2>
              {stats.pendingActionTotal > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] animate-pulse">
                  {stats.pendingActionTotal} requerem atenção
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitoramento preventivo de vencimento de certificados, exames ASO e conformidade técnica de canteiro.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            title="Exportar planilha de conformidade de NRs para fiscalização"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Exportar Relatório CSV</span>
          </button>

          <button
            onClick={() => {
              setEditingWorker(null);
              setShowExpandedModal(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Colaborador & NRs</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Urgency Distribution */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Card 1: Vencidos */}
        <div
          onClick={() => setUrgencyFilter(urgencyFilter === 'vencido' ? 'todos' : 'vencido')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            urgencyFilter === 'vencido'
              ? 'bg-red-950/80 border-red-500 ring-2 ring-red-500/40'
              : 'bg-[#121826] border-slate-800 hover:border-red-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
              Vencidos (Bloqueio)
            </span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <strong className="text-xl sm:text-2xl text-red-300 font-mono font-bold block mt-1">
            {stats.vencidos}
          </strong>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Risco de paralisação
          </span>
        </div>

        {/* Card 2: Urgência Alta (Crítico) */}
        <div
          onClick={() => setUrgencyFilter(urgencyFilter === 'critico' ? 'todos' : 'critico')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            urgencyFilter === 'critico'
              ? 'bg-rose-950/80 border-rose-500 ring-2 ring-rose-500/40'
              : 'bg-[#121826] border-slate-800 hover:border-rose-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">
              Urgência Alta (Crítico)
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <strong className="text-xl sm:text-2xl text-rose-300 font-mono font-bold block mt-1">
            {stats.criticos}
          </strong>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Vencimento iminente
          </span>
        </div>

        {/* Card 3: Urgência Média */}
        <div
          onClick={() => setUrgencyFilter(urgencyFilter === 'medio' ? 'todos' : 'medio')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            urgencyFilter === 'medio'
              ? 'bg-amber-950/80 border-amber-500 ring-2 ring-amber-500/40'
              : 'bg-[#121826] border-slate-800 hover:border-amber-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
              Urgência Média
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <strong className="text-xl sm:text-2xl text-amber-300 font-mono font-bold block mt-1">
            {stats.medios}
          </strong>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Perto de vencer
          </span>
        </div>

        {/* Card 4: Alerta Preventivo */}
        <div
          onClick={() => setUrgencyFilter(urgencyFilter === 'alerta' ? 'todos' : 'alerta')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            urgencyFilter === 'alerta'
              ? 'bg-yellow-950/80 border-yellow-500 ring-2 ring-yellow-500/40'
              : 'bg-[#121826] border-slate-800 hover:border-yellow-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
              Alerta Inicial
            </span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <strong className="text-xl sm:text-2xl text-yellow-300 font-mono font-bold block mt-1">
            {stats.alerta}
          </strong>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Programar reciclagem
          </span>
        </div>

        {/* Card 5: Em Dia / Total */}
        <div
          onClick={() => setUrgencyFilter(urgencyFilter === 'em_dia' ? 'todos' : 'em_dia')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer col-span-2 sm:col-span-1 ${
            urgencyFilter === 'em_dia'
              ? 'bg-emerald-950/80 border-emerald-500 ring-2 ring-emerald-500/40'
              : 'bg-[#121826] border-slate-800 hover:border-emerald-800/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              Válidos / Em Dia
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <strong className="text-xl sm:text-2xl text-emerald-300 font-mono font-bold block mt-1">
            {stats.emDia}
          </strong>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Total de {stats.totalDocs} NRs
          </span>
        </div>
      </div>

      {/* Visual Charts Grid: Donut + Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart 1: Donut de Status Geral de Validade */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-[#0E1424] border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Status Geral de Vencimento</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Distribuição das certificações por faixa de urgência programada.
              </p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {stats.pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#121826',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                    formatter={(value) => <span className="text-slate-300">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-slate-500 text-xs">
                Nenhum certificado cadastrado para compor o gráfico.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Distribuição por Tipo de Norma Regulamentadora */}
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-[#0E1424] border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                <Award className="w-4 h-4 text-blue-400" />
                <span>Normas Regulamentadoras por Criticidade</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Volume de certificados por código (NR-35, NR-33, NR-10, ASO) segregados por criticidade.
              </p>
            </div>

            <div className="flex items-center space-x-3 text-[10px]">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-500" />
                <span className="text-slate-300">Crítico / Vencido</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-500" />
                <span className="text-slate-300">Urgência Média</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                <span className="text-slate-300">Em Dia</span>
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            {stats.barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="code" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#121826',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#f8fafc',
                    }}
                  />
                  <Bar dataKey="critico" name="Crítico / Vencido" fill="#f43f5e" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="medio" name="Urgência Média" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="emDia" name="Válido / Em Dia" fill="#10b981" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-slate-500 text-xs">
                Cadastre normas nos colaboradores para visualizar a distribuição.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por colaborador, CPF, cargo, obra ou NR..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 cursor-pointer"
          >
            <option value="todos">Todos os Níveis de Urgência</option>
            <option value="vencido">🚨 Apenas Vencidos</option>
            <option value="critico">🔥 Urgência Alta (&le;1d)</option>
            <option value="medio">⚠️ Urgência Média (&le;10d)</option>
            <option value="alerta">🟡 Alerta Preventivo (&le;30d)</option>
            <option value="em_dia">✅ Em Dia / Válidos</option>
          </select>

          <select
            value={nrCodeFilter}
            onChange={(e) => setNrCodeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 cursor-pointer"
          >
            <option value="todos">Todas as Normas (NRs)</option>
            {availableNrCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          {availableSites.length > 0 && (
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 cursor-pointer"
            >
              <option value="todos">Todas as Obras</option>
              {availableSites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span>Mostrando <strong>{filteredItems.length}</strong> de {allCertItems.length} registros</span>
        </div>
      </div>

      {/* Main Table: Certifications with Urgency Highlighting & Documents */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-semibold">
                <th className="py-3 px-3">Colaborador & Obra</th>
                <th className="py-3 px-3">Norma & Treinamento</th>
                <th className="py-3 px-3">Data Vencimento</th>
                <th className="py-3 px-3">Dias Restantes</th>
                <th className="py-3 px-3">Regra de Avisos Programada</th>
                <th className="py-3 px-3">Status de Urgência</th>
                <th className="py-3 px-3 text-center">Comprovante</th>
                <th className="py-3 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    Nenhuma Norma Regulamentadora encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const alert = item.statusInfo;
                  const isHighUrgency = alert.urgencyLevel === 'critica' || alert.urgencyLevel === 'vencido';
                  const isMediumUrgency = alert.urgencyLevel === 'media';

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isHighUrgency
                          ? 'bg-red-950/20'
                          : isMediumUrgency
                          ? 'bg-amber-950/15'
                          : ''
                      }`}
                    >
                      {/* Colaborador & Obra */}
                      <td className="py-3 px-3">
                        <strong className="text-white block font-medium">{item.workerName}</strong>
                        <span className="text-[10px] text-slate-400 block">{item.workerRole}</span>
                        <span className="text-[10px] text-slate-500 font-mono flex items-center space-x-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-600" />
                          <span>{item.workerSite}</span>
                        </span>
                      </td>

                      {/* Norma & Treinamento */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-bold text-[10px]">
                          {item.cert.nrCode}
                        </span>
                        <span className="text-slate-200 block font-medium mt-1">
                          {item.cert.title || item.cert.nrCode}
                        </span>
                        {item.cert.issuingEntity && (
                          <span className="text-[10px] text-slate-400 block truncate">
                            {item.cert.issuingEntity}
                          </span>
                        )}
                      </td>

                      {/* Data Vencimento */}
                      <td className="py-3 px-3 font-mono">
                        {item.cert.expirationDate ? (
                          <span className="text-white font-bold">{item.cert.expirationDate}</span>
                        ) : (
                          <span className="text-slate-500 italic">Não informada</span>
                        )}
                        {item.cert.issueDate && (
                          <span className="text-[10px] text-slate-500 block">
                            Emissão: {item.cert.issueDate}
                          </span>
                        )}
                      </td>

                      {/* Dias Restantes */}
                      <td className="py-3 px-3 font-mono font-bold">
                        {item.cert.expirationDate ? (
                          <span
                            className={
                              alert.daysRemaining < 0
                                ? 'text-red-400'
                                : alert.daysRemaining <= 1
                                ? 'text-rose-400'
                                : alert.daysRemaining <= 10
                                ? 'text-amber-300'
                                : 'text-emerald-400'
                            }
                          >
                            {alert.daysRemaining < 0
                              ? `-${Math.abs(alert.daysRemaining)} dias`
                              : `${alert.daysRemaining} dias`}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Regra de Avisos Programada */}
                      <td className="py-3 px-3 text-[10px] font-mono text-slate-400">
                        <div className="space-y-0.5">
                          <span className="text-rose-300 block">
                            Crítico: &le;{item.cert.alertDaysUrgent ?? 1}d
                          </span>
                          <span className="text-amber-300 block">
                            Médio: &le;{item.cert.alertDaysCritical ?? 10}d
                          </span>
                          <span className="text-yellow-300 block">
                            Alerta: &le;{item.cert.alertDaysWarning ?? 30}d
                          </span>
                        </div>
                      </td>

                      {/* Status de Urgência Destacado */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm ${alert.badgeClass}`}
                        >
                          {alert.label}
                        </span>
                      </td>

                      {/* Comprovante Digital */}
                      <td className="py-3 px-3 text-center">
                        {item.cert.documentUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setViewingDoc({
                                workerName: item.workerName,
                                certTitle: item.cert.title,
                                nrCode: item.cert.nrCode,
                                url: item.cert.documentUrl!,
                                fileName: item.cert.documentName || `${item.cert.nrCode}_Certificado.pdf`,
                              })
                            }
                            className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/50 text-[10px] font-semibold cursor-pointer transition-colors shadow-sm"
                            title="Visualizar documento em anexo"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>Ver Anexo</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[10px] italic">Sem anexo</span>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingWorker(item.workerObj);
                            setShowExpandedModal(true);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 hover:text-white font-semibold text-[10px] cursor-pointer"
                        >
                          Gerenciar NRs
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded Worker Creation & Edition Modal */}
      <ExpandedWorkerFormModal
        isOpen={showExpandedModal}
        onClose={() => {
          setShowExpandedModal(false);
          setEditingWorker(null);
        }}
        organizationId={organizationId}
        editingWorker={editingWorker}
        shifts={shifts}
      />

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-4xl w-full p-5 shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                  <FileText className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {viewingDoc.nrCode} — {viewingDoc.certTitle}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Colaborador: <strong className="text-white">{viewingDoc.workerName}</strong> • {viewingDoc.fileName}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <a
                  href={viewingDoc.url}
                  download={viewingDoc.fileName}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo</span>
                </a>

                <button
                  onClick={() => setViewingDoc(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center p-2 min-h-[350px]">
              {viewingDoc.url.startsWith('data:image/') ||
              viewingDoc.fileName.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                <img
                  src={viewingDoc.url}
                  alt={viewingDoc.fileName}
                  className="max-h-[65vh] object-contain rounded"
                />
              ) : viewingDoc.url.startsWith('data:application/pdf') || viewingDoc.fileName.endsWith('.pdf') ? (
                <iframe
                  src={viewingDoc.url}
                  title={viewingDoc.fileName}
                  className="w-full h-[65vh] rounded border-0"
                />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FileText className="w-12 h-12 text-slate-500 mx-auto" />
                  <p className="text-slate-300 text-xs">
                    Pré-visualização direta não suportada para este formato ({viewingDoc.fileName}).
                  </p>
                  <a
                    href={viewingDoc.url}
                    download={viewingDoc.fileName}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Documento</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
