import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  collection,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  WorkOrder,
  OrderMessage,
  OrderMessageRole,
  OrderMessageType,
  UserRole,
} from '../../types';
import {
  MessageSquare,
  Send,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  Shield,
  UserCheck,
  CornerDownRight,
  Sparkles,
  Clock,
  Check,
  Filter,
} from 'lucide-react';

interface OrderDiscussionTabProps {
  order: WorkOrder;
  organizationId: string;
  currentUser: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
  };
  currentUserRole?: UserRole;
  logAudit?: (module: string, action: string, details: string, refId?: string) => Promise<void>;
  onOrderUpdated?: (updated: Partial<WorkOrder>) => void;
}

const ROLE_CONFIGS: Record<
  OrderMessageRole,
  { label: string; badgeBg: string; textColor: string; icon: any; border: string }
> = {
  Superior: {
    label: 'Superior / Gestor',
    badgeBg: 'bg-amber-950/80',
    textColor: 'text-amber-300',
    border: 'border-amber-700/60',
    icon: Shield,
  },
  Supervisor: {
    label: 'Supervisor Técnico',
    badgeBg: 'bg-purple-950/80',
    textColor: 'text-purple-300',
    border: 'border-purple-700/60',
    icon: Shield,
  },
  Responsavel: {
    label: 'Responsável pela OS',
    badgeBg: 'bg-blue-950/80',
    textColor: 'text-blue-300',
    border: 'border-blue-700/60',
    icon: UserCheck,
  },
  Tecnico: {
    label: 'Técnico Executor',
    badgeBg: 'bg-cyan-950/80',
    textColor: 'text-cyan-300',
    border: 'border-cyan-700/60',
    icon: UserCheck,
  },
  Solicitante: {
    label: 'Solicitante / Cliente',
    badgeBg: 'bg-slate-800',
    textColor: 'text-slate-300',
    border: 'border-slate-700',
    icon: HelpCircle,
  },
};

const MESSAGE_TYPE_LABELS: Record<
  OrderMessageType,
  { label: string; bg: string; text: string; icon: any }
> = {
  pergunta: {
    label: 'Pergunta / Dúvida Operacional',
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    icon: HelpCircle,
  },
  resposta: {
    label: 'Resposta do Superior',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    icon: CheckCircle,
  },
  orientacao: {
    label: 'Orientação Técnica',
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    icon: Sparkles,
  },
  apontamento: {
    label: 'Apontamento de Execução',
    bg: 'bg-slate-700/40',
    text: 'text-slate-300',
    icon: Clock,
  },
  liberacao: {
    label: 'Liberação / Autorização',
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    icon: Shield,
  },
};

const QUICK_PROMPTS = [
  {
    role: 'Superior' as OrderMessageRole,
    type: 'pergunta' as OrderMessageType,
    text: 'Como está o alinhamento da máquina e os testes de vibração?',
  },
  {
    role: 'Responsavel' as OrderMessageRole,
    type: 'pergunta' as OrderMessageType,
    text: 'Encontramos desgaste excessivo na bucha. Autoriza a substituição do sobressalente?',
  },
  {
    role: 'Superior' as OrderMessageRole,
    type: 'resposta' as OrderMessageType,
    text: 'Substituição autorizada. Peça disponível no almoxarifado principal (prateleira B-04).',
  },
  {
    role: 'Superior' as OrderMessageRole,
    type: 'orientacao' as OrderMessageType,
    text: 'Atenção aos torques de aperto conforme manual antes de fechar o acoplamento.',
  },
  {
    role: 'Responsavel' as OrderMessageRole,
    type: 'apontamento' as OrderMessageType,
    text: 'Serviço de desmontagem e limpeza química 100% concluído. Iniciando montagem nova.',
  },
];

export const OrderDiscussionTab: React.FC<OrderDiscussionTabProps> = ({
  order,
  organizationId,
  currentUser,
  currentUserRole = 'Operacional',
  logAudit,
  onOrderUpdated,
}) => {
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');

  // Default sender role based on user RBAC
  const defaultRole: OrderMessageRole =
    currentUserRole === 'Admin' || currentUserRole === 'Gerente'
      ? 'Superior'
      : currentUserRole === 'Supervisor'
      ? 'Supervisor'
      : 'Responsavel';

  const [activeRole, setActiveRole] = useState<OrderMessageRole>(defaultRole);
  const [activeType, setActiveType] = useState<OrderMessageType>('pergunta');
  const [replyingTo, setReplyingTo] = useState<OrderMessage | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'questions' | 'superiors'>('all');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync role defaults if type changes
  const handleTypeSelect = (type: OrderMessageType) => {
    setActiveType(type);
    if (type === 'resposta' || type === 'orientacao' || type === 'liberacao') {
      if (activeRole !== 'Superior' && activeRole !== 'Supervisor') {
        setActiveRole('Superior');
      }
    } else if (type === 'pergunta' && (activeRole === 'Superior' || activeRole === 'Supervisor')) {
      // Keep as superior if superior asking, or switch if replying
    }
  };

  // Real-time listener
  useEffect(() => {
    if (!organizationId || !order?.id) return;

    const qMsgs = query(
      collection(db, 'order_messages'),
      where('orgId', '==', organizationId),
      where('orderId', '==', order.id)
    );

    const unsub = onSnapshot(qMsgs, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderMessage));
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(list);
      setLoading(false);
    });

    return () => unsub();
  }, [organizationId, order?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSending) return;
    if (content.trim().length > 4000) {
      alert('A mensagem deve ter no máximo 4.000 caracteres.');
      return;
    }

    setIsSending(true);
    try {
      const senderName = currentUser.displayName || currentUser.email || 'Usuário';
      const now = new Date().toISOString();
      const newMsg: Omit<OrderMessage, 'id'> = {
        orgId: organizationId,
        orderId: order.id,
        senderId: currentUser.uid,
        senderName,
        senderRole: activeRole,
        messageType: activeType,
        content: content.trim(),
        createdAt: now,
      };

      const autoResolveReply = !!(
        replyingTo
        && (activeRole === 'Superior' || activeRole === 'Supervisor')
        && replyingTo.messageType === 'pergunta'
      );
      if (replyingTo) {
        newMsg.replyToId = replyingTo.id;
        newMsg.replyToAuthor = replyingTo.senderName;
        newMsg.replyToContent = replyingTo.content.substring(0, 80);
      }

      const orderRef = doc(db, 'work_orders', order.id);
      const messageRef = doc(collection(db, 'order_messages'));
      const eventRef = doc(collection(db, 'order_events'));
      const replyRef = replyingTo ? doc(db, 'order_messages', replyingTo.id) : null;
      const timelineDesc = replyingTo
        ? `[Diálogo] ${activeRole} (${senderName}) respondeu a ${replyingTo.senderName}: "${content.trim()}"`
        : `[Diálogo] ${activeRole} (${senderName}) enviou ${activeType}: "${content.trim()}"`;

      const updates = await runTransaction(db, async (tx) => {
        const reads = [tx.get(orderRef)];
        if (replyRef) reads.push(tx.get(replyRef));
        const snapshots = await Promise.all(reads);
        const orderSnap = snapshots[0];
        const currentOrder = orderSnap.data() as WorkOrder | undefined;
        if (!orderSnap.exists() || currentOrder?.orgId !== organizationId) {
          throw new Error('A OS não pertence à empresa selecionada ou não está mais disponível.');
        }

        let shouldResolve = false;
        if (replyRef) {
          const replySnap = snapshots[1];
          const replyMessage = replySnap.data() as OrderMessage | undefined;
          if (!replySnap.exists() || replyMessage?.orgId !== organizationId || replyMessage.orderId !== order.id) {
            throw new Error('A mensagem respondida não pertence a esta OS.');
          }
          shouldResolve = autoResolveReply && replyMessage.messageType === 'pergunta' && !replyMessage.resolved;
        }

        const baseMessageCount = Math.max(currentOrder.messageCount || 0, messages.length);
        const basePendingCount = Math.max(currentOrder.pendingQuestionCount || 0, 0);
        const nextMessageCount = baseMessageCount + 1;
        const nextPendingCount = Math.max(
          0,
          basePendingCount + (activeType === 'pergunta' ? 1 : 0) - (shouldResolve ? 1 : 0)
        );
        const orderUpdates: Partial<WorkOrder> = {
          messageCount: nextMessageCount,
          pendingQuestionCount: nextPendingCount,
          lastDiscussionAt: now,
          updatedAt: now,
        };

        tx.set(messageRef, newMsg);
        tx.set(eventRef, {
          orgId: organizationId,
          orderId: order.id,
          userId: currentUser.uid,
          userName: senderName,
          eventType: 'dialogo',
          description: timelineDesc,
          timestamp: now,
          meta: {
            messageId: messageRef.id,
            role: activeRole,
            type: activeType,
          },
        });
        tx.update(orderRef, orderUpdates);
        if (shouldResolve && replyRef) {
          tx.update(replyRef, {
            resolved: true,
            resolvedAt: now,
            resolvedBy: senderName,
          });
        }
        return orderUpdates;
      });

      if (onOrderUpdated) onOrderUpdated(updates);
      if (logAudit) {
        await logAudit(
          'Ordens de Serviço',
          'Mensagem de Execução',
          `Mensagem na OS ${order.orderNumber} por ${senderName} (${activeRole})`,
          order.id
        );
      }

      setContent('');
      setReplyingTo(null);
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleResolved = async (msg: OrderMessage) => {
    try {
      const nextResolved = !msg.resolved;
      await updateDoc(doc(db, 'order_messages', msg.id), {
        resolved: nextResolved,
        resolvedAt: nextResolved ? new Date().toISOString() : null,
        resolvedBy: nextResolved ? (currentUser.displayName || currentUser.email) : null,
      });
    } catch (err) {
      console.error('Erro ao atualizar status da dúvida:', err);
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filterType === 'questions') return m.messageType === 'pergunta';
    if (filterType === 'superiors') return m.senderRole === 'Superior' || m.senderRole === 'Supervisor';
    return true;
  });

  const pendingQuestions = messages.filter((m) => m.messageType === 'pergunta' && !m.resolved);

  return (
    <div className="flex flex-col h-[68vh] min-h-[500px] bg-[#0c111d] rounded-xl border border-slate-800 overflow-hidden">
      {/* Banner & Header */}
      <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs font-bold text-white">Canal de Comunicação Operacional & Execução</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {messages.length} apontamentos
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Diálogo ágil entre o <strong>Responsável da OS</strong> em campo e <strong>Superiores / Gestores</strong>.
            </p>
          </div>
        </div>

        {/* Quick Filter & Questions Counter */}
        <div className="flex items-center space-x-2">
          {pendingQuestions.length > 0 ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 flex items-center space-x-1 animate-pulse">
              <HelpCircle className="w-3 h-3" />
              <span>{pendingQuestions.length} aguardando resposta</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center space-x-1">
              <Check className="w-3 h-3" />
              <span>Dúvidas alinhadas</span>
            </span>
          )}

          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px]">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2 py-1 rounded ${
                filterType === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setFilterType('questions')}
              className={`px-2 py-1 rounded ${
                filterType === 'questions' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dúvidas ({messages.filter((m) => m.messageType === 'pergunta').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('superiors')}
              className={`px-2 py-1 rounded ${
                filterType === 'superiors' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Gestão
            </button>
          </div>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gradient-to-b from-[#0c111d] to-[#0f172a]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            Carregando conversas operacionais...
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-500 mb-2">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-slate-300">Nenhum diálogo operacional registrado ainda.</p>
            <p className="text-[11px] text-slate-500 max-w-sm mt-1">
              O responsável pode relatar o status da execução ou enviar perguntas para que um superior responda e oriente as etapas.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {QUICK_PROMPTS.slice(0, 3).map((qp, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setContent(qp.text);
                    setActiveRole(qp.role);
                    setActiveType(qp.type);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[10px] text-slate-300 transition-colors"
                >
                  "{qp.text.substring(0, 40)}..."
                </button>
              ))}
            </div>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const roleCfg = ROLE_CONFIGS[msg.senderRole] || ROLE_CONFIGS.Responsavel;
            const typeCfg = MESSAGE_TYPE_LABELS[msg.messageType] || MESSAGE_TYPE_LABELS.apontamento;
            const isSuperior = msg.senderRole === 'Superior' || msg.senderRole === 'Supervisor';
            const isMe = msg.senderId === currentUser.uid;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isSuperior ? 'items-end' : 'items-start'} group`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-3.5 border transition-all ${
                    isSuperior
                      ? 'bg-amber-950/25 border-amber-800/50 text-amber-100 shadow-sm'
                      : 'bg-slate-900/90 border-slate-800 text-slate-200'
                  }`}
                >
                  {/* Quoted Reply if any */}
                  {msg.replyToContent && (
                    <div className="mb-2 p-2 rounded-lg bg-black/40 border-l-2 border-blue-500 text-[10px] text-slate-300 flex items-start space-x-1.5">
                      <CornerDownRight className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                      <div className="truncate">
                        <span className="font-semibold text-blue-300">{msg.replyToAuthor}:</span>{' '}
                        <span className="italic text-slate-400">"{msg.replyToContent}..."</span>
                      </div>
                    </div>
                  )}

                  {/* Header: Author + Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-white/5 text-[10px]">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1 ${roleCfg.badgeBg} ${roleCfg.textColor} border ${roleCfg.border}`}
                      >
                        <roleCfg.icon className="w-2.5 h-2.5" />
                        <span>{roleCfg.label}</span>
                      </span>

                      <span className="font-bold text-white text-xs">{msg.senderName}</span>
                      {isMe && <span className="text-[9px] text-slate-400">(Você)</span>}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center space-x-1 ${typeCfg.bg} ${typeCfg.text}`}
                      >
                        <typeCfg.icon className="w-2.5 h-2.5" />
                        <span>{typeCfg.label}</span>
                      </span>
                      <span className="text-slate-400 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {/* Footer: Thread actions and Question status */}
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                    {msg.messageType === 'pergunta' ? (
                      <div className="flex items-center space-x-2">
                        {msg.resolved ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                            <CheckCircle className="w-3 h-3" />
                            <span>Esclarecido / Respondido</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-amber-400 font-semibold">
                            <AlertCircle className="w-3 h-3" />
                            <span>Aguardando resposta do Superior</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleResolved(msg)}
                          className="text-slate-400 hover:text-white underline text-[9px] cursor-pointer"
                        >
                          {msg.resolved ? 'Reabrir' : 'Marcar sanada'}
                        </button>
                      </div>
                    ) : (
                      <div />
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(msg);
                        // If technician asked, superior responds
                        if (msg.messageType === 'pergunta') {
                          setActiveType('resposta');
                          setActiveRole('Superior');
                        }
                      }}
                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <CornerDownRight className="w-3 h-3 text-blue-400" />
                      <span>Responder</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quoted banner when replying */}
      {replyingTo && (
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 truncate">
            <CornerDownRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-slate-400">
              Respondendo para <strong className="text-blue-300">{replyingTo.senderName}</strong>:
            </span>
            <span className="italic text-slate-300 truncate">"{replyingTo.content}"</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-slate-800 ml-2 shrink-0 cursor-pointer"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {/* Message Composer */}
      <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 space-y-2.5">
        {/* Role & Intent Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Sender Role Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Você é:</span>
            <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800">
              {(['Responsavel', 'Superior', 'Supervisor', 'Tecnico'] as OrderMessageRole[]).map((r) => {
                const isSelected = activeRole === r;
                const cfg = ROLE_CONFIGS[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setActiveRole(r)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? `${cfg.badgeBg} ${cfg.textColor} border ${cfg.border} shadow-sm`
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r === 'Responsavel' ? 'Responsável' : r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message Type Selector */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Tipo:</span>
            <select
              value={activeType}
              onChange={(e) => handleTypeSelect(e.target.value as OrderMessageType)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-semibold text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="pergunta">❓ Dúvida / Pergunta Operacional</option>
              <option value="resposta">✅ Resposta do Superior</option>
              <option value="orientacao">💡 Orientação Técnica</option>
              <option value="apontamento">⏱️ Apontamento de Execução</option>
              <option value="liberacao">🛡️ Liberação / Autorização</option>
            </select>
          </div>
        </div>

        {/* Input Textarea & Send button */}
        <div className="flex items-end space-x-2">
          <div className="flex-1 relative">
            <textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={
                activeRole === 'Superior' || activeRole === 'Supervisor'
                  ? 'Instrução, resposta oficial, validação técnica ou diretriz para o responsável...'
                  : 'Descreva como está a execução, dúvidas técnicas, pedido de autorização ou peça...'
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!content.trim() || isSending}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md cursor-pointer transition-all self-stretch justify-center shrink-0"
          >
            <span>{isSending ? 'Enviando...' : 'Enviar'}</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 custom-scrollbar text-[10px] text-slate-400">
          <span className="shrink-0 text-slate-500 text-[9px]">Sugestões:</span>
          {QUICK_PROMPTS.map((qp, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setContent(qp.text);
                setActiveRole(qp.role);
                setActiveType(qp.type);
              }}
              className="shrink-0 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {qp.text.substring(0, 32)}...
            </button>
          ))}
        </div>
      </form>
    </div>
  );
};
