export type MarketingSubSection =
  | 'marketing-painel'
  | 'marketing-calendario'
  | 'marketing-campanhas'
  | 'marketing-eventos'
  | 'marketing-estudio'
  | 'marketing-conteudo-obras'
  | 'marketing-biblioteca'
  | 'marketing-desempenho'
  | 'marketing-configuracoes';

export type CampaignStatus =
  | 'ideia'
  | 'planejamento'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada';

export type EventStatus =
  | 'planejamento'
  | 'confirmado'
  | 'em_andamento'
  | 'realizado'
  | 'cancelado';

export type MarketingAudience =
  | 'interno_colaboradores'
  | 'interno_lideranca'
  | 'externo_clientes'
  | 'externo_parceiros'
  | 'misto_geral';

export type MarketingChannel =
  | 'whatsapp'
  | 'email'
  | 'linkedin'
  | 'instagram'
  | 'tv_interna'
  | 'mural_fisico'
  | 'intranet'
  | 'site'
  | 'eventos_presenciais';

export type ToneOfVoice =
  | 'institucional'
  | 'profissional'
  | 'educativo'
  | 'comercial'
  | 'descontraido'
  | 'motivacional';

export type CreativeFormat =
  | 'post_quadrado'     // 1080x1080
  | 'post_vertical'     // 1080x1350
  | 'story'             // 1080x1920
  | 'banner_horizontal' // 1920x1080
  | 'cartaz_a4'         // 2480x3508
  | 'cartaz_a3'         // 3508x4960
  | 'slide_apresentacao'; // 1920x1080 (16:9)

export interface FormatDimensions {
  width: number;
  height: number;
  label: string;
  aspectRatio: string;
}

export const CREATIVE_DIMENSIONS: Record<CreativeFormat, FormatDimensions> = {
  post_quadrado: { width: 1080, height: 1080, label: 'Post Quadrado (Feed)', aspectRatio: '1:1' },
  post_vertical: { width: 1080, height: 1350, label: 'Post Vertical (Feed 4:5)', aspectRatio: '4:5' },
  story: { width: 1080, height: 1920, label: 'Story / Reels (9:16)', aspectRatio: '9:16' },
  banner_horizontal: { width: 1920, height: 1080, label: 'Banner Horizontal (TV/Site)', aspectRatio: '16:9' },
  cartaz_a4: { width: 1240, height: 1754, label: 'Cartaz A4 (Mural)', aspectRatio: '1:1.41' },
  cartaz_a3: { width: 1754, height: 2480, label: 'Cartaz A3 (Mural)', aspectRatio: '1:1.41' },
  slide_apresentacao: { width: 1920, height: 1080, label: 'Apresentação Corporativa (16:9)', aspectRatio: '16:9' },
};

export interface CorporatePresentationSlide {
  id: string;
  slideNumber: number;
  layoutType: 'title_cover' | 'bullets_highlights' | 'split_metric' | 'timeline_steps' | 'quote_closing';
  badge: string;
  title: string;
  subtitle?: string;
  topicPoints: string[];
  highlightMetric?: string;
  metricLabel?: string;
  footerTag?: string;
  themeGradient?: string;
  accentColor?: string;
}

export interface RadarEventScheduleItem {
  timeOrPhase: string;
  activity: string;
  responsible: string;
}

export interface CalendarEventDate {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: 'feriado_nacional' | 'feriado_estadual' | 'feriado_municipal' | 'conscientizacao' | 'setor_industrial' | 'data_comemorativa' | 'empresa_interna';
  description: string;
  isMobileDate?: boolean;
  colorHex?: string;
  awarenessMonth?: string; // e.g., 'Janeiro Branco', 'Outubro Rosa'
  state?: string;
  city?: string;
  organizationId?: string; // custom company dates
  suggestedAction?: string;
}

export interface RadarOpportunity {
  id: string;
  dateId?: string;
  theme: string;
  dateReference: string;
  daysAhead: number;
  justification: string;
  objective: string;
  audience: MarketingAudience;
  scope: 'interno' | 'externo' | 'misto';
  proposedAction: string;
  recommendedChannels: MarketingChannel[];
  suggestedMaterials: string[];
  suggestedTasks: string[];
  structuredSchedule?: RadarEventScheduleItem[];
  companyProfileTarget?: 'industria' | 'servicos' | 'ambos';
  estimatedCostRange?: string;
  priority: 'alta' | 'media' | 'baixa';
  category: 'saude_seguranca' | 'cultura_clima' | 'institucional_vendas' | 'qualidade_operacoes' | 'ambiental';
  isApproved?: boolean;
  convertedCampaignId?: string;
  convertedEventId?: string;
}

export interface CampaignTask {
  id: string;
  title: string;
  assignedToName?: string;
  dueDate: string;
  completed: boolean;
}

export interface MarketingCampaign {
  id: string;
  organizationId: string;
  name: string;
  theme: string;
  objective: string;
  description: string;
  audience: MarketingAudience;
  scope: 'interno' | 'externo' | 'misto';
  startDate: string;
  endDate: string;
  department: string;
  responsibleName: string;
  responsibleEmail?: string;
  estimatedBudget: number;
  actualBudgetSpent?: number;
  channels: MarketingChannel[];
  status: CampaignStatus;
  tasks: CampaignTask[];
  materialsCount?: number;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  resultsSummary?: string;
  keyMetrics?: {
    views?: number;
    interactions?: number;
    leadsGenerated?: number;
    participantsCount?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CorporateEventParticipant {
  id: string;
  name: string;
  email?: string;
  department?: string;
  confirmed: boolean;
  attended?: boolean;
  confirmedAt?: string;
}

export interface CorporateEventSupplier {
  id: string;
  name: string;
  serviceCategory: string; // e.g., 'Buffet', 'Som/Áudio', 'Brindes', 'Estrutura'
  estimatedCost: number;
  actualCost?: number;
  status: 'cotacao' | 'aprovado' | 'pago';
}

export interface CorporateEvent {
  id: string;
  organizationId: string;
  name: string;
  objective: string;
  description: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  location: string;
  isVirtualOrHybrid?: boolean;
  virtualMeetingUrl?: string;
  audience: MarketingAudience;
  estimatedAttendees: number;
  actualAttendees?: number;
  responsibleName: string;
  estimatedBudget: number;
  actualBudgetSpent?: number;
  status: EventStatus;
  participants: CorporateEventParticipant[];
  suppliers: CorporateEventSupplier[];
  tasks: CampaignTask[];
  invitationAssetId?: string;
  postEventResults?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeLayer {
  id: string;
  type: 'text_title' | 'text_subtitle' | 'text_body' | 'badge' | 'button_cta' | 'logo' | 'shape';
  text?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  alignment?: 'left' | 'center' | 'right';
  xPercent: number; // 0 - 100
  yPercent: number; // 0 - 100
  widthPercent?: number;
  heightPercent?: number;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
}

export interface CreativeVariation {
  id: string;
  name: string;
  headline: string;
  subheadline?: string;
  bodyText: string;
  callToAction: string;
  badgeText?: string;
  badgeColor?: string;
  backgroundColor?: string;
  backgroundGradient?: string;
  accentColor?: string;
  socialCaption: string;
  hashtags: string[];
}

export interface CreativeAsset {
  id: string;
  organizationId: string;
  campaignId?: string;
  eventId?: string;
  title: string;
  format: CreativeFormat;
  dimensions: FormatDimensions;
  category: 'conscientizacao' | 'seguranca_sipat' | 'comunicado_interno' | 'marketing_institucional' | 'servicos_obras' | 'reconhecimento' | 'convite_evento';
  theme: string;
  targetAudience: MarketingAudience;
  toneOfVoice: ToneOfVoice;
  backgroundColor: string;
  backgroundGradient?: string;
  backgroundImageUrl?: string;
  layers: CreativeLayer[];
  variations?: CreativeVariation[];
  generatedCopy?: {
    headline: string;
    subheadline?: string;
    bodyText: string;
    callToAction: string;
    socialCaption?: string;
    hashtags?: string[];
  };
  exportPngUrl?: string;
  status: 'rascunho' | 'aprovado' | 'obsoleto';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandIdentityConfig {
  id: string;
  organizationId: string;
  companyName: string;
  tradingName: string; // Nome fantasia
  primaryLogoUrl: string;
  whiteLogoUrl?: string;
  symbolLogoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  darkColor: string;
  lightColor: string;
  fontFamilyHeadings: string;
  fontFamilyBody: string;
  brandVoiceGuidelines: string;
  slogan?: string;
  websiteUrl?: string;
  officialSocialHandles?: {
    instagram?: string;
    linkedin?: string;
    facebook?: string;
    youtube?: string;
  };
  updatedAt: string;
}

export interface ProjectToContentRequest {
  workOrderId?: string;
  projectName: string;
  clientName?: string; // Optional - sensitive
  maskClientName: boolean;
  location: string;
  serviceType: 'caldeiraria' | 'tubulacao_inox' | 'montagem_industrial' | 'soldagem_especial' | 'manutencao_parada' | 'instalacao_tanques';
  technicalHighlights: string[];
  scopeSummary: string;
  completionDate: string;
  approvedForExternalMarketing: boolean;
  selectedTone: ToneOfVoice;
}

export interface MarketingAnalyticsOverview {
  periodDays: number;
  socialMedia: {
    totalFollowers: number;
    followersGrowthPercent: number;
    impressionsTotal: number;
    reachTotal: number;
    engagementRatePercent: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    topPosts: Array<{
      id: string;
      platform: 'instagram' | 'linkedin' | 'facebook';
      title: string;
      date: string;
      reach: number;
      interactions: number;
      format: string;
    }>;
  };
  website: {
    totalSessions: number;
    uniqueUsers: number;
    pageViews: number;
    bounceRatePercent: number;
    avgSessionDurationSecs: number;
    contactLeadsSubmitted: number;
    trafficSources: Array<{
      source: string;
      sessions: number;
      percentage: number;
    }>;
  };
  paidTraffic: {
    totalInvestment: number;
    impressions: number;
    clicks: number;
    ctrPercent: number;
    avgCpc: number;
    leadsGenerated: number;
    costPerLead: number;
  };
  aiInsights: string[];
}
