import React, { useState } from 'react';
import {
  Search,
  ArrowRightLeft,
  Calendar,
  Users,
  Bus,
  Plane,
  Building,
  Car,
  Filter,
  Briefcase,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  ShieldCheck,
  Compass,
  MapPin,
} from 'lucide-react';
import {
  TravelSearchCriteria,
  TravelSeatClass,
  TravelTimeOfDay,
  TravelPassengerConfig,
  TravelCorporateContext,
  TravelPopularRoute,
  TravelTerminalLocation,
} from '../../types/travel';
import {
  BRAZILIAN_TERMINAL_HUBS,
  BRAZILIAN_AIRPORT_HUBS,
  POPULAR_CORPORATE_ROUTES,
  POPULAR_FLIGHT_ROUTES,
  POPULAR_LODGING_DESTINATIONS,
} from '../../services/travelService';
import { TravelLocationPickerModal } from './TravelLocationPickerModal';
import { TravelTransportType } from '../../types/travel';

interface TravelSearchFormProps {
  onSearch: (criteria: TravelSearchCriteria) => void;
  isLoading: boolean;
  initialCriteria?: Partial<TravelSearchCriteria>;
  corporateProjects?: Array<{ id: string; name: string }>;
  costCenters?: Array<{ id: string; name: string; code: string }>;
  employees?: Array<{ id: string; name: string; role?: string }>;
}

export const TravelSearchForm: React.FC<TravelSearchFormProps> = ({
  onSearch,
  isLoading,
  initialCriteria,
  corporateProjects = [],
  costCenters = [],
  employees = [],
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Transport Type Mode (Rodoviário, Aéreo, Hospedagem)
  const [transportType, setTransportType] = useState<TravelTransportType>(
    initialCriteria?.transportType || 'rodoviario'
  );

  // Primary fields
  const [originCity, setOriginCity] = useState(
    initialCriteria?.originCity || (transportType === 'aereo' ? 'São Paulo' : 'São Paulo')
  );
  const [originState, setOriginState] = useState(initialCriteria?.originState || 'SP');
  const [originTerminal, setOriginTerminal] = useState(
    initialCriteria?.originTerminal ||
      (transportType === 'aereo' ? 'Aeroporto de Congonhas (CGH)' : 'Terminal Rodoviário Tietê')
  );
  const [originAirportCode, setOriginAirportCode] = useState(
    initialCriteria?.originAirportCode || 'CGH'
  );

  const [destinationCity, setDestinationCity] = useState(
    initialCriteria?.destinationCity || (transportType === 'aereo' ? 'Rio de Janeiro' : 'Campinas')
  );
  const [destinationState, setDestinationState] = useState(
    initialCriteria?.destinationState || (transportType === 'aereo' ? 'RJ' : 'SP')
  );
  const [destinationTerminal, setDestinationTerminal] = useState(
    initialCriteria?.destinationTerminal ||
      (transportType === 'aereo'
        ? 'Aeroporto Santos Dumont (SDU)'
        : transportType === 'hospedagem'
        ? 'Próximo ao Polo Industrial / RMC'
        : 'Terminal Multimodal Ramos de Azevedo')
  );
  const [destinationAirportCode, setDestinationAirportCode] = useState(
    initialCriteria?.destinationAirportCode || 'SDU'
  );

  const [departureDate, setDepartureDate] = useState(initialCriteria?.departureDate || todayStr);
  const [returnDate, setReturnDate] = useState(initialCriteria?.returnDate || '');
  const [isRoundTrip, setIsRoundTrip] = useState(initialCriteria?.isRoundTrip || false);

  // Lodging-specific states
  const [checkInDate, setCheckInDate] = useState(
    initialCriteria?.checkInDate || initialCriteria?.departureDate || todayStr
  );
  const [checkOutDate, setCheckOutDate] = useState(
    initialCriteria?.checkOutDate || initialCriteria?.returnDate || tomorrowStr
  );
  const [roomsCount, setRoomsCount] = useState<number>(initialCriteria?.roomsCount || 1);
  const [guestsCount, setGuestsCount] = useState<number>(initialCriteria?.guestsCount || 1);
  const [breakfastRequired, setBreakfastRequired] = useState<boolean>(
    initialCriteria?.breakfastRequired ?? true
  );
  const [freeCancellationRequired, setFreeCancellationRequired] = useState<boolean>(
    initialCriteria?.freeCancellationRequired ?? false
  );
  const [parkingRequired, setParkingRequired] = useState<boolean>(
    initialCriteria?.parkingRequired ?? true
  );
  const [minStars, setMinStars] = useState<number | undefined>(initialCriteria?.minStars);
  const [lodgingTypeFilter, setLodgingTypeFilter] = useState<NonNullable<TravelSearchCriteria['lodgingTypeFilter']>>(
    initialCriteria?.lodgingTypeFilter || 'todos'
  );

  // Calculate nights
  const lodgingNightsCount = Math.max(
    1,
    Math.round((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  // Flight-specific filters
  const [directFlightsOnly, setDirectFlightsOnly] = useState<boolean>(
    initialCriteria?.directFlightsOnly || false
  );
  const [withCheckedBaggage, setWithCheckedBaggage] = useState<boolean>(
    initialCriteria?.withCheckedBaggage || false
  );

  // Passenger state
  const [passengers, setPassengers] = useState<TravelPassengerConfig>(
    initialCriteria?.passengers || { adults: 1, children: 0, seniors: 0 }
  );
  const [showPassengerModal, setShowPassengerModal] = useState(false);

  // Optional filters
  const [showFilters, setShowFilters] = useState(false);
  const [seatClassFilter, setSeatClassFilter] = useState<TravelSeatClass>(
    initialCriteria?.seatClassFilter || 'todos'
  );
  const [timeOfDayFilter, setTimeOfDayFilter] = useState<TravelTimeOfDay>(
    initialCriteria?.timeOfDayFilter || 'todos'
  );
  const [carrierFilter, setCarrierFilter] = useState(initialCriteria?.carrierFilter || '');
  const [maxPriceLimit, setMaxPriceLimit] = useState<number | undefined>(initialCriteria?.maxPriceLimit);

  // Corporate context
  const [showCorporateContext, setShowCorporateContext] = useState(
    Boolean(initialCriteria?.corporateContext?.travelReason)
  );
  const [travelReason, setTravelReason] = useState(initialCriteria?.corporateContext?.travelReason || '');
  const [clientOrDestinationCompany, setClientOrDestinationCompany] = useState(
    initialCriteria?.corporateContext?.clientOrDestinationCompany || ''
  );
  const [workProjectId, setWorkProjectId] = useState(initialCriteria?.corporateContext?.workProjectId || '');
  const [costCenterId, setCostCenterId] = useState(initialCriteria?.corporateContext?.costCenterId || '');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('');

  const [formError, setFormError] = useState('');

  // Location picker modal state (Zero-typing explorer)
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [pickerTargetMode, setPickerTargetMode] = useState<'origin' | 'destination'>('origin');

  const openPicker = (mode: 'origin' | 'destination') => {
    setPickerTargetMode(mode);
    setIsLocationPickerOpen(true);
  };

  const handleSwitchToFlightMode = () => {
    setTransportType('aereo');
    setOriginCity('São Paulo');
    setOriginState('SP');
    setOriginTerminal('Aeroporto de Congonhas (CGH)');
    setOriginAirportCode('CGH');
    setDestinationCity('Rio de Janeiro');
    setDestinationState('RJ');
    setDestinationTerminal('Aeroporto Santos Dumont (SDU)');
    setDestinationAirportCode('SDU');
  };

  const handleSwitchToBusMode = () => {
    setTransportType('rodoviario');
    setOriginCity('São Paulo');
    setOriginState('SP');
    setOriginTerminal('Terminal Rodoviário Tietê');
    setDestinationCity('Campinas');
    setDestinationState('SP');
    setDestinationTerminal('Terminal Multimodal Ramos de Azevedo');
  };

  const handleSwitchToLodgingMode = () => {
    setTransportType('hospedagem');
    setDestinationCity('Campinas');
    setDestinationState('SP');
    setDestinationTerminal('Polo Petroquímico & RMC / Paulínia');
    setOriginCity('São Paulo');
    setOriginState('SP');
    setCheckInDate(departureDate || todayStr);
    setCheckOutDate(returnDate || tomorrowStr);
  };

  const handleSelectLodgingDestination = (hub: (typeof POPULAR_LODGING_DESTINATIONS)[0]) => {
    setDestinationCity(hub.city);
    setDestinationState(hub.state);
    setDestinationTerminal(hub.industrialHub);
  };

  const handleSelectLocationFromModal = (
    location: TravelTerminalLocation,
    target: 'origin' | 'destination'
  ) => {
    if (target === 'origin') {
      setOriginCity(location.city);
      setOriginState(location.state);
      setOriginTerminal(location.terminalName);
      if (location.stationCode) {
        setOriginAirportCode(location.stationCode);
      }
    } else {
      setDestinationCity(location.city);
      setDestinationState(location.state);
      setDestinationTerminal(location.terminalName);
      if (location.stationCode) {
        setDestinationAirportCode(location.stationCode);
      }
    }
  };

  const handleSelectRouteFromModal = (route: TravelPopularRoute) => {
    if (route.transportType) {
      setTransportType(route.transportType);
    }
    setOriginCity(route.originCity);
    setOriginState(route.originState);
    setOriginTerminal(route.originTerminal);
    if (route.originIata) setOriginAirportCode(route.originIata);
    setDestinationCity(route.destinationCity);
    setDestinationState(route.destinationState);
    setDestinationTerminal(route.destinationTerminal);
    if (route.destinationIata) setDestinationAirportCode(route.destinationIata);
  };

  // Handle destination quick select for bus
  const handleSelectDestination = (hub: (typeof BRAZILIAN_TERMINAL_HUBS)[0]) => {
    setDestinationCity(hub.city);
    setDestinationState(hub.state);
    setDestinationTerminal(hub.terminalName);
  };

  // Handle airport quick select for flight
  const handleSelectAirportDestination = (airport: (typeof BRAZILIAN_AIRPORT_HUBS)[0]) => {
    setDestinationCity(airport.city);
    setDestinationState(airport.state);
    setDestinationTerminal(`${airport.airportName} (${airport.iataCode})`);
    setDestinationAirportCode(airport.iataCode);
  };

  // Swap origin and destination
  const handleSwapLocations = () => {
    const tempCity = originCity;
    const tempState = originState;
    const tempTerminal = originTerminal;
    const tempAirport = originAirportCode;

    setOriginCity(destinationCity);
    setOriginState(destinationState);
    setOriginTerminal(destinationTerminal);
    setOriginAirportCode(destinationAirportCode);

    setDestinationCity(tempCity);
    setDestinationState(tempState);
    setDestinationTerminal(tempTerminal);
    setDestinationAirportCode(tempAirport);
  };

  const totalPax = passengers.adults + passengers.children + passengers.seniors;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (transportType === 'hospedagem') {
      if (!destinationCity.trim()) {
        setFormError('Informe a cidade ou polo industrial onde deseja hospedar a equipe.');
        return;
      }
      if (!checkInDate) {
        setFormError('Selecione a data de check-in (entrada).');
        return;
      }
      if (!checkOutDate) {
        setFormError('Selecione a data de check-out (saída).');
        return;
      }
      if (checkOutDate <= checkInDate) {
        setFormError('A data de check-out deve ser posterior à data de check-in.');
        return;
      }
      if (guestsCount < 1) {
        setFormError('Informe ao menos 1 hóspede.');
        return;
      }

      const selectedProject = corporateProjects.find((p) => p.id === workProjectId);
      const selectedCostCenter = costCenters.find((c) => c.id === costCenterId);

      const corporateContext: TravelCorporateContext | undefined = showCorporateContext
        ? {
            travelReason: travelReason.trim() || undefined,
            clientOrDestinationCompany: clientOrDestinationCompany.trim() || undefined,
            workProjectId: workProjectId || undefined,
            workProjectName: selectedProject?.name,
            costCenterId: costCenterId || undefined,
            costCenterName: selectedCostCenter?.name,
            travelerNames: selectedEmployeeName ? [selectedEmployeeName] : undefined,
          }
        : undefined;

      const criteria: TravelSearchCriteria = {
        transportType: 'hospedagem',
        originCity: originCity.trim() || destinationCity.trim(),
        originState: originState.trim().toUpperCase() || 'SP',
        destinationCity: destinationCity.trim(),
        destinationState: destinationState.trim().toUpperCase() || 'SP',
        destinationTerminal: destinationTerminal.trim() || undefined,
        departureDate: checkInDate,
        returnDate: checkOutDate,
        isRoundTrip: true,
        checkInDate,
        checkOutDate,
        nightsCount: lodgingNightsCount,
        roomsCount,
        guestsCount,
        breakfastRequired,
        freeCancellationRequired,
        parkingRequired,
        minStars,
        lodgingTypeFilter,
        passengers: { adults: guestsCount, children: 0, seniors: 0 },
        maxPriceLimit: maxPriceLimit && maxPriceLimit > 0 ? maxPriceLimit : undefined,
        corporateContext,
      };

      onSearch(criteria);
      return;
    }

    if (!originCity.trim() || !destinationCity.trim()) {
      setFormError('Informe a cidade ou aeroporto de origem e de destino.');
      return;
    }

    if (
      originCity.trim().toLowerCase() === destinationCity.trim().toLowerCase() &&
      originAirportCode === destinationAirportCode
    ) {
      setFormError('A origem e o destino não podem ser a mesma localidade.');
      return;
    }

    if (!departureDate) {
      setFormError('Selecione a data de ida.');
      return;
    }

    if (departureDate < todayStr) {
      setFormError('A data de ida não pode ser anterior à data de hoje.');
      return;
    }

    if (isRoundTrip) {
      if (!returnDate) {
        setFormError('Para viagens de ida e volta, informe a data de retorno.');
        return;
      }
      if (returnDate < departureDate) {
        setFormError('A data de retorno deve ser igual ou posterior à data de ida.');
        return;
      }
    }

    if (totalPax < 1) {
      setFormError('Selecione ao menos 1 passageiro.');
      return;
    }

    const selectedProject = corporateProjects.find((p) => p.id === workProjectId);
    const selectedCostCenter = costCenters.find((c) => c.id === costCenterId);

    const corporateContext: TravelCorporateContext | undefined = showCorporateContext
      ? {
          travelReason: travelReason.trim() || undefined,
          clientOrDestinationCompany: clientOrDestinationCompany.trim() || undefined,
          workProjectId: workProjectId || undefined,
          workProjectName: selectedProject?.name,
          costCenterId: costCenterId || undefined,
          costCenterName: selectedCostCenter?.name,
          travelerNames: selectedEmployeeName ? [selectedEmployeeName] : undefined,
        }
      : undefined;

    const criteria: TravelSearchCriteria = {
      transportType,
      originCity: originCity.trim(),
      originState: originState.trim().toUpperCase() || 'SP',
      originTerminal: originTerminal.trim() || undefined,
      originAirportCode: transportType === 'aereo' ? originAirportCode : undefined,
      destinationCity: destinationCity.trim(),
      destinationState: destinationState.trim().toUpperCase() || 'SP',
      destinationTerminal: destinationTerminal.trim() || undefined,
      destinationAirportCode: transportType === 'aereo' ? destinationAirportCode : undefined,
      departureDate,
      returnDate: isRoundTrip ? returnDate : undefined,
      isRoundTrip,
      passengers,
      seatClassFilter: seatClassFilter !== 'todos' ? seatClassFilter : undefined,
      timeOfDayFilter: timeOfDayFilter !== 'todos' ? timeOfDayFilter : undefined,
      carrierFilter: carrierFilter.trim() || undefined,
      maxPriceLimit: maxPriceLimit && maxPriceLimit > 0 ? maxPriceLimit : undefined,
      corporateContext,
      directFlightsOnly: transportType === 'aereo' ? directFlightsOnly : undefined,
      withCheckedBaggage: transportType === 'aereo' ? withCheckedBaggage : undefined,
    };

    onSearch(criteria);
  };

  return (
    <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-5 sm:p-7 shadow-2xl text-slate-100 max-w-5xl mx-auto">
      {/* Category selector / Transport Types */}
      <div className="flex flex-wrap items-center justify-between pb-4 mb-6 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-2">
          {/* Rodoviário Tab */}
          <button
            type="button"
            onClick={handleSwitchToBusMode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
              transportType === 'rodoviario'
                ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/25 ring-2 ring-cyan-400/60'
                : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            <Bus className="w-4 h-4" />
            <span>Passagens Rodoviárias</span>
          </button>

          {/* Aéreo Tab (NOW 100% ACTIVE!) */}
          <button
            type="button"
            onClick={handleSwitchToFlightMode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
              transportType === 'aereo'
                ? 'bg-sky-400 text-slate-950 shadow-sky-400/30 ring-2 ring-sky-300/70'
                : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            <Plane className="w-4 h-4" />
            <span>Passagens Aéreas</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                transportType === 'aereo' ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              Ativo
            </span>
          </button>

          {/* Hospedagem & Hotéis Tab (100% ATIVO & HOMOLOGADO) */}
          <button
            type="button"
            onClick={handleSwitchToLodgingMode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-md ${
              transportType === 'hospedagem'
                ? 'bg-amber-400 text-slate-950 shadow-amber-400/30 ring-2 ring-amber-300/70'
                : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Hospedagem & Hotéis</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                transportType === 'hospedagem' ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              Ativo
            </span>
          </button>

          {/* Veículos (Fase Futura) */}
          <div className="hidden md:flex items-center opacity-50 cursor-not-allowed">
            <button
              type="button"
              disabled
              title="Módulo de Locação de Veículos em desenvolvimento na fase seguinte"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 text-slate-400 text-xs border border-slate-700/60"
            >
              <Car className="w-3.5 h-3.5 text-slate-500" />
              <span>Veículos</span>
              <span className="text-[9px] px-1 py-0.2 bg-slate-700 text-slate-300 rounded">Em Breve</span>
            </button>
          </div>
        </div>

        {/* Partner badge */}
        <div className="flex items-center space-x-2 text-[11px] text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            {transportType === 'hospedagem'
              ? 'Canais Hoteleiros Integrados:'
              : transportType === 'aereo'
              ? 'Companhias Integradas:'
              : 'Parceiro Homologado:'}
          </span>
          <strong
            className={
              transportType === 'hospedagem'
                ? 'text-amber-300 font-semibold'
                : transportType === 'aereo'
                ? 'text-sky-300 font-semibold'
                : 'text-cyan-300 font-semibold'
            }
          >
            {transportType === 'hospedagem'
              ? 'Booking for Business • Accor • Atlantica • FOHB'
              : transportType === 'aereo'
              ? 'LATAM • GOL • Azul • Voepass • ANAC'
              : 'QueroPassagem (+ 7 fontes)'}
          </strong>
        </div>
      </div>

      {formError && (
        <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {transportType === 'hospedagem' ? (
          /* ========================================================================= */
          /* LODGING / HOTEL SEARCH FORM (CORPORATE & INDUSTRIAL FIELD TEAMS)          */
          /* ========================================================================= */
          <div className="space-y-4">
            {/* 1-Click Popular Industrial Lodging Destinations */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Destinos & Polos Industriais Frequentes (Hotéis para Equipes Técnicas)</span>
                </span>
                <span className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                  <Building className="w-3.5 h-3.5" />
                  <span>10+ Polos Homologados</span>
                </span>
              </div>

              <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
                {POPULAR_LODGING_DESTINATIONS.map((dest) => (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => handleSelectLodgingDestination(dest)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 hover:border-amber-400/60 text-xs transition flex items-center space-x-1.5 group"
                  >
                    <Building className="w-3 h-3 text-amber-400" />
                    <span className="font-medium">{dest.label}</span>
                    <span className="text-[10px] text-slate-400 group-hover:text-amber-300 font-normal">
                      ({dest.typicalRateEstimate})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Destination & Proximity Card */}
            <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 space-y-2 focus-within:border-amber-400 transition">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Cidade ou Polo Industrial de Hospedagem</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  Pesquisa em Booking, Accor, Atlantica, Hotéis.com e FOHB
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr,80px,1.5fr] gap-3">
                <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
                  <Building className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    placeholder="Ex: Campinas, São Paulo, Santos, Macaé..."
                    className="bg-transparent text-white font-semibold text-sm w-full focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-center bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-2">
                  <input
                    type="text"
                    value={destinationState}
                    onChange={(e) => setDestinationState(e.target.value)}
                    maxLength={2}
                    placeholder="UF"
                    className="bg-transparent text-amber-300 text-sm font-mono font-bold uppercase w-full text-center focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
                  <Compass className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={destinationTerminal}
                    onChange={(e) => setDestinationTerminal(e.target.value)}
                    placeholder="Bairro, Refinaria, Distrito Industrial ou Polo de preferência"
                    className="bg-transparent text-slate-300 text-xs w-full focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Check-in, Check-out & Rooms/Guests Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Check-in */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1 focus-within:border-amber-400 transition">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                  Data de Check-in (Entrada)
                </span>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <input
                    type="date"
                    min={todayStr}
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="bg-transparent text-white font-medium text-xs w-full focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Check-out */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1 focus-within:border-amber-400 transition">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                    Data de Check-out (Saída)
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-amber-950 text-amber-300 border border-amber-800 rounded">
                    {lodgingNightsCount} {lodgingNightsCount === 1 ? 'diária' : 'diárias'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <input
                    type="date"
                    min={checkInDate || todayStr}
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="bg-transparent text-white font-medium text-xs w-full focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Rooms Count */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1 transition">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                  Número de Quartos
                </span>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs text-white font-semibold flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    {roomsCount} {roomsCount === 1 ? 'quarto' : 'quartos'}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      disabled={roomsCount <= 1}
                      onClick={() => setRoomsCount(Math.max(1, roomsCount - 1))}
                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed font-bold text-xs"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomsCount(roomsCount + 1)}
                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Guests Count & Twin Hint */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1 transition">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                    Total de Hóspedes
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {guestsCount > roomsCount ? 'Quarto Twin/Duplo' : 'Individual'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs text-white font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    {guestsCount} {guestsCount === 1 ? 'hóspede' : 'hóspedes'}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      disabled={guestsCount <= 1}
                      onClick={() => setGuestsCount(Math.max(1, guestsCount - 1))}
                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed font-bold text-xs"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuestsCount(guestsCount + 1)}
                      className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Corporate Amenities Quick Checklist */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Exigências Corporativas:
              </span>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200 hover:text-amber-300">
                  <input
                    type="checkbox"
                    checked={breakfastRequired}
                    onChange={(e) => setBreakfastRequired(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Café da manhã incluso</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200 hover:text-amber-300">
                  <input
                    type="checkbox"
                    checked={parkingRequired}
                    onChange={(e) => setParkingRequired(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Estacionamento p/ van/veículo de serviço</span>
                </label>

                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200 hover:text-amber-300">
                  <input
                    type="checkbox"
                    checked={freeCancellationRequired}
                    onChange={(e) => setFreeCancellationRequired(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Cancelamento grátis</span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* TRANSPORT SEARCH FORM (RODOVIÁRIO & AÉREO)                                 */
          /* ========================================================================= */
          <>
            {/* Trip Mode Toggle & Quick Flight Badges */}
            <div className="flex flex-wrap items-center justify-between text-xs gap-3">
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-300">
                  <input
                    type="radio"
                    name="tripType"
                    checked={!isRoundTrip}
                    onChange={() => setIsRoundTrip(false)}
                    className="text-cyan-500 focus:ring-cyan-400"
                  />
                  <span>Somente Ida</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-300">
                  <input
                    type="radio"
                    name="tripType"
                    checked={isRoundTrip}
                    onChange={() => setIsRoundTrip(true)}
                    className="text-cyan-500 focus:ring-cyan-400"
                  />
                  <span>Ida e Volta</span>
                </label>
              </div>

              {/* Quick flight switches when in flight mode */}
              {transportType === 'aereo' && (
                <div className="flex items-center space-x-4 text-xs">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300 hover:text-sky-300">
                    <input
                      type="checkbox"
                      checked={directFlightsOnly}
                      onChange={(e) => setDirectFlightsOnly(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-400"
                    />
                    <span>Apenas Voos Diretos</span>
                  </label>

                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300 hover:text-sky-300">
                    <input
                      type="checkbox"
                      checked={withCheckedBaggage}
                      onChange={(e) => setWithCheckedBaggage(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-400"
                    />
                    <span>Incluir Bagagem Despachada (23kg)</span>
                  </label>
                </div>
              )}
            </div>

            {/* 1-Click Popular Routes Banner */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  {transportType === 'aereo'
                    ? 'Rotas Aéreas Corporativas Frequentes (Ponte Aérea & Hubs)'
                    : 'Rotas Rodoviárias Corporativas Frequentes (1 Clique para Origem + Destino)'}
                </span>
                <button
                  type="button"
                  onClick={() => openPicker('origin')}
                  className="text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold flex items-center gap-1 hover:underline transition"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>
                    {transportType === 'aereo'
                      ? 'Ver Todos os 35+ Aeroportos (IATA)'
                      : 'Explorar Todos os 50+ Terminais'}
                  </span>
                </button>
              </div>

              <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
                {(transportType === 'aereo' ? POPULAR_FLIGHT_ROUTES : POPULAR_CORPORATE_ROUTES).slice(0, 8).map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => handleSelectRouteFromModal(route)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 hover:border-cyan-500/60 text-xs transition flex items-center space-x-1.5 group"
                  >
                    {transportType === 'aereo' ? (
                      <Plane className="w-3 h-3 text-sky-400" />
                    ) : (
                      <Bus className="w-3 h-3 text-cyan-400" />
                    )}
                    <span className="font-medium">{route.label}</span>
                    <span className="text-[10px] text-slate-400 group-hover:text-cyan-300 font-normal">
                      ({route.estimatedDuration})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Origin and Destination Row */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-3 items-center">
              {/* Origin Card */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1.5 focus-within:border-cyan-500 transition relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {transportType === 'aereo' ? 'Aeroporto de Origem (Embarque)' : 'Origem (Embarque)'}
                  </span>

                  {transportType === 'aereo' && originAirportCode && (
                    <span className="text-[10px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded">
                      {originAirportCode}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => openPicker('origin')}
                    className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-700/70 flex items-center gap-1 transition"
                    title="Abrir catálogo completo"
                  >
                    <Compass className="w-3 h-3 text-cyan-400" />
                    <span>Catálogo</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  {transportType === 'aereo' ? (
                    <Plane className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Bus className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  )}
                  <input
                    type="text"
                    value={originCity}
                    onChange={(e) => setOriginCity(e.target.value)}
                    placeholder={transportType === 'aereo' ? 'Ex: São Paulo ou CGH' : 'Ex: São Paulo'}
                    className="bg-transparent text-white font-semibold text-sm w-full focus:outline-none"
                  />
                  <input
                    type="text"
                    value={originState}
                    onChange={(e) => setOriginState(e.target.value)}
                    maxLength={2}
                    placeholder="UF"
                    className="bg-slate-800 text-emerald-300 text-xs font-mono font-bold uppercase px-2 py-1 rounded w-10 text-center focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1 mt-1">
                  <input
                    type="text"
                    value={originTerminal}
                    onChange={(e) => setOriginTerminal(e.target.value)}
                    placeholder={
                      transportType === 'aereo'
                        ? 'Aeroporto (ex: Aeroporto de Congonhas - CGH)'
                        : 'Terminal (ex: Terminal Rodoviário Tietê)'
                    }
                    className="text-[11px] text-slate-400 bg-transparent w-full focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => openPicker('origin')}
                    className="text-[10px] text-slate-500 hover:text-cyan-300 whitespace-nowrap ml-1"
                  >
                    Mudar
                  </button>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center my-[-4px] lg:my-0">
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  title="Inverter Origem e Destino"
                  className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 flex items-center justify-center transition shadow-md active:scale-95"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Destination Card */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1.5 focus-within:border-cyan-500 transition relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {transportType === 'aereo' ? 'Aeroporto de Destino (Desembarque)' : 'Destino (Desembarque)'}
                  </span>

                  {transportType === 'aereo' && destinationAirportCode && (
                    <span className="text-[10px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded">
                      {destinationAirportCode}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => openPicker('destination')}
                    className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-700/70 flex items-center gap-1 transition"
                    title="Abrir catálogo completo"
                  >
                    <Compass className="w-3 h-3 text-cyan-400" />
                    <span>Catálogo</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  {transportType === 'aereo' ? (
                    <Plane className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  ) : (
                    <Bus className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  )}
                  <input
                    type="text"
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    placeholder={transportType === 'aereo' ? 'Ex: Rio de Janeiro ou SDU' : 'Ex: Campinas ou Rio'}
                    className="bg-transparent text-white font-semibold text-sm w-full focus:outline-none"
                  />
                  <input
                    type="text"
                    value={destinationState}
                    onChange={(e) => setDestinationState(e.target.value)}
                    maxLength={2}
                    placeholder="UF"
                    className="bg-slate-800 text-cyan-300 text-xs font-mono font-bold uppercase px-2 py-1 rounded w-10 text-center focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-1 mt-1">
                  <input
                    type="text"
                    value={destinationTerminal}
                    onChange={(e) => setDestinationTerminal(e.target.value)}
                    placeholder={
                      transportType === 'aereo'
                        ? 'Aeroporto (ex: Aeroporto Santos Dumont - SDU)'
                        : 'Terminal (ex: Terminal Ramos de Azevedo)'
                    }
                    className="text-[11px] text-slate-400 bg-transparent w-full focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => openPicker('destination')}
                    className="text-[10px] text-slate-500 hover:text-cyan-300 whitespace-nowrap ml-1"
                  >
                    Mudar
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Suggestions (Airports or Bus Hubs) */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-[11px] text-slate-400 scrollbar-none">
              <span className="font-semibold text-slate-500 flex-shrink-0 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                {transportType === 'aereo' ? 'Principais Aeroportos:' : 'Destinos rápidos:'}
              </span>

              {transportType === 'aereo'
                ? BRAZILIAN_AIRPORT_HUBS.slice(0, 10).map((airport) => (
                    <button
                      key={airport.iataCode}
                      type="button"
                      onClick={() => handleSelectAirportDestination(airport)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-sky-950 text-slate-300 hover:text-sky-200 border border-slate-700/60 hover:border-sky-600 transition flex-shrink-0 text-xs flex items-center space-x-1.5"
                    >
                      <span className="font-mono font-bold text-sky-400">{airport.iataCode}</span>
                      <span>{airport.city}</span>
                    </button>
                  ))
                : BRAZILIAN_TERMINAL_HUBS.slice(0, 8).map((hub) => (
                    <button
                      key={hub.stationCode || `${hub.city}-${hub.state}-${hub.terminalName}`}
                      type="button"
                      onClick={() => handleSelectDestination(hub)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition flex-shrink-0 text-xs"
                    >
                      {hub.popularSearchTerm}
                    </button>
                  ))}

              <button
                type="button"
                onClick={() => openPicker('destination')}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 hover:text-white border border-cyan-800/60 transition flex-shrink-0 text-xs font-semibold"
              >
                + Ver Mais
              </button>
            </div>

            {/* Dates and Passengers Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Departure Date */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1 focus-within:border-cyan-500 transition">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">Data de Ida</span>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <input
                    type="date"
                    min={todayStr}
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="bg-transparent text-white font-medium text-xs w-full focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Return Date */}
              <div
                className={`bg-slate-900/90 border rounded-xl p-3 space-y-1 transition ${
                  isRoundTrip ? 'border-slate-700 focus-within:border-cyan-500' : 'border-slate-800 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">Data de Volta</span>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    min={departureDate || todayStr}
                    value={returnDate}
                    disabled={!isRoundTrip}
                    onChange={(e) => setReturnDate(e.target.value)}
                    placeholder="Opcional"
                    className="bg-transparent text-white font-medium text-xs w-full focus:outline-none [color-scheme:dark] disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Passengers Selector */}
              <div className="relative">
                <div
                  onClick={() => setShowPassengerModal(!showPassengerModal)}
                  className="bg-slate-900/90 border border-slate-700 hover:border-cyan-500 rounded-xl p-3 space-y-1 cursor-pointer transition"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">Passageiros</span>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <span className="text-white font-medium text-xs">
                        {totalPax} {totalPax === 1 ? 'passageiro' : 'passageiros'}
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>

                {/* Passenger Dropdown */}
                {showPassengerModal && (
                  <div className="absolute top-full mt-2 left-0 right-0 sm:right-auto sm:w-72 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl z-30 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-white block">Adultos</strong>
                        <span className="text-[10px] text-slate-400">12 anos ou mais</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          disabled={passengers.adults <= 1}
                          onClick={() => setPassengers({ ...passengers, adults: Math.max(1, passengers.adults - 1) })}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-white font-mono font-bold">{passengers.adults}</span>
                        <button
                          type="button"
                          onClick={() => setPassengers({ ...passengers, adults: passengers.adults + 1 })}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-2.5">
                      <div>
                        <strong className="text-white block">Crianças</strong>
                        <span className="text-[10px] text-slate-400">0 a 11 anos</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          disabled={passengers.children <= 0}
                          onClick={() => setPassengers({ ...passengers, children: Math.max(0, passengers.children - 1) })}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-white font-mono font-bold">{passengers.children}</span>
                        <button
                          type="button"
                          onClick={() => setPassengers({ ...passengers, children: passengers.children + 1 })}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-2.5">
                      <div>
                        <strong className="text-white block">Idosos</strong>
                        <span className="text-[10px] text-slate-400">60 anos ou mais</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          disabled={passengers.seniors <= 0}
                          onClick={() => setPassengers({ ...passengers, seniors: Math.max(0, passengers.seniors - 1) })}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-white font-mono font-bold">{passengers.seniors}</span>
                        <button
                          type="button"
                          onClick={() => setPassengers({ ...passengers, seniors: passengers.seniors + 1 })}
                          className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowPassengerModal(false)}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[11px] rounded-lg"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Collapsible Filters & Corporate Context Toggles */}
        <div className="flex flex-wrap items-center justify-between pt-2 gap-3">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-300 transition"
            >
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {showFilters
                  ? 'Ocultar Filtros Opcionais'
                  : transportType === 'hospedagem'
                  ? 'Filtros de Hospedagem (Estrelas, Tipo de Estadia, Limite Diária)'
                  : transportType === 'aereo'
                  ? 'Filtros de Voo (Classe de Cabine, Horário, Companhia)'
                  : 'Filtros Opcionais (Horário, Assento, Empresa)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCorporateContext(!showCorporateContext)}
              className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-emerald-300 transition"
            >
              <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
              <span>{showCorporateContext ? 'Ocultar Vínculo Corporativo' : 'Vincular a Obra / Centro de Custo'}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full sm:w-auto px-7 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50 text-slate-950 ${
              transportType === 'hospedagem'
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 shadow-amber-500/25'
                : transportType === 'aereo'
                ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 hover:from-sky-300 hover:to-indigo-400 shadow-sky-500/25'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/25'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>
                  {transportType === 'hospedagem'
                    ? 'Consultando Booking, Accor, Atlantica, Hotéis.com & FOHB...'
                    : transportType === 'aereo'
                    ? 'Consultando LATAM, GOL, Azul, Voepass & ANAC...'
                    : 'Consultando QueroPassagem & Fontes...'}
                </span>
              </>
            ) : (
              <>
                {transportType === 'hospedagem' ? (
                  <Building className="w-4 h-4" />
                ) : transportType === 'aereo' ? (
                  <Plane className="w-4 h-4" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>
                  {transportType === 'hospedagem'
                    ? 'Pesquisar Hotéis & Comparar Canais'
                    : transportType === 'aereo'
                    ? 'Pesquisar Voos & Comparar Tarifas'
                    : 'Pesquisar e Comparar Ofertas'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Optional Filters Drawer */}
        {showFilters && (
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-in fade-in duration-150">
            {transportType === 'hospedagem' ? (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Classificação Hoteleira Mínima
                  </label>
                  <select
                    value={minStars || ''}
                    onChange={(e) => setMinStars(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Qualquer Padrão (2★ a 5★)</option>
                    <option value="2">2 Estrelas ou mais (Econômico)</option>
                    <option value="3">3 Estrelas ou mais (Executivo)</option>
                    <option value="4">4 Estrelas ou mais (Superior)</option>
                    <option value="5">5 Estrelas (Luxo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Tipo de Acomodação
                  </label>
                  <select
                    value={lodgingTypeFilter}
                    onChange={(e) => setLodgingTypeFilter(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="todos">Todos os Tipos de Hospedagem</option>
                    <option value="hotel">Hotéis Tradicionais & Executivos</option>
                    <option value="flat">Flats & Apart-Hotéis com Cozinha</option>
                    <option value="reserva_equipe">Estadias Longas para Equipes Industriais</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Teto Máximo por Diária (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={maxPriceLimit || ''}
                    onChange={(e) => setMaxPriceLimit(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Sem limite de diária"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Horário de Saída</label>
                  <select
                    value={timeOfDayFilter}
                    onChange={(e) => setTimeOfDayFilter(e.target.value as TravelTimeOfDay)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="todos">Qualquer Horário</option>
                    <option value="madrugada">Madrugada (00h às 06h)</option>
                    <option value="manha">Manhã (06h às 12h)</option>
                    <option value="tarde">Tarde (12h às 18h)</option>
                    <option value="noite">Noite (18h às 24h)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    {transportType === 'aereo' ? 'Classe de Cabine' : 'Categoria de Assento'}
                  </label>
                  {transportType === 'aereo' ? (
                    <select
                      value={seatClassFilter}
                      onChange={(e) => setSeatClassFilter(e.target.value as TravelSeatClass)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-sky-500"
                    >
                      <option value="todos">Todas as Classes</option>
                      <option value="economica">Classe Econômica</option>
                      <option value="premium_economy">Premium Economy / Espaço Extra</option>
                      <option value="executiva_aerea">Classe Executiva</option>
                    </select>
                  ) : (
                    <select
                      value={seatClassFilter}
                      onChange={(e) => setSeatClassFilter(e.target.value as TravelSeatClass)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="todos">Todas as Categorias</option>
                      <option value="convencional">Convencional</option>
                      <option value="executivo">Executivo</option>
                      <option value="semi_leito">Semi-Leito</option>
                      <option value="leito">Leito</option>
                      <option value="cama">Cama / Leito Cama</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    {transportType === 'aereo' ? 'Companhia Aérea' : 'Viação / Empresa'}
                  </label>
                  <input
                    type="text"
                    value={carrierFilter}
                    onChange={(e) => setCarrierFilter(e.target.value)}
                    placeholder={transportType === 'aereo' ? 'Ex: LATAM, GOL, Azul, Voepass' : 'Ex: Cometa, 1001, Gontijo'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Corporate Context Drawer */}
        {showCorporateContext && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center space-x-2 pb-2 border-b border-emerald-900/40">
              <Briefcase className="w-4 h-4 text-emerald-400" />
              <strong className="text-emerald-300 font-semibold text-xs">
                Contexto Corporativo AgueroFlow (Rastreabilidade & Centros de Custo)
              </strong>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Motivo / Justificativa</label>
                <input
                  type="text"
                  value={travelReason}
                  onChange={(e) => setTravelReason(e.target.value)}
                  placeholder="Ex: Reunião técnica ou montagem"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Cliente / Unidade</label>
                <input
                  type="text"
                  value={clientOrDestinationCompany}
                  onChange={(e) => setClientOrDestinationCompany(e.target.value)}
                  placeholder="Ex: Refinaria Paulínia ou Ambev"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Obra / Projeto (RDO)</label>
                <select
                  value={workProjectId}
                  onChange={(e) => setWorkProjectId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione a Obra...</option>
                  {corporateProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="obra_1">Nova Linha de Mosto Inox - Ambev</option>
                  <option value="obra_2">Montagem Tubulações 316L - Usina São Martinho</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Centro de Custo</label>
                <select
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o Centro de Custo...</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                  <option value="cc_1">CC-102 - Caldeiraria & Montagens Externas</option>
                  <option value="cc_2">CC-205 - Suprimentos & Logística</option>
                  <option value="cc_3">CC-301 - Engenharia de Campo</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Zero-Typing Interactive Location Catalog Picker Modal */}
      <TravelLocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        targetMode={pickerTargetMode}
        transportType={transportType}
        onSwitchTargetMode={(mode) => setPickerTargetMode(mode)}
        currentOriginCity={originCity}
        currentOriginState={originState}
        currentOriginTerminal={originTerminal}
        currentDestinationCity={destinationCity}
        currentDestinationState={destinationState}
        currentDestinationTerminal={destinationTerminal}
        onSelectLocation={handleSelectLocationFromModal}
        onSelectRoute={handleSelectRouteFromModal}
        onSwapLocations={handleSwapLocations}
      />
    </div>
  );
};
