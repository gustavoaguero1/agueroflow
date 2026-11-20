import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  AtSign,
  Bot,
  CalendarClock,
  CheckCircle2,
  PauseCircle,
  Play,
  PlayCircle,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  WhatsAppAiAssistantMessage,
  WhatsAppAutoResponderRule,
  WhatsAppManagedContact,
  WhatsAppMentionAllowedSenders,
  WhatsAppMentionConfig,
  WhatsAppMentionReplyMode,
  WhatsAppPendingRuleDraft,
  WhatsAppScheduledJob,
  WhatsAppScheduledJobType,
  WhatsAppScheduledRecurrence,
} from '../../types/whatsappComposio';
import {
  clearWhatsAppAssistantChat,
  createWhatsAppScheduledJob,
  deleteWhatsAppAssistantRule,
  deleteWhatsAppScheduledJob,
  resolveWhatsAppAssistantAlert,
  runWhatsAppScheduledJobNow,
  saveWhatsAppMentionConfig,
  sendWhatsAppAssistantMessage,
  sendWhatsAppMessageViaBridge,
  toggleWhatsAppAssistantRule,
  toggleWhatsAppScheduledJob,
} from '../../services/composioWhatsAppClient';

interface WhatsAppAiAssistantTabProps {
  organizationId: string;
  userName: string;
  isBridgeConnected: boolean;
  connectedNumber?: string;
  contacts: WhatsAppManagedContact[];
  rules: WhatsAppAutoResponderRule[];
  scheduledJobs: WhatsAppScheduledJob[];
  chatHistory: WhatsAppAiAssistantMessage[];
  mentionConfig?: WhatsAppMentionConfig | null;
  preselectedTargetCommand?: string;
  onConsumePreselectedCommand?: () => void;
  onRefresh: () => Promise<void>;
  onToast: (type: 'success' | 'error', text: string) => void;
}

const PROMPT_STARTERS = [
  {
    label: 'Mensagem em 2 min',
    text: 'Em 2 minutos mande mensagem no grupo Serviço dizendo oi',
  },
  {
    label: 'Resumo diário NDs às 17h',
    text: 'Quero que todo dia às 17:00 você me passe um resumo dos custos mencionados no grupo ND com categorização da denominação daquele gasto.',
  },
  {
    label: 'Resumo custos por período',
    text: 'Faça um resumo dos custos do grupo de obras dos últimos 7 dias categorizando cada gasto por denominação.',
  },
  {
    label: 'Responder contato + trava crítica',
    text: 'Sempre que o número +55 11 99999-9999 me mandar mensagem, responda por mim e só pare de responder em decisões críticas.',
  },
  {
    label: 'Pausar todas as regras',
    text: 'Pausar todas as regras de resposta automática agora.',
  },
];

export const WhatsAppAiAssistantTab: React.FC<WhatsAppAiAssistantTabProps> = ({
  organizationId,
  userName,
  isBridgeConnected,
  connectedNumber,
  contacts,
  rules,
  scheduledJobs,
  chatHistory,
  mentionConfig,
  preselectedTargetCommand,
  onConsumePreselectedCommand,
  onRefresh,
  onToast,
}) => {
  const [commandInput, setCommandInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendingAlertId, setSendingAlertId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [pendingDraft, setPendingDraft] = useState<WhatsAppPendingRuleDraft | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState(false);

  // Scheduled job creation form state
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobType, setJobType] = useState<WhatsAppScheduledJobType>('group_cost_summary');
  const [jobTime, setJobTime] = useState('17:00');
  const [jobRecurrence, setJobRecurrence] = useState<WhatsAppScheduledRecurrence>('daily');
  const [jobSourceChatJid, setJobSourceChatJid] = useState('');
  const [jobTargetJid, setJobTargetJid] = useState('OWNER');
  const [jobPrompt, setJobPrompt] = useState(
    'Gerar resumo dos custos e Notas de Débito (ND) do dia com categorização da denominação de cada gasto e total geral.'
  );
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  const [mentionEnabled, setMentionEnabled] = useState(mentionConfig?.enabled ?? true);
  const [mentionKeyword, setMentionKeyword] = useState(mentionConfig?.keyword || '@aguero');
  const [mentionAllowedSenders, setMentionAllowedSenders] = useState<WhatsAppMentionAllowedSenders>(
    mentionConfig?.allowedSenders || 'owner_only'
  );
  const [mentionReplyMode, setMentionReplyMode] = useState<WhatsAppMentionReplyMode>(
    mentionConfig?.replyMode || 'same_chat'
  );
  const [isSavingMention, setIsSavingMention] = useState(false);

  useEffect(() => {
    if (mentionConfig) {
      setMentionEnabled(mentionConfig.enabled);
      setMentionKeyword(mentionConfig.keyword || '@aguero');
      setMentionAllowedSenders(mentionConfig.allowedSenders || 'owner_only');
      setMentionReplyMode(mentionConfig.replyMode || 'same_chat');
    }
  }, [mentionConfig]);

  useEffect(() => {
    if (preselectedTargetCommand) {
      setCommandInput(preselectedTargetCommand);
      onConsumePreselectedCommand?.();
    }
  }, [preselectedTargetCommand, onConsumePreselectedCommand]);

  const handleSaveMentionSettings = async (
    overrides?: Partial<WhatsAppMentionConfig>
  ) => {
    setIsSavingMention(true);
    try {
      const res = await saveWhatsAppMentionConfig({
        enabled: overrides?.enabled ?? mentionEnabled,
        keyword: overrides?.keyword ?? mentionKeyword,
        allowedSenders: overrides?.allowedSenders ?? mentionAllowedSenders,
        replyMode: overrides?.replyMode ?? mentionReplyMode,
        includeConversationContext: true,
        contextMessagesCount: 15,
      });
      if (res.success) {
        await onRefresh();
        onToast('success', res.message || 'Gatilho @aguero atualizado!');
      } else {
        onToast('error', res.error || 'Erro ao salvar configuração de menção.');
      }
    } finally {
      setIsSavingMention(false);
    }
  };

  const activeRulesCount = rules.filter((r) => r.active).length;

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    const cmd = commandInput.trim();
    setIsSubmitting(true);
    setCommandInput('');
    try {
      const res = await sendWhatsAppAssistantMessage(cmd);
      if (res.success) {
        setPendingDraft(res.pendingDraft ?? null);
        await onRefresh();
      } else {
        setCommandInput(cmd);
        onToast('error', res.error || 'Erro ao processar comando com o Assistente IA.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDraftAction = async (action: 'confirm_draft' | 'cancel_draft') => {
    setConfirmingDraft(true);
    try {
      const res = await sendWhatsAppAssistantMessage(
        action === 'confirm_draft' ? 'confirmar' : 'cancelar',
        action
      );
      if (res.success) {
        setPendingDraft(res.pendingDraft ?? null);
        await onRefresh();
        onToast(
          'success',
          action === 'confirm_draft'
            ? 'Regra / rotina confirmada e ativada!'
            : 'Rascunho cancelado.'
        );
      } else {
        onToast('error', res.error || 'Não foi possível concluir a ação no rascunho.');
      }
    } finally {
      setConfirmingDraft(false);
    }
  };

  const handleToggleRule = async (rule: WhatsAppAutoResponderRule) => {
    const res = await toggleWhatsAppAssistantRule(rule.id, !rule.active);
    if (res.success) {
      await onRefresh();
      onToast('success', res.rule?.active ? `Regra "${rule.name}" retomada!` : `Regra "${rule.name}" pausada.`);
    } else {
      onToast('error', res.error || 'Erro ao alternar regra.');
    }
  };

  const handleDeleteRule = async (rule: WhatsAppAutoResponderRule) => {
    const res = await deleteWhatsAppAssistantRule(rule.id);
    if (res.success) {
      await onRefresh();
      onToast('success', `Regra "${rule.name}" removida.`);
    } else {
      onToast('error', res.error || 'Erro ao excluir regra.');
    }
  };

  const handleApproveAndSendAlertDraft = async (msg: WhatsAppAiAssistantMessage) => {
    const target = msg.relatedContactJid || msg.relatedContactPhone;
    const textToSend = (draftEdits[msg.id] ?? msg.suggestedDraftReply ?? '').trim();
    if (!target || !textToSend) {
      onToast('error', 'Destinatário ou texto de resposta não disponível.');
      return;
    }
    setSendingAlertId(msg.id);
    try {
      const sendRes = await sendWhatsAppMessageViaBridge({
        organizationId,
        toJidOrPhone: target,
        contactName: msg.relatedContactName || target,
        category: 'atendimento',
        text: textToSend,
        sentByUserName: `${userName} (Aprovado no Copiloto IA)`,
      });
      if (sendRes.success) {
        await resolveWhatsAppAssistantAlert(msg.id);
        await onRefresh();
        onToast('success', `Resposta aprovada e enviada para ${msg.relatedContactName || target}!`);
      } else {
        onToast('error', sendRes.error || 'Não foi possível enviar pelo WhatsApp conectado.');
      }
    } finally {
      setSendingAlertId(null);
    }
  };

  const handleResumeRuleFromAlert = async (ruleId: string, alertId: string) => {
    const res = await toggleWhatsAppAssistantRule(ruleId, true);
    if (res.success) {
      await resolveWhatsAppAssistantAlert(alertId);
      await onRefresh();
      onToast('success', 'Regra retomada e alerta marcado como resolvido.');
    }
  };

  const handleClearChat = async () => {
    const res = await clearWhatsAppAssistantChat();
    if (res.success) {
      setPendingDraft(null);
      await onRefresh();
      onToast('success', 'Histórico do chat do assistente limpo.');
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobName.trim() || !jobPrompt.trim()) {
      onToast('error', 'Informe o nome e a instrução da rotina agendada.');
      return;
    }
    setIsCreatingJob(true);
    try {
      const srcContact = contacts.find((c) => c.jidOrPhone === jobSourceChatJid);
      const tgtContact = contacts.find((c) => c.jidOrPhone === jobTargetJid);
      const res = await createWhatsAppScheduledJob({
        name: jobName.trim(),
        jobType,
        scheduleTime: jobTime,
        recurrence: jobRecurrence,
        sourceChatJid: jobType === 'group_cost_summary' ? jobSourceChatJid || undefined : undefined,
        sourceChatLabel: srcContact?.name || undefined,
        targetJidOrPhone: jobTargetJid.trim() || 'OWNER',
        targetLabel:
          jobTargetJid === 'OWNER'
            ? 'Meu WhatsApp (Privado)'
            : tgtContact?.name || jobTargetJid.trim(),
        promptInstruction: jobPrompt.trim(),
      });
      if (res.success) {
        setJobName('');
        setShowJobForm(false);
        await onRefresh();
        onToast('success', res.message || 'Rotina agendada criada com sucesso!');
      } else {
        onToast('error', res.error || 'Erro ao criar rotina agendada.');
      }
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleToggleJob = async (job: WhatsAppScheduledJob) => {
    const res = await toggleWhatsAppScheduledJob(job.id, !job.active);
    if (res.success) {
      await onRefresh();
      onToast('success', res.job?.active ? `Rotina "${job.name}" ativada!` : `Rotina "${job.name}" pausada.`);
    } else {
      onToast('error', res.error || 'Erro ao alternar rotina.');
    }
  };

  const handleRunJobNow = async (job: WhatsAppScheduledJob) => {
    setRunningJobId(job.id);
    try {
      const res = await runWhatsAppScheduledJobNow(job.id);
      await onRefresh();
      if (res.success) {
        onToast('success', `Rotina "${job.name}" executada agora!`);
      } else {
        onToast('error', res.error || 'Erro ao executar rotina.');
      }
    } finally {
      setRunningJobId(null);
    }
  };

  const handleDeleteJob = async (job: WhatsAppScheduledJob) => {
    const res = await deleteWhatsAppScheduledJob(job.id);
    if (res.success) {
      await onRefresh();
      onToast('success', `Rotina "${job.name}" removida.`);
    } else {
      onToast('error', res.error || 'Erro ao remover rotina.');
    }
  };

  const scopeLabel = (scope: WhatsAppAutoResponderRule['scope']) => {
    if (scope === 'specific_contact') return 'Contato / Número Específico';
    if (scope === 'next_messages') return 'Próximas Mensagens (Privado)';
    return 'Todas Privadas';
  };

  const jobTypeLabel = (type: WhatsAppScheduledJobType) => {
    if (type === 'group_cost_summary') return 'Resumo de Custos / ND';
    if (type === 'fixed_message') return 'Mensagem Fixa';
    return 'Mensagem Gerada por IA';
  };

  const recurrenceLabel = (rec: WhatsAppScheduledRecurrence) => {
    if (rec === 'weekdays') return 'Seg a Sex';
    if (rec === 'once') return 'Uma vez';
    return 'Todo dia';
  };

  return (
    <div className="space-y-6">
      {/* Context Strip */}
      <div className="bg-white dark:bg-[#0B132B] border border-black/[0.08] dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-[#EBF5FF] dark:bg-cyan-950/60 border border-[#0071E3]/20 dark:border-cyan-500/30 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-[#0071E3] dark:text-cyan-400" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug">
              Copiloto IA no WhatsApp Conectado ({connectedNumber || 'Aguardando Pareamento'})
            </h3>
            <p className="text-xs text-[#6E6E73] dark:text-slate-400 leading-relaxed">
              Dê ordens em linguagem natural para responder contatos ou suas próximas mensagens privadas. Em decisões críticas (descontos, prazos, pagamentos, contratos), a regra pausa automaticamente e pede sua aprovação aqui.
            </p>
          </div>
        </div>

        <div className="text-xs font-semibold flex flex-wrap items-center gap-2.5 shrink-0">
          <span
            className={`px-2.5 py-1 rounded-lg border whitespace-nowrap ${
              isBridgeConnected
                ? 'bg-[#E8F8EE] dark:bg-emerald-950/50 border-[#166534]/20 dark:border-emerald-700/50 text-[#166534] dark:text-emerald-400'
                : 'bg-[#FFF4E5] dark:bg-amber-950/40 border-[#9A4400]/20 dark:border-amber-700/50 text-[#9A4400] dark:text-amber-300'
            }`}
          >
            {isBridgeConnected ? 'Telefone Conectado' : 'Conecte o QR Code para envio real'}
          </span>
          <span className="px-2.5 py-1 rounded-lg border bg-[#EBF5FF] dark:bg-cyan-950/40 border-[#0071E3]/20 dark:border-cyan-700/50 text-[#0071E3] dark:text-cyan-300 tabular-nums whitespace-nowrap">
            {activeRulesCount} regra(s) ativa(s)
          </span>
        </div>
      </div>

      {/* @aguero Direct WhatsApp Mention Trigger Config */}
      <div className="bg-white dark:bg-[#0B132B] border border-black/[0.08] dark:border-cyan-500/30 rounded-2xl p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-black/[0.06] dark:border-slate-800 pb-3.5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EE] dark:bg-emerald-950/50 border border-[#166534]/20 dark:border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <AtSign className="w-4 h-4 text-[#166534] dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-[#1D1D1F] dark:text-white leading-snug">
                Chamar a IA Direto no WhatsApp com{' '}
                <span className="font-mono text-[#0071E3] dark:text-cyan-300">{mentionKeyword || '@aguero'}</span>
              </h4>
              <p className="text-xs text-[#6E6E73] dark:text-slate-400 mt-0.5 leading-relaxed">
                Digite <strong className="text-[#1D1D1F] dark:text-slate-200 font-mono">{mentionKeyword || '@aguero'}</strong> em qualquer chat ou grupo para: consultar e resumir custos/mensagens de <strong className="text-[#1D1D1F] dark:text-slate-200">outros grupos</strong> por período, agendar envios diários ou resumos de NDs, <strong className="text-[#1D1D1F] dark:text-slate-200">transcrever áudios</strong> (respondendo ao áudio ou pedindo &quot;transcreve o áudio&quot;), <strong className="text-[#1D1D1F] dark:text-slate-200">ler imagens</strong> (&quot;o que é essa imagem?&quot;), ou responder qualquer assunto sem restrições.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSavingMention}
            onClick={() => {
              const next = !mentionEnabled;
              setMentionEnabled(next);
              handleSaveMentionSettings({ enabled: next });
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 self-start lg:self-auto cursor-pointer ${
              mentionEnabled
                ? 'bg-[#E8F8EE] dark:bg-emerald-950/50 border-[#166534]/25 dark:border-emerald-500/40 text-[#166534] dark:text-emerald-300'
                : 'bg-[#F5F5F7] dark:bg-slate-900 border-black/[0.1] dark:border-slate-700 text-[#6E6E73] dark:text-slate-400'
            }`}
          >
            {mentionEnabled ? 'Menção @aguero Ativa' : 'Menção Desativada'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="text-[11px] font-medium text-slate-400 block mb-1">
              Palavra-chave de Chamada
            </label>
            <input
              type="text"
              value={mentionKeyword}
              onChange={(e) => setMentionKeyword(e.target.value)}
              placeholder="@aguero"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="md:col-span-4">
            <label className="text-[11px] font-medium text-slate-400 block mb-1">
              Quem pode chamar a IA no WhatsApp
            </label>
            <select
              value={mentionAllowedSenders}
              onChange={(e) => setMentionAllowedSenders(e.target.value as WhatsAppMentionAllowedSenders)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="owner_only">Somente eu (telefone conectado — recomendado)</option>
              <option value="owner_and_team">Eu + Equipe / Funcionários autorizados</option>
              <option value="everyone">Qualquer pessoa na conversa ou grupo</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-[11px] font-medium text-slate-400 block mb-1">
              Onde a IA envia a resposta
            </label>
            <select
              value={mentionReplyMode}
              onChange={(e) => setMentionReplyMode(e.target.value as WhatsAppMentionReplyMode)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="same_chat">Na própria conversa ativa</option>
              <option value="smart_dm_on_client">Na conversa (mas privado se for cliente)</option>
              <option value="owner_dm">Sempre no meu WhatsApp privado</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="button"
              disabled={isSavingMention}
              onClick={() => handleSaveMentionSettings()}
              className="w-full px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg whitespace-nowrap transition disabled:opacity-50"
            >
              {isSavingMention ? 'Salvando...' : 'Salvar Regra'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1">
          <span>
            Custos de outro grupo:{' '}
            <code className="font-mono text-slate-200">
              {mentionKeyword || '@aguero'} resumo de custos do grupo ND de 01/05 até 10/05
            </code>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Agendar rotina:{' '}
            <code className="font-mono text-slate-200">
              {mentionKeyword || '@aguero'} todo dia às 17h me passe o resumo de gastos do grupo ND por categoria
            </code>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Áudio/Imagem:{' '}
            <code className="font-mono text-slate-200">
              {mentionKeyword || '@aguero'} transcreve esse áudio / o que é essa imagem?
            </code>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Privado: <code className="font-mono text-emerald-300">{mentionKeyword || '@aguero'}-privado</code>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Interactive Command Chat */}
        <div className="lg:col-span-7 bg-[#0B132B] border border-slate-700/80 rounded-xl flex flex-col overflow-hidden min-h-[540px]">
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-semibold text-white">Chat de Comando do Usuário Conectado</h4>
            </div>
            <div className="flex items-center gap-2">
              {contacts.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const selected = contacts.find((c) => c.id === e.target.value);
                    if (selected) {
                      setCommandInput(
                        `Sempre que ${selected.name} (${selected.jidOrPhone}) me mandar mensagem, responda por mim e só pare de responder em decisões críticas.`
                      );
                    }
                    e.target.value = '';
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 max-w-[210px]"
                >
                  <option value="">Preencher com contato...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.jidOrPhone})
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleClearChat}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 transition whitespace-nowrap"
              >
                Limpar Chat
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950/40 max-h-[380px]">
            {chatHistory.map((msg) => {
              if (msg.role === 'alert') {
                const draftValue = draftEdits[msg.id] ?? msg.suggestedDraftReply ?? '';
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-4 border space-y-3 text-xs ${
                      msg.alertResolved
                        ? 'bg-slate-900/70 border-slate-700 text-slate-300'
                        : 'bg-amber-950/30 border-amber-500/50 text-amber-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          {msg.alertResolved
                            ? 'Decisão Crítica Resolvida'
                            : 'Decisão Crítica Detectada — Regra Pausada'}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                    {!msg.alertResolved && (
                      <div className="space-y-2 pt-2 border-t border-amber-500/20">
                        <label className="text-[11px] font-semibold text-amber-200 block">
                          Rascunho sugerido pela IA (edite antes de enviar se desejar):
                        </label>
                        <textarea
                          rows={2}
                          value={draftValue}
                          onChange={(e) =>
                            setDraftEdits((prev) => ({ ...prev, [msg.id]: e.target.value }))
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproveAndSendAlertDraft(msg)}
                            disabled={sendingAlertId === msg.id}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {sendingAlertId === msg.id ? 'Enviando...' : 'Aprovar & Enviar Agora no WhatsApp'}
                            </span>
                          </button>
                          {msg.createdRuleId && (
                            <button
                              type="button"
                              onClick={() => handleResumeRuleFromAlert(msg.createdRuleId!, msg.id)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <PlayCircle className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Retomar Regra</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs border space-y-1 ${
                      isUser
                        ? 'bg-cyan-950/60 border-cyan-500/30 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">
                        {isUser ? userName : 'Assistente IA AgueroFlow'}
                      </span>
                      <span className="tabular-nums">
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mandatory Guided Rule Confirmation Card */}
          {pendingDraft && (
            <div className="mx-4 mb-3 p-3.5 rounded-xl bg-indigo-950/50 border border-indigo-500/50 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-indigo-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {pendingDraft.readyToConfirm
                      ? 'Confirmação Obrigatória — Revise antes de ativar'
                      : 'Rascunho em Montagem — Responda o que falta abaixo'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDraftAction('cancel_draft')}
                  disabled={confirmingDraft}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  title="Cancelar rascunho"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg p-2.5">
                <div>
                  <span className="text-slate-400">Título: </span>
                  <strong className={pendingDraft.title ? 'text-white' : 'text-amber-300'}>
                    {pendingDraft.title || '(falta informar)'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Função: </span>
                  <strong className="text-cyan-300">
                    {pendingDraft.kind === 'auto_reply_rule'
                      ? 'Auto-Resposta no WhatsApp'
                      : pendingDraft.jobType === 'fixed_message'
                      ? 'Mensagem Fixa Agendada'
                      : pendingDraft.jobType === 'group_cost_summary'
                      ? 'Resumo de Custos / ND'
                      : 'Mensagem Gerada por IA'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Destino: </span>
                  <strong className={pendingDraft.targetLabel || pendingDraft.targetJidOrPhone ? 'text-white' : 'text-amber-300'}>
                    {pendingDraft.targetLabel || pendingDraft.targetJidOrPhone || '(falta informar)'}
                  </strong>
                </div>
                {pendingDraft.kind === 'scheduled_job' && (
                  <div>
                    <span className="text-slate-400">Horário / Freq.: </span>
                    <strong className={pendingDraft.scheduleTime || pendingDraft.delayMinutes ? 'text-white' : 'text-amber-300'}>
                      {pendingDraft.delayMinutes
                        ? `Em ${pendingDraft.delayMinutes} min (${pendingDraft.scheduleTime || 'agora'}) · Uma vez`
                        : pendingDraft.scheduleTime
                        ? `${pendingDraft.scheduleTime} · ${recurrenceLabel(pendingDraft.recurrence || 'daily')}`
                        : '(falta informar)'}
                    </strong>
                  </div>
                )}
                {pendingDraft.jobType === 'group_cost_summary' && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400">Grupo de Origem (Custos): </span>
                    <strong className={pendingDraft.sourceChatLabel || pendingDraft.sourceChatJid ? 'text-white' : 'text-amber-300'}>
                      {pendingDraft.sourceChatLabel || pendingDraft.sourceChatJid || '(falta informar)'}
                    </strong>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <span className="text-slate-400">
                    {pendingDraft.jobType === 'fixed_message' ? 'Texto exato a enviar: ' : 'Ação / Instrução: '}
                  </span>
                  <strong className={pendingDraft.actionContent ? 'text-emerald-300' : 'text-amber-300'}>
                    {pendingDraft.actionContent ? `"${pendingDraft.actionContent}"` : '(falta informar)'}
                  </strong>
                </div>
              </div>

              {pendingDraft.missingFields && pendingDraft.missingFields.length > 0 && (
                <p className="text-[11px] text-amber-300">
                  Falta definir: <strong>{pendingDraft.missingFields.join(', ')}</strong>. Digite no chat abaixo para preencher ou corrigir qualquer campo.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={!pendingDraft.readyToConfirm || confirmingDraft}
                  onClick={() => handleDraftAction('confirm_draft')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{confirmingDraft ? 'Salvando...' : 'Confirmar e Ativar'}</span>
                </button>
                <button
                  type="button"
                  disabled={confirmingDraft}
                  onClick={() => handleDraftAction('cancel_draft')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Prompt Starters & Input */}
          <form onSubmit={handleSendCommand} className="p-4 border-t border-slate-800 space-y-3 bg-[#0B132B]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1">Exemplos rápidos:</span>
              {PROMPT_STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => setCommandInput(starter.text)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-[11px] text-slate-200 transition whitespace-nowrap"
                >
                  {starter.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 items-end">
              <textarea
                rows={2}
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendCommand(e);
                  }
                }}
                placeholder='Ex: "Sempre que o número +55 11 98888-7777 mandar mensagem, responda por mim e só pare em decisões críticas"'
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={isSubmitting || !commandInput.trim()}
                className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Configurando...' : 'Enviar Ordem'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Active & Paused Rules Panel */}
        <div className="lg:col-span-5 bg-[#0B132B] border border-slate-700/80 rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">Regras de Auto-Resposta ({rules.length})</h4>
              <p className="text-[11px] text-slate-400">
                Gerencie ou pause regras ativas a qualquer momento.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800 max-h-[500px]">
            {rules.length === 0 ? (
              <div className="p-10 text-center space-y-2 text-xs text-slate-400">
                <Bot className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-medium text-slate-300">Nenhuma regra configurada</p>
                <p className="text-slate-500">
                  Peça algo ao Assistente IA ao lado para criar sua primeira regra automática.
                </p>
              </div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="p-4 space-y-2.5 hover:bg-slate-900/40 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                            rule.active
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {rule.active ? 'Ativa' : 'Pausada'}
                        </span>
                        <h5 className="text-xs font-semibold text-white truncate">{rule.name}</h5>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {scopeLabel(rule.scope)}
                        {rule.targetPhoneOrJid ? ` · ${rule.targetPhoneOrJid}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1 whitespace-nowrap ${
                          rule.active
                            ? 'bg-slate-900 hover:bg-amber-950/40 border-slate-700 text-amber-300'
                            : 'bg-emerald-950/40 hover:bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        {rule.active ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Pausar</span>
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Ativar</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-md transition"
                        title="Excluir regra"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 leading-relaxed">
                    {rule.personaInstruction}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span className="tabular-nums">
                      Respondidas: <strong className="text-slate-200">{rule.autoRepliedCount || 0}</strong>
                    </span>
                    {rule.remainingReplies !== null && rule.remainingReplies !== undefined && (
                      <span className="tabular-nums text-cyan-300">
                        Restam: <strong>{rule.remainingReplies}</strong>
                      </span>
                    )}
                    {rule.stopOnCriticalDecisions && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Trava Crítica Ativa</span>
                      </span>
                    )}
                  </div>

                  {!rule.active && rule.pausedReason && (
                    <p className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-500/30 rounded-md px-2.5 py-1.5">
                      Motivo da pausa: {rule.pausedReason}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Scheduled Commands & Daily Routines (ND Summaries, Daily Messages, Alerts) */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-white">
                Rotinas & Comandos Agendados ({scheduledJobs.length})
              </h4>
              <p className="text-[11px] text-slate-400">
                Resumos diários de custos/NDs de grupos (ex: todo dia às 17h com categorização) e envios automáticos por horário (Brasília). Também podem ser criados falando direto com <code className="font-mono text-cyan-300">{mentionKeyword || '@aguero'}</code> no WhatsApp.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowJobForm((v) => !v)}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showJobForm ? 'Fechar Formulário' : 'Nova Rotina Agendada'}</span>
          </button>
        </div>

        {showJobForm && (
          <form
            onSubmit={handleCreateJob}
            className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Nome da Rotina *
                </label>
                <input
                  type="text"
                  required
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="Ex: Resumo Diário NDs 17h"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Tipo</label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value as WhatsAppScheduledJobType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="group_cost_summary">Resumo de Custos / NDs de Grupo</option>
                  <option value="ai_message">Mensagem Gerada por IA (ex: piada/bom dia)</option>
                  <option value="fixed_message">Mensagem de Texto Fixo</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Horário (BR) *
                </label>
                <input
                  type="time"
                  required
                  value={jobTime}
                  onChange={(e) => setJobTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Recorrência
                </label>
                <select
                  value={jobRecurrence}
                  onChange={(e) => setJobRecurrence(e.target.value as WhatsAppScheduledRecurrence)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="daily">Todo dia</option>
                  <option value="weekdays">Dias úteis (Seg a Sex)</option>
                  <option value="once">Executar uma única vez</option>
                </select>
              </div>

              {jobType === 'group_cost_summary' && (
                <div className="md:col-span-6">
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Grupo / Chat a Analisar (Origem dos Custos / NDs)
                  </label>
                  <select
                    value={jobSourceChatJid}
                    onChange={(e) => setJobSourceChatJid(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Todos os canais / grupos ativos</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.jidOrPhone}>
                        {c.isGroup ? `[Grupo] ${c.name}` : `${c.name} (${c.jidOrPhone})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={jobType === 'group_cost_summary' ? 'md:col-span-6' : 'md:col-span-12'}>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Destinatário (Para onde enviar no WhatsApp)
                </label>
                <div className="flex gap-2">
                  <select
                    value={
                      jobTargetJid === 'OWNER' || contacts.some((c) => c.jidOrPhone === jobTargetJid)
                        ? jobTargetJid
                        : '__custom__'
                    }
                    onChange={(e) => {
                      if (e.target.value !== '__custom__') setJobTargetJid(e.target.value);
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 max-w-[260px]"
                  >
                    <option value="OWNER">Meu WhatsApp (Privado)</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.jidOrPhone}>
                        {c.isGroup ? `[Grupo] ${c.name}` : c.name}
                      </option>
                    ))}
                    <option value="__custom__">Outro número...</option>
                  </select>
                  <input
                    type="text"
                    value={jobTargetJid === 'OWNER' ? '' : jobTargetJid}
                    onChange={(e) => setJobTargetJid(e.target.value || 'OWNER')}
                    placeholder="Ou digite +55 11 99999-9999"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="md:col-span-12">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Instrução / Texto da Rotina *
                </label>
                <textarea
                  rows={2}
                  required
                  value={jobPrompt}
                  onChange={(e) => setJobPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowJobForm(false)}
                className="px-3.5 py-1.5 bg-slate-900 border border-slate-700 text-slate-300 text-xs font-medium rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isCreatingJob}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {isCreatingJob ? 'Salvando...' : 'Agendar Rotina'}
              </button>
            </div>
          </form>
        )}

        {scheduledJobs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-300">Nenhuma rotina agendada ainda.</p>
            <p className="text-slate-500">
              Clique em &quot;Nova Rotina Agendada&quot; ou peça no chat acima / no WhatsApp com{' '}
              <code className="font-mono text-cyan-300">{mentionKeyword || '@aguero'}</code> (ex: &quot;todo dia às 17h me passe um resumo dos custos do grupo ND&quot;).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {scheduledJobs.map((job) => (
              <div
                key={job.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-900/40 transition"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        job.active
                          ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {job.active ? 'Ativa' : 'Pausada'}
                    </span>
                    <span className="font-mono text-xs font-bold text-cyan-300 tabular-nums">
                      {job.scheduleTime}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {recurrenceLabel(job.recurrence)} · {jobTypeLabel(job.jobType)}
                    </span>
                    <h5 className="text-xs font-semibold text-white">{job.name}</h5>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{job.promptInstruction}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    {job.sourceChatLabel && (
                      <span>
                        Origem: <strong className="text-slate-200">{job.sourceChatLabel}</strong>
                      </span>
                    )}
                    <span>
                      Enviar para: <strong className="text-slate-200">{job.targetLabel}</strong>
                    </span>
                    <span className="tabular-nums">
                      Execuções: <strong className="text-slate-200">{job.runCount || 0}</strong>
                    </span>
                    {job.lastRunAt && (
                      <span className="tabular-nums">
                        Último envio: {new Date(job.lastRunAt).toLocaleString('pt-BR')} (
                        {job.lastRunStatus === 'sucesso' ? 'Enviado' : 'Erro'})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={runningJobId === job.id}
                    onClick={() => handleRunJobNow(job)}
                    className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 rounded-md text-xs font-semibold flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    <span>{runningJobId === job.id ? 'Executando...' : 'Executar Agora'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleJob(job)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md text-xs font-medium whitespace-nowrap"
                  >
                    {job.active ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(job)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-md transition"
                    title="Excluir rotina"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
