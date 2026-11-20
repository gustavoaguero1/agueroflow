import {
  CalendarEventDate,
  RadarOpportunity,
  MarketingCampaign,
  CorporateEvent,
  CreativeAsset,
  BrandIdentityConfig,
  ProjectToContentRequest,
  MarketingAnalyticsOverview,
  CREATIVE_DIMENSIONS,
} from '../types/marketing';

// ============================================================================
// BRAZILIAN MOBILE DATES & GAUSS EASTER ALGORITHM
// ============================================================================

/**
 * Calculates Easter Sunday for a given year using the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 */
export function calculateEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Dynamically computes all Brazilian national, state (SP), municipal, mobile,
 * industrial, and awareness calendar dates for a specified year.
 */
export function getCalendarDatesForYear(year: number): CalendarEventDate[] {
  const easter = calculateEasterDate(year);
  const carnavalTuesday = addDays(easter, -47);
  const carnavalMonday = addDays(easter, -48);
  const ashWednesday = addDays(easter, -46);
  const goodFriday = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);

  const dates: CalendarEventDate[] = [
    // ------------------------------------------------------------------------
    // Feriados Nacionais & Estaduais (SP) & Móveis
    // ------------------------------------------------------------------------
    {
      id: `nat_${year}_01_01`,
      title: 'Confraternização Universal (Ano Novo)',
      date: `${year}-01-01`,
      category: 'feriado_nacional',
      description: 'Feriado nacional de abertura do ano civil e renovação das metas corporativas.',
      colorHex: '#3B82F6',
      suggestedAction: 'Mensagem de boas-vindas e metas de segurança e qualidade do ano.',
    },
    {
      id: `mob_${year}_carnaval_seg`,
      title: 'Carnaval (Segunda-feira)',
      date: formatDateISO(carnavalMonday),
      category: 'data_comemorativa',
      isMobileDate: true,
      description: 'Ponto facultativo nacional e recesso operacional em obras e fábrica.',
      colorHex: '#8B5CF6',
    },
    {
      id: `mob_${year}_carnaval_ter`,
      title: 'Carnaval (Terça-feira)',
      date: formatDateISO(carnavalTuesday),
      category: 'data_comemorativa',
      isMobileDate: true,
      description: 'Terça-feira de Carnaval.',
      colorHex: '#8B5CF6',
      suggestedAction: 'Campanha de segurança e direção defensiva pré-feriado prolongado.',
    },
    {
      id: `mob_${year}_quarta_cinzas`,
      title: 'Quarta-feira de Cinzas',
      date: formatDateISO(ashWednesday),
      category: 'data_comemorativa',
      isMobileDate: true,
      description: 'Retorno às atividades fabris a partir das 12h ou expediente adaptado.',
      colorHex: '#64748B',
    },
    {
      id: `nat_${year}_04_21`,
      title: 'Tiradentes & Dia do Metalúrgico',
      date: `${year}-04-21`,
      category: 'feriado_nacional',
      description: 'Feriado nacional cívico e homenagem aos profissionais da indústria metalúrgica e caldeiraria.',
      colorHex: '#EF4444',
      suggestedAction: 'Homenagem especial aos soldadores, montadores e caldeireiros da Aguero Inox.',
    },
    {
      id: `mob_${year}_sexta_santa`,
      title: 'Sexta-feira Santa (Paixão de Cristo)',
      date: formatDateISO(goodFriday),
      category: 'feriado_nacional',
      isMobileDate: true,
      description: 'Feriado nacional religioso que antecede o Domingo de Páscoa.',
      colorHex: '#6366F1',
    },
    {
      id: `mob_${year}_pascoa`,
      title: 'Páscoa',
      date: formatDateISO(easter),
      category: 'data_comemorativa',
      isMobileDate: true,
      description: 'Celebração da Páscoa.',
      colorHex: '#F59E0B',
      suggestedAction: 'Ação de integração de colaboradores com entrega de chocolates corporativos.',
    },
    {
      id: `nat_${year}_05_01`,
      title: 'Dia Mundial do Trabalho',
      date: `${year}-05-01`,
      category: 'feriado_nacional',
      description: 'Homenagem aos trabalhadores de todas as áreas fabris e administrativas.',
      colorHex: '#10B981',
      suggestedAction: 'Vídeo institucional e mural com fotos dos colaboradores em campo.',
    },
    {
      id: `mob_${year}_corpus_christi`,
      title: 'Corpus Christi',
      date: formatDateISO(corpusChristi),
      category: 'feriado_nacional',
      isMobileDate: true,
      description: 'Ponto facultativo nacional e feriado municipal frequente em cidades industriais.',
      colorHex: '#EC4899',
    },
    {
      id: `sp_${year}_07_09`,
      title: 'Revolução Constitucionalista de 1932 (Feriado Estadual SP)',
      date: `${year}-07-09`,
      category: 'feriado_estadual',
      state: 'SP',
      description: 'Data magna do Estado de São Paulo, polo principal de operações industriais.',
      colorHex: '#0284C7',
    },
    {
      id: `nat_${year}_09_07`,
      title: 'Independência do Brasil',
      date: `${year}-09-07`,
      category: 'feriado_nacional',
      description: 'Feriado nacional da Independência.',
      colorHex: '#16A34A',
    },
    {
      id: `nat_${year}_10_12`,
      title: 'Nossa Senhora Aparecida & Dia das Crianças',
      date: `${year}-10-12`,
      category: 'feriado_nacional',
      description: 'Padroeira do Brasil e celebração dos filhos dos colaboradores.',
      colorHex: '#38BDF8',
      suggestedAction: 'Ação especial Dia das Crianças com desenhos dos filhos expostos na fábrica.',
    },
    {
      id: `nat_${year}_11_02`,
      title: 'Finados',
      date: `${year}-11-02`,
      category: 'feriado_nacional',
      description: 'Feriado nacional de respeito e reflexão.',
      colorHex: '#64748B',
    },
    {
      id: `nat_${year}_11_15`,
      title: 'Proclamação da República',
      date: `${year}-11-15`,
      category: 'feriado_nacional',
      description: 'Feriado nacional.',
      colorHex: '#059669',
    },
    {
      id: `nat_${year}_11_20`,
      title: 'Dia Nacional de Zumbi e da Consciência Negra',
      date: `${year}-11-20`,
      category: 'feriado_nacional',
      description: 'Feriado nacional de valorização da diversidade, equidade e respeito.',
      colorHex: '#1E293B',
      suggestedAction: 'Comunicação interna sobre diversidade, respeito e igualdade de oportunidades.',
    },
    {
      id: `nat_${year}_12_25`,
      title: 'Natal',
      date: `${year}-12-25`,
      category: 'feriado_nacional',
      description: 'Celebração natalina com colaboradores, clientes e parceiros.',
      colorHex: '#DC2626',
      suggestedAction: 'Cesta de final de ano, vídeo de agradecimento da diretoria e confraternização.',
    },

    // ------------------------------------------------------------------------
    // Campanhas de Conscientização & Saúde Ocupacional (Meses Coloridos)
    // ------------------------------------------------------------------------
    {
      id: `mes_${year}_01_branco`,
      title: 'Janeiro Branco: Saúde Mental e Emocional',
      date: `${year}-01-10`,
      category: 'conscientizacao',
      awarenessMonth: 'Janeiro Branco',
      description: 'Campanha de conscientização sobre cuidados com a saúde mental e equilíbrio emocional no trabalho.',
      colorHex: '#94A3B8',
      suggestedAction: 'Palestra com psicólogo ou roda de conversa sobre estresse e foco.',
    },
    {
      id: `mes_${year}_03_mulher`,
      title: 'Dia Internacional da Mulher & Mês da Mulher',
      date: `${year}-03-08`,
      category: 'conscientizacao',
      description: 'Valorização das mulheres na engenharia, montagem industrial e administração.',
      colorHex: '#EC4899',
      suggestedAction: 'Café da manhã especial, entrega de brinde institucional e depoimentos em vídeo.',
    },
    {
      id: `mes_${year}_03_agua`,
      title: 'Dia Mundial da Água',
      date: `${year}-03-22`,
      category: 'conscientizacao',
      description: 'Conscientização sobre preservação dos recursos hídricos e tubulações sanitárias limpas.',
      colorHex: '#0EA5E9',
      suggestedAction: 'Post técnico sobre a durabilidade e pureza do aço inox em redes de água.',
    },
    {
      id: `mes_${year}_04_verde`,
      title: 'Abril Verde: Segurança e Saúde no Trabalho (SST & NRs)',
      date: `${year}-04-07`,
      category: 'conscientizacao',
      awarenessMonth: 'Abril Verde',
      description: 'Mês fundamental na indústria para prevenção de acidentes, uso de EPIs e revisão de NRs.',
      colorHex: '#22C55E',
      suggestedAction: 'Campanha massiva de DDS, blitz de EPI e premiação de zero acidentes.',
    },
    {
      id: `mes_${year}_05_amarelo`,
      title: 'Maio Amarelo: Atenção Pela Vida no Trânsito',
      date: `${year}-05-12`,
      category: 'conscientizacao',
      awarenessMonth: 'Maio Amarelo',
      description: 'Segurança no trajeto dos colaboradores e direção defensiva da frota técnica.',
      colorHex: '#EAB308',
      suggestedAction: 'Checklist veicular preventivo e conscientização para condutores e técnicos.',
    },
    {
      id: `mes_${year}_06_vermelho`,
      title: 'Junho Vermelho: Doação de Sangue',
      date: `${year}-06-14`,
      category: 'conscientizacao',
      awarenessMonth: 'Junho Vermelho',
      description: 'Mobilização solidária para doação de sangue no hemocentro regional.',
      colorHex: '#DC2626',
      suggestedAction: 'Transporte coletivo para os colaboradores voluntários doarem no hemocentro.',
    },
    {
      id: `mes_${year}_06_meio_ambiente`,
      title: 'Dia Mundial do Meio Ambiente',
      date: `${year}-06-05`,
      category: 'conscientizacao',
      description: 'Sustentabilidade industrial, reciclabilidade 100% do aço inox e descarte correto.',
      colorHex: '#16A34A',
      suggestedAction: 'Artigo sobre a circularidade do aço inoxidável e gestão de sucatas.',
    },
    {
      id: `mes_${year}_08_lilas`,
      title: 'Agosto Lilás: Enfrentamento à Violência contra a Mulher',
      date: `${year}-08-18`,
      category: 'conscientizacao',
      awarenessMonth: 'Agosto Lilás',
      description: 'Campanha de conscientização e canais de denúncia e acolhimento seguro.',
      colorHex: '#A855F7',
    },
    {
      id: `mes_${year}_09_amarelo`,
      title: 'Setembro Amarelo: Valorização da Vida e Prevenção ao Suicídio',
      date: `${year}-09-10`,
      category: 'conscientizacao',
      awarenessMonth: 'Setembro Amarelo',
      description: 'Acolhimento, empatia e quebra de tabus na equipe.',
      colorHex: '#FBBF24',
      suggestedAction: 'Mural de recados positivos e roda de escuta ativa com lideranças.',
    },
    {
      id: `mes_${year}_10_rosa`,
      title: 'Outubro Rosa: Prevenção ao Câncer de Mama',
      date: `${year}-10-05`,
      category: 'conscientizacao',
      awarenessMonth: 'Outubro Rosa',
      description: 'Alerta sobre diagnóstico precoce do câncer de mama e colo do útero.',
      colorHex: '#F43F5E',
      suggestedAction: 'Camisas temáticas rosas para a equipe e distribuição de laços.',
    },
    {
      id: `mes_${year}_11_azul`,
      title: 'Novembro Azul: Saúde do Homem e Prevenção ao Câncer de Próstata',
      date: `${year}-11-06`,
      category: 'conscientizacao',
      awarenessMonth: 'Novembro Azul',
      description: 'Incentivo a exames periódicos em um setor com alta representatividade masculina.',
      colorHex: '#2563EB',
      suggestedAction: 'Palestra médica com urologista na fábrica e conscientização.',
    },
    {
      id: `mes_${year}_12_vermelho`,
      title: 'Dezembro Vermelho: Prevenção ao HIV/AIDS e ISTs',
      date: `${year}-12-01`,
      category: 'conscientizacao',
      awarenessMonth: 'Dezembro Vermelho',
      description: 'Conscientização em saúde preventiva.',
      colorHex: '#B91C1C',
    },

    // ------------------------------------------------------------------------
    // Datas Industriais & Profissionais (Caldeiraria, Inox & Engenharia)
    // ------------------------------------------------------------------------
    {
      id: `ind_${year}_05_25`,
      title: 'Dia Nacional da Indústria',
      date: `${year}-05-25`,
      category: 'setor_industrial',
      description: 'Celebração da força produtiva industrial brasileira, tecnologia e inovação.',
      colorHex: '#475569',
      suggestedAction: 'Publicação institucional no LinkedIn mostrando a capacidade de fabricação e corte a laser.',
    },
    {
      id: `ind_${year}_09_23`,
      title: 'Dia do Soldador',
      date: `${year}-09-23`,
      category: 'setor_industrial',
      description: 'Data primordial para homenagear os soldadores TIG/MIG de caldeiraria sanitária e industrial.',
      colorHex: '#F97316',
      suggestedAction: 'Vídeo close-up do cordão de solda TIG com purga e brinde aos soldadores qualificados.',
    },
    {
      id: `ind_${year}_11_12`,
      title: 'Dia Mundial da Qualidade (Segunda Quinta de Novembro)',
      date: `${year}-11-12`,
      category: 'setor_industrial',
      description: 'Foco no controle dimensional, ensaios não destrutivos (líquido penetrante) e rastreabilidade.',
      colorHex: '#0EA5E9',
      suggestedAction: 'Destaque para o setor de controle de qualidade e certificados de teste de estanqueidade.',
    },
    {
      id: `ind_${year}_12_11`,
      title: 'Dia do Engenheiro',
      date: `${year}-12-11`,
      category: 'setor_industrial',
      description: 'Homenagem aos engenheiros mecânicos, de produção e de projetos que transformam aço em soluções.',
      colorHex: '#3B82F6',
      suggestedAction: 'Homenagem à equipe de engenharia e projetos com fotos dos projetos 3D e fabricação real.',
    },
    {
      id: `int_${year}_sipat`,
      title: 'SIPAT — Semana Interna de Prevenção de Acidentes',
      date: `${year}-08-25`,
      category: 'empresa_interna',
      description: 'Semana oficial obrigatória com palestras, gincanas de segurança e conscientização de riscos.',
      colorHex: '#10B981',
      suggestedAction: 'Planejamento de 5 dias temáticos com premiação de EPIs e café com segurança.',
    },
    {
      id: `int_${year}_confraternizacao`,
      title: 'Confraternização Anual de Encerramento',
      date: `${year}-12-18`,
      category: 'empresa_interna',
      description: 'Almoço de final de ano e premiação de colaboradores destaque do ano.',
      colorHex: '#E11D48',
      suggestedAction: 'Locação de espaço, contratação de buffet e vídeo retrospectiva das obras concluídas.',
    },
  ];

  return dates.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// AI RADAR DE OPORTUNIDADES GENERATOR (30-60 DAYS AHEAD)
// ============================================================================

export function generateOpportunitiesRadar(
  year: number = new Date().getFullYear(),
  currentDateStr: string = formatDateISO(new Date()),
  companyProfile: 'industria' | 'servicos' | 'ambos' = 'ambos'
): RadarOpportunity[] {
  const allDates = getCalendarDatesForYear(year);
  const now = new Date(currentDateStr);

  const upcoming = allDates
    .map((item) => {
      const itemDate = new Date(item.date);
      const diffTime = itemDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { item, diffDays };
    })
    .filter(({ diffDays }) => diffDays >= -5 && diffDays <= 75)
    .sort((a, b) => a.diffDays - b.diffDays);

  const radarList: RadarOpportunity[] = upcoming.map(({ item, diffDays }, idx) => {
    let scope: 'interno' | 'externo' | 'misto' = 'interno';
    let audience: any = 'interno_colaboradores';
    let priority: 'alta' | 'media' | 'baixa' = 'media';
    let category: 'saude_seguranca' | 'cultura_clima' | 'institucional_vendas' | 'qualidade_operacoes' | 'ambiental' = 'cultura_clima';
    let profileTarget: 'industria' | 'servicos' | 'ambos' = 'ambos';
    let suggestedMaterials = ['Post Instagram Feed (1080x1350)', 'Cartaz Mural A4', 'Disparo WhatsApp Comunicação'];
    let suggestedTasks = ['Validar orçamento e fornecedores', 'Criar artes no Estúdio Criativo', 'Programar disparos nos canais'];

    let structuredSchedule = [
      { timeOrPhase: 'Fase 1 (D-15)', activity: 'Definição de briefing, aprovação de orçamento e materiais gráficos', responsible: 'Marketing & Comunicação' },
      { timeOrPhase: 'Fase 2 (D-7)', activity: 'Divulgação nos canais internos (WhatsApp, murais e TV Corporativa)', responsible: 'Comunicação Interna' },
      { timeOrPhase: 'Fase 3 (Dia D)', activity: 'Execução do evento/ação com registro fotográfico e engajamento da equipe', responsible: 'Comitê de Eventos' },
      { timeOrPhase: 'Fase 4 (D+3)', activity: 'Publicação de retrospectiva e mensuração de alcance e feedbacks', responsible: 'Marketing Digital' },
    ];

    if (item.category === 'conscientizacao' || item.title.includes('SST') || item.title.includes('Verde') || item.title.includes('SIPAT')) {
      category = 'saude_seguranca';
      priority = 'alta';
      audience = 'interno_colaboradores';
      scope = 'interno';
      profileTarget = 'industria';
      suggestedMaterials = ['Banner TV Corporativa (1920x1080)', 'Cartaz A3 para Mural de Fábrica', 'Guia de Diálogo Diário de Segurança (DDS)'];
      suggestedTasks = ['Agendar palestras técnicas com especialistas', 'Comprar brindes/camisetas temáticas da campanha', 'Divulgar cronograma no WhatsApp dos colaboradores'];
      structuredSchedule = [
        { timeOrPhase: '08:00 - 08:30', activity: 'Abertura oficial com café da manhã e palavra da diretoria', responsible: 'Diretoria & RH' },
        { timeOrPhase: '08:30 - 10:00', activity: 'Palestra técnica sobre prevenção de acidentes e uso de EPIs', responsible: 'Engenheiro de SST' },
        { timeOrPhase: '10:00 - 11:30', activity: 'Blitz prática de checagem e troca de EPIs no galpão fabril', responsible: 'Técnico de Segurança' },
        { timeOrPhase: '15:00 - 16:00', activity: 'Gincana premiada e encerramento com entrega de brindes', responsible: 'CIPA & Marketing' },
      ];
    } else if (item.category === 'setor_industrial') {
      category = 'institucional_vendas';
      priority = 'alta';
      audience = 'externo_clientes';
      scope = 'externo';
      profileTarget = 'industria';
      suggestedMaterials = ['Carrossel Técnico LinkedIn (1080x1080)', 'Vídeo Reels dos Bastidores (1080x1920)', 'E-mail Marketing para Clientes'];
      suggestedTasks = ['Gravar depoimento de soldador ou engenheiro', 'Revisar portfólio de obras recentes', 'Disparar newsletter técnica'];
      structuredSchedule = [
        { timeOrPhase: 'Semana 1', activity: 'Levantamento de fotos em alta resolução de soldas e montagens', responsible: 'Engenharia de Campo' },
        { timeOrPhase: 'Semana 2', activity: 'Criação da apresentação e carrossel temático no Estúdio Criativo', responsible: 'Marketing' },
        { timeOrPhase: 'Semana 3', activity: 'Disparo de campanha patrocinada no LinkedIn para compradores industriais', responsible: 'Gestor de Tráfego' },
        { timeOrPhase: 'Semana 4', activity: 'SDR/Comercial entra em contato com leads gerados pela campanha', responsible: 'Equipe Comercial' },
      ];
    } else if (item.category === 'feriado_nacional') {
      category = 'cultura_clima';
      priority = 'media';
      scope = 'misto';
      suggestedMaterials = ['Comunicado de Expediente e Plantão (Post 1080x1080)', 'Mensagem WhatsApp'];
      suggestedTasks = ['Alinhar escala de plantão de emergência com clientes', 'Fixar comunicado de folga nos murais'];
    }

    const channels: any[] =
      (scope as string) === 'externo'
        ? ['linkedin', 'instagram', 'site']
        : (scope as string) === 'misto'
        ? ['linkedin', 'instagram', 'whatsapp', 'tv_interna']
        : ['whatsapp', 'tv_interna', 'mural_fisico'];

    return {
      id: `rad_${idx}_${item.id}`,
      dateId: item.id,
      theme: item.title,
      dateReference: item.date,
      daysAhead: diffDays,
      justification: item.description,
      objective: item.suggestedAction || `Engajar colaboradores e clientes através do marco de ${item.title}.`,
      audience,
      scope,
      companyProfileTarget: profileTarget,
      proposedAction: item.suggestedAction || `Criar plano de ação de 1 semana antecedendo a data com materiais nos canais oficiais.`,
      recommendedChannels: channels,
      suggestedMaterials,
      suggestedTasks,
      structuredSchedule,
      estimatedCostRange: priority === 'alta' ? 'R$ 1.200 — R$ 3.500' : 'R$ 300 — R$ 800',
      priority,
      category,
    };
  });

  // Filter based on companyProfile if specific
  let effectiveList = companyProfile !== 'ambos'
    ? radarList.filter((r) => r.companyProfileTarget === companyProfile || r.companyProfileTarget === 'ambos')
    : [...radarList];

  // Specific evergreen additions based on companyProfile
  if (companyProfile === 'servicos' || companyProfile === 'ambos') {
    effectiveList.push({
      id: `rad_servicos_parada_${currentDateStr}`,
      theme: 'Paradas de Manutenção Preventiva (Shutdown de Inverno/Verão)',
      dateReference: currentDateStr,
      daysAhead: 20,
      justification: 'Indústrias farmacêuticas, químicas e alimentícias planejam paradas técnicas obrigatórias. Momento ideal para oferecer montagem e substituição de spools em inox.',
      objective: 'Antecipar contratos de montagem de campo e locação de equipes de soldagem qualificada.',
      audience: 'externo_clientes',
      scope: 'externo',
      companyProfileTarget: 'servicos',
      proposedAction: 'Disparar apresentação corporativa e contatar diretores de planta e gerentes de utilidades.',
      recommendedChannels: ['linkedin', 'email', 'whatsapp'],
      suggestedMaterials: ['Apresentação Corporativa em PDF (16:9)', 'One-Page de Capacidade Técnica de Campo', 'E-mail Comercial Personalizado'],
      suggestedTasks: ['Mapear 30 indústrias da região com paradas previstas', 'Exportar portfólio de montagens de campo em PDF', 'Disparar e-mails para gerentes de manutenção'],
      structuredSchedule: [
        { timeOrPhase: 'Semana 1 (D-30)', activity: 'Mapeamento de plantas industriais clientes com paradas de utilidades agendadas', responsible: 'Engenharia Comercial' },
        { timeOrPhase: 'Semana 2 (D-20)', activity: 'Envio de apresentação executiva e proposta de prontidão de equipes de solda TIG', responsible: 'Marketing & Vendas' },
        { timeOrPhase: 'Semana 3 (D-10)', activity: 'Reunião de alinhamento com clientes para validação de PT, APR e EPIs específicos', responsible: 'Supervisor de Montagem' },
        { timeOrPhase: 'Semana 4 (Dia D)', activity: 'Mobilização de caldeireiros e soldadores no cliente com diário de obra digital', responsible: 'Equipe de Campo' },
      ],
      estimatedCostRange: 'R$ 800 — R$ 2.000',
      priority: 'alta',
      category: 'institucional_vendas',
    });

    effectiveList.push({
      id: `rad_servicos_nr35_${currentDateStr}`,
      theme: 'Workshop de Segurança em Altura (NR-35) & Espaço Confinado (NR-33)',
      dateReference: currentDateStr,
      daysAhead: 35,
      justification: 'As montagens em campo exigem rigor absoluto nas tubulações aéreas e silos. Ações de capacitação evitam sinistros e reforçam o posicionamento de conformidade total.',
      objective: 'Reciclar 100% dos montadores e gerar fotos/vídeos de autoridade em segurança para divulgação institucional.',
      audience: 'interno_colaboradores',
      scope: 'misto',
      companyProfileTarget: 'servicos',
      proposedAction: 'Organizar dia de imersão prática com montagem de linha de vida e simulado de resgate.',
      recommendedChannels: ['whatsapp', 'tv_interna', 'linkedin', 'instagram'],
      suggestedMaterials: ['Guia de Bolso NR-35/NR-33', 'Banner Mural da Fábrica', 'Reels Bastidores de Treinamento'],
      suggestedTasks: ['Contratar instrutor credenciado', 'Revisar cintos de segurança e trava-quedas', 'Registrar fotos para o LinkedIn institucional'],
      structuredSchedule: [
        { timeOrPhase: '08:00 - 10:00', activity: 'Abertura e reciclagem teórica dos procedimentos operacionais de risco', responsible: 'Engenheiro de Segurança' },
        { timeOrPhase: '10:15 - 12:00', activity: 'Simulado prático de inspeção de talabartes, pontos de ancoragem e trava-quedas', responsible: 'Técnico de SST' },
        { timeOrPhase: '13:30 - 15:30', activity: 'Prática de resgate simulado em altura e plano de evacuação de emergência', responsible: 'Instrutor Externo' },
        { timeOrPhase: '16:00 - 17:00', activity: 'Entrega de certificados aos colaboradores e registro fotográfico oficial', responsible: 'RH & Marketing' },
      ],
      estimatedCostRange: 'R$ 2.400 — R$ 4.800',
      priority: 'alta',
      category: 'saude_seguranca',
    });
  }

  if (companyProfile === 'industria' || companyProfile === 'ambos') {
    effectiveList.push({
      id: `rad_industria_qualidade_${currentDateStr}`,
      theme: 'Semana da Qualidade em Solda ASME IX & Caldeiraria Sanitária',
      dateReference: currentDateStr,
      daysAhead: 25,
      justification: 'Destaque para o acabamento sanitário Ra < 0.4 µm e controle dimensional rigoroso de tanques e curvas OD fabricados no galpão.',
      objective: 'Reforçar internamente o padrão de excelência zero retrabalho e externamente atrair indústrias alimentícias e cosméticas.',
      audience: 'misto_geral',
      scope: 'misto',
      companyProfileTarget: 'industria',
      proposedAction: 'Campanha de reconhecimento do melhor cordão de solda TIG interno e publicação de carrossel técnico externo.',
      recommendedChannels: ['linkedin', 'instagram', 'tv_interna', 'mural_fisico'],
      suggestedMaterials: ['Apresentação de Casos Reais em Slides PDF', 'Cartazes de Reconhecimento no Galpão', 'Post Carrossel LinkedIn'],
      suggestedTasks: ['Selecionar as 5 melhores soldas do mês para premiação', 'Criar carrossel com fotos macro de solda sanitária', 'Entregar troféu simbólico no café fabril'],
      structuredSchedule: [
        { timeOrPhase: 'Segunda-feira', activity: 'Lançamento da Semana com café da manhã fabril e metas de qualidade zero defeito', responsible: 'Gerente Industrial' },
        { timeOrPhase: 'Quarta-feira', activity: 'Inspeção por líquido penetrante ao vivo aberta aos aprendizes de caldeiraria', responsible: 'Inspetor de Solda N2' },
        { timeOrPhase: 'Sexta-feira (15h)', activity: 'Premiação do Soldador Destaque do Trimestre e gravação de depoimento', responsible: 'Diretoria & RH' },
        { timeOrPhase: 'Segunda seguinte', activity: 'Veiculação do post técnico no LinkedIn com os resultados e fotos da equipe', responsible: 'Marketing Digital' },
      ],
      estimatedCostRange: 'R$ 1.500 — R$ 3.000',
      priority: 'alta',
      category: 'qualidade_operacoes',
    });
  }

  // Guarantee high-value industrial evergreen opportunities if window is small
  if (effectiveList.length < 4) {
    effectiveList.push({
      id: `rad_evergreen_obras`,
      theme: 'Showcase Técnico de Tubulações Sanitárias & Obras',
      dateReference: currentDateStr,
      daysAhead: 15,
      justification: 'Mostrar a capacidade técnica em aço inoxidável e soldagem TIG para novos clientes e parceiros.',
      objective: 'Gerar autoridade e novos contatos comerciais qualificados.',
      audience: 'externo_clientes',
      scope: 'externo',
      companyProfileTarget: 'industria',
      proposedAction: 'Selecionar 1 obra industrial concluída recente e transformar em post técnico no LinkedIn.',
      recommendedChannels: ['linkedin', 'instagram', 'site'],
      suggestedMaterials: ['Post LinkedIn Carrossel (1080x1350)', 'Estudo de Caso em PDF'],
      suggestedTasks: ['Ocultar nome do cliente por sigilo', 'Listar espessura, diâmetro e tipo de aço', 'Agendar post'],
      structuredSchedule: [
        { timeOrPhase: 'Fase 1', activity: 'Seleção de imagens e isométricos aprovados pelo cliente', responsible: 'Engenharia' },
        { timeOrPhase: 'Fase 2', activity: 'Diagramação de slides de alta autoridade no Estúdio Criativo', responsible: 'Marketing' },
        { timeOrPhase: 'Fase 3', activity: 'Publicação no LinkedIn e encaminhamento para clientes estratégicos', responsible: 'Comercial' },
      ],
      estimatedCostRange: 'Custo interno (R$ 0)',
      priority: 'alta',
      category: 'institucional_vendas',
    });
  }

  return effectiveList;
}

// ============================================================================
// BRAND IDENTITY DEFAULT (AGUERO INOX)
// ============================================================================

export const DEFAULT_BRAND_IDENTITY: BrandIdentityConfig = {
  id: 'brand_aguero_default',
  organizationId: 'org_aguero_default',
  companyName: 'Aguero Inox & Caldeiraria Industrial Ltda',
  tradingName: 'Aguero Inox',
  primaryLogoUrl: '/logo-aguero.png',
  primaryColor: '#0284C7', // Azul Industrial Metálico
  secondaryColor: '#0F172A', // Slate Escuro Fabril
  accentColor: '#38BDF8', // Cyan Refletivo
  darkColor: '#090D16', // Fundo Dark Platform
  lightColor: '#F8FAFC', // Branco Gelo
  fontFamilyHeadings: 'Inter, sans-serif',
  fontFamilyBody: 'Inter, sans-serif',
  brandVoiceGuidelines:
    'Voz técnica, precisa, confiável e colaborativa. Destacar precisão dimensional, solda sanitária de alto acabamento, segurança zero acidentes e compromisso com o prazo de montagem fabril.',
  slogan: 'Engenharia, Tubulações e Caldeiraria em Aço Inox com Rigor Sanitário',
  websiteUrl: 'https://agueroinox.com.br',
  officialSocialHandles: {
    instagram: '@agueroinox',
    linkedin: 'linkedin.com/company/aguero-inox',
  },
  updatedAt: new Date().toISOString(),
};

// ============================================================================
// LOCAL STORAGE KEYS & DATA SERVICE
// ============================================================================

const STORAGE_KEYS = {
  CAMPAIGNS: 'agueroflow_mkt_campaigns',
  EVENTS: 'agueroflow_mkt_events',
  ASSETS: 'agueroflow_mkt_assets',
  BRAND: 'agueroflow_mkt_brand',
  RADAR: 'agueroflow_mkt_radar',
};

// Seed initial campaigns for demo & immediate operation
const INITIAL_DEMO_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: 'camp_001',
    organizationId: 'org_aguero_default',
    name: 'Abril Verde 2026: Segurança em Solda e Altura',
    theme: 'Prevenção de Acidentes e Uso Rigoroso de EPIs',
    objective: 'Reforçar o compromisso com zero acidentes em campo nas montagens industriais.',
    description: 'Campanha de 30 dias com DDS diários, blitz de inspeção de EPIs e premiação da equipe com maior índice de conformidade.',
    audience: 'interno_colaboradores',
    scope: 'interno',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    department: 'Segurança do Trabalho (SST) & Operações',
    responsibleName: 'Coordenador de SST',
    responsibleEmail: 'seguranca@agueroinox.com.br',
    estimatedBudget: 4500,
    actualBudgetSpent: 1200,
    channels: ['tv_interna', 'mural_fisico', 'whatsapp'],
    status: 'em_andamento',
    tasks: [
      { id: 't1', title: 'Imprimir cartazes A3 para o galpão de caldeiraria', dueDate: '2026-04-05', completed: true, assignedToName: 'Marketing' },
      { id: 't2', title: 'Gravar vídeo de DDS com lideranças', dueDate: '2026-04-12', completed: false, assignedToName: 'SST' },
      { id: 't3', title: 'Comprar brindes de premiação (bottons e garrafas térmicas)', dueDate: '2026-04-18', completed: true, assignedToName: 'Compras' },
    ],
    materialsCount: 4,
    approvedBy: 'Diretoria Operacional',
    approvedAt: '2026-03-25T14:00:00Z',
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-04-02T11:30:00Z',
  },
  {
    id: 'camp_002',
    organizationId: 'org_aguero_default',
    name: 'Showcase LinkedIn: Tanques Assépticos e Tubulações 316L',
    theme: 'Qualidade Técnica e Solda Sanitária com Purga de Argônio',
    objective: 'Atrair decisores industriais do setor químico, alimentício e farmacêutico.',
    description: 'Série de 4 publicações em carrossel demonstrando processos de teste de estanqueidade e rugosidade superficial Ra <= 0.4 µm.',
    audience: 'externo_clientes',
    scope: 'externo',
    startDate: '2026-04-10',
    endDate: '2026-05-15',
    department: 'Comercial & Marketing',
    responsibleName: 'Gerência Comercial',
    responsibleEmail: 'comercial@agueroinox.com.br',
    estimatedBudget: 1800,
    actualBudgetSpent: 400,
    channels: ['linkedin', 'site', 'instagram'],
    status: 'planejamento',
    tasks: [
      { id: 't1', title: 'Coletar fotos em alta resolução da obra em Paulínia', dueDate: '2026-04-15', completed: true, assignedToName: 'Engenharia' },
      { id: 't2', title: 'Elaborar texto técnico com mascaramento do nome do cliente', dueDate: '2026-04-20', completed: false, assignedToName: 'Marketing IA' },
      { id: 't3', title: 'Configurar campanha patrocinada no LinkedIn Ads', dueDate: '2026-04-25', completed: false, assignedToName: 'Agência' },
    ],
    materialsCount: 2,
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-03T16:00:00Z',
  },
];

const INITIAL_DEMO_EVENTS: CorporateEvent[] = [
  {
    id: 'evt_001',
    organizationId: 'org_aguero_default',
    name: 'SIPAT 2026 — Segurança em Primeiro Lugar',
    objective: 'Engajamento de 100% da fábrica em práticas de prevenção de acidentes e saúde ergonômica.',
    description: 'Semana com palestras de especialistas externos, teatro de segurança, circuito de saúde e gincana premiada entre turnos.',
    eventDate: '2026-08-24',
    startTime: '08:00',
    endTime: '17:00',
    location: 'Auditório Principal Aguero Inox & Tenda Fabril',
    isVirtualOrHybrid: false,
    audience: 'interno_colaboradores',
    estimatedAttendees: 85,
    actualAttendees: 0,
    responsibleName: 'Comissão CIPA & Gestor de RH',
    estimatedBudget: 8500,
    actualBudgetSpent: 2100,
    status: 'planejamento',
    participants: [
      { id: 'p1', name: 'Carlos Soldador', department: 'Caldeiraria', confirmed: true },
      { id: 'p2', name: 'Juliana Engenharia', department: 'Projetos', confirmed: true },
      { id: 'p3', name: 'Marcos Montador', department: 'Montagem de Campo', confirmed: false },
    ],
    suppliers: [
      { id: 's1', name: 'Buffet Delícias Corporativas', serviceCategory: 'Coffee Break & Café da Manhã', estimatedCost: 2800, status: 'cotacao' },
      { id: 's2', name: 'Palestrante Dr. Saúde Ocupacional', serviceCategory: 'Palestra de Ergonomia', estimatedCost: 1500, status: 'aprovado' },
      { id: 's3', name: 'Brindes Express Camisetas', serviceCategory: 'Camisetas personalizadas SIPAT', estimatedCost: 2200, status: 'aprovado' },
    ],
    tasks: [
      { id: 'tk1', title: 'Contratar coffee break para os 5 dias', dueDate: '2026-07-20', completed: false, assignedToName: 'RH' },
      { id: 'tk2', title: 'Criar crachás e faixas no Estúdio Criativo', dueDate: '2026-08-01', completed: false, assignedToName: 'Marketing' },
      { id: 'tk3', title: 'Alinhar liberação de turnos com líderes de produção', dueDate: '2026-08-10', completed: false, assignedToName: 'Gerência Operacional' },
    ],
    createdAt: '2026-03-10T14:00:00Z',
    updatedAt: '2026-04-02T10:00:00Z',
  },
  {
    id: 'evt_002',
    organizationId: 'org_aguero_default',
    name: 'Café com a Diretoria — Alinhamento de Resultados Trimestrais',
    objective: 'Apresentar metas alcançadas, novos contratos de tubulação industrial e ouvir os colaboradores.',
    description: 'Encontro descontraído de 1 hora com café da manhã e espaço aberto para perguntas da equipe fabril e de escritório.',
    eventDate: '2026-05-15',
    startTime: '08:30',
    endTime: '09:30',
    location: 'Refeitório Fabril Aguero Inox',
    audience: 'interno_colaboradores',
    estimatedAttendees: 45,
    responsibleName: 'Diretoria Geral',
    estimatedBudget: 850,
    actualBudgetSpent: 0,
    status: 'confirmado',
    participants: [],
    suppliers: [
      { id: 'sup1', name: 'Panificadora Central', serviceCategory: 'Mesa de pães e frutas', estimatedCost: 650, status: 'aprovado' },
    ],
    tasks: [
      { id: 't1', title: 'Preparar slides com faturamento e novos contratos', dueDate: '2026-05-10', completed: false, assignedToName: 'Controladoria' },
    ],
    createdAt: '2026-04-01T11:00:00Z',
    updatedAt: '2026-04-01T11:00:00Z',
  },
];

const INITIAL_DEMO_ASSETS: CreativeAsset[] = [
  {
    id: 'ast_001',
    organizationId: 'org_aguero_default',
    campaignId: 'camp_001',
    title: 'Cartaz Mural Abril Verde: Sua Família Espera por Você',
    format: 'cartaz_a4',
    dimensions: CREATIVE_DIMENSIONS.cartaz_a4,
    category: 'seguranca_sipat',
    theme: 'Abril Verde & Uso de EPIs',
    targetAudience: 'interno_colaboradores',
    toneOfVoice: 'motivacional',
    backgroundColor: '#0F172A',
    backgroundGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
    layers: [
      {
        id: 'ly_1',
        type: 'badge',
        text: 'ABRIL VERDE · SEGURANÇA TOTAL',
        xPercent: 10,
        yPercent: 12,
        backgroundColor: '#16A34A',
        fontColor: '#FFFFFF',
        bold: true,
      },
      {
        id: 'ly_2',
        type: 'text_title',
        text: 'Sua Vida em Primeiro Lugar',
        fontSize: 34,
        fontColor: '#FFFFFF',
        xPercent: 10,
        yPercent: 22,
        bold: true,
      },
      {
        id: 'ly_3',
        type: 'text_body',
        text: 'Na caldeiraria e na montagem de campo, cada EPI é um escudo. Trabalhe com atenção, confira os travamentos e volte com segurança para quem você ama.',
        fontSize: 16,
        fontColor: '#CBD5E1',
        xPercent: 10,
        yPercent: 40,
        widthPercent: 80,
      },
      {
        id: 'ly_4',
        type: 'button_cta',
        text: 'AGUERO INOX · ZERO ACIDENTES',
        xPercent: 10,
        yPercent: 82,
        backgroundColor: '#0284C7',
        fontColor: '#FFFFFF',
        bold: true,
      },
    ],
    generatedCopy: {
      headline: 'Sua Vida em Primeiro Lugar: Abril Verde na Aguero Inox',
      bodyText: 'A caldeiraria e a tubulação industrial exigem rigor absoluto. Usar o EPI correto em cada operação salva vidas. Cuide de você e do seu colega ao lado.',
      callToAction: 'Segurança é valor inegociável.',
      socialCaption: 'Neste Abril Verde, reforçamos que nosso maior patrimônio não é o aço, são as pessoas que transformam com maestria cada projeto. #AbrilVerde #AgueroInox #SegurancaDoTrabalho',
      hashtags: ['#AbrilVerde', '#AgueroInox', '#SegurancaNoTrabalho', '#CaldeirariaIndustrial'],
    },
    status: 'aprovado',
    createdAt: '2026-04-02T10:00:00Z',
    updatedAt: '2026-04-02T10:00:00Z',
  },
  {
    id: 'ast_002',
    organizationId: 'org_aguero_default',
    campaignId: 'camp_002',
    title: 'Post Carrossel LinkedIn: Precisão em Soldagem TIG Sanitária',
    format: 'post_vertical',
    dimensions: CREATIVE_DIMENSIONS.post_vertical,
    category: 'servicos_obras',
    theme: 'Caldeiraria & Tubulações Inox 304/316L',
    targetAudience: 'externo_clientes',
    toneOfVoice: 'profissional',
    backgroundColor: '#090D16',
    backgroundGradient: 'linear-gradient(135deg, #090D16 0%, #0369A1 100%)',
    layers: [
      {
        id: 'ly_b1',
        type: 'badge',
        text: 'CASO DE SUCESSO · ENGENHARIA SANITÁRIA',
        xPercent: 10,
        yPercent: 10,
        backgroundColor: '#0284C7',
        fontColor: '#FFFFFF',
        bold: true,
      },
      {
        id: 'ly_b2',
        type: 'text_title',
        text: 'Tubulações em Inox 316L para Indústria Química',
        fontSize: 30,
        fontColor: '#FFFFFF',
        xPercent: 10,
        yPercent: 20,
        bold: true,
      },
      {
        id: 'ly_b3',
        type: 'text_body',
        text: 'Mais de 1.200 metros de tubulações instaladas com 100% de ensaio em líquido penetrante e certificação rastreada de matéria-prima.',
        fontSize: 15,
        fontColor: '#E2E8F0',
        xPercent: 10,
        yPercent: 44,
        widthPercent: 80,
      },
    ],
    generatedCopy: {
      headline: 'Excelência em Redes Industriais Assépticas',
      bodyText: 'Rigor técnico, curvas OD de raio longo e soldas sem zonas mortas. Saiba como executamos paradas de manutenção sem atraso no cronograma do cliente.',
      callToAction: 'Consulte nossa equipe de engenharia para sua próxima parada de manutenção.',
      socialCaption: 'Quando se trata de fluídos corrosivos e padrões de assepsia, o aço inoxidável 316L aliado a soldadores qualificados ASME IX faz toda a diferença. Confira mais uma entrega executada pela Aguero Inox. #EngenhariaIndustrial #AcoInox #Caldeiraria #SoldaTIG',
      hashtags: ['#AcoInox316L', '#AgueroInox', '#TubulacaoSanitaria', '#EngenhariaMecanica'],
    },
    status: 'rascunho',
    createdAt: '2026-04-03T11:00:00Z',
    updatedAt: '2026-04-03T11:00:00Z',
  },
];

export const MarketingService = {
  // --------------------------------------------------------------------------
  // CAMPAIGNS
  // --------------------------------------------------------------------------
  listCampaigns(orgId: string = 'org_aguero_default'): MarketingCampaign[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
      if (stored) {
        const list: MarketingCampaign[] = JSON.parse(stored);
        return list.filter((c) => c.organizationId === orgId);
      }
    } catch (e) {
      console.warn('Erro ao ler campanhas do localStorage', e);
    }
    // Return demo seed
    return INITIAL_DEMO_CAMPAIGNS;
  },

  saveCampaign(campaign: MarketingCampaign): MarketingCampaign {
    try {
      const current = this.listCampaigns(campaign.organizationId);
      const idx = current.findIndex((c) => c.id === campaign.id);
      let updated: MarketingCampaign[];
      const now = new Date().toISOString();

      if (idx >= 0) {
        current[idx] = { ...campaign, updatedAt: now };
        updated = [...current];
      } else {
        const newRecord = { ...campaign, createdAt: campaign.createdAt || now, updatedAt: now };
        updated = [newRecord, ...current];
      }

      localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(updated));
      return idx >= 0 ? current[idx] : updated[0];
    } catch (e) {
      console.error('Erro ao salvar campanha', e);
      return campaign;
    }
  },

  deleteCampaign(id: string, orgId: string = 'org_aguero_default'): void {
    const list = this.listCampaigns(orgId).filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(list));
  },

  // --------------------------------------------------------------------------
  // EVENTS
  // --------------------------------------------------------------------------
  listEvents(orgId: string = 'org_aguero_default'): CorporateEvent[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (stored) {
        const list: CorporateEvent[] = JSON.parse(stored);
        return list.filter((e) => e.organizationId === orgId);
      }
    } catch (e) {
      console.warn('Erro ao ler eventos do localStorage', e);
    }
    return INITIAL_DEMO_EVENTS;
  },

  saveEvent(event: CorporateEvent): CorporateEvent {
    try {
      const current = this.listEvents(event.organizationId);
      const idx = current.findIndex((e) => e.id === event.id);
      let updated: CorporateEvent[];
      const now = new Date().toISOString();

      if (idx >= 0) {
        current[idx] = { ...event, updatedAt: now };
        updated = [...current];
      } else {
        const newRecord = { ...event, createdAt: event.createdAt || now, updatedAt: now };
        updated = [newRecord, ...current];
      }

      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(updated));
      return idx >= 0 ? current[idx] : updated[0];
    } catch (e) {
      console.error('Erro ao salvar evento', e);
      return event;
    }
  },

  deleteEvent(id: string, orgId: string = 'org_aguero_default'): void {
    const list = this.listEvents(orgId).filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(list));
  },

  // --------------------------------------------------------------------------
  // CREATIVE ASSETS (STUDIO)
  // --------------------------------------------------------------------------
  listAssets(orgId: string = 'org_aguero_default'): CreativeAsset[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ASSETS);
      if (stored) {
        const list: CreativeAsset[] = JSON.parse(stored);
        return list.filter((a) => a.organizationId === orgId);
      }
    } catch (e) {
      console.warn('Erro ao ler assets criativos do localStorage', e);
    }
    return INITIAL_DEMO_ASSETS;
  },

  saveAsset(asset: CreativeAsset): CreativeAsset {
    try {
      const current = this.listAssets(asset.organizationId);
      const idx = current.findIndex((a) => a.id === asset.id);
      let updated: CreativeAsset[];
      const now = new Date().toISOString();

      if (idx >= 0) {
        current[idx] = { ...asset, updatedAt: now };
        updated = [...current];
      } else {
        const newRecord = { ...asset, createdAt: asset.createdAt || now, updatedAt: now };
        updated = [newRecord, ...current];
      }

      localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(updated));
      return idx >= 0 ? current[idx] : updated[0];
    } catch (e) {
      console.error('Erro ao salvar asset criativo', e);
      return asset;
    }
  },

  deleteAsset(id: string, orgId: string = 'org_aguero_default'): void {
    const list = this.listAssets(orgId).filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(list));
  },

  // --------------------------------------------------------------------------
  // BRAND IDENTITY
  // --------------------------------------------------------------------------
  getBrandIdentity(orgId: string = 'org_aguero_default'): BrandIdentityConfig {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEYS.BRAND}_${orgId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Erro ao carregar marca do localStorage', e);
    }
    return { ...DEFAULT_BRAND_IDENTITY, organizationId: orgId };
  },

  saveBrandIdentity(brand: BrandIdentityConfig): BrandIdentityConfig {
    try {
      const updated = { ...brand, updatedAt: new Date().toISOString() };
      localStorage.setItem(`${STORAGE_KEYS.BRAND}_${brand.organizationId}`, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Erro ao salvar marca', e);
      return brand;
    }
  },

  // --------------------------------------------------------------------------
  // ANALYTICS OVERVIEW (TRAFFIC, SOCIAL & ADS)
  // --------------------------------------------------------------------------
  getAnalyticsOverview(): MarketingAnalyticsOverview {
    return {
      periodDays: 30,
      socialMedia: {
        totalFollowers: 4280,
        followersGrowthPercent: 12.4,
        impressionsTotal: 68400,
        reachTotal: 41200,
        engagementRatePercent: 4.8,
        totalLikes: 1940,
        totalComments: 218,
        totalShares: 142,
        topPosts: [
          {
            id: 'post_1',
            platform: 'linkedin',
            title: 'Montagem de Skid Sanitário em Inox 316L com Ra < 0.4 µm',
            date: '2026-03-28',
            reach: 14200,
            interactions: 680,
            format: 'Carrossel Técnico (1080x1350)',
          },
          {
            id: 'post_2',
            platform: 'instagram',
            title: 'Bastidores de Solda TIG com Purga de Argônio no Galpão',
            date: '2026-04-02',
            reach: 9800,
            interactions: 520,
            format: 'Reels / Vídeo Curto (9:16)',
          },
          {
            id: 'post_3',
            platform: 'linkedin',
            title: 'Dia Mundial da Água e a Proteção das Redes Sanitárias',
            date: '2026-03-22',
            reach: 8400,
            interactions: 310,
            format: 'Post Feed (1080x1080)',
          },
        ],
      },
      website: {
        totalSessions: 14500,
        uniqueUsers: 9800,
        pageViews: 32400,
        bounceRatePercent: 41.2,
        avgSessionDurationSecs: 145,
        contactLeadsSubmitted: 38,
        trafficSources: [
          { source: 'Busca Orgânica Google (SEO)', sessions: 6800, percentage: 46.9 },
          { source: 'LinkedIn Institucional', sessions: 3900, percentage: 26.9 },
          { source: 'Tráfego Pago (Google Ads)', sessions: 2200, percentage: 15.2 },
          { source: 'Acesso Direto / E-mail', sessions: 1600, percentage: 11.0 },
        ],
      },
      paidTraffic: {
        totalInvestment: 3200,
        impressions: 48900,
        clicks: 1840,
        ctrPercent: 3.76,
        avgCpc: 1.74,
        leadsGenerated: 24,
        costPerLead: 133.33,
      },
      aiInsights: [
        'Posts técnicos no LinkedIn mostrando os testes de líquido penetrante e acabamento sanitário tiveram taxa de engajamento 3.2x maior do que comunicados gerais.',
        'O custo por lead no Google Ads caiu de R$ 180 para R$ 133,33 após o direcionamento para palavras-chave de "fabricação de tanques de inox" e "tubulações sanitárias".',
        'Há oportunidade iminente de criar conteúdo em torno do "Dia do Soldador" e "Abril Verde", alavancando os depoimentos da equipe técnica de campo.',
        'A página de orçamento com cálculo direto (OrçaÁgil) converteu 38 contatos qualificados neste mês, um crescimento de 22% em relação ao período anterior.',
      ],
    };
  },

  // --------------------------------------------------------------------------
  // 1-CLICK CONVERSION: RADAR OPPORTUNITY -> CAMPAIGN
  // --------------------------------------------------------------------------
  convertOpportunityToCampaign(opp: RadarOpportunity, orgId: string = 'org_aguero_default'): MarketingCampaign {
    const newCamp: MarketingCampaign = {
      id: `camp_${Date.now()}`,
      organizationId: orgId,
      name: opp.theme,
      theme: opp.category === 'saude_seguranca' ? 'Segurança e Conscientização Operacional' : 'Posicionamento Institucional e Comercial',
      objective: opp.objective,
      description: `${opp.justification}\n\nAção Proposta: ${opp.proposedAction}`,
      audience: opp.audience,
      scope: opp.scope,
      startDate: opp.dateReference,
      endDate: opp.dateReference,
      department: opp.category === 'saude_seguranca' ? 'SST & Recursos Humanos' : 'Marketing & Comercial',
      responsibleName: 'Responsável Designado',
      estimatedBudget: opp.priority === 'alta' ? 2500 : 1000,
      actualBudgetSpent: 0,
      channels: opp.recommendedChannels,
      status: 'planejamento',
      tasks:
        opp.structuredSchedule && opp.structuredSchedule.length > 0
          ? opp.structuredSchedule.map((s, i) => ({
              id: `t_${Date.now()}_${i}`,
              title: `[${s.timeOrPhase}] ${s.activity} (${s.responsible})`,
              dueDate: opp.dateReference,
              completed: false,
            }))
          : opp.suggestedTasks.map((t, i) => ({
              id: `t_${Date.now()}_${i}`,
              title: t,
              dueDate: opp.dateReference,
              completed: false,
            })),
      materialsCount: opp.suggestedMaterials.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveCampaign(newCamp);
  },

  // --------------------------------------------------------------------------
  // 1-CLICK CONVERSION: RADAR OPPORTUNITY -> EVENT
  // --------------------------------------------------------------------------
  convertOpportunityToEvent(opp: RadarOpportunity, orgId: string = 'org_aguero_default'): CorporateEvent {
    const newEvent: CorporateEvent = {
      id: `evt_${Date.now()}`,
      organizationId: orgId,
      name: opp.theme,
      objective: opp.objective,
      description: `${opp.justification}\n\nAção Proposta: ${opp.proposedAction}`,
      eventDate: opp.dateReference,
      startTime: '09:00',
      endTime: '12:00',
      location: 'Auditório / Refeitório Aguero Inox',
      audience: opp.audience,
      estimatedAttendees: 50,
      responsibleName: 'Comitê de Eventos',
      estimatedBudget: opp.priority === 'alta' ? 3500 : 1200,
      actualBudgetSpent: 0,
      status: 'planejamento',
      participants: [],
      suppliers: [
        { id: `sup_${Date.now()}`, name: 'Fornecedor de Alimentação / Coffee', serviceCategory: 'Coffee Break', estimatedCost: 800, status: 'cotacao' },
      ],
      tasks:
        opp.structuredSchedule && opp.structuredSchedule.length > 0
          ? opp.structuredSchedule.map((s, i) => ({
              id: `tk_${Date.now()}_${i}`,
              title: `[${s.timeOrPhase}] ${s.activity}`,
              dueDate: opp.dateReference,
              completed: false,
              assignedToName: s.responsible,
            }))
          : opp.suggestedTasks.map((t, i) => ({
              id: `tk_${Date.now()}_${i}`,
              title: t,
              dueDate: opp.dateReference,
              completed: false,
            })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveEvent(newEvent);
  },
};
