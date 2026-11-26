import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TrustedDevice } from '../types';
import { WhatsAppReceiptsConfig } from '../types/travel';
import {
  Settings,
  ShieldCheck,
  Laptop,
  Bell,
  Save,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RotateCcw,
  Sun,
  Moon,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Smartphone,
  RefreshCw,
  Send,
  Sliders,
  Shield,
  FileText,
  Sparkles,
  HelpCircle,
  Receipt,
  Activity,
  Terminal,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { apiFetch } from '../apiAuthFetch';
import { AreaAccessPanel } from '../components/settings/AreaAccessPanel';
import { ModuleAccessPanel } from '../components/settings/ModuleAccessPanel';

interface SettingsModuleProps {
  onNavigate?: (section: any) => void;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({ onNavigate }) => {
  const {
    user,
    organization,
    member,
    role,
    isAdmin,
    deviceId: currentDeviceId,
    trustedDevices: userTrustedDevices,
    revokeTrustedDevice,
    logAudit,
    isMaster,
    areaLevel,
  } = useAuth();
  // Lista de acessos: Admin, Gerente ou quem edita Configurações (todo mundo abre a tela por tema e dispositivos).
  const canSeeAreaAccess = isMaster || areaLevel('configuracoes') === 2;
  const { theme, setTheme } = useTheme();

  const [slaHours, setSlaHours] = useState('24');
  const [lpuLimit, setLpuLimit] = useState('5000');
  const [notifyCriticalStock, setNotifyCriticalStock] = useState(true);
  const [enableReworkTracking, setEnableReworkTracking] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load persisted operation parameters (organizations/{orgId}.settings)
  useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    getDoc(doc(db, 'organizations', organization.id))
      .then((snap) => {
        const st = snap.data()?.settings;
        if (cancelled || !st) return;
        if (st.slaHours != null) setSlaHours(String(st.slaHours));
        if (st.lpuLimit != null) setLpuLimit(String(st.lpuLimit));
        if (st.notifyCriticalStock != null) setNotifyCriticalStock(!!st.notifyCriticalStock);
        if (st.enableReworkTracking != null) setEnableReworkTracking(!!st.enableReworkTracking);
      })
      .catch((err) => console.error('Erro ao carregar parâmetros:', err));
    return () => { cancelled = true; };
  }, [organization?.id]);

  // WhatsApp Webhook & OCR State
  const [waConfig, setWaConfig] = useState<WhatsAppReceiptsConfig>({
    provider: 'evolution_api',
    connectedPhoneNumber: '+55 (19) 98765-4321',
    targetGroupName: '[AGUERO] Reembolsos & Diárias - Campo',
    targetGroupJid: '12036302847123984@g.us',
    webhookUrl: typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp-receipts` : '',
    verifyToken: 'aguero_reembolsos_token_2025',
    autoReplyConfirmation: false,
    filterOnlyAuthorizedEmployees: true,
    authorizedPhones: ['+55 19 98123-4567', '+55 19 99234-5678', '+55 11 97654-3210'],
    status: 'conectado',
    lastPingAt: new Date().toISOString(),
  });
  const [loadingWaConfig, setLoadingWaConfig] = useState(false);
  const [isSavingWaConfig, setIsSavingWaConfig] = useState(false);
  const [waSaveSuccess, setWaSaveSuccess] = useState(false);
  const [waTestStatus, setWaTestStatus] = useState<{ running: boolean; success?: boolean; message?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [autoDetectGroup, setAutoDetectGroup] = useState(true);


  // Load WhatsApp config
  useEffect(() => {
    const fetchWaConfig = async () => {
      setLoadingWaConfig(true);
      try {
        const res = await apiFetch('/api/whatsapp/config');
        if (res.ok) {
          const data = await res.json();
          if (data?.config) {
            setWaConfig((prev) => ({
              ...prev,
              ...data.config,
              webhookUrl:
                data.config.webhookUrl ||
                (typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp-receipts` : prev.webhookUrl),
            }));
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar configurações do WhatsApp:', err);
      } finally {
        setLoadingWaConfig(false);
      }
    };

    fetchWaConfig();
  }, []);

  // Handlers for WhatsApp Webhook & OCR
  const handleSaveWaConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingWaConfig(true);
    try {
      const res = await apiFetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waConfig),
      });
      const data = await res.json();
      if (data.success) {
        setWaSaveSuccess(true);
        await logAudit(
          'Configurações',
          'Atualizar Webhook WhatsApp',
          `Provedor: ${waConfig.provider}, Webhook: ${waConfig.webhookUrl}, Token: ${waConfig.verifyToken.slice(0, 6)}***, Grupo: ${waConfig.targetGroupName}`
        );
        setTimeout(() => setWaSaveSuccess(false), 3500);
      } else {
        setActionMessage(data.error || 'Erro ao atualizar webhook.');
      }
    } catch (err: any) {
      console.error('Erro ao salvar config WhatsApp:', err);
      setActionMessage(`Erro ao salvar configurações do WhatsApp: ${err.message}`);
    } finally {
      setIsSavingWaConfig(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // The verify token lives only in WHATSAPP_VERIFY_TOKEN on the server, so this only probes that the endpoint answers.
  const handleTestHandshake = async () => {
    setWaTestStatus({ running: true });
    try {
      const res = await apiFetch('/api/webhooks/whatsapp-receipts');
      const data = await res.json().catch(() => ({}));
      setWaTestStatus({
        running: false,
        success: res.ok && data.success === true,
        message: res.ok && data.success
          ? `${data.message || 'Endpoint ativo.'} O token do handshake é conferido com a variável WHATSAPP_VERIFY_TOKEN do servidor.`
          : `Falha ao consultar o endpoint (Status ${res.status}): ${data.error || 'resposta inesperada'}.`,
      });
    } catch (err: any) {
      setWaTestStatus({
        running: false,
        success: false,
        message: `Erro ao testar endpoint de webhook: ${err.message}`,
      });
    }
  };

  const handleQuickSetup = async (phone: string, group: string) => {
    setIsSavingWaConfig(true);
    try {
      const res = await apiFetch('/api/whatsapp/quick-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone,
          groupName: group,
          verifyToken: waConfig.verifyToken,
          provider: waConfig.provider,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWaConfig((prev) => ({
          ...prev,
          connectedPhoneNumber: phone,
          targetGroupName: group,
          lastPingAt: new Date().toISOString(),
        }));
        setWaSaveSuccess(true);
        await logAudit(
          'Configurações',
          'Vincular WhatsApp & Grupo',
          `Número: ${phone}, Grupo: "${group}"`
        );
        setTimeout(() => setWaSaveSuccess(false), 3500);
      } else {
        setActionMessage(data.error || 'Erro ao vincular.');
      }
    } catch (err: any) {
      setActionMessage(`Erro ao vincular WhatsApp: ${err.message}`);
    } finally {
      setIsSavingWaConfig(false);
    }
  };

  const handleRunSampleReceiptTest = async () => {
    setWaTestStatus({ running: true });
    try {
      const res = await apiFetch('/api/whatsapp/test-sample-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.receipt) {
        if (data.config) {
          setWaConfig((prev) => ({
            ...prev,
            ...data.config,
          }));
        }
        setWaTestStatus({
          running: false,
          success: true,
          message: `Leitura OCR concluída com sucesso via Gemini Flash! Estabelecimento: "${data.receipt.establishmentName}", Valor: R$ ${Number(data.receipt.totalAmount).toFixed(2)}, Data: ${data.receipt.receiptDate}, Categoria: ${data.receipt.category.toUpperCase()} (${data.receipt.confidence}% de certeza). O grupo "${waConfig.targetGroupName || 'REEMBOLSOS AGUERO INOX'}" foi validado e o recibo já está disponível na esteira de aprovação.`,
        });
      } else {
        setWaTestStatus({
          running: false,
          success: false,
          message: data.error || 'Erro ao processar cupom de teste.',
        });
      }
    } catch (err: any) {
      setWaTestStatus({
        running: false,
        success: false,
        message: `Erro no teste de leitura: ${err.message}`,
      });
    }
  };

  // Admin view for all organization trusted devices
  const [allOrgDevices, setAllOrgDevices] = useState<TrustedDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Load all organization devices if admin
  useEffect(() => {
    if (!isAdmin || !organization) return;

    const loadOrgDevices = async () => {
      setLoadingDevices(true);
      try {
        const q = query(collection(db, 'trusted_devices'), where('orgId', '==', organization.id));
        const snap = await getDocs(q);
        const devs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrustedDevice));
        setAllOrgDevices(devs);
      } catch (err) {
        console.warn('Erro ao carregar dispositivos da organização:', err);
      } finally {
        setLoadingDevices(false);
      }
    };

    loadOrgDevices();
  }, [isAdmin, organization]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    setSaveError(null);
    try {
      await setDoc(
        doc(db, 'organizations', organization.id),
        {
          settings: {
            slaHours: Number(slaHours) || 24,
            lpuLimit: Number(lpuLimit) || 0,
            notifyCriticalStock,
            enableReworkTracking,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Erro ao salvar parâmetros:', err);
      setSaveError('Não foi possível salvar (apenas Administradores podem alterar os parâmetros).');
      return;
    }
    setSavedSuccess(true);
    await logAudit(
      'Configurações',
      'Atualizar Parâmetros',
      `SLA: ${slaHours}h, Limite LPU: R$ ${lpuLimit}, Alerta Estoque: ${notifyCriticalStock}, Rastreio Retrabalho: ${enableReworkTracking}`
    );
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleRevokeDevice = async (docId: string, deviceName: string) => {
    if (confirm(`Deseja revogar o dispositivo "${deviceName}"? O próximo acesso exigirá validação de segundo fator.`)) {
      try {
        await revokeTrustedDevice(docId);
        if (isAdmin && organization) {
          // Update in admin list as well
          await updateDoc(doc(db, 'trusted_devices', docId), {
            status: 'revogado',
            revokedAt: new Date().toISOString(),
          });
          setAllOrgDevices((prev) =>
            prev.map((d) => (d.id === docId ? { ...d, status: 'revogado' as const } : d))
          );
        }
        setActionMessage(`Dispositivo "${deviceName}" revogado com sucesso.`);
        setTimeout(() => setActionMessage(null), 3000);
      } catch (err: any) {
        setActionMessage(`Erro ao revogar: ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <h2 className="text-lg font-bold text-white tracking-tight">Configurações & Dispositivos Confiáveis</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Parâmetros operacionais da organização, diretrizes de segurança, controle de segundo fator e gerenciamento de dispositivos.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Parâmetros operacionais salvos com sucesso!</span>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-800 text-red-300 text-xs">{saveError}</div>
      )}

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-blue-950/70 border border-blue-800 text-blue-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Seletor de Tema / Aparência Global */}
      <div className="bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] rounded-[20px] p-5 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center space-x-2">
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-[#0071E3]" />
              ) : (
                <Moon className="w-4 h-4 text-[#0A84FF]" />
              )}
              <span>Aparência & Tema da Aplicação</span>
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
              O Modo Claro corporativo é o padrão da plataforma. Sua preferência fica salva neste navegador.
            </p>
          </div>

          <div className="flex items-center space-x-1 bg-black/[0.06] dark:bg-white/[0.08] p-1 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-[10px] text-xs font-semibold transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.10)]'
                  : 'text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-[#0071E3]" />
              <span>Modo Claro (Padrão)</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-[10px] text-xs font-semibold transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-[#2C2C2E] text-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]'
                  : 'text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Modo Escuro</span>
            </button>
          </div>
        </div>
      </div>

      {/* Permissões gerais por área e granularidade por submódulo/ação */}
      {canSeeAreaAccess && <>
        <AreaAccessPanel />
        <ModuleAccessPanel />
      </>}

      {/* Integração WhatsApp Webhook & OCR (Reembolsos de Campo) */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-0.5">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">WhatsApp & OCR de Cupons Fiscais</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Pronto para Receber</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Adicione seu número de WhatsApp e escolha o grupo de reembolsos da equipe de campo. Toda foto de cupom fiscal enviada no grupo é lida automaticamente pelo Gemini Flash OCR (CNPJ, data, itens e valor).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('viagens-reembolsos')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ver Fila de Reembolsos</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>{showTechnicalDetails ? 'Ocultar Opções Avançadas' : 'Opções Avançadas / Webhook'}</span>
            </button>
          </div>
        </div>

        {waSaveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>WhatsApp e Grupo de Reembolsos configurados com sucesso!</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">Conectado</span>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* CONFIGURAÇÃO RÁPIDA EM 2 PASSOS (SIMPLES E DIRETO) */}
        {/* ---------------------------------------------------- */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Configuração Rápida em 2 Passos</span>
            </span>
            <span className="text-[11px] text-slate-400">Sem códigos complicados: apenas seu número e o nome do grupo</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Passo 1: Número */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] flex items-center justify-center font-bold">1</span>
                  <span>Seu Número do WhatsApp</span>
                </label>
              </div>
              <input
                type="text"
                value={waConfig.connectedPhoneNumber}
                onChange={(e) => setWaConfig({ ...waConfig, connectedPhoneNumber: e.target.value })}
                placeholder="+55 11 90000-0000"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-medium text-xs focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400">
                Número do responsável ou central que receberá as fotos de cupons fiscais.
              </p>
            </div>

            {/* Passo 2: Grupo */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] flex items-center justify-center font-bold">2</span>
                  <span>Nome do Grupo de Reembolsos</span>
                </label>
                <span className="text-[10px] text-slate-500">Como está no WhatsApp</span>
              </div>
              <input
                type="text"
                value={waConfig.targetGroupName}
                onChange={(e) => setWaConfig({ ...waConfig, targetGroupName: e.target.value })}
                placeholder="Ex: [AGUERO] Reembolsos & Diárias - Campo"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-medium text-xs focus:outline-none focus:border-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[
                  '[AGUERO] Reembolsos & Diárias - Campo',
                  'Equipe Montagem Inox & Obras',
                  'Reembolsos e Despesas de Viagem',
                ].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setWaConfig((prev) => ({ ...prev, targetGroupName: sug }))}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 cursor-pointer transition-colors"
                  >
                    + {sug}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dica de Auto-Detecção */}
          <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-900/40 flex items-start space-x-2 text-xs">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-slate-300 text-[11px] leading-relaxed">
              <strong>Vinculação Inteligente Ativa:</strong> O AgueroFlow salva suas configurações no servidor. Assim que o primeiro cupom for enviado no WhatsApp, o identificador do grupo é amarrado automaticamente ao sistema.
            </div>
          </div>

          {/* Card de Diagnóstico do Estado Atual */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">1. Número Registrado</span>
              <span className="text-white font-mono font-bold text-xs">{waConfig.connectedPhoneNumber || 'Aguardando preenchimento'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">2. Grupo Salvo</span>
              <span className="text-emerald-400 font-bold text-xs">{waConfig.targetGroupName || 'Aguardando nome'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">3. ID Técnico (JID)</span>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${waConfig.targetGroupJid ? 'bg-emerald-400' : 'bg-cyan-400'}`}></span>
                <span className="text-[11px] font-mono text-slate-300">
                  {waConfig.targetGroupJid || 'Auto-vincular no 1º envio'}
                </span>
              </div>
            </div>
          </div>

          {/* Botões de Ação Rápida */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleQuickSetup(waConfig.connectedPhoneNumber, waConfig.targetGroupName)}
                disabled={isSavingWaConfig}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/20 cursor-pointer transition-all text-xs"
              >
                {isSavingWaConfig ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar e Conectar ao WhatsApp</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRunSampleReceiptTest}
                disabled={waTestStatus?.running}
                className="px-3.5 py-2.5 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-800/60 font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors text-xs"
                title="Executa leitura de cupom fiscal com IA para demonstrar o funcionamento"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Testar Leitura com Cupom Real (IA)</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 text-slate-400 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>
                Status: {waConfig.connectedPhoneNumber ? `Ativo (${waConfig.connectedPhoneNumber})` : 'Aguardando número'}
              </span>
            </div>
          </div>
        </div>

        {/* Resultado do Teste de Leitura se acionado */}
        {waTestStatus && (
          <div
            className={`p-3.5 rounded-xl text-xs border flex items-start space-x-2.5 ${
              waTestStatus.running
                ? 'bg-slate-900 border-slate-700 text-slate-300'
                : waTestStatus.success
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
                : 'bg-red-950/70 border-red-800 text-red-300'
            }`}
          >
            {waTestStatus.running ? (
              <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0 animate-spin mt-0.5" />
            ) : waTestStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-bold block">
                {waTestStatus.running
                  ? 'Processando imagem do cupom fiscal com Gemini Flash...'
                  : waTestStatus.success
                  ? 'Teste de Leitura OCR Concluído com Sucesso'
                  : 'Falha no Teste de Leitura'}
              </span>
              <p className="text-[11px] mt-0.5 leading-relaxed">{waTestStatus.message}</p>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* OPÇÕES AVANÇADAS & CHAVES DO WEBHOOK (COLAPSÁVEL)    */}
        {/* ---------------------------------------------------- */}
        {showTechnicalDetails && (
          <form onSubmit={handleSaveWaConfig} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Configurações Técnicas de Callback & Token</span>
              </span>
              <span className="text-[10px] text-slate-500">Para desenvolvedores e administradores</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* URL do Webhook */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold flex items-center space-x-1.5">
                    <span>URL do Webhook (Callback URL)</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          setWaConfig((prev) => ({
                            ...prev,
                            webhookUrl: `${window.location.origin}/api/webhooks/whatsapp-receipts`,
                          }));
                        }
                      }}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Usar Domínio Atual
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(waConfig.webhookUrl, 'webhookUrl')}
                      className="text-[10px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 flex items-center space-x-1 cursor-pointer transition-colors"
                    >
                      {copiedField === 'webhookUrl' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>Copiar URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={waConfig.webhookUrl}
                  onChange={(e) => setWaConfig({ ...waConfig, webhookUrl: e.target.value })}
                  placeholder="https://seu-dominio.com/api/webhooks/whatsapp-receipts"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-cyan-300 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* Token de Verificação */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold flex items-center space-x-1.5">
                    <span>Token de Verificação (Verify Token)</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={waConfig.verifyToken}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-amber-300 text-xs focus:outline-none opacity-70 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-500">Definido na variável WHATSAPP_VERIFY_TOKEN do servidor.</p>
              </div>

              {/* Provedor de Conexão */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Provedor / Gateway WhatsApp</label>
                <select
                  value={waConfig.provider}
                  onChange={(e) => setWaConfig({ ...waConfig, provider: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="evolution_api">Evolution API (Instância Própria / Baileys - Recomendado)</option>
                  <option value="meta_cloud_api">Meta WhatsApp Cloud API (Oficial - Graph API v21.0)</option>
                  <option value="z_api">Z-API Gateway (Multi-Dispositivos)</option>
                  <option value="twilio">Twilio for WhatsApp (Enterprise API)</option>
                </select>
              </div>

              {/* JID do Grupo (Opcional) */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">JID Técnico do Grupo (Opcional)</label>
                <input
                  type="text"
                  value={waConfig.targetGroupJid}
                  onChange={(e) => setWaConfig({ ...waConfig, targetGroupJid: e.target.value })}
                  placeholder="Auto-detectado ao receber a primeira foto"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-purple-300 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="submit"
                disabled={isSavingWaConfig}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center space-x-1.5 cursor-pointer text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Parâmetros Avançados</span>
              </button>

              <button
                type="button"
                onClick={handleTestHandshake}
                disabled={waTestStatus?.running}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold flex items-center space-x-1 cursor-pointer text-xs"
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Testar Endpoint GET</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Grid: Parâmetros & Segurança da Conta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        {/* Parâmetros Operacionais */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Settings className="w-4 h-4 text-blue-400" />
            <span>Parâmetros da Operação</span>
          </h3>

          <form onSubmit={handleSavePreferences} className="space-y-3.5">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">SLA Padrão para Resolução de Ocorrências (Horas)</label>
              <input
                type="number"
                value={slaHours}
                onChange={(e) => setSlaHours(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-medium">Alçada para Aprovação de LPU (R$)</label>
              <input
                type="number"
                value={lpuLimit}
                onChange={(e) => setLpuLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyCriticalStock}
                  onChange={(e) => setNotifyCriticalStock(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 cursor-pointer"
                />
                <span className="text-slate-300">Alertas para peças com saldo abaixo do nível crítico</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableReworkTracking}
                  onChange={(e) => setEnableReworkTracking(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600 cursor-pointer"
                />
                <span className="text-slate-300">Habilitar classificação e motivo de Retrabalho em Ordens de Serviço</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center space-x-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Parâmetros</span>
              </button>
            </div>
          </form>
        </div>

        {/* Status de Segurança e Conta */}
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Segurança, Papel & MFA</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">Conta Autenticada</span>
              <span className="font-bold text-white text-xs">{user?.email}</span>
              <span className="block text-[10px] text-emerald-400 mt-0.5">Firebase Auth • Google Verified • 2FA</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px] font-semibold uppercase">Papel Operacional (RBAC)</span>
              <span className="font-bold text-blue-400 text-xs">{role}</span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                Vínculo ativo à organização {organization?.name} (slug: {organization?.slug})
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start space-x-2.5">
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white text-xs">MFA e Dispositivo Confiável</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Primeiro acesso em navegador novo requer confirmação de segundo fator. Dispositivos autorizados possuem validade de 30 dias e podem ser revogados a qualquer momento.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dispositivos Confiáveis do Usuário */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Laptop className="w-4 h-4 text-blue-400" />
              <span>Seus Dispositivos Confiáveis</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Navegadores e terminais que validaram o segundo fator e foram autorizados nesta organização.
            </p>
          </div>
        </div>

        {userTrustedDevices.length === 0 ? (
          <div className="p-4 text-center rounded-xl bg-slate-900/60 border border-slate-800 text-slate-500">
            Nenhum dispositivo registrado como confiável no momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="pb-2.5">Dispositivo / Terminal</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">Autorizado em</th>
                  <th className="pb-2.5">Expiração</th>
                  <th className="pb-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {userTrustedDevices.map((dev) => {
                  const isCurrent = dev.deviceId === currentDeviceId;
                  const isAtivo = dev.status === 'ativo';

                  return (
                    <tr key={dev.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 font-medium text-slate-200 flex items-center space-x-2">
                        <span>{dev.deviceName}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-300 text-[10px] font-bold border border-blue-800/40">
                            Dispositivo Atual
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isAtivo
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {dev.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-400 font-mono text-[11px]">
                        {new Date(dev.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2.5 text-slate-400 font-mono text-[11px]">
                        {new Date(dev.expiresAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2.5 text-right">
                        {isAtivo ? (
                          <button
                            onClick={() => handleRevokeDevice(dev.id, dev.deviceName)}
                            className="inline-flex items-center space-x-1 text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revogar</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">Revogado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dispositivos de Toda a Organização (Somente Administrador) */}
      {isAdmin && (
        <div className="bg-[#121826] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Gestão de Dispositivos da Organização (Visão do Administrador)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Administradores podem revogar acessos e dispositivos autorizados de qualquer usuário desta empresa.
            </p>
          </div>

          {loadingDevices ? (
            <p className="text-slate-500 py-3 text-center">Carregando dispositivos autorizados...</p>
          ) : allOrgDevices.length === 0 ? (
            <p className="text-slate-500 py-3 text-center">Nenhum outro dispositivo registrado na organização.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="pb-2.5">Usuário</th>
                    <th className="pb-2.5">Dispositivo</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5">Expiração</th>
                    <th className="pb-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allOrgDevices.map((dev) => (
                    <tr key={dev.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 text-slate-200 font-medium">{dev.userEmail}</td>
                      <td className="py-2.5 text-slate-300">{dev.deviceName}</td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            dev.status === 'ativo'
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {dev.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-400 font-mono text-[11px]">
                        {new Date(dev.expiresAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2.5 text-right">
                        {dev.status === 'ativo' ? (
                          <button
                            onClick={() => handleRevokeDevice(dev.id, `${dev.deviceName} (${dev.userEmail})`)}
                            className="inline-flex items-center space-x-1 text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revogar</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">Revogado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
