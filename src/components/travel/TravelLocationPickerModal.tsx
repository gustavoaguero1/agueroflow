import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Bus,
  Plane,
  MapPin,
  ArrowRightLeft,
  Sparkles,
  Building2,
  Factory,
  Check,
  Navigation,
  Compass,
} from 'lucide-react';
import {
  TravelTerminalLocation,
  TravelAirportLocation,
  TravelRegionCategory,
  TravelPopularRoute,
  TravelTransportType,
} from '../../types/travel';
import {
  BRAZILIAN_TERMINAL_HUBS,
  BRAZILIAN_AIRPORT_HUBS,
  POPULAR_CORPORATE_ROUTES,
  POPULAR_FLIGHT_ROUTES,
} from '../../services/travelService';

interface TravelLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMode: 'origin' | 'destination';
  transportType?: TravelTransportType;
  onSwitchTargetMode: (mode: 'origin' | 'destination') => void;
  currentOriginCity: string;
  currentOriginState: string;
  currentOriginTerminal?: string;
  currentDestinationCity: string;
  currentDestinationState: string;
  currentDestinationTerminal?: string;
  onSelectLocation: (
    location: TravelTerminalLocation,
    target: 'origin' | 'destination'
  ) => void;
  onSelectRoute?: (route: TravelPopularRoute) => void;
  onSwapLocations?: () => void;
}

const REGION_TABS: Array<{ id: TravelRegionCategory; label: string; icon?: string }> = [
  { id: 'todos', label: 'Todos os Locais' },
  { id: 'sp_metropolitana', label: 'Grande SP & Capital' },
  { id: 'sp_interior', label: 'Interior de SP' },
  { id: 'rj_mg_es', label: 'RJ, MG & ES' },
  { id: 'sul', label: 'Região Sul (PR/SC/RS)' },
  { id: 'centro_oeste', label: 'Centro-Oeste & DF' },
  { id: 'nordeste_norte', label: 'Nordeste & Norte' },
  { id: 'polos_industriais', label: '🏭 Polos Industriais & Hubs' },
];

export const TravelLocationPickerModal: React.FC<TravelLocationPickerModalProps> = ({
  isOpen,
  onClose,
  targetMode,
  transportType = 'rodoviario',
  onSwitchTargetMode,
  currentOriginCity,
  currentOriginState,
  currentOriginTerminal,
  currentDestinationCity,
  currentDestinationState,
  currentDestinationTerminal,
  onSelectLocation,
  onSelectRoute,
  onSwapLocations,
}) => {
  const [modalMode, setModalMode] = useState<'rodoviario' | 'aereo'>(
    transportType === 'aereo' ? 'aereo' : 'rodoviario'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<TravelRegionCategory>('todos');

  // Sync when transportType prop changes
  React.useEffect(() => {
    if (transportType === 'aereo') {
      setModalMode('aereo');
    } else {
      setModalMode('rodoviario');
    }
  }, [transportType]);

  // Filter terminal hubs
  const filteredTerminals = useMemo(() => {
    let list = BRAZILIAN_TERMINAL_HUBS;

    if (selectedRegion === 'polos_industriais') {
      list = list.filter((hub) => hub.isIndustrialHub);
    } else if (selectedRegion !== 'todos') {
      list = list.filter((hub) => hub.region === selectedRegion);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (hub) =>
          hub.city.toLowerCase().includes(q) ||
          hub.state.toLowerCase().includes(q) ||
          hub.terminalName.toLowerCase().includes(q) ||
          (hub.stationCode && hub.stationCode.toLowerCase().includes(q)) ||
          (hub.popularSearchTerm && hub.popularSearchTerm.toLowerCase().includes(q)) ||
          (hub.highlights && hub.highlights.toLowerCase().includes(q))
      );
    }

    return list;
  }, [searchQuery, selectedRegion]);

  // Filter airports
  const filteredAirports = useMemo(() => {
    let list = BRAZILIAN_AIRPORT_HUBS;

    if (selectedRegion === 'polos_industriais') {
      list = list.filter((a) => a.isHub);
    } else if (selectedRegion !== 'todos') {
      list = list.filter((a) => a.region === selectedRegion);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.iataCode.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.state.toLowerCase().includes(q) ||
          a.airportName.toLowerCase().includes(q) ||
          (a.highlights && a.highlights.toLowerCase().includes(q))
      );
    }

    return list;
  }, [searchQuery, selectedRegion]);

  if (!isOpen) return null;

  const isOrigin = targetMode === 'origin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-slate-700 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-900/90 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>
                {modalMode === 'aereo'
                  ? 'Catálogo Oficial de Aeroportos Nacionais (IATA)'
                  : 'Catálogo Rodoviário Oficial • Seleção Sem Digitação'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>Selecione {isOrigin ? 'a Origem (Embarque)' : 'o Destino (Desembarque)'}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {modalMode === 'aereo'
                ? 'Selecione qualquer aeroporto comercial brasileiro com código IATA oficial sem precisar digitar.'
                : 'Clique em qualquer cidade ou terminal rodoviário para selecionar instantaneamente.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center space-x-2 self-end md:self-auto gap-2">
            {/* Modal Category Toggle: Rodoviário vs Aéreo */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setModalMode('rodoviario')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  modalMode === 'rodoviario'
                    ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bus className="w-3.5 h-3.5" />
                <span>Rodoviário</span>
              </button>
              <button
                type="button"
                onClick={() => setModalMode('aereo')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  modalMode === 'aereo'
                    ? 'bg-sky-400 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>Aeroportos (IATA)</span>
              </button>
            </div>

            {/* Target Mode Toggle Switch */}
            <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
              <button
                type="button"
                onClick={() => onSwitchTargetMode('origin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  isOrigin
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Origem</span>
              </button>
              <button
                type="button"
                onClick={() => onSwitchTargetMode('destination')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  !isOrigin
                    ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Destino</span>
              </button>
            </div>

            {onSwapLocations && (
              <button
                type="button"
                onClick={onSwapLocations}
                title="Inverter Origem e Destino"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Current State Summary Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between text-xs gap-3">
          <div className="flex items-center space-x-3">
            <span className="text-slate-400">Origem atual:</span>
            <span className="font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded-md flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-400" />
              {currentOriginCity} ({currentOriginState}) - {currentOriginTerminal || 'Todos'}
            </span>
          </div>

          <div className="text-slate-600 font-bold hidden sm:inline">➔</div>

          <div className="flex items-center space-x-3">
            <span className="text-slate-400">Destino atual:</span>
            <span className="font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2.5 py-0.5 rounded-md flex items-center gap-1">
              <Navigation className="w-3 h-3 text-cyan-400" />
              {currentDestinationCity} ({currentDestinationState}) - {currentDestinationTerminal || 'Todos'}
            </span>
          </div>
        </div>

        {/* Search & 1-Click Popular Routes Header */}
        <div className="p-4 sm:p-6 bg-slate-900/60 border-b border-slate-800 space-y-4">
          {/* Live Search inside Catalog */}
          <div className="relative">
            <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                modalMode === 'aereo'
                  ? 'Filtro por código IATA ou cidade (ex: CGH, GRU, SDU, BSB, CNF, Campinas, Recife, Manaus)...'
                  : 'Filtro por cidade, terminal ou estado (ex: Tietê, Campinas, Macaé, Rio, Curitiba, PR)...'
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 1-Click Popular Routes Section */}
          {onSelectRoute && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {modalMode === 'aereo'
                    ? 'Rotas Aéreas Corporativas Frequentes (Ponte Aérea & Hubs)'
                    : 'Rotas Rodoviárias Corporativas Frequentes'}
                </span>
                <span className="text-slate-500 hidden sm:inline">Define Origem + Destino em 1 clique</span>
              </div>
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
                {(modalMode === 'aereo' ? POPULAR_FLIGHT_ROUTES : POPULAR_CORPORATE_ROUTES).map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => {
                      onSelectRoute(route);
                      onClose();
                    }}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-cyan-950/80 text-slate-200 hover:text-cyan-200 border border-slate-700/80 hover:border-cyan-600/70 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm group"
                  >
                    {modalMode === 'aereo' ? (
                      <Plane className="w-3 h-3 text-sky-400" />
                    ) : (
                      <Bus className="w-3 h-3 text-cyan-400" />
                    )}
                    <span>{route.label}</span>
                    <span className="text-[10px] text-slate-400 group-hover:text-cyan-300 font-normal">
                      ({route.estimatedDuration})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Region Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin scrollbar-thumb-slate-700">
            {REGION_TABS.map((tab) => {
              const active = selectedRegion === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedRegion(tab.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    active
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Catalog Grid (Airports or Bus Terminals) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
            <span>
              Mostrando{' '}
              <strong className="text-white">
                {modalMode === 'aereo' ? filteredAirports.length : filteredTerminals.length}
              </strong>{' '}
              {modalMode === 'aereo' ? 'aeroportos comerciais (IATA)' : 'cidades e terminais rodoviários'}
            </span>
            <span className="text-[11px] text-slate-500">
              Clique em um card para aplicar como {isOrigin ? 'Origem' : 'Destino'}
            </span>
          </div>

          {modalMode === 'aereo' ? (
            filteredAirports.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400">
                <Plane className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-sm text-slate-300">Nenhum aeroporto encontrado para a busca.</p>
                <p className="text-xs text-slate-500 mt-1">Busque pelo código IATA (ex: CGH, SDU, BSB) ou cidade.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAirports.map((airport) => {
                  const isSelectedAsOrigin =
                    currentOriginCity.toLowerCase() === airport.city.toLowerCase() &&
                    currentOriginState.toUpperCase() === airport.state.toUpperCase() &&
                    Boolean(currentOriginTerminal && currentOriginTerminal.includes(airport.iataCode));

                  const isSelectedAsDestination =
                    currentDestinationCity.toLowerCase() === airport.city.toLowerCase() &&
                    currentDestinationState.toUpperCase() === airport.state.toUpperCase() &&
                    Boolean(currentDestinationTerminal && currentDestinationTerminal.includes(airport.iataCode));

                  return (
                    <div
                      key={`airport_${airport.iataCode}`}
                      onClick={() => {
                        onSelectLocation(
                          {
                            city: airport.city,
                            state: airport.state,
                            terminalName: `${airport.airportName} (${airport.iataCode})`,
                            popularSearchTerm: `${airport.city} - ${airport.iataCode}`,
                            stationCode: airport.iataCode,
                            region: airport.region,
                            regionLabel: airport.regionLabel,
                            highlights: airport.highlights,
                            isCapital: airport.isCapital,
                          },
                          targetMode
                        );
                        onClose();
                      }}
                      className={`p-3.5 rounded-xl border transition cursor-pointer relative group text-left ${
                        isSelectedAsOrigin
                          ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500/50'
                          : isSelectedAsDestination
                          ? 'bg-cyan-950/40 border-cyan-500/80 shadow-md shadow-cyan-950/30 ring-1 ring-cyan-500/50'
                          : 'bg-slate-900/80 border-slate-800 hover:border-sky-500/60 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white group-hover:text-sky-300 transition">
                            {airport.city}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {airport.state}
                          </span>
                        </div>

                        {/* Prominent IATA badge */}
                        <span className="text-xs font-mono font-bold text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded-md border border-sky-800/80 shadow-inner">
                          {airport.iataCode}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 flex items-center space-x-1.5 font-medium mb-1.5">
                        <Plane className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        <span className="truncate">{airport.airportName}</span>
                      </div>

                      {airport.highlights && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{airport.highlights}</p>
                      )}

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                        {airport.isHub ? (
                          <span className="text-[10px] text-sky-400 font-semibold flex items-center gap-1 bg-sky-950/50 px-2 py-0.5 rounded border border-sky-800/50">
                            <Sparkles className="w-3 h-3" />
                            Hub Aéreo Nacional
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">{airport.regionLabel}</span>
                        )}

                        <div>
                          {isSelectedAsOrigin ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Origem
                            </span>
                          ) : isSelectedAsDestination ? (
                            <span className="text-cyan-400 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Destino
                            </span>
                          ) : (
                            <span className="text-sky-400 font-semibold group-hover:underline">Selecionar ➔</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredTerminals.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400">
              <Bus className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-300">Nenhum terminal encontrado para o filtro digitado.</p>
              <p className="text-xs text-slate-500 mt-1">Tente pesquisar por parte do nome ou limpe a busca.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedRegion('todos');
                }}
                className="mt-3 px-3.5 py-1.5 rounded-lg bg-slate-800 text-cyan-300 text-xs font-semibold hover:bg-slate-700 transition"
              >
                Limpar Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTerminals.map((hub) => {
                const isSelectedAsOrigin =
                  currentOriginCity.toLowerCase() === hub.city.toLowerCase() &&
                  currentOriginState.toUpperCase() === hub.state.toUpperCase() &&
                  (!currentOriginTerminal || currentOriginTerminal === hub.terminalName);

                const isSelectedAsDestination =
                  currentDestinationCity.toLowerCase() === hub.city.toLowerCase() &&
                  currentDestinationState.toUpperCase() === hub.state.toUpperCase() &&
                  (!currentDestinationTerminal || currentDestinationTerminal === hub.terminalName);

                return (
                  <div
                    key={`${hub.city}-${hub.state}-${hub.terminalName}`}
                    onClick={() => {
                      onSelectLocation(hub, targetMode);
                      onClose();
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer relative group text-left ${
                      isSelectedAsOrigin
                        ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500/50'
                        : isSelectedAsDestination
                        ? 'bg-cyan-950/40 border-cyan-500/80 shadow-md shadow-cyan-950/30 ring-1 ring-cyan-500/50'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white group-hover:text-cyan-300 transition">
                          {hub.city}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          {hub.state}
                        </span>
                      </div>

                      {hub.stationCode && (
                        <span className="text-[9px] font-mono text-slate-500 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">
                          {hub.stationCode}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-300 flex items-center space-x-1.5 font-medium mb-1.5">
                      <Bus className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="truncate">{hub.terminalName}</span>
                    </div>

                    {hub.highlights && (
                      <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{hub.highlights}</p>
                    )}

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      {hub.isIndustrialHub ? (
                        <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                          <Factory className="w-3 h-3" />
                          Polo Industrial / Obras
                        </span>
                      ) : hub.isCapital ? (
                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          Capital / Conexão Central
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">{hub.regionLabel || 'Interior'}</span>
                      )}

                      <div>
                        {isSelectedAsOrigin ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Origem
                          </span>
                        ) : isSelectedAsDestination ? (
                          <span className="text-cyan-400 font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Destino
                          </span>
                        ) : (
                          <span className="text-cyan-400 font-semibold group-hover:underline">Selecionar ➔</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              {modalMode === 'aereo'
                ? 'LATAM, GOL, Azul, Voepass & ANAC integrados para cotação corporativa'
                : 'QueroPassagem, ClickBus, Buser & viações credenciadas'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
            >
              Fechar Catálogo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
