import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WhatsAppSessionsPanel } from './WhatsAppSessionsPanel';
import {
  MessageSquare,
  Send,
  Link2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Copy,
  Users,
  Building2,
  ExternalLink,
  ShieldCheck,
  Radio,
  Plus,
  QrCode,
  Smartphone,
  LogOut,
  Hash,
  Bot,
  BarChart3,
  Zap,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { CommercialClient, CommercialProposal } from '../../types/commercial';
import {
  ComposioConnectionSummary,
  ComposioWhatsAppStatusResponse,
  WhatsAppAiAssistantMessage,
  WhatsAppAutoResponderRule,
  WhatsAppBridgeStatus,
  WhatsAppBusinessMessage,
  WhatsAppContactType,
  WhatsAppGroupSummary,
  WhatsAppManagedContact,
  WhatsAppMentionConfig,
  WhatsAppMessageCategory,
  WhatsAppOcrDashboardResponse,
  WhatsAppQuickReply,
  WhatsAppScheduledJob,
} from '../../types/whatsappComposio';
import {
  connectComposioWhatsAppAccount,
  connectWhatsAppBridge,
  createComposioWhatsAppAuthLink,
  disconnectWhatsAppBridge,
  fetchComposioWhatsAppMessages,
  fetchComposioWhatsAppStatus,
  fetchWhatsAppAssistantState,
  fetchWhatsAppBridgeGroups,
  fetchWhatsAppBridgeStatus,
  fetchWhatsAppContacts,
  fetchWhatsAppOcrDashboard,
  fetchWhatsAppQuickReplies,
  incrementQuickReplyUsage,
  invokeWhatsAppMentionAi,
  listComposioWhatsAppAccounts,
  reconnectComposioRealtime,
  selectWhatsAppBridgeGroup,
  sendWhatsAppMessageViaBridge,
  sendWhatsAppMessageViaComposio,
  syncOcrReceiptsVault,
  syncScheduledJobsWithFirestore,
  syncWhatsAppContactsWithFirestore,
  toggleWhatsAppContactOcr,
} from '../../services/composioWhatsAppClient';
import { WhatsAppContactsTab } from './WhatsAppContactsTab';
import { WhatsAppQuickRepliesTab } from './WhatsAppQuickRepliesTab';
import { WhatsAppAiAssistantTab } from './WhatsAppAiAssistantTab';
import { WhatsAppOcrDashboardTab } from './WhatsAppOcrDashboardTab';

interface WhatsAppBusinessHubProps {
  organizationId: string;
  organizationName: string;
  userName: string;
  proposals: CommercialProposal[];
  clients: CommercialClient[];
}

interface ConversationThread {
  threadKey: string;
  targetJidOrPhone: string;
  contactPhone: string;
  contactName: string;
  contactType: WhatsAppContactType;
  isGroup: boolean;
  groupName?: string;
  lastMessageText: string;
  lastMessageAt: string;
  lastDirection: 'inbound' | 'outbound';
  messageCount: number;
  linkedProposalCode?: string;
  sourceBridge?: 'baileys_web' | 'composio' | 'webhook';
}

const normalizePhoneDigits = (raw: string): string => {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const formatCurrencyBRL = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const categoryLabels: Record<WhatsAppMessageCategory, string> = {
  comercial_proposta: 'Proposta Comercial',
  cobranca_followup: 'Follow-up Orçamento',
  reembolso_ocr: 'Reembolso OCR',
  orientacao_equipe: 'Orientação / Grupo',
  atendimento: 'Atendimento Direto',
};

export const WhatsAppBusinessHub: React.FC<WhatsAppBusinessHubProps> = ({
  organizationId,
  organizationName,
  userName,
  proposals,
  clients,
}) => {
  const [subTab, setSubTab] = useState<
    | 'mensagens'
    | 'contatos'
    | 'respostas_rapidas'
    | 'assistente_ia'
    | 'dashboard_ocr'
    | 'conexao'
    | 'educar_equipe'
  >('mensagens');
  const [connectionChannel, setConnectionChannel] = useState<'dispositivos_conectados' | 'composio'>(
    'dispositivos_conectados'
  );
  const [statusData, setStatusData] = useState<ComposioWhatsAppStatusResponse | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<WhatsAppBridgeStatus | null>(null);
  const [pinnedGroupJid, setPinnedGroupJid] = useState('');
  const [pinnedGroupName, setPinnedGroupName] = useState('');
  const [messages, setMessages] = useState<WhatsAppBusinessMessage[]>([]);
  const [contacts, setContacts] = useState<WhatsAppManagedContact[]>([]);
  const [quickReplies, setQuickReplies] = useState<WhatsAppQuickReply[]>([]);
  const [assistantRules, setAssistantRules] = useState<WhatsAppAutoResponderRule[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<WhatsAppScheduledJob[]>([]);
  const [assistantChat, setAssistantChat] = useState<WhatsAppAiAssistantMessage[]>([]);
  const [mentionConfig, setMentionConfig] = useState<WhatsAppMentionConfig | null>(null);
  const [ocrDashboard, setOcrDashboard] = useState<WhatsAppOcrDashboardResponse | null>(null);
  const [includeOcrHistory, setIncludeOcrHistory] = useState(false);
  const includeOcrHistoryRef = useRef(false);
  const [ocrVaultStatus, setOcrVaultStatus] = useState('Histórico Protegido (Servidor + Cofre)');
  const hasRunInitialVaultSyncRef = useRef(false);
  const [preselectedAiCommand, setPreselectedAiCommand] = useState('');
  const [isAskingMentionAi, setIsAskingMentionAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Linked Devices Bridge controls
  const [pairingPhoneInput, setPairingPhoneInput] = useState('');
  const [isBridgeBusy, setIsBridgeBusy] = useState(false);
  const [isRefreshingGroups, setIsRefreshingGroups] = useState(false);

  // Composio connection form state (non-secret IDs only)
  const [connectedAccountId, setConnectedAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [entityId, setEntityId] = useState('aguero_inox_comercial');
  const [authConfigId, setAuthConfigId] = useState('');
  const [connectedPhoneNumber, setConnectedPhoneNumber] = useState('');
  const [autoReplyConfirmation, setAutoReplyConfirmation] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);

  const [isSavingConn, setIsSavingConn] = useState(false);
  const [isListingAccounts, setIsListingAccounts] = useState(false);
  const [discoveredAccounts, setDiscoveredAccounts] = useState<ComposioConnectionSummary[]>([]);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState<string | null>(null);
  const [isReconnectingRealtime, setIsReconnectingRealtime] = useState(false);

  // Messaging Workspace state
  const [contactFilter, setContactFilter] = useState<'todos' | 'grupos' | 'cliente' | 'funcionario'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeThreadKey, setActiveThreadKey] = useState<string>('');
  const [draftTarget, setDraftTarget] = useState(''); // Phone number OR group JID (@g.us)
  const [draftContactName, setDraftContactName] = useState('');
  const [draftIsGroup, setDraftIsGroup] = useState(false);
  const [draftContactType, setDraftContactType] = useState<WhatsAppContactType>('cliente');
  const [draftCategory, setDraftCategory] = useState<WhatsAppMessageCategory>('comercial_proposta');
  const [draftProposalId, setDraftProposalId] = useState('');
  const [draftProposalCode, setDraftProposalCode] = useState('');
  const [draftText, setDraftText] = useState('');
  const [sendVia, setSendVia] = useState<'auto' | 'bridge' | 'composio'>('auto');
  const [isSending, setIsSending] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Employee custom test/onboarding number
  const [employeeTargetPhone, setEmployeeTargetPhone] = useState('');
  const [employeeTargetName, setEmployeeTargetName] = useState('');

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  const loadAll = async (showSpinner = false, includeHistOverride?: boolean) => {
    if (showSpinner) setLoading(true);
    const effectiveIncludeHist =
      includeHistOverride !== undefined ? includeHistOverride : includeOcrHistoryRef.current;
    try {
      const [st, msgs, br, ct, qr, ai, ocr] = await Promise.all([
        fetchComposioWhatsAppStatus(),
        fetchComposioWhatsAppMessages({ organizationId }),
        fetchWhatsAppBridgeStatus(),
        fetchWhatsAppContacts(),
        fetchWhatsAppQuickReplies(),
        fetchWhatsAppAssistantState(),
        fetchWhatsAppOcrDashboard(effectiveIncludeHist),
      ]);

      if (st?.success && st.config) {
        setStatusData(st);
        setConnectedAccountId(st.config.composioConnectedAccountId || '');
        setPhoneNumberId(st.config.composioPhoneNumberId || '');
        setWabaId(st.config.composioWabaId || '');
        setEntityId(st.config.composioEntityId || 'aguero_inox_comercial');
        setAuthConfigId(st.config.composioAuthConfigId || '');
        setConnectedPhoneNumber(st.config.connectedPhoneNumber || '');
        setAutoReplyConfirmation(st.config.autoReplyConfirmation === true);
        setRealtimeEnabled(st.config.composioRealtimeEnabled ?? true);
      }

      if (br?.success && br.bridge) {
        setBridgeStatus(br.bridge);
        setPinnedGroupJid(br.targetGroupJid || '');
        setPinnedGroupName(br.targetGroupName || '');
      }

      if (msgs?.success && Array.isArray(msgs.messages)) {
        setMessages(msgs.messages);
      }

      if (ct?.success && Array.isArray(ct.contacts)) {
        setContacts(ct.contacts);
        if (!hasRunInitialVaultSyncRef.current) {
          syncWhatsAppContactsWithFirestore(ct.contacts, organizationId)
            .then((syncCt) => {
              if (syncCt.restoredCount > 0 && syncCt.contacts.length > 0) {
                setContacts(syncCt.contacts);
              }
            })
            .catch(() => {});
        }
      }

      if (qr?.success && Array.isArray(qr.quickReplies)) {
        setQuickReplies(qr.quickReplies);
      }

      if (ai?.success) {
        setAssistantRules(ai.rules || []);
        setScheduledJobs(ai.scheduledJobs || []);
        setAssistantChat(ai.chatHistory || []);
        if (ai.mentionConfig) setMentionConfig(ai.mentionConfig);

        if (!hasRunInitialVaultSyncRef.current) {
          syncScheduledJobsWithFirestore(ai.scheduledJobs || [], organizationId)
            .then((syncRes) => {
              if (syncRes.jobs.length > 0) setScheduledJobs(syncRes.jobs);
            })
            .catch(() => {});
        }
      }

      if (ocr?.success) {
        setOcrDashboard(ocr);
        // Triple-redundant OCR vault sync (localStorage + Firestore + server disk backup)
        if (!hasRunInitialVaultSyncRef.current) {
          hasRunInitialVaultSyncRef.current = true;
          const fullOcr = effectiveIncludeHist ? ocr : await fetchWhatsAppOcrDashboard(true);
          if (fullOcr?.success) {
            const vaultRes = await syncOcrReceiptsVault(fullOcr.receipts || []);
            setOcrVaultStatus(
              vaultRes.cloudSynced
                ? `Cofre Protegido (Disco + Nuvem · ${vaultRes.totalProtected} reg.)`
                : `Cofre Protegido (Disco + Local · ${vaultRes.totalProtected} reg.)`
            );
            if (vaultRes.restoredCount > 0) {
              const refreshed = await fetchWhatsAppOcrDashboard(effectiveIncludeHist);
              if (refreshed?.success) setOcrDashboard(refreshed);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados WhatsApp:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(true);
  }, [organizationId]);

  const handleToggleIncludeOcrHistory = async (nextVal: boolean) => {
    includeOcrHistoryRef.current = nextVal;
    setIncludeOcrHistory(nextVal);
    await loadAll(false, nextVal);
  };

  // Lightweight polling for QR/pairing/reconnecting vs normal full refresh
  const isBridgeConnecting =
    bridgeStatus?.state === 'iniciando' ||
    bridgeStatus?.state === 'reconectando' ||
    bridgeStatus?.state === 'aguardando_qr' ||
    bridgeStatus?.state === 'aguardando_pareamento';

  useEffect(() => {
    if (isBridgeConnecting) {
      const fastTimer = setInterval(async () => {
        try {
          const br = await fetchWhatsAppBridgeStatus();
          if (br?.success && br.bridge) {
            setBridgeStatus(br.bridge);
            setPinnedGroupJid(br.targetGroupJid || '');
            setPinnedGroupName(br.targetGroupName || '');
            if (br.bridge.state === 'conectado') {
              await loadAll(false);
            }
          }
        } catch {
          // ignore transient poll hiccup
        }
      }, 2500);
      return () => clearInterval(fastTimer);
    }

    const normalTimer = setInterval(() => loadAll(false), 12000);
    return () => clearInterval(normalTimer);
  }, [organizationId, isBridgeConnecting]);

  // Build threads grouped by chatJid (for groups) or normalized phone (for 1-to-1)
  const threads: ConversationThread[] = useMemo(() => {
    const map = new Map<string, ConversationThread>();
    const sorted = [...messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const msg of sorted) {
      const isGroup = Boolean(msg.isGroup || msg.chatJid?.endsWith('@g.us'));
      const key = isGroup
        ? msg.chatJid || msg.contactPhone
        : normalizePhoneDigits(msg.contactPhone) || msg.chatJid || msg.contactPhone;
      if (!key) continue;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          threadKey: key,
          targetJidOrPhone: isGroup ? msg.chatJid || msg.contactPhone : msg.contactPhone,
          contactPhone: msg.contactPhone,
          contactName: isGroup ? msg.groupName || msg.contactName : msg.contactName || msg.contactPhone,
          contactType: msg.contactType || 'cliente',
          isGroup,
          groupName: msg.groupName,
          lastMessageText:
            isGroup && msg.participantName
              ? `${msg.participantName}: ${msg.text}`
              : msg.text,
          lastMessageAt: msg.createdAt,
          lastDirection: msg.direction,
          messageCount: 1,
          linkedProposalCode: msg.linkedProposalCode,
          sourceBridge: msg.sourceBridge,
        });
      } else {
        existing.messageCount += 1;
        if (!existing.linkedProposalCode && msg.linkedProposalCode) {
          existing.linkedProposalCode = msg.linkedProposalCode;
        }
      }
    }

    return Array.from(map.values()).filter((t) => {
      if (contactFilter === 'grupos' && !t.isGroup) return false;
      if (contactFilter === 'cliente' && (t.isGroup || t.contactType !== 'cliente')) return false;
      if (contactFilter === 'funcionario' && (t.isGroup || t.contactType !== 'funcionario')) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.contactName.toLowerCase().includes(q) ||
          t.contactPhone.toLowerCase().includes(q) ||
          (t.groupName || '').toLowerCase().includes(q) ||
          t.lastMessageText.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [messages, contactFilter, searchQuery]);

  const activeThreadMessages = useMemo(() => {
    if (!activeThreadKey) return [];
    return messages
      .filter((m) => {
        const isGroup = Boolean(m.isGroup || m.chatJid?.endsWith('@g.us'));
        const key = isGroup
          ? m.chatJid || m.contactPhone
          : normalizePhoneDigits(m.contactPhone) || m.chatJid || m.contactPhone;
        return key === activeThreadKey;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, activeThreadKey]);

  const isBridgeConnected = bridgeStatus?.state === 'conectado';
  const isComposioConnected = Boolean(connectedAccountId.trim()) && Boolean(statusData?.apiKeyConfigured);
  const discoveredGroups = bridgeStatus?.groups || [];

  const handleSelectThread = (thread: ConversationThread) => {
    setActiveThreadKey(thread.threadKey);
    setDraftTarget(thread.targetJidOrPhone);
    setDraftContactName(thread.contactName);
    setDraftIsGroup(thread.isGroup);
    setDraftContactType(thread.contactType);
    if (thread.isGroup) {
      setDraftCategory('orientacao_equipe');
    }
  };

  const handleOpenGroupChat = (group: WhatsAppGroupSummary) => {
    setActiveThreadKey(group.jid);
    setDraftTarget(group.jid);
    setDraftContactName(group.subject);
    setDraftIsGroup(true);
    setDraftContactType('funcionario');
    setDraftCategory('orientacao_equipe');
    setSubTab('mensagens');
  };

  const handleStartNewConversation = () => {
    setActiveThreadKey('');
    setDraftTarget('');
    setDraftContactName('');
    setDraftIsGroup(false);
    setDraftContactType('cliente');
    setDraftProposalId('');
    setDraftProposalCode('');
    setDraftText('');
  };

  const handlePickProposal = (proposalId: string) => {
    const prop = proposals.find((p) => p.id === proposalId);
    if (!prop) return;
    const cli = clients.find((c) => c.id === prop.clientId || c.name === prop.clientName);
    const phone = prop.clientPhone || cli?.contactPhone || '';
    const key = normalizePhoneDigits(phone);

    setDraftProposalId(prop.id);
    setDraftProposalCode(prop.code);
    setDraftContactName(prop.clientContactPerson || prop.clientName || cli?.name || '');
    setDraftIsGroup(false);
    setDraftContactType('cliente');
    setDraftCategory('comercial_proposta');
    if (phone) {
      setDraftTarget(phone);
      setActiveThreadKey(key);
    }

    const totalVal = prop.proposedTotal || prop.totalBaseCost || 0;
    const validityText = prop.validityDate
      ? new Date(prop.validityDate).toLocaleDateString('pt-BR')
      : '15 dias';
    setDraftText(
      `Olá ${prop.clientContactPerson || cli?.contactName || prop.clientName}, tudo bem?\nSegue o resumo da proposta *${prop.code}* (${prop.title}) elaborada pela ${organizationName}.\n\nValor Total: ${formatCurrencyBRL(totalVal)}\nValidade: ${validityText}\n\nFicamos à disposição para esclarecer qualquer detalhe técnico ou condição comercial.`
    );
  };

  const handlePickClient = (clientId: string) => {
    const cli = clients.find((c) => c.id === clientId);
    if (!cli) return;
    const phone = cli.contactPhone || '';
    const key = normalizePhoneDigits(phone);
    setDraftContactName(cli.name);
    setDraftIsGroup(false);
    setDraftContactType('cliente');
    if (phone) {
      setDraftTarget(phone);
      setActiveThreadKey(key);
    }
  };

  const handlePickGroupFromSelect = (groupJid: string) => {
    const grp = discoveredGroups.find((g) => g.jid === groupJid);
    if (!grp) return;
    setActiveThreadKey(grp.jid);
    setDraftTarget(grp.jid);
    setDraftContactName(grp.subject);
    setDraftIsGroup(true);
    setDraftContactType('funcionario');
    setDraftCategory('orientacao_equipe');
  };

  const resolvePlaceholders = (rawText: string) => {
    const recipient = draftContactName || 'cliente';
    const propLabel = draftProposalCode || 'nossa proposta comercial';
    return rawText
      .replace(/\{nome\}/gi, recipient)
      .replace(/\{proposta\}/gi, propLabel)
      .replace(/\{empresa\}/gi, organizationName || 'Aguero Inox');
  };

  const handleApplyQuickReply = async (reply: WhatsAppQuickReply) => {
    setDraftCategory(reply.category);
    setDraftText(resolvePlaceholders(reply.text));
    setSubTab('mensagens');
    try {
      await incrementQuickReplyUsage(reply.id);
      const qr = await fetchWhatsAppQuickReplies();
      if (qr?.success && Array.isArray(qr.quickReplies)) {
        setQuickReplies(qr.quickReplies);
      }
    } catch {
      // ignore non-critical counter update
    }
  };

  const activeChannelContact = useMemo(() => {
    if (!draftTarget.trim()) return undefined;
    const raw = draftTarget.trim();
    const digits = normalizePhoneDigits(raw);
    return contacts.find(
      (c) => c.jidOrPhone === raw || (!c.isGroup && digits && c.normalizedPhone === digits)
    );
  }, [contacts, draftTarget]);

  const isCurrentTargetOcrActive = Boolean(activeChannelContact?.ocrEnabled);
  const isCurrentTargetOcrAutoReply = activeChannelContact?.ocrAutoReply === true;

  const handleToggleCurrentTargetOcr = async () => {
    if (!draftTarget.trim()) return;
    const targetIsGrp = draftIsGroup || draftTarget.trim().endsWith('@g.us');
    const res = await toggleWhatsAppContactOcr({
      id: activeChannelContact?.id,
      jidOrPhone: draftTarget.trim(),
      name: draftContactName.trim() || draftTarget.trim(),
      isGroup: targetIsGrp,
      ocrEnabled: !isCurrentTargetOcrActive,
      ocrAutoReply: !isCurrentTargetOcrActive ? false : isCurrentTargetOcrAutoReply,
    });
    if (res.success) {
      await loadAll(false);
      showToast(
        'success',
        res.message ||
          (!isCurrentTargetOcrActive
            ? 'Leitura OCR ativada para este canal (modo silencioso).'
            : 'Leitura OCR desativada para este canal.')
      );
    } else {
      showToast('error', res.error || 'Falha ao atualizar OCR do canal.');
    }
  };

  const handleToggleCurrentTargetOcrAutoReply = async () => {
    if (!draftTarget.trim() || !isCurrentTargetOcrActive) return;
    const targetIsGrp = draftIsGroup || draftTarget.trim().endsWith('@g.us');
    const nextReply = !isCurrentTargetOcrAutoReply;
    const res = await toggleWhatsAppContactOcr({
      id: activeChannelContact?.id,
      jidOrPhone: draftTarget.trim(),
      name: draftContactName.trim() || draftTarget.trim(),
      isGroup: targetIsGrp,
      ocrEnabled: true,
      ocrAutoReply: nextReply,
    });
    if (res.success) {
      await loadAll(false);
      showToast(
        'success',
        nextReply
          ? 'Confirmação de leitura OCR no chat ativada.'
          : 'Modo silencioso ativado (OCR não envia mensagem no chat/grupo).'
      );
    } else {
      showToast('error', res.error || 'Falha ao atualizar resposta OCR.');
    }
  };

  const handleOpenContactChat = (contact: WhatsAppManagedContact) => {
    const key = contact.isGroup ? contact.jidOrPhone : contact.normalizedPhone || contact.jidOrPhone;
    setActiveThreadKey(key);
    setDraftTarget(contact.jidOrPhone);
    setDraftContactName(contact.name);
    setDraftIsGroup(contact.isGroup);
    setDraftContactType(contact.contactType || (contact.isGroup ? 'funcionario' : 'cliente'));
    if (contact.isGroup) setDraftCategory('orientacao_equipe');
    setSubTab('mensagens');
  };

  const handleCreateAiRuleFromContact = (contact: WhatsAppManagedContact) => {
    setPreselectedAiCommand(
      `Sempre que ${contact.name} (${contact.jidOrPhone}) me mandar mensagem, responda por mim e só pare de responder em decisões críticas.`
    );
    setSubTab('assistente_ia');
  };

  const pendingCriticalAlertsCount = useMemo(
    () => assistantChat.filter((m) => m.role === 'alert' && !m.alertResolved).length,
    [assistantChat]
  );

  // Linked Devices Bridge Handlers
  const handleStartBridgeQr = async (forceFreshQr = false) => {
    setIsBridgeBusy(true);
    try {
      const res = await connectWhatsAppBridge({ forceFreshQr });
      if (res.bridge) setBridgeStatus(res.bridge);
      if (res.success) {
        showToast('success', res.message || 'Gerando QR Code de conexão...');
      } else {
        showToast('error', res.error || 'Erro ao iniciar conexão WhatsApp Web.');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao conectar ponte WhatsApp Web.');
    } finally {
      setIsBridgeBusy(false);
    }
  };

  const handleStartBridgePairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhoneInput.trim()) {
      showToast('error', 'Informe o número do WhatsApp com DDI e DDD (ex: 5511999999999).');
      return;
    }
    setIsBridgeBusy(true);
    try {
      const res = await connectWhatsAppBridge({
        phoneNumberForPairing: pairingPhoneInput.trim(),
        forceFreshQr: true,
      });
      if (res.bridge) setBridgeStatus(res.bridge);
      if (res.success) {
        showToast('success', 'Solicitando código de pareamento de 8 dígitos...');
      } else {
        showToast('error', res.error || 'Erro ao solicitar código de pareamento.');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao gerar código de pareamento.');
    } finally {
      setIsBridgeBusy(false);
    }
  };

  const handleDisconnectBridge = async (logout: boolean) => {
    setIsBridgeBusy(true);
    try {
      const res = await disconnectWhatsAppBridge(logout);
      if (res.bridge) setBridgeStatus(res.bridge);
      showToast('success', res.message || 'Dispositivo desconectado.');
      await loadAll(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao desconectar dispositivo.');
    } finally {
      setIsBridgeBusy(false);
    }
  };

  const handleRefreshGroups = async () => {
    setIsRefreshingGroups(true);
    try {
      const res = await fetchWhatsAppBridgeGroups();
      if (res.success) {
        setBridgeStatus((prev) => (prev ? { ...prev, groups: res.groups } : prev));
        showToast('success', `${res.groups.length} grupo(s) sincronizado(s) do seu WhatsApp.`);
      } else {
        showToast('error', res.error || 'Não foi possível listar os grupos.');
      }
    } finally {
      setIsRefreshingGroups(false);
    }
  };

  const handlePinReceiptGroup = async (group: WhatsAppGroupSummary) => {
    try {
      const existing = contacts.find((c) => c.jidOrPhone === group.jid);
      const currentlyActive = Boolean(existing?.ocrEnabled || pinnedGroupJid === group.jid);
      if (currentlyActive) {
        const res = await toggleWhatsAppContactOcr({
          id: existing?.id,
          jidOrPhone: group.jid,
          name: group.subject,
          isGroup: true,
          ocrEnabled: false,
        });
        if (res.success) {
          if (pinnedGroupJid === group.jid) {
            setPinnedGroupJid('');
            setPinnedGroupName('');
          }
          await loadAll(false);
          showToast('success', res.message || `OCR desativado para "${group.subject}".`);
        } else {
          showToast('error', res.error || 'Erro ao desativar OCR do grupo.');
        }
      } else {
        const res = await selectWhatsAppBridgeGroup({
          groupJid: group.jid,
          groupName: group.subject,
          ocrAutoReply: false,
        });
        if (res.success) {
          setPinnedGroupJid(group.jid);
          setPinnedGroupName(group.subject);
          await loadAll(false);
          showToast('success', res.message || `OCR ativado para "${group.subject}" (modo silencioso).`);
        } else {
          showToast('error', res.error || 'Erro ao ativar OCR do grupo.');
        }
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao atualizar permissão OCR do grupo.');
    }
  };

  const handleToggleGroupOcrAutoReply = async (group: WhatsAppGroupSummary) => {
    try {
      const existing = contacts.find((c) => c.jidOrPhone === group.jid);
      const nextReply = !(existing?.ocrAutoReply === true);
      const res = await toggleWhatsAppContactOcr({
        id: existing?.id,
        jidOrPhone: group.jid,
        name: group.subject,
        isGroup: true,
        ocrEnabled: true,
        ocrAutoReply: nextReply,
      });
      if (res.success) {
        await loadAll(false);
        showToast(
          'success',
          nextReply
            ? `Resposta OCR no grupo "${group.subject}" ativada.`
            : `Modo silencioso ativado para "${group.subject}" (não envia mensagem no grupo).`
        );
      } else {
        showToast('error', res.error || 'Erro ao alterar resposta OCR no grupo.');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao alterar resposta OCR no grupo.');
    }
  };

  // Composio Handlers
  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectedAccountId.trim()) {
      showToast('error', 'Informe o Connected Account ID do Composio (ex: ca_...).');
      return;
    }
    setIsSavingConn(true);
    try {
      const res = await connectComposioWhatsAppAccount({
        connectedAccountId: connectedAccountId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        entityId: entityId.trim(),
        authConfigId: authConfigId.trim(),
        connectedPhoneNumber: connectedPhoneNumber.trim(),
        messagingMode: '1_to_1_private',
        autoReplyConfirmation,
        composioRealtimeEnabled: realtimeEnabled,
      });

      if (res.success) {
        showToast('success', res.warning || res.message || 'Conta Composio vinculada com sucesso.');
        await loadAll(false);
      } else {
        showToast('error', res.error || 'Erro ao vincular Connected Account ID.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Falha ao comunicar com o servidor.');
    } finally {
      setIsSavingConn(false);
    }
  };

  const handleDiscoverAccounts = async () => {
    setIsListingAccounts(true);
    try {
      const res = await listComposioWhatsAppAccounts(entityId.trim() || undefined);
      setDiscoveredAccounts(res.accounts || []);
      if (res.accounts.length > 0) {
        showToast('success', `${res.accounts.length} conta(s) WhatsApp encontrada(s) no Composio.`);
      } else if (!res.apiKeyConfigured) {
        showToast('error', 'COMPOSIO_API_KEY ainda não foi configurada nos Secrets do servidor.');
      } else {
        showToast('error', res.error || 'Nenhuma conta WhatsApp ativa encontrada para este filtro.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao consultar contas no Composio.');
    } finally {
      setIsListingAccounts(false);
    }
  };

  const handleGenerateOAuthLink = async () => {
    setIsGeneratingLink(true);
    setOauthRedirectUrl(null);
    try {
      const res = await createComposioWhatsAppAuthLink({
        userId: entityId.trim() || 'aguero_inox_comercial',
        authConfigId: authConfigId.trim() || undefined,
        callbackUrl: window.location.href,
      });
      if (res.success && res.redirectUrl) {
        setOauthRedirectUrl(res.redirectUrl);
        if (res.authConfigIdUsed && !authConfigId) {
          setAuthConfigId(res.authConfigIdUsed);
        }
        showToast('success', 'Link de autorização Composio gerado.');
      } else {
        showToast('error', res.error || 'Não foi possível gerar o link OAuth no Composio.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao gerar link Composio.');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleReconnectRealtime = async () => {
    setIsReconnectingRealtime(true);
    try {
      const res = await reconnectComposioRealtime();
      await loadAll(false);
      if (res.success) {
        showToast('success', 'Escuta em tempo real Composio conectada.');
      } else {
        showToast('error', res.error || 'Não foi possível ativar escuta em tempo real.');
      }
    } finally {
      setIsReconnectingRealtime(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTarget.trim() || !draftText.trim()) {
      showToast('error', 'Informe o telefone/grupo de destino e o texto da mensagem.');
      return;
    }

    const targetIsGroup = draftIsGroup || draftTarget.trim().endsWith('@g.us');
    const effectiveEngine: 'bridge' | 'composio' =
      targetIsGroup
        ? 'bridge'
        : sendVia === 'bridge'
        ? 'bridge'
        : sendVia === 'composio'
        ? 'composio'
        : isBridgeConnected
        ? 'bridge'
        : 'composio';

    setIsSending(true);
    try {
      if (effectiveEngine === 'bridge') {
        const res = await sendWhatsAppMessageViaBridge({
          organizationId,
          toJidOrPhone: draftTarget.trim(),
          contactName: draftContactName.trim() || draftTarget.trim(),
          groupName: targetIsGroup ? draftContactName.trim() : undefined,
          contactType: targetIsGroup ? 'funcionario' : draftContactType,
          category: draftCategory,
          text: draftText.trim(),
          linkedProposalId: draftProposalId || undefined,
          linkedProposalCode: draftProposalCode || undefined,
          sentByUserName: userName,
        });

        if (res.success) {
          const nextKey = targetIsGroup
            ? res.chatJid || draftTarget.trim()
            : normalizePhoneDigits(draftTarget);
          setActiveThreadKey(nextKey);
          setDraftText('');
          showToast('success', res.message || 'Mensagem enviada pelo seu WhatsApp conectado.');
          await loadAll(false);
        } else {
          showToast('error', res.error || 'Falha ao enviar pela ponte Dispositivos Conectados.');
          await loadAll(false);
        }
      } else {
        const res = await sendWhatsAppMessageViaComposio({
          organizationId,
          toNumber: draftTarget.trim(),
          contactName: draftContactName.trim() || draftTarget.trim(),
          contactType: draftContactType,
          category: draftCategory,
          text: draftText.trim(),
          linkedProposalId: draftProposalId || undefined,
          linkedProposalCode: draftProposalCode || undefined,
          sentByUserName: userName,
          connectedAccountId: connectedAccountId.trim() || undefined,
          phoneNumberId: phoneNumberId.trim() || undefined,
        });

        if (res.success) {
          const key = normalizePhoneDigits(draftTarget);
          setActiveThreadKey(key);
          setDraftText('');
          showToast('success', 'Mensagem enviada via Composio WhatsApp Business.');
          await loadAll(false);
        } else {
          showToast('error', res.error || 'Falha no envio via Composio.');
          await loadAll(false);
        }
      }
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao enviar mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendEmployeeGuide = async (phoneOrJid: string, name?: string) => {
    if (!phoneOrJid.trim()) {
      showToast('error', 'Informe o número ou selecione um grupo.');
      return;
    }
    setIsSending(true);
    try {
      const isGrp = phoneOrJid.trim().endsWith('@g.us');
      if (isBridgeConnected || isGrp) {
        const res = await sendWhatsAppMessageViaBridge({
          organizationId,
          toJidOrPhone: phoneOrJid.trim(),
          contactName: name?.trim() || phoneOrJid.trim(),
          groupName: isGrp ? name?.trim() : undefined,
          contactType: 'funcionario',
          category: 'orientacao_equipe',
          text: isGrp ? groupGuideText : employeeGuideText,
          sentByUserName: userName,
        });
        if (res.success) {
          showToast('success', `Orientação enviada via seu WhatsApp para ${name || phoneOrJid}.`);
          await loadAll(false);
        } else {
          showToast('error', res.error || 'Erro ao enviar orientação.');
        }
      } else {
        const res = await sendWhatsAppMessageViaComposio({
          organizationId,
          toNumber: phoneOrJid.trim(),
          contactName: name?.trim() || phoneOrJid.trim(),
          contactType: 'funcionario',
          category: 'orientacao_equipe',
          text: employeeGuideText,
          sentByUserName: userName,
        });
        if (res.success) {
          showToast('success', `Orientação 1-a-1 enviada para ${name || phoneOrJid}.`);
          await loadAll(false);
        } else {
          showToast('error', res.error || 'Erro ao enviar orientação.');
        }
      }
    } finally {
      setIsSending(false);
    }
  };

  const copyText = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const groupGuideText = `Equipe, canal oficial ${organizationName} ativo neste grupo!\n\n1. Para lançar combustível, almoço, pedágio ou material emergencial de obra, envie a foto nítida do cupom fiscal aqui neste grupo;\n2. Escreva na legenda o número da OS (ex: OS-2025-042);\n3. O sistema AgueroFlow fará a leitura automática via IA e responderá aqui confirmando o registro.`;

  const employeeGuideText = `Olá! Novo procedimento de reembolsos e campo da ${organizationName}:\n\n1. Envie a foto do cupom fiscal no grupo oficial${pinnedGroupName ? ` (${pinnedGroupName})` : ''} ou diretamente para este número (${bridgeStatus?.connectedNumber || connectedPhoneNumber});\n2. Escreva na legenda o número da OS (ex: OS-2025-042);\n3. Você receberá a confirmação automática com estabelecimento, valor e categoria em segundos.`;

  const activeChannelSummary = isBridgeConnected
    ? `Dispositivos Conectados · ${bridgeStatus?.connectedNumber || 'Online'}`
    : isComposioConnected
    ? `Composio API Oficial · ${connectedAccountId}`
    : 'Nenhuma ponte WhatsApp pareada';

  return (
    <div className="space-y-6">
      {/* Top Header Strip — Two Clean Stacked Rows (Zero Text Clipping) */}
      <div className="bg-white dark:bg-[#0B132B] border border-black/[0.08] dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6E6E73] dark:text-slate-400">
              <span className="font-semibold text-[#0071E3] dark:text-cyan-400">
                Comunicação Comercial &amp; Grupos
              </span>
              <span aria-hidden="true">·</span>
              <span>Dispositivos Conectados + Composio</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1D1D1F] dark:text-white tracking-tight leading-snug">
              Central WhatsApp (Grupos de Obra &amp; Atendimento 1-para-1)
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-slate-400 leading-relaxed max-w-3xl">
              Conecte seu próprio WhatsApp via QR Code (Dispositivos Conectados) para ler e responder diretamente em grupos e clientes, ou opere via Composio API Oficial.
            </p>
          </div>

          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold tabular-nums shrink-0 self-start ${
              isBridgeConnected
                ? 'bg-[#E8F8EE] dark:bg-emerald-950/50 border-[#166534]/20 dark:border-emerald-700/60 text-[#166534] dark:text-emerald-300'
                : 'bg-[#F5F5F7] dark:bg-slate-900 border-black/[0.08] dark:border-slate-700 text-[#424245] dark:text-slate-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isBridgeConnected ? 'bg-[#1E7E34] dark:bg-emerald-400' : 'bg-[#86868B] dark:bg-slate-500'
              }`}
            />
            <span className="whitespace-nowrap">{activeChannelSummary}</span>
          </div>
        </div>

        {/* Dedicated Full-Width Horizontal Segmented Tab Bar */}
        <div className="flex items-center gap-1 p-1 bg-[#F2F2F7] dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-xl overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setSubTab('mensagens')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'mensagens'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Chats &amp; Grupos</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('contatos')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'contatos'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Contatos</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('respostas_rapidas')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'respostas_rapidas'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Respostas Rápidas</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('assistente_ia')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'assistente_ia'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span>Assistente IA</span>
            {pendingCriticalAlertsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-[#FFF4E5] text-[#9A4400] dark:bg-amber-500 dark:text-slate-950 rounded tabular-nums">
                {pendingCriticalAlertsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('dashboard_ocr')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'dashboard_ocr'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>Dashboard OCR</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('conexao')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'conexao'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>Conectar WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('educar_equipe')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              subTab === 'educar_equipe'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <Hash className="w-3.5 h-3.5 shrink-0" />
            <span>Orientar Equipe</span>
          </button>
        </div>
      </div>

      {/* Transient Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 px-2"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Setup Banner when neither Bridge nor Composio is active */}
      {!isBridgeConnected && !isComposioConnected && subTab === 'mensagens' && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="font-semibold text-amber-300">
              Conecte seu WhatsApp para ler e responder grupos e clientes em tempo real
            </p>
            <p className="text-slate-400">
              Escaneie o QR Code na aba <strong className="text-slate-200">Conectar WhatsApp</strong> (Dispositivos Conectados — funciona com grupos e sem webhook externo) ou informe seu ID do Composio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setConnectionChannel('dispositivos_conectados');
              setSubTab('conexao');
            }}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Conectar por QR Code</span>
          </button>
        </div>
      )}

      {/* TAB 1: MENSAGENS COMERCIAIS, GRUPOS & ATENDIMENTO */}
      {subTab === 'mensagens' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Threads & Filters */}
          <div className="lg:col-span-4 bg-[#0B132B] border border-slate-700/80 rounded-xl flex flex-col overflow-hidden min-h-[580px]">
            <div className="p-4 border-b border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Conversas & Grupos</h3>
                <button
                  type="button"
                  onClick={handleStartNewConversation}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Envio</span>
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar grupo, contato ou mensagem..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Segmented Filter */}
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg">
                {(
                  [
                    { id: 'todos', label: 'Todos' },
                    { id: 'grupos', label: 'Grupos' },
                    { id: 'cliente', label: 'Clientes' },
                    { id: 'funcionario', label: 'Equipe' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setContactFilter(f.id)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${
                      contactFilter === f.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Pick from Groups / Proposals / Clients */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/50 space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 block">
                Atalhos Rápidos (Grupos, Propostas ou Clientes)
              </label>
              <div className="grid grid-cols-1 gap-2">
                {discoveredGroups.length > 0 && (
                  <select
                    value={draftIsGroup ? draftTarget : ''}
                    onChange={(e) => {
                      if (e.target.value) handlePickGroupFromSelect(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Abrir grupo conectado ({discoveredGroups.length})...</option>
                    {discoveredGroups.map((g) => (
                      <option key={g.jid} value={g.jid}>
                        [Grupo] {g.subject} ({g.participantsCount} membros)
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={draftProposalId}
                  onChange={(e) => handlePickProposal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Carregar proposta do OrçaÁgil...</option>
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.clientName} ({formatCurrencyBRL(p.proposedTotal || 0)})
                    </option>
                  ))}
                </select>

                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handlePickClient(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Selecionar cliente cadastrado...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.contactPhone ? `· ${c.contactPhone}` : '(Sem telefone)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Thread List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400">Carregando conversas...</div>
              ) : threads.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-medium text-slate-300">Nenhuma conversa registrada</p>
                  <p className="text-xs text-slate-500">
                    Conecte seu WhatsApp por QR Code ou selecione uma proposta/grupo acima para começar.
                  </p>
                </div>
              ) : (
                threads.map((thread) => {
                  const isSelected = activeThreadKey === thread.threadKey;
                  return (
                    <button
                      key={thread.threadKey}
                      type="button"
                      onClick={() => handleSelectThread(thread)}
                      className={`w-full text-left p-3.5 transition space-y-1 ${
                        isSelected ? 'bg-slate-800/90' : 'hover:bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                          {thread.isGroup && <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          <span className="truncate">{thread.contactName}</span>
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {new Date(thread.lastMessageAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                        <span className="font-mono tabular-nums truncate">{thread.contactPhone}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {thread.isGroup
                            ? 'Grupo'
                            : thread.contactType === 'funcionario'
                            ? 'Equipe'
                            : 'Cliente'}
                        </span>
                        {thread.linkedProposalCode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-cyan-400 font-medium">{thread.linkedProposalCode}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 truncate">
                        {thread.lastDirection === 'outbound' && !thread.isGroup ? 'Você: ' : ''}
                        {thread.lastMessageText}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Active Thread History & Composer */}
          <div className="lg:col-span-8 bg-[#0B132B] border border-slate-700/80 rounded-xl flex flex-col overflow-hidden min-h-[580px]">
            {/* Thread Header */}
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                  {draftIsGroup && <Users className="w-4 h-4 text-emerald-400 shrink-0" />}
                  <span className="break-words leading-snug">
                    {draftContactName || draftTarget || 'Novo Disparo (Grupo ou Privado)'}
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                  <span className="font-mono tabular-nums break-all">
                    {draftTarget || 'Selecione um grupo ou informe o telefone'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">
                    {draftIsGroup ? 'Chat em Grupo (@g.us)' : categoryLabels[draftCategory]}
                  </span>
                  {draftProposalCode && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-cyan-400 whitespace-nowrap">Proposta {draftProposalCode}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {draftTarget.trim() && (
                  <button
                    type="button"
                    onClick={handleToggleCurrentTargetOcr}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap flex items-center gap-1.5 ${
                      isCurrentTargetOcrActive
                        ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                    title="Controla se este grupo/contato pode disparar leitura e resposta de cupom OCR"
                  >
                    {isCurrentTargetOcrActive ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>OCR Ativo neste canal</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ativar OCR aqui</span>
                      </>
                    )}
                  </button>
                )}

                {draftTarget.trim() && isCurrentTargetOcrActive && (
                  <button
                    type="button"
                    onClick={handleToggleCurrentTargetOcrAutoReply}
                    title={
                      isCurrentTargetOcrAutoReply
                        ? 'Clique para parar de enviar a mensagem de confirmação OCR neste canal'
                        : 'Clique para ativar o envio opcional da confirmação OCR neste canal'
                    }
                    className={`px-3 py-1.5 border rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
                      isCurrentTargetOcrAutoReply
                        ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/80'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{isCurrentTargetOcrAutoReply ? 'Msg OCR no Chat: ON' : 'OCR Silencioso (Só Painel)'}</span>
                  </button>
                )}

                {!draftIsGroup && isBridgeConnected && isComposioConnected && (
                  <select
                    value={sendVia}
                    onChange={(e) => setSendVia(e.target.value as 'auto' | 'bridge' | 'composio')}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    title="Canal de envio"
                  >
                    <option value="auto">Via: Dispositivos Conectados</option>
                    <option value="bridge">Via: Meu WhatsApp (QR)</option>
                    <option value="composio">Via: Composio API Oficial</option>
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => loadAll(false)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {/* Conversation History */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950/40 max-h-[340px]">
              {activeThreadMessages.length === 0 ? (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center space-y-2 text-slate-400">
                  <Building2 className="w-8 h-8 text-slate-600" />
                  <p className="text-xs font-medium text-slate-300">
                    {draftIsGroup
                      ? 'Mensagens em tempo real deste grupo aparecerão aqui'
                      : 'Canal unificado para Grupos de Obra e Atendimento 1-para-1'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-md">
                    {isBridgeConnected
                      ? 'Seu WhatsApp está pareado. Qualquer mensagem ou foto enviada neste grupo ou chat privado é sincronizada automaticamente.'
                      : 'Pareie seu número por QR Code na aba Conectar WhatsApp para ler e responder grupos diretamente pelo AgueroFlow.'}
                  </p>
                </div>
              ) : (
                activeThreadMessages.map((msg) => {
                  const isOutbound = msg.direction === 'outbound';
                  const authorLabel = isOutbound
                    ? msg.sentByUserName || userName
                    : msg.isGroup && msg.participantName
                    ? `${msg.participantName}${msg.participantPhone ? ` (${msg.participantPhone})` : ''}`
                    : msg.contactName;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs space-y-1.5 border ${
                          isOutbound
                            ? msg.status === 'erro'
                              ? 'bg-rose-950/40 border-rose-500/40 text-rose-100'
                              : 'bg-cyan-950/60 border-cyan-500/30 text-slate-100'
                            : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
                          <span className="font-medium text-slate-300">{authorLabel}</span>
                          <span className="tabular-nums">
                            {new Date(msg.createdAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                          <span>{categoryLabels[msg.category] || msg.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {msg.status === 'erro'
                              ? `Falha: ${msg.errorMessage || 'erro no envio'}`
                              : msg.sourceBridge === 'baileys_web'
                              ? isOutbound
                                ? 'Enviado via Dispositivos Conectados'
                                : 'Recebido via WhatsApp Web'
                              : msg.status === 'enviado'
                              ? 'Enviado via Composio'
                              : 'Recebido'}
                          </span>
                          {msg.linkedProposalCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-cyan-400">{msg.linkedProposalCode}</span>
                            </>
                          )}
                          {msg.linkedReceiptId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-400">Cupom OCR #{msg.linkedReceiptId}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer Form */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 space-y-3 bg-[#0B132B]">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Destino (Telefone ou JID Grupo) *
                  </label>
                  <input
                    type="text"
                    value={draftTarget}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftTarget(val);
                      setDraftIsGroup(val.trim().endsWith('@g.us'));
                    }}
                    placeholder="+55 19 99999-9999 ou ...@g.us"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Nome do Contato / Grupo
                  </label>
                  <input
                    type="text"
                    value={draftContactName}
                    onChange={(e) => setDraftContactName(e.target.value)}
                    placeholder="Ex: Equipe Obra Jaguariúna"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Perfil
                  </label>
                  <select
                    value={draftContactType}
                    onChange={(e) => setDraftContactType(e.target.value as WhatsAppContactType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="cliente">Cliente / Lead</option>
                    <option value="funcionario">Funcionário / Grupo Obra</option>
                    <option value="fornecedor">Fornecedor</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Finalidade
                  </label>
                  <select
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value as WhatsAppMessageCategory)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="comercial_proposta">Proposta Comercial</option>
                    <option value="cobranca_followup">Follow-up Orçamento</option>
                    <option value="orientacao_equipe">Orientação / Grupo</option>
                    <option value="reembolso_ocr">Reembolso OCR</option>
                    <option value="atendimento">Atendimento Geral</option>
                  </select>
                </div>
              </div>

              {/* Custom Quick Replies Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400 mr-1">Respostas rápidas:</span>
                {quickReplies.slice(0, 6).map((qr) => (
                  <button
                    key={qr.id}
                    type="button"
                    onClick={() => handleApplyQuickReply(qr)}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-[11px] text-slate-200 transition whitespace-nowrap inline-flex items-center gap-1.5"
                    title={qr.text}
                  >
                    <span className="font-mono text-cyan-400">{qr.shortcut}</span>
                    <span>{qr.title}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSubTab('respostas_rapidas')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-md text-[11px] text-cyan-300 transition whitespace-nowrap"
                >
                  + Gerenciar Respostas
                </button>
              </div>

              {/* Textarea & Send */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                <textarea
                  rows={3}
                  value={draftText}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = quickReplies.find((qr) => val.trim() === qr.shortcut);
                    if (matched) {
                      handleApplyQuickReply(matched);
                    } else {
                      setDraftText(val);
                    }
                  }}
                  placeholder={
                    draftIsGroup
                      ? `Escreva para "${draftContactName || draftTarget}", use /atalho, ou digite um pedido para ${mentionConfig?.keyword || '@aguero'}...`
                      : `Escreva sua mensagem, digite /atalho ou peça ajuda para ${mentionConfig?.keyword || '@aguero'}...`
                  }
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="flex sm:flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isAskingMentionAi || !draftTarget.trim()}
                    onClick={async () => {
                      if (!draftTarget.trim()) return;
                      const kw = (mentionConfig?.keyword || '@aguero').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const cleanPrompt = draftText
                        .replace(new RegExp(`^\\s*${kw}(?:-privado)?[:\\s,-]*`, 'i'), '')
                        .trim();
                      setIsAskingMentionAi(true);
                      try {
                        const res = await invokeWhatsAppMentionAi({
                          targetJidOrPhone: draftTarget.trim(),
                          contactName: draftContactName.trim() || draftTarget.trim(),
                          isGroup: draftIsGroup || draftTarget.trim().endsWith('@g.us'),
                          promptText:
                            cleanPrompt ||
                            'Analise as últimas mensagens desta conversa e redija uma resposta objetiva e profissional para eu enviar.',
                          dispatchToWhatsApp: false,
                        });
                        if (res.success && res.replyText) {
                          setDraftText(res.replyText);
                          await loadAll(false);
                          showToast('success', 'Rascunho gerado com @aguero IA! Revise e clique em Enviar.');
                        } else {
                          showToast('error', res.error || 'Não foi possível gerar resposta com a IA.');
                        }
                      } finally {
                        setIsAskingMentionAi(false);
                      }
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 font-semibold text-xs rounded-lg transition flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                    title="Lê esta conversa ativa com Gemini IA e gera o texto ou resposta aqui na caixa de mensagem"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isAskingMentionAi ? 'Pensando...' : `Pedir ao ${mentionConfig?.keyword || '@aguero'}`}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {isSending
                        ? 'Enviando...'
                        : draftIsGroup || isBridgeConnected
                        ? 'Enviar no WhatsApp'
                        : 'Enviar via Composio'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: CONEXÃO (DISPOSITIVOS CONECTADOS QR + COMPOSIO API OFICIAL) */}
      {subTab === 'conexao' && (
        <div className="space-y-6">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Este é o <strong>seu</strong> WhatsApp: cada pessoa conecta o próprio número lendo o QR Code abaixo.
          </p>
          <WhatsAppSessionsPanel />
          {/* Channel Switcher */}
          <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-2 inline-flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setConnectionChannel('dispositivos_conectados')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                connectionChannel === 'dispositivos_conectados'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Dispositivos Conectados (Seu Número & Grupos)</span>
            </button>
            <button
              type="button"
              onClick={() => setConnectionChannel('composio')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                connectionChannel === 'composio'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Composio API Oficial (1-a-1 Meta)</span>
            </button>
          </div>

          {/* PANEL A: EMBEDDED LINKED DEVICES BRIDGE (BAILEYS) */}
          {connectionChannel === 'dispositivos_conectados' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: QR Code / Pairing Code Card */}
              <div className="lg:col-span-6 bg-[#0B132B] border border-slate-700/80 rounded-xl p-6 space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Ponte Dispositivos Conectados (WhatsApp Web)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Conecta diretamente ao seu WhatsApp pessoal ou comercial por conexão criptografada de saída — funciona em <strong className="text-slate-200">grupos</strong> e <strong className="text-slate-200">privado</strong> sem precisar de servidor externo nem liberar firewall.
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                      isBridgeConnected ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {bridgeStatus?.state === 'conectado'
                      ? 'Conectado'
                      : bridgeStatus?.state === 'reconectando'
                      ? `Reconectando${bridgeStatus?.reconnectAttempts ? ` (#${bridgeStatus.reconnectAttempts})` : '...'}`
                      : bridgeStatus?.state === 'aguardando_qr'
                      ? 'Aguardando QR'
                      : bridgeStatus?.state === 'aguardando_pareamento'
                      ? 'Aguardando Código'
                      : bridgeStatus?.state === 'iniciando'
                      ? 'Iniciando...'
                      : 'Desconectado'}
                  </span>
                </div>

                {/* Connected State */}
                {isBridgeConnected ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Aparelho Pareado e Ativo (Keep-Alive Automático)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 pt-1">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Número Conectado</span>
                          <strong className="font-mono tabular-nums text-white">
                            {bridgeStatus?.connectedNumber}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Nome no Perfil</span>
                          <strong className="text-white">{bridgeStatus?.connectedName}</strong>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-200/90 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Varredura Pós-Queda (Catch-Up): <strong className="text-emerald-300">Ativa</strong> — recupera fotos OCR e chamados @aguero recebidos enquanto offline.
                        </span>
                        {bridgeStatus?.lastCatchUpRecovered ? (
                          <span className="font-mono text-cyan-300">
                            {bridgeStatus.lastCatchUpRecovered} item(ns) recuperado(s) na última reconexão
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRefreshGroups}
                        disabled={isRefreshingGroups}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingGroups ? 'animate-spin' : ''}`} />
                        <span>Sincronizar Grupos do WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDisconnectBridge(true)}
                        disabled={isBridgeBusy}
                        className="px-4 py-2 bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Desconectar Aparelho</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Auto-Reconnecting State */}
                    {bridgeStatus?.state === 'reconectando' ? (
                      <div className="p-5 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-3 text-xs">
                        <div className="flex items-center gap-2 text-amber-300 font-semibold">
                          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                          <span>
                            Reconectando sessão salva automaticamente
                            {bridgeStatus.reconnectAttempts ? ` (tentativa ${bridgeStatus.reconnectAttempts})` : '...'}
                          </span>
                        </div>
                        <p className="text-slate-300">
                          Sua sessão pareada está preservada e o servidor está restabelecendo o túnel criptografado sem precisar escanear o QR Code novamente.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleStartBridgeQr(false)}
                            disabled={isBridgeBusy}
                            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Forçar Reconexão Agora</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartBridgeQr(true)}
                            disabled={isBridgeBusy}
                            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md inline-flex items-center gap-1.5"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Limpar e Gerar Novo QR</span>
                          </button>
                        </div>
                      </div>
                    ) : bridgeStatus?.qrDataUrl ? (
                      <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
                        <div className="bg-white p-3 rounded-lg shrink-0">
                          <img
                            src={bridgeStatus.qrDataUrl}
                            alt="QR Code WhatsApp Dispositivos Conectados"
                            className="w-48 h-48 block"
                          />
                        </div>
                        <div className="space-y-2 text-xs text-slate-300">
                          <p className="font-semibold text-white">Escaneie no seu celular:</p>
                          <ol className="list-decimal list-inside space-y-1 text-slate-400">
                            <li>Abra o WhatsApp no seu celular;</li>
                            <li>Toque em <strong className="text-slate-200">Dispositivos Conectados</strong>;</li>
                            <li>Toque em <strong className="text-slate-200">Conectar aparelho</strong> e aponte a câmera.</li>
                          </ol>
                          <button
                            type="button"
                            onClick={() => handleStartBridgeQr(true)}
                            disabled={isBridgeBusy}
                            className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md inline-flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Gerar Novo QR Code</span>
                          </button>
                        </div>
                      </div>
                    ) : bridgeStatus?.pairingCode ? (
                      <div className="p-5 bg-slate-900 border border-cyan-500/40 rounded-xl space-y-2 text-center">
                        <p className="text-xs text-slate-400">
                          No seu celular, vá em <strong className="text-slate-200">Dispositivos Conectados → Conectar aparelho → Conectar com número de telefone</strong> e digite:
                        </p>
                        <div className="text-2xl font-mono font-bold tracking-[0.25em] text-cyan-300 py-2">
                          {bridgeStatus.pairingCode}
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
                        <p className="text-xs text-slate-300">
                          {bridgeStatus?.hasSavedSession
                            ? 'Existe uma sessão salva deste aparelho. Você pode reconectar sem novo QR Code ou limpar para gerar um novo QR.'
                            : 'Clique abaixo para iniciar a sessão e gerar o QR Code oficial do protocolo Dispositivos Conectados.'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleStartBridgeQr(false)}
                            disabled={isBridgeBusy}
                            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition disabled:opacity-50"
                          >
                            <QrCode className="w-4 h-4" />
                            <span>
                              {isBridgeBusy
                                ? 'Iniciando...'
                                : bridgeStatus?.hasSavedSession
                                ? 'Reconectar Sessão Salva'
                                : 'Conectar Meu WhatsApp (Gerar QR Code)'}
                            </span>
                          </button>
                          {bridgeStatus?.hasSavedSession && (
                            <button
                              type="button"
                              onClick={() => handleStartBridgeQr(true)}
                              disabled={isBridgeBusy}
                              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition disabled:opacity-50"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Gerar Novo QR Code</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Optional 8-digit Pairing Code by Number */}
                    <form
                      onSubmit={handleStartBridgePairingCode}
                      className="pt-4 border-t border-slate-800 space-y-2"
                    >
                      <label className="text-xs font-medium text-slate-300 block">
                        Ou parear digitando seu número (código de 8 dígitos sem câmera)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={pairingPhoneInput}
                          onChange={(e) => setPairingPhoneInput(e.target.value)}
                          placeholder="Ex: 5511900000000 (DDI + DDD + Número)"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="submit"
                          disabled={isBridgeBusy || !pairingPhoneInput.trim()}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Gerar Código</span>
                        </button>
                      </div>
                    </form>

                    {bridgeStatus?.lastError && (
                      <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg p-3">
                        {bridgeStatus.lastError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Discovered Real Groups */}
              <div className="lg:col-span-6 bg-[#0B132B] border border-slate-700/80 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Grupos do Seu WhatsApp ({discoveredGroups.length})
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Escolha um grupo para conversar no Comercial ou fixar como leitor automático de cupons OCR em Viagens.
                    </p>
                  </div>
                  {isBridgeConnected && (
                    <button
                      type="button"
                      onClick={handleRefreshGroups}
                      disabled={isRefreshingGroups}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingGroups ? 'animate-spin' : ''}`} />
                      <span>Atualizar</span>
                    </button>
                  )}
                </div>

                {pinnedGroupJid && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1 text-xs">
                    <span className="text-slate-400 block text-[11px]">Grupo Fixado para Reembolsos OCR:</span>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-emerald-300 break-words">{pinnedGroupName || pinnedGroupJid}</strong>
                      <span className="font-mono text-[11px] text-slate-400 break-all">{pinnedGroupJid}</span>
                    </div>
                  </div>
                )}

                {!isBridgeConnected ? (
                  <div className="py-12 text-center space-y-2 text-xs text-slate-400">
                    <Users className="w-8 h-8 text-slate-600 mx-auto" />
                    <p>Escaneie o QR Code ao lado para carregar automaticamente todos os grupos em que seu número participa.</p>
                  </div>
                ) : discoveredGroups.length === 0 ? (
                  <div className="py-12 text-center space-y-3 text-xs text-slate-400">
                    <p>Nenhum grupo carregado ainda.</p>
                    <button
                      type="button"
                      onClick={handleRefreshGroups}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium"
                    >
                      Buscar Grupos Agora
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-900/40 max-h-[380px] overflow-y-auto custom-scrollbar">
                    {discoveredGroups.map((grp) => {
                      const matchedContact = contacts.find((c) => c.jidOrPhone === grp.jid);
                      const isPinned = Boolean(pinnedGroupJid === grp.jid || matchedContact?.ocrEnabled);
                      const repliesInGroup = matchedContact?.ocrAutoReply === true;
                      return (
                        <div
                          key={grp.jid}
                          className="p-3.5 flex flex-col gap-2.5"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-semibold text-white break-words leading-snug" title={grp.subject}>
                              {grp.subject}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                              <span className="tabular-nums whitespace-nowrap">{grp.participantsCount} participantes</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono break-all">{grp.jid}</span>
                              {isPinned && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-emerald-400 font-semibold whitespace-nowrap">
                                    {repliesInGroup ? 'OCR Ativo (Responde no grupo)' : 'OCR Ativo (Silencioso)'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenGroupChat(grp)}
                              className="px-3 py-1.5 bg-[#0071E3] hover:bg-[#0077ED] text-white apple-solid-btn text-xs font-semibold rounded-lg whitespace-nowrap transition cursor-pointer"
                            >
                              Abrir Chat
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePinReceiptGroup(grp)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition border cursor-pointer ${
                                isPinned
                                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                              }`}
                            >
                              {isPinned ? 'OCR Ativo (Desativar)' : 'Ativar OCR'}
                            </button>
                            {isPinned && (
                              <button
                                type="button"
                                onClick={() => handleToggleGroupOcrAutoReply(grp)}
                                title={
                                  repliesInGroup
                                    ? 'Desativar envio de mensagem de leitura OCR no grupo'
                                    : 'Ativar envio opcional da mensagem de leitura OCR no grupo'
                                }
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition border cursor-pointer ${
                                  repliesInGroup
                                    ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/80'
                                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {repliesInGroup ? 'Msg no Grupo: ON' : 'Msg no Grupo: OFF (Silencioso)'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PANEL B: COMPOSIO API OFICIAL */}
          {connectionChannel === 'composio' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSaveConnection}
                className="lg:col-span-7 bg-[#0B132B] border border-slate-700/80 rounded-xl p-6 space-y-5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Vincular Conta WhatsApp Business via Composio ID
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Cole o <strong className="text-slate-200">Connected Account ID</strong> do seu painel Composio. A autenticação de API permanece exclusivamente no servidor via <code className="font-mono text-cyan-400">COMPOSIO_API_KEY</code>.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0">
                    {isComposioConnected ? 'Conectado (Ativo)' : 'Configuração Pendente'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Composio Connected Account ID *
                    </label>
                    <input
                      type="text"
                      value={connectedAccountId}
                      onChange={(e) => setConnectedAccountId(e.target.value)}
                      placeholder="Ex: ca_a1b2c3d4e5f6"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Meta Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ex: 109823456789012"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Número WhatsApp da Empresa
                    </label>
                    <input
                      type="text"
                      value={connectedPhoneNumber}
                      onChange={(e) => setConnectedPhoneNumber(e.target.value)}
                      placeholder="+55 11 90000-0000"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Entity / User ID no Composio
                    </label>
                    <input
                      type="text"
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      placeholder="aguero_inox_comercial"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      WABA ID (Opcional)
                    </label>
                    <input
                      type="text"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="WhatsApp Business Account ID"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Auth Config ID (Opcional)
                    </label>
                    <input
                      type="text"
                      value={authConfigId}
                      onChange={(e) => setAuthConfigId(e.target.value)}
                      placeholder="Ex: ac_whatsapp_..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-2.5 border-t border-slate-800">
                  <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoReplyConfirmation}
                      onChange={(e) => setAutoReplyConfirmation(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Enviar resposta automática quando receber foto de cupom fiscal</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={realtimeEnabled}
                      onChange={(e) => setRealtimeEnabled(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Ativar escuta de Triggers em tempo real pelo SDK do Composio</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDiscoverAccounts}
                      disabled={isListingAccounts}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isListingAccounts ? 'animate-spin' : ''}`} />
                      <span>Buscar Contas no Composio</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateOAuthLink}
                      disabled={isGeneratingLink}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{isGeneratingLink ? 'Gerando...' : 'Gerar Link OAuth'}</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingConn}
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isSavingConn ? 'Validando...' : 'Validar e Conectar ID'}</span>
                  </button>
                </div>

                {oauthRedirectUrl && (
                  <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/30 rounded-lg space-y-2 text-xs">
                    <p className="font-semibold text-cyan-300">Link de Conexão Meta / WhatsApp gerado:</p>
                    <a
                      href={oauthRedirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Autorização no Composio</span>
                    </a>
                  </div>
                )}
              </form>

              <div className="lg:col-span-5 space-y-6">
                <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Diagnóstico do SDK Composio</h4>
                    <button
                      type="button"
                      onClick={handleReconnectRealtime}
                      disabled={isReconnectingRealtime}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>{isReconnectingRealtime ? 'Conectando...' : 'Reconectar Triggers'}</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Variável COMPOSIO_API_KEY (Servidor)</span>
                      <span
                        className={`font-semibold ${
                          statusData?.apiKeyConfigured ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {statusData?.apiKeyConfigured ? 'Configurada' : 'Não configurada'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">Escuta Realtime (Triggers SDK)</span>
                      <span
                        className={`font-semibold ${
                          statusData?.realtimeSubscribed ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {statusData?.realtimeSubscribed ? 'Ativa' : 'Inativa / Aguardando Webhook'}
                      </span>
                    </div>

                    {statusData?.connectedAccountDetails && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-400">Status da Conta no Composio</span>
                        <span className="font-mono font-semibold text-emerald-400">
                          {statusData.connectedAccountDetails.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {discoveredAccounts.length > 0 && (
                  <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-white">Contas Encontradas</h4>
                    <div className="space-y-2">
                      {discoveredAccounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-mono font-semibold text-white truncate">{acc.id}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              Entity: {acc.userId} · Status: {acc.status}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setConnectedAccountId(acc.id);
                              setEntityId(acc.userId || entityId);
                              if (acc.phoneNumberId) setPhoneNumberId(acc.phoneNumberId);
                              if (acc.wabaId) setWabaId(acc.wabaId);
                              if (acc.authConfigId) setAuthConfigId(acc.authConfigId);
                              showToast('success', `Account ID ${acc.id} preenchido.`);
                            }}
                            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-md whitespace-nowrap shrink-0"
                          >
                            Selecionar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-white">Webhook Composio (Produção)</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300 font-medium">Endpoint</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          statusData?.composioWebhookUrl || `${window.location.origin}/api/composio/whatsapp/webhook`,
                          'composio_wh'
                        )
                      }
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedKey === 'composio_wh' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 break-all">
                    {statusData?.composioWebhookUrl || `${window.location.origin}/api/composio/whatsapp/webhook`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: CONTATOS & CONTROLE ESTRITO DE OCR */}
      {subTab === 'contatos' && (
        <WhatsAppContactsTab
          contacts={contacts}
          clients={clients}
          isBridgeConnected={isBridgeConnected}
          onRefresh={() => loadAll(false)}
          onOpenChat={handleOpenContactChat}
          onCreateAiRuleForContact={handleCreateAiRuleFromContact}
          onToast={showToast}
        />
      )}

      {/* TAB: RESPOSTAS RÁPIDAS */}
      {subTab === 'respostas_rapidas' && (
        <WhatsAppQuickRepliesTab
          quickReplies={quickReplies}
          onRefresh={() => loadAll(false)}
          onUseInChat={handleApplyQuickReply}
          onToast={showToast}
        />
      )}

      {/* TAB: ASSISTENTE IA / COPILOTO NO TELEFONE CONECTADO */}
      {subTab === 'assistente_ia' && (
        <WhatsAppAiAssistantTab
          organizationId={organizationId}
          userName={userName}
          isBridgeConnected={isBridgeConnected}
          connectedNumber={bridgeStatus?.connectedNumber || connectedPhoneNumber}
          contacts={contacts}
          rules={assistantRules}
          scheduledJobs={scheduledJobs}
          chatHistory={assistantChat}
          mentionConfig={mentionConfig}
          preselectedTargetCommand={preselectedAiCommand}
          onConsumePreselectedCommand={() => setPreselectedAiCommand('')}
          onRefresh={() => loadAll(false)}
          onToast={showToast}
        />
      )}

      {/* TAB: DASHBOARD DE LEITURAS OCR */}
      {subTab === 'dashboard_ocr' && (
        <WhatsAppOcrDashboardTab
          userName={userName}
          dashboard={ocrDashboard}
          includeHistory={includeOcrHistory}
          vaultStatus={ocrVaultStatus}
          onToggleIncludeHistory={handleToggleIncludeOcrHistory}
          onRefresh={() => loadAll(false)}
          onGoToContacts={() => setSubTab('contatos')}
          onToast={showToast}
        />
      )}

      {/* TAB: ORIENTAR EQUIPE */}
      {subTab === 'educar_equipe' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#0B132B] border border-slate-700/80 rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">
                Comunicado para Grupos de Obra & Técnicos de Campo
              </h3>
              <p className="text-xs text-slate-400">
                Com a ponte de Dispositivos Conectados ativa, você pode disparar este comunicado diretamente dentro dos grupos da empresa ou no privado de cada técnico.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
              {groupGuideText}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => copyText(groupGuideText, 'guide')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedKey === 'guide' ? 'Comunicado Copiado!' : 'Copiar Texto de Orientação'}</span>
              </button>

              {pinnedGroupJid && (
                <button
                  type="button"
                  disabled={isSending || !isBridgeConnected}
                  onClick={() => handleSendEmployeeGuide(pinnedGroupJid, pinnedGroupName)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Hash className="w-3.5 h-3.5" />
                  <span>Enviar Agora no Grupo {pinnedGroupName}</span>
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#0B132B] border border-slate-700/80 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Enviar Orientação para Colaborador ou Grupo
            </h3>

            <div className="grid grid-cols-1 gap-2.5 p-3.5 bg-slate-900 border border-slate-800 rounded-lg">
              <input
                type="text"
                value={employeeTargetName}
                onChange={(e) => setEmployeeTargetName(e.target.value)}
                placeholder="Nome do colaborador (ex: Carlos Eduardo)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={employeeTargetPhone}
                  onChange={(e) => setEmployeeTargetPhone(e.target.value)}
                  placeholder="+55 19 98123-4567"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  disabled={isSending || !employeeTargetPhone.trim()}
                  onClick={() => handleSendEmployeeGuide(employeeTargetPhone, employeeTargetName)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  Enviar Guia
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-400 block">
                Telefones Autorizados no Reembolso OCR
              </span>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/50">
                {(statusData?.config?.authorizedPhones || []).length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">Nenhum telefone autorizado listado.</p>
                ) : (
                  (statusData?.config?.authorizedPhones || []).map((phone) => (
                    <div key={phone} className="p-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-mono tabular-nums text-slate-200">{phone}</span>
                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSendEmployeeGuide(phone)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-cyan-400 font-medium rounded-md transition whitespace-nowrap"
                      >
                        Enviar Orientação
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
