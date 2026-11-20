import React, { useState, useEffect, useMemo } from 'react';
import {
  Link2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  ExternalLink,
  MessageCircle,
  FileText,
  UserCheck,
  Eye,
  Trash2,
  ShieldCheck,
  Building,
  Briefcase,
  Calendar,
  X,
  CreditCard,
  MapPin,
  Sparkles,
  Phone,
  Mail,
  ChevronRight
} from 'lucide-react';
import {
  EmployeeOnboarding,
  OnboardingStatus
} from '../../types/onboarding';
import { RhEmployee } from '../../types/rhPayroll';
import { Unit, Contract } from '../../types';
import {
  listOnboardings,
  generateOnboardingLink,
  updateOnboardingStatus,
  deleteOnboarding
} from '../../services/onboardingService';

interface RhOnboardingManagerProps {
  currentOrgId: string;
  userEmail: string;
  userName: string;
  units?: Unit[];
  contracts?: Contract[];
  canEdit: boolean;
  onEmployeeApproved?: (newEmployee: RhEmployee) => Promise<void>;
  onNavigateToEmployees?: () => void;
}

export const RhOnboardingManager: React.FC<RhOnboardingManagerProps> = ({
  currentOrgId,
  userEmail,
  userName,
  units = [],
  contracts = [],
  canEdit,
  onEmployeeApproved,
  onNavigateToEmployees,
}) => {
  const [onboardings, setOnboardings] = useState<EmployeeOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [selectedOnboardingForView, setSelectedOnboardingForView] = useState<EmployeeOnboarding | null>(null);
  const [activeDocPreview, setActiveDocPreview] = useState<{ title: string; base64: string; mimeType: string } | null>(null);

  // New Link Form State
  const [targetRole, setTargetRole] = useState('Caldeireiro Montador');
  const [targetDepartment, setTargetDepartment] = useState('Obras & Montagem');
  const [candidateName, setCandidateName] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [proposedSalary, setProposedSalary] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<{ linkUrl: string; token: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      const data = await listOnboardings(currentOrgId);
      setOnboardings(data);
    } catch (err) {
      console.error('Erro ao carregar lista de admissões:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentOrgId]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Open Generate Modal
  const handleOpenGenerate = () => {
    setGeneratedResult(null);
    setCopiedLink(false);
    setCandidateName('');
    setCandidatePhone('');
    setCandidateEmail('');
    setProposedSalary('');
    setTargetRole('Caldeireiro Montador');
    setTargetDepartment('Obras & Montagem');
    setExpiresInDays(7);
    setIsGenerateModalOpen(true);
  };

  // Generate Link Action
  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRole || !targetDepartment) {
      alert('Por favor, informe o cargo e departamento.');
      return;
    }

    setGenerating(true);
    try {
      const res = await generateOnboardingLink({
        organizationId: currentOrgId,
        createdBy: userEmail || 'rh@agueroinox.com.br',
        createdByName: userName || 'Recursos Humanos',
        targetRole,
        targetDepartment,
        proposedSalary: proposedSalary ? parseFloat(proposedSalary.replace(',', '.')) : undefined,
        candidateName: candidateName || undefined,
        candidatePhone: candidatePhone || undefined,
        candidateEmail: candidateEmail || undefined,
        expiresInDays,
      });

      setGeneratedResult({
        linkUrl: res.linkUrl,
        token: res.onboarding.token,
      });

      await loadData();
    } catch (err: any) {
      alert('Erro ao gerar link de cadastro: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Copy Link to clipboard
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Open WhatsApp with friendly pre-filled text
  const handleSendWhatsApp = (onb: EmployeeOnboarding, customUrl?: string) => {
    const link = customUrl || `${window.location.origin}/admissao?token=${onb.token}`;
    const nameStr = onb.candidateName ? ` ${onb.candidateName}` : '';
    const text = encodeURIComponent(
      `Olá${nameStr}! Bem-vindo(a) à Aguero Inox & Montagens Industriais.\n\nPara iniciarmos seu processo de admissão para a vaga de *${onb.targetRole}*, por favor preencha seus dados cadastrais e envie fotos dos seus documentos pelo nosso link seguro de uso único:\n\n👉 ${link}\n\nQualquer dúvida estamos à disposição!`
    );

    const cleanPhone = (onb.candidatePhone || '').replace(/\D/g, '');
    const phoneParam = cleanPhone.length >= 10 ? `phone=55${cleanPhone}&` : '';
    window.open(`https://api.whatsapp.com/send?${phoneParam}text=${text}`, '_blank');
  };

  // Delete onboarding link
  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este link de admissão?')) return;
    try {
      await deleteOnboarding(id);
      await loadData();
    } catch (err: any) {
      alert('Erro ao excluir registro: ' + err.message);
    }
  };

  // Approve and convert into active employee
  const handleApprove = async (onb: EmployeeOnboarding) => {
    if (!onb.submittedData) {
      alert('Este colaborador ainda não enviou os dados cadastrais.');
      return;
    }

    if (!confirm(`Confirmar a admissão e efetivação de ${onb.submittedData.fullName} como funcionário ativo na Aguero Inox?`)) {
      return;
    }

    try {
      const sub = onb.submittedData;
      const newEmpId = `emp_${Date.now()}`;
      const hourlyRate = (onb.proposedSalary ? onb.proposedSalary / 220 : 18.5);

      const newEmployee: RhEmployee = {
        id: newEmpId,
        orgId: currentOrgId,
        registrationNumber: `REG-${Math.floor(100 + Math.random() * 900)}`,
        name: sub.fullName,
        admissionDate: new Date().toISOString().split('T')[0],
        active: true,
        department: onb.targetDepartment || sub.department || 'Produção',
        role: onb.targetRole || sub.role || 'Operador',
        companyName: 'Aguero Inox',
        hourlyRateCarteira: Math.round(hourlyRate * 100) / 100,
        hourlyRatePorFora: 0,
        monthlyHours: 220,
        baseSalaryCarteira: onb.proposedSalary || 4070,
        baseSalaryPorFora: 0,
        dependentsCount: sub.dependentsCount || 0,
        porForaEligible: false,
        notes: `Admissão Digital realizada via link único (Protocolo ${onb.id}). CPF: ${sub.cpf} | PIS: ${sub.pisPasep} | RG: ${sub.rgNumber} (${sub.rgIssuer})`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (onEmployeeApproved) {
        await onEmployeeApproved(newEmployee);
      }

      // Update onboarding status
      await updateOnboardingStatus(
        onb.id,
        'approved',
        'Colaborador aprovado e efetivado no quadro de funcionários.',
        userName || 'Recursos Humanos',
        newEmpId
      );

      alert(`Colaborador ${sub.fullName} aprovado e adicionado com sucesso ao cadastro de funcionários!`);
      setSelectedOnboardingForView(null);
      await loadData();
    } catch (err: any) {
      alert('Erro ao aprovar admissão: ' + err.message);
    }
  };

  // Filtered List
  const filteredOnboardings = useMemo(() => {
    return onboardings.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (item.candidateName || item.submittedData?.fullName || '').toLowerCase().includes(q);
        const matchRole = item.targetRole.toLowerCase().includes(q);
        const matchDept = item.targetDepartment.toLowerCase().includes(q);
        const matchToken = item.token.toLowerCase().includes(q);
        return matchName || matchRole || matchDept || matchToken;
      }
      return true;
    });
  }, [onboardings, statusFilter, searchQuery]);

  // Summary KPIs
  const kpiSubmitted = onboardings.filter((o) => o.status === 'submitted').length;
  const kpiPending = onboardings.filter((o) => o.status === 'pending').length;
  const kpiApproved = onboardings.filter((o) => o.status === 'approved').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-tr from-cyan-600 to-blue-600 text-white rounded-xl shadow-md shadow-cyan-600/20">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Admissão Digital & Links de Cadastro Único</h2>
              <span className="text-[11px] text-cyan-400 font-semibold">
                · Firebase Firestore
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Envie links de uso único para novos colaboradores preencherem dados e anexarem fotos de RG, CPF, CTPS e PIS pelo celular.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-850 rounded-xl transition border border-slate-700/80 cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-cyan-400' : ''} />
          </button>

          {canEdit && (
            <button
              onClick={handleOpenGenerate}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-600/20 transition cursor-pointer"
            >
              <Plus size={16} />
              <span>Gerar Link de Admissão</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Aguardando Envio</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl font-extrabold font-mono text-white">{kpiPending}</p>
          <span className="text-[11px] text-slate-500">Links ativos no prazo</span>
        </div>

        <div className="bg-[#121826] border border-amber-500/30 rounded-xl p-4 shadow-sm bg-gradient-to-b from-amber-500/5 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-amber-300 font-bold uppercase tracking-wider">Para Conferência RH</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <p className="text-2xl font-extrabold font-mono text-amber-400">{kpiSubmitted}</p>
          <span className="text-[11px] text-amber-200/80">Preenchidos pelo colaborador</span>
        </div>

        <div className="bg-[#121826] border border-emerald-500/30 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Efetivados / Aprovados</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-extrabold font-mono text-emerald-400">{kpiApproved}</p>
          <span className="text-[11px] text-slate-500">Integrados ao quadro</span>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total de Convites</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Link2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-extrabold font-mono text-purple-300">{onboardings.length}</p>
          <span className="text-[11px] text-slate-500">Histórico no Firestore</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por colaborador, cargo ou token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex rounded-lg border border-slate-700 overflow-hidden shrink-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Todos ({onboardings.length})
            </button>
            <button
              onClick={() => setStatusFilter('submitted')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'submitted' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-amber-400 hover:text-white'
              }`}
            >
              Recebidos ({kpiSubmitted})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'pending' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Pendentes ({kpiPending})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-2 text-xs font-semibold transition ${
                statusFilter === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Aprovados ({kpiApproved})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <th className="py-3 px-4">Colaborador / Candidato</th>
                <th className="py-3 px-3">Cargo Previsto & Setor</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3">Validade / Envio</th>
                <th className="py-3 px-3 text-center">Documentos</th>
                <th className="py-3 px-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredOnboardings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
                    Nenhum link de admissão encontrado para este filtro.
                  </td>
                </tr>
              ) : (
                filteredOnboardings.map((item) => {
                  const candidateDisplayName = item.submittedData?.fullName || item.candidateName || 'Novo Colaborador (Pendente)';
                  const hasDocuments = item.submittedData?.documents && Object.keys(item.submittedData.documents).length > 0;
                  const docCount = item.submittedData?.documents ? Object.keys(item.submittedData.documents).length : 0;
                  const linkUrl = `${window.location.origin}/admissao?token=${item.token}`;

                  return (
                    <tr key={item.id} className="hover:bg-slate-850/40 transition">
                      {/* Name & Contact */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-xs">
                          {candidateDisplayName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Token: {item.token.slice(0, 16)}...
                        </div>
                        {(item.candidatePhone || item.submittedData?.phone) && (
                          <div className="text-[10px] text-cyan-400 flex items-center gap-1 mt-0.5">
                            <Phone size={10} /> {item.submittedData?.phone || item.candidatePhone}
                          </div>
                        )}
                      </td>

                      {/* Role & Dept */}
                      <td className="py-3 px-3">
                        <div className="text-slate-200 font-semibold">{item.targetRole}</div>
                        <div className="text-[10px] text-slate-400">{item.targetDepartment}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {item.status === 'pending' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 inline-flex items-center gap-1">
                            <Clock size={11} /> Aguardando Envio
                          </span>
                        )}
                        {item.status === 'submitted' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse inline-flex items-center gap-1">
                            <AlertTriangle size={11} /> Enviado (Conferir)
                          </span>
                        )}
                        {item.status === 'approved' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                            <CheckCircle2 size={11} /> Efetivado
                          </span>
                        )}
                        {item.status === 'expired' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
                            Expirado
                          </span>
                        )}
                      </td>

                      {/* Dates */}
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {item.submittedAt ? (
                          <div>
                            <span className="text-emerald-400 font-semibold block">Recebido em:</span>
                            {new Date(item.submittedAt).toLocaleDateString('pt-BR')} às {new Date(item.submittedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-500 block">Expira em:</span>
                            {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </td>

                      {/* Documents Badge */}
                      <td className="py-3 px-3 text-center">
                        {hasDocuments ? (
                          <button
                            onClick={() => setSelectedOnboardingForView(item)}
                            className="px-2 py-0.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <FileText size={11} /> {docCount} anexos
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">0 anexos</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* If pending, can copy link or send WhatsApp */}
                          {item.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleCopyLink(linkUrl)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
                                title="Copiar link único"
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                onClick={() => handleSendWhatsApp(item, linkUrl)}
                                className="p-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-700/60 rounded-lg text-xs transition cursor-pointer"
                                title="Enviar mensagem com o link no WhatsApp"
                              >
                                <MessageCircle size={13} />
                              </button>
                            </>
                          )}

                          {/* View details */}
                          <button
                            onClick={() => setSelectedOnboardingForView(item)}
                            className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                              item.status === 'submitted'
                                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                            title="Conferir dados e documentos"
                          >
                            <Eye size={13} />
                          </button>

                          {/* Delete */}
                          {canEdit && (
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1.5 bg-slate-800/80 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded-lg text-xs transition cursor-pointer"
                              title="Excluir convite"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: GERAR NOVO LINK DE ADMISSÃO (TOKEN DE USO ÚNICO)
          ========================================================================= */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-600 text-white">
                  <Link2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Gerar Link de Cadastro Único</h3>
                  <span className="text-[10px] text-slate-400">Token seguro e descartável após preenchimento</span>
                </div>
              </div>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {generatedResult ? (
              /* Success display of generated link */
              <div className="space-y-4">
                <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-2 text-center">
                  <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-bold text-white">Link de Admissão Gerado com Sucesso!</h4>
                  <p className="text-xs text-slate-300">
                    Envie este link para o colaborador. Ao abrir, ele preencherá seus dados e anexará os documentos.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300">Link de Acesso Único:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedResult.linkUrl}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono select-all focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopyLink(generatedResult.linkUrl)}
                      className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy size={13} />
                      <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={() => {
                      const pseudoOnb: any = {
                        candidateName,
                        candidatePhone,
                        targetRole,
                        token: generatedResult.token,
                      };
                      handleSendWhatsApp(pseudoOnb, generatedResult.linkUrl);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition cursor-pointer"
                  >
                    <MessageCircle size={15} />
                    <span>Disparar no WhatsApp</span>
                  </button>

                  <button
                    onClick={() => setIsGenerateModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              /* Generation Form */
              <form onSubmit={handleGenerateLink} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Cargo / Função Prevista <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="Ex: Soldador TIG / Caldeireiro"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Departamento / Setor <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={targetDepartment}
                      onChange={(e) => setTargetDepartment(e.target.value)}
                      placeholder="Ex: Obras & Montagem"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nome Prévio do Candidato (Opcional)
                    </label>
                    <input
                      type="text"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="Ex: Carlos Eduardo"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      WhatsApp para Envio (Opcional)
                    </label>
                    <input
                      type="text"
                      value={candidatePhone}
                      onChange={(e) => setCandidatePhone(e.target.value)}
                      placeholder="(16) 99999-9999"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Salário Base Acordado R$ (Opcional)
                    </label>
                    <input
                      type="text"
                      value={proposedSalary}
                      onChange={(e) => setProposedSalary(e.target.value)}
                      placeholder="Ex: 4200.00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Prazo de Validade do Link
                    </label>
                    <select
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value={2}>48 Horas (Urgente)</option>
                      <option value={7}>7 Dias (Recomendado)</option>
                      <option value={15}>15 Dias</option>
                      <option value={30}>30 Dias</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-blue-950/40 border border-blue-900/60 rounded-xl text-[11px] text-blue-200 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    O link gerado será de uso único. Assim que o candidato enviar o cadastro e os anexos, o link será automaticamente invalidado.
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsGenerateModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={generating}
                    className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    {generating ? 'Gerando link único...' : 'Criar Link Único'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: DOSSIÊ COMPLETO E CONFERÊNCIA DE DOCUMENTOS DO COLABORADOR
          ========================================================================= */}
      {selectedOnboardingForView && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-[#0B132B] border border-slate-700 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-6 my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                  <UserCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Dossiê Cadastral do Colaborador</span>
                    {selectedOnboardingForView.status === 'submitted' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                        Aguardando Validação do RH
                      </span>
                    )}
                    {selectedOnboardingForView.status === 'approved' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                        Efetivado no Quadro
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Protocolo: <span className="font-mono text-cyan-300">{selectedOnboardingForView.id}</span> • Vaga: <strong>{selectedOnboardingForView.targetRole}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedOnboardingForView(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {selectedOnboardingForView.submittedData ? (
              /* Complete Dossier Content */
              <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar text-xs">
                {/* 1. Dados Pessoais e Filiação */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-cyan-400 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                    <UserCheck size={14} /> 1. Dados Pessoais & Filiação
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Nome Completo</span>
                      <strong className="text-white text-xs">{selectedOnboardingForView.submittedData.fullName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Data de Nascimento</span>
                      <strong>{selectedOnboardingForView.submittedData.birthDate}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Gênero / Estado Civil</span>
                      <strong>{selectedOnboardingForView.submittedData.gender} • {selectedOnboardingForView.submittedData.maritalStatus}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Nome da Mãe</span>
                      <strong className="text-white">{selectedOnboardingForView.submittedData.motherName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Nome do Pai</span>
                      <strong>{selectedOnboardingForView.submittedData.fatherName || 'Não informado'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Naturalidade / Nacionalidade</span>
                      <strong>{selectedOnboardingForView.submittedData.birthCity || 'N/A'} ({selectedOnboardingForView.submittedData.birthState || 'SP'}) • {selectedOnboardingForView.submittedData.nationality}</strong>
                    </div>
                  </div>
                </div>

                {/* 2. Documentação */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-cyan-400 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                    <FileText size={14} /> 2. Documentos de Identificação
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px]">CPF</span>
                      <strong className="font-mono text-cyan-300 text-xs">{selectedOnboardingForView.submittedData.cpf}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">RG & Órgão</span>
                      <strong className="font-mono">{selectedOnboardingForView.submittedData.rgNumber} ({selectedOnboardingForView.submittedData.rgIssuer})</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">PIS / PASEP</span>
                      <strong className="font-mono text-emerald-300">{selectedOnboardingForView.submittedData.pisPasep}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">CTPS Digital</span>
                      <strong className="font-mono">{selectedOnboardingForView.submittedData.ctpsNumber} - {selectedOnboardingForView.submittedData.ctpsSeries}/{selectedOnboardingForView.submittedData.ctpsUf}</strong>
                    </div>
                    {selectedOnboardingForView.submittedData.cnhNumber && (
                      <div>
                        <span className="text-slate-500 block text-[10px]">CNH & Categoria</span>
                        <strong>{selectedOnboardingForView.submittedData.cnhNumber} ({selectedOnboardingForView.submittedData.cnhCategory})</strong>
                      </div>
                    )}
                    {selectedOnboardingForView.submittedData.voterTitle && (
                      <div>
                        <span className="text-slate-500 block text-[10px]">Título de Eleitor</span>
                        <strong>{selectedOnboardingForView.submittedData.voterTitle}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Endereço e Contatos */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-cyan-400 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                    <MapPin size={14} /> 3. Endereço Residencial & Contatos
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-300">
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block text-[10px]">Endereço Completo</span>
                      <strong>
                        {selectedOnboardingForView.submittedData.street}, nº {selectedOnboardingForView.submittedData.number}
                        {selectedOnboardingForView.submittedData.complement ? ` (${selectedOnboardingForView.submittedData.complement})` : ''} - {selectedOnboardingForView.submittedData.neighborhood}, {selectedOnboardingForView.submittedData.city}/{selectedOnboardingForView.submittedData.state}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">CEP</span>
                      <strong className="font-mono">{selectedOnboardingForView.submittedData.zipCode}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Celular / WhatsApp</span>
                      <strong className="text-cyan-300">{selectedOnboardingForView.submittedData.phone}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">E-mail</span>
                      <strong>{selectedOnboardingForView.submittedData.email}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Contato de Emergência</span>
                      <strong>
                        {selectedOnboardingForView.submittedData.emergencyContactName || 'N/A'}{' '}
                        {selectedOnboardingForView.submittedData.emergencyContactPhone ? `(${selectedOnboardingForView.submittedData.emergencyContactPhone})` : ''}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 4. Dados Bancários */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-cyan-400 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                    <CreditCard size={14} /> 4. Dados Bancários para Depósito de Salário
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Banco</span>
                      <strong className="text-white">{selectedOnboardingForView.submittedData.bankName || 'A Definir / Abertura'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Agência & Conta</span>
                      <strong className="font-mono">
                        Ag: {selectedOnboardingForView.submittedData.bankAgency || '-'} / CC: {selectedOnboardingForView.submittedData.bankAccount || '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Chave PIX</span>
                      <strong className="font-mono text-cyan-300">{selectedOnboardingForView.submittedData.pixKey || 'Não cadastrada'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Dependentes Salário-Família</span>
                      <strong>{selectedOnboardingForView.submittedData.dependentsCount} dependente(s)</strong>
                    </div>
                  </div>
                </div>

                {/* 5. Documentos Anexados (Uploads) */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-emerald-400 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                      <FileText size={14} /> 5. Documentos Digitalizados Anexados
                    </h4>
                    <span className="text-[10px] text-slate-400">Clique sobre o documento para ampliar</span>
                  </div>

                  {selectedOnboardingForView.submittedData.documents &&
                  Object.keys(selectedOnboardingForView.submittedData.documents).length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(selectedOnboardingForView.submittedData.documents).map(([key, doc]) => {
                        if (!doc) return null;
                        const docLabels: Record<string, string> = {
                          rgFront: 'RG / CNH (Frente)',
                          rgBack: 'RG / CNH (Verso)',
                          cpfDoc: 'Comprovante CPF',
                          ctpsDoc: 'CTPS Digital',
                          pisDoc: 'Comprovante PIS/NIS',
                          proofOfResidence: 'Comprov. Residência',
                          asoDoc: 'Exame ASO Admissional',
                          otherDoc: 'Outros Documentos',
                        };

                        const isImage = doc.mimeType.startsWith('image/');

                        return (
                          <div
                            key={key}
                            onClick={() =>
                              setActiveDocPreview({
                                title: docLabels[key] || doc.fileName,
                                base64: doc.dataBase64,
                                mimeType: doc.mimeType,
                              })
                            }
                            className="bg-slate-950 border border-slate-800 hover:border-cyan-500 rounded-xl p-2.5 transition cursor-pointer group flex flex-col justify-between"
                          >
                            <span className="text-[10px] font-bold text-slate-300 truncate block mb-1">
                              {docLabels[key] || doc.fileName}
                            </span>

                            {isImage ? (
                              <div className="h-24 w-full bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800">
                                <img src={doc.dataBase64} alt={key} className="h-full w-full object-cover group-hover:scale-105 transition" />
                              </div>
                            ) : (
                              <div className="h-24 w-full bg-slate-900 rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 border border-slate-800">
                                <FileText size={24} className="text-cyan-400" />
                                <span className="text-[9px] font-mono">PDF / Documento</span>
                              </div>
                            )}

                            <span className="text-[9px] text-cyan-400 group-hover:underline mt-2 text-center block font-semibold">
                              Visualizar em Tela Cheia
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-xs">
                      Nenhum anexo foi carregado para este colaborador.
                    </div>
                  )}
                </div>

                {/* Consent & Audit info */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                    <span>
                      Termo LGPD aceito digitalmente em {new Date(selectedOnboardingForView.submittedData.acceptedAt).toLocaleString('pt-BR')} (IP: {selectedOnboardingForView.submittedData.clientIp || 'registrado'})
                    </span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold">Válido para eSocial</span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs space-y-3">
                <Clock size={32} className="text-blue-400 mx-auto" />
                <p>Este colaborador ainda não preencheu o formulário de admissão.</p>
                <p className="text-slate-500 text-[11px]">
                  O link seguro está aguardando preenchimento até{' '}
                  {new Date(selectedOnboardingForView.expiresAt).toLocaleDateString('pt-BR')}.
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedOnboardingForView(null)}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Fechar Visualização
              </button>

              {canEdit && selectedOnboardingForView.status === 'submitted' && (
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => handleApprove(selectedOnboardingForView)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer"
                  >
                    <UserCheck size={16} />
                    <span>Efetivar & Adicionar ao Quadro de Funcionários</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: VISUALIZADOR DE DOCUMENTO AMPLIADO
          ========================================================================= */}
      {activeDocPreview && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-slate-700 rounded-2xl max-w-3xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText size={16} className="text-cyan-400" />
                <span>{activeDocPreview.title}</span>
              </h3>
              <button
                onClick={() => setActiveDocPreview(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-950 rounded-xl border border-slate-800 min-h-[300px]">
              {activeDocPreview.mimeType.startsWith('image/') ? (
                <img
                  src={activeDocPreview.base64}
                  alt={activeDocPreview.title}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg"
                />
              ) : (
                <iframe
                  src={activeDocPreview.base64}
                  title={activeDocPreview.title}
                  className="w-full h-[70vh] rounded-lg border-0"
                />
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveDocPreview(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
