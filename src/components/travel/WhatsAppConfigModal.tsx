import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Users,
  Smartphone,
  Server,
  HelpCircle,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Terminal,
  ArrowRight,
} from 'lucide-react';
import { WhatsAppReceiptsConfig } from '../../types/travel';
import { WhatsAppBridgeStatus } from '../../types/whatsappComposio';
import {
  connectWhatsAppBridge,
  disconnectWhatsAppBridge,
  fetchWhatsAppBridgeGroups,
  fetchWhatsAppBridgeStatus,
  selectWhatsAppBridgeGroup,
} from '../../services/composioWhatsAppClient';
import { apiFetch } from '../../apiAuthFetch';

interface WhatsAppConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: WhatsAppReceiptsConfig;
  onSaveConfig: (updated: WhatsAppReceiptsConfig) => Promise<void>;
  onSyncSuccess?: () => void;
}

export const WhatsAppConfigModal: React.FC<WhatsAppConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onSyncSuccess,
}) => {
  const [provider, setProvider] = useState<WhatsAppReceiptsConfig['provider']>(config.provider || 'evolution_api');
  const [phoneNumber, setPhoneNumber] = useState(config.connectedPhoneNumber || '+55 11 91789-7747');
  const [groupName, setGroupName] = useState(config.targetGroupName || 'REEMBOLSOS AGUERO INOX');
  const [groupJid, setGroupJid] = useState(config.targetGroupJid || '1203632948192841@g.us');
  const [verifyToken, setVerifyToken] = useState(config.verifyToken || 'aguero_reembolsos_token_2025');
  const [autoReply, setAutoReply] = useState(config.autoReplyConfirmation === true);
  const [filterEmployees, setFilterEmployees] = useState(config.filterOnlyAuthorizedEmployees ?? true);
  
  // Composio non-secret identifiers
  const [composioAccountId, setComposioAccountId] = useState(config.composioConnectedAccountId || '');
  const [composioPhoneNumberId, setComposioPhoneNumberId] = useState(config.composioPhoneNumberId || '');
  const [composioEntityId, setComposioEntityId] = useState(config.composioEntityId || 'aguero_inox_comercial');
  const [messagingMode, setMessagingMode] = useState<'1_to_1_private' | 'group' | 'hybrid_groups_and_private'>(
    config.messagingMode || 'hybrid_groups_and_private'
  );
  const [composioConnectResult, setComposioConnectResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isValidatingComposio, setIsValidatingComposio] = useState(false);

  // Embedded Linked Devices Bridge state
  const [bridgeStatus, setBridgeStatus] = useState<WhatsAppBridgeStatus | null>(null);
  const [isBridgeLoading, setIsBridgeLoading] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [bridgeFeedback, setBridgeFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Instance Sync Credentials (legacy Evolution/Z-API)
  const [instanceUrl, setInstanceUrl] = useState(config.instanceUrl || '');
  const [instanceName, setInstanceName] = useState(config.instanceName || 'aguero-reembolsos');
  const [apiKey, setApiKey] = useState(config.apiKey || '');

  // Tabs
  const [activeTab, setActiveTab] = useState<
    'dispositivos_conectados' | 'composio' | 'sync_ativo' | 'grupo' | 'provedor' | 'colar_json' | 'passo_a_passo'
  >(
    config.provider === 'composio_whatsapp' && config.composioConnectedAccountId
      ? 'composio'
      : 'dispositivos_conectados'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Diagnostics and actions states
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncingMessages, setIsSyncingMessages] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);

  // Raw JSON Payload paste
  const [rawPayloadText, setRawPayloadText] = useState('');
  const [isImportingPayload, setIsImportingPayload] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  // Keep state synchronized whenever config updates or modal opens
  useEffect(() => {
    if (config) {
      if (config.provider) setProvider(config.provider);
      if (config.connectedPhoneNumber) setPhoneNumber(config.connectedPhoneNumber);
      if (config.targetGroupName) setGroupName(config.targetGroupName);
      if (config.targetGroupJid) setGroupJid(config.targetGroupJid);
      if (config.verifyToken) setVerifyToken(config.verifyToken);
      if (config.autoReplyConfirmation !== undefined) setAutoReply(config.autoReplyConfirmation);
      if (config.filterOnlyAuthorizedEmployees !== undefined) setFilterEmployees(config.filterOnlyAuthorizedEmployees);
      if (config.instanceUrl !== undefined) setInstanceUrl(config.instanceUrl);
      if (config.instanceName !== undefined) setInstanceName(config.instanceName);
      if (config.apiKey !== undefined) setApiKey(config.apiKey);
      if (config.composioConnectedAccountId !== undefined) setComposioAccountId(config.composioConnectedAccountId);
      if (config.composioPhoneNumberId !== undefined) setComposioPhoneNumberId(config.composioPhoneNumberId);
      if (config.composioEntityId !== undefined) setComposioEntityId(config.composioEntityId);
      if (config.messagingMode !== undefined) setMessagingMode(config.messagingMode);
    }
  }, [config, isOpen]);

  // Poll bridge status while modal is open on Dispositivos Conectados tab
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const pollBridge = async () => {
      try {
        const res = await fetchWhatsAppBridgeStatus();
        if (!cancelled && res.success && res.bridge) {
          setBridgeStatus(res.bridge);
          if (res.bridge.state === 'conectado' && res.bridge.connectedNumber) {
            setPhoneNumber(res.bridge.connectedNumber);
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    };
    pollBridge();
    const timer = setInterval(pollBridge, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentWebhookUrl = window.location.origin
    ? `${window.location.origin}/api/webhooks/whatsapp-receipts`
    : config.webhookUrl;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleUrlChange = (val: string) => {
    let raw = val.trim();
    // Auto-detect if user pasted a connect URL like http://localhost:8080/instance/connect/meuteste
    const connectMatch = raw.match(/^(https?:\/\/[^\/]+)\/instance\/(?:connect|connectionState)\/([a-zA-Z0-9_\-]+)/i);
    if (connectMatch) {
      setInstanceUrl(connectMatch[1]);
      setInstanceName(connectMatch[2]);
      return;
    }
    setInstanceUrl(raw);
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    const isLocalhost = instanceUrl.includes('localhost') || instanceUrl.includes('127.0.0.1');

    try {
      // If localhost, attempt direct browser probe
      if (isLocalhost) {
        try {
          const cleanUrl = instanceUrl.replace(/\/+$/, '');
          const headers: Record<string, string> = {};
          if (apiKey) {
            headers['apikey'] = apiKey;
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          const browserRes = await apiFetch(`${cleanUrl}/instance/connectionState/${instanceName || 'meuteste'}`, {
            headers,
          });
          if (browserRes.ok) {
            const data = await browserRes.json();
            setTestResult({
              success: true,
              message: `✅ Conexão Localhost confirmada diretamente pelo seu navegador! Instância "${instanceName || 'meuteste'}" está online (Estado: ${data?.instance?.state || 'conectado'}).`,
            });
            setIsTestingConn(false);
            return;
          }
        } catch {
          // Fallback to server test
        }
      }

      const res = await apiFetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceUrl,
          apiKey,
          instanceName,
          provider,
        }),
      });
      const data = await res.json();
      if (data.success && data.reachable) {
        setTestResult({
          success: true,
          message: `✅ Conexão bem-sucedida! Servidor respondeu (Status: ${data.state}).`,
        });
      } else {
        if (isLocalhost) {
          setTestResult({
            success: false,
            message: `ℹ️ O servidor do AgueroFlow na nuvem não consegue acessar "localhost" do seu computador diretamente. Use o comando "npx localtunnel --port 8080" no terminal para gerar uma URL pública ou use a aba "Colar JSON" abaixo.`,
          });
        } else {
          setTestResult({
            success: false,
            message: `❌ ${data.error || 'Não foi possível conectar ao servidor WhatsApp.'}`,
          });
        }
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `❌ Erro de conexão: ${err.message}`,
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleActiveSync = async () => {
    setIsSyncingMessages(true);
    setSyncResult(null);
    const isLocalhost = instanceUrl.includes('localhost') || instanceUrl.includes('127.0.0.1');

    try {
      // If localhost, try browser direct fetch from user's machine
      if (isLocalhost) {
        try {
          const cleanUrl = instanceUrl.replace(/\/+$/, '');
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (apiKey) {
            headers['apikey'] = apiKey;
            headers['Authorization'] = `Bearer ${apiKey}`;
          }

          const localRes = await apiFetch(`${cleanUrl}/chat/findMessages/${instanceName || 'meuteste'}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              where: groupJid ? { key: { remoteJid: groupJid } } : {},
              limit: 20,
            }),
          });

          if (localRes.ok) {
            const rawMessages = await localRes.json();
            const list = Array.isArray(rawMessages) ? rawMessages : (rawMessages?.messages?.records || rawMessages?.records || rawMessages?.messages || []);
            
            // Forward fetched messages to AgueroFlow Gemini OCR processor
            const importRes = await apiFetch('/api/whatsapp/import-payload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payload: list }),
            });
            const importData = await importRes.json();

            setSyncResult({
              success: true,
              message: importData.message || `Sincronizado via navegador! ${list.length} mensagens analisadas.`,
              count: importData.processedCount,
            });
            if (onSyncSuccess) onSyncSuccess();
            setIsSyncingMessages(false);
            return;
          }
        } catch {
          // If browser direct call blocked by mixed content, proceed with server sync
        }
      }

      const res = await apiFetch('/api/whatsapp/sync-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceUrl,
          apiKey,
          instanceName,
          targetGroupJid: groupJid,
          provider,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult({
          success: true,
          message: data.message,
          count: data.newReceiptsCount,
        });
        if (onSyncSuccess) onSyncSuccess();
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Falha ao sincronizar mensagens.',
        });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: `Erro na sincronização: ${err.message}`,
      });
    } finally {
      setIsSyncingMessages(false);
    }
  };

  const handleImportRawPayload = async () => {
    if (!rawPayloadText.trim()) return;
    setIsImportingPayload(true);
    setImportResult(null);
    try {
      const res = await apiFetch('/api/whatsapp/import-payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: rawPayloadText }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult({
          success: true,
          message: data.message,
        });
        setRawPayloadText('');
        if (onSyncSuccess) onSyncSuccess();
      } else {
        setImportResult({
          success: false,
          message: data.error || 'Falha ao processar JSON.',
        });
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        message: `Erro ao importar: ${err.message}`,
      });
    } finally {
      setIsImportingPayload(false);
    }
  };

  const handleConnectComposio = async () => {
    if (!composioAccountId.trim()) {
      setComposioConnectResult({ success: false, message: 'Informe o Connected Account ID do Composio (ex: ca_...).' });
      return;
    }
    setIsValidatingComposio(true);
    setComposioConnectResult(null);
    try {
      const res = await apiFetch('/api/composio/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectedAccountId: composioAccountId.trim(),
          phoneNumberId: composioPhoneNumberId.trim(),
          entityId: composioEntityId.trim(),
          connectedPhoneNumber: phoneNumber.trim(),
          messagingMode: '1_to_1_private',
          autoReplyConfirmation: autoReply,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProvider('composio_whatsapp');
        setMessagingMode('1_to_1_private');
        setComposioConnectResult({
          success: true,
          message: data.warning || data.message || 'Conta Composio vinculada em modo 1-para-1 privado!',
        });
        if (onSyncSuccess) onSyncSuccess();
      } else {
        setComposioConnectResult({
          success: false,
          message: data.error || 'Erro ao vincular Connected Account ID.',
        });
      }
    } catch (err: any) {
      setComposioConnectResult({ success: false, message: err.message || 'Erro de comunicação.' });
    } finally {
      setIsValidatingComposio(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig({
        ...config,
        provider,
        messagingMode,
        connectedPhoneNumber: phoneNumber,
        targetGroupName: groupName,
        targetGroupJid: groupJid,
        verifyToken,
        autoReplyConfirmation: autoReply,
        filterOnlyAuthorizedEmployees: filterEmployees,
        instanceUrl,
        instanceName,
        apiKey,
        composioConnectedAccountId: composioAccountId,
        composioPhoneNumberId: composioPhoneNumberId,
        composioEntityId: composioEntityId,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl w-full max-w-4xl my-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-cyan-950/70 border-b border-emerald-500/30 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-emerald-400" /> WhatsApp OCR Gateway
              </span>
              <span className="text-xs text-slate-400">Leitor Automático de Cupons de Campo</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Como Configurar o Número e o Grupo do WhatsApp
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Conecte o número da empresa ao grupo de reembolsos dos técnicos. Ao enviar uma foto de nota fiscal, o AgueroFlow lê os valores, CNPJ, data e categoria instantaneamente.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-5 pt-2 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('dispositivos_conectados')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'dispositivos_conectados'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            1. Dispositivos Conectados (QR)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('composio')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'composio'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            2. Composio 1-a-1
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sync_ativo')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'sync_ativo'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            3. Gateway Externo
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('grupo')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'grupo'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            4. Grupo & Parâmetros
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('colar_json')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'colar_json'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4 text-cyan-400" />
            5. Colar JSON
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('provedor')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'provedor'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            6. Webhook
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('passo_a_passo')}
            className={`px-4 py-2.5 border-b-2 font-bold whitespace-nowrap transition flex items-center gap-2 ${
              activeTab === 'passo_a_passo'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            7. Guia
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-200 text-xs">
          {/* TAB 1: DISPOSITIVOS CONECTADOS (QR CODE NATIVO + GRUPOS REAIS) */}
          {activeTab === 'dispositivos_conectados' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-emerald-300 font-bold text-xs">
                    Ponte Dispositivos Conectados (Seu Próprio Número + Leitura Direta em Grupos)
                  </strong>
                  <span className="text-[11px] font-mono text-slate-300">
                    {bridgeStatus?.state === 'conectado' ? `Conectado (${bridgeStatus.connectedNumber})` : bridgeStatus?.state || 'desconectado'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Conecte seu WhatsApp escaneando o QR Code aqui dentro do AgueroFlow. Assim você lê fotos de cupons fiscais enviadas em grupos reais da empresa e responde automaticamente no mesmo grupo — sem precisar de ngrok, localtunnel ou servidor externo.
                </p>
              </div>

              {bridgeStatus?.state === 'conectado' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 block">WhatsApp Conectado</span>
                      <strong className="text-sm text-white font-mono">
                        {bridgeStatus.connectedNumber} · {bridgeStatus.connectedName}
                      </strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setIsBridgeLoading(true);
                          setBridgeFeedback(null);
                          try {
                            const gRes = await fetchWhatsAppBridgeGroups();
                            if (gRes.success) {
                              setBridgeStatus((prev) => (prev ? { ...prev, groups: gRes.groups } : prev));
                              setBridgeFeedback({ success: true, message: `${gRes.groups.length} grupo(s) carregado(s).` });
                            } else {
                              setBridgeFeedback({ success: false, message: gRes.error || 'Falha ao carregar grupos.' });
                            }
                          } catch (err: any) {
                            setBridgeFeedback({ success: false, message: err?.message || 'Erro ao carregar grupos.' });
                          } finally {
                            setIsBridgeLoading(false);
                          }
                        }}
                        disabled={isBridgeLoading}
                        className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBridgeLoading ? 'animate-spin' : ''}`} />
                        <span>Sincronizar Grupos</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsBridgeLoading(true);
                          setBridgeFeedback(null);
                          try {
                            const dRes = await disconnectWhatsAppBridge(true);
                            if (dRes.bridge) setBridgeStatus(dRes.bridge);
                            if (dRes.success) {
                              setBridgeFeedback({ success: true, message: dRes.message || 'Dispositivo desconectado.' });
                            } else {
                              setBridgeFeedback({ success: false, message: dRes.error || 'Erro ao desconectar dispositivo.' });
                            }
                          } catch (err: any) {
                            setBridgeFeedback({ success: false, message: err?.message || 'Erro ao desconectar dispositivo.' });
                          } finally {
                            setIsBridgeLoading(false);
                          }
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 rounded-xl font-semibold"
                      >
                        Desconectar
                      </button>
                    </div>
                  </div>

                  {/* Real Groups Picker */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">
                      Selecione o Grupo de Reembolsos ({bridgeStatus.groups?.length || 0} grupos disponíveis):
                    </span>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900/50">
                      {(bridgeStatus.groups || []).length === 0 ? (
                        <p className="p-4 text-slate-400 text-center">
                          Clique em "Sincronizar Grupos" acima para listar os grupos do seu WhatsApp.
                        </p>
                      ) : (
                        bridgeStatus.groups.map((grp) => {
                          const isSelected = groupJid === grp.jid;
                          return (
                            <div key={grp.jid} className="p-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">{grp.subject}</p>
                                <p className="text-[10px] text-slate-400 font-mono truncate">
                                  {grp.participantsCount} membros · {grp.jid}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  setBridgeFeedback(null);
                                  try {
                                    const sRes = await selectWhatsAppBridgeGroup({
                                      groupJid: grp.jid,
                                      groupName: grp.subject,
                                    });
                                    if (sRes.success) {
                                      setGroupName(grp.subject);
                                      setGroupJid(grp.jid);
                                      setProvider('baileys_web_bridge');
                                      setMessagingMode('hybrid_groups_and_private');
                                      setBridgeFeedback({
                                        success: true,
                                        message: sRes.message || `Grupo "${grp.subject}" selecionado!`,
                                      });
                                      if (onSyncSuccess) onSyncSuccess();
                                    } else {
                                      setBridgeFeedback({
                                        success: false,
                                        message: sRes.error || 'Erro ao selecionar grupo.',
                                      });
                                    }
                                  } catch (err: any) {
                                    setBridgeFeedback({
                                      success: false,
                                      message: err?.message || 'Erro ao selecionar grupo.',
                                    });
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg font-semibold text-xs shrink-0 ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white'
                                }`}
                              >
                                {isSelected ? 'Grupo Ativo' : 'Selecionar Grupo'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3 min-h-[240px]">
                    {bridgeStatus?.qrDataUrl ? (
                      <>
                        <div className="bg-white p-2.5 rounded-xl">
                          <img src={bridgeStatus.qrDataUrl} alt="QR Code WhatsApp" className="w-44 h-44 block" />
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsBridgeLoading(true);
                            setBridgeFeedback(null);
                            try {
                              const res = await connectWhatsAppBridge({ forceFreshQr: true });
                              if (res.bridge) setBridgeStatus(res.bridge);
                              if (!res.success) {
                                setBridgeFeedback({ success: false, message: res.error || 'Erro ao gerar novo QR Code.' });
                              }
                            } catch (err: any) {
                              setBridgeFeedback({ success: false, message: err?.message || 'Erro ao gerar novo QR Code.' });
                            } finally {
                              setIsBridgeLoading(false);
                            }
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                        >
                          Gerar novo QR Code
                        </button>
                      </>
                    ) : bridgeStatus?.pairingCode ? (
                      <div className="text-center space-y-2">
                        <span className="text-xs text-slate-400 block">Digite este código no WhatsApp:</span>
                        <strong className="text-2xl font-mono tracking-widest text-cyan-300 block">
                          {bridgeStatus.pairingCode}
                        </strong>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isBridgeLoading}
                        onClick={async () => {
                          setIsBridgeLoading(true);
                          setBridgeFeedback(null);
                          try {
                            const res = await connectWhatsAppBridge({ forceFreshQr: false });
                            if (res.bridge) setBridgeStatus(res.bridge);
                            if (!res.success) {
                              setBridgeFeedback({ success: false, message: res.error || 'Erro ao gerar QR Code.' });
                            }
                          } catch (err: any) {
                            setBridgeFeedback({ success: false, message: err?.message || 'Erro ao gerar QR Code.' });
                          } finally {
                            setIsBridgeLoading(false);
                          }
                        }}
                        className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{isBridgeLoading ? 'Gerando QR Code...' : 'Gerar QR Code Dispositivos Conectados'}</span>
                      </button>
                    )}
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                    <strong className="text-white block text-xs">Como conectar pelo celular:</strong>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                      <li>Abra o WhatsApp no celular do número que participa dos grupos;</li>
                      <li>Acesse <strong>Dispositivos Conectados → Conectar aparelho</strong>;</li>
                      <li>Escaneie o QR Code ao lado ou use o pareamento por número abaixo:</li>
                    </ol>
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                        placeholder="Ex: 5511917897747"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                      <button
                        type="button"
                        disabled={isBridgeLoading || !pairingPhone.trim()}
                        onClick={async () => {
                          setIsBridgeLoading(true);
                          setBridgeFeedback(null);
                          try {
                            const res = await connectWhatsAppBridge({
                              phoneNumberForPairing: pairingPhone.trim(),
                              forceFreshQr: true,
                            });
                            if (res.bridge) setBridgeStatus(res.bridge);
                            if (!res.success) {
                              setBridgeFeedback({ success: false, message: res.error || 'Erro ao solicitar código de pareamento.' });
                            }
                          } catch (err: any) {
                            setBridgeFeedback({ success: false, message: err?.message || 'Erro ao solicitar código de pareamento.' });
                          } finally {
                            setIsBridgeLoading(false);
                          }
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                      >
                        Código 8 dígitos
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {bridgeFeedback && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${bridgeFeedback.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'}`}>
                  {bridgeFeedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{bridgeFeedback.message}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB: COMPOSIO 1-PARA-1 PRIVADO */}
          {activeTab === 'composio' && (
            <div className="space-y-4">
              <div className="p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-cyan-300 font-bold text-xs">
                    Integração Oficial WhatsApp Business via Composio (Chat Privado 1-para-1)
                  </strong>
                  <span className="text-[11px] font-mono text-slate-300">Modo: 1-a-1 Privado</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Ao utilizar o ID conectado do Composio (Meta Cloud API oficial), os funcionários enviam as fotos de cupons fiscais diretamente no privado para o número oficial da empresa. O módulo Comercial e o OCR de Reembolsos compartilham a mesma conexão.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Composio Connected Account ID *
                  </label>
                  <input
                    type="text"
                    value={composioAccountId}
                    onChange={(e) => setComposioAccountId(e.target.value)}
                    placeholder="Ex: ca_a1b2c3d4e5f6"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Meta Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={composioPhoneNumberId}
                    onChange={(e) => setComposioPhoneNumberId(e.target.value)}
                    placeholder="Ex: 109823456789012"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Entity / User ID no Composio
                  </label>
                  <input
                    type="text"
                    value={composioEntityId}
                    onChange={(e) => setComposioEntityId(e.target.value)}
                    placeholder="aguero_inox_comercial"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400">
                  A chave <code className="font-mono text-cyan-300">COMPOSIO_API_KEY</code> deve estar nos Secrets do servidor.
                </span>
                <button
                  type="button"
                  onClick={handleConnectComposio}
                  disabled={isValidatingComposio}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isValidatingComposio ? 'Validando ID...' : 'Validar e Ativar Composio ID'}</span>
                </button>
              </div>

              {composioConnectResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${composioConnectResult.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'}`}>
                  {composioConnectResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{composioConnectResult.message}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB: SINCRONIZAÇÃO ATIVA (RECOMENDADO) */}
          {activeTab === 'sync_ativo' && (
            <div className="space-y-4">
              {/* Diagnostic Explanation Banner */}
              <div className="p-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-cyan-950/40 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Por que as mensagens de ontem não chegaram pelo Webhook?</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  O ambiente do AI Studio roda em uma URL de desenvolvimento protegida por firewall do Google. Quando um servidor externo tenta enviar um <code className="text-amber-300 font-mono">POST</code> de webhook para cá, ele é bloqueado.
                  Porém, <strong>chamadas feitas de dentro do AgueroFlow para o seu servidor WhatsApp funcionam perfeitamente sem bloqueios!</strong>
                </p>
                <div className="p-2.5 bg-slate-950/80 rounded-xl border border-amber-500/20 text-[11px] text-slate-200 font-medium">
                  👉 <strong>Solução Rápida:</strong> Preencha a URL da sua <strong>Evolution API</strong> ou <strong>Z-API</strong> abaixo e clique em <span className="text-emerald-300 font-bold">"Sincronizar Mensagens do Grupo Agora"</span>. O sistema buscará as fotos de cupons fiscais enviadas e rodará o Gemini Flash OCR na hora!
                </div>
              </div>

              {/* Form Fields for Active Sync */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>URL do Servidor / Evolution API / Z-API *</span>
                    <span className="text-[10px] text-slate-500 font-mono">Ex: https://api.seudominio.com.br ou https://api.z-api.io</span>
                  </label>
                  <input
                    type="url"
                    value={instanceUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="Ex: http://localhost:8080 ou https://api.meuzap.com.br"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  {instanceUrl.includes('localhost') && (
                    <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl space-y-1.5 text-[11px] text-cyan-200 mt-2">
                      <div className="font-bold flex items-center gap-1.5 text-cyan-300">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Instância Local Detectada: {instanceUrl}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        • <strong>Instância:</strong> <code className="text-emerald-300 font-bold font-mono">{instanceName || 'meuteste'}</code><br />
                        • <strong>Onde ver a Chave de API:</strong> Abra o arquivo <code className="text-amber-300 font-mono">.env</code> ou <code className="text-amber-300 font-mono">docker-compose.yml</code> na pasta da sua Evolution API e copie o valor de <code className="text-emerald-300 font-bold font-mono">AUTHENTICATION_API_KEY=</code> (ex: <code className="text-slate-400 font-mono">42960869-7875-43a6-84bb-3e604f2d5796</code> ou <code className="text-slate-400 font-mono">B6D711FCDE4D4FD5936544120E713976</code>).
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Nome da Instância *
                  </label>
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="Ex: meuteste"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Chave de API (AUTHENTICATION_API_KEY)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Do seu .env</span>
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Ex: B6D711FCDE4D4FD5936544120E713976"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>ID do Grupo do WhatsApp (JID)</span>
                    <span className="text-[10px] text-slate-500 font-mono">{groupJid || 'Qualquer mensagem recebida'}</span>
                  </label>
                  <input
                    type="text"
                    value={groupJid}
                    onChange={(e) => setGroupJid(e.target.value)}
                    placeholder="Ex: 1203632948192841@g.us"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConn || !instanceUrl}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isTestingConn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>Testar Conexão com Servidor</span>
                </button>

                <button
                  type="button"
                  onClick={handleActiveSync}
                  disabled={isSyncingMessages}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingMessages ? 'animate-spin' : ''}`} />
                  <span>{isSyncingMessages ? 'Buscando & Processando Mensagens...' : 'Sincronizar Mensagens do Grupo Agora'}</span>
                </button>
              </div>

              {/* Feedback Results */}
              {testResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${testResult.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'}`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              {syncResult && (
                <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${syncResult.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'}`}>
                  <div className="flex items-center gap-2 font-bold">
                    {syncResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                    <span>{syncResult.message}</span>
                  </div>
                  {syncResult.count !== undefined && syncResult.count > 0 && (
                    <p className="text-[11px] text-slate-300">
                      Os novos cupons já foram adicionados à lista principal de despesas e deduzidos do controle orçamentário.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: COLAR JSON / WEBHOOK MANUAL */}
          {activeTab === 'colar_json' && (
            <div className="space-y-4">
              <div className="p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>Importação Direta de Payload JSON</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Se você tem acesso ao painel da sua Evolution API, Z-API ou Webhook.site e visualizou o JSON da mensagem que os técnicos enviaram, cole o conteúdo abaixo. O AgueroFlow extrairá a imagem e executará o OCR com o Gemini Flash imediatamente.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Conteúdo JSON da Mensagem ou Webhook:</span>
                  <span className="text-[10px] text-slate-500">Aceita formato Evolution API, Z-API ou Meta</span>
                </label>
                <textarea
                  rows={8}
                  value={rawPayloadText}
                  onChange={(e) => setRawPayloadText(e.target.value)}
                  placeholder={`Cole aqui o JSON recebido pelo seu webhook, ex:\n{\n  "event": "messages.upsert",\n  "data": {\n    "pushName": "Carlos Eduardo",\n    "message": { "imageMessage": { "caption": "Almoço da equipe" } }\n  }\n}`}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono placeholder:text-slate-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {rawPayloadText.length > 0 ? `${rawPayloadText.length} caracteres inseridos` : 'Aguardando JSON'}
                </span>
                <button
                  type="button"
                  onClick={handleImportRawPayload}
                  disabled={isImportingPayload || !rawPayloadText.trim()}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-cyan-200" />
                  <span>{isImportingPayload ? 'Processando com Gemini Flash OCR...' : 'Processar JSON com Gemini Flash'}</span>
                </button>
              </div>

              {importResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${importResult.success ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'}`}>
                  {importResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{importResult.message}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: PASSO A PASSO ILUSTRADO */}
          {activeTab === 'passo_a_passo' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-emerald-300">Como funciona o fluxo na prática:</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    O técnico de montagem abastece a van ou almoça durante a obra, tira uma foto do cupom fiscal e manda no WhatsApp do grupo. Em 3 segundos, o sistema registra o reembolso no AgueroFlow!
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Status: Operacional
                </div>
              </div>

              {/* Steps Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Step 1 */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-300 font-mono font-bold flex items-center justify-center text-xs">
                    01
                  </div>
                  <strong className="text-sm text-white block">Crie o Grupo no WhatsApp</strong>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Crie um grupo chamado <strong>"Reembolsos & Notas - Aguero Inox"</strong> no WhatsApp da empresa e adicione os técnicos de campo (Carlos, Marcos, Rafael, André).
                  </p>
                  <div className="p-2 bg-slate-950 rounded-lg text-[10px] text-cyan-300 font-mono">
                    Nome: {groupName || 'Aguardando você definir na aba Grupo'}
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-300 font-mono font-bold flex items-center justify-center text-xs">
                    02
                  </div>
                  <strong className="text-sm text-white block">Conecte o Número Gateway</strong>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    O número da empresa recebe os webhooks através da <strong>Evolution API</strong> (via QR Code), <strong>Meta Cloud API</strong> oficial ou <strong>Z-API</strong>.
                  </p>
                  <div className="p-2 bg-slate-950 rounded-lg text-[10px] text-emerald-300 font-mono">
                    Tel: {phoneNumber}
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="w-7 h-7 rounded-xl bg-purple-500/20 text-purple-300 font-mono font-bold flex items-center justify-center text-xs">
                    03
                  </div>
                  <strong className="text-sm text-white block">Leitura & Resposta Automática</strong>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Ao receber a imagem no grupo, a IA extrai CNPJ, data, valor e abastecimento. O bot responde no grupo confirmando o registro e deduz do fundo de reserva da missão.
                  </p>
                  <div className="p-2 bg-slate-950 rounded-lg text-[10px] text-purple-300 font-mono">
                    Resposta: ✅ R$ 403,00 (Diesel)
                  </div>
                </div>
              </div>

              {/* Instructions banner */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
                <h5 className="text-xs font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  Instruções para passar aos Técnicos no WhatsApp:
                </h5>
                <div className="p-3 bg-slate-950 rounded-xl text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed border border-slate-800">
                  {`"Equipe, para lançar qualquer despesa em campo:
1. Tire uma foto nítida e reta do cupom fiscal ou recibo;
2. Envie aqui neste grupo com a legenda da OS (ex: 'OS-2025-042 - Diesel Van');
3. O sistema AgueroFlow fará a leitura automática na hora e confirmará o valor registrado!"`}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GRUPO & PARÂMETROS */}
          {activeTab === 'grupo' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Nome Oficial do Grupo no WhatsApp *
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ex: REEMBOLSOS AGUERO INOX"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Nome que aparece no topo do grupo no WhatsApp dos funcionários.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    ID / JID do Grupo no WhatsApp (opcional)
                  </label>
                  <input
                    type="text"
                    value={groupJid}
                    onChange={(e) => setGroupJid(e.target.value)}
                    placeholder="Ex: 1203632948192841@g.us"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Identificador único do grupo retornado pela API para filtrar com precisão.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Número do WhatsApp da Empresa (Gateway) *
                  </label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+55 (11) 91789-7747"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Token de Verificação do Webhook *
                  </label>
                  <input
                    type="text"
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoReply}
                    onChange={(e) => setAutoReply(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <strong className="text-white block text-xs">Resposta Automática no WhatsApp</strong>
                    <span className="text-[10px] text-slate-400">
                      Enviar confirmação no grupo assim que o cupom for processado com sucesso.
                    </span>
                  </div>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterEmployees}
                    onChange={(e) => setFilterEmployees(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <strong className="text-white block text-xs">Filtrar Apenas Técnicos Cadastrados</strong>
                    <span className="text-[10px] text-slate-400">
                      Ignorar mensagens de números desconhecidos para evitar fraudes ou spam no grupo.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: PROVEDOR & WEBHOOK TÉCNICO */}
          {activeTab === 'provedor' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Escolha o Provedor do WhatsApp:</label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  {[
                    {
                      id: 'composio_whatsapp',
                      name: 'Composio (1-a-1)',
                      tag: 'SDK Oficial',
                      desc: 'Conecta via Connected Account ID e API oficial Meta em chat privado 1-para-1.',
                    },
                    {
                      id: 'evolution_api',
                      name: 'Evolution API',
                      tag: 'QR Code Direto',
                      desc: 'Open-source, lê grupos nativamente e conecta via QR Code.',
                    },
                    {
                      id: 'meta_cloud_api',
                      name: 'Meta Cloud API',
                      tag: 'Oficial Meta',
                      desc: 'Webhook direto dos servidores da Meta.',
                    },
                    {
                      id: 'z_api',
                      name: 'Z-API / Baileys',
                      tag: 'Cloud Gateway',
                      desc: 'Integração cloud com suporte a grupos.',
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProvider(p.id as any)}
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        provider === p.id
                          ? 'bg-emerald-950/40 border-emerald-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <strong className="text-xs">{p.name}</strong>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 font-mono">
                          {p.tag}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Webhook URLs to copy */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      URL de Webhook (Cole no painel do seu provedor de WhatsApp)
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentWebhookUrl, 'url')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                    >
                      {copiedField === 'url' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'url' ? 'Copiado!' : 'Copiar URL'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-emerald-300 select-all overflow-x-auto">
                    {currentWebhookUrl}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">Verify Token</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(verifyToken, 'token')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                    >
                      {copiedField === 'token' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'token' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300">
                    {verifyToken}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white font-semibold text-xs rounded-xl"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition disabled:opacity-50"
          >
            {isSaving ? (
              <span>Salvando...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Salvar Configuração do WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
