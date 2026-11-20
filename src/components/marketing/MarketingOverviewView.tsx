import React from 'react';
import {
  Sparkles,
  Calendar,
  Megaphone,
  PartyPopper,
  Palette,
  HardHat,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Share2,
  Users,
  Target,
  Plus,
} from 'lucide-react';
import {
  MarketingCampaign,
  CorporateEvent,
  RadarOpportunity,
  MarketingSubSection,
} from '../../types/marketing';
import { MarketingService } from '../../services/marketingService';

interface MarketingOverviewViewProps {
  onNavigateSubSection: (section: MarketingSubSection) => void;
  campaigns: MarketingCampaign[];
  events: CorporateEvent[];
  radar: RadarOpportunity[];
  onConvertOpportunity: (opp: RadarOpportunity, type: 'campaign' | 'event') => void;
}

export const MarketingOverviewView: React.FC<MarketingOverviewViewProps> = ({
  onNavigateSubSection,
  campaigns,
  events,
  radar,
  onConvertOpportunity,
}) => {
  const activeCampaigns = campaigns.filter((c) => c.status === 'em_andamento' || c.status === 'planejamento');
  const upcomingEvents = events.filter((e) => e.status !== 'realizado' && e.status !== 'cancelado');
  const totalBudgetPlanned = campaigns.reduce((acc, c) => acc + (c.estimatedBudget || 0), 0);
  const totalBudgetSpent = campaigns.reduce((acc, c) => acc + (c.actualBudgetSpent || 0), 0);
  const topRadarOpportunities = radar.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Top Banner / Mission Statement */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-slate-900 via-blue-950/60 to-slate-900 p-6 lg:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Inteligência de Comunicação, Endomarketing & Marca</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              Marketing, Comunicação & Eventos
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Planeje ações internas de segurança e RH, promova serviços industriais em aço inoxidável e crie peças visuais com assistência de IA proativa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onNavigateSubSection('marketing-estudio')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <Palette className="w-4 h-4" />
              <span>Novo no Estúdio Criativo</span>
            </button>
            <button
              onClick={() => onNavigateSubSection('marketing-calendario')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 font-medium text-xs transition cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>Ver Calendário & Radar</span>
            </button>
            <button
              onClick={() => onNavigateSubSection('marketing-conteudo-obras')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 font-medium text-xs transition cursor-pointer"
            >
              <HardHat className="w-4 h-4 text-amber-400" />
              <span>Transformar Obra em Post</span>
            </button>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Campanhas Ativas
            </span>
            <p className="text-2xl font-bold text-white mt-1">{activeCampaigns.length}</p>
            <span className="text-[11px] text-slate-500">
              {campaigns.filter((c) => c.status === 'concluida').length} concluídas no ano
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-900/30 text-blue-400 border border-blue-800/40">
            <Megaphone className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Próximos Eventos
            </span>
            <p className="text-2xl font-bold text-white mt-1">{upcomingEvents.length}</p>
            <span className="text-[11px] text-slate-500">
              {upcomingEvents.reduce((acc, e) => acc + (e.estimatedAttendees || 0), 0)} participantes esperados
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-900/30 text-amber-400 border border-amber-800/40">
            <PartyPopper className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Orçamento de Campanhas
            </span>
            <p className="text-xl font-bold text-white mt-1">
              R$ {totalBudgetSpent.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </p>
            <span className="text-[11px] text-slate-500">
              de R$ {totalBudgetPlanned.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} alocados
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-900/30 text-emerald-400 border border-emerald-800/40">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Radar de Oportunidades
            </span>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{radar.length}</p>
            <span className="text-[11px] text-slate-500">Próximos 30–60 dias com IA</span>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-900/30 text-cyan-400 border border-cyan-800/40">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Grid: Radar Highlights & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar de Oportunidades Highlights (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Radar de Oportunidades com IA (30–60 dias)
              </h2>
            </div>
            <button
              onClick={() => onNavigateSubSection('marketing-calendario')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center space-x-1 cursor-pointer"
            >
              <span>Ver todas as {radar.length}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {topRadarOpportunities.map((opp) => (
              <div
                key={opp.id}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-slate-700 transition space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-400 font-semibold border border-cyan-800/50">
                        {opp.daysAhead > 0 ? `Em ${opp.daysAhead} dias` : opp.daysAhead === 0 ? 'Hoje' : 'Em andamento'}
                      </span>
                      <span className="text-xs text-slate-400">· {opp.dateReference}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">
                        {opp.scope === 'misto' ? 'Interno & Externo' : opp.scope}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-white">{opp.theme}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{opp.justification}</p>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold whitespace-nowrap ${
                      opp.priority === 'alta'
                        ? 'bg-rose-950/70 text-rose-300 border border-rose-800/40'
                        : 'bg-amber-950/70 text-amber-300 border border-amber-800/40'
                    }`}
                  >
                    Prioridade {opp.priority}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-300 space-y-1">
                  <span className="font-semibold text-blue-400 text-[11px] block">Ação Recomendada pela IA:</span>
                  <p>{opp.proposedAction}</p>
                  <div className="pt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                    <span className="text-slate-500">Canais:</span>
                    {opp.recommendedChannels.map((c) => (
                      <span key={c} className="text-slate-300">
                        #{c}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-800/60">
                  <button
                    onClick={() => onConvertOpportunity(opp, 'campaign')}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition cursor-pointer"
                  >
                    + Criar Campanha
                  </button>
                  <button
                    onClick={() => onConvertOpportunity(opp, 'event')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium transition cursor-pointer"
                  >
                    + Planejar Evento
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links & Active Campaigns Sidebar (1 col) */}
        <div className="space-y-6">
          {/* Quick Access Grid */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Acesso Rápido aos Módulos
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onNavigateSubSection('marketing-campanhas')}
                className="p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left transition border border-slate-700/50 cursor-pointer space-y-1"
              >
                <Megaphone className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-slate-200 block">Campanhas</span>
                <span className="text-[10px] text-slate-500 block">Gestão e tarefas</span>
              </button>
              <button
                onClick={() => onNavigateSubSection('marketing-eventos')}
                className="p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left transition border border-slate-700/50 cursor-pointer space-y-1"
              >
                <PartyPopper className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-slate-200 block">Eventos</span>
                <span className="text-[10px] text-slate-500 block">SIPAT e encontros</span>
              </button>
              <button
                onClick={() => onNavigateSubSection('marketing-estudio')}
                className="p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left transition border border-slate-700/50 cursor-pointer space-y-1"
              >
                <Palette className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-slate-200 block">Estúdio Criativo</span>
                <span className="text-[10px] text-slate-500 block">Formatos e IA</span>
              </button>
              <button
                onClick={() => onNavigateSubSection('marketing-desempenho')}
                className="p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left transition border border-slate-700/50 cursor-pointer space-y-1"
              >
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-slate-200 block">Desempenho</span>
                <span className="text-[10px] text-slate-500 block">Tráfego e redes</span>
              </button>
            </div>
          </div>

          {/* Active Campaigns List */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Campanhas em Andamento
              </h3>
              <button
                onClick={() => onNavigateSubSection('marketing-campanhas')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Ver todas
              </button>
            </div>

            <div className="space-y-2.5">
              {activeCampaigns.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Nenhuma campanha em andamento.</p>
              ) : (
                activeCampaigns.map((camp) => (
                  <div
                    key={camp.id}
                    onClick={() => onNavigateSubSection('marketing-campanhas')}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-400 font-semibold border border-blue-900">
                        {camp.status === 'em_andamento' ? 'Em andamento' : 'Planejamento'}
                      </span>
                      <span className="text-[11px] text-slate-500">Até {camp.endDate}</span>
                    </div>
                    <h4 className="text-xs font-semibold text-white line-clamp-1">{camp.name}</h4>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{camp.objective}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                      <span>{camp.tasks.filter((t) => t.completed).length}/{camp.tasks.length} tarefas</span>
                      <span>R$ {camp.estimatedBudget}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
