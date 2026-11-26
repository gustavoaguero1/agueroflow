import React, { useState, useEffect, useCallback } from 'react';
import {
  Bus,
  Plane,
  Search,
  History,
  Briefcase,
  Settings,
  LayoutDashboard,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Plus,
  RefreshCw,
  ExternalLink,
  Building,
  CheckCircle2,
  MessageSquare,
  TrendingDown,
} from 'lucide-react';
import {
  TravelSubSection,
  TravelSearchCriteria,
  TravelOffer,
  TravelSourceConfig,
  TravelSearchRecord,
  TravelRequest,
  TravelConsolidatedTrip,
  TravelVerificationMetrics,
} from '../types/travel';
import {
  executeMultiSourceTravelSearch,
  saveTravelSearchRecord,
  getTravelSearchHistory,
  saveTravelRequest,
  getTravelRequests,
  updateTravelRequestStatus,
  DEFAULT_TRAVEL_SOURCES_CONFIG,
} from '../services/travelService';
import { TravelSearchForm } from '../components/travel/TravelSearchForm';
import { TravelComparisonResults } from '../components/travel/TravelComparisonResults';
import { TravelHistoryView } from '../components/travel/TravelHistoryView';
import { TravelRequestsManager } from '../components/travel/TravelRequestsManager';
import { TravelSettingsView } from '../components/travel/TravelSettingsView';
import { TravelMissionComposerModal } from '../components/travel/TravelMissionComposerModal';
import { ReceiptReimbursementsView } from '../components/travel/ReceiptReimbursementsView';
import { MultimodalBreakEvenModal } from '../components/travel/MultimodalBreakEvenModal';
import { MarTravelPanel } from '../components/travel/MarTravelPanel';
import { buildTravelSources, readLegacyEnabled, visibleTravelTabs, travelTabOrFallback } from '../services/marTravel';
import { apiFetch } from '../apiAuthFetch';
import { useAuth } from '../contexts/AuthContext';

interface TravelModuleProps {
  currentSubSection: TravelSubSection;
  onNavigateSubSection: (sub: TravelSubSection) => void;
  currentOrgId?: string;
  currentUserName?: string;
}

export const TravelModule: React.FC<TravelModuleProps> = ({
  currentSubSection = 'viagens-painel',
  onNavigateSubSection,
  currentOrgId = '',
  currentUserName = 'Gestor de Viagens',
}) => {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const canManageSources = role === 'Admin' || role === 'Gerente';

  // Mar Travel é o canal oficial; as buscas antigas (homologações) ficam desligadas até um Admin ou Gerente religar.
  const [legacyEnabled, setLegacyEnabled] = useState(false);
  const [activeTabRaw, setActiveTab] = useState<TravelSubSection>(currentSubSection);
  const activeTab = travelTabOrFallback(activeTabRaw, legacyEnabled) as TravelSubSection;
  const [loading, setLoading] = useState(false);
  const [sourceOverrides, setSourceOverrides] = useState<Record<string, boolean>>({});
  const sources: TravelSourceConfig[] = buildTravelSources(DEFAULT_TRAVEL_SOURCES_CONFIG, legacyEnabled).map((s) =>
    legacyEnabled && s.id in sourceOverrides ? { ...s, active: sourceOverrides[s.id] } : s,
  );

  useEffect(() => {
    if (!currentOrgId) return;
    apiFetch(`/api/travel/settings?orgId=${encodeURIComponent(currentOrgId)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => setLegacyEnabled(readLegacyEnabled(j)))
      .catch(() => setLegacyEnabled(false));
  }, [currentOrgId]);

  const saveLegacyEnabled = async (v: boolean) => {
    const r = await apiFetch('/api/travel/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId: currentOrgId, legacySourcesEnabled: v }),
    });
    if (r.ok) { setLegacyEnabled(v); showToast(v ? 'Buscas antigas religadas.' : 'Buscas antigas desligadas. A Mar Travel segue como canal oficial.'); }
    else showToast('Só Admin ou Gerente podem mudar essa opção.');
  };

  // Search and Results States
  const [currentCriteria, setCurrentCriteria] = useState<TravelSearchCriteria | null>(null);
  const [offers, setOffers] = useState<TravelOffer[]>([]);
  const [sourcesQueried, setSourcesQueried] = useState<string[]>([]);
  const [sourcesUnavailable, setSourcesUnavailable] = useState<string[]>([]);
  const [consolidatedTrips, setConsolidatedTrips] = useState<TravelConsolidatedTrip[]>([]);
  const [verificationMetrics, setVerificationMetrics] = useState<TravelVerificationMetrics | undefined>(undefined);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [lastSavedSearchId, setLastSavedSearchId] = useState<string | null>(null);

  // History and Corporate Requests
  const [searchHistory, setSearchHistory] = useState<TravelSearchRecord[]>([]);
  const [travelRequests, setTravelRequests] = useState<TravelRequest[]>([]);
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false);
  const [isBreakEvenModalOpen, setIsBreakEvenModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync prop changes
  useEffect(() => {
    if (currentSubSection && currentSubSection !== activeTabRaw) {
      setActiveTab(currentSubSection);
    }
  }, [currentSubSection]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load history and corporate travel requests
  const loadInitialData = useCallback(async () => {
    try {
      const [history, reqs] = await Promise.all([
        getTravelSearchHistory(currentOrgId),
        getTravelRequests(currentOrgId),
      ]);
      setSearchHistory(history);
      setTravelRequests(reqs);
    } catch (err) {
      console.warn('Erro ao carregar dados iniciais de viagens:', err);
    }
  }, [currentOrgId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleTabChange = (tab: TravelSubSection) => {
    setActiveTab(tab);
    if (onNavigateSubSection) {
      onNavigateSubSection(tab);
    }
  };

  // Execute Search
  const handleExecuteSearch = async (criteria: TravelSearchCriteria) => {
    if (!legacyEnabled) {
      showToast('A compra oficial é pela Mar Travel: use "Abrir Mar Travel" no Painel.');
      handleTabChange('viagens-painel');
      return;
    }
    setLoading(true);
    setCurrentCriteria(criteria);

    try {
      const res = await executeMultiSourceTravelSearch(criteria, sources);
      setOffers(res.offers);
      setSourcesQueried(res.sourcesQueried);
      setSourcesUnavailable(res.sourcesUnavailable);
      setConsolidatedTrips(res.consolidatedTrips);
      setVerificationMetrics(res.verificationMetrics);
      handleTabChange('viagens-resultados');
    } catch (err: any) {
      showToast(`Erro na consulta: ${err?.message || 'Falha ao buscar ofertas.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Save current search to history
  const handleSaveCurrentSearch = async () => {
    if (!currentCriteria || offers.length === 0) return;
    setIsSavingSearch(true);

    try {
      const best = offers[0];
      const record: TravelSearchRecord = {
        id: `search_${Date.now()}`,
        organizationId: currentOrgId,
        userId: user?.uid || 'user_anon',
        userName: currentUserName,
        criteria: currentCriteria,
        sourcesQueried,
        sourcesUnavailable,
        resultsCount: offers.length,
        bestOfferId: best?.id,
        bestOfferSourceName: best?.sourceName,
        bestOfferCarrier: best?.carrierName,
        bestOfferTotalAmount: best?.totalAmount,
        offersSnapshot: offers,
        queriedAt: new Date().toISOString(),
      };

      await saveTravelSearchRecord(record);
      setSearchHistory((prev) => [record, ...prev]);
      setLastSavedSearchId(record.id);
      showToast('Pesquisa salva com sucesso no histórico corporativo!');
    } catch (err: any) {
      showToast('Não foi possível salvar a pesquisa.');
    } finally {
      setIsSavingSearch(false);
    }
  };

  // Reconsult from saved search
  const handleReconsult = async (record: TravelSearchRecord) => {
    if (!legacyEnabled) { handleTabChange('viagens-painel'); return; }
    setLoading(true);
    showToast(`Reconsultando rota ${record.criteria.originCity} ➔ ${record.criteria.destinationCity}...`);

    try {
      const res = await executeMultiSourceTravelSearch(record.criteria, sources);
      setCurrentCriteria(record.criteria);
      setOffers(res.offers);
      setSourcesQueried(res.sourcesQueried);
      setSourcesUnavailable(res.sourcesUnavailable);
      setConsolidatedTrips(res.consolidatedTrips);
      setVerificationMetrics(res.verificationMetrics);

      // Record reconsultation audit log with delta comparison
      const newBest = res.bestOffer;
      const prevBest = record.bestOfferTotalAmount;

      const newRecord: TravelSearchRecord = {
        id: `search_re_${Date.now()}`,
        organizationId: currentOrgId,
        userId: user?.uid || 'user_anon',
        userName: currentUserName,
        criteria: record.criteria,
        sourcesQueried: res.sourcesQueried,
        sourcesUnavailable: res.sourcesUnavailable,
        resultsCount: res.offers.length,
        bestOfferId: newBest?.id,
        bestOfferSourceName: newBest?.sourceName,
        bestOfferCarrier: newBest?.carrierName,
        bestOfferTotalAmount: newBest?.totalAmount,
        offersSnapshot: res.offers,
        queriedAt: new Date().toISOString(),
        previousBestPrice: prevBest,
        reconsultedFromId: record.id,
      };

      await saveTravelSearchRecord(newRecord);
      setSearchHistory((prev) => [newRecord, ...prev]);

      handleTabChange('viagens-resultados');
    } catch (err: any) {
      showToast(`Erro na reconsulta: ${err.message || 'Falha ao reconsultar.'}`);
    } finally {
      setLoading(false);
    }
  };

  // View previously saved snapshot
  const handleViewSavedResults = (record: TravelSearchRecord) => {
    setCurrentCriteria(record.criteria);
    setOffers(record.offersSnapshot || []);
    setSourcesQueried(record.sourcesQueried || ['QueroPassagem']);
    setSourcesUnavailable(record.sourcesUnavailable || []);
    handleTabChange('viagens-resultados');
    showToast(`Exibindo resultados históricos de ${new Date(record.queriedAt).toLocaleDateString('pt-BR')}`);
  };

  // Link offer to corporate travel request
  const handleLinkOfferToRequest = async (offer: TravelOffer) => {
    try {
      const newReq: TravelRequest = {
        id: `req_via_${Date.now()}`,
        organizationId: currentOrgId,
        requestNumber: `VIAG-${Date.now().toString().slice(-5)}`,
        requesterId: user?.uid || 'user_anon',
        requesterName: currentUserName,
        requesterEmail: user?.email || 'gestor@agueroinox.com.br',
        travelerEmployees: [
          {
            name: currentUserName,
            role: 'Colaborador Solicitante',
          },
        ],
        travelReason: currentCriteria?.corporateContext?.travelReason || 'Deslocamento a serviço',
        clientOrDestinationCompany: currentCriteria?.corporateContext?.clientOrDestinationCompany,
        origin: `${offer.originCity} (${offer.originTerminal})`,
        destination: `${offer.destinationCity} (${offer.destinationTerminal})`,
        departureDate: offer.departureDate,
        returnDate: currentCriteria?.returnDate,
        budgetLimit: offer.totalAmount * 1.1,
        selectedOfferId: offer.id,
        selectedOfferSnapshot: offer,
        status: 'pesquisada',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveTravelRequest(newReq);
      setTravelRequests((prev) => [newReq, ...prev]);
      showToast(`Passagem ${offer.carrierName} vinculada à solicitação ${newReq.requestNumber}!`);
      handleTabChange('viagens-solicitacoes');
    } catch (err: any) {
      showToast('Erro ao vincular passagem à solicitação.');
    }
  };

  // Launch search from a corporate request
  const handleLaunchSearchForRequest = (req: TravelRequest) => {
    const today = new Date().toISOString().split('T')[0];
    const depDate = req.departureDate >= today ? req.departureDate : today;

    // Parse origin and destination
    const [origCity] = req.origin.split('(');
    const [destCity] = req.destination.split('(');

    const criteria: TravelSearchCriteria = {
      originCity: origCity?.trim() || req.origin,
      originState: 'SP',
      destinationCity: destCity?.trim() || req.destination,
      destinationState: 'SP',
      departureDate: depDate,
      returnDate: req.returnDate,
      isRoundTrip: Boolean(req.returnDate),
      passengers: { adults: 1, children: 0, seniors: 0 },
      corporateContext: {
        requestId: req.id,
        travelReason: req.travelReason,
        clientOrDestinationCompany: req.clientOrDestinationCompany,
        workProjectId: req.workProjectId,
        workProjectName: req.workProjectName,
        costCenterId: req.costCenterId,
        costCenterName: req.costCenterName,
        budgetLimit: req.budgetLimit,
        travelerNames: req.travelerEmployees?.map((t) => t.name),
      },
    };

    handleExecuteSearch(criteria);
  };

  const tabs: Array<{
    id: TravelSubSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    {
      id: 'viagens-painel',
      label: 'Painel Geral',
      icon: LayoutDashboard,
    },
    {
      id: 'viagens-busca',
      label: 'Nova Busca (Aéreo, Ônibus & Hotéis)',
      icon: Search,
    },
    {
      id: 'viagens-resultados',
      label: 'Comparativo de Ofertas',
      icon: currentCriteria?.transportType === 'hospedagem' ? Building : currentCriteria?.transportType === 'aereo' ? Plane : Bus,
      count: offers.length > 0 ? offers.length : undefined,
    },
    {
      id: 'viagens-historico',
      label: 'Histórico & Reconsulta',
      icon: History,
      count: searchHistory.length > 0 ? searchHistory.length : undefined,
    },
    {
      id: 'viagens-solicitacoes',
      label: 'Solicitações Corporativas',
      icon: Briefcase,
      count: travelRequests.filter((r) => r.status === 'aguardando_aprovacao').length || undefined,
    },
    {
      id: 'viagens-reembolsos',
      label: 'Reembolsos WhatsApp (OCR)',
      icon: MessageSquare,
    },
    {
      id: 'viagens-configuracoes',
      label: 'Fontes & Parceiros',
      icon: Settings,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 border border-cyan-500/50 rounded-2xl shadow-2xl text-cyan-200 text-xs flex items-center space-x-2 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-2 shadow-xl">
        <div className="flex items-center space-x-1 overflow-x-auto pb-1.5">
          {tabs.filter((t) => visibleTravelTabs(tabs.map((x) => x.id), legacyEnabled).includes(t.id)).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition flex-shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-lg shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isActive ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-cyan-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: PAINEL GERAL (DASHBOARD) */}
      {activeTab === 'viagens-painel' && <MarTravelPanel orgId={currentOrgId} />}

      {activeTab === 'viagens-painel' && legacyEnabled && (
        <div className="space-y-6 max-w-5xl mx-auto text-slate-100">
          {/* Hero Banner (buscas antigas, religadas por um Admin ou Gerente) */}
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900/90 to-blue-950/40 border border-cyan-500/30 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Módulo de Viagens & Hospedagem Corporativa
                </span>
                <span className="text-xs text-slate-400">Homologado QueroPassagem, Cias Aéreas, Redes Hoteleiras & FOHB</span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                Pesquisa, Comparação & Gestão de Deslocamentos
              </h1>
              <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                Identifique a melhor oferta aérea, rodoviária e hoteleira entre as fontes consultadas (Booking for Business, Accor, Atlantica, Hotéis.com, LATAM, GOL, Azul, QueroPassagem, ClickBus, Buser) com auditoria regulatória InFOHB, ANAC e ANTT para acomodação de equipes de montagem e transporte de técnicos.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 self-start md:self-auto flex-shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setIsMissionModalOpen(true)}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Missão 3 em 1 (Obra/OS)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBreakEvenModalOpen(true)}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-bold text-xs uppercase tracking-wider transition flex items-center justify-center space-x-1.5"
              >
                <TrendingDown className="w-4 h-4 text-cyan-400" />
                <span>Ponto de Equilíbrio</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('viagens-busca')}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/25 flex items-center justify-center space-x-1.5"
              >
                <Search className="w-4 h-4" />
                <span>Nova Busca</span>
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
              <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Pesquisas Registradas</span>
              <strong className="text-2xl font-bold font-mono text-white">{searchHistory.length}</strong>
              <span className="text-[10px] text-cyan-400 block">Com histórico de deltas</span>
            </div>

            <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
              <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Solicitações Ativas</span>
              <strong className="text-2xl font-bold font-mono text-emerald-400">
                {travelRequests.filter((r) => r.status === 'aprovada' || r.status === 'aguardando_aprovacao').length}
              </strong>
              <span className="text-[10px] text-slate-400 block">Aprovadas ou em análise</span>
            </div>

            <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
              <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Fontes Homologadas</span>
              <strong className="text-2xl font-bold font-mono text-cyan-300">
                {sources.filter((s) => s.active).length}
              </strong>
              <span className="text-[10px] text-slate-400 block">LATAM, GOL, Azul, QP, ClickBus...</span>
            </div>

            <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
              <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Segurança & Governança</span>
              <strong className="text-sm font-bold text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> 100% Protegido
              </strong>
              <span className="text-[10px] text-slate-400 block">Sem compras ou cartões</span>
            </div>
          </div>

          {/* Recent Searches Quick Table */}
          <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                Pesquisas Recentes na Organização
              </h3>
              <button
                type="button"
                onClick={() => handleTabChange('viagens-historico')}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Ver Histórico Completo ➔
              </button>
            </div>

            {searchHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhuma pesquisa recente registrada. Inicie uma nova busca para cotar passagens rodoviárias.
              </p>
            ) : (
              <div className="space-y-2.5">
                {searchHistory.slice(0, 4).map((record) => (
                  <div
                    key={record.id}
                    className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                  >
                    <div>
                      <strong className="text-white block font-semibold">
                        {record.criteria.originCity} ({record.criteria.originState}) ➔ {record.criteria.destinationCity} ({record.criteria.destinationState})
                      </strong>
                      <span className="text-[11px] text-slate-400">
                        Ida: {record.criteria.departureDate.split('-').reverse().join('/')} • Por: {record.userName}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Melhor Tarifa</span>
                        <strong className="text-emerald-400 font-mono font-bold">
                          R$ {record.bestOfferTotalAmount?.toFixed(2).replace('.', ',') || '0,00'}
                        </strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReconsult(record)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-semibold text-xs"
                      >
                        Reconsultar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NOVA BUSCA */}
      {activeTab === 'viagens-busca' && (
        <TravelSearchForm
          onSearch={handleExecuteSearch}
          isLoading={loading}
          initialCriteria={currentCriteria || undefined}
        />
      )}

      {/* TAB 3: RESULTADOS E COMPARATIVO */}
      {activeTab === 'viagens-resultados' && (
        <>
          {currentCriteria ? (
            <TravelComparisonResults
              offers={offers}
              criteria={currentCriteria}
              sourcesQueried={sourcesQueried}
              sourcesUnavailable={sourcesUnavailable}
              onSaveSearch={handleSaveCurrentSearch}
              onLinkToRequest={handleLinkOfferToRequest}
              isSavingSearch={isSavingSearch}
              consolidatedTrips={consolidatedTrips}
              verificationMetrics={verificationMetrics}
              sourceLinks={sources
                .filter((source) => sourcesUnavailable.includes(source.name) && !!source.officialDocumentationUrl)
                .map((source) => ({ sourceName: source.name, url: source.officialDocumentationUrl as string }))}
            />
          ) : (
            <div className="max-w-md mx-auto p-8 bg-[#111827] border border-slate-800 rounded-2xl text-center space-y-3">
              <Bus className="w-8 h-8 text-cyan-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhuma busca ativa</h4>
              <p className="text-xs text-slate-400">
                Preencha o formulário de busca rodoviária para comparar os preços entre as fontes consultadas.
              </p>
              <button
                type="button"
                onClick={() => handleTabChange('viagens-busca')}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl"
              >
                Ir para Nova Busca
              </button>
            </div>
          )}
        </>
      )}

      {/* TAB 4: HISTÓRICO & RECONSULTA */}
      {activeTab === 'viagens-historico' && (
        <TravelHistoryView
          records={searchHistory}
          onReconsult={handleReconsult}
          onViewSavedResults={handleViewSavedResults}
          isReconsulting={loading}
        />
      )}

      {/* TAB 5: SOLICITAÇÕES CORPORATIVAS */}
      {activeTab === 'viagens-solicitacoes' && (
        <TravelRequestsManager
          requests={travelRequests}
          currentOrgId={currentOrgId}
          currentUser={{
            id: user?.uid || 'user_1',
            name: currentUserName,
            email: user?.email || '',
            role,
          }}
          onSaveRequest={async (req) => {
            await saveTravelRequest(req);
            setTravelRequests((prev) => [req, ...prev]);
            showToast('Solicitação de viagem cadastrada com sucesso!');
          }}
          onUpdateStatus={async (id, status, notes) => {
            await updateTravelRequestStatus(id, status, currentUserName, notes);
            setTravelRequests((prev) =>
              prev.map((r) => (r.id === id ? { ...r, status, approverName: currentUserName, approvalNotes: notes } : r))
            );
            showToast(`Status da solicitação atualizado para ${status}!`);
          }}
          onLaunchSearchForRequest={handleLaunchSearchForRequest}
          onOpenMissionComposer={() => setIsMissionModalOpen(true)}
        />
      )}

      {/* TAB 6: REEMBOLSOS & CUPONS OCR WHATSAPP */}
      {activeTab === 'viagens-reembolsos' && (
        <ReceiptReimbursementsView
          currentUser={{
            id: user?.uid || 'user_1',
            name: currentUserName,
            email: user?.email || '',
            role,
          }}
        />
      )}

      {/* TAB 7: CONFIGURAÇÕES DE FONTES & PARCEIROS (ADMIN) */}
      {activeTab === 'viagens-configuracoes' && (
        <div className="space-y-4">
          <div className="max-w-5xl mx-auto bg-[#111827] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-slate-100">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Buscas antigas (homologações)</h3>
              <p className="text-xs text-slate-400 max-w-xl">
                QueroPassagem, ClickBus, Buser, companhias aéreas e redes de hotéis. Ficam desligadas: a compra oficial é pela Mar Travel.
                {canManageSources ? '' : ' Só Admin ou Gerente podem religar.'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={legacyEnabled}
                disabled={!canManageSources}
                onChange={(e) => saveLegacyEnabled(e.target.checked)}
              />
              {legacyEnabled ? 'Religadas' : 'Desligadas'}
            </label>
          </div>
          <TravelSettingsView
            sources={sources}
            isAdmin={isAdmin && legacyEnabled}
            onToggleSourceActive={(id, active) => {
              if (id === 'src_martravel') return;
              setSourceOverrides((prev) => ({ ...prev, [id]: active }));
              showToast('Configuração de fonte atualizada!');
            }}
          />
        </div>
      )}

      {/* Mission Composer Modal (Combo 3 em 1) */}
      <TravelMissionComposerModal
        isOpen={isMissionModalOpen}
        onClose={() => setIsMissionModalOpen(false)}
        onSaveMission={async (missionReq) => {
          await saveTravelRequest(missionReq);
          setTravelRequests((prev) => [missionReq, ...prev]);
          showToast(`Missão de Campo ${missionReq.requestNumber} registrada com sucesso!`);
          handleTabChange('viagens-solicitacoes');
        }}
        currentUser={{
          id: user?.uid || 'user_1',
          name: currentUserName,
          email: user?.email || '',
          role,
        }}
        currentOrgId={currentOrgId}
      />

      {/* Multimodal Break-Even Matrix Modal */}
      <MultimodalBreakEvenModal
        isOpen={isBreakEvenModalOpen}
        onClose={() => setIsBreakEvenModalOpen(false)}
      />
    </div>
  );
};
