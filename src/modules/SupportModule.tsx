import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SupportTicket, WorkOrder } from '../types';
import type { Project } from '../types/project';
import { evaluateSupportTicketSla } from '../services/supportSlaRules';
import {
  HelpCircle,
  Plus,
  ChevronDown,
  MessageSquare,
  X,
  Clock,
  Link2,
} from 'lucide-react';

export const SupportModule: React.FC = () => {
  const { user, organization, logAudit } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Form
  const [category, setCategory] = useState<SupportTicket['category']>('problema_tecnico');
  const [priority, setPriority] = useState<SupportTicket['priority']>('media');
  const [workOrderId, setWorkOrderId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!organization) return;
    const q = query(collection(db, 'support_tickets'), where('orgId', '==', organization.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(list);
    });
    Promise.all([
      getDocs(query(collection(db, 'work_orders'), where('orgId', '==', organization.id), limit(100))).catch(() => null),
      getDocs(query(collection(db, 'projects'), where('orgId', '==', organization.id), limit(100))).catch(() => null),
    ]).then(([woSnap, prjSnap]) => {
      if (woSnap) setWorkOrders(woSnap.docs.map((d) => ({ ...(d.data() as WorkOrder), id: d.id })));
      if (prjSnap) setProjects(prjSnap.docs.map((d) => ({ ...(d.data() as Project), id: d.id })));
    });
    return () => unsub();
  }, [organization]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setIsSubmitting(true);

    try {
      const ticketId = `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const linkedWo = workOrders.find((w) => w.id === workOrderId);
      const linkedPrj = projects.find((p) => p.id === projectId);
      const newTicket: SupportTicket = {
        id: ticketId,
        orgId: organization.id,
        userId: user.uid,
        userName: user.displayName || user.email || 'Usuário',
        userEmail: user.email || '',
        category,
        priority,
        subject: subject.trim(),
        message: message.trim(),
        ...(linkedWo ? { workOrderId: linkedWo.id, workOrderNumber: linkedWo.orderNumber } : {}),
        ...(linkedPrj ? { projectId: linkedPrj.id, projectCode: linkedPrj.code } : {}),
        status: 'aberto',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'support_tickets', ticketId), newTicket);
      await logAudit('Suporte', 'Abrir Chamado', `Chamado: ${subject} (${priority})`, ticketId);

      setShowCreateModal(false);
      setSubject('');
      setMessage('');
      setWorkOrderId('');
      setProjectId('');
    } catch (err) {
      console.error('Erro ao abrir chamado:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'Como funciona a validação de saídas de estoque no AgueroFlow?',
      a: 'O sistema realiza uma checagem em tempo real contra o saldo disponível no Cloud Firestore. Caso a quantidade de saída solicitada supere o saldo atual na unidade, a operação é terminantemente bloqueada para garantir a conformidade contábil e evitar saldo negativo.',
    },
    {
      q: 'Quem pode aprovar orçamentos na Lista de Preços Unitários (LPU)?',
      a: 'Aprovações de custos requerem perfis com privilégios de Admin ou Gerente e exigem o preenchimento de justificativa técnica obrigatória gravada na trilha de auditoria.',
    },
    {
      q: 'O assistente AgueroFlow IA pode acessar dados de outras empresas?',
      a: 'Não. O assistente opera em um ambiente seguro com isolamento estrito por organização (tenant isolation). Todas as consultas do assistente são filtradas exclusivamente pelos registros da sua organização ativa.',
    },
    {
      q: 'Como gerar ordens preventivas a partir de recorrências?',
      a: 'Basta acessar o submenu Ordens > Recorrências e clicar no botão "Gerar OS a partir desta recorrência" para emitir imediatamente uma nova ordem no status Planejada.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 af-card p-5 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-white tracking-tight">Central de Suporte &amp; Chamados</h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
            Chamados com SLA automático por prioridade, vínculo opcional à OS ou Obra e base de dúvidas frequentes.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold cursor-pointer apple-solid-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Abrir Novo Chamado</span>
        </button>
      </div>

      {/* Grid: Tickets & FAQ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Chamados do Usuário */}
        <div className="lg:col-span-7 af-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-white mb-3 flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-[#0071E3] dark:text-[#409CFF]" />
            <span>Chamados da Organização ({tickets.length})</span>
          </h3>

          <div className="space-y-3">
            {tickets.length === 0 ? (
              <p className="text-xs text-[#86868B] text-center py-8">
                Nenhum chamado de suporte aberto pela sua organização.
              </p>
            ) : (
              tickets.map((t) => {
                const sla = evaluateSupportTicketSla({
                  priority: t.priority,
                  status: t.status,
                  createdAt: t.createdAt,
                });
                return (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.06] dark:border-white/[0.08] text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#1D1D1F] dark:text-white">{t.subject}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            sla.status === 'estourado'
                              ? 'bg-[#FFE5E7] dark:bg-[#FF453A]/15 text-[#D70015] dark:text-[#FF453A]'
                              : sla.status === 'atencao'
                              ? 'bg-[#FFF4E5] dark:bg-[#FF9F0A]/15 text-[#B25000] dark:text-[#FF9F0A]'
                              : sla.status === 'encerrado'
                              ? 'bg-[#E8F8EE] dark:bg-[#30D158]/15 text-[#1E7E34] dark:text-[#30D158]'
                              : 'bg-[#EBF5FF] dark:bg-[#0A84FF]/15 text-[#0066CC] dark:text-[#409CFF]'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>{sla.label}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            t.status === 'resolvido'
                              ? 'bg-[#E8F8EE] dark:bg-[#30D158]/15 text-[#1E7E34] dark:text-[#30D158]'
                              : t.status === 'em_atendimento'
                              ? 'bg-[#EBF5FF] dark:bg-[#0A84FF]/15 text-[#0066CC] dark:text-[#409CFF]'
                              : 'bg-[#FFF4E5] dark:bg-[#FF9F0A]/15 text-[#B25000] dark:text-[#FF9F0A]'
                          }`}
                        >
                          {t.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <p className="text-[#424245] dark:text-[#AEAEB2] text-[11px] leading-relaxed">{t.message}</p>
                    {(t.workOrderNumber || t.projectCode) && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {t.workOrderNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#14161B] border border-black/[0.06] dark:border-white/[0.08] font-mono text-[#0071E3] dark:text-[#409CFF]">
                            <Link2 className="w-3 h-3" /> OS {t.workOrderNumber}
                          </span>
                        )}
                        {t.projectCode && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#14161B] border border-black/[0.06] dark:border-white/[0.08] font-mono text-[#1E7E34] dark:text-[#30D158]">
                            <Link2 className="w-3 h-3" /> Obra {t.projectCode}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="pt-1.5 flex items-center justify-between text-[10px] text-[#86868B] border-t border-black/[0.06] dark:border-white/[0.08]">
                      <span>Categoria: {t.category} · Prioridade: {t.priority}</span>
                      <span className="tabular-nums">{new Date(t.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: FAQ */}
        <div className="lg:col-span-5 af-card rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-white mb-3 flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-[#1E7E34] dark:text-[#30D158]" />
            <span>Perguntas Frequentes (FAQ)</span>
          </h3>

          <div className="space-y-2">
            {faqs.map((f, i) => {
              const isOpen = expandedFaq === i;
              return (
                <div
                  key={i}
                  className="border border-black/[0.06] dark:border-white/[0.08] rounded-xl overflow-hidden bg-[#F5F5F7] dark:bg-[#1C1F26]"
                >
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : i)}
                    className="w-full p-3 text-left font-semibold text-xs text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center justify-between cursor-pointer"
                  >
                    <span>{f.q}</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1.5 text-[11px] text-[#6E6E73] dark:text-[#98989D] leading-relaxed border-t border-black/[0.06] dark:border-white/[0.08]">
                      {f.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal: Create Ticket (Liquid Glass) */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="af-glass-strong rounded-3xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-black/[0.08] dark:border-white/[0.08]">
              <h3 className="text-base font-bold text-[#1D1D1F] dark:text-white">Abrir Chamado de Suporte</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Categoria *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
                  >
                    <option value="problema_tecnico">Problema Técnico</option>
                    <option value="duvida">Dúvida Operacional</option>
                    <option value="sugestao">Sugestão de Melhoria</option>
                    <option value="financeiro">Financeiro / Licenciamento</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Prioridade (SLA)</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
                  >
                    <option value="baixa">Baixa (SLA 72h)</option>
                    <option value="media">Média (SLA 24h)</option>
                    <option value="alta">Alta (SLA 8h)</option>
                    <option value="critica">Crítica (SLA 4h)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Vincular OS (opcional)</label>
                  <select
                    value={workOrderId}
                    onChange={(e) => setWorkOrderId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
                  >
                    <option value="">Nenhuma OS</option>
                    {workOrders.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.orderNumber} — {w.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Vincular Obra (opcional)</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
                  >
                    <option value="">Nenhuma Obra</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Assunto do Chamado *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Dificuldade na conciliação de saída de estoque"
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Mensagem Detalhada *</label>
                <textarea
                  rows={3}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva o cenário, mensagem exibida e ações já tomadas..."
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl af-btn-glass text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl af-btn-primary font-semibold text-xs disabled:opacity-50 cursor-pointer apple-solid-btn"
                >
                  {isSubmitting ? 'Enviando...' : 'Registrar Chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
