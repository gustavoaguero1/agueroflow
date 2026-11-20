import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  FieldWorker,
  WorkShift,
  OvertimeCalculationRules,
  NRRegulatoryCertification,
} from '../../types';
import {
  Users,
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  Award,
  Calendar,
  Building,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  FileText,
  Paperclip,
  Download,
  Eye,
  ShieldAlert,
  Bell,
  ChevronDown,
  ChevronUp,
  Filter,
  ExternalLink,
  HardHat,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ExpandedWorkerFormModal } from './ExpandedWorkerFormModal';
import { parseRegulatoryDocumentWithAI } from '../../services/aiDocumentScanner';
import { syncAllRhEmployeesToFieldWorkers } from '../../services/rhPayrollService';

interface FieldPersonnelManagerProps {
  organizationId: string;
  canViewFinancials?: boolean;
}

// Preset NR standards with suggested descriptions
const STANDARD_NR_OPTIONS = [
  { code: 'NR-35', title: 'Trabalho em Altura', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'NR-33', title: 'Espaço Confinado (Trabalhador & Vigia)', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'NR-10', title: 'Segurança em Instalações Elétricas', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'NR-12', title: 'Segurança no Trabalho em Máquinas e Equipamentos', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'NR-18', title: 'Condições de Segurança na Indústria da Construção', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'NR-06', title: 'Equipamentos de Proteção Individual (EPI)', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'NR-20', title: 'Segurança com Inflamáveis e Combustíveis', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'ASO', title: 'Atestado de Saúde Ocupacional (Periódico / Admissional)', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
  { code: 'Outra', title: 'Outra Certificação / Qualificação Técnica', defaultDaysWarning: 30, defaultDaysCritical: 10, defaultDaysUrgent: 1 },
];

export interface CertificationAlertInfo {
  status: 'sem_data' | 'vencido' | 'critico' | 'medio' | 'alerta' | 'em_dia';
  daysRemaining: number;
  label: string;
  badgeClass: string;
  iconClass: string;
  urgencyLevel: 'vencido' | 'critica' | 'media' | 'baixa' | 'nenhuma';
}

// Dynamic calculation of certification alert urgency based on user-programmed thresholds
export function getCertificationAlertStatus(cert: NRRegulatoryCertification): CertificationAlertInfo {
  if (!cert.expirationDate) {
    return {
      status: 'sem_data',
      daysRemaining: 0,
      label: 'Sem data de vencimento',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
      iconClass: 'text-slate-400',
      urgencyLevel: 'nenhuma',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(cert.expirationDate + 'T00:00:00');
  const diffTime = exp.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const alertUrgent = Number(cert.alertDaysUrgent) >= 0 ? Number(cert.alertDaysUrgent) : 1;
  const alertCritical = Number(cert.alertDaysCritical) >= 0 ? Number(cert.alertDaysCritical) : 10;
  const alertWarning = Number(cert.alertDaysWarning) >= 0 ? Number(cert.alertDaysWarning) : 30;

  if (diffDays < 0) {
    return {
      status: 'vencido',
      daysRemaining: diffDays,
      label: `Vencido há ${Math.abs(diffDays)} dia(s)`,
      badgeClass: 'bg-red-950/80 text-red-300 border border-red-700 font-bold animate-pulse',
      iconClass: 'text-red-400',
      urgencyLevel: 'vencido',
    };
  }
  if (diffDays <= alertUrgent) {
    return {
      status: 'critico',
      daysRemaining: diffDays,
      label: diffDays === 0 ? 'Vence HOJE (Crítico)' : `Vence em ${diffDays} dia (Urgência Crítica)`,
      badgeClass: 'bg-rose-950/90 text-rose-200 border border-rose-600 font-bold',
      iconClass: 'text-rose-400',
      urgencyLevel: 'critica',
    };
  }
  if (diffDays <= alertCritical) {
    return {
      status: 'medio',
      daysRemaining: diffDays,
      label: `Vence em ${diffDays} dias (Urgência Média)`,
      badgeClass: 'bg-amber-950/70 text-amber-300 border border-amber-600',
      iconClass: 'text-amber-400',
      urgencyLevel: 'media',
    };
  }
  if (diffDays <= alertWarning) {
    return {
      status: 'alerta',
      daysRemaining: diffDays,
      label: `Vence em ${diffDays} dias (Atenção)`,
      badgeClass: 'bg-yellow-950/50 text-yellow-300 border border-yellow-700/60',
      iconClass: 'text-yellow-400',
      urgencyLevel: 'baixa',
    };
  }
  return {
    status: 'em_dia',
    daysRemaining: diffDays,
    label: `Válido (${diffDays}d restantes)`,
    badgeClass: 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60',
    iconClass: 'text-emerald-400',
    urgencyLevel: 'nenhuma',
  };
}

export const FieldPersonnelManager: React.FC<FieldPersonnelManagerProps> = ({
  organizationId,
  canViewFinancials = true,
}) => {
  const [workers, setWorkers] = useState<FieldWorker[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('todos');
  const [siteFilter, setSiteFilter] = useState('todos');
  const [filterExpiringOnly, setFilterExpiringOnly] = useState(false);
  const [showNotificationsBanner, setShowNotificationsBanner] = useState(true);

  // Modal State: Collaborator Create / Edit
  const [showModal, setShowModal] = useState(false);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<FieldWorker | null>(null);
  const [viewingHistoryWorker, setViewingHistoryWorker] = useState<FieldWorker | null>(null);
  const [aiAnalyzingCertId, setAiAnalyzingCertId] = useState<string | null>(null);

  // Document Viewer Modal State
  const [viewingDoc, setViewingDoc] = useState<{
    workerName: string;
    certTitle: string;
    nrCode: string;
    url: string;
    fileName: string;
    type?: string;
  } | null>(null);

  // Form State: strictly empty strings, no pre-filled values
  const [formName, setFormName] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formBaseSalary, setFormBaseSalary] = useState('');
  const [formCurrentSite, setFormCurrentSite] = useState('');
  const [formStatus, setFormStatus] = useState<FieldWorker['status']>('ativo');
  const [formAdmissionDate, setFormAdmissionDate] = useState('');
  const [formSalaryReason, setFormSalaryReason] = useState('');
  const [formShiftId, setFormShiftId] = useState('');
  const [formHasCustomRules, setFormHasCustomRules] = useState(false);
  const [formCustomOt50, setFormCustomOt50] = useState('');
  const [formCustomOt100, setFormCustomOt100] = useState('');
  const [formCustomTravel, setFormCustomTravel] = useState('');
  const [formCustomNight, setFormCustomNight] = useState('');

  // Structured NRs state for creation/edition
  const [formNrCertifications, setFormNrCertifications] = useState<NRRegulatoryCertification[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingRh, setIsSyncingRh] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Sincronização automática na montagem para assegurar que novos colaboradores do RH apareçam no Módulo 13
  useEffect(() => {
    if (!organizationId) return;
    syncAllRhEmployeesToFieldWorkers(organizationId).catch((err) => {
      console.warn('Erro ao sincronizar colaboradores do RH para o Módulo 13:', err);
    });
  }, [organizationId]);

  // Sincronização sob demanda via botão
  const handleSyncFromRh = async () => {
    if (!organizationId) return;
    setIsSyncingRh(true);
    setSyncFeedback(null);
    try {
      const count = await syncAllRhEmployeesToFieldWorkers(organizationId);
      setSyncFeedback(
        count > 0
          ? `${count} colaboradores do RH / Salários sincronizados com sucesso!`
          : 'Todos os colaboradores do RH já estão sincronizados com este canteiro.'
      );
      setTimeout(() => setSyncFeedback(null), 5000);
    } catch (err: any) {
      setSyncFeedback(`Erro na sincronização: ${err.message || 'Falha de comunicação'}`);
    } finally {
      setIsSyncingRh(false);
    }
  };

  // Listen to workers & shifts in Firestore
  useEffect(() => {
    if (!organizationId) return;
    const qW = query(collection(db, 'field_workers'), where('orgId', '==', organizationId));
    const unsubW = onSnapshot(qW, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FieldWorker));
      setWorkers(list);
    });

    const qS = query(collection(db, 'work_shifts'), where('orgId', '==', organizationId));
    const unsubS = onSnapshot(qS, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkShift));
      setShifts(list);
    });

    return () => {
      unsubW();
      unsubS();
    };
  }, [organizationId]);

  // Open Create Modal - everything blank for typing
  const handleOpenCreate = () => {
    setEditingWorker(null);
    setFormName('');
    setFormCpf('');
    setFormRole('');
    setFormBaseSalary('');
    setFormCurrentSite('');
    setFormStatus('ativo');
    setFormAdmissionDate('');
    setFormSalaryReason('');
    setFormShiftId('');
    setFormHasCustomRules(false);
    setFormCustomOt50('');
    setFormCustomOt100('');
    setFormCustomTravel('');
    setFormCustomNight('');
    setFormNrCertifications([]);
    setShowModal(true);
  };

  // Open Edit Modal - loads existing worker data
  const handleOpenEdit = (w: FieldWorker) => {
    setEditingWorker(w);
    setFormName(w.name || '');
    setFormCpf(w.cpf || '');
    setFormRole(w.role || '');
    setFormBaseSalary(w.baseSalary ? w.baseSalary.toString() : '');
    setFormCurrentSite(w.currentSite || '');
    setFormStatus(w.status || 'ativo');
    setFormAdmissionDate(w.admissionDate || '');
    setFormSalaryReason('');
    setFormShiftId(w.shiftId || '');
    setFormHasCustomRules(!!w.customCalculationRules);
    setFormCustomOt50(w.customCalculationRules?.overtime50Multiplier?.toString() || '');
    setFormCustomOt100(w.customCalculationRules?.overtime100Multiplier?.toString() || '');
    setFormCustomTravel(w.customCalculationRules?.travelHourMultiplier?.toString() || '');
    setFormCustomNight(w.customCalculationRules?.nightShiftBonusPercent?.toString() || '');

    // Load structured NRs or convert legacy certifications
    if (w.nrCertifications && w.nrCertifications.length > 0) {
      setFormNrCertifications(w.nrCertifications);
    } else if (w.certifications && w.certifications.length > 0) {
      const legacyConverted: NRRegulatoryCertification[] = w.certifications.map((c, i) => {
        let code = 'Outra';
        for (const std of STANDARD_NR_OPTIONS) {
          if (c.toUpperCase().includes(std.code)) {
            code = std.code;
            break;
          }
        }
        return {
          id: `nr_leg_${Date.now()}_${i}`,
          nrCode: code,
          title: c,
          expirationDate: '',
          alertDaysWarning: 30,
          alertDaysCritical: 10,
          alertDaysUrgent: 1,
        };
      });
      setFormNrCertifications(legacyConverted);
    } else {
      setFormNrCertifications([]);
    }

    setShowModal(true);
  };

  // Add a new NR to the list in form
  const handleAddNrCertification = () => {
    const newCert: NRRegulatoryCertification = {
      id: `nr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nrCode: 'NR-35',
      title: 'Trabalho em Altura',
      issueDate: '',
      expirationDate: '',
      certificateNumber: '',
      issuingEntity: '',
      alertDaysWarning: 30,
      alertDaysCritical: 10,
      alertDaysUrgent: 1,
      notes: '',
    };
    setFormNrCertifications((prev) => [...prev, newCert]);
  };

  // Update specific field in an NR item
  const handleUpdateNrItem = (id: string, updates: Partial<NRRegulatoryCertification>) => {
    setFormNrCertifications((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...updates };
        // If nrCode changed, suggest matching title if not custom typed
        if (updates.nrCode && updates.nrCode !== c.nrCode) {
          const match = STANDARD_NR_OPTIONS.find((o) => o.code === updates.nrCode);
          if (match && match.code !== 'Outra') {
            updated.title = match.title;
          }
        }
        return updated;
      })
    );
  };

  // Remove an NR item from list
  const handleRemoveNrItem = (id: string) => {
    setFormNrCertifications((prev) => prev.filter((c) => c.id !== id));
  };

  // Handle Document File Upload for a specific NR with AI auto-detection
  const handleNrFileUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('O arquivo selecionado excede o limite máximo de 15MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        handleUpdateNrItem(id, {
          documentUrl: dataUrl,
          documentName: file.name,
          documentType: file.type || file.name.split('.').pop(),
        });

        // Trigger AI analysis in background
        setAiAnalyzingCertId(id);
        try {
          const result = await parseRegulatoryDocumentWithAI(dataUrl, file.name, file.type || 'application/pdf');
          if (result.success && result.data) {
            const d = result.data;
            const updates: Partial<NRRegulatoryCertification> = {};
            if (d.expirationDate) updates.expirationDate = d.expirationDate;
            if (d.issueDate) updates.issueDate = d.issueDate;
            if (d.certificateNumber) updates.certificateNumber = d.certificateNumber;
            if (d.issuingEntity) updates.issuingEntity = d.issuingEntity;
            if (d.nrCode && d.nrCode !== 'Outra') {
              updates.nrCode = d.nrCode;
              const match = STANDARD_NR_OPTIONS.find((o) => o.code === d.nrCode);
              if (match) updates.title = d.title || match.title;
            } else if (d.title) {
              updates.title = d.title;
            }
            handleUpdateNrItem(id, updates);
          }
        } catch (err) {
          console.error('Erro na análise de documento:', err);
        } finally {
          setAiAnalyzingCertId(null);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Remove attached document from an NR
  const handleRemoveNrDocument = (id: string) => {
    handleUpdateNrItem(id, {
      documentUrl: undefined,
      documentName: undefined,
      documentType: undefined,
    });
  };

  // Save Worker to Firestore
  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const salaryNum = parseFloat(formBaseSalary) || 0;
      const hourlyCalculated = Number((salaryNum / 220).toFixed(2));

      // Build readable string array for legacy backward compatibility
      const certsArray = formNrCertifications.map(
        (c) => `${c.nrCode}${c.title ? ` - ${c.title}` : ''}`
      );

      const shiftObj = shifts.find((s) => s.id === formShiftId);
      const customRules = formHasCustomRules
        ? {
            overtime50Multiplier: parseFloat(formCustomOt50) || 1.5,
            overtime100Multiplier: parseFloat(formCustomOt100) || 2.0,
            travelHourMultiplier: parseFloat(formCustomTravel) || 1.0,
            nightShiftBonusPercent: parseFloat(formCustomNight) || 20,
          }
        : undefined;

      if (editingWorker) {
        // Record salary/role change history
        let history = editingWorker.salaryHistory || [];
        if (salaryNum !== editingWorker.baseSalary || formRole.trim() !== editingWorker.role) {
          history = [
            ...history,
            {
              date: new Date().toISOString().split('T')[0],
              previousSalary: editingWorker.baseSalary,
              newSalary: salaryNum,
              previousRole: editingWorker.role,
              newRole: formRole.trim(),
              reason: formSalaryReason.trim() || 'Alteração cadastral de remuneração / cargo',
            },
          ];
        }

        await updateDoc(doc(db, 'field_workers', editingWorker.id), {
          name: formName.trim(),
          cpf: formCpf.trim(),
          role: formRole.trim(),
          baseSalary: salaryNum,
          hourlyRate: hourlyCalculated,
          currentSite: formCurrentSite.trim(),
          status: formStatus,
          admissionDate: formAdmissionDate,
          shiftId: formShiftId || undefined,
          shiftName: shiftObj?.name || undefined,
          customCalculationRules: customRules,
          certifications: certsArray,
          nrCertifications: formNrCertifications,
          salaryHistory: history,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const id = `w_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newWorker: FieldWorker = {
          id,
          orgId: organizationId,
          name: formName.trim(),
          cpf: formCpf.trim(),
          role: formRole.trim(),
          baseSalary: salaryNum,
          hourlyRate: hourlyCalculated,
          currentSite: formCurrentSite.trim(),
          status: formStatus,
          admissionDate: formAdmissionDate,
          shiftId: formShiftId || undefined,
          shiftName: shiftObj?.name || undefined,
          customCalculationRules: customRules,
          certifications: certsArray,
          nrCertifications: formNrCertifications,
          salaryHistory: [
            {
              date: formAdmissionDate || new Date().toISOString().split('T')[0],
              previousSalary: 0,
              newSalary: salaryNum,
              previousRole: 'Admissão',
              newRole: formRole.trim(),
              reason: 'Contratação inicial de obra',
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'field_workers', id), newWorker);
      }

      setShowModal(false);
    } catch (err) {
      console.error('Erro ao salvar colaborador:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete worker
  const handleDeleteWorker = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o colaborador "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'field_workers', id));
    } catch (err) {
      console.error('Erro ao deletar colaborador:', err);
    }
  };

  // Compile global NR certification alert statistics across all active workers
  const globalAlertStats = useMemo(() => {
    let expired = 0;
    let critical = 0;
    let medium = 0;
    let warning = 0;
    let upToDate = 0;

    const expiringItems: {
      workerId: string;
      workerName: string;
      workerRole: string;
      workerSite: string;
      cert: NRRegulatoryCertification;
      alert: CertificationAlertInfo;
    }[] = [];

    workers.forEach((w) => {
      (w.nrCertifications || []).forEach((c) => {
        const alert = getCertificationAlertStatus(c);
        if (alert.urgencyLevel === 'vencido') expired++;
        else if (alert.urgencyLevel === 'critica') critical++;
        else if (alert.urgencyLevel === 'media') medium++;
        else if (alert.urgencyLevel === 'baixa') warning++;
        else if (alert.status === 'em_dia') upToDate++;

        if (alert.urgencyLevel !== 'nenhuma') {
          expiringItems.push({
            workerId: w.id,
            workerName: w.name,
            workerRole: w.role,
            workerSite: w.currentSite,
            cert: c,
            alert,
          });
        }
      });
    });

    // Sort by remaining days ascending (most urgent first)
    expiringItems.sort((a, b) => a.alert.daysRemaining - b.alert.daysRemaining);

    return {
      expired,
      critical,
      medium,
      warning,
      upToDate,
      totalPending: expired + critical + medium + warning,
      expiringItems,
    };
  }, [workers]);

  // Filtered workers list
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const matchSearch =
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.cpf.includes(searchQuery) ||
        w.currentSite.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.nrCertifications || []).some(
          (c) =>
            c.nrCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.title.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchRole = roleFilter === 'todos' || w.role.toLowerCase().includes(roleFilter.toLowerCase());
      const matchSite = siteFilter === 'todos' || w.currentSite.toLowerCase().includes(siteFilter.toLowerCase());

      const hasExpiringOrExpired = (w.nrCertifications || []).some((c) => {
        const alert = getCertificationAlertStatus(c);
        return alert.urgencyLevel !== 'nenhuma';
      });

      const matchExpiring = !filterExpiringOnly || hasExpiringOrExpired;

      return matchSearch && matchRole && matchSite && matchExpiring;
    });
  }, [workers, searchQuery, roleFilter, siteFilter, filterExpiringOnly]);

  const totalPayroll = workers.reduce((acc, w) => acc + (w.baseSalary || 0), 0);
  const activeCount = workers.filter((w) => w.status === 'ativo').length;

  return (
    <div className="space-y-4">
      {/* Top Notification Banner: Expiration of Regulatory Norms (NRs) */}
      {globalAlertStats.totalPending > 0 && showNotificationsBanner && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/70 via-slate-900 to-amber-950/60 border border-red-800/60 shadow-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Monitor de Vencimento de Normas Regulamentadoras (NRs)</span>
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                    {globalAlertStats.totalPending} alerta(s)
                  </span>
                </h4>
                <p className="text-xs text-slate-400">
                  Documentos de segurança do trabalho com vencimento crítico programado ou expirados. Evite paralisações de frente de obra.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFilterExpiringOnly(!filterExpiringOnly)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  filterExpiringOnly
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                {filterExpiringOnly ? 'Mostrando Apenas Alertas (Limpar Filtro)' : 'Filtrar Colaboradores com Alertas'}
              </button>

              <button
                onClick={() => setShowNotificationsBanner(false)}
                className="text-slate-400 hover:text-white p-1"
                title="Ocultar banner temporariamente"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Urgency Badges List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
            {globalAlertStats.expiringItems.slice(0, 6).map((item, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-white truncate block">{item.workerName}</span>
                  <span className="text-[11px] text-slate-400 truncate block">
                    {item.cert.nrCode} • {item.cert.title}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Vencimento: {item.cert.expirationDate || 'N/A'}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] block ${item.alert.badgeClass}`}>
                    {item.alert.label}
                  </span>
                  {item.cert.documentUrl && (
                    <button
                      onClick={() =>
                        setViewingDoc({
                          workerName: item.workerName,
                          certTitle: item.cert.title,
                          nrCode: item.cert.nrCode,
                          url: item.cert.documentUrl!,
                          fileName: item.cert.documentName || 'Certificado.pdf',
                          type: item.cert.documentType,
                        })
                      }
                      className="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300 inline-flex items-center space-x-1 underline cursor-pointer"
                    >
                      <Paperclip className="w-3 h-3" />
                      <span>Ver Anexo</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Equipe em Campo</span>
            <strong className="text-lg text-white font-mono">{activeCount} ativos</strong>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Folha Base de Campo</span>
            <strong className="text-lg text-emerald-400 font-mono">
              {canViewFinancials
                ? `R$ ${totalPayroll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : 'R$ ••••••'}
            </strong>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Custo Médio / Hora</span>
            <strong className="text-lg text-purple-300 font-mono">
              {workers.length > 0
                ? `R$ ${(totalPayroll / (workers.length * 220)).toFixed(2)}/h`
                : 'R$ 0,00/h'}
            </strong>
          </div>
        </div>

        {/* NRs Compliance KPI Card */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
          <div
            className={`p-2.5 rounded-lg ${
              globalAlertStats.totalPending > 0
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}
          >
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">Conformidade NRs</span>
            {globalAlertStats.totalPending > 0 ? (
              <div className="flex items-center space-x-1.5 text-xs">
                {globalAlertStats.expired > 0 && (
                  <span className="font-bold text-red-400 font-mono">{globalAlertStats.expired} vencida(s)</span>
                )}
                {globalAlertStats.critical > 0 && (
                  <span className="font-bold text-rose-400 font-mono">
                    {globalAlertStats.critical} crít. (&le;1d)
                  </span>
                )}
                {globalAlertStats.medium > 0 && (
                  <span className="text-amber-300 font-mono">
                    {globalAlertStats.medium} méd. (&le;10d)
                  </span>
                )}
              </div>
            ) : (
              <strong className="text-sm text-emerald-400">100% em dia</strong>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar colaborador, CPF, cargo, obra ou NR..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => setFilterExpiringOnly(!filterExpiringOnly)}
            className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              filterExpiringOnly
                ? 'bg-amber-600 text-slate-950 font-bold border-amber-500'
                : 'bg-slate-950 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Apenas NRs em Alerta ({globalAlertStats.totalPending})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center space-x-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleSyncFromRh}
            disabled={isSyncingRh}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow cursor-pointer transition-colors disabled:opacity-50"
            title="Importar e sincronizar colaboradores cadastrados no Módulo de RH / Salários"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRh ? 'animate-spin' : ''}`} />
            <span>{isSyncingRh ? 'Sincronizando...' : 'Sincronizar do RH'}</span>
          </button>

          <button
            onClick={() => {
              setEditingWorker(null);
              setShowExpandedModal(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow cursor-pointer transition-colors"
            title="Formulário completo com upload de certificados, catálogo de NRs e prazos customizados de notificação"
          >
            <Award className="w-3.5 h-3.5 text-emerald-200" />
            <span>Cadastro Expandido (NRs & Anexos)</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Colaborador</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3 bg-indigo-950/70 border border-indigo-700/60 rounded-xl text-xs text-indigo-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{syncFeedback}</span>
          </div>
          <button onClick={() => setSyncFeedback(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Workers Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 font-semibold">
                <th className="py-3 px-3">Colaborador & CPF</th>
                <th className="py-3 px-3">Cargo Atual</th>
                <th className="py-3 px-3">Obra / Alocação</th>
                <th className="py-3 px-3">Salário Base</th>
                <th className="py-3 px-3">Valor / Hora</th>
                <th className="py-3 px-3 min-w-[280px]">Normas Regulamentadoras (NRs) & Documentos</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 text-xs">
                    Nenhum colaborador encontrado com os filtros atuais. Clique em "+ Novo Colaborador" para cadastrar.
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-white block font-medium">{w.name || 'Sem nome'}</strong>
                        {w.id.startsWith('fw_') && (
                          <span
                            className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-semibold border border-indigo-800"
                            title="Colaborador cadastrado primordialmente no Módulo RH / Salários"
                          >
                            RH Salários
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{w.cpf || 'Sem CPF'}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                        {w.role || 'Sem cargo'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-slate-300 flex items-center space-x-1">
                        <Building className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{w.currentSite || 'Não alocado'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-200">
                      {canViewFinancials
                        ? `R$ ${(w.baseSalary || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : 'R$ ••••••'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                      {canViewFinancials ? `R$ ${(w.hourlyRate || 0).toFixed(2)}/h` : 'R$ ••/h'}
                    </td>
                    <td className="py-2.5 px-3">
                      {w.nrCertifications && w.nrCertifications.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {w.nrCertifications.map((c, i) => {
                            const alert = getCertificationAlertStatus(c);
                            return (
                              <div
                                key={i}
                                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] ${alert.badgeClass}`}
                                title={`${c.title} • Vencimento: ${c.expirationDate || 'N/A'} • ${alert.label}`}
                              >
                                <span className="font-bold">{c.nrCode}</span>
                                <span>•</span>
                                <span>{alert.label}</span>
                                {c.documentUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewingDoc({
                                        workerName: w.name,
                                        certTitle: c.title,
                                        nrCode: c.nrCode,
                                        url: c.documentUrl!,
                                        fileName: c.documentName || `${c.nrCode}_Certificado.pdf`,
                                        type: c.documentType,
                                      })
                                    }
                                    className="p-0.5 hover:text-white text-cyan-300 ml-0.5"
                                    title="Visualizar documento anexado"
                                  >
                                    <Paperclip className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(w.certifications || []).map((c, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 text-[10px]"
                            >
                              {c}
                            </span>
                          ))}
                          {(!w.certifications || w.certifications.length === 0) && (
                            <span className="text-slate-500 text-[10px] italic">Nenhuma NR cadastrada</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          w.status === 'ativo'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => setViewingHistoryWorker(w)}
                          className="p-1 rounded hover:bg-slate-800 text-purple-400 hover:text-purple-300 cursor-pointer"
                          title="Ver histórico salarial e promoções"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingWorker(w);
                            setShowExpandedModal(true);
                          }}
                          className="p-1 rounded hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                          title="Ficha completa de NRs & Certificados (Upload, Prazos de Vencimento e Anexos)"
                        >
                          <Award className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(w)}
                          className="p-1 rounded hover:bg-slate-800 text-blue-400 hover:text-blue-300 cursor-pointer"
                          title="Editar colaborador e NRs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteWorker(w.id, w.name)}
                          className="p-1 rounded hover:bg-slate-800 text-red-400 hover:text-red-300 cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create/Edit Worker with Elaborate NRs, Document Attachments & Programmed Urgency Alerts */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl my-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <HardHat className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {editingWorker ? 'Editar Colaborador & Normas Regulamentadoras' : 'Novo Colaborador de Obra'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cadastre os dados pessoais, remuneração e gerencie as certificações com alerta de vencimento.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWorker} className="space-y-5 text-xs">
              {/* Section 1: Dados Pessoais & Operacionais (Blank for Typing) */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>1. Dados Cadastrais & Operacionais</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Digite o nome completo do colaborador"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">CPF *</label>
                    <input
                      type="text"
                      required
                      value={formCpf}
                      onChange={(e) => setFormCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Cargo / Função *</label>
                    <input
                      type="text"
                      required
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      placeholder="Digite o cargo (ex: Serralheiro, Soldador TIG)"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Obra / Alocação Inicial</label>
                    <input
                      type="text"
                      value={formCurrentSite}
                      onChange={(e) => setFormCurrentSite(e.target.value)}
                      placeholder="Digite a obra ou local alocado"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Data de Admissão</label>
                    <input
                      type="date"
                      value={formAdmissionDate}
                      onChange={(e) => setFormAdmissionDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Salário Base Mensal (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formBaseSalary}
                      onChange={(e) => setFormBaseSalary(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Cálculo de hora: R${' '}
                      {formBaseSalary ? (parseFloat(formBaseSalary) / 220 || 0).toFixed(2) : '0.00'}/hora (divisor 220h)
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Status Operacional</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="em_ferias">Em Férias</option>
                      <option value="afastado">Afastado</option>
                      <option value="desligado">Desligado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Normas Regulamentadoras (NRs), Documentos & Prazos de Alerta de Vencimento */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-amber-300 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>2. Normas Regulamentadoras (NRs), Certificações & ASO</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Anexe o documento, aponte a data de vencimento e programe avisos de urgência antes de vencer.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddNrCertification}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar NR / Certificação</span>
                  </button>
                </div>

                {formNrCertifications.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-center space-y-2">
                    <p className="text-slate-400 text-xs">
                      Nenhuma Norma Regulamentadora (NR) associada a este colaborador ainda.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Clique no botão acima para adicionar certificações como NR-35 (Altura), NR-33 (Espaço Confinado), NR-10 (Elétrica) ou ASO.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddNrCertification}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold cursor-pointer text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Incluir Primeira Certificação</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formNrCertifications.map((cert, index) => {
                      const alertPreview = getCertificationAlertStatus(cert);
                      return (
                        <div
                          key={cert.id}
                          className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 relative group"
                        >
                          {/* Item Header */}
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-[10px]">
                                {index + 1}
                              </span>
                              <span className="font-bold text-white text-xs">
                                {cert.nrCode} {cert.title ? `— ${cert.title}` : ''}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2">
                              {/* Live alert preview pill */}
                              <span className={`px-2 py-0.5 rounded text-[10px] ${alertPreview.badgeClass}`}>
                                {alertPreview.label}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRemoveNrItem(cert.id)}
                                className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                                title="Remover esta certificação"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Row 1: Identification */}
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <div>
                              <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                                Identificação da Norma *
                              </label>
                              <select
                                value={cert.nrCode}
                                onChange={(e) => handleUpdateNrItem(cert.id, { nrCode: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 cursor-pointer text-xs"
                              >
                                {STANDARD_NR_OPTIONS.map((opt) => (
                                  <option key={opt.code} value={opt.code}>
                                    {opt.code} {opt.code !== 'Outra' ? `(${opt.title})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                                Título / Treinamento Realizado *
                              </label>
                              <input
                                type="text"
                                required
                                value={cert.title}
                                onChange={(e) => handleUpdateNrItem(cert.id, { title: e.target.value })}
                                placeholder="Ex: Trabalho em Altura - 8h"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                              >
                              </input>
                            </div>

                            <div>
                              <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                                Nº Certificado / Registro
                              </label>
                              <input
                                type="text"
                                value={cert.certificateNumber || ''}
                                onChange={(e) => handleUpdateNrItem(cert.id, { certificateNumber: e.target.value })}
                                placeholder="Registro/ART"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                              />
                            </div>
                          </div>

                          {/* Row 2: Dates */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                                Data de Emissão / Conclusão
                              </label>
                              <input
                                type="date"
                                value={cert.issueDate || ''}
                                onChange={(e) => handleUpdateNrItem(cert.id, { issueDate: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-amber-300 text-[11px] mb-1 font-bold flex items-center justify-between">
                                <span>Data de Vencimento *</span>
                                <span className="text-[10px] text-amber-400/80">Obrigatório</span>
                              </label>
                              <input
                                type="date"
                                required
                                value={cert.expirationDate}
                                onChange={(e) => handleUpdateNrItem(cert.id, { expirationDate: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-amber-500/80 text-white focus:outline-none focus:border-amber-400 font-mono font-bold text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                                Entidade / Clínica Emissora
                              </label>
                              <input
                                type="text"
                                value={cert.issuingEntity || ''}
                                onChange={(e) => handleUpdateNrItem(cert.id, { issuingEntity: e.target.value })}
                                placeholder="Ex: Escola Técnica / Medicina Ocupacional"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                              />
                            </div>
                          </div>

                          {/* Row 3: Programmed Urgency Notification Thresholds */}
                          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                            <div className="flex items-center space-x-1.5">
                              <Bell className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-bold text-slate-200 text-[11px]">
                                Programação de Avisos e Notificações Antes do Vencimento
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Especifique quantos dias antes de expirar o sistema deve sinalizar cada nível de urgência:
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                              <div>
                                <label className="block text-rose-300 text-[10px] font-semibold mb-0.5">
                                  🚨 Urgência Crítica (dias antes)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="365"
                                  required
                                  value={cert.alertDaysUrgent ?? 1}
                                  onChange={(e) =>
                                    handleUpdateNrItem(cert.id, { alertDaysUrgent: parseInt(e.target.value) || 0 })
                                  }
                                  placeholder="1"
                                  className="w-full px-2 py-1 rounded bg-slate-950 border border-rose-800 text-rose-200 font-mono font-bold text-xs focus:outline-none"
                                />
                                <span className="text-[9px] text-slate-500 block">Ex: 1 dia (Aviso crítico)</span>
                              </div>

                              <div>
                                <label className="block text-amber-300 text-[10px] font-semibold mb-0.5">
                                  ⚠️ Urgência Média (dias antes)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="365"
                                  required
                                  value={cert.alertDaysCritical ?? 10}
                                  onChange={(e) =>
                                    handleUpdateNrItem(cert.id, { alertDaysCritical: parseInt(e.target.value) || 0 })
                                  }
                                  placeholder="10"
                                  className="w-full px-2 py-1 rounded bg-slate-950 border border-amber-800 text-amber-200 font-mono font-bold text-xs focus:outline-none"
                                />
                                <span className="text-[9px] text-slate-500 block">Ex: 10 dias (Aviso médio)</span>
                              </div>

                              <div>
                                <label className="block text-yellow-300 text-[10px] font-semibold mb-0.5">
                                  🔔 Alerta Inicial (dias antes)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max="365"
                                  required
                                  value={cert.alertDaysWarning ?? 30}
                                  onChange={(e) =>
                                    handleUpdateNrItem(cert.id, { alertDaysWarning: parseInt(e.target.value) || 0 })
                                  }
                                  placeholder="30"
                                  className="w-full px-2 py-1 rounded bg-slate-950 border border-yellow-800 text-yellow-200 font-mono font-bold text-xs focus:outline-none"
                                />
                                <span className="text-[9px] text-slate-500 block">Ex: 30 dias (Atenção preventiva)</span>
                              </div>
                            </div>
                          </div>

                          {/* Row 4: Document Attachment (PDF or Image) */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                            <div className="flex items-center space-x-2">
                              <Paperclip className="w-4 h-4 text-slate-400" />
                              <div>
                                <span className="text-slate-300 font-semibold block text-[11px]">
                                  Documento Digital / Certificado Comprobatório
                                </span>
                                {cert.documentName ? (
                                  <span className="text-emerald-400 text-[10px] font-mono flex items-center space-x-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400 inline" />
                                    <span>{cert.documentName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[10px]">
                                    Nenhum arquivo anexado (aceita PDF ou imagens JPG/PNG)
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              {cert.documentUrl ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewingDoc({
                                        workerName: formName || 'Colaborador',
                                        certTitle: cert.title,
                                        nrCode: cert.nrCode,
                                        url: cert.documentUrl!,
                                        fileName: cert.documentName || 'Certificado.pdf',
                                        type: cert.documentType,
                                      })
                                    }
                                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium text-[11px] cursor-pointer"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Visualizar</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveNrDocument(cert.id)}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-red-950/60 text-red-300 text-[11px] cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Remover Anexo</span>
                                  </button>
                                </>
                              ) : aiAnalyzingCertId === cert.id ? (
                                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-purple-950/80 border border-purple-600/70 text-purple-200 text-xs animate-pulse">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
                                  <span>IA Extraindo Dados...</span>
                                </div>
                              ) : (
                                <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-semibold cursor-pointer text-xs transition-colors">
                                  <Paperclip className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Anexar (IA Extrai Vencimento)</span>
                                  <input
                                    type="file"
                                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                                    onChange={(e) => handleNrFileUpload(cert.id, e)}
                                    className="hidden"
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 3: Histórico de Ajuste Salarial (Quando em Edição) */}
              {editingWorker && (
                <div className="pt-3 border-t border-slate-800">
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Motivo do Ajuste Salarial / Cargo (Histórico)
                  </label>
                  <input
                    type="text"
                    value={formSalaryReason}
                    onChange={(e) => setFormSalaryReason(e.target.value)}
                    placeholder="Ex: Dissídio anual, promoção de categoria, mérito operacional..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 text-xs"
                  />
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Colaborador & NRs'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Salary & Promotion History */}
      {viewingHistoryWorker && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-white text-sm">Histórico Salarial & Evolução de Cargo</h3>
                <span className="text-xs text-blue-400 font-mono">{viewingHistoryWorker.name}</span>
              </div>
              <button
                onClick={() => setViewingHistoryWorker(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {viewingHistoryWorker.salaryHistory && viewingHistoryWorker.salaryHistory.length > 0 ? (
                <div className="space-y-2">
                  {viewingHistoryWorker.salaryHistory.map((h, i) => (
                    <div key={i} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-purple-300 font-bold">{h.date}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{h.reason}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-400">
                          {h.previousRole} → <strong className="text-white">{h.newRole}</strong>
                        </span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {h.previousSalary > 0 ? `R$ ${h.previousSalary} → ` : ''}R${' '}
                          {h.newSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                  Nenhuma alteração salarial registrada além da admissão.
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setViewingHistoryWorker(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Document Viewer & Download for Attached NR Certificates */}
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

            {/* Document Content Preview */}
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

      {/* Expanded Worker Form Modal (Complete NR catalog, document uploads, custom urgency alert days) */}
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
    </div>
  );
};
