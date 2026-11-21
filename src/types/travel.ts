export type TravelTransportType = 'rodoviario' | 'aereo' | 'hospedagem' | 'veiculo';

export type TravelSeatClass =
  | 'todos'
  | 'convencional'
  | 'executivo'
  | 'semi_leito'
  | 'leito'
  | 'cama'
  | 'economica'
  | 'premium_economy'
  | 'executiva_aerea'
  | 'primeira_classe';

export type TravelTimeOfDay = 'todos' | 'madrugada' | 'manha' | 'tarde' | 'noite';

export type TravelPriceStatus = 'confirmado_fonte' | 'estimado' | 'estimado_tabela' | 'a_confirmar';

export type TravelRequestStatus =
  | 'rascunho'
  | 'pesquisada'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'rejeitada'
  | 'concluida'
  | 'cancelada';

export type TravelSourceQueryMethod = 'api_oficial' | 'link_parametrizado' | 'obt_corporativo';

export type TravelSourceStatus = 'ativo' | 'em_homologacao' | 'indisponivel';

export type TravelSubSection =
  | 'viagens-painel'
  | 'viagens-busca'
  | 'viagens-resultados'
  | 'viagens-historico'
  | 'viagens-solicitacoes'
  | 'viagens-reembolsos'
  | 'viagens-configuracoes';

export type TravelRegionCategory =
  | 'todos'
  | 'sp_metropolitana'
  | 'sp_interior'
  | 'rj_mg_es'
  | 'sul'
  | 'centro_oeste'
  | 'nordeste_norte'
  | 'polos_industriais';

export interface TravelTerminalLocation {
  city: string;
  state: string;
  terminalName: string;
  popularSearchTerm: string;
  stationCode?: string;
  region?: TravelRegionCategory;
  regionLabel?: string;
  isCapital?: boolean;
  isIndustrialHub?: boolean;
  highlights?: string;
}

export interface TravelAirportLocation {
  iataCode: string;
  city: string;
  state: string;
  airportName: string;
  popularSearchTerm: string;
  region: TravelRegionCategory;
  regionLabel: string;
  isCapital?: boolean;
  isHub?: boolean;
  terminalsCount?: number;
  highlights?: string;
}

export interface TravelPopularRoute {
  id: string;
  label: string;
  corridor: string;
  transportType?: TravelTransportType;
  originCity: string;
  originState: string;
  originTerminal: string;
  originIata?: string;
  destinationCity: string;
  destinationState: string;
  destinationTerminal: string;
  destinationIata?: string;
  estimatedDuration: string;
  typicalCarriers: string[];
  isIndustrialCorridor?: boolean;
}

export interface TravelPassengerConfig {
  adults: number;
  children: number; // 0 a 11 anos
  seniors: number;  // 60+ anos
}

export interface TravelCorporateContext {
  requestId?: string;
  requesterId?: string;
  requesterName?: string;
  travelerNames?: string[];
  travelerEmployeeIds?: string[];
  travelReason?: string;
  clientOrDestinationCompany?: string;
  workProjectId?: string;
  workProjectName?: string;
  costCenterId?: string;
  costCenterName?: string;
  budgetLimit?: number;
}

export interface TravelSearchCriteria {
  transportType?: TravelTransportType;
  originCity: string;
  originState: string;
  originTerminal?: string;
  originAirportCode?: string;
  destinationCity: string;
  destinationState: string;
  destinationTerminal?: string;
  destinationAirportCode?: string;
  departureDate: string; // YYYY-MM-DD
  returnDate?: string;   // YYYY-MM-DD
  isRoundTrip: boolean;
  passengers: TravelPassengerConfig;
  seatClassFilter?: TravelSeatClass;
  carrierFilter?: string;
  timeOfDayFilter?: TravelTimeOfDay;
  maxPriceLimit?: number;
  corporateContext?: TravelCorporateContext;
  directFlightsOnly?: boolean;
  withCheckedBaggage?: boolean;
  // Lodging-specific criteria
  checkInDate?: string;
  checkOutDate?: string;
  nightsCount?: number;
  roomsCount?: number;
  guestsCount?: number;
  breakfastRequired?: boolean;
  freeCancellationRequired?: boolean;
  parkingRequired?: boolean;
  minStars?: number;
  lodgingTypeFilter?: 'todos' | 'hotel' | 'pousada' | 'apart' | 'resort' | 'flat' | 'reserva_equipe';
}

export interface TravelOffer {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: TravelTransportType;
  transportType?: TravelTransportType;
  carrierName: string;
  carrierLogoUrl?: string;
  originCity: string;
  originTerminal: string;
  originAirportCode?: string;
  destinationCity: string;
  destinationTerminal: string;
  destinationAirportCode?: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  durationMinutes: number;
  durationFormatted: string;
  stopsCount: number;
  serviceClass:
    | 'Convencional'
    | 'Executivo'
    | 'Semi-Leito'
    | 'Leito'
    | 'Cama / Leito Cama'
    | 'Econômica'
    | 'Premium Economy'
    | 'Executiva'
    | 'Primeira Classe';
  seatType: string;
  passengerCount: number;
  baseFarePerPassenger: number;
  mandatoryTaxesAndFees: number;
  totalAmount: number;
  currency: 'BRL';
  baggageAllowance: string;
  changeAndCancelPolicy: string;
  deepLink: string;
  queriedAt: string;
  priceStatus: TravelPriceStatus;
  isCombinedTrip?: boolean;
  isDemoData?: boolean;
  notes?: string;
  sourceVerificationStatus?: string;
  providerMatchCount?: number;
  anttReferenceCeiling?: number;
  // Flight-specific metadata
  flightNumber?: string;
  aircraftModel?: string;
  layoverAirport?: string;
  layoverDurationMinutes?: number;
  anacTariffBenchmark?: number;
  cabinBaggageIncluded?: boolean;
  checkedBaggageIncluded?: boolean;
  fareFamily?: string;
  // Lodging-specific metadata
  isLodging?: boolean;
  hotelName?: string;
  hotelChain?: string;
  stars?: number;
  reviewScore?: number;
  reviewCount?: number;
  neighborhood?: string;
  roomType?: string;
  bedType?: string;
  breakfastIncluded?: boolean;
  freeCancellation?: boolean;
  parkingIncluded?: boolean;
  wifiIncluded?: boolean;
  corporateInvoicing?: boolean;
  nightsCount?: number;
  dailyRate?: number;
  hotelPhotoUrl?: string;
  fohbBenchmarkDailyRate?: number;
  fohbDiff?: number;
  distanceToCenter?: string;
}

export type TravelPartnerKey =
  | 'queropassagem'
  | 'clickbus'
  | 'buser'
  | 'deonibus'
  | 'antt_dados_abertos'
  | 'embarca_ai'
  | 'guiche_virtual'
  | 'mobifacil'
  | 'latam'
  | 'gol'
  | 'azul'
  | 'voepass'
  | 'anac_dados_abertos'
  | 'google_flights'
  | 'booking'
  | 'accor'
  | 'atlantica'
  | 'hoteis_com'
  | 'fohb_benchmark'
  | 'airbnb_work';

export type TravelVerificationReliabilityLevel =
  | 'alta_multiprovedor'
  | 'auditada_antt'
  | 'auditada_anac'
  | 'auditada_fohb'
  | 'oficial_parceiro'
  | 'direta_viacao'
  | 'direta_cia_aerea'
  | 'direta_hotel'
  | 'tarifa_fretamento';

export interface TravelProviderPricePoint {
  sourceId: string;
  sourceName: string;
  partnerKey: TravelPartnerKey;
  carrierName: string;
  baseFare: number;
  taxes: number;
  totalAmount: number;
  sourceStatus:
    | 'confirmado_api'
    | 'oficial_parceiro'
    | 'auditado_antt'
    | 'auditado_anac'
    | 'auditado_fohb'
    | 'direta_viacao'
    | 'direta_cia_aerea'
    | 'direta_hotel'
    | 'tarifa_fretamento';
  statusLabel: string;
  deepLink: string;
  queriedAt: string;
  serviceClass:
    | 'Convencional'
    | 'Executivo'
    | 'Semi-Leito'
    | 'Leito'
    | 'Cama / Leito Cama'
    | 'Econômica'
    | 'Premium Economy'
    | 'Executiva'
    | 'Primeira Classe';
  flightNumber?: string;
  aircraftModel?: string;
}

export interface TravelConsolidatedTrip {
  clusterKey: string;
  transportType?: TravelTransportType;
  carrierName: string;
  serviceClass:
    | 'Convencional'
    | 'Executivo'
    | 'Semi-Leito'
    | 'Leito'
    | 'Cama / Leito Cama'
    | 'Econômica'
    | 'Premium Economy'
    | 'Executiva'
    | 'Primeira Classe';
  departureTime: string;
  arrivalTime: string;
  durationFormatted: string;
  durationMinutes: number;
  originTerminal: string;
  originAirportCode?: string;
  destinationTerminal: string;
  destinationAirportCode?: string;
  stopsCount?: number;
  layoverAirport?: string;
  flightNumber?: string;
  aircraftModel?: string;
  isFlight?: boolean;
  isDirectFlight?: boolean;
  baggageAllowance?: string;
  bestPrice: number;
  maxPrice: number;
  priceDelta: number;
  savingsPercentage: number;
  bestProvider: TravelProviderPricePoint;
  providers: TravelProviderPricePoint[];
  providersCount: number;
  reliabilityLevel: TravelVerificationReliabilityLevel;
  reliabilityBadge: string;
  reliabilityDescription: string;
  anttReferenceCeiling?: number;
  anttDiff?: number;
  anttStatus?: 'abaixo_teto' | 'no_teto' | 'acima_teto';
  anacTariffBenchmark?: number;
  anacDiff?: number;
  anacStatus?: 'abaixo_media' | 'na_media' | 'acima_media';
  // Lodging-specific consolidated properties
  isLodging?: boolean;
  hotelName?: string;
  hotelChain?: string;
  stars?: number;
  reviewScore?: number;
  reviewCount?: number;
  neighborhood?: string;
  roomType?: string;
  bedType?: string;
  breakfastIncluded?: boolean;
  freeCancellation?: boolean;
  parkingIncluded?: boolean;
  wifiIncluded?: boolean;
  corporateInvoicing?: boolean;
  nightsCount?: number;
  dailyRate?: number;
  hotelPhotoUrl?: string;
  fohbBenchmarkDailyRate?: number;
  fohbDiff?: number;
  fohbStatus?: 'abaixo_media' | 'na_media' | 'acima_media' | 'abaixo_benchmark' | 'no_benchmark' | 'acima_benchmark';
  distanceToCenter?: string;
}

export interface TravelVerificationMetrics {
  totalOffersEvaluated: number;
  consolidatedTripsCount: number;
  multiSourceConfirmedCount: number;
  anttAuditedCount: number;
  anacAuditedCount?: number;
  fohbAuditedCount?: number;
  averageVariancePercent: number;
  maxIdentifiedSavings: number;
}

export interface TravelSourceConfig {
  id: string;
  name: string;
  partnerKey: TravelPartnerKey;
  type: TravelTransportType;
  active: boolean;
  isPrimary: boolean;
  queryMethod: TravelSourceQueryMethod;
  coverageDescription: string;
  status: TravelSourceStatus;
  officialDocumentationUrl?: string;
  requiresCredentials: boolean;
  credentialsConfigured: boolean;
  apiEndpoint?: string;
  dailyRateLimit?: number;
  callTimeoutMs: number;
  lastCheckAt?: string;
  lastResponseStatus?: string;
  notes?: string;
}

export interface TravelSearchRecord {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  criteria: TravelSearchCriteria;
  sourcesQueried: string[];
  sourcesUnavailable: string[];
  resultsCount: number;
  bestOfferId?: string;
  bestOfferSourceName?: string;
  bestOfferCarrier?: string;
  bestOfferTotalAmount?: number;
  offersSnapshot: TravelOffer[];
  queriedAt: string;
  updatedAt?: string;
  previousBestPrice?: number;
  reconsultedFromId?: string;
}

export interface TravelMissionPackage {
  missionTitle: string;
  clientName: string;
  plantAddress: string;
  workOrderNumber?: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  nightsCount: number;
  teamCount: number;
  teamMembers: Array<{
    name: string;
    role: string;
    cpf?: string;
    phone?: string;
  }>;
  transport: {
    modality: 'van_frota' | 'aereo' | 'onibus';
    estimatedKm?: number;
    fuelCostPerLiter?: number;
    fuelConsumptionKmPerL?: number;
    tollEstimate?: number;
    ticketPricePerPerson?: number;
    transferEstimate?: number;
    totalTransportCost: number;
  };
  lodging: {
    hotelName: string;
    roomType: 'duplo_twin' | 'individual_single';
    roomsCount: number;
    dailyRatePerRoom: number;
    breakfastIncluded: boolean;
    parkingIncluded: boolean;
    totalLodgingCost: number;
  };
  fieldAllowances: {
    cltDailyRatePerPerson: number;
    totalAllowanceCost: number;
    contingencyFund: number;
    totalAllowancesWithContingency: number;
  };
  summary: {
    totalMissionCost: number;
    costPerPersonDay: number;
    estimatedSavingsVsSeparate: number;
  };
  whatsappVoucherText?: string;
}

export interface TravelRequest {
  id: string;
  organizationId: string;
  requestNumber: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  travelerEmployees: Array<{
    id?: string;
    name: string;
    cpf?: string;
    role?: string;
    isExternal?: boolean;
  }>;
  travelReason: string;
  clientOrDestinationCompany?: string;
  workProjectId?: string;
  workProjectName?: string;
  costCenterId?: string;
  costCenterName?: string;
  departureDate: string;
  returnDate?: string;
  origin: string;
  destination: string;
  budgetLimit?: number;
  selectedOfferId?: string;
  selectedOfferSnapshot?: TravelOffer;
  status: TravelRequestStatus;
  approverName?: string;
  approvedAt?: string;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
  isFieldMission?: boolean;
  missionPackage?: TravelMissionPackage;
}

export type ReimbursementCategory =
  | 'combustivel'
  | 'alimentacao'
  | 'pedagio'
  | 'hospedagem'
  | 'manutencao_van'
  | 'materiais_obra'
  | 'estacionamento'
  | 'outros';

export type ReimbursementPaymentMethod =
  | 'cartao_corporativo'
  | 'dinheiro'
  | 'pix'
  | 'cartao_proprio';

export type ReimbursementStatus =
  | 'pendente'
  | 'aprovado'
  | 'reembolsado'
  | 'rejeitado'
  | 'abatido_fundo_missao';

export interface ReimbursementReceiptItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  subtotal: number;
}

export interface ReimbursementReceipt {
  id: string;
  organizationId: string;
  whatsappMessageId?: string;
  employeeName: string;
  employeePhone: string;
  receiptDate: string;
  establishmentName: string;
  cnpj?: string;
  category: ReimbursementCategory;
  totalAmount: number;
  taxAmount?: number;
  paymentMethod: ReimbursementPaymentMethod;
  items: ReimbursementReceiptItem[];
  workOrderNumber?: string;
  missionId?: string;
  fileUrl?: string;
  status: ReimbursementStatus;
  notes?: string;
  confidence?: number;
  receivedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  source?: 'whatsapp_real' | 'manual_upload' | 'simulacao_teste' | 'demo';
  rawImageUrl?: string;
}

export interface WhatsAppWebhookLog {
  id: string;
  timestamp: string;
  method: string;
  event: string;
  senderPhone?: string;
  senderName?: string;
  groupName?: string;
  groupJid?: string;
  hasMedia: boolean;
  status: 'sucesso' | 'erro' | 'handshake' | 'aviso';
  summary: string;
  receiptId?: string;
  details?: string;
}

export interface WhatsAppReceiptsConfig {
  provider:
    | 'baileys_web_bridge'
    | 'composio_whatsapp'
    | 'meta_cloud_api'
    | 'evolution_api'
    | 'z_api'
    | 'twilio'
    | 'wppconnect';
  messagingMode?: '1_to_1_private' | 'group' | 'hybrid_groups_and_private';
  connectedPhoneNumber: string;
  targetGroupName: string;
  targetGroupJid: string;
  webhookUrl: string;
  verifyToken: string;
  autoReplyConfirmation: boolean;
  filterOnlyAuthorizedEmployees: boolean;
  authorizedPhones: string[];
  status: 'conectado' | 'aguardando_qrcode' | 'desconectado';
  lastPingAt?: string;
  instanceUrl?: string;
  instanceName?: string;
  apiKey?: string;
  lastSyncAt?: string;
  // Composio non-secret identifiers
  composioConnectedAccountId?: string;
  composioPhoneNumberId?: string;
  composioWabaId?: string;
  composioEntityId?: string;
  composioAuthConfigId?: string;
  composioRealtimeEnabled?: boolean;
}

export interface TechnicianSafetyCompliance {
  technicianName: string;
  role: string;
  cpf: string;
  asoStatus: 'valido' | 'vencendo' | 'vencido';
  asoExpirationDate: string;
  nr35Status: 'valido' | 'vencendo' | 'vencido' | 'nao_aplicavel';
  nr35ExpirationDate?: string;
  nr33Status: 'valido' | 'vencendo' | 'vencido' | 'nao_aplicavel';
  nr33ExpirationDate?: string;
  nr10Status: 'valido' | 'vencendo' | 'vencido' | 'nao_aplicavel';
  nr10ExpirationDate?: string;
  nr12Status: 'valido' | 'vencendo' | 'vencido' | 'nao_aplicavel';
  nr12ExpirationDate?: string;
  epiCompleteCheck: boolean;
  isEligibleForEntry: boolean;
}

