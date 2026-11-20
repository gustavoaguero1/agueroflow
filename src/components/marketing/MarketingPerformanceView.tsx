import React, { useState } from 'react';
import {
  TrendingUp,
  Globe,
  Share2,
  DollarSign,
  Sparkles,
  Link2,
  Copy,
  Check,
  MousePointer,
  Users,
  Target,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import { MarketingAnalyticsOverview } from '../../types/marketing';
import { MarketingService } from '../../services/marketingService';

export const MarketingPerformanceView: React.FC = () => {
  const [analytics, setAnalytics] = useState<MarketingAnalyticsOverview>(() =>
    MarketingService.getAnalyticsOverview()
  );

  // UTM Link Builder State
  const [utmUrl, setUtmUrl] = useState('https://agueroinox.com.br/orcamento');
  const [utmSource, setUtmSource] = useState('linkedin');
  const [utmMedium, setUtmMedium] = useState('social_post');
  const [utmCampaign, setUtmCampaign] = useState('tubulacoes_sanitarias_abril');
  const [copiedUtm, setCopiedUtm] = useState(false);

  const fullUtmLink = `${utmUrl}?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}`;

  const handleCopyUtm = () => {
    navigator.clipboard.writeText(fullUtmLink);
    setCopiedUtm(true);
    setTimeout(() => setCopiedUtm(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <span>Desempenho, Tráfego & Inteligência de Marketing</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Métricas consolidadas de redes sociais, tráfego do website (GA4), campanhas pagas (Ads) e gerador de links rastreados com UTM.
        </p>
      </div>

      {/* Main KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Alcance Total (30d)
            </span>
            <p className="text-2xl font-bold text-white mt-1">
              {analytics.socialMedia.reachTotal.toLocaleString('pt-BR')}
            </p>
            <span className="text-[11px] text-emerald-400">
              +{analytics.socialMedia.followersGrowthPercent}% novos seguidores
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-900/30 text-blue-400 border border-blue-800/40">
            <Share2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Sessões no Site (GA4)
            </span>
            <p className="text-2xl font-bold text-white mt-1">
              {analytics.website.totalSessions.toLocaleString('pt-BR')}
            </p>
            <span className="text-[11px] text-slate-500">
              {analytics.website.uniqueUsers.toLocaleString('pt-BR')} usuários únicos
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-900/30 text-cyan-400 border border-cyan-800/40">
            <Globe className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Leads Comerciais Gerados
            </span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {analytics.website.contactLeadsSubmitted + analytics.paidTraffic.leadsGenerated}
            </p>
            <span className="text-[11px] text-slate-500">
              Orçamentos e cotações qualificadas
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-900/30 text-emerald-400 border border-emerald-800/40">
            <Target className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Custo por Lead (Ads)
            </span>
            <p className="text-2xl font-bold text-white mt-1">
              R$ {analytics.paidTraffic.costPerLead.toFixed(2)}
            </p>
            <span className="text-[11px] text-slate-500">
              CTR médio: {analytics.paidTraffic.ctrPercent}%
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-purple-900/30 text-purple-400 border border-purple-800/40">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2 Columns: Top Posts & Traffic Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Social Posts */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 text-xs shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Share2 className="w-4 h-4 text-blue-400" />
              <span>Publicações com Maior Engajamento</span>
            </h3>
            <span className="text-slate-500">Últimos 30 dias</span>
          </div>

          <div className="space-y-2.5">
            {analytics.socialMedia.topPosts.map((post) => (
              <div
                key={post.id}
                className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-400 font-semibold border border-blue-900 uppercase">
                    {post.platform}
                  </span>
                  <span className="text-[10px] text-slate-500">{post.date}</span>
                </div>
                <h4 className="font-semibold text-white">{post.title}</h4>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                  <span>Alcance: <strong className="text-slate-200">{post.reach.toLocaleString('pt-BR')}</strong></span>
                  <span>Interações: <strong className="text-emerald-400">{post.interactions}</strong></span>
                  <span className="text-slate-500">{post.format}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Website Traffic Sources (GA4) */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 text-xs shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Origem do Tráfego no Site (GA4)</span>
            </h3>
            <span className="text-slate-500">
              Taxa de Rejeição: {analytics.website.bounceRatePercent}%
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {analytics.website.trafficSources.map((ts, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-medium">{ts.source}</span>
                  <span className="text-slate-400 font-mono">
                    {ts.sessions.toLocaleString('pt-BR')} ({ts.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${ts.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Intelligence Diagnosis Box */}
      <div className="p-5 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 space-y-3 shadow-lg">
        <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Diagnóstico de Inteligência de Marketing com IA</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {analytics.aiInsights.map((insight, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-300 leading-relaxed space-y-1"
            >
              <span className="text-[10px] font-mono text-cyan-400 font-semibold block">
                Insight #{idx + 1}
              </span>
              <p>{insight}</p>
            </div>
          ))}
        </div>
      </div>

      {/* UTM Link Builder Section */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 text-xs shadow-lg">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
          <Link2 className="w-4 h-4 text-blue-400" />
          <span>Gerador de Links Rastreados (Parâmetros UTM)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-slate-400 mb-1">URL de Destino</label>
            <input
              type="text"
              value={utmUrl}
              onChange={(e) => setUtmUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Origem (utm_source)</label>
            <input
              type="text"
              value={utmSource}
              onChange={(e) => setUtmSource(e.target.value)}
              placeholder="Ex: linkedin, whatsapp, instagram"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Mídia (utm_medium)</label>
            <input
              type="text"
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
              placeholder="Ex: social_post, banner, cpc"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-slate-400 mb-1">Nome da Campanha (utm_campaign)</label>
            <input
              type="text"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="Ex: tubulacoes_sanitarias_abril, sipat2026"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Resulting UTM URL Box */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="font-mono text-cyan-300 text-[11px] break-all select-all">
            {fullUtmLink}
          </span>
          <button
            onClick={handleCopyUtm}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition inline-flex items-center space-x-1 shrink-0 cursor-pointer shadow"
          >
            {copiedUtm ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Link Rastreado</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
