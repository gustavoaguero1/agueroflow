import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ConstructionDailyReport,
  ConstructionMilestone,
  Unit,
  Contract,
} from '../types';
import {
  HardHat,
  Plus,
  Calendar,
  Sun,
  CloudSun,
  CloudRain,
  CloudLightning,
  Users,
  Wrench,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Printer,
  X,
  Search,
  Filter,
  BarChart3,
  FileText,
  ChevronRight,
  TrendingUp,
  Building,
  Upload,
  Trash2,
  Download,
  FileSpreadsheet,
  Sparkles,
  Zap,
  DollarSign,
  Settings,
  Award,
} from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { FieldPersonnelManager } from '../components/construction/FieldPersonnelManager';
import { DailyLaborTimesheet } from '../components/construction/DailyLaborTimesheet';
import { DailyLaborCostDashboard } from '../components/construction/DailyLaborCostDashboard';
import { WorkShiftConfigModal } from '../components/construction/WorkShiftConfigModal';
import { NRComplianceDashboard } from '../components/construction/NRComplianceDashboard';
import {
  calculateWeightedPhysicalProgress,
  getConstructionScheduleStatus,
  validateMilestoneScheduleDates,
} from '../services/constructionPlanning';
import {
  buildRdoReportNumber,
  localDateInputValue,
  parseOptionalRdoProgress,
  prepareRdoFieldRecords,
  type RdoEquipmentDraft,
  type RdoWorkforceDraft,
} from '../services/constructionRdo';

const WEATHER_OPTIONS = [
  { id: 'ensolarado', label: 'Ensolarado', icon: Sun, color: 'text-amber-400 bg-amber-950/40 border-amber-800/50' },
  { id: 'nublado', label: 'Nublado', icon: CloudSun, color: 'text-slate-300 bg-slate-800 border-slate-700' },
  { id: 'chuvoso', label: 'Chuvoso (Com Atividades)', icon: CloudRain, color: 'text-blue-400 bg-blue-950/40 border-blue-800/50' },
  { id: 'chuva_paralisante', label: 'Chuva Paralisante (Obra Interrompida)', icon: CloudLightning, color: 'text-red-400 bg-red-950/40 border-red-800/50' },
];

const DEFAULT_MILESTONES = [
  { name: '1. Engenharia de Detalhamento & Isométricos', weight: 10 },
  { name: '2. Fabricação & Corte em Caldeiraria (Oficina)', weight: 25 },
  { name: '3. Logística, Transporte & Descarregamento em Planta', weight: 5 },
  { name: '4. Montagem Estrutural, Suportação & Alinhamento', weight: 20 },
  { name: '5. Soldagem TIG em Aço Inox & Purga de Gás', weight: 20 },
  { name: '6. Polimento Mecânico & Decapagem/Passivação Química', weight: 10 },
  { name: '7. Teste Hidrostático & Ensaio Líquido Penetrante (LP)', weight: 5 },
  { name: '8. Comissionamento, Start-up & Entrega Técnica Final', weight: 5 },
];

const createEmptyRdoWorkforceDrafts = (): RdoWorkforceDraft[] => [
  { role: 'Caldeireiro', count: '', hours: '' },
  { role: 'Soldador TIG / Inox', count: '', hours: '' },
  { role: 'Montador Mecânico / Inox', count: '', hours: '' },
  { role: 'Ajudante Geral', count: '', hours: '' },
  { role: 'Supervisor / Encarregado', count: '', hours: '' },
];

export const ConstructionModule: React.FC = () => {
  const { user, organization, units, contracts, logAudit, canViewFinancials } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'rdo' | 'avanco' | 'equipe_rh' | 'apontamento_jornada' | 'dashboard_custo' | 'painel_nrs'
  >('rdo');

  const [reports, setReports] = useState<ConstructionDailyReport[]>([]);
  const [milestones, setMilestones] = useState<ConstructionMilestone[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showRdoModal, setShowRdoModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ConstructionDailyReport | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showShiftConfigModal, setShowShiftConfigModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RDO Form State: blank means "not informed"; nothing is assumed about the field team or equipment.
  const [rdoDate, setRdoDate] = useState<string>(localDateInputValue());
  const [rdoUnitId, setRdoUnitId] = useState<string>('');
  const [rdoContractId, setRdoContractId] = useState<string>('');
  const [rdoWeather, setRdoWeather] = useState<ConstructionDailyReport['weather'] | ''>('');
  const [rdoWorkforceDrafts, setRdoWorkforceDrafts] = useState<RdoWorkforceDraft[]>(createEmptyRdoWorkforceDrafts);
  const [rdoEquipmentDrafts, setRdoEquipmentDrafts] = useState<RdoEquipmentDraft[]>([]);
  const [rdoActivities, setRdoActivities] = useState<string>('');
  const [rdoImpediments, setRdoImpediments] = useState<string>('');
  const [rdoProgress, setRdoProgress] = useState<string>('');
  const [rdoPhotos, setRdoPhotos] = useState<string[]>([]);
  const [rdoConfirmationChecked, setRdoConfirmationChecked] = useState(false);

  // Load Firestore data
  useEffect(() => {
    if (!organization) return;

    const qReports = query(collection(db, 'construction_reports'), where('orgId', '==', organization.id));
    const unsubReports = onSnapshot(qReports, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConstructionDailyReport));
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setReports(list);
    });

    const qMilestones = query(collection(db, 'construction_milestones'), where('orgId', '==', organization.id));
    const unsubMilestones = onSnapshot(qMilestones, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConstructionMilestone));
      list.sort((a, b) => a.orderIndex - b.orderIndex);
      setMilestones(list);
    });

    return () => {
      unsubReports();
      unsubMilestones();
    };
  }, [organization]);

  // Default the page filter only. The RDO form requires the user to choose the actual work location.
  useEffect(() => {
    if (contracts.length > 0 && !selectedContractId) {
      setSelectedContractId(contracts[0].id);
    }
  }, [contracts, selectedContractId]);

  const resetRdoForm = () => {
    setRdoDate(localDateInputValue());
    setRdoUnitId('');
    setRdoContractId('');
    setRdoWeather('');
    setRdoWorkforceDrafts(createEmptyRdoWorkforceDrafts());
    setRdoEquipmentDrafts([]);
    setRdoActivities('');
    setRdoImpediments('');
    setRdoProgress('');
    setRdoPhotos([]);
    setRdoConfirmationChecked(false);
  };

  const updateRdoWorkforceDraft = (role: string, patch: Partial<RdoWorkforceDraft>) => {
    setRdoWorkforceDrafts((current) =>
      current.map((draft) => draft.role === role ? { ...draft, ...patch } : draft)
    );
  };

  const updateRdoEquipmentDraft = (index: number, patch: Partial<RdoEquipmentDraft>) => {
    setRdoEquipmentDrafts((current) =>
      current.map((draft, currentIndex) => currentIndex === index ? { ...draft, ...patch } : draft)
    );
  };

  // Create only missing template milestones. Existing progress and dates are never overwritten.
  const handleSeedDefaultMilestones = async () => {
    if (!organization || !selectedContractId) return;
    setIsSubmitting(true);
    try {
      const unitId = rdoUnitId || units[0]?.id || '';
      if (!unitId) {
        alert('Cadastre ou selecione uma unidade antes de gerar o cronograma.');
        return;
      }

      const milestoneRefs = DEFAULT_MILESTONES.map((_, index) =>
        doc(db, 'construction_milestones', `ms_${selectedContractId}_${index}`)
      );
      const createdCount = await runTransaction(db, async (tx) => {
        const snapshots = await Promise.all(milestoneRefs.map((ref) => tx.get(ref)));
        let created = 0;
        snapshots.forEach((snapshot, index) => {
          if (snapshot.exists()) return;
          const item = DEFAULT_MILESTONES[index];
          const mId = milestoneRefs[index].id;
          const now = new Date().toISOString();
          const newMs: ConstructionMilestone = {
            id: mId,
            orgId: organization.id,
            contractId: selectedContractId,
            unitId,
            name: item.name,
            orderIndex: index + 1,
            weightPercentage: item.weight,
            completedPercentage: 0,
            status: 'nao_iniciado',
            createdAt: now,
            updatedAt: now,
          };
          tx.set(milestoneRefs[index], newMs);
          created += 1;
        });
        return created;
      });

      await logAudit(
        'Obras',
        'Gerar Cronograma Padrão',
        `${createdCount} etapa(s) criada(s) para o contrato ${selectedContractId}; registros existentes preservados.`,
        selectedContractId,
      );
    } catch (err) {
      console.error('Erro ao gerar cronograma padrão:', err);
      alert('Não foi possível gerar o cronograma. Verifique as permissões e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Create RDO using only values explicitly supplied by the field reporter.
  const handleCreateRdo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    if (!rdoDate || !rdoUnitId || !rdoContractId || !rdoWeather) {
      alert('Informe a data, unidade/local, contrato/obra e condição climática do RDO.');
      return;
    }
    if (!units.some((unit) => unit.id === rdoUnitId)) {
      alert('A unidade selecionada não pertence à empresa ativa. Atualize a página e selecione novamente.');
      return;
    }
    if (!contracts.some((contract) => contract.id === rdoContractId)) {
      alert('O contrato selecionado não pertence à empresa ativa. Atualize a página e selecione novamente.');
      return;
    }
    if (!rdoActivities.trim()) {
      alert('Por favor, informe as atividades executadas no dia.');
      return;
    }
    if (!rdoConfirmationChecked) {
      alert('Confirme que as informações deste RDO foram conferidas em campo.');
      return;
    }

    const fieldRecords = prepareRdoFieldRecords(rdoWorkforceDrafts, rdoEquipmentDrafts);
    if (!fieldRecords.valid) {
      alert(fieldRecords.errors.join('\\n'));
      return;
    }

    const progressResult = parseOptionalRdoProgress(rdoProgress);
    if (progressResult.error) {
      alert(progressResult.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const reportRef = doc(collection(db, 'construction_reports'));
      const rdoId = reportRef.id;
      const reportNum = buildRdoReportNumber(rdoDate, rdoId);
      const recordedAt = new Date().toISOString();
      const preparedBy = user.displayName || user.email || user.uid;
      const newReport: ConstructionDailyReport = {
        id: rdoId,
        orgId: organization.id,
        unitId: rdoUnitId,
        contractId: rdoContractId,
        reportNumber: reportNum,
        date: rdoDate,
        weather: rdoWeather,
        workforce: fieldRecords.workforce,
        equipment: fieldRecords.equipment,
        activitiesCompleted: rdoActivities.trim(),
        impedimentsOrStoppages: rdoImpediments.trim() || undefined,
        ...(progressResult.value !== undefined ? { progressPercentage: progressResult.value } : {}),
        photos: rdoPhotos,
        preparedBy,
        confirmedByUid: user.uid,
        confirmedByName: preparedBy,
        confirmedAt: recordedAt,
        createdAt: recordedAt,
        updatedAt: recordedAt,
      };

      await setDoc(reportRef, newReport);
      await logAudit(
        'Obras',
        'Registrar RDO',
        `Diário de Obra ${reportNum} emitido por ${preparedBy}; ${fieldRecords.totalPersonHours} horas-homem informadas.`,
        rdoId,
      );

      setShowRdoModal(false);
      resetRdoForm();
    } catch (err) {
      console.error('Erro ao salvar RDO:', err);
      alert('Não foi possível concluir o registro do RDO. Confira a conexão e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };


  // Upload Photo for RDO
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Foto deve ter no máximo 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setRdoPhotos((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  // Update planned dates and responsible person without losing the existing progress.
  const handleUpdateMilestoneSchedule = async (
    id: string,
    patch: Partial<Pick<ConstructionMilestone, 'plannedStartDate' | 'targetDate' | 'responsibleName'>>,
  ) => {
    const milestone = milestones.find((item) => item.id === id);
    if (!milestone) return;

    const plannedStartDate = patch.plannedStartDate ?? milestone.plannedStartDate ?? '';
    const targetDate = patch.targetDate ?? milestone.targetDate ?? '';
    const dateError = validateMilestoneScheduleDates(plannedStartDate, targetDate);
    if (dateError) {
      alert(dateError);
      return;
    }

    const responsibleName = patch.responsibleName?.trim();
    if (responsibleName && responsibleName.length > 120) {
      alert('O nome do responsável deve ter no máximo 120 caracteres.');
      return;
    }

    const update = {
      ...patch,
      ...(patch.responsibleName !== undefined ? { responsibleName } : {}),
      updatedAt: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, 'construction_milestones', id), update);
      await logAudit(
        'Obras',
        'Atualizar planejamento da etapa',
        `Planejamento da etapa "${milestone.name}" atualizado.`,
        id,
      );
    } catch (err) {
      console.error('Erro ao atualizar planejamento da etapa:', err);
      alert('Não foi possível atualizar o planejamento da etapa.');
    }
  };

  // Update actual progress and preserve the first recorded start date.
  const handleUpdateMilestoneProgress = async (id: string, newPercentage: number) => {
    const milestone = milestones.find((item) => item.id === id);
    const raw = Number(newPercentage);
    if (!Number.isFinite(raw)) return;
    const valid = Math.min(100, Math.max(0, raw));
    const newStatus = valid === 100 ? 'concluido' : valid > 0 ? 'em_andamento' : 'nao_iniciado';
    const localNow = new Date();
    const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
    try {
      await updateDoc(doc(db, 'construction_milestones', id), {
        completedPercentage: valid,
        status: newStatus,
        actualStartDate: valid > 0 ? (milestone?.actualStartDate || today) : (milestone?.actualStartDate || null),
        completedDate: valid === 100 ? (milestone?.completedDate || today) : null,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao atualizar marco:', err);
    }
  };

  // Calculate Overall Progress
  const filteredMilestones = useMemo(() => {
    if (!selectedContractId) return milestones;
    return milestones.filter((m) => m.contractId === selectedContractId);
  }, [milestones, selectedContractId]);

  const overallProgress = useMemo(
    () => calculateWeightedPhysicalProgress(filteredMilestones),
    [filteredMilestones],
  );

  const currentDate = new Date();
  const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (selectedContractId && r.contractId && r.contractId !== selectedContractId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.reportNumber.toLowerCase().includes(q) ||
          r.activitiesCompleted.toLowerCase().includes(q) ||
          (r.impedimentsOrStoppages && r.impedimentsOrStoppages.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [reports, selectedContractId, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <HardHat className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">Obras, Montagens Industriais & RDO</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Controle diário de canteiro de obras, efetivo de caldeiraria/solda, impedimentos e medição de avanço físico.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {contracts.length > 0 && (
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-slate-400 font-medium">Obra / Contrato:</span>
              <select
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {contracts.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                    {c.name || c.title} ({c.code || c.contractNumber})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowShiftConfigModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold shadow-sm transition-all cursor-pointer"
            title="Configurar turnos de trabalho padrão, escalas e regras de cálculo para horas extras (50%, 100%), horas de viagem e adicional noturno"
          >
            <Clock className="w-4 h-4 text-blue-400" />
            <span>Configurar Jornadas & Regras</span>
          </button>

          <button
            onClick={() => {
              setRdoContractId(selectedContractId || contracts[0]?.id || '');
              setShowRdoModal(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Emitir RDO de Hoje</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('rdo')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'rdo'
              ? 'bg-amber-600 text-slate-950 font-bold shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>1. Diário de Obra (RDO) ({reports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('avanco')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'avanco'
              ? 'bg-amber-600 text-slate-950 font-bold shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>2. Avanço Físico & Cronograma ({overallProgress}%)</span>
        </button>

        <button
          onClick={() => setActiveTab('equipe_rh')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'equipe_rh'
              ? 'bg-amber-600 text-slate-950 font-bold shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>3. Equipe & Histórico Salarial</span>
        </button>

        <button
          onClick={() => setActiveTab('apontamento_jornada')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'apontamento_jornada'
              ? 'bg-emerald-600 text-white font-bold shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>4. Grade de Horas & Diário de Campo</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
            Substituto Excel
          </span>
        </button>

        <button
          onClick={() => setActiveTab('dashboard_custo')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'dashboard_custo'
              ? 'bg-emerald-600 text-white font-bold shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>5. Dashboard de Custo Diário</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
            Mão de Obra & HE
          </span>
        </button>

        <button
          onClick={() => setActiveTab('painel_nrs')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'painel_nrs'
              ? 'bg-rose-600 text-white font-bold shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Award className="w-4 h-4 text-rose-400" />
          <span>6. Painel de NRs & Vencimentos</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-950 text-rose-300 border border-rose-800 font-bold">
            Alertas & Certificados
          </span>
        </button>
      </div>

      {/* TAB 1: RDO (Relatório Diário de Obra) */}
      {activeTab === 'rdo' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center justify-between gap-3 bg-[#121826] p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar relatórios por número, atividade executada ou impedimento..."
                className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="text-xs text-slate-400">
              Total emitido: <strong className="text-white">{filteredReports.length} RDOs</strong>
            </div>
          </div>

          {/* List of RDO Cards */}
          {filteredReports.length === 0 ? (
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
                <HardHat className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Nenhum RDO emitido para esta obra</h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                O Diário de Obra (RDO) registra clima, mão de obra mobilizada, equipamentos e protege a Aguero Inox contra paralisações causadas por terceiros.
              </p>
              <button
                onClick={() => setShowRdoModal(true)}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Emitir Primeiro RDO</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReports.map((r) => {
                const weatherObj = WEATHER_OPTIONS.find((w) => w.id === r.weather) || WEATHER_OPTIONS[0];
                const WeatherIcon = weatherObj.icon;
                const totalWorkforce = r.workforce?.reduce((acc, w) => acc + (w.count || 0), 0) || 0;

                return (
                  <div
                    key={r.id}
                    className="bg-[#121826] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      {/* Top bar */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-extrabold text-amber-400 text-xs">
                            {r.reportNumber}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center space-x-1 ${weatherObj.color}`}>
                          <WeatherIcon className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[100px]">{weatherObj.label.split(' ')[0]}</span>
                        </span>
                      </div>

                      {/* Efetivo badges */}
                      <div className="mt-2.5 flex items-center space-x-2 text-[11px] text-slate-300">
                        <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>Efetivo total: <strong className="text-white">{totalWorkforce} profissionais</strong> em campo</span>
                      </div>

                      {/* Atividades Executadas */}
                      <div className="mt-2 text-xs text-slate-300">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">Atividades Realizadas:</span>
                        <p className="line-clamp-3 text-slate-300 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                          {r.activitiesCompleted}
                        </p>
                      </div>

                      {/* Impedimentos / Paralisações (Destaque se houver) */}
                      {r.impedimentsOrStoppages && (
                        <div className="mt-2 p-2 rounded-lg bg-red-950/30 border border-red-800/50 text-[11px] text-red-300 flex items-start space-x-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="block text-red-400 font-bold">Impedimento do Cliente:</strong>
                            <p className="line-clamp-2">{r.impedimentsOrStoppages}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom bar */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-500 truncate max-w-[130px]">
                        Por: {r.preparedBy}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedReport(r);
                          setShowPrintModal(true);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium flex items-center space-x-1 transition-colors cursor-pointer text-[11px]"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>Visualizar / Imprimir</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Avanço Físico & Marcos da Obra */}
      {activeTab === 'avanco' && (
        <div className="space-y-6">
          {/* Progress Card */}
          <div className="bg-[#121826] border border-slate-800 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  <span>Avanço Físico Ponderado da Obra</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Indicador interno de avanço físico. Não substitui boletim de medição aprovado pelo cliente.
                </p>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Progresso Geral</span>
                  <span className="text-2xl font-black text-amber-400 font-mono">{overallProgress}%</span>
                </div>
                {filteredMilestones.length === 0 && (
                  <button
                    onClick={handleSeedDefaultMilestones}
                    disabled={isSubmitting}
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                  >
                    Carregar Etapas Padrão de Montagem Inox
                  </button>
                )}
              </div>
            </div>

            {/* Big Progress Bar */}
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Milestone List */}
          <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Etapas Construtivas & Medições
              </h4>
              <span className="text-xs text-slate-400">
                Ajuste os percentuais conforme avanço verificado em campo.
              </span>
            </div>

            {filteredMilestones.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhuma etapa cadastrada ainda para este contrato.{' '}
                <button
                  onClick={handleSeedDefaultMilestones}
                  className="text-amber-400 underline font-semibold cursor-pointer ml-1"
                >
                  Clique aqui para carregar as 8 etapas padrão da indústria de caldeiraria inox.
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {filteredMilestones.map((m) => {
                  const scheduleStatus = getConstructionScheduleStatus(m, today);
                  const scheduleStatusLabel = scheduleStatus === 'concluida'
                    ? 'Concluída'
                    : scheduleStatus === 'atrasada'
                    ? 'Atrasada'
                    : scheduleStatus === 'no_prazo'
                    ? 'No prazo'
                    : 'Sem prazo';
                  const scheduleStatusClass = scheduleStatus === 'atrasada'
                    ? 'bg-red-950/70 text-red-300 border border-red-800/50'
                    : scheduleStatus === 'concluida'
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50'
                    : scheduleStatus === 'no_prazo'
                    ? 'bg-blue-950/70 text-blue-300 border border-blue-800/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700';

                  return (
                    <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-900/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              m.completedPercentage === 100
                                ? 'bg-emerald-400'
                                : m.completedPercentage > 0
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-slate-600'
                            }`}
                          />
                          <span className="text-sm font-bold text-white truncate">{m.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                            Peso: {m.weightPercentage}%
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${scheduleStatusClass}`}>
                            {scheduleStatusLabel}
                          </span>
                        </div>
                        {m.notes && (
                          <p className="text-xs text-slate-400 mt-1 pl-5">{m.notes}</p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pl-5">
                          <label className="block text-[10px] text-slate-400">
                            Início previsto
                            <input
                              type="date"
                              value={m.plannedStartDate || ''}
                              onChange={(e) => handleUpdateMilestoneSchedule(m.id, { plannedStartDate: e.target.value })}
                              className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs"
                            />
                          </label>
                          <label className="block text-[10px] text-slate-400">
                            Prazo final previsto
                            <input
                              type="date"
                              value={m.targetDate || ''}
                              onChange={(e) => handleUpdateMilestoneSchedule(m.id, { targetDate: e.target.value })}
                              className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs"
                            />
                          </label>
                          <label className="block text-[10px] text-slate-400">
                            Responsável pela etapa
                            <input
                              type="text"
                              maxLength={120}
                              defaultValue={m.responsibleName || ''}
                              onBlur={(e) => {
                                const value = e.currentTarget.value.trim();
                                if (value !== (m.responsibleName || '')) {
                                  handleUpdateMilestoneSchedule(m.id, { responsibleName: value });
                                }
                              }}
                              placeholder="Nome do responsável"
                              className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs"
                            />
                          </label>
                        </div>
                        <div className="mt-2 pl-5 text-[10px] text-slate-500">
                          Início real: {m.actualStartDate || 'Não registrado'}
                          {' · '}
                          Conclusão real: {m.completedDate || 'Não registrada'}
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 shrink-0">
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={m.completedPercentage}
                            onChange={(e) => handleUpdateMilestoneProgress(m.id, parseInt(e.target.value))}
                            className="w-32 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            aria-label={`Avanço físico de ${m.name}`}
                          />
                          <span className="w-12 text-right font-mono font-bold text-xs text-amber-400">
                            {m.completedPercentage}%
                          </span>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase min-w-[90px] text-center ${
                            m.completedPercentage === 100
                              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50'
                              : m.completedPercentage > 0
                              ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {m.completedPercentage === 100 ? 'Concluído' : m.completedPercentage > 0 ? 'Em Curso' : 'A Iniciar'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Equipe de Obra & Histórico Salarial */}
      {activeTab === 'equipe_rh' && organization && (
        <FieldPersonnelManager
          organizationId={organization.id}
          canViewFinancials={canViewFinancials}
        />
      )}

      {/* TAB 4: Grade de Apontamento de Jornada & Horas Extras (Substituto Excel) */}
      {activeTab === 'apontamento_jornada' && organization && (
        <DailyLaborTimesheet
          organizationId={organization.id}
          units={units}
          contracts={contracts}
          canViewFinancials={canViewFinancials}
          currentUserEmail={user?.email || 'Encarregado'}
          onOpenShiftConfig={() => setShowShiftConfigModal(true)}
          onGoToCostDashboard={() => setActiveTab('dashboard_custo')}
        />
      )}

      {/* TAB 5: Dashboard de Custo Diário da Força de Trabalho por Projeto */}
      {activeTab === 'dashboard_custo' && organization && (
        <DailyLaborCostDashboard
          organizationId={organization.id}
          units={units}
          contracts={contracts}
          canViewFinancials={canViewFinancials}
          onOpenShiftConfig={() => setShowShiftConfigModal(true)}
        />
      )}

      {/* TAB 6: Painel Visual de Status e Vencimento de Normas Regulamentadoras (NRs) */}
      {activeTab === 'painel_nrs' && organization && (
        <NRComplianceDashboard
          organizationId={organization.id}
        />
      )}

      {/* MODAL: Emitir Novo RDO */}
      {showRdoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <HardHat className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Novo Relatório Diário de Obra (RDO)</h3>
                  <p className="text-xs text-slate-400">Emissão diária para controle de canteiro e medição contratual.</p>
                </div>
              </div>
              <button
                onClick={() => setShowRdoModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRdo} className="mt-4 space-y-4 text-xs">
              {/* Date, Contract, Weather */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Data do Diário *</label>
                  <input
                    type="date"
                    required
                    value={rdoDate}
                    onChange={(e) => setRdoDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Contrato / Obra *</label>
                  <select
                    value={rdoContractId}
                    onChange={(e) => setRdoContractId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
                  >
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Condição Climática *</label>
                  <select
                    value={rdoWeather}
                    onChange={(e) => setRdoWeather(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
                  >
                    {WEATHER_OPTIONS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mão de Obra Presente */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="font-bold text-slate-200 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Efetivo de Campo Presente na Obra (Quantidade de Profissionais)</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Caldeireiros</label>
                    <input
                      type="number"
                      min="0"
                      value={rdoCaldeireiros}
                      onChange={(e) => setRdoCaldeireiros(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Soldadores TIG</label>
                    <input
                      type="number"
                      min="0"
                      value={rdoSoldadores}
                      onChange={(e) => setRdoSoldadores(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Montadores</label>
                    <input
                      type="number"
                      min="0"
                      value={rdoMontadores}
                      onChange={(e) => setRdoMontadores(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Ajudantes</label>
                    <input
                      type="number"
                      min="0"
                      value={rdoAjudantes}
                      onChange={(e) => setRdoAjudantes(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Supervisores</label>
                    <input
                      type="number"
                      min="0"
                      value={rdoSupervisores}
                      onChange={(e) => setRdoSupervisores(parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Equipamentos Mobilizados */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Maquinário & Equipamentos em Operação</label>
                <input
                  type="text"
                  value={rdoEquipamentos}
                  onChange={(e) => setRdoEquipamentos(e.target.value)}
                  placeholder="Ex: 2 Inversoras TIG Miller, 1 Andaime Tubular, 1 Caminhão Munck"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Atividades Executadas */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Atividades Executadas no Dia *</label>
                <textarea
                  rows={3}
                  required
                  value={rdoActivities}
                  onChange={(e) => setRdoActivities(e.target.value)}
                  placeholder="Descreva as tarefas de montagem, tubulações instaladas, juntas soldadas em inox, testes realizados..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Impedimentos / Ocorrências do Cliente */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Ocorrências / Paralisações / Impedimentos do Cliente (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={rdoImpediments}
                  onChange={(e) => setRdoImpediments(e.target.value)}
                  placeholder="Ex: Falta de liberação de Permissão de Trabalho (PTA) pela segurança do cliente até 10h; falta de energia no setor..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Fundamental para justificar eventuais prorrogações de prazo de entrega.
                </span>
              </div>

              {/* Fotos do Dia da Obra */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Registro Fotográfico da Obra</span>
                  <label className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer border border-slate-700 text-xs flex items-center space-x-1.5 transition-colors">
                    <Camera className="w-3.5 h-3.5 text-amber-400" />
                    <span>Adicionar Foto</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
                {rdoPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {rdoPhotos.map((p, idx) => (
                      <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                        <img src={p} alt={`Foto ${idx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setRdoPhotos(rdoPhotos.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-red-950/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRdoModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow-md disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Gravando RDO...' : 'Emitir Relatório Diário de Obra'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Visualizar / Imprimir RDO */}
      {showPrintModal && selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 text-xs text-slate-200">
            {/* Action Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="font-bold text-amber-400 text-sm">Visualização do Diário de Obra</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center space-x-1.5 cursor-pointer text-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Relatório</span>
                </button>
                <button
                  onClick={() => {
                    setShowPrintModal(false);
                    setSelectedReport(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Timbrador Aguero Inox */}
            <div className="mt-4 p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 print:bg-white print:text-black">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <BrandLogo size="md" background="dark" />
                  <div>
                    <h3 className="text-base font-extrabold text-white tracking-wide">
                      {organization?.name || 'AGUERO INOX'}
                    </h3>
                    <p className="text-[11px] text-cyan-400">
                      Caldeiraria & Soluções Industriais em Aço Inox
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-amber-400 block">
                    {selectedReport.reportNumber}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Data: {new Date(selectedReport.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Informações da Obra */}
              <div className="grid grid-cols-2 gap-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Obra / Contrato</span>
                  <span className="font-bold text-white">
                    {contracts.find((c) => c.id === selectedReport.contractId)?.name || 'Contrato de Montagem & Caldeiraria'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Condição Climática</span>
                  <span className="font-bold text-amber-300 uppercase">
                    {WEATHER_OPTIONS.find((w) => w.id === selectedReport.weather)?.label}
                  </span>
                </div>
              </div>

              {/* Efetivo Presente */}
              <div>
                <h4 className="font-bold text-slate-300 text-[11px] uppercase mb-1.5">
                  Efetivo em Campo
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {selectedReport.workforce?.map((w, i) => (
                    <div key={i} className="p-2 rounded bg-slate-950 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block truncate">{w.role}</span>
                      <span className="font-mono font-bold text-sm text-cyan-400">{w.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Atividades Executadas */}
              <div>
                <h4 className="font-bold text-slate-300 text-[11px] uppercase mb-1">
                  Atividades Executadas no Dia
                </h4>
                <p className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedReport.activitiesCompleted}
                </p>
              </div>

              {/* Impedimentos */}
              {selectedReport.impedimentsOrStoppages && (
                <div className="p-3 rounded-lg bg-red-950/30 border border-red-800/60 text-red-200">
                  <strong className="block text-red-400 font-bold mb-1">
                    Impedimentos / Paralisações Geradas pelo Cliente:
                  </strong>
                  <p>{selectedReport.impedimentsOrStoppages}</p>
                </div>
              )}

              {/* Fotos */}
              {selectedReport.photos && selectedReport.photos.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-300 text-[11px] uppercase mb-2">
                    Evidências Fotográficas do Dia
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {selectedReport.photos.map((p, idx) => (
                      <img key={idx} src={p} alt="Foto" className="w-full h-24 object-cover rounded-lg border border-slate-700" />
                    ))}
                  </div>
                </div>
              )}

              {/* Assinatura */}
              <div className="pt-4 border-t border-slate-800 grid grid-cols-2 gap-4 text-center">
                <div className="p-3 border-t border-slate-700">
                  <span className="font-bold text-slate-300 block">{selectedReport.preparedBy}</span>
                  <span className="text-[10px] text-slate-500">Responsável Técnico Aguero Inox</span>
                </div>
                <div className="p-3 border-t border-slate-700">
                  <span className="font-bold text-slate-300 block">Fiscal da Obra / Contratante</span>
                  <span className="text-[10px] text-slate-500">Aceite da Frente de Trabalho</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Configurar Turnos de Trabalho & Regras de Cálculo */}
      {showShiftConfigModal && organization && (
        <WorkShiftConfigModal
          organizationId={organization.id}
          onClose={() => setShowShiftConfigModal(false)}
        />
      )}
    </div>
  );
};
