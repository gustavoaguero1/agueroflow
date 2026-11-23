import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileText,
  User,
  MapPin,
  Briefcase,
  Lock,
  ArrowRight,
  ArrowLeft,
  Camera,
  Trash2,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  Building,
  CreditCard,
  Eye,
  Info
} from 'lucide-react';
import { checkOnboardingToken, submitOnboardingForm } from '../services/onboardingService';
import { OnboardingSubmittedData, OnboardingDocumentAttachment } from '../types/onboarding';
import { GatLogo } from '../components/common/GatLogo';
import { apiFetch } from '../apiAuthFetch';

interface PublicOnboardingPageProps {
  token: string;
  onNavigateHome?: () => void;
}

export const PublicOnboardingPage: React.FC<PublicOnboardingPageProps> = ({
  token,
  onNavigateHome,
}) => {
  const [loading, setLoading] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'expired' | 'submitted' | 'approved' | 'not_found'>('checking');
  const [tokenData, setTokenData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stepper: 1 (Pessoal) -> 2 (Documentos) -> 3 (Endereço) -> 4 (Profissional/Banco) -> 5 (Uploads) -> 6 (Revisão & LGPD)
  const [step, setStep] = useState<number>(1);

  // Form Fields State
  // Step 1: Pessoal
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('Masculino');
  const [maritalStatus, setMaritalStatus] = useState('Solteiro(a)');
  const [motherName, setMotherName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [nationality, setNationality] = useState('Brasileira');
  const [birthCity, setBirthCity] = useState('');
  const [birthState, setBirthState] = useState('SP');

  // Step 2: Documentos
  const [cpf, setCpf] = useState('');
  const [rgNumber, setRgNumber] = useState('');
  const [rgIssuer, setRgIssuer] = useState('SSP');
  const [rgIssueDate, setRgIssueDate] = useState('');
  const [pisPasep, setPisPasep] = useState('');
  const [ctpsNumber, setCtpsNumber] = useState('');
  const [ctpsSeries, setCtpsSeries] = useState('0001');
  const [ctpsUf, setCtpsUf] = useState('SP');
  const [voterTitle, setVoterTitle] = useState('');
  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhCategory, setCnhCategory] = useState('');

  // Step 3: Endereço & Contato
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);

  // Step 4: Profissional & Bancário
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAgency, setBankAgency] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'corrente' | 'poupanca' | 'salario'>('corrente');
  const [pixKey, setPixKey] = useState('');
  const [dependentsCount, setDependentsCount] = useState<number>(0);

  // Step 5: Documentos Anexados
  const [attachments, setAttachments] = useState<{
    rgFront?: OnboardingDocumentAttachment;
    rgBack?: OnboardingDocumentAttachment;
    cpfDoc?: OnboardingDocumentAttachment;
    ctpsDoc?: OnboardingDocumentAttachment;
    pisDoc?: OnboardingDocumentAttachment;
    proofOfResidence?: OnboardingDocumentAttachment;
    asoDoc?: OnboardingDocumentAttachment;
  }>({});

  // Step 6: LGPD & Envio
  const [acceptedLgpd, setAcceptedLgpd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<any | null>(null);

  // Helper formatting masks
  const formatCpf = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    if (raw.length <= 3) return raw;
    if (raw.length <= 6) return `${raw.slice(0, 3)}.${raw.slice(3)}`;
    if (raw.length <= 9) return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6)}`;
    return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9, 11)}`;
  };

  const formatPhone = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    if (raw.length <= 2) return raw;
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  const formatCep = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 8);
    if (raw.length <= 5) return raw;
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  };

  // Search CEP via ViaCEP
  const handleCepBlur = async () => {
    const cleanCep = zipCode.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const res = await apiFetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (data.logradouro) setStreet(data.logradouro);
          if (data.bairro) setNeighborhood(data.bairro);
          if (data.localidade) setCity(data.localidade);
          if (data.uf) setState(data.uf);
        }
      } catch (err) {
        console.warn('Erro ao consultar CEP:', err);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  // Check token on mount
  useEffect(() => {
    async function verify() {
      if (!token) {
        setTokenStatus('not_found');
        setLoading(false);
        return;
      }

      try {
        const res = await checkOnboardingToken(token);
        if (res.success && res.status === 'valid') {
          setTokenStatus('valid');
          setTokenData(res.data);
          if (res.data?.candidateName) setFullName(res.data.candidateName);
          if (res.data?.candidateEmail) setEmail(res.data.candidateEmail);
          if (res.data?.candidatePhone) setPhone(formatPhone(res.data.candidatePhone));
        } else {
          setTokenStatus(res.status || 'not_found');
          setErrorMessage(res.error || 'Token inválido.');
        }
      } catch (err: any) {
        setTokenStatus('not_found');
        setErrorMessage(err.message || 'Erro ao conectar ao servidor.');
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [token]);

  // Handle File Upload to Base64
  const handleFileUpload = (docType: keyof typeof attachments, file: File) => {
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('O arquivo selecionado excede o limite máximo de 15MB. Por favor, comprima a imagem ou anexe um arquivo menor.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setAttachments((prev) => ({
        ...prev,
        [docType]: {
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64: base64,
          uploadedAt: new Date().toISOString(),
          sizeBytes: file.size,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (docType: keyof typeof attachments) => {
    setAttachments((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  };

  // Submit complete dossier to AgueroFlow
  const handleSubmit = async () => {
    if (!acceptedLgpd) {
      alert('É necessário marcar o consentimento dos termos de proteção de dados (LGPD) para prosseguir.');
      return;
    }

    if (!fullName || !cpf || !rgNumber || !motherName) {
      alert('Por favor, preencha todos os campos obrigatórios (Nome, CPF, RG, Nome da Mãe) antes de enviar.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const payload: OnboardingSubmittedData = {
      fullName,
      birthDate,
      gender,
      maritalStatus,
      motherName,
      fatherName: fatherName || undefined,
      nationality,
      birthCity,
      birthState,

      cpf,
      rgNumber,
      rgIssuer,
      rgIssueDate,
      pisPasep,
      ctpsNumber,
      ctpsSeries,
      ctpsUf,
      voterTitle: voterTitle || undefined,
      cnhNumber: cnhNumber || undefined,
      cnhCategory: cnhCategory || undefined,

      zipCode,
      street,
      number,
      complement: complement || undefined,
      neighborhood,
      city,
      state,
      phone,
      email,

      role: tokenData?.targetRole || 'Colaborador Operacional',
      department: tokenData?.targetDepartment || 'Produção',
      emergencyContactName: emergencyContactName || undefined,
      emergencyContactPhone: emergencyContactPhone || undefined,
      bankName: bankName || undefined,
      bankAgency: bankAgency || undefined,
      bankAccount: bankAccount || undefined,
      bankAccountType,
      pixKey: pixKey || undefined,
      dependentsCount: Number(dependentsCount) || 0,

      documents: attachments,

      acceptedLgpd: true,
      acceptedAt: new Date().toISOString(),
    };

    try {
      const res = await submitOnboardingForm(token, payload);
      setSubmissionSuccess(res);
      setTokenStatus('submitted');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar envio do cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center text-slate-300 font-sans p-4">
        <div className="flex flex-col items-center space-y-4">
          <GatLogo size="lg" />
          <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-cyan-400">Verificando autenticidade do link de admissão...</span>
        </div>
      </div>
    );
  }

  // 2. Token Expired or Not Found or Already Submitted
  if (tokenStatus !== 'valid') {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center p-4 text-slate-200">
        <div className="max-w-md w-full bg-[#0B132B] border border-slate-700/80 rounded-2xl p-6 shadow-2xl text-center space-y-5">
          <div className="flex justify-center">
            <GatLogo size="md" />
          </div>

          {tokenStatus === 'submitted' || tokenStatus === 'approved' ? (
            <div className="space-y-3">
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-lg font-bold text-white">Cadastro Já Recebido com Sucesso!</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Suas informações cadastrais e documentos já foram entregues com segurança e encontram-se em fase de conferência pela equipe de Recursos Humanos da <strong>Aguero Inox</strong>.
              </p>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-400">
                Nenhuma ação adicional é necessária neste momento. Entraremos em contato para as próximas etapas.
              </div>
            </div>
          ) : tokenStatus === 'expired' ? (
            <div className="space-y-3">
              <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/30">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-lg font-bold text-white">Link de Admissão Expirado</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Por motivos de segurança e conformidade com a LGPD, os links de cadastro possuem prazo de validade determinado e este expirou.
              </p>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-400">
                Por favor, solicite ao setor de RH da Aguero Inox a emissão de um novo link de admissão.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-lg font-bold text-white">Link Inválido ou Inexistente</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                {errorMessage || 'O token informado não confere com nenhum registro de admissão ativo na base de dados.'}
              </p>
            </div>
          )}

          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
            >
              Voltar à Página Inicial
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. Success Confirmation Screen
  if (submissionSuccess) {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center p-4 text-slate-200">
        <div className="max-w-lg w-full bg-[#0B132B] border border-emerald-500/40 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 size={38} />
          </div>

          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold block mb-1">
              Admissão Digital Concluída
            </span>
            <h1 className="text-2xl font-extrabold text-white">
              Seja Bem-vindo(a) à Aguero Inox!
            </h1>
            <p className="text-xs text-slate-300 mt-2">
              Seu pré-cadastro e documentos foram salvos com criptografia no banco de dados da empresa.
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-left space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-slate-400">Protocolo de Envio:</span>
              <span className="font-mono font-bold text-cyan-400">{submissionSuccess.protocol}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Colaborador:</span>
              <span className="font-semibold text-white">{fullName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Cargo Previsto:</span>
              <span className="font-semibold text-white">{tokenData?.targetRole}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Departamento:</span>
              <span className="font-semibold text-white">{tokenData?.targetDepartment}</span>
            </div>
          </div>

          <div className="p-3 bg-blue-950/40 border border-blue-900/60 rounded-xl text-xs text-blue-200 text-left flex items-start gap-2.5">
            <ShieldCheck size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              O link de uso único foi finalizado. Nossa equipe de RH já foi notificada para conferência dos anexos e validação formal do contrato de trabalho.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Main Multi-Step Form
  return (
    <div className="min-h-screen bg-[#070B14] py-8 px-3 sm:px-6 flex flex-col items-center justify-start text-slate-200">
      <div className="max-w-3xl w-full space-y-6">
        {/* Header Branding */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <GatLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">Aguero Inox — Admissão Digital</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold">
                  Link Seguro
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Vaga: <strong className="text-cyan-300">{tokenData?.targetRole}</strong> • Setor: {tokenData?.targetDepartment}
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <Lock size={12} className="text-emerald-400" />
            <span>Criptografia de ponta a ponta</span>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-300">
            <span>Passo {step} de 6</span>
            <span className="text-cyan-400">
              {step === 1 && 'Dados Pessoais'}
              {step === 2 && 'Documentação'}
              {step === 3 && 'Endereço & Contato'}
              {step === 4 && 'Profissional & Bancário'}
              {step === 5 && 'Anexo de Documentos'}
              {step === 6 && 'Revisão & Consentimento'}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${(step / 6) * 100}%` }}
            />
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/70 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-6">
          {/* STEP 1: DADOS PESSOAIS */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <User className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  1. Dados Pessoais & Filiação
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome Completo <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data de Nascimento <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sexo / Gênero</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Estado Civil</label>
                  <select
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="União Estável">União Estável</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nacionalidade</label>
                  <input
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome Completo da Mãe <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    placeholder="Nome completo da mãe conforme certidão"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo do Pai (Opcional)</label>
                  <input
                    type="text"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="Nome completo do pai, se constar em documento"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cidade de Nascimento (Naturalidade)</label>
                  <input
                    type="text"
                    value={birthCity}
                    onChange={(e) => setBirthCity(e.target.value)}
                    placeholder="Ex: Sertãozinho"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Estado (UF)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={birthState}
                    onChange={(e) => setBirthState(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DOCUMENTOS */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  2. Documentos Físicos e Digitais
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    CPF <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={cpf}
                    onChange={(e) => setCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número do RG <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={rgNumber}
                    onChange={(e) => setRgNumber(e.target.value)}
                    placeholder="00.000.000-0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Órgão Emissor do RG</label>
                  <input
                    type="text"
                    value={rgIssuer}
                    onChange={(e) => setRgIssuer(e.target.value.toUpperCase())}
                    placeholder="SSP/SP"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Data de Emissão do RG</label>
                  <input
                    type="date"
                    value={rgIssueDate}
                    onChange={(e) => setRgIssueDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    PIS / PASEP / NIS <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={pisPasep}
                    onChange={(e) => setPisPasep(e.target.value)}
                    placeholder="000.00000.00-0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    CTPS Digital / Número da Carteira <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={ctpsNumber}
                    onChange={(e) => setCtpsNumber(e.target.value)}
                    placeholder="Número da CTPS ou CPF"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Série / UF da CTPS</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ctpsSeries}
                      onChange={(e) => setCtpsSeries(e.target.value)}
                      placeholder="0001"
                      className="w-2/3 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      maxLength={2}
                      value={ctpsUf}
                      onChange={(e) => setCtpsUf(e.target.value.toUpperCase())}
                      placeholder="SP"
                      className="w-1/3 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase text-center focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Título de Eleitor (Opcional)</label>
                  <input
                    type="text"
                    value={voterTitle}
                    onChange={(e) => setVoterTitle(e.target.value)}
                    placeholder="Número do título"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">CNH (Se possuir)</label>
                  <input
                    type="text"
                    value={cnhNumber}
                    onChange={(e) => setCnhNumber(e.target.value)}
                    placeholder="Registro CNH"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Categoria da CNH</label>
                  <input
                    type="text"
                    value={cnhCategory}
                    onChange={(e) => setCnhCategory(e.target.value.toUpperCase())}
                    placeholder="Ex: B, AB, C, D"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: ENDEREÇO & CONTATO */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <MapPin className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  3. Endereço Residencial & Contatos
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    CEP <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={zipCode}
                      onChange={(e) => setZipCode(formatCep(e.target.value))}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                    {loadingCep && (
                      <span className="absolute right-3 top-2.5 text-[10px] text-cyan-400 animate-pulse">
                        Buscando...
                      </span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Logradouro (Rua / Avenida) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Rua das Indústrias"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Número <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="123"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Complemento / Bloco</label>
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Apto 42, Bloco B"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Bairro <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Distrito Industrial"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Cidade <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Sertãozinho"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Estado (UF) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase text-center focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Celular / WhatsApp <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(16) 99999-9999"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    E-mail Pessoal <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PROFISSIONAL & BANCÁRIO */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <CreditCard className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  4. Informações Profissionais & Conta Salário
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cargo Previsto</span>
                  <span className="text-sm font-bold text-cyan-400 mt-0.5 block">{tokenData?.targetRole}</span>
                </div>

                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Departamento / Lotação</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{tokenData?.targetDepartment}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Contato de Emergência</label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder="Ex: Maria (Esposa)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefone do Contato de Emergência</label>
                  <input
                    type="text"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(formatPhone(e.target.value))}
                    placeholder="(16) 99999-9999"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Instituição Bancária (Banco)</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Ex: Bradesco, Itaú, Banco do Brasil"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Conta</label>
                  <select
                    value={bankAccountType}
                    onChange={(e) => setBankAccountType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="corrente">Conta Corrente</option>
                    <option value="salario">Conta Salário</option>
                    <option value="poupanca">Conta Poupança</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Agência Bancária</label>
                  <input
                    type="text"
                    value={bankAgency}
                    onChange={(e) => setBankAgency(e.target.value)}
                    placeholder="Ex: 0123-4"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Número da Conta com Dígito</label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="Ex: 12345-6"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Chave PIX (Opcional)</label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="CPF, Telefone ou E-mail"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Dependentes para IRRF / Salário Família</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={dependentsCount}
                    onChange={(e) => setDependentsCount(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: UPLOAD DE DOCUMENTOS */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <Upload className="w-5 h-5 text-cyan-400" />
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    5. Anexo dos Documentos (Foto ou PDF)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Você pode tirar foto pelo celular ou selecionar arquivos do seu dispositivo.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. RG Frente */}
                <DocUploadCard
                  label="1. RG ou CNH (Frente)"
                  required
                  doc={attachments.rgFront}
                  onUpload={(file) => handleFileUpload('rgFront', file)}
                  onRemove={() => removeAttachment('rgFront')}
                />

                {/* 2. RG Verso */}
                <DocUploadCard
                  label="2. RG ou CNH (Verso)"
                  required
                  doc={attachments.rgBack}
                  onUpload={(file) => handleFileUpload('rgBack', file)}
                  onRemove={() => removeAttachment('rgBack')}
                />

                {/* 3. Carteira de Trabalho CTPS */}
                <DocUploadCard
                  label="3. Carteira de Trabalho (CTPS Digital)"
                  required
                  doc={attachments.ctpsDoc}
                  onUpload={(file) => handleFileUpload('ctpsDoc', file)}
                  onRemove={() => removeAttachment('ctpsDoc')}
                />

                {/* 4. Comprovante de Residência */}
                <DocUploadCard
                  label="4. Comprovante de Residência Recente"
                  required
                  doc={attachments.proofOfResidence}
                  onUpload={(file) => handleFileUpload('proofOfResidence', file)}
                  onRemove={() => removeAttachment('proofOfResidence')}
                />

                {/* 5. Comprovante do PIS/PASEP */}
                <DocUploadCard
                  label="5. Comprovante de PIS / NIS"
                  doc={attachments.pisDoc}
                  onUpload={(file) => handleFileUpload('pisDoc', file)}
                  onRemove={() => removeAttachment('pisDoc')}
                />

                {/* 6. Atestado de Saúde Ocupacional (ASO) */}
                <DocUploadCard
                  label="6. Exame Médico Admissional (ASO)"
                  doc={attachments.asoDoc}
                  onUpload={(file) => handleFileUpload('asoDoc', file)}
                  onRemove={() => removeAttachment('asoDoc')}
                />
              </div>
            </div>
          )}

          {/* STEP 6: REVISÃO & CONSENTIMENTO LGPD */}
          {step === 6 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  6. Conferência Final & Termo de Consentimento LGPD
                </h2>
              </div>

              {/* Review summary cards */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2.5">
                <h3 className="font-bold text-cyan-400 uppercase text-[10px] tracking-wider">Resumo do Cadastro</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                  <div><strong className="text-slate-400">Nome:</strong> {fullName}</div>
                  <div><strong className="text-slate-400">CPF:</strong> {cpf}</div>
                  <div><strong className="text-slate-400">RG:</strong> {rgNumber} ({rgIssuer})</div>
                  <div><strong className="text-slate-400">PIS:</strong> {pisPasep}</div>
                  <div><strong className="text-slate-400">Telefone:</strong> {phone}</div>
                  <div><strong className="text-slate-400">Cidade:</strong> {city} - {state}</div>
                  <div><strong className="text-slate-400">Cargo:</strong> {tokenData?.targetRole}</div>
                  <div><strong className="text-slate-400">Anexos:</strong> {Object.keys(attachments).length} documentos anexados</div>
                </div>
              </div>

              {/* LGPD Consent box */}
              <div className="p-4 bg-slate-900 border border-cyan-800/50 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300 leading-relaxed space-y-1.5">
                    <h4 className="font-bold text-white">Declaração de Veracidade e Tratamento de Dados (LGPD)</h4>
                    <p className="text-[11px] text-slate-400">
                      Declaro sob as penas da lei que todas as informações acima prestadas e os documentos anexados são autênticos e expressam a verdade. Autorizo a <strong>Aguero Inox & Montagens Industriais</strong> a realizar o tratamento dos meus dados pessoais exclusivamente para fins de admissão, confecção de contrato de trabalho CLT e cumprimento de obrigações legais perante o eSocial e órgãos governamentais, em estrita conformidade com a Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD).
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-3 pt-2 border-t border-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedLgpd}
                    onChange={(e) => setAcceptedLgpd(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded border-slate-700 bg-slate-950 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-white">
                    Li, compreendi e concordo com os termos de consentimento e tratamento de dados. <span className="text-rose-400">*</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                <ArrowLeft size={14} /> Voltar
              </button>
            ) : (
              <div></div>
            )}

            {step < 6 ? (
              <button
                type="button"
                onClick={() => {
                  // Basic step validation
                  if (step === 1 && (!fullName || !birthDate || !motherName)) {
                    alert('Por favor, preencha o Nome Completo, Data de Nascimento e Nome da Mãe para prosseguir.');
                    return;
                  }
                  if (step === 2 && (!cpf || !rgNumber || !pisPasep || !ctpsNumber)) {
                    alert('Por favor, informe seu CPF, RG, PIS e Carteira de Trabalho para prosseguir.');
                    return;
                  }
                  if (step === 3 && (!zipCode || !street || !number || !phone || !email)) {
                    alert('Por favor, preencha seu endereço completo, telefone e e-mail.');
                    return;
                  }
                  setStep((s) => s + 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer"
              >
                Próximo Passo <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !acceptedLgpd}
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold rounded-xl shadow-xl transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Gravando no Banco de Dados...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Confirmar & Enviar Cadastro para o RH</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-center text-[11px] text-slate-500 py-2">
          Aguero Inox & Montagens Industriais • Sistema Integrado AgueroFlow • Módulo RH / Admissão Digital
        </div>
      </div>
    </div>
  );
};

// Sub-component for individual document upload cards
interface DocUploadCardProps {
  label: string;
  required?: boolean;
  doc?: OnboardingDocumentAttachment;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

const DocUploadCard: React.FC<DocUploadCardProps> = ({
  label,
  required = false,
  doc,
  onUpload,
  onRemove,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className={`p-4 rounded-xl border transition ${doc ? 'bg-slate-900 border-emerald-500/40' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <label className="text-xs font-semibold text-slate-200">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
        {doc ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
            <CheckCircle2 size={10} /> Anexado
          </span>
        ) : (
          <span className="text-[10px] text-slate-500">Pendente</span>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onUpload(e.target.files[0]);
          }
        }}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {doc ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs p-2 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 truncate">
              <FileText size={14} className="text-cyan-400 shrink-0" />
              <span className="text-slate-300 truncate font-mono text-[11px]">{doc.fileName}</span>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="text-slate-400 hover:text-rose-400 transition p-1 cursor-pointer"
              title="Remover anexo"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* If image, show small preview */}
          {doc.mimeType.startsWith('image/') && (
            <div className="h-24 w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800/80 flex items-center justify-center">
              <img
                src={doc.dataBase64}
                alt={label}
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            <Camera size={14} className="text-cyan-400" />
            <span>Tirar Foto / Anexar</span>
          </button>
        </div>
      )}
    </div>
  );
};
