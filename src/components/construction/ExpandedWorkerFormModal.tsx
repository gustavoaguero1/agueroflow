import React, { useState, useEffect } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  FieldWorker,
  WorkShift,
  NRRegulatoryCertification,
} from '../../types';
import {
  Users,
  Award,
  Calendar,
  Building,
  DollarSign,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Paperclip,
  Eye,
  Bell,
  HardHat,
  ShieldCheck,
  UploadCloud,
  FileCheck,
  Sparkles,
  Loader2,
  Bot,
  Zap,
} from 'lucide-react';
import { getCertificationAlertStatus } from './FieldPersonnelManager';
import { parseRegulatoryDocumentWithAI, quickDetectFromFilename } from '../../services/aiDocumentScanner';

interface ExpandedWorkerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  editingWorker?: FieldWorker | null;
  shifts?: WorkShift[];
  onSaved?: (workerId: string) => void;
}

export const STANDARD_NR_CATALOG = [
  {
    code: 'NR-35',
    title: 'Trabalho em Altura',
    description: 'Capacitação para atividades acima de 2 metros com risco de queda.',
    color: 'from-amber-600/30 to-amber-900/30 border-amber-600/50 text-amber-300',
    badge: 'Obrigatório em Montagem',
  },
  {
    code: 'NR-33',
    title: 'Espaço Confinado (Trabalhador & Vigia)',
    description: 'Segurança e saúde nos trabalhos em espaços confinados (tanques, silos).',
    color: 'from-purple-600/30 to-purple-900/30 border-purple-600/50 text-purple-300',
    badge: 'Crítico em Caldeiraria',
  },
  {
    code: 'NR-10',
    title: 'Segurança em Instalações e Serviços em Eletricidade',
    description: 'Segurança em instalações elétricas e serviços com eletricidade.',
    color: 'from-blue-600/30 to-blue-900/30 border-blue-600/50 text-blue-300',
    badge: 'Instalação Elétrica',
  },
  {
    code: 'NR-12',
    title: 'Segurança no Trabalho em Máquinas e Equipamentos',
    description: 'Operação de prensas, dobradeiras, guilhotinas e pontes rolantes.',
    color: 'from-cyan-600/30 to-cyan-900/30 border-cyan-600/50 text-cyan-300',
    badge: 'Oficina & Máquinas',
  },
  {
    code: 'NR-18',
    title: 'Condições e Meio Ambiente na Construção',
    description: 'Segurança e saúde no trabalho na indústria da construção.',
    color: 'from-emerald-600/30 to-emerald-900/30 border-emerald-600/50 text-emerald-300',
    badge: 'Canteiro de Obras',
  },
  {
    code: 'NR-06',
    title: 'Equipamentos de Proteção Individual (EPI)',
    description: 'Orientação e uso correto de EPIs adequados aos riscos.',
    color: 'from-slate-600/30 to-slate-800/30 border-slate-600/50 text-slate-300',
    badge: 'Geral de Campo',
  },
  {
    code: 'NR-20',
    title: 'Segurança com Inflamáveis e Combustíveis',
    description: 'Segurança e saúde no trabalho com inflamáveis e combustíveis.',
    color: 'from-orange-600/30 to-orange-900/30 border-orange-600/50 text-orange-300',
    badge: 'Gases & Purga',
  },
  {
    code: 'ASO',
    title: 'Atestado de Saúde Ocupacional (Periódico / Admissional)',
    description: 'Exame médico com aptidão para altura, espaço confinado e ruído.',
    color: 'from-rose-600/30 to-rose-900/30 border-rose-600/50 text-rose-300',
    badge: 'Exame Médico Clínico',
  },
  {
    code: 'Outra',
    title: 'Outra Certificação / Qualificação Técnica',
    description: 'Qualificações de soldagem ASME IX, Ensaios Não Destrutivos (LP), etc.',
    color: 'from-indigo-600/30 to-indigo-900/30 border-indigo-600/50 text-indigo-300',
    badge: 'Especialização',
  },
];

export const ExpandedWorkerFormModal: React.FC<ExpandedWorkerFormModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  editingWorker,
  shifts = [],
  onSaved,
}) => {
  // Form fields strictly empty for direct user typing
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [role, setRole] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [currentSite, setCurrentSite] = useState('');
  const [status, setStatus] = useState<FieldWorker['status']>('ativo');
  const [admissionDate, setAdmissionDate] = useState('');
  const [salaryReason, setSalaryReason] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [hasCustomRules, setHasCustomRules] = useState(false);
  const [customOt50, setCustomOt50] = useState('');
  const [customOt100, setCustomOt100] = useState('');
  const [customTravel, setCustomTravel] = useState('');
  const [customNight, setCustomNight] = useState('');

  // Structured NRs & Certifications with document upload & custom notification thresholds
  const [nrCertifications, setNrCertifications] = useState<NRRegulatoryCertification[]>([]);

  const [activeTab, setActiveTab] = useState<'cadastrais' | 'nrs' | 'jornada'>('cadastrais');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewDocUrl, setPreviewDocUrl] = useState<{ url: string; name: string } | null>(null);

  // AI Multimodal Document Scanner state
  const [analyzingNrId, setAnalyzingNrId] = useState<string | null>(null);
  const [aiScanFeedback, setAiScanFeedback] = useState<{ id: string; message: string; isSuccess: boolean } | null>(null);
  const [isAiUploadingNew, setIsAiUploadingNew] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);

  // Initialize or reset form
  useEffect(() => {
    if (!isOpen) return;

    if (editingWorker) {
      setName(editingWorker.name || '');
      setCpf(editingWorker.cpf || '');
      setRole(editingWorker.role || '');
      setBaseSalary(editingWorker.baseSalary ? editingWorker.baseSalary.toString() : '');
      setCurrentSite(editingWorker.currentSite || '');
      setStatus(editingWorker.status || 'ativo');
      setAdmissionDate(editingWorker.admissionDate || '');
      setSalaryReason('');
      setShiftId(editingWorker.shiftId || '');
      setHasCustomRules(!!editingWorker.customCalculationRules);
      setCustomOt50(editingWorker.customCalculationRules?.overtime50Multiplier?.toString() || '');
      setCustomOt100(editingWorker.customCalculationRules?.overtime100Multiplier?.toString() || '');
      setCustomTravel(editingWorker.customCalculationRules?.travelHourMultiplier?.toString() || '');
      setCustomNight(editingWorker.customCalculationRules?.nightShiftBonusPercent?.toString() || '');

      if (editingWorker.nrCertifications && editingWorker.nrCertifications.length > 0) {
        setNrCertifications(editingWorker.nrCertifications);
      } else if (editingWorker.certifications && editingWorker.certifications.length > 0) {
        // Convert legacy array strings
        const converted: NRRegulatoryCertification[] = editingWorker.certifications.map((c, idx) => {
          let code = 'Outra';
          for (const std of STANDARD_NR_CATALOG) {
            if (c.toUpperCase().includes(std.code)) {
              code = std.code;
              break;
            }
          }
          return {
            id: `nr_leg_${Date.now()}_${idx}`,
            nrCode: code,
            title: c,
            expirationDate: '',
            alertDaysWarning: 30,
            alertDaysCritical: 10,
            alertDaysUrgent: 1,
          };
        });
        setNrCertifications(converted);
      } else {
        setNrCertifications([]);
      }
    } else {
      // Clean blank state for typing
      setName('');
      setCpf('');
      setRole('');
      setBaseSalary('');
      setCurrentSite('');
      setStatus('ativo');
      setAdmissionDate('');
      setSalaryReason('');
      setShiftId('');
      setHasCustomRules(false);
      setCustomOt50('');
      setCustomOt100('');
      setCustomTravel('');
      setCustomNight('');
      setNrCertifications([]);
      setActiveTab('cadastrais');
    }
  }, [isOpen, editingWorker]);

  if (!isOpen) return null;

  // Add new NR certification
  const handleAddNr = (presetCode = 'NR-35') => {
    const preset = STANDARD_NR_CATALOG.find((p) => p.code === presetCode) || STANDARD_NR_CATALOG[0];
    const newNr: NRRegulatoryCertification = {
      id: `nr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nrCode: preset.code,
      title: preset.title,
      issueDate: '',
      expirationDate: '',
      certificateNumber: '',
      issuingEntity: '',
      alertDaysWarning: 30,
      alertDaysCritical: 10,
      alertDaysUrgent: 1,
      notes: '',
    };
    setNrCertifications((prev) => [...prev, newNr]);
    setActiveTab('nrs');
  };

  // Update specific NR
  const handleUpdateNr = (id: string, updates: Partial<NRRegulatoryCertification>) => {
    setNrCertifications((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...updates };
        if (updates.nrCode && updates.nrCode !== c.nrCode) {
          const match = STANDARD_NR_CATALOG.find((o) => o.code === updates.nrCode);
          if (match && match.code !== 'Outra') {
            next.title = match.title;
          }
        }
        return next;
      })
    );
  };

  // Remove NR
  const handleRemoveNr = (id: string) => {
    setNrCertifications((prev) => prev.filter((c) => c.id !== id));
  };

  // Trigger AI scanner on document
  const triggerAiScan = async (certId: string, dataUrl: string, fileName: string, fileType: string) => {
    setAnalyzingNrId(certId);
    setAiScanFeedback(null);
    try {
      const result = await parseRegulatoryDocumentWithAI(dataUrl, fileName, fileType);
      if (result.success && result.data) {
        const d = result.data;
        const updates: Partial<NRRegulatoryCertification> = {};
        if (d.expirationDate) updates.expirationDate = d.expirationDate;
        if (d.issueDate) updates.issueDate = d.issueDate;
        if (d.certificateNumber) updates.certificateNumber = d.certificateNumber;
        if (d.issuingEntity) updates.issuingEntity = d.issuingEntity;
        if (d.nrCode && d.nrCode !== 'Outra') {
          updates.nrCode = d.nrCode;
          const matchCatalog = STANDARD_NR_CATALOG.find((cat) => cat.code === d.nrCode);
          if (matchCatalog) {
            updates.title = d.title || matchCatalog.title;
          } else if (d.title) {
            updates.title = d.title;
          }
        } else if (d.title) {
          updates.title = d.title;
        }

        handleUpdateNr(certId, updates);
        setAiScanFeedback({
          id: certId,
          message: `${d.summary || `Identificado: ${d.nrCode} • Vencimento: ${d.expirationDate || 'Sem data expressa'}`}`,
          isSuccess: true,
        });
      } else {
        setAiScanFeedback({
          id: certId,
          message: result.error || 'Não foi possível detectar os dados automaticamente.',
          isSuccess: false,
        });
      }
    } catch (err: any) {
      console.error('Erro na análise de documento por IA:', err);
      setAiScanFeedback({
        id: certId,
        message: 'Falha temporária ao comunicar com a IA.',
        isSuccess: false,
      });
    } finally {
      setAnalyzingNrId(null);
    }
  };

  // File Upload handler for Certificate Documents with automatic AI reading
  const handleFileUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('Arquivo muito pesado. O limite máximo para upload é 15MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        handleUpdateNr(id, {
          documentUrl: dataUrl,
          documentName: file.name,
          documentType: file.type || file.name.split('.').pop(),
        });

        // If auto-scan toggle is active, invoke AI
        if (autoScanEnabled) {
          triggerAiScan(id, dataUrl, file.name, file.type || 'application/pdf');
        } else {
          // Zero-cost instant filename pre-detector (0 tokens)
          const fastDetection = quickDetectFromFilename(file.name);
          if (fastDetection) {
            const updates: Partial<NRRegulatoryCertification> = {};
            if (fastDetection.expirationDate) updates.expirationDate = fastDetection.expirationDate;
            if (fastDetection.nrCode && fastDetection.nrCode !== 'Outra') {
              updates.nrCode = fastDetection.nrCode;
              updates.title = fastDetection.title;
            }
            handleUpdateNr(id, updates);
            setAiScanFeedback({
              id,
              message: fastDetection.summary,
              isSuccess: true,
            });
          }
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Re-run AI analysis on an already uploaded document
  const handleManualScanWithAI = (cert: NRRegulatoryCertification) => {
    if (!cert.documentUrl) return;
    triggerAiScan(cert.id, cert.documentUrl, cert.documentName || 'Documento.pdf', cert.documentType || 'application/pdf');
  };

  // Direct AI upload: select file, creates NR and auto-populates
  const handleDirectAiDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('Arquivo muito pesado. O limite máximo para upload é 15MB.');
      return;
    }

    setIsAiUploadingNew(true);
    const newId = `nr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const newNr: NRRegulatoryCertification = {
          id: newId,
          nrCode: 'Outra',
          title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          issueDate: '',
          expirationDate: '',
          documentUrl: dataUrl,
          documentName: file.name,
          documentType: file.type || file.name.split('.').pop(),
          alertDaysWarning: 30,
          alertDaysCritical: 10,
          alertDaysUrgent: 1,
        };
        setNrCertifications((prev) => [...prev, newNr]);
        setActiveTab('nrs');
        setIsAiUploadingNew(false);

        await triggerAiScan(newId, dataUrl, file.name, file.type || 'application/pdf');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Remove Document Attachment
  const handleRemoveDocument = (id: string) => {
    handleUpdateNr(id, {
      documentUrl: undefined,
      documentName: undefined,
      documentType: undefined,
    });
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const salaryNum = parseFloat(baseSalary) || 0;
      const hourlyCalculated = Number((salaryNum / 220).toFixed(2));
      const shiftObj = shifts.find((s) => s.id === shiftId);

      const legacyCerts = nrCertifications.map(
        (c) => `${c.nrCode}${c.title ? ` - ${c.title}` : ''}`
      );

      const customRules = hasCustomRules
        ? {
            overtime50Multiplier: parseFloat(customOt50) || 1.5,
            overtime100Multiplier: parseFloat(customOt100) || 2.0,
            travelHourMultiplier: parseFloat(customTravel) || 1.0,
            nightShiftBonusPercent: parseFloat(customNight) || 20,
          }
        : undefined;

      let workerId = editingWorker?.id;

      if (editingWorker) {
        let history = editingWorker.salaryHistory || [];
        if (salaryNum !== editingWorker.baseSalary || role.trim() !== editingWorker.role) {
          history = [
            ...history,
            {
              date: new Date().toISOString().split('T')[0],
              previousSalary: editingWorker.baseSalary,
              newSalary: salaryNum,
              previousRole: editingWorker.role,
              newRole: role.trim(),
              reason: salaryReason.trim() || 'Ajuste cadastral ou promoção',
            },
          ];
        }

        await updateDoc(doc(db, 'field_workers', editingWorker.id), {
          name: name.trim(),
          cpf: cpf.trim(),
          role: role.trim(),
          baseSalary: salaryNum,
          hourlyRate: hourlyCalculated,
          currentSite: currentSite.trim(),
          status,
          admissionDate,
          shiftId: shiftId || undefined,
          shiftName: shiftObj?.name || undefined,
          customCalculationRules: customRules,
          certifications: legacyCerts,
          nrCertifications,
          salaryHistory: history,
          updatedAt: new Date().toISOString(),
        });
      } else {
        workerId = `w_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newWorker: FieldWorker = {
          id: workerId,
          orgId: organizationId,
          name: name.trim(),
          cpf: cpf.trim(),
          role: role.trim(),
          baseSalary: salaryNum,
          hourlyRate: hourlyCalculated,
          currentSite: currentSite.trim(),
          status,
          admissionDate: admissionDate || new Date().toISOString().split('T')[0],
          shiftId: shiftId || undefined,
          shiftName: shiftObj?.name || undefined,
          customCalculationRules: customRules,
          certifications: legacyCerts,
          nrCertifications,
          salaryHistory: [
            {
              date: admissionDate || new Date().toISOString().split('T')[0],
              previousSalary: 0,
              newSalary: salaryNum,
              previousRole: 'Admissão',
              newRole: role.trim(),
              reason: 'Contratação inicial de obra',
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'field_workers', workerId), newWorker);
      }

      if (onSaved && workerId) {
        onSaved(workerId);
      }
      onClose();
    } catch (err) {
      console.error('Erro ao salvar colaborador expandido:', err);
      alert('Ocorreu um erro ao salvar o colaborador. Verifique os dados digitados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl my-6 max-h-[92vh] overflow-y-auto custom-scrollbar flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <HardHat className="w-6 h-6" />
            </span>
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg flex items-center space-x-2">
                <span>{editingWorker ? 'Editar Cadastro de Colaborador' : 'Cadastro de Colaborador de Obra Expandido'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800 font-semibold">
                  Módulo de NRs & Documentação
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Gestão integrada de dados pessoais, contratos e controle de Normas Regulamentadoras com alerta de vencimento.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs inside Form */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-4 shrink-0 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('cadastrais')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'cadastrais'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Dados Pessoais & Obra</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nrs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'nrs'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>2. Normas Regulamentadoras (NRs) & Documentos</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-950 text-amber-300">
              {nrCertifications.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('jornada')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'jornada'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>3. Turno & Regras de Cálculo</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar text-xs">
          {/* TAB 1: DADOS CADASTRAIS */}
          {activeTab === 'cadastrais' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Nome Completo do Colaborador *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Digite o nome completo"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    CPF (Cadastro de Pessoa Física) *
                  </label>
                  <input
                    type="text"
                    required
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Cargo / Especialidade *
                  </label>
                  <input
                    type="text"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Ex: Soldador TIG Inox, Serralheiro..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Obra / Local de Alocação
                  </label>
                  <input
                    type="text"
                    value={currentSite}
                    onChange={(e) => setCurrentSite(e.target.value)}
                    placeholder="Ex: CD Marília (BMDV), Oficina..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Data de Admissão
                  </label>
                  <input
                    type="date"
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Salário Base Mensal (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Custo por hora calculada: R${' '}
                    {baseSalary ? (parseFloat(baseSalary) / 220 || 0).toFixed(2) : '0.00'}/h (base 220h)
                  </span>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Status Operacional
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="ativo">Ativo (Em Operação)</option>
                    <option value="em_ferias">Em Férias</option>
                    <option value="afastado">Afastado / Licença</option>
                    <option value="desligado">Desligado</option>
                  </select>
                </div>
              </div>

              {editingWorker && (
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">
                    Motivo da Alteração Salarial / Cargo (Registro em Histórico)
                  </label>
                  <input
                    type="text"
                    value={salaryReason}
                    onChange={(e) => setSalaryReason(e.target.value)}
                    placeholder="Ex: Dissídio da categoria, promoção por liderança de montagem..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NORMAS REGULAMENTADORAS (NRS) EXPANDIDA */}
          {activeTab === 'nrs' && (
            <div className="space-y-4">
              {/* AI Intelligent Document Auto-Detection Banner & Cost-Optimized Controls */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/70 border border-purple-700/60 shadow-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                      </span>
                      <strong className="text-white text-xs sm:text-sm flex items-center space-x-1.5">
                        <span>Leitura e Identificação por IA</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-purple-900/80 text-purple-200 border border-purple-700 font-mono font-bold">
                          Gemini 3.8 Flash
                        </span>
                      </strong>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-mono font-semibold">
                        Custo Mínimo (~$0,0002/doc)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 pl-8 leading-relaxed">
                      Lê certificados e ASOs para preencher automaticamente a <strong>Norma Regulamentadora</strong> e a <strong>Data de Vencimento</strong> com cache local de zero custo repetido.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2.5 shrink-0 self-end sm:self-center">
                    {/* Auto-scan switch toggle */}
                    <button
                      type="button"
                      onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                      className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        autoScanEnabled
                          ? 'bg-purple-900/70 text-purple-200 border-purple-500'
                          : 'bg-slate-900/90 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                      title="Ative para chamar a IA automaticamente ao selecionar arquivos nos cartões individuais abaixo"
                    >
                      <Zap className={`w-3.5 h-3.5 ${autoScanEnabled ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
                      <span>{autoScanEnabled ? 'Auto-IA: Ativada' : 'Auto-IA: Desativada'}</span>
                    </button>

                    <label className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-950 cursor-pointer transition-all hover:scale-[1.02] border border-purple-400/40">
                      {isAiUploadingNew ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Analisando com IA...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-4 h-4" />
                          <span>Anexar e Ler com IA</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                        disabled={isAiUploadingNew}
                        onChange={handleDirectAiDocUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Micro-bar for Token/Usage Economy awareness */}
                <div className="pt-2 border-t border-purple-900/40 flex flex-wrap items-center justify-between text-[10px] text-purple-300/80 gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span><strong>Modo Econômico Ativo:</strong> Imagens compactadas no navegador antes do envio para gastar o mínimo de tokens.</span>
                  </div>
                  <span>Documentos reanalisados da mesma sessão utilizam cache sem nova chamada de API.</span>
                </div>
              </div>

              {/* NR Catalog Quick Picker */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Catálogo de Normas Regulamentadoras & Certificados Rápidos:</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Clique para adicionar diretamente</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {STANDARD_NR_CATALOG.map((cat) => (
                    <button
                      key={cat.code}
                      type="button"
                      onClick={() => handleAddNr(cat.code)}
                      className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/60 hover:bg-slate-850 text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-[11px] group-hover:text-amber-300">
                          {cat.code}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">+ Add</span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                        {cat.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Added NRs List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-amber-300 text-xs uppercase tracking-wider flex items-center space-x-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>Normas Associadas ao Colaborador ({nrCertifications.length})</span>
                  </h4>

                  <button
                    type="button"
                    onClick={() => handleAddNr('NR-35')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors cursor-pointer text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Outra NR</span>
                  </button>
                </div>

                {nrCertifications.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-center space-y-2">
                    <Award className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-slate-300 font-medium text-xs">
                      Nenhuma Norma Regulamentadora associada a este colaborador ainda.
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      Selecione uma norma no catálogo acima ou clique no botão para adicionar certificações com anexo de comprovante e avisos de vencimento.
                    </p>
                  </div>
                ) : (
                  nrCertifications.map((cert, index) => {
                    const alertInfo = getCertificationAlertStatus(cert);
                    return (
                      <div
                        key={cert.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 relative group"
                      >
                        {/* Header do Cartão da NR */}
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-[10px]">
                              {index + 1}
                            </span>
                            <span className="font-bold text-white text-xs">
                              {cert.nrCode} — {cert.title || 'Sem título'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${alertInfo.badgeClass}`}>
                              {alertInfo.label}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleRemoveNr(cert.id)}
                              className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                              title="Remover esta norma"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Grid: Identificação da Norma */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                              Tipo de Norma *
                            </label>
                            <select
                              value={cert.nrCode}
                              onChange={(e) => handleUpdateNr(cert.id, { nrCode: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 cursor-pointer text-xs"
                            >
                              {STANDARD_NR_CATALOG.map((opt) => (
                                <option key={opt.code} value={opt.code}>
                                  {opt.code} ({opt.title})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                              Título / Descrição do Treinamento *
                            </label>
                            <input
                              type="text"
                              required
                              value={cert.title}
                              onChange={(e) => handleUpdateNr(cert.id, { title: e.target.value })}
                              placeholder="Ex: Treinamento em Altura 8h"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                              Nº Registro / ART
                            </label>
                            <input
                              type="text"
                              value={cert.certificateNumber || ''}
                              onChange={(e) => handleUpdateNr(cert.id, { certificateNumber: e.target.value })}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                            />
                          </div>
                        </div>

                        {/* Grid: Datas de Emissão e Vencimento */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                              Data de Emissão / Conclusão
                            </label>
                            <input
                              type="date"
                              value={cert.issueDate || ''}
                              onChange={(e) => handleUpdateNr(cert.id, { issueDate: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-amber-300 text-[11px] mb-1 font-bold flex items-center justify-between">
                              <span>Data de Vencimento *</span>
                              <span className="text-[10px] text-amber-400/80">Chave para Alertas</span>
                            </label>
                            <input
                              type="date"
                              required
                              value={cert.expirationDate}
                              onChange={(e) => handleUpdateNr(cert.id, { expirationDate: e.target.value })}
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
                              onChange={(e) => handleUpdateNr(cert.id, { issuingEntity: e.target.value })}
                              placeholder="Ex: SESI / Clínica de Medicina"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                            />
                          </div>
                        </div>

                        {/* Grid: Definição Customizada de Prazos de Notificação com Base na Criticidade */}
                        <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                          <div className="flex items-center space-x-1.5">
                            <Bell className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-bold text-slate-200 text-[11px]">
                              Programação Customizada de Notificação Antes do Vencimento
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Defina quantos dias antes da data de expiração o sistema deve ativar cada nível de alerta:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                            <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
                              <label className="block text-rose-300 text-[11px] font-bold mb-1 flex items-center space-x-1">
                                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                                <span>Urgência Alta / Crítica</span>
                              </label>
                              <div className="flex items-center space-x-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max="365"
                                  required
                                  value={cert.alertDaysUrgent ?? 1}
                                  onChange={(e) =>
                                    handleUpdateNr(cert.id, { alertDaysUrgent: parseInt(e.target.value) || 0 })
                                  }
                                  className="w-20 px-2 py-1 rounded bg-slate-950 border border-rose-700 text-rose-200 font-mono font-bold text-xs focus:outline-none text-center"
                                />
                                <span className="text-[10px] text-slate-400">dias antes (ex: 1 dia)</span>
                              </div>
                            </div>

                            <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-900/50">
                              <label className="block text-amber-300 text-[11px] font-bold mb-1 flex items-center space-x-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                <span>Urgência Média</span>
                              </label>
                              <div className="flex items-center space-x-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max="365"
                                  required
                                  value={cert.alertDaysCritical ?? 10}
                                  onChange={(e) =>
                                    handleUpdateNr(cert.id, { alertDaysCritical: parseInt(e.target.value) || 0 })
                                  }
                                  className="w-20 px-2 py-1 rounded bg-slate-950 border border-amber-700 text-amber-200 font-mono font-bold text-xs focus:outline-none text-center"
                                />
                                <span className="text-[10px] text-slate-400">dias antes (ex: 10 dias)</span>
                              </div>
                            </div>

                            <div className="p-2 rounded-lg bg-yellow-950/30 border border-yellow-900/50">
                              <label className="block text-yellow-300 text-[11px] font-bold mb-1 flex items-center space-x-1">
                                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                                <span>Alerta Preventivo</span>
                              </label>
                              <div className="flex items-center space-x-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max="365"
                                  required
                                  value={cert.alertDaysWarning ?? 30}
                                  onChange={(e) =>
                                    handleUpdateNr(cert.id, { alertDaysWarning: parseInt(e.target.value) || 0 })
                                  }
                                  className="w-20 px-2 py-1 rounded bg-slate-950 border border-yellow-700 text-yellow-200 font-mono font-bold text-xs focus:outline-none text-center"
                                />
                                <span className="text-[10px] text-slate-400">dias antes (ex: 30 dias)</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* AI Scanning Active Banner */}
                        {analyzingNrId === cert.id && (
                          <div className="p-2.5 rounded-lg bg-purple-950/80 border border-purple-500/80 text-purple-200 text-xs flex items-center space-x-2.5 animate-pulse shadow-md">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-bold block text-purple-100">IA Analisando Documento em Tempo Real...</span>
                              <span className="text-[11px] text-purple-300 truncate block">
                                Lendo texto/imagem, identificando a Norma Regulamentadora e extraindo data de vencimento.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* AI Scan Result Feedback Notification */}
                        {aiScanFeedback?.id === cert.id && (
                          <div
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 shadow-sm ${
                              aiScanFeedback.isSuccess
                                ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-200'
                                : 'bg-amber-950/80 border-amber-600/80 text-amber-200'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <Sparkles
                                className={`w-4 h-4 shrink-0 ${
                                  aiScanFeedback.isSuccess ? 'text-emerald-400' : 'text-amber-400'
                                }`}
                              />
                              <span className="leading-snug">{aiScanFeedback.message}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAiScanFeedback(null)}
                              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Upload de Arquivo de Certificado */}
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center space-x-2.5">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Paperclip className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-slate-300 font-bold block text-[11px]">
                                Comprovante Digital do Certificado / ASO
                              </span>
                              {cert.documentName ? (
                                <span className="text-emerald-400 text-[10px] font-mono flex items-center space-x-1">
                                  <FileCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
                                  <span>{cert.documentName}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[10px]">
                                  Nenhum arquivo anexado (aceita PDF ou imagens JPG/PNG/WebP até 15MB)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {cert.documentUrl ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleManualScanWithAI(cert)}
                                  disabled={analyzingNrId === cert.id}
                                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 font-semibold text-[11px] cursor-pointer disabled:opacity-50 transition-colors"
                                  title="Reanalisar arquivo com IA para extrair Norma e Vencimento"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                  <span>{analyzingNrId === cert.id ? 'Lendo...' : 'Reanalisar com IA'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewDocUrl({
                                      url: cert.documentUrl!,
                                      name: cert.documentName || 'Certificado.pdf',
                                    })
                                  }
                                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-[11px] cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Visualizar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveDocument(cert.id)}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-red-300 text-[11px] cursor-pointer transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Remover</span>
                                </button>
                              </>
                            ) : (
                              <label className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-semibold cursor-pointer text-xs transition-colors">
                                <UploadCloud className="w-3.5 h-3.5 text-purple-400" />
                                <span>Anexar (IA Extrai Vencimento)</span>
                                <input
                                  type="file"
                                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                                  onChange={(e) => handleFileUpload(cert.id, e)}
                                  className="hidden"
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TURNO E REGRAS DE CÁLCULO */}
          {activeTab === 'jornada' && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  Turno de Trabalho Padrão do Colaborador
                </label>
                <select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">Nenhum turno específico (Seguir horário geral da obra)</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} às {s.endTime} • {s.standardDailyHours}h normais)
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">
                    Regras de Cálculo Customizadas para Este Colaborador
                  </span>
                  <input
                    type="checkbox"
                    checked={hasCustomRules}
                    onChange={(e) => setHasCustomRules(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 cursor-pointer"
                  />
                </div>

                {hasCustomRules && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Mult. HE 50%</label>
                      <input
                        type="number"
                        step="0.1"
                        value={customOt50}
                        onChange={(e) => setCustomOt50(e.target.value)}
                        placeholder="1.5"
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Mult. HE 100%</label>
                      <input
                        type="number"
                        step="0.1"
                        value={customOt100}
                        onChange={(e) => setCustomOt100(e.target.value)}
                        placeholder="2.0"
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Mult. Viagem</label>
                      <input
                        type="number"
                        step="0.1"
                        value={customTravel}
                        onChange={(e) => setCustomTravel(e.target.value)}
                        placeholder="1.0"
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Adic. Noturno (%)</label>
                      <input
                        type="number"
                        step="1"
                        value={customNight}
                        onChange={(e) => setCustomNight(e.target.value)}
                        placeholder="20"
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-center"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Footer Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-slate-500">
              {nrCertifications.length} Norma(s) Regulamentadora(s) configurada(s).
            </span>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer font-medium"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Colaborador & NRs'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Internal Quick Preview Modal for Document */}
      {previewDocUrl && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-xl max-w-3xl w-full p-4 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
              <span className="font-bold text-white text-xs truncate">{previewDocUrl.name}</span>
              <button
                onClick={() => setPreviewDocUrl(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto rounded bg-slate-950 p-2 flex items-center justify-center min-h-[300px]">
              {previewDocUrl.url.startsWith('data:image/') ? (
                <img src={previewDocUrl.url} alt="Doc" className="max-h-[60vh] object-contain rounded" />
              ) : (
                <iframe
                  src={previewDocUrl.url}
                  title="Doc"
                  className="w-full h-[60vh] rounded border-0"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
