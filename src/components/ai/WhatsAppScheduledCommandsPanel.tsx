import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Database,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  WhatsAppBridgeStatus,
  WhatsAppManagedContact,
  WhatsAppScheduledJob,
  WhatsAppScheduledJobType,
  WhatsAppScheduledRecurrence,
} from '../../types/whatsappComposio';
import {
  createWhatsAppScheduledJob,
  deleteWhatsAppScheduledJob,
  fetchWhatsAppAssistantState,
  fetchWhatsAppBridgeStatus,
  fetchWhatsAppContacts,
  runWhatsAppScheduledJobNow,
  syncScheduledJobsWithFirestore,
  toggleWhatsAppScheduledJob,
  triggerWhatsAppBridgeCatchUp,
  updateWhatsAppScheduledJob,
} from '../../services/composioWhatsAppClient';

interface WhatsAppScheduledCommandsPanelProps {
  organizationId: string;
  onLogAudit?: (module: string, action: string, details: string) => Promise<void>;
}

const COMMAND_PRESETS: Array<{
  label: string;
  name: string;
  jobType: WhatsAppScheduledJobType;
  scheduleTime: string;
  recurrence: WhatsAppScheduledRecurrence;
  promptInstruction: string;
}> = [
  {
    label: 'Resumo Diário de Custos / ND às 17h',
    name: 'Resumo Diário de Custos & NDs (17h)',
    jobType: 'group_cost_summary',
    scheduleTime: '17:00',
    recurrence: 'daily',
    promptInstruction:
      'Consolidar todos os gastos e Notas de Débito (ND) mencionados ou lidos via OCR hoje no grupo selecionado, categorizando cada item por denominação do gasto (alimentação, combustível, pedágio, hospedagem, materiais emergenciais, ND) com subtotais e total geral.',
  },
  {
    label: 'Fechamento de Obra (Seg-Sex 18h)',
    name: 'Fechamento Diário de Obras (18h)',
    jobType: 'group_cost_summary',
    scheduleTime: '18:00',
    recurrence: 'weekdays',
    promptInstruction:
      'Gerar resumo executivo do dia no grupo da obra com custos lançados, pendências citadas pela equipe e próximos passos.',
  },
  {
    label: 'Mensagem Matinal IA às 09h',
    name: 'Mensagem Matinal Automática (09h)',
    jobType: 'ai_message',
    scheduleTime: '09:00',
    recurrence: 'daily',
    promptInstruction:
      'Enviar uma saudação de bom dia leve e positiva (com uma curiosidade ou piada curta) para iniciar bem o expediente.',
  },
];

export const WhatsAppScheduledCommandsPanel: React.FC<WhatsAppScheduledCommandsPanelProps> = ({
  organizationId,
  onLogAudit,
}) => {
  const [jobs, setJobs] = useState<WhatsAppScheduledJob[]>([]);
  const [contacts, setContacts] = useState<WhatsAppManagedContact[]>([]);
  const [bridge, setBridge] = useState<WhatsAppBridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create / Edit Form state
  const [showForm, setShowForm] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [jobType, setJobType] = useState<WhatsAppScheduledJobType>('group_cost_summary');
  const [scheduleTime, setScheduleTime] = useState('17:00');
  const [recurrence, setRecurrence] = useState<WhatsAppScheduledRecurrence>('daily');
  const [sourceChatJid, setSourceChatJid] = useState('');
  const [targetJidOrPhone, setTargetJidOrPhone] = useState('OWNER');
  const [promptInstruction, setPromptInstruction] = useState(
    'Consolidar todos os gastos e Notas de Débito (ND) do dia no grupo com categorização da denominação de cada gasto e total geral.'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [isCheckingBridge, setIsCheckingBridge] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  // Merge contacts + discovered WhatsApp groups into one clean channel selector
  const availableChannels = useMemo(() => {
    const map = new Map<string, { jid: string; label: string; isGroup: boolean }>();
    for (const c of contacts) {
      map.set(c.jidOrPhone, {
        jid: c.jidOrPhone,
        label: c.name,
        isGroup: Boolean(c.isGroup || c.jidOrPhone.endsWith('@g.us')),
      });
    }
    for (const g of bridge?.groups || []) {
      if (!map.has(g.jid)) {
        map.set(g.jid, { jid: g.jid, label: g.subject, isGroup: true });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [contacts, bridge?.groups]);

  const loadData = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) setLoading(true);
      try {
        const [aiRes, ctRes, brRes] = await Promise.all([
          fetchWhatsAppAssistantState(),
          fetchWhatsAppContacts(),
          fetchWhatsAppBridgeStatus(),
        ]);

        const serverJobs = aiRes?.success && Array.isArray(aiRes.scheduledJobs) ? aiRes.scheduledJobs : [];
        const syncRes = await syncScheduledJobsWithFirestore(serverJobs, organizationId);
        setJobs(syncRes.jobs);
        setFirestoreSynced(syncRes.firestoreSynced);

        if (ctRes?.success && Array.isArray(ctRes.contacts)) {
          setContacts(ctRes.contacts);
        }
        if (brRes?.success && brRes.bridge) {
          setBridge(brRes.bridge);
        }
      } catch (err: any) {
        console.warn('Erro ao carregar comandos programados:', err);
      } finally {
        if (withSpinner) setLoading(false);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const resetForm = () => {
    setEditingJobId(null);
    setName('');
    setJobType('group_cost_summary');
    setScheduleTime('17:00');
    setRecurrence('daily');
    setSourceChatJid('');
    setTargetJidOrPhone('OWNER');
    setPromptInstruction(
      'Consolidar todos os gastos e Notas de Débito (ND) do dia no grupo com categorização da denominação de cada gasto e total geral.'
    );
  };

  const applyPreset = (preset: (typeof COMMAND_PRESETS)[number]) => {
    setEditingJobId(null);
    setName(preset.name);
    setJobType(preset.jobType);
    setScheduleTime(preset.scheduleTime);
    setRecurrence(preset.recurrence);
    setPromptInstruction(preset.promptInstruction);
    setShowForm(true);
  };

  const startEditJob = (job: WhatsAppScheduledJob) => {
    setEditingJobId(job.id);
    setName(job.name);
    setJobType(job.jobType);
    setScheduleTime(job.scheduleTime);
    setRecurrence(job.recurrence);
    setSourceChatJid(job.sourceChatJid || '');
    setTargetJidOrPhone(
      job.targetLabel === 'Meu WhatsApp (Privado)' ? 'OWNER' : job.targetJidOrPhone || 'OWNER'
    );
    setPromptInstruction(job.promptInstruction);
    setShowForm(true);
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !promptInstruction.trim()) {
      showToast('error', 'Informe o nome e a instrução do comando programado.');
      return;
    }

    setIsSaving(true);
    try {
      const srcChannel = availableChannels.find((c) => c.jid === sourceChatJid);
      const tgtChannel = availableChannels.find((c) => c.jid === targetJidOrPhone);
      const targetLabel =
        targetJidOrPhone === 'OWNER'
          ? 'Meu WhatsApp (Privado)'
          : tgtChannel?.label || targetJidOrPhone.trim();

      const payload = {
        name: name.trim(),
        jobType,
        scheduleTime,
        recurrence,
        sourceChatJid: jobType === 'group_cost_summary' ? sourceChatJid || undefined : undefined,
        sourceChatLabel: jobType === 'group_cost_summary' ? srcChannel?.label : undefined,
        targetJidOrPhone: targetJidOrPhone.trim() || 'OWNER',
        targetLabel,
        promptInstruction: promptInstruction.trim(),
      };

      const res = editingJobId
        ? await updateWhatsAppScheduledJob(editingJobId, payload)
        : await createWhatsAppScheduledJob(payload);

      if (res.success) {
        await onLogAudit?.(
          'AgueroFlow IA',
          editingJobId ? 'Atualizar Comando Programado' : 'Criar Comando Programado',
          `${payload.name} (${payload.scheduleTime}) -> ${targetLabel}`
        );
        resetForm();
        setShowForm(false);
        await loadData(false);
        showToast(
          'success',
          res.message || 'Comando programado salvo no servidor e sincronizado no Firestore!'
        );
      } else {
        showToast('error', res.error || 'Erro ao salvar comando programado.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleJob = async (job: WhatsAppScheduledJob) => {
    const res = await toggleWhatsAppScheduledJob(job.id, !job.active);
    if (res.success) {
      await loadData(false);
      showToast(
        'success',
        res.job?.active ? `Comando "${job.name}" ativado!` : `Comando "${job.name}" pausado.`
      );
    } else {
      showToast('error', res.error || 'Falha ao alternar status do comando.');
    }
  };

  const handleRunNow = async (job: WhatsAppScheduledJob) => {
    setRunningJobId(job.id);
    try {
      const res = await runWhatsAppScheduledJobNow(job.id);
      await loadData(false);
      if (res.success) {
        showToast('success', `Comando "${job.name}" executado e enviado no WhatsApp!`);
      } else {
        showToast('error', res.error || 'Erro ao executar comando agora.');
      }
    } finally {
      setRunningJobId(null);
    }
  };

  const handleDeleteJob = async (job: WhatsAppScheduledJob) => {
    const res = await deleteWhatsAppScheduledJob(job.id);
    if (res.success) {
      await onLogAudit?.('AgueroFlow IA', 'Excluir Comando Programado', job.name);
      await loadData(false);
      showToast('success', `Comando "${job.name}" removido do agendador e do Firestore.`);
    } else {
      showToast('error', res.error || 'Erro ao excluir comando.');
    }
  };

  const handleTriggerCatchUp = async () => {
    setIsCheckingBridge(true);
    try {
      const res = await triggerWhatsAppBridgeCatchUp();
      if (res.bridge) setBridge(res.bridge);
      if (res.success) {
        showToast('success', res.message || 'Verificação de reconexão e pendentes executada!');
      } else {
        showToast('error', res.error || 'WhatsApp desconectado.');
      }
    } finally {
      setIsCheckingBridge(false);
    }
  };

  const isConnected = bridge?.state === 'conectado';

  const jobTypeLabel = (type: WhatsAppScheduledJobType) => {
    if (type === 'group_cost_summary') return 'Resumo de Custos / ND';
    if (type === 'fixed_message') return 'Texto Fixo';
    return 'Mensagem IA';
  };

  const recurrenceLabel = (rec: WhatsAppScheduledRecurrence) => {
    if (rec === 'weekdays') return 'Seg a Sex';
    if (rec === 'once') return 'Uma vez';
    return 'Todo dia';
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#0D1322]">
      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* WhatsApp Connection + Auto-Reconnect Catch-Up & Firestore Sync Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-[#121A2F] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-400" />
              )}
              <span className={isConnected ? 'text-emerald-300' : 'text-amber-300'}>
                {isConnected
                  ? `WhatsApp Conectado (${bridge?.connectedNumber || 'Online'})`
                  : bridge?.state === 'reconectando'
                  ? `Reconectando automaticamente (#${bridge.reconnectAttempts || 1})...`
                  : 'WhatsApp aguardando pareamento (Central WhatsApp)'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTriggerCatchUp}
              disabled={isCheckingBridge}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingBridge ? 'animate-spin' : ''}`} />
              <span>Verificar Reconexão & Pendentes</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Reconexão Automática & Varredura Pós-Queda (Catch-Up):</strong>{' '}
            ativa na ponte WhatsApp. Ao restabelecer a internet, o servidor varre automaticamente mensagens não lidas, fotos pendentes para OCR nos canais autorizados e chamados <code className="font-mono text-cyan-300">@aguero</code> recebidos durante a inatividade.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1">
            <span>
              Grupos sincronizados:{' '}
              <strong className="text-slate-200 tabular-nums">{bridge?.groups?.length || 0}</strong>
            </span>
            {bridge?.lastCatchUpAt && (
              <span>
                Última varredura pós-queda:{' '}
                <strong className="text-slate-200 tabular-nums">
                  {new Date(bridge.lastCatchUpAt).toLocaleString('pt-BR')}
                </strong>
              </span>
            )}
            {typeof bridge?.lastCatchUpRecovered === 'number' && bridge.lastCatchUpRecovered > 0 && (
              <span className="text-cyan-300 font-medium">
                {bridge.lastCatchUpRecovered} item(ns) recuperado(s)
              </span>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#121A2F] border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Persistência Firestore (Nuvem)</span>
            </div>
            <span
              className={`text-[11px] font-semibold inline-flex items-center gap-1 ${
                firestoreSynced ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{firestoreSynced ? 'Sincronizado' : 'Sincronizando...'}</span>
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Todos os comandos programados são salvos na coleção <code className="font-mono text-indigo-300">whatsapp_scheduled_jobs</code> do Firestore e executados automaticamente no fuso horário de Brasília (<code className="font-mono">America/Sao_Paulo</code>).
          </p>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400 tabular-nums">
              {jobs.filter((j) => j.active).length} ativo(s) de {jobs.length} cadastrado(s)
            </span>
            <button
              type="button"
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  resetForm();
                } else {
                  resetForm();
                  setShowForm(true);
                }
              }}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showForm ? 'Fechar Formulário' : 'Novo Comando Programado'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mr-1">
          Modelos Rápidos:
        </span>
        {COMMAND_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-lg text-xs text-slate-200 transition"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Create / Edit Command Form */}
      {showForm && (
        <form
          onSubmit={handleSaveJob}
          className="bg-[#121A2F] border border-indigo-500/40 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-sm font-semibold text-white">
              {editingJobId ? 'Editar Comando Programado' : 'Novo Comando Programado no WhatsApp'}
            </h4>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-5">
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Nome do Comando *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Resumo de Custos Grupo ND às 17h"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Tipo de Ação</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value as WhatsAppScheduledJobType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="group_cost_summary">Resumo de Custos / NDs de Grupo</option>
                <option value="ai_message">Mensagem Gerada por IA</option>
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
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Recorrência</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as WhatsAppScheduledRecurrence)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="daily">Todo dia</option>
                <option value="weekdays">Seg a Sex</option>
                <option value="once">Uma vez</option>
              </select>
            </div>

            {jobType === 'group_cost_summary' && (
              <div className="md:col-span-6">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Grupo / Chat Monitorado (Origem dos Custos)
                </label>
                <select
                  value={sourceChatJid}
                  onChange={(e) => setSourceChatJid(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Todos os grupos/canais com OCR ativo</option>
                  {availableChannels.map((ch) => (
                    <option key={ch.jid} value={ch.jid}>
                      {ch.isGroup ? `[Grupo] ${ch.label}` : `[Contato] ${ch.label}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={jobType === 'group_cost_summary' ? 'md:col-span-6' : 'md:col-span-12'}>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Enviar Resultado Para (Grupo ou Usuário do WhatsApp)
              </label>
              <div className="flex gap-2">
                <select
                  value={
                    targetJidOrPhone === 'OWNER' ||
                    availableChannels.some((c) => c.jid === targetJidOrPhone)
                      ? targetJidOrPhone
                      : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') setTargetJidOrPhone(e.target.value);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 max-w-[260px]"
                >
                  <option value="OWNER">Meu WhatsApp (Privado)</option>
                  {availableChannels.map((ch) => (
                    <option key={ch.jid} value={ch.jid}>
                      {ch.isGroup ? `[Grupo] ${ch.label}` : `[Contato] ${ch.label}`}
                    </option>
                  ))}
                  <option value="__custom__">Digitar número manualmente...</option>
                </select>
                <input
                  type="text"
                  value={targetJidOrPhone === 'OWNER' ? '' : targetJidOrPhone}
                  onChange={(e) => setTargetJidOrPhone(e.target.value || 'OWNER')}
                  placeholder="Ou número +55 11 99999-9999"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="md:col-span-12">
              <label className="text-[11px] font-medium text-slate-400 block mb-1">
                Instrução do Comando / Conteúdo *
              </label>
              <textarea
                rows={3}
                required
                value={promptInstruction}
                onChange={(e) => setPromptInstruction(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              {isSaving
                ? 'Salvando no Firestore...'
                : editingJobId
                ? 'Salvar Alterações'
                : 'Agendar e Salvar no Firestore'}
            </button>
          </div>
        </form>
      )}

      {/* Scheduled Commands List */}
      <div className="bg-[#121A2F] border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-white">
              Comandos Programados Vinculados ao WhatsApp ({jobs.length})
            </h4>
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Sincronizando comandos programados com o Firestore...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center space-y-2 text-xs text-slate-400">
            <CalendarClock className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-medium text-slate-300">Nenhum comando programado cadastrado.</p>
            <p className="text-slate-500 max-w-md mx-auto">
              Use um modelo rápido acima ou clique em &quot;Novo Comando Programado&quot; para agendar resumos diários de custos/NDs ou envios automáticos no WhatsApp.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-900/40 transition"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        job.active
                          ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {job.active ? 'Ativo' : 'Pausado'}
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

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    {job.sourceChatLabel && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3 text-emerald-400" />
                        <span>
                          Origem: <strong className="text-slate-200">{job.sourceChatLabel}</strong>
                        </span>
                      </span>
                    )}
                    <span>
                      Destino: <strong className="text-slate-200">{job.targetLabel}</strong>
                    </span>
                    <span className="tabular-nums">
                      Execuções: <strong className="text-slate-200">{job.runCount || 0}</strong>
                    </span>
                    {job.lastRunAt && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CheckCircle2
                          className={`w-3 h-3 ${
                            job.lastRunStatus === 'sucesso' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        />
                        <span>
                          Último envio: {new Date(job.lastRunAt).toLocaleString('pt-BR')}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={runningJobId === job.id}
                    onClick={() => handleRunNow(job)}
                    className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    <span>{runningJobId === job.id ? 'Executando...' : 'Executar Agora'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditJob(job)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleJob(job)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium whitespace-nowrap"
                  >
                    {job.active ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(job)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition"
                    title="Excluir comando"
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
