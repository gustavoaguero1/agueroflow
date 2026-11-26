import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { WorkOrder, Occurrence, StockBalance, Item, Asset, Unit } from '../types';
import {
  Sparkles,
  Send,
  User,
  Bot,
  AlertCircle,
  HelpCircle,
  Clock,
  RotateCcw,
  CalendarClock,
  MessageSquare,
  FileText,
  ArrowUpRight,
} from 'lucide-react';
import { apiFetch } from '../apiAuthFetch';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

interface AiAssistantModuleProps {
  onNavigate?: (section: string) => void;
}

export const AiAssistantModule: React.FC<AiAssistantModuleProps> = ({ onNavigate }) => {
  const { user, organization, logAudit } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'model',
          text: `Olá! Sou o **AgueroFlow IA**, assistente corporativo de inteligência operacional. Posso consultar os dados da organização **${organization?.name || 'sua empresa'}**, analisar ordens de serviço, verificar saldos críticos de estoque e auxiliar na identificação de riscos operacionais. Como posso ajudar agora?`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [organization]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch real snapshot context from Firestore for the user's organization
  const fetchOrganizationContext = async () => {
    if (!organization) return {};

    try {
      const [woSnap, occSnap, stockSnap, itemsSnap, assetsSnap, unitsSnap, collectiveAssetsSnap, collectiveMovementsSnap] = await Promise.all([
        getDocs(query(collection(db, 'work_orders'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'occurrences'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'stock_balances'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'items'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'assets'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'units'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'collective_assets'), where('orgId', '==', organization.id))),
        getDocs(query(collection(db, 'collective_asset_movements'), where('orgId', '==', organization.id), where('status', 'in', ['em_uso', 'atrasado']))),
      ]);

      const itemsList = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Item));
      const balancesList = stockSnap.docs.map((d) => ({ id: d.id, ...d.data() } as StockBalance));

      const criticalBalances = balancesList
        .map((b) => {
          const item = itemsList.find((i) => i.id === b.itemId);
          return {
            sku: item?.sku,
            name: item?.name,
            saldo: b.currentBalance,
            critico: item?.criticalStock,
            unidade: b.unitId,
          };
        })
        .filter((b) => b.critico !== undefined && b.saldo <= b.critico);

      return {
        organizacao: {
          nome: organization.name,
          slug: organization.slug,
        },
        unidades: unitsSnap.docs.map((d) => ({ id: d.id, nome: d.data().name })),
        total_ordens_servico: woSnap.size,
        ordens_servico: woSnap.docs.slice(0, 15).map((d) => {
          const w = d.data();
          return {
            numero: w.orderNumber,
            titulo: w.title,
            status: w.status,
            prioridade: w.priority,
            equipe: w.assignedTeam,
            previsao_inicio: w.scheduledStartDate,
          };
        }),
        ocorrencias_abertas: occSnap.docs.slice(0, 10).map((d) => {
          const o = d.data();
          return {
            titulo: o.title,
            tipo: o.type,
            urgencia: o.urgency,
            status: o.status,
            responsavel: o.assignedTo,
          };
        }),
        itens_estoque_critico: criticalBalances,
        ativos_cadastrados: assetsSnap.docs.slice(0, 10).map((d) => ({
          tag: d.data().tag,
          nome: d.data().name,
          status: d.data().status,
        })),
        bens_coletivos: {
          total: collectiveAssetsSnap.size,
          empréstimos_ativos: collectiveMovementsSnap.docs.map((d) => {
            const m = d.data();
            return {
              bem_codigo: m.assetCode,
              descricao: m.assetDescription,
              colaborador: m.workerName,
              retirada: m.checkoutDate,
              status: m.status,
            };
          }),
        },
      };
    } catch (err) {
      console.warn('Erro ao montar contexto para IA:', err);
      return {};
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    setErrorMsg(null);
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context = await fetchOrganizationContext();

      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: queryText,
          context,
          conversationHistory: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha na resposta do assistente.');
      }

      const modelMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'model',
        text: data.reply || 'Sem resposta.',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMsg]);
      await logAudit('AgueroFlow IA', 'Consulta ao Assistente', `Pergunta: ${queryText.slice(0, 80)}`);
    } catch (err: any) {
      console.error('Erro no AgueroFlow IA:', err);
      setErrorMsg(err.message || 'Erro ao processar consulta.');
    } finally {
      setLoading(false);
    }
  };

  const promptSuggestions = [
    'Quais são os itens em nível crítico de estoque?',
    'Resuma as ordens de serviço com prioridade alta ou crítica.',
    'Quais ocorrências necessitam de ação corretiva imediata?',
    'Sugira uma rotina de manutenção preventiva para o Torno CNC.',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-[#121826] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Banner */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-[#121826] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>AgueroFlow IA</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Assistente operacional e comandos programados do WhatsApp
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigate && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNavigate('whatsapp-nds')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-indigo-300 flex items-center gap-1 cursor-pointer transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Automação NDs &amp; Outlook</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('whatsapp-comandos')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-cyan-300 flex items-center gap-1 cursor-pointer transition"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Comandos WhatsApp</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            onClick={() => setMessages(messages.slice(0, 1))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Limpar histórico da conversa"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Advisory Banner */}
          <div className="bg-amber-950/30 border-b border-amber-800/30 px-4 py-2 text-[11px] text-amber-300/90 flex items-center space-x-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>
              Aviso: As respostas do AgueroFlow IA têm caráter assistencial e devem ser validadas pelo responsável operacional habilitado.
            </span>
          </div>

      {/* Message Viewport */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start space-x-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'model' && (
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-900/90 border border-slate-800 text-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              <div
                className={`mt-2 text-[10px] text-right ${
                  m.role === 'user' ? 'text-blue-200' : 'text-slate-500'
                }`}
              >
                {m.timestamp}
              </div>
            </div>

            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5 font-bold text-xs">
                {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center space-x-3 text-xs text-slate-400 pl-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span>Consultando dados da organização e gerando análise...</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2.5 bg-slate-900/70 border-t border-slate-800/80 overflow-x-auto flex items-center space-x-2">
        <span className="text-[10px] text-slate-500 shrink-0 font-semibold uppercase">Sugestões:</span>
        {promptSuggestions.map((sug, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(sug)}
            className="af-btn-ai text-[11px] px-3 py-1 rounded-full whitespace-nowrap shrink-0 cursor-pointer font-medium"
          >
            {sug}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-slate-900 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte ao AgueroFlow IA sobre ordens, estoque, manutenção..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#121826] border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0071E3]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl af-btn-primary disabled:opacity-40 cursor-pointer apple-solid-btn"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
