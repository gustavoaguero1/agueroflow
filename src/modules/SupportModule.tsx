import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SupportTicket } from '../types';
import {
  HelpCircle,
  Plus,
  ChevronDown,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  X,
} from 'lucide-react';

export const SupportModule: React.FC = () => {
  const { user, organization, logAudit } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Form
  const [category, setCategory] = useState<SupportTicket['category']>('problema_tecnico');
  const [priority, setPriority] = useState<SupportTicket['priority']>('media');
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
    return () => unsub();
  }, [organization]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setIsSubmitting(true);

    try {
      const ticketId = `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
        status: 'aberto',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'support_tickets', ticketId), newTicket);
      await logAudit('Suporte', 'Abrir Chamado', `Chamado: ${subject} (${priority})`, ticketId);

      setShowCreateModal(false);
      setSubject('');
      setMessage('');
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Central de Suporte & Chamados</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Dúvidas frequentes da plataforma e abertura de chamados técnicos para a equipe de sustentação.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Abrir Novo Chamado</span>
        </button>
      </div>

      {/* Grid: Tickets & FAQ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Chamados do Usuário */}
        <div className="lg:col-span-7 bg-[#121826] border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span>Seus Chamados de Suporte</span>
          </h3>

          <div className="space-y-3">
            {tickets.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                Nenhum chamado de suporte aberto pela sua organização.
              </p>
            ) : (
              tickets.map((t) => (
                <div key={t.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{t.subject}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        t.status === 'resolvido'
                          ? 'bg-emerald-950/70 text-emerald-400'
                          : t.status === 'em_atendimento'
                          ? 'bg-blue-950/70 text-blue-300'
                          : 'bg-amber-950/70 text-amber-300'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">{t.message}</p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80">
                    <span>Categoria: {t.category}</span>
                    <span>{new Date(t.createdAt).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: FAQ */}
        <div className="lg:col-span-5 bg-[#121826] border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>Perguntas Frequentes (FAQ)</span>
          </h3>

          <div className="space-y-2">
            {faqs.map((f, i) => {
              const isOpen = expandedFaq === i;
              return (
                <div key={i} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/60">
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : i)}
                    className="w-full p-3 text-left font-semibold text-xs text-slate-200 flex items-center justify-between cursor-pointer hover:text-white"
                  >
                    <span>{f.q}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/60 bg-slate-900/90">
                      {f.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal: Create Ticket */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Abrir Chamado de Suporte</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Categoria *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="problema_tecnico">Problema Técnico</option>
                    <option value="duvida">Dúvida Operacional</option>
                    <option value="sugestao">Sugestão de Melhoria</option>
                    <option value="financeiro">Financeiro / Licenciamento</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Assunto do Chamado *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Dificuldade na conciliação de saída de estoque"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Mensagem Detalhada *</label>
                <textarea
                  rows={3}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva o cenário, mensagem exibida e ações já tomadas..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
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
