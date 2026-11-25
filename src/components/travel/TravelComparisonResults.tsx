import React, { useState, useMemo } from 'react';
import {
  Bus,
  Plane,
  Luggage,
  ArrowUpDown,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  Calendar,
  Users,
  Briefcase,
  BookmarkPlus,
  Share2,
  X,
  Building,
  ChevronDown,
  ChevronUp,
  Layers,
  Percent,
  Check,
  Scale,
  Building2,
  SlidersHorizontal,
  Coffee,
  BedDouble,
  Car,
  Wifi,
  FileText,
  Star,
  MapPin,
  Hotel,
} from 'lucide-react';
import {
  TravelOffer,
  TravelSearchCriteria,
  TravelConsolidatedTrip,
  TravelVerificationMetrics,
  TravelProviderPricePoint,
} from '../../types/travel';
import { consolidateAndVerifyTravelOffers } from '../../services/travelService';

interface TravelComparisonResultsProps {
  offers: TravelOffer[];
  criteria: TravelSearchCriteria;
  sourcesQueried: string[];
  sourcesUnavailable: string[];
  onSaveSearch?: () => void;
  onLinkToRequest?: (offer: TravelOffer) => void;
  isSavingSearch?: boolean;
  consolidatedTrips?: TravelConsolidatedTrip[];
  verificationMetrics?: TravelVerificationMetrics;
  sourceLinks?: Array<{ sourceName: string; url: string }>;
}

export const TravelComparisonResults: React.FC<TravelComparisonResultsProps> = ({
  offers,
  criteria,
  sourcesQueried,
  sourcesUnavailable,
  onSaveSearch,
  onLinkToRequest,
  isSavingSearch = false,
  consolidatedTrips: propConsolidatedTrips,
  verificationMetrics: propMetrics,
  sourceLinks = [],
}) => {
  // Main view mode: 'consolidado' (Verification Layer) vs 'detalhado' (Individual Offers)
  const [viewMode, setViewMode] = useState<'consolidado' | 'detalhado'>('consolidado');

  // Filter & Sorting state
  const [sortBy, setSortBy] = useState<'preco' | 'horario' | 'duracao' | 'empresa'>('preco');
  const [selectedSeatClass, setSelectedSeatClass] = useState<string>('todos');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('todos');
  const [selectedReliability, setSelectedReliability] = useState<string>('todos');

  // Accordion state for consolidated trips
  const [expandedTripKeys, setExpandedTripKeys] = useState<Record<string, boolean>>({});

  // Partner Redirect Modal state
  const [redirectOffer, setRedirectOffer] = useState<{
    sourceName: string;
    deepLink: string;
    originCity: string;
    destinationCity: string;
    carrierName: string;
    serviceClass: string;
    departureDate: string;
    departureTime: string;
    totalAmount: number;
    passengerCount: number;
    isLodging?: boolean;
    hotelName?: string;
    nightsCount?: number;
    roomType?: string;
    bedType?: string;
    dailyRate?: number;
    breakfastIncluded?: boolean;
    freeCancellation?: boolean;
    parkingIncluded?: boolean;
    checkInDate?: string;
    checkOutDate?: string;
  } | null>(null);

  // Compute or use passed verification layer
  const { consolidatedTrips, metrics } = useMemo(() => {
    if (propConsolidatedTrips && propMetrics) {
      return {
        consolidatedTrips: propConsolidatedTrips,
        metrics: propMetrics,
      };
    }
    return consolidateAndVerifyTravelOffers(offers, criteria);
  }, [propConsolidatedTrips, propMetrics, offers, criteria]);

  // Toggle trip accordion
  const toggleTripAccordion = (key: string) => {
    setExpandedTripKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Filtered and sorted consolidated trips
  const filteredConsolidatedTrips = useMemo(() => {
    return consolidatedTrips
      .filter((trip) => {
        if (selectedSeatClass !== 'todos' && !trip.serviceClass.toLowerCase().includes(selectedSeatClass.toLowerCase())) {
          return false;
        }
        if (selectedCarrier !== 'todos' && trip.carrierName !== selectedCarrier) {
          return false;
        }
        if (selectedReliability === 'alta_multiprovedor' && trip.reliabilityLevel !== 'alta_multiprovedor') {
          return false;
        }
        if (selectedReliability === 'auditada_antt' && trip.anttStatus !== 'abaixo_teto') {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'preco') return a.bestPrice - b.bestPrice;
        if (sortBy === 'horario') return a.departureTime.localeCompare(b.departureTime);
        if (sortBy === 'duracao') return a.durationMinutes - b.durationMinutes;
        if (sortBy === 'empresa') return a.carrierName.localeCompare(b.carrierName);
        return 0;
      });
  }, [consolidatedTrips, selectedSeatClass, selectedCarrier, selectedReliability, sortBy]);

  // Filtered and sorted individual offers
  const filteredOffers = useMemo(() => {
    return offers
      .filter((o) => {
        if (selectedSeatClass !== 'todos' && !o.serviceClass.toLowerCase().includes(selectedSeatClass.toLowerCase())) {
          return false;
        }
        if (selectedCarrier !== 'todos' && o.carrierName !== selectedCarrier) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'preco') return a.totalAmount - b.totalAmount;
        if (sortBy === 'horario') return a.departureTime.localeCompare(b.departureTime);
        if (sortBy === 'duracao') return a.durationMinutes - b.durationMinutes;
        if (sortBy === 'empresa') return a.carrierName.localeCompare(b.carrierName);
        return 0;
      });
  }, [offers, selectedSeatClass, selectedCarrier, sortBy]);

  const distinctCarriers = Array.from(new Set(offers.map((o) => o.carrierName.replace(/\s*\(.*?\)\s*/g, ''))));
  const bestOffer = filteredOffers.length > 0 ? filteredOffers[0] : null;

  const isLodgingMode = criteria.transportType === 'hospedagem' || offers.some((o) => o.isLodging || o.sourceType === 'hospedagem');
  const isAirMode = criteria.transportType === 'aereo' || offers.some((o) => o.transportType === 'aereo');

  const totalPax = Math.max(
    1,
    (criteria.passengers.adults || 1) + (criteria.passengers.children || 0) + (criteria.passengers.seniors || 0)
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-slate-100">
      {/* Search Header Summary */}
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold mb-1">
              {isLodgingMode ? (
                <>
                  <Building className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300">Hotéis & Hospedagens Corporativas</span>
                </>
              ) : isAirMode ? (
                <>
                  <Plane className="w-4 h-4 text-cyan-400 rotate-45" />
                  <span className="text-cyan-400">Voos Domésticos Disponíveis</span>
                </>
              ) : (
                <>
                  <Bus className="w-4 h-4 text-cyan-400" />
                  <span className="text-cyan-400">Rotas Rodoviárias Disponíveis</span>
                </>
              )}
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">
                {isLodgingMode
                  ? `${criteria.nightsCount || 1} diária(s)`
                  : criteria.isRoundTrip
                  ? 'Ida e Volta'
                  : 'Somente Ida'}
              </span>
              {isAirMode && criteria.directFlightsOnly && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-medium text-[10px]">
                    Voos Diretos Apenas
                  </span>
                </>
              )}
              {isAirMode && criteria.withCheckedBaggage && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium text-[10px]">
                    Com Bagagem 23kg
                  </span>
                </>
              )}
              {isLodgingMode && criteria.breakfastRequired && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium text-[10px]">
                    Café da Manhã Incluso
                  </span>
                </>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              {isLodgingMode ? (
                <span>
                  Hospedagem em {criteria.destinationCity} ({criteria.destinationState})
                  {criteria.destinationTerminal ? ` • ${criteria.destinationTerminal}` : ''}
                </span>
              ) : (
                <>
                  <span>
                    {criteria.originCity} ({criteria.originAirportCode || criteria.originState})
                  </span>
                  <span className="text-cyan-400">➔</span>
                  <span>
                    {criteria.destinationCity} ({criteria.destinationAirportCode || criteria.destinationState})
                  </span>
                </>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1.5">
              {isLodgingMode ? (
                <>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Check-in: <strong className="text-white">{(criteria.checkInDate || criteria.departureDate).split('-').reverse().join('/')}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Check-out: <strong className="text-white">{(criteria.checkOutDate || criteria.returnDate || criteria.departureDate).split('-').reverse().join('/')}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    <strong className="text-white">{criteria.roomsCount || 1} {criteria.roomsCount === 1 ? 'quarto' : 'quartos'}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <strong className="text-white">{totalPax} {totalPax === 1 ? 'hóspede' : 'hóspedes'}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Data de Ida: <strong className="text-white">{criteria.departureDate.split('-').reverse().join('/')}</strong>
                  </span>
                  {criteria.returnDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Retorno: <strong className="text-white">{criteria.returnDate.split('-').reverse().join('/')}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <strong className="text-white">{totalPax} {totalPax === 1 ? 'passageiro' : 'passageiros'}</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2 self-start md:self-auto">
            {onSaveSearch && (
              <button
                type="button"
                onClick={onSaveSearch}
                disabled={isSavingSearch}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold transition shadow-sm"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>{isSavingSearch ? 'Salvando...' : 'Salvar Pesquisa'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Source Health and Coverage Indicator */}
        <div className="flex flex-wrap items-center justify-between pt-3 gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-medium">Fontes consultadas ({sourcesQueried.length}):</span>
            {sourcesQueried.filter((src) => !sourcesUnavailable.includes(src)).map((src) => (
              <span
                key={src}
                className="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700 font-mono text-[11px] flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                {src}
              </span>
            ))}
            {sourcesUnavailable.map((src) => (
              <span
                key={src}
                className="px-2 py-0.5 rounded-full bg-rose-950/40 text-rose-300 border border-rose-800/40 font-mono text-[11px] flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                {src} (sem oferta confirmada)
              </span>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>{offers.length} opções obtidas de {sourcesQueried.length} provedores</span>
          </div>
        </div>
      </div>

      {offers.length === 0 && (
        <div role="status" className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-2">
              <p className="font-semibold">Nenhuma tarifa confirmada foi retornada.</p>
              <p className="text-xs text-amber-200/90">
                Não exibimos preços ou horários estimados como se fossem passagens disponíveis. Consulte os sites oficiais abaixo para verificar estoque, horários e valores atuais.
              </p>
              {sourceLinks.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {sourceLinks.map((source) => (
                    <a
                      key={source.sourceName}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                    >
                      Consultar {source.sourceName}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Best Offer Highlight Banner */}
      {bestOffer && (
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-cyan-950/40 border border-emerald-500/40 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Melhor Oferta Entre as Fontes Consultadas
                </span>
                <span className="text-xs text-slate-400 font-medium font-sans">
                  Via {bestOffer.sourceName}
                </span>
                {bestOffer.isLodging && bestOffer.stars && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-bold">
                    {Array.from({ length: bestOffer.stars }).map((_, i) => (
                      <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    ))}
                    <span className="ml-1 text-slate-300">{bestOffer.stars}★</span>
                  </span>
                )}
                {bestOffer.flightNumber && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                    Voo {bestOffer.flightNumber} {bestOffer.aircraftModel ? `• ${bestOffer.aircraftModel}` : ''}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                {bestOffer.isLodging ? (
                  <Building2 className="w-4 h-4 text-amber-400 inline" />
                ) : isAirMode ? (
                  <Plane className="w-4 h-4 text-cyan-400 rotate-45 inline" />
                ) : null}
                <span>
                  {bestOffer.hotelName || bestOffer.carrierName} • {bestOffer.serviceClass}
                  {bestOffer.isLodging ? '' : ` (${bestOffer.departureTime} ➔ ${bestOffer.arrivalTime})`}
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                {bestOffer.isLodging ? (
                  <>
                    {bestOffer.neighborhood || bestOffer.destinationTerminal || criteria.destinationCity}
                    {bestOffer.bedType ? ` • ${bestOffer.bedType}` : ''}
                    {bestOffer.breakfastIncluded && (
                      <span className="text-emerald-400 ml-2 font-medium">
                        • Café da manhã incluso
                      </span>
                    )}
                    {bestOffer.parkingIncluded && (
                      <span className="text-cyan-400 ml-2 font-medium">
                        • Estacionamento p/ van
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {bestOffer.originTerminal} para {bestOffer.destinationTerminal} • Duração: {bestOffer.durationFormatted}
                    {bestOffer.cabinBaggageIncluded && (
                      <span className="text-emerald-400 ml-2 font-medium">
                        • Inclui Mala de Bordo (10kg) {bestOffer.checkedBaggageIncluded ? '+ Bagagem Despachada (23kg)' : ''}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end space-x-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                {bestOffer.isLodging ? `Valor Total (${bestOffer.nightsCount || criteria.nightsCount || 1} diária(s))` : `Preço Total (${totalPax} pax)`}
              </span>
              <strong className="text-2xl font-mono font-bold text-emerald-400">
                R$ {bestOffer.totalAmount.toFixed(2).replace('.', ',')}
              </strong>
              {bestOffer.priceStatus === 'estimado' && (
                <span className="text-[10px] text-amber-400 block font-semibold">Estimativa (não é cotação)</span>
              )}
              <span className="text-[10px] text-slate-400 block">
                {bestOffer.isLodging
                  ? `(R$ ${(bestOffer.dailyRate || (bestOffer.totalAmount / (bestOffer.nightsCount || 1))).toFixed(2).replace('.', ',')} / diária)`
                  : `(R$ ${bestOffer.baseFarePerPassenger.toFixed(2).replace('.', ',')} / passageiro + taxas)`}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setRedirectOffer({
                  sourceName: bestOffer.sourceName,
                  deepLink: bestOffer.deepLink,
                  originCity: bestOffer.originCity,
                  destinationCity: bestOffer.destinationCity,
                  carrierName: bestOffer.hotelName || bestOffer.carrierName,
                  serviceClass: bestOffer.serviceClass,
                  departureDate: bestOffer.departureDate,
                  departureTime: bestOffer.departureTime,
                  totalAmount: bestOffer.totalAmount,
                  passengerCount: bestOffer.passengerCount,
                  isLodging: bestOffer.isLodging,
                  hotelName: bestOffer.hotelName,
                  nightsCount: bestOffer.nightsCount || criteria.nightsCount || 1,
                  roomType: bestOffer.serviceClass,
                  bedType: bestOffer.bedType,
                  dailyRate: bestOffer.dailyRate,
                  breakfastIncluded: bestOffer.breakfastIncluded,
                  freeCancellation: bestOffer.freeCancellation,
                  parkingIncluded: bestOffer.parkingIncluded,
                  checkInDate: criteria.checkInDate || criteria.departureDate,
                  checkOutDate: criteria.checkOutDate || criteria.returnDate,
                })
              }
              className={`px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition flex items-center space-x-1.5 flex-shrink-0 ${
                bestOffer.isLodging
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              <span>Verificar na {bestOffer.sourceName}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* VERIFICATION LAYER KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-cyan-500/30 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Fontes Integradas</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <strong className="text-2xl font-bold font-mono text-cyan-300">{sourcesQueried.length}</strong>
          <span className="text-[10px] text-slate-500 block">
            {isLodgingMode ? 'Booking, Accor, Atlantica & FOHB' : isAirMode ? 'Cias Aéreas, Google & ANAC' : 'Provedores e ANTT auditados'}
          </span>
        </div>

        <div className="bg-[#111827] border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isLodgingMode ? 'Confirmados Multi-Canal' : 'Confirmados em 2+ Fontes'}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <strong className="text-2xl font-bold font-mono text-emerald-400">{metrics.multiSourceConfirmedCount}</strong>
          <span className="text-[10px] text-slate-500 block">
            {isLodgingMode ? 'Mesmo hotel em 2+ portais' : 'Alta confiabilidade de dados'}
          </span>
        </div>

        <div className="bg-[#111827] border border-blue-500/30 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isLodgingMode ? 'Auditados pelo InFOHB' : isAirMode ? 'Auditados pela ANAC' : 'Auditados pela ANTT'}
            </span>
            <Scale className="w-4 h-4 text-blue-400" />
          </div>
          <strong className="text-2xl font-bold font-mono text-blue-300">
            {isLodgingMode ? (metrics.fohbAuditedCount || consolidatedTrips.length) : isAirMode ? (metrics.anacAuditedCount || consolidatedTrips.length) : metrics.anttAuditedCount}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            {isLodgingMode ? 'Referência média de diária corporativa' : isAirMode ? 'Microdados tarifários homologados' : 'Abaixo do teto regulamentado'}
          </span>
        </div>

        <div className="bg-[#111827] border border-amber-500/30 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {isLodgingMode ? 'Economia Entre Redes' : isAirMode ? 'Economia Entre Cias' : 'Maior Economia Entre Fontes'}
            </span>
            <Percent className="w-4 h-4 text-amber-400" />
          </div>
          <strong className="text-2xl font-bold font-mono text-amber-300">
            R$ {metrics.maxIdentifiedSavings.toFixed(2).replace('.', ',')}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            {isLodgingMode ? 'No mesmo hotel e quarto' : isAirMode ? 'No mesmo horário e rota' : 'No mesmo horário e ônibus'}
          </span>
        </div>
      </div>

      {/* VIEW MODE TOGGLE & TOOLBAR */}
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          {/* Main View Mode Selector */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('consolidado')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                viewMode === 'consolidado'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Itinerários Consolidados & Verificação ({consolidatedTrips.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('detalhado')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                viewMode === 'detalhado'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAirMode ? <Plane className="w-3.5 h-3.5 rotate-45" /> : <Bus className="w-3.5 h-3.5" />}
              <span>Todas as Cotações Individuais ({offers.length})</span>
            </button>
          </div>

          {/* Quick Reliability Filter (for consolidated view) */}
          {viewMode === 'consolidado' && (
            <div className="flex items-center space-x-1.5 overflow-x-auto text-[11px]">
              <span className="text-slate-500 font-medium flex-shrink-0">Filtro de Auditoria:</span>
              <button
                type="button"
                onClick={() => setSelectedReliability('todos')}
                className={`px-2.5 py-1 rounded-lg transition flex-shrink-0 ${
                  selectedReliability === 'todos'
                    ? 'bg-slate-700 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Todos ({consolidatedTrips.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedReliability('alta_multiprovedor')}
                className={`px-2.5 py-1 rounded-lg transition flex-shrink-0 flex items-center gap-1 ${
                  selectedReliability === 'alta_multiprovedor'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-emerald-300'
                }`}
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Confirmados em 2+ Fontes ({metrics.multiSourceConfirmedCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedReliability('auditada_antt')}
                className={`px-2.5 py-1 rounded-lg transition flex-shrink-0 flex items-center gap-1 ${
                  selectedReliability === 'auditada_antt'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-blue-300'
                }`}
              >
                <Scale className="w-3 h-3 text-blue-400" />
                {isAirMode ? 'Homologados ANAC' : 'Auditados ANTT'} ({metrics.anacAuditedCount || metrics.anttAuditedCount})
              </button>
            </div>
          )}
        </div>

        {/* Sorting and Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
              Ordenar por:
            </span>
            <button
              type="button"
              onClick={() => setSortBy('preco')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                sortBy === 'preco'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Menor Preço
            </button>
            <button
              type="button"
              onClick={() => setSortBy('horario')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                sortBy === 'horario'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Horário de Saída
            </button>
            <button
              type="button"
              onClick={() => setSortBy('duracao')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                sortBy === 'duracao'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Menor Duração
            </button>
          </div>

          {/* Carrier & Class Dropdowns */}
          <div className="flex items-center space-x-2">
            {distinctCarriers.length > 1 && (
              <select
                value={selectedCarrier}
                onChange={(e) => setSelectedCarrier(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="todos">
                  {isLodgingMode ? 'Todas as Redes / Hotéis' : isAirMode ? 'Todas as Cias Aéreas' : 'Todas as Viações'}
                </option>
                {distinctCarriers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            <select
              value={selectedSeatClass}
              onChange={(e) => setSelectedSeatClass(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="todos">{isLodgingMode ? 'Todos os Tipos de Quarto' : 'Todas as Classes'}</option>
              {isLodgingMode ? (
                <>
                  <option value="twin">Quarto Twin (2 Camas Solteiro)</option>
                  <option value="standard">Standard Individual</option>
                  <option value="superior">Superior / Executivo</option>
                  <option value="flat">Flat / Studio Longa Estadia</option>
                </>
              ) : isAirMode ? (
                <>
                  <option value="economica">Econômica</option>
                  <option value="premium">Premium Economy</option>
                  <option value="executiva">Executiva / Business</option>
                </>
              ) : (
                <>
                  <option value="convencional">Convencional</option>
                  <option value="executivo">Executivo</option>
                  <option value="semi-leito">Semi-Leito</option>
                  <option value="leito">Leito</option>
                  <option value="cama">Cama / Leito Cama</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* VIEW 1: CONSOLIDATED ITINERARIES & VERIFICATION MATRIX */}
      {/* ----------------------------------------------------------------- */}
      {viewMode === 'consolidado' && (
        <div className="space-y-4">
          {filteredConsolidatedTrips.length === 0 ? (
            <div className="p-8 text-center bg-[#111827] border border-slate-800 rounded-2xl space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhum itinerário consolidado para os filtros selecionados</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tente ajustar os filtros de categoria ou classe de assento para visualizar mais opções.
              </p>
            </div>
          ) : (
            filteredConsolidatedTrips.map((trip) => {
              const isExpanded = Boolean(expandedTripKeys[trip.clusterKey]);

              return (
                <div
                  key={trip.clusterKey}
                  className="bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg transition space-y-4"
                >
                  {trip.isLodging ? (
                    /* DEDICATED HOTEL CARD VIEW */
                    <div className="flex flex-col md:flex-row gap-4">
                      {/* Photo thumbnail */}
                      <div className="relative w-full md:w-56 h-40 md:h-auto rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 border border-slate-700/60">
                        <img
                          src={trip.hotelPhotoUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80'}
                          alt={trip.hotelName || trip.carrierName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';
                          }}
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-700 text-[10px] font-bold text-amber-300 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span>{trip.hotelChain || 'Rede Corporativa'}</span>
                        </div>
                        {trip.stars && (
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-700 text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                            {Array.from({ length: trip.stars }).map((_, i) => (
                              <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            ))}
                            <span className="ml-1 text-slate-300">{trip.stars} estrelas</span>
                          </div>
                        )}
                      </div>

                      {/* Hotel Information */}
                      <div className="flex-1 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-white text-base">
                                {trip.hotelName || trip.carrierName}
                              </h3>
                              {trip.reviewScore && (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                  ★ {trip.reviewScore.toFixed(1)} / 10
                                  {trip.reviewCount ? (
                                    <span className="text-slate-400 font-normal">({trip.reviewCount})</span>
                                  ) : null}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border ${
                                  trip.reliabilityLevel === 'alta_multiprovedor'
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                    : 'bg-amber-950/60 text-amber-300 border-amber-800'
                                }`}
                              >
                                <ShieldCheck className="w-3 h-3" />
                                {trip.reliabilityBadge}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                              <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <span className="text-slate-300">{trip.neighborhood || trip.destinationTerminal || criteria.destinationCity}</span>
                              {trip.distanceToCenter && (
                                <span className="text-slate-400">• {trip.distanceToCenter} km do polo industrial</span>
                              )}
                            </div>
                          </div>

                          {/* Pricing Block */}
                          <div className="text-left sm:text-right flex-shrink-0">
                            <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                              Melhor Oferta ({trip.bestProvider.sourceName})
                            </span>
                            <div className="flex items-baseline sm:justify-end gap-1.5">
                              <span className="text-xs text-slate-400">R$ {trip.dailyRate || Math.round(trip.bestPrice / (trip.nightsCount || 1))}/noite</span>
                              <strong className="text-2xl font-mono font-bold text-emerald-400">
                                R$ {trip.bestPrice.toFixed(2).replace('.', ',')}
                              </strong>
                            </div>
                            <span className="text-[10px] text-slate-400 block">
                              Total para {trip.nightsCount || criteria.nightsCount || 1} diária(s) ({criteria.roomsCount || 1} quarto)
                            </span>
                            {trip.priceDelta > 0 && (
                              <span className="text-[10px] text-emerald-300 font-medium block">
                                Economia de R$ {trip.priceDelta.toFixed(2).replace('.', ',')} ({trip.savingsPercentage}%) vs outros canais
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Room and Amenities */}
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-white flex items-center gap-1">
                              <BedDouble className="w-3.5 h-3.5 text-amber-400" />
                              {trip.serviceClass || 'Quarto Corporativo'}
                            </span>
                            {trip.bedType && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {trip.bedType}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                            {trip.breakfastIncluded && (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                <Coffee className="w-3 h-3" /> Café da manhã incluso
                              </span>
                            )}
                            {trip.freeCancellation && (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Cancelamento grátis
                              </span>
                            )}
                            {trip.parkingIncluded && (
                              <span className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                                <Car className="w-3 h-3" /> Estacionamento p/ van/veículo
                              </span>
                            )}
                            {trip.wifiIncluded && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                                <Wifi className="w-3 h-3" /> Wi-Fi Alta Vel.
                              </span>
                            )}
                            {trip.corporateInvoicing && (
                              <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800 flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Faturamento PJ / NF
                              </span>
                            )}
                          </div>
                        </div>

                        {/* FOHB Benchmark comparison badge */}
                        {trip.fohbDiff && trip.fohbDiff > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg">
                            <Scale className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <span>
                              Diária R$ {trip.fohbDiff.toFixed(2).replace('.', ',')} abaixo da tarifa média regulatória InFOHB (Ref: R$ {trip.fohbBenchmarkDailyRate?.toFixed(2).replace('.', ',')})
                            </span>
                          </div>
                        )}

                        {/* Bottom action row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
                          <span className="text-[11px] text-slate-400">
                            {trip.reliabilityDescription}
                          </span>

                          <div className="flex items-center space-x-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => toggleTripAccordion(trip.clusterKey)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-slate-700 font-semibold text-xs transition flex items-center space-x-1.5"
                            >
                              <span>Comparar {trip.providersCount} Canais</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setRedirectOffer({
                                  sourceName: trip.bestProvider.sourceName,
                                  deepLink: trip.bestProvider.deepLink,
                                  originCity: criteria.originCity,
                                  destinationCity: criteria.destinationCity,
                                  carrierName: trip.hotelName || trip.carrierName,
                                  serviceClass: trip.serviceClass,
                                  departureDate: criteria.checkInDate || criteria.departureDate,
                                  departureTime: '14:00 (Check-in)',
                                  totalAmount: trip.bestPrice,
                                  passengerCount: totalPax,
                                  isLodging: true,
                                  hotelName: trip.hotelName,
                                  nightsCount: trip.nightsCount || criteria.nightsCount || 1,
                                  roomType: trip.serviceClass,
                                  bedType: trip.bedType,
                                  dailyRate: trip.dailyRate,
                                  breakfastIncluded: trip.breakfastIncluded,
                                  freeCancellation: trip.freeCancellation,
                                  parkingIncluded: trip.parkingIncluded,
                                  checkInDate: criteria.checkInDate || criteria.departureDate,
                                  checkOutDate: criteria.checkOutDate || criteria.returnDate,
                                })
                              }
                              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center space-x-1.5"
                            >
                              <span>Verificar na {trip.bestProvider.sourceName}</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Top Bar with Carrier, Times and Badges */
                    <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white text-base flex items-center gap-1.5">
                            {trip.isFlight ? (
                              <Plane className="w-4 h-4 text-cyan-400 rotate-45" />
                            ) : (
                              <Bus className="w-4 h-4 text-cyan-400" />
                            )}
                            {trip.carrierName}
                          </span>
                          {trip.flightNumber && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800 font-bold">
                              {trip.flightNumber}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {trip.serviceClass}
                          </span>
                          {trip.aircraftModel && (
                            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                              {trip.aircraftModel}
                            </span>
                          )}
                          {trip.isFlight && (
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                              trip.isDirectFlight
                                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {trip.isDirectFlight ? 'Direto' : `1 Parada (${trip.layoverAirport || 'Conexão'})`}
                            </span>
                          )}

                          {/* Reliability Badge */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border ${
                              trip.reliabilityLevel === 'alta_multiprovedor'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : trip.reliabilityLevel === 'auditada_anac' || trip.reliabilityLevel === 'auditada_antt'
                                ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                                : trip.reliabilityLevel === 'direta_cia_aerea' || trip.reliabilityLevel === 'direta_viacao'
                                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {trip.reliabilityBadge}
                          </span>

                          {trip.anacDiff && trip.anacDiff > 0 && (
                            <span className="text-[10px] text-blue-300 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded font-mono">
                              R$ {trip.anacDiff.toFixed(2).replace('.', ',')} abaixo da média regulatória ANAC
                            </span>
                          )}

                          {trip.anttDiff && trip.anttDiff > 0 && (
                            <span className="text-[10px] text-amber-300 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded font-mono">
                              R$ {trip.anttDiff.toFixed(2).replace('.', ',')} abaixo do teto ANTT
                            </span>
                          )}
                        </div>

                        {/* Itinerary details */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                          <span className="flex items-center gap-1 text-slate-200 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-cyan-400" />
                            {trip.departureTime} ➔ {trip.arrivalTime}
                          </span>
                          <span>•</span>
                          <span>Duração: <strong>{trip.durationFormatted}</strong></span>
                          <span>•</span>
                          <span className="text-slate-400 truncate max-w-xs">
                            {trip.originAirportCode && trip.destinationAirportCode ? (
                              <strong className="text-cyan-300 font-mono mr-1">
                                {trip.originAirportCode} ➔ {trip.destinationAirportCode}
                              </strong>
                            ) : null}
                            {trip.originTerminal} ➔ {trip.destinationTerminal}
                          </span>
                          {trip.isFlight && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                                <Luggage className="w-3 h-3" />
                                Mala Mão 10kg {criteria.withCheckedBaggage ? '+ 23kg Despachada' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Consolidated Pricing and Primary Call to Action */}
                      <div className="flex items-center justify-between md:justify-end space-x-4 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                            Melhor Oferta ({trip.bestProvider.sourceName})
                          </span>
                          <strong className="text-2xl font-mono font-bold text-emerald-400">
                            R$ {trip.bestPrice.toFixed(2).replace('.', ',')}
                          </strong>
                          {trip.priceDelta > 0 && (
                            <span className="text-[10px] text-emerald-300 font-medium block">
                              Economia de R$ {trip.priceDelta.toFixed(2).replace('.', ',')} ({trip.savingsPercentage}%) vs outras fontes
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setRedirectOffer({
                              sourceName: trip.bestProvider.sourceName,
                              deepLink: trip.bestProvider.deepLink,
                              originCity: criteria.originCity,
                              destinationCity: criteria.destinationCity,
                              carrierName: trip.carrierName,
                              serviceClass: trip.serviceClass,
                              departureDate: criteria.departureDate,
                              departureTime: trip.departureTime,
                              totalAmount: trip.bestPrice,
                              passengerCount: totalPax,
                            })
                          }
                          className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center space-x-1.5 flex-shrink-0"
                        >
                          <span>Conferir na {trip.bestProvider.sourceName}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Accordion Toggle for Multi-Provider Price Matrix */}
                  {!trip.isLodging && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[11px] text-slate-400">
                        {trip.reliabilityDescription}
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleTripAccordion(trip.clusterKey)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-slate-700 font-semibold text-xs transition flex items-center space-x-1.5"
                      >
                        <span>Comparar {trip.providersCount} Fontes & Status da Fonte</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {/* MULTI-PROVIDER VERIFICATION BREAKDOWN TABLE */}
                  {isExpanded && (
                    <div className="mt-3 bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden p-3 space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between text-[11px] pb-2 border-b border-slate-800/80">
                        <strong className="text-white flex items-center gap-1.5">
                          <Scale className="w-3.5 h-3.5 text-cyan-400" />
                          Matriz de Cotações por Fornecedor (Mesmo Itinerário)
                        </strong>
                        <span className="text-slate-400">Total calculado para {totalPax} passageiro(s)</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                              <th className="py-2 px-2.5">Provedor / Canal</th>
                              <th className="py-2 px-2.5">Status da Fonte</th>
                              <th className="py-2 px-2.5">{trip.isLodging ? 'Diária Base' : 'Tarifa Base'}</th>
                              <th className="py-2 px-2.5">{trip.isLodging ? 'Taxas / ISS' : 'Taxas Embarque'}</th>
                              <th className="py-2 px-2.5 text-right">Valor Total</th>
                              <th className="py-2 px-2.5 text-right">Conferência</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {trip.providers.map((p, idx) => {
                              const isWinning = p.totalAmount === trip.bestPrice;

                              return (
                                <tr
                                  key={`${p.sourceId}-${idx}`}
                                  className={`transition hover:bg-slate-900/60 ${
                                    isWinning ? 'bg-emerald-950/20' : ''
                                  }`}
                                >
                                  {/* Provider Name */}
                                  <td className="py-2.5 px-2.5 font-sans font-semibold text-white flex items-center gap-1.5">
                                    {p.sourceName}
                                    {isWinning && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                        Melhor Oferta
                                      </span>
                                    )}
                                  </td>

                                  {/* Source Status Badge */}
                                  <td className="py-2.5 px-2.5 font-sans">
                                    <span
                                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                                        p.sourceStatus === 'oficial_parceiro' || p.sourceStatus === 'direta_hotel'
                                          ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800'
                                          : p.sourceStatus === 'auditado_antt' || p.sourceStatus === 'auditado_fohb'
                                          ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                                          : p.sourceStatus === 'direta_viacao' || p.sourceStatus === 'direta_cia_aerea'
                                          ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                                          : p.sourceStatus === 'tarifa_fretamento'
                                          ? 'bg-purple-950/60 text-purple-300 border-purple-800'
                                          : 'bg-slate-800 text-slate-300 border-slate-700'
                                      }`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          p.sourceStatus === 'oficial_parceiro' || p.sourceStatus === 'direta_hotel'
                                            ? 'bg-cyan-400'
                                            : p.sourceStatus === 'auditado_antt' || p.sourceStatus === 'auditado_fohb'
                                            ? 'bg-amber-400'
                                            : p.sourceStatus === 'direta_viacao' || p.sourceStatus === 'direta_cia_aerea'
                                            ? 'bg-blue-400'
                                            : 'bg-slate-400'
                                        }`}
                                      />
                                      {p.statusLabel}
                                    </span>
                                  </td>

                                  {/* Base Fare */}
                                  <td className="py-2.5 px-2.5 text-slate-300">
                                    R$ {p.baseFare.toFixed(2).replace('.', ',')}
                                  </td>

                                  {/* Mandatory Taxes */}
                                  <td className="py-2.5 px-2.5 text-slate-400">
                                    R$ {p.taxes.toFixed(2).replace('.', ',')}
                                  </td>

                                  {/* Total Amount */}
                                  <td className="py-2.5 px-2.5 text-right font-bold text-sm">
                                    <span className={isWinning ? 'text-emerald-400 font-bold' : 'text-white'}>
                                      R$ {p.totalAmount.toFixed(2).replace('.', ',')}
                                    </span>
                                  </td>

                                  {/* Action / Deep Link */}
                                  <td className="py-2.5 px-2.5 text-right font-sans">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRedirectOffer({
                                          sourceName: p.sourceName,
                                          deepLink: p.deepLink,
                                          originCity: criteria.originCity,
                                          destinationCity: criteria.destinationCity,
                                          carrierName: trip.isLodging ? (trip.hotelName || trip.carrierName) : p.carrierName,
                                          serviceClass: p.serviceClass,
                                          departureDate: criteria.checkInDate || criteria.departureDate,
                                          departureTime: trip.isLodging ? '14:00 (Check-in)' : trip.departureTime,
                                          totalAmount: p.totalAmount,
                                          passengerCount: totalPax,
                                          isLodging: trip.isLodging,
                                          hotelName: trip.hotelName,
                                          nightsCount: trip.nightsCount || criteria.nightsCount || 1,
                                          roomType: p.serviceClass,
                                          bedType: trip.bedType,
                                          dailyRate: p.baseFare,
                                          checkInDate: criteria.checkInDate || criteria.departureDate,
                                          checkOutDate: criteria.checkOutDate || criteria.returnDate,
                                        })
                                      }
                                      className="text-cyan-400 hover:text-cyan-200 text-xs font-semibold flex items-center justify-end gap-1 hover:underline"
                                    >
                                      <span>Conferir</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* VIEW 2: INDIVIDUAL DETAILED OFFERS */}
      {/* ----------------------------------------------------------------- */}
      {viewMode === 'detalhado' && (
        <div className="space-y-3">
          {filteredOffers.length === 0 ? (
            <div className="p-8 text-center bg-[#111827] border border-slate-800 rounded-2xl space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhum horário encontrado para os filtros selecionados</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tente remover os filtros de categoria ou alterar a data da viagem para visualizar outras opções.
              </p>
            </div>
          ) : (
            filteredOffers.map((offer) => {
              const isBest = bestOffer?.id === offer.id;

              return (
                <div
                  key={offer.id}
                  className={`bg-[#111827] border rounded-2xl p-5 transition shadow-lg space-y-4 ${
                    isBest
                      ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-950/20 via-[#111827] to-[#111827]'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white text-base flex items-center gap-1.5">
                        {offer.isLodging ? (
                          <Building2 className="w-4 h-4 text-amber-400" />
                        ) : offer.transportType === 'aereo' ? (
                          <Plane className="w-4 h-4 text-cyan-400 rotate-45" />
                        ) : (
                          <Bus className="w-4 h-4 text-cyan-400" />
                        )}
                        {offer.hotelName || offer.carrierName}
                      </span>
                      {offer.isLodging && offer.stars && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-bold">
                          {Array.from({ length: offer.stars }).map((_, i) => (
                            <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          ))}
                          <span className="ml-1 text-slate-300">{offer.stars}★</span>
                        </span>
                      )}
                      {offer.flightNumber && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800 font-bold">
                          {offer.flightNumber}
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {offer.serviceClass}
                      </span>
                      {offer.aircraftModel && (
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                          {offer.aircraftModel}
                        </span>
                      )}
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800">
                        Fonte: {offer.sourceName}
                      </span>
                      {offer.sourceVerificationStatus && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800/80 text-emerald-300 border border-slate-700">
                          {offer.sourceVerificationStatus}
                        </span>
                      )}
                      {isBest && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Melhor Oferta
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                          {offer.isLodging ? `Valor Total (${offer.nightsCount || criteria.nightsCount || 1} diária(s))` : `Valor Total (${offer.passengerCount} pax)`}
                        </span>
                        <strong className="text-xl font-mono font-bold text-white">
                          R$ {offer.totalAmount.toFixed(2).replace('.', ',')}
                        </strong>
                        {offer.priceStatus === 'estimado' && (
                          <span className="text-[10px] text-amber-400 block font-semibold">Estimativa (não é cotação)</span>
                        )}
                        {offer.isLodging && (
                          <span className="text-[10px] text-slate-400 block">
                            (R$ {(offer.dailyRate || (offer.totalAmount / (offer.nightsCount || 1))).toFixed(2).replace('.', ',')} / diária)
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setRedirectOffer({
                            sourceName: offer.sourceName,
                            deepLink: offer.deepLink,
                            originCity: offer.originCity,
                            destinationCity: offer.destinationCity,
                            carrierName: offer.hotelName || offer.carrierName,
                            serviceClass: offer.serviceClass,
                            departureDate: offer.departureDate,
                            departureTime: offer.departureTime,
                            totalAmount: offer.totalAmount,
                            passengerCount: offer.passengerCount,
                            isLodging: offer.isLodging,
                            hotelName: offer.hotelName,
                            nightsCount: offer.nightsCount || criteria.nightsCount || 1,
                            roomType: offer.serviceClass,
                            bedType: offer.bedType,
                            dailyRate: offer.dailyRate,
                            breakfastIncluded: offer.breakfastIncluded,
                            freeCancellation: offer.freeCancellation,
                            parkingIncluded: offer.parkingIncluded,
                            checkInDate: criteria.checkInDate || criteria.departureDate,
                            checkOutDate: criteria.checkOutDate || criteria.returnDate,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-slate-700 text-xs font-semibold transition flex items-center space-x-1.5"
                      >
                        <span>Conferir na {offer.sourceName}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-3">
                    <div className="flex items-center space-x-4">
                      {offer.isLodging ? (
                        <>
                          <span className="text-slate-200 font-semibold flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-amber-400" />
                            {offer.neighborhood || offer.destinationTerminal || offer.destinationCity}
                          </span>
                          {offer.bedType && (
                            <span>• Cama: <strong className="text-white">{offer.bedType}</strong></span>
                          )}
                          {offer.breakfastIncluded && (
                            <span className="text-emerald-400 font-medium">• Café Incluso</span>
                          )}
                          {offer.parkingIncluded && (
                            <span className="text-cyan-400 font-medium">• Estacionamento p/ Van</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-slate-200 font-semibold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-cyan-400" />
                            {offer.departureTime} ➔ {offer.arrivalTime}
                          </span>
                          <span>Duração: <strong className="text-white">{offer.durationFormatted}</strong></span>
                          <span className="truncate max-w-sm">
                            {offer.originAirportCode && offer.destinationAirportCode ? (
                              <strong className="text-cyan-300 font-mono mr-1">
                                {offer.originAirportCode} ➔ {offer.destinationAirportCode}
                              </strong>
                            ) : null}
                            {offer.originTerminal} ➔ {offer.destinationTerminal}
                          </span>
                        </>
                      )}
                    </div>

                    {onLinkToRequest && (
                      <button
                        type="button"
                        onClick={() => onLinkToRequest(offer)}
                        className="text-xs font-semibold text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition"
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        <span>Vincular à Solicitação</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PARTNER REDIRECT & CONFERRAL MODAL */}
      {redirectOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-cyan-500/40 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm">
                {redirectOffer.isLodging ? (
                  <>
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400">Conferência de Reserva Hoteleira Corporativa</span>
                  </>
                ) : isAirMode ? (
                  <>
                    <Plane className="w-4 h-4 rotate-45 text-cyan-400" />
                    <span>Conferência de Passagem Aérea</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 text-cyan-400" />
                    <span>Conferência de Passagem Rodoviária</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRedirectOffer(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs text-amber-200">
              <div className="flex items-center space-x-2 font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Aviso de Reconfirmação Obrigatório</span>
              </div>
              <p className="leading-relaxed text-[11px] text-amber-200/90">
                O <strong>AgueroFlow</strong> é uma plataforma de busca, comparação e auditoria corporativa. Não efetuamos compras, reservas, pagamentos ou cancelamentos dentro do sistema.
              </p>
              <p className="leading-relaxed text-[11px] text-amber-200/90">
                {redirectOffer.isLodging
                  ? `As diárias, tipos de cama, políticas de cancelamento e emissão de NF corporativa devem ser reconfirmadas diretamente no portal do parceiro (${redirectOffer.sourceName}) antes da autorização interna.`
                  : `Os preços, franquias de bagagem, assentos e regras tarifárias devem ser reconfirmados diretamente no portal oficial do fornecedor (${redirectOffer.sourceName}) antes de qualquer emissão corporativa.`}
              </p>
            </div>

            {/* Selected Route / Hotel Summary */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-xs">
              {redirectOffer.isLodging ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hotel / Acomodação:</span>
                    <strong className="text-white">{redirectOffer.hotelName || redirectOffer.carrierName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cidade & Polo:</span>
                    <strong className="text-white">{redirectOffer.destinationCity}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Acomodação:</span>
                    <strong className="text-white">{redirectOffer.serviceClass} {redirectOffer.bedType ? `• ${redirectOffer.bedType}` : ''}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Check-in / Check-out:</span>
                    <strong className="text-white">
                      {redirectOffer.checkInDate ? redirectOffer.checkInDate.split('-').reverse().join('/') : redirectOffer.departureDate} até {redirectOffer.checkOutDate ? redirectOffer.checkOutDate.split('-').reverse().join('/') : ''} ({redirectOffer.nightsCount || 1} diária(s))
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5">
                    <span className="text-slate-400">Valor Total Consultado ({redirectOffer.nightsCount || 1} noites):</span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      R$ {redirectOffer.totalAmount.toFixed(2).replace('.', ',')}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Itinerário:</span>
                    <strong className="text-white">{redirectOffer.originCity} ➔ {redirectOffer.destinationCity}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isAirMode ? 'Cia Aérea:' : 'Viação:'}</span>
                    <strong className="text-white">{redirectOffer.carrierName} ({redirectOffer.serviceClass})</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Data e Saída:</span>
                    <strong className="text-white">{redirectOffer.departureDate.split('-').reverse().join('/')} às {redirectOffer.departureTime}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5">
                    <span className="text-slate-400">Valor Total Consultado ({redirectOffer.passengerCount} pax):</span>
                    <strong className="text-emerald-400 font-mono text-sm">
                      R$ {redirectOffer.totalAmount.toFixed(2).replace('.', ',')}
                    </strong>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setRedirectOffer(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
              >
                Voltar
              </button>
              <a
                href={redirectOffer.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setRedirectOffer(null)}
                className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-lg flex items-center space-x-2 transition ${
                  redirectOffer.isLodging
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/20'
                }`}
              >
                <span>Abrir Portal {redirectOffer.sourceName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
