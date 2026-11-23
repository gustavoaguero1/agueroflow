export type WhatsAppMessageDirection = 'outbound' | 'inbound';

export type WhatsAppContactType = 'cliente' | 'funcionario' | 'fornecedor' | 'outro';

export type WhatsAppMessageCategory =
  | 'comercial_proposta'
  | 'cobranca_followup'
  | 'reembolso_ocr'
  | 'orientacao_equipe'
  | 'atendimento';

export type WhatsAppMessageStatus = 'enviado' | 'entregue' | 'lido' | 'recebido' | 'erro';

export interface WhatsAppBusinessMessage {
  id: string;
  organizationId: string;
  direction: WhatsAppMessageDirection;
  contactPhone: string;
  contactName: string;
  contactType: WhatsAppContactType;
  category: WhatsAppMessageCategory;
  text: string;
  chatJid?: string;
  isGroup?: boolean;
  groupName?: string;
  participantPhone?: string;
  participantName?: string;
  sourceBridge?: 'baileys_web' | 'composio' | 'webhook';
  hasMedia?: boolean;
  mediaMimeType?: string;
  mediaId?: string;
  mediaUrl?: string;
  templateName?: string;
  composioExecutionId?: string;
  connectedAccountId?: string;
  externalMessageId?: string;
  status: WhatsAppMessageStatus;
  errorMessage?: string;
  linkedProposalId?: string;
  linkedProposalCode?: string;
  linkedReceiptId?: string;
  sentByUserName?: string;
  createdAt: string;
}

export interface WhatsAppGroupSummary {
  jid: string;
  subject: string;
  participantsCount: number;
  announce?: boolean;
  description?: string;
}

export type WhatsAppBridgeConnectionState =
  | 'desconectado'
  | 'iniciando'
  | 'reconectando'
  | 'aguardando_qr'
  | 'aguardando_pareamento'
  | 'conectado';

export interface WhatsAppBridgeStatus {
  state: WhatsAppBridgeConnectionState;
  qrDataUrl?: string | null;
  pairingCode?: string | null;
  connectedNumber?: string;
  connectedName?: string;
  connectedJid?: string;
  groups: WhatsAppGroupSummary[];
  lastError?: string | null;
  connectedAt?: string;
  hasSavedSession?: boolean;
  reconnectAttempts?: number;
  lastDisconnectCode?: number | null;
  lastDisconnectReason?: string | null;
  lastActivityAt?: string;
  lastCatchUpAt?: string | null;
  lastCatchUpRecovered?: number;
}

export interface ComposioConnectionSummary {
  id: string;
  userId: string;
  status: string;
  toolkitSlug: string;
  authConfigId?: string;
  isDisabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

export interface ComposioAuthConfigSummary {
  id: string;
  name: string;
  toolkitSlug: string;
  authScheme?: string;
}

export interface ComposioWhatsAppStatusResponse {
  success: boolean;
  apiKeyConfigured: boolean;
  realtimeSubscribed: boolean;
  realtimeError?: string | null;
  webhookUrl: string;
  composioWebhookUrl: string;
  config: {
    provider: string;
    status: string;
    messagingMode: '1_to_1_private' | 'group' | 'hybrid_groups_and_private';
    connectedPhoneNumber: string;
    targetGroupName?: string;
    targetGroupJid?: string;
    composioConnectedAccountId: string;
    composioPhoneNumberId: string;
    composioWabaId: string;
    composioEntityId: string;
    composioAuthConfigId: string;
    composioRealtimeEnabled: boolean;
    autoReplyConfirmation: boolean;
    authorizedPhones: string[];
    lastPingAt?: string;
    lastSyncAt?: string;
  };
  connectedAccountDetails?: ComposioConnectionSummary | null;
  availableAuthConfigs?: ComposioAuthConfigSummary[];
}

export interface WhatsAppManagedContact {
  id: string;
  jidOrPhone: string;
  normalizedPhone: string;
  name: string;
  isGroup: boolean;
  contactType: WhatsAppContactType;
  participantsCount?: number;
  ocrEnabled: boolean;
  ocrAutoReply: boolean;
  autoResponderEnabled?: boolean;
  notes?: string;
  lastMessageAt?: string;
  source: 'whatsapp_sync' | 'manual' | 'orca_agil';
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppQuickReply {
  id: string;
  title: string;
  shortcut: string;
  category: WhatsAppMessageCategory;
  text: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppAiRuleScope = 'specific_contact' | 'next_messages' | 'all_private';

export interface WhatsAppAutoResponderRule {
  id: string;
  name: string;
  scope: WhatsAppAiRuleScope;
  targetPhoneOrJid?: string;
  targetLabel?: string;
  remainingReplies?: number | null;
  personaInstruction: string;
  stopOnCriticalDecisions: boolean;
  criticalKeywords: string[];
  active: boolean;
  pausedReason?: string;
  autoRepliedCount: number;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppAiAssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'alert';
  text: string;
  createdRuleId?: string;
  relatedContactPhone?: string;
  relatedContactJid?: string;
  relatedContactName?: string;
  criticalReason?: string;
  suggestedDraftReply?: string;
  alertResolved?: boolean;
  createdAt: string;
}

export interface WhatsAppOcrReceiptItem {
  id: string;
  employeeName: string;
  employeePhone: string;
  receiptDate: string;
  establishmentName: string;
  cnpj?: string;
  category: string;
  totalAmount: number;
  taxAmount?: number;
  paymentMethod?: string;
  workOrderNumber?: string;
  status: string;
  confidence: number;
  receivedAt: string;
  source?: string;
  sourceChatJid?: string;
  sourceGroupName?: string;
  sourceContactName?: string;
  notes?: string;
  editedAt?: string;
  editedBy?: string;
  editHistory?: Array<{
    editedAt: string;
    editedBy: string;
    summary: string;
  }>;
}

export interface WhatsAppOcrDashboardResponse {
  success: boolean;
  enabledChannels: WhatsAppManagedContact[];
  receipts: WhatsAppOcrReceiptItem[];
  allHistoricalCount?: number;
  includeInactiveChannels?: boolean;
  summary: {
    totalCount: number;
    totalAmount: number;
    pendingCount: number;
    approvedCount: number;
    avgConfidence: number;
    activeChannelsCount: number;
  };
  byCategory: Array<{
    category: string;
    label: string;
    count: number;
    totalAmount: number;
  }>;
  byChannel: Array<{
    channelKey: string;
    channelName: string;
    isGroup: boolean;
    count: number;
    totalAmount: number;
  }>;
}

export type WhatsAppMentionAllowedSenders = 'owner_only' | 'owner_and_team' | 'everyone';
export type WhatsAppMentionReplyMode = 'same_chat' | 'smart_dm_on_client' | 'owner_dm';

export interface WhatsAppMentionConfig {
  enabled: boolean;
  keyword: string;
  allowedSenders: WhatsAppMentionAllowedSenders;
  replyMode: WhatsAppMentionReplyMode;
  includeConversationContext: boolean;
  contextMessagesCount: number;
}

export type WhatsAppScheduledJobType = 'ai_message' | 'group_cost_summary' | 'fixed_message';
export type WhatsAppScheduledRecurrence = 'daily' | 'weekdays' | 'once';

export interface WhatsAppScheduledJob {
  id: string;
  name: string;
  active: boolean;
  jobType: WhatsAppScheduledJobType;
  scheduleTime: string; // HH:mm in America/Sao_Paulo
  timezone: string;
  recurrence: WhatsAppScheduledRecurrence;
  oneShotDate?: string; // YYYY-MM-DD when recurrence === 'once'
  scheduledEpochMs?: number; // Exact UTC epoch for relative/one-shot timers (e.g., "em 2 minutos")
  targetJidOrPhone: string;
  targetLabel: string;
  sourceChatJid?: string;
  sourceChatLabel?: string;
  promptInstruction: string;
  lastRunDateBr?: string;
  lastRunAt?: string;
  lastRunStatus?: 'sucesso' | 'erro';
  lastRunSummary?: string;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppPendingRuleDraft {
  kind: 'scheduled_job' | 'auto_reply_rule';
  title?: string;
  jobType?: WhatsAppScheduledJobType;
  targetQuery?: string;
  targetJidOrPhone?: string;
  targetLabel?: string;
  sourceQuery?: string;
  sourceChatJid?: string;
  sourceChatLabel?: string;
  recurrence?: WhatsAppScheduledRecurrence;
  scheduleTime?: string;
  oneShotDate?: string;
  delayMinutes?: number;
  actionContent?: string;
  remainingReplies?: number;
  stopOnCriticalDecisions?: boolean;
  missingFields: string[];
  readyToConfirm: boolean;
}

export type OutlookBridgeProvider =
  | 'outlook_oauth'
  | 'outlook_graph'
  | 'resend_api'
  | 'brevo_api'
  | 'outlook_webhook'
  | 'outlook_smtp'
  | 'composio_outlook'
  | 'none';

export interface OutlookBridgeStatus {
  configured: boolean;
  activeProvider: OutlookBridgeProvider;
  senderEmail: string | null;
  oauthConfigured?: boolean;
  oauthConnected?: boolean;
  oauthEmail?: string | null;
  callbackUrl?: string;
  availableProviders: {
    microsoftOAuth?: boolean;
    microsoftGraph: boolean;
    resendApi?: boolean;
    brevoApi?: boolean;
    outlookWebhook?: boolean;
    smtpMicrosoft365: boolean;
    composioOutlook: boolean;
  };
}

export interface WhatsAppNdRule {
  id: string;
  organizationId?: string;
  name: string;
  active: boolean;
  groupJid: string;
  groupName: string;
  nextProjNumber: number;
  projYear?: number;
  emitterName: string;
  companyName: string;
  defaultDesignation: string;
  footerText: string;
  sendPdfToWhatsAppGroup: boolean;
  autoEmailEnabled: boolean;
  outlookTo: string[];
  outlookCc: string[];
  outlookSubjectTemplate: string;
  outlookBodyTemplate: string;
  generatedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppNdRecord {
  id: string;
  organizationId?: string;
  ruleId: string;
  projNumber: number;
  projYear: number;
  fileName: string;
  emissionDateTime: string;
  emissionIso: string;
  emitterName: string;
  companyName: string;
  designation: string;
  receiverName: string;
  employeeCode: string;
  pixKey: string;
  cpfCnpj: string;
  bankAccount: string;
  bankName: string;
  phone?: string;
  amount: number;
  paymentDate: string;
  natureza: string;
  costCenter: string;
  notes: string;
  sourceGroupJid: string;
  sourceGroupName: string;
  sourceMessageId?: string;
  sourceMessageText: string;
  whatsappSent: boolean;
  whatsappSentAt?: string;
  emailStatus: 'enviado' | 'pendente_config' | 'erro' | 'desativado';
  emailTo?: string[];
  emailCc?: string[];
  emailSubject?: string;
  emailSentAt?: string;
  emailError?: string;
  emailProvider?: OutlookBridgeProvider;
  isRevised?: boolean;
  revisionNumber?: number;
  revisedAt?: string;
  revisedBy?: string;
  /** Revision already saved to the finance network share by the ND export agent. */
  folderExportedRev?: number;
  createdAt: string;
  updatedAt: string;
}


