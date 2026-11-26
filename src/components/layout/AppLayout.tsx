import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  Wrench,
  Boxes,
  AlertTriangle,
  FileBarChart,
  HelpCircle,
  Sparkles,
  Settings,
  Building,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Building2,
  FileText,
  Database,
  EyeOff,
  Eye,
  HardHat,
  Search,
  PackageCheck,
  Calculator,
  Receipt,
  ShoppingCart,
  Wallet,
  Sun,
  Moon,
  Bus,
  MessageSquare,
  LayoutGrid,
  Workflow,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { readSidebarCollapsed, writeSidebarCollapsed, isToggleSidebarShortcut } from './sidebarPref';
import { BrandLogo } from '../common/BrandLogo';
import { GlobalSearchModal, GlobalSearchResult } from '../common/GlobalSearchModal';
import { useTheme } from '../../contexts/ThemeContext';
import { areaOfSection } from '../../permissions/areas';
import { visibleNavWithPermissions } from '../../permissions/granular';

export type NavSection =
  | 'painel'
  | 'ordens'
  | 'ordens-aprovacoes'
  | 'ordens-recorrencias'
  | 'checklists'
  | 'inspecoes'
  | 'pecas-servicos'
  | 'pecas-catalogo'
  | 'servicos-catalogo'
  | 'mao-de-obra'
  | 'subcategorias-servicos'
  | 'estoque'
  | 'ocorrencias'
  | 'relatorios'
  | 'suporte'
  | 'ia'
  | 'configuracoes'
  | 'whatsapp-automacao'
  | 'whatsapp-central'
  | 'whatsapp-nds'
  | 'whatsapp-comandos'
  | 'estrutura'
  | 'contratos'
  | 'auditoria'
  | 'obras'
  | 'obras-medicoes'
  | 'operacoes'
  | 'ops-inicio'
  | 'ops-direcionar'
  | 'ops-diario'
  | 'ops-viagem'
  | 'ops-reembolso'
  | 'ops-contratacao'
  | 'ops-tarefas'
  | 'ops-gases'
  | 'ops-base'
  | 'ops-config'
  | 'bens-coletivos'
  | 'bens-painel'
  | 'bens-lista'
  | 'bens-movimentacoes'
  | 'bens-manutencoes'
  | 'bens-categorias'
  | 'bens-colaboradores'
  | 'bens-relatorios'
  | 'rh-salarios'
  | 'rh-painel'
  | 'rh-funcionarios'
  | 'rh-pendencias'
  | 'rh-admissoes'
  | 'rh-importacao'
  | 'rh-calculo'
  | 'rh-historico'
  | 'rh-relatorios'
  | 'rh-holerites'
  | 'comercial'
  | 'comercial-painel'
  | 'comercial-funil'
  | 'comercial-nova'
  | 'comercial-composicao'
  | 'comercial-revisao'
  | 'comercial-comunicacao'
  | 'comercial-importacoes'
  | 'comercial-materiais'
  | 'comercial-configuracoes'
  | 'comercial-relatorios'
  | 'compras'
  | 'compras-painel'
  | 'compras-requisicoes'
  | 'compras-cotacoes'
  | 'compras-pedidos'
  | 'compras-historico'
  | 'compras-inteligencia'
  | 'compras-fornecedores'
  | 'compras-recebimento'
  | 'financeiro'
  | 'financeiro-notas'
  | 'financeiro-pagar'
  | 'financeiro-receber'
  | 'financeiro-plano'
  | 'viagens'
  | 'viagens-painel'
  | 'viagens-busca'
  | 'viagens-resultados'
  | 'viagens-historico'
  | 'viagens-solicitacoes'
  | 'viagens-reembolsos'
  | 'viagens-configuracoes'
  | 'marketing'
  | 'marketing-painel'
  | 'marketing-calendario'
  | 'marketing-campanhas'
  | 'marketing-eventos'
  | 'marketing-estudio'
  | 'marketing-conteudo-obras'
  | 'marketing-biblioteca'
  | 'marketing-desempenho'
  | 'marketing-configuracoes';

export interface NavPayload {
  targetId?: string;
  searchQuery?: string;
}

interface AppLayoutProps {
  currentSection: NavSection;
  onNavigate: (section: NavSection, payload?: NavPayload) => void;
  onOpenMasterPanel?: () => void;
  children: React.ReactNode;
}

/** Telas que pertencem ao grupo Operações no menu (inclui Obras/RDO e Viagens). */
export const isOpsSection = (s: string) =>
  s === 'operacoes' || s === 'obras' || s.startsWith('obras-') || s.startsWith('ops-') || s.startsWith('viagens');

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentSection,
  onNavigate,
  onOpenMasterPanel,
  children,
}) => {
  const {
    user,
    organization,
    organizations,
    selectOrganization,
    role,
    isMaster,
    isAdmin,
    isManagerOrAbove,
    canViewFinancials,
    areaLevels,
    canSeeSection,
    selectedUnitId,
    setSelectedUnitId,
    selectedContractId,
    setSelectedContractId,
    units,
    contracts,
    signOut,
  } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ordersSubmenuOpen, setOrdersSubmenuOpen] = useState(currentSection.startsWith('ordens'));
  const [itemsSubmenuOpen, setItemsSubmenuOpen] = useState(
    currentSection.startsWith('pecas') ||
      currentSection === 'servicos-catalogo' ||
      currentSection === 'mao-de-obra' ||
      currentSection === 'subcategorias-servicos'
  );
  const [structureSubmenuOpen, setStructureSubmenuOpen] = useState(
    currentSection === 'estrutura' || currentSection === 'contratos' || currentSection === 'auditoria'
  );
  const [collectiveAssetsSubmenuOpen, setCollectiveAssetsSubmenuOpen] = useState(
    currentSection.startsWith('bens')
  );
  const [rhSubmenuOpen, setRhSubmenuOpen] = useState(currentSection.startsWith('rh-'));
  const [commercialSubmenuOpen, setCommercialSubmenuOpen] = useState(
    currentSection.startsWith('comercial')
  );
  const [comprasSubmenuOpen, setComprasSubmenuOpen] = useState(currentSection.startsWith('compras'));
  const [financeiroSubmenuOpen, setFinanceiroSubmenuOpen] = useState(currentSection.startsWith('financeiro'));
  const [viagensSubmenuOpen, setViagensSubmenuOpen] = useState(isOpsSection(currentSection));
  const [marketingSubmenuOpen, setMarketingSubmenuOpen] = useState(
    currentSection.startsWith('marketing')
  );
  const [whatsappSubmenuOpen, setWhatsappSubmenuOpen] = useState(
    currentSection.startsWith('whatsapp-')
  );
  const { theme, toggleTheme } = useTheme();
  const [seeding, setSeeding] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  // Desktop: recolher a barra lateral para ganhar largura (lembrado no navegador).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readSidebarCollapsed(typeof window !== 'undefined' ? window.localStorage : null),
  );
  const toggleSidebarCollapsed = () => setSidebarCollapsed((prev) => !prev);
  useEffect(() => {
    writeSidebarCollapsed(window.localStorage, sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Ctrl+B / ⌘B recolhe ou abre a barra lateral (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleSidebarShortcut(e)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      toggleSidebarCollapsed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Global Keyboard Shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectSearchResult = (result: GlobalSearchResult) => {
    onNavigate(result.targetSection, {
      targetId: result.targetId,
      searchQuery: result.code || result.title,
    });
  };

  const allNavItems = [
    {
      id: 'painel' as NavSection,
      label: 'Painel',
      icon: LayoutDashboard,
    },
    {
      id: 'ordens' as NavSection,
      label: 'Ordens de Serviço',
      icon: ClipboardList,
      hasSubmenu: true,
      subItems: [
        { id: 'ordens' as NavSection, label: 'Lista de OS' },
        { id: 'ordens-aprovacoes' as NavSection, label: 'Aprovações (LPU)' },
        { id: 'ordens-recorrencias' as NavSection, label: 'Recorrências' },
      ],
    },
    {
      id: 'checklists' as NavSection,
      label: 'Checklists',
      icon: CheckSquare,
    },
    {
      id: 'inspecoes' as NavSection,
      label: 'Inspeções',
      icon: CheckSquare,
    },
    {
      id: 'pecas-servicos' as NavSection,
      label: 'Peças e Serviços',
      icon: Wrench,
      hasSubmenu: true,
      subItems: [
        { id: 'pecas-catalogo' as NavSection, label: 'Peças' },
        { id: 'servicos-catalogo' as NavSection, label: 'Serviços' },
        { id: 'mao-de-obra' as NavSection, label: 'Mão de Obra (HxH)' },
        { id: 'subcategorias-servicos' as NavSection, label: 'Subcategorias & Gestão' },
      ],
    },
    {
      id: 'estoque' as NavSection,
      label: 'Estoque',
      icon: Boxes,
    },
    {
      id: 'ocorrencias' as NavSection,
      label: 'Ocorrências',
      icon: AlertTriangle,
    },
    {
      id: 'relatorios' as NavSection,
      label: 'Relatórios',
      icon: FileBarChart,
    },
    {
      id: 'suporte' as NavSection,
      label: 'Suporte',
      icon: HelpCircle,
    },
    {
      id: 'ia' as NavSection,
      label: 'AgueroFlow IA',
      icon: Sparkles,
      highlight: true,
    },
    {
      id: 'configuracoes' as NavSection,
      label: 'Configurações',
      icon: Settings,
    },
    {
      id: 'whatsapp-automacao' as NavSection,
      label: 'Automação WhatsApp & NDs',
      icon: MessageSquare,
      highlight: true,
      hasSubmenu: true,
      subItems: [
        { id: 'whatsapp-central' as NavSection, label: 'Central WhatsApp & OCR' },
        { id: 'whatsapp-nds' as NavSection, label: 'Automação NDs & Outlook' },
        { id: 'whatsapp-comandos' as NavSection, label: 'Comandos Programados' },
      ],
    },
    {
      id: 'estrutura' as NavSection,
      label: 'Estrutura & Contratos',
      icon: Building,
      hasSubmenu: true,
      subItems: [
        { id: 'estrutura' as NavSection, label: 'Visão Geral & Unidades' },
        { id: 'contratos' as NavSection, label: 'Contratos' },
        { id: 'auditoria' as NavSection, label: 'Auditoria & Logs' },
      ],
    },
    {
      id: 'operacoes' as NavSection,
      label: 'Operações',
      icon: Workflow,
      hasSubmenu: true,
      subItems: [
        { id: 'ops-inicio' as NavSection, label: 'Painel' },
        { id: 'ops-direcionar' as NavSection, label: 'Gerenciamento de operações' },
        { id: 'obras' as NavSection, label: 'Obras e RDO' },
        { id: 'obras-medicoes' as NavSection, label: 'Medições & Boletins (BM)' },
        { id: 'ops-diario' as NavSection, label: 'Diário de obras' },
        { id: 'ops-viagem' as NavSection, label: 'Hora viagem' },
        { id: 'viagens-painel' as NavSection, label: 'Passagens e solicitações' },
        { id: 'ops-reembolso' as NavSection, label: 'Reembolso' },
        { id: 'ops-contratacao' as NavSection, label: 'Contratação' },
        { id: 'ops-tarefas' as NavSection, label: 'Auxiliares' },
        { id: 'ops-gases' as NavSection, label: 'Controle de gases' },
        { id: 'ops-base' as NavSection, label: 'Base de dados' },
        ...(isManagerOrAbove ? [{ id: 'ops-config' as NavSection, label: 'Configurações' }] : []),
      ],
    },
    {
      id: 'bens-coletivos' as NavSection,
      label: 'Bens Coletivos',
      icon: PackageCheck,
      hasSubmenu: true,
      subItems: [
        { id: 'bens-painel' as NavSection, label: 'Painel de Bens Coletivos' },
        { id: 'bens-lista' as NavSection, label: 'Bens' },
        { id: 'bens-movimentacoes' as NavSection, label: 'Retiradas e Devoluções' },
        { id: 'bens-manutencoes' as NavSection, label: 'Manutenção e Calibração' },
        { id: 'bens-categorias' as NavSection, label: 'Categorias' },
        { id: 'bens-colaboradores' as NavSection, label: 'Colaboradores' },
        { id: 'bens-relatorios' as NavSection, label: 'Relatórios' },
      ],
    },
    // Quem vê o RH é decidido pelo acesso por área (filtro abaixo).
    {
      id: 'rh-salarios' as NavSection,
      label: 'RH / Salários',
      icon: Calculator,
      hasSubmenu: true,
      subItems: [
        { id: 'rh-painel' as NavSection, label: 'Painel RH/Salários' },
        { id: 'rh-funcionarios' as NavSection, label: 'Funcionários' },
        { id: 'rh-pendencias' as NavSection, label: 'Pendências Legadas' },
        { id: 'rh-admissoes' as NavSection, label: 'Admissão Digital (Links)' },
        { id: 'rh-importacao' as NavSection, label: 'Importação de Planilha' },
        { id: 'rh-calculo' as NavSection, label: 'Cálculo do 13º' },
        { id: 'rh-historico' as NavSection, label: 'Histórico de Cálculos' },
        { id: 'rh-relatorios' as NavSection, label: 'Relatórios' },
        { id: 'rh-holerites' as NavSection, label: 'Demonstrativos/Holerites' },
      ],
    },
    {
      id: 'comercial' as NavSection,
      label: 'Comercial (OrçaÁgil)',
      icon: Receipt,
      hasSubmenu: true,
      subItems: [
        { id: 'comercial-painel' as NavSection, label: 'Painel de Propostas' },
        { id: 'comercial-funil' as NavSection, label: 'Funil de Vendas' },
        { id: 'comercial-nova' as NavSection, label: 'Nova Proposta' },
        { id: 'comercial-composicao' as NavSection, label: 'Composição de Custos' },
        { id: 'comercial-revisao' as NavSection, label: 'Revisão de BOM' },
        { id: 'comercial-comunicacao' as NavSection, label: 'Comunicação WhatsApp' },
        { id: 'comercial-importacoes' as NavSection, label: 'Importações' },
        { id: 'comercial-materiais' as NavSection, label: 'Materiais e Preços' },
        { id: 'comercial-configuracoes' as NavSection, label: 'Configurações Comerciais' },
        { id: 'comercial-relatorios' as NavSection, label: 'Relatórios' },
      ],
    },
    {
      id: 'compras' as NavSection,
      label: 'Compras & Suprimentos',
      icon: ShoppingCart,
      hasSubmenu: true,
      subItems: [
        { id: 'compras-painel' as NavSection, label: 'Painel Geral' },
        { id: 'compras-requisicoes' as NavSection, label: 'Requisições (RC)' },
        { id: 'compras-cotacoes' as NavSection, label: 'Mapa 3-Bid Cotações' },
        { id: 'compras-pedidos' as NavSection, label: 'Ordens de Compra (OC)' },
        { id: 'compras-historico' as NavSection, label: 'Histórico de Compras' },
        { id: 'compras-inteligencia' as NavSection, label: 'Inteligência de Fornecedores' },
        { id: 'compras-fornecedores' as NavSection, label: 'Fornecedores' },
        { id: 'compras-recebimento' as NavSection, label: 'Recebimento & Corrida' },
      ],
    },
    {
      id: 'financeiro' as NavSection,
      label: 'Financeiro',
      icon: Wallet,
      hasSubmenu: true,
      subItems: [
        { id: 'financeiro-notas' as NavSection, label: 'Caixa de Notas' },
        { id: 'financeiro-pagar' as NavSection, label: 'Contas a Pagar' },
        { id: 'financeiro-receber' as NavSection, label: 'Contas a Receber' },
        { id: 'financeiro-plano' as NavSection, label: 'Plano de Contas' },
      ],
    },
    {
      id: 'marketing' as NavSection,
      label: 'Marketing & Eventos',
      icon: Sparkles,
      hasSubmenu: true,
      subItems: [
        { id: 'marketing-painel' as NavSection, label: 'Visão Geral' },
        { id: 'marketing-calendario' as NavSection, label: 'Calendário & Radar IA' },
        { id: 'marketing-campanhas' as NavSection, label: 'Campanhas' },
        { id: 'marketing-eventos' as NavSection, label: 'Eventos Corporativos' },
        { id: 'marketing-estudio' as NavSection, label: 'Estúdio Criativo (IA)' },
        { id: 'marketing-conteudo-obras' as NavSection, label: 'Obras em Conteúdo' },
        { id: 'marketing-biblioteca' as NavSection, label: 'Identidade Visual' },
        { id: 'marketing-desempenho' as NavSection, label: 'Desempenho & Tráfego' },
        { id: 'marketing-configuracoes' as NavSection, label: 'Configurações' },
      ],
    },
  ];
  // Cada submódulo aparece de acordo com a permissão individual ou modelo atribuído.
  const navItems = visibleNavWithPermissions(allNavItems, canSeeSection);
  const currentArea = areaOfSection(currentSection);

  const getSectionTitle = (id: NavSection) => {
    switch (id) {
      case 'painel':
        return 'Painel Operacional';
      case 'ordens':
        return 'Ordens de Serviço';
      case 'ordens-aprovacoes':
        return 'Aprovações de Custos (LPU)';
      case 'ordens-recorrencias':
        return 'Ordens Recorrentes & Preventivas';
      case 'checklists':
        return 'Checklists';
      case 'inspecoes':
        return 'Vistorias & Inspeções';
      case 'pecas-servicos':
        return 'Peças, Serviços e Mão de Obra';
      case 'pecas-catalogo':
        return 'Catálogo de Peças';
      case 'servicos-catalogo':
        return 'Catálogo de Serviços';
      case 'mao-de-obra':
        return 'Mão de Obra (HxH)';
      case 'subcategorias-servicos':
        return 'Subcategorias & Gestão';
      case 'estoque':
        return 'Estoque & Saldos';
      case 'ocorrencias':
        return 'Ocorrências & Não Conformidades';
      case 'relatorios':
        return 'Relatórios & Indicadores';
      case 'suporte':
        return 'Central de Suporte';
      case 'ia':
        return 'AgueroFlow IA';
      case 'configuracoes':
        return 'Configurações';
      case 'whatsapp-automacao':
      case 'whatsapp-central':
        return 'WhatsApp & OCR';
      case 'whatsapp-nds':
        return 'Notas de Débito & Outlook';
      case 'whatsapp-comandos':
        return 'Comandos Programados';
      case 'estrutura':
        return 'Estrutura Organizacional';
      case 'contratos':
        return 'Contratos';
      case 'auditoria':
        return 'Auditoria & Governança';
      case 'obras':
        return 'Operações — Obras e RDO';
      case 'obras-medicoes':
        return 'Operações — Medições & Boletim de Medição (BM)';
      case 'operacoes':
      case 'ops-inicio':
        return 'Operações — Painel';
      case 'ops-direcionar':
        return 'Operações — Gerenciamento de operações';
      case 'ops-diario':
        return 'Operações — Diário de obras';
      case 'ops-viagem':
        return 'Operações — Hora viagem';
      case 'ops-reembolso':
        return 'Operações — Reembolso';
      case 'ops-contratacao':
        return 'Operações — Contratação';
      case 'ops-tarefas':
        return 'Operações — Auxiliares';
      case 'ops-gases':
        return 'Operações — Controle de gases';
      case 'ops-base':
        return 'Operações — Base de dados';
      case 'ops-config':
        return 'Operações — Configurações';
      case 'bens-coletivos':
      case 'bens-painel':
        return 'Bens Coletivos — Painel';
      case 'bens-lista':
        return 'Bens Coletivos — Catálogo';
      case 'bens-movimentacoes':
        return 'Retiradas e Devoluções';
      case 'bens-manutencoes':
        return 'Manutenção e Calibração';
      case 'bens-categorias':
        return 'Categorias de Bens';
      case 'bens-colaboradores':
        return 'Colaboradores';
      case 'bens-relatorios':
        return 'Relatórios de Bens';
      case 'rh-salarios':
      case 'rh-painel':
        return 'RH / Salários';
      case 'rh-funcionarios':
        return 'Funcionários';
      case 'rh-pendencias':
        return 'Pendências Legadas de RH';
      case 'rh-admissoes':
        return 'Admissão Digital';
      case 'rh-importacao':
        return 'Importação de Planilha';
      case 'rh-calculo':
        return 'Cálculo do 13º Salário';
      case 'rh-historico':
        return 'Histórico de Cálculos';
      case 'rh-relatorios':
        return 'Relatórios de RH';
      case 'rh-holerites':
        return 'Demonstrativos & Holerites';
      case 'comercial':
      case 'comercial-painel':
        return 'Comercial (OrçaÁgil)';
      case 'comercial-funil':
        return 'Funil de Vendas';
      case 'comercial-nova':
        return 'Nova Proposta';
      case 'comercial-composicao':
        return 'Composição de Custos';
      case 'comercial-revisao':
        return 'Revisão de BOM';
      case 'comercial-comunicacao':
        return 'Comunicação WhatsApp';
      case 'comercial-importacoes':
        return 'Importações Comerciais';
      case 'comercial-materiais':
        return 'Materiais e Preços';
      case 'comercial-configuracoes':
        return 'Configurações Comerciais';
      case 'comercial-relatorios':
        return 'Relatórios Comerciais';
      case 'compras':
      case 'compras-painel':
        return 'Compras & Suprimentos';
      case 'compras-requisicoes':
        return 'Requisições de Compra';
      case 'compras-cotacoes':
        return 'Mapa de Cotações (3-Bid)';
      case 'compras-pedidos':
        return 'Ordens de Compra';
      case 'compras-historico':
        return 'Histórico de Compras';
      case 'compras-inteligencia':
        return 'Inteligência de Fornecedores';
      case 'compras-fornecedores':
        return 'Fornecedores';
      case 'compras-recebimento':
        return 'Recebimento & Corrida';
      case 'financeiro':
      case 'financeiro-notas':
        return 'Caixa de Notas (NF-e)';
      case 'financeiro-pagar':
        return 'Contas a Pagar';
      case 'financeiro-receber':
        return 'Contas a Receber';
      case 'financeiro-plano':
        return 'Plano de Contas';
      case 'viagens':
      case 'viagens-painel':
        return 'Gestão de Viagens';
      case 'viagens-busca':
        return 'Nova Busca Rodoviária';
      case 'viagens-resultados':
        return 'Resultados & Comparativo';
      case 'viagens-historico':
        return 'Histórico de Viagens';
      case 'viagens-solicitacoes':
        return 'Solicitações Corporativas';
      case 'viagens-reembolsos':
        return 'Reembolsos WhatsApp (OCR)';
      case 'viagens-configuracoes':
        return 'Configurações de Viagens';
      case 'marketing':
      case 'marketing-painel':
        return 'Marketing & Eventos';
      case 'marketing-calendario':
        return 'Calendário & Radar IA';
      case 'marketing-campanhas':
        return 'Campanhas';
      case 'marketing-eventos':
        return 'Eventos Corporativos';
      case 'marketing-estudio':
        return 'Estúdio Criativo (IA)';
      case 'marketing-conteudo-obras':
        return 'Obras em Conteúdo';
      case 'marketing-biblioteca':
        return 'Identidade Visual';
      case 'marketing-desempenho':
        return 'Desempenho & Tráfego';
      case 'marketing-configuracoes':
        return 'Configurações de Marketing';
      default:
        return 'Operação';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] flex font-sans">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Apple Translucent Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[264px] shrink-0 bg-[#FBFBFD]/95 dark:bg-[#161618]/95 backdrop-blur-xl border-r border-black/[0.08] dark:border-white/[0.08] flex flex-col justify-between transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${sidebarCollapsed ? 'lg:hidden' : ''}`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          {/* Brand Bar */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
            <button
              type="button"
              className="flex items-center cursor-pointer"
              onClick={() => onNavigate('painel')}
              title="Ir para o Painel"
            >
              <BrandLogo size="sm" />
            </button>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden lg:inline-flex p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.05] dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              title="Ocultar menu lateral (Ctrl+B)"
              aria-label="Ocultar menu lateral"
            >
              <PanelLeftClose className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white lg:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Company Context Card */}
          <div className="px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] relative shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#86868B]">
                Empresa ativa
              </span>
              <span className="text-[11px] font-semibold text-[#0071E3] dark:text-[#409CFF]">
                {isMaster ? 'Master' : role}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
              <p
                className="text-[13px] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate"
                title={organization?.name}
              >
                {organization?.name || 'Carregando...'}
              </p>

              {/* Multi-company switcher strictly for Master user only */}
              {isMaster && organizations.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                  className="text-[11px] text-[#0071E3] dark:text-[#409CFF] hover:underline font-medium shrink-0 cursor-pointer"
                >
                  Trocar
                </button>
              )}
            </div>

            <p className="text-[11px] text-[#86868B] font-mono truncate mt-0.5">
              {organization?.cnpj || organization?.slug || 'padrao'}
            </p>

            {/* Master quick link back to Selective Company Panel */}
            {isMaster && onOpenMasterPanel && (
              <button
                type="button"
                onClick={onOpenMasterPanel}
                className="mt-2.5 w-full py-1.5 px-2.5 rounded-lg bg-black/[0.045] hover:bg-black/[0.08] dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-[11px] font-medium text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#409CFF]" />
                <span>Painel de Empresas</span>
              </button>
            )}

            {!canViewFinancials && (
              <div className="mt-2 flex items-center space-x-1.5 text-[11px] text-[#86868B]">
                <EyeOff className="w-3 h-3 shrink-0" />
                <span>Valores financeiros ocultos</span>
              </div>
            )}

            {/* Master Organization Quick Dropdown */}
            {isMaster && showOrgDropdown && organizations.length > 1 && (
              <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.14] rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)] space-y-0.5 text-xs">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => {
                      selectOrganization(org.id);
                      setShowOrgDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs truncate cursor-pointer transition-colors ${
                      organization?.id === org.id
                        ? 'bg-[#0071E3] text-white font-semibold apple-solid-btn'
                        : 'text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                    }`}
                  >
                    {org.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-0.5 overflow-y-auto flex-1 custom-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isOrders = item.id === 'ordens';
              const isItems = item.id === 'pecas-servicos';
              const isStructure = item.id === 'estrutura';
              const isCollectiveAssets = item.id === 'bens-coletivos';
              const isRh = item.id === 'rh-salarios';
              const isCommercial = item.id === 'comercial';
              const isCompras = item.id === 'compras';
              const isFinanceiro = item.id === 'financeiro';
              const isViagens = item.id === 'operacoes';
              const isMarketing = item.id === 'marketing';
              const isWhatsAppAuto = item.id === 'whatsapp-automacao';

              const isSubmenuOpen = isOrders
                ? ordersSubmenuOpen
                : isItems
                ? itemsSubmenuOpen
                : isStructure
                ? structureSubmenuOpen
                : isCollectiveAssets
                ? collectiveAssetsSubmenuOpen
                : isRh
                ? rhSubmenuOpen
                : isCommercial
                ? commercialSubmenuOpen
                : isCompras
                ? comprasSubmenuOpen
                : isFinanceiro
                ? financeiroSubmenuOpen
                : isViagens
                ? viagensSubmenuOpen
                : isMarketing
                ? marketingSubmenuOpen
                : isWhatsAppAuto
                ? whatsappSubmenuOpen
                : false;

              const isActive =
                currentSection === item.id ||
                (isOrders && currentSection.startsWith('ordens')) ||
                (isItems &&
                  (currentSection.startsWith('pecas') ||
                    currentSection === 'servicos-catalogo' ||
                    currentSection === 'mao-de-obra' ||
                    currentSection === 'subcategorias-servicos')) ||
                (isStructure &&
                  (currentSection === 'estrutura' ||
                    currentSection === 'contratos' ||
                    currentSection === 'auditoria')) ||
                (isCollectiveAssets && currentSection.startsWith('bens')) ||
                (isRh && currentSection.startsWith('rh-')) ||
                (isCommercial && currentSection.startsWith('comercial')) ||
                (isCompras && currentSection.startsWith('compras')) ||
                (isFinanceiro && currentSection.startsWith('financeiro')) ||
                (isViagens && isOpsSection(currentSection)) ||
                (isMarketing && currentSection.startsWith('marketing')) ||
                (isWhatsAppAuto && currentSection.startsWith('whatsapp-'));

              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isOrders) {
                        setOrdersSubmenuOpen(!ordersSubmenuOpen);
                        onNavigate('ordens');
                      } else if (isItems) {
                        setItemsSubmenuOpen(!itemsSubmenuOpen);
                        onNavigate('pecas-servicos');
                      } else if (isStructure) {
                        setStructureSubmenuOpen(!structureSubmenuOpen);
                        onNavigate('estrutura');
                      } else if (isCollectiveAssets) {
                        setCollectiveAssetsSubmenuOpen(!collectiveAssetsSubmenuOpen);
                        onNavigate('bens-painel');
                      } else if (isRh) {
                        setRhSubmenuOpen(!rhSubmenuOpen);
                        onNavigate('rh-painel');
                      } else if (isCommercial) {
                        setCommercialSubmenuOpen(!commercialSubmenuOpen);
                        onNavigate('comercial-painel');
                      } else if (isCompras) {
                        setComprasSubmenuOpen(!comprasSubmenuOpen);
                        onNavigate('compras-painel');
                      } else if (isFinanceiro) {
                        setFinanceiroSubmenuOpen(!financeiroSubmenuOpen);
                        onNavigate('financeiro-notas');
                      } else if (isViagens) {
                        setViagensSubmenuOpen(!viagensSubmenuOpen);
                        onNavigate('ops-inicio');
                      } else if (isMarketing) {
                        setMarketingSubmenuOpen(!marketingSubmenuOpen);
                        onNavigate('marketing-painel');
                      } else if (isWhatsAppAuto) {
                        setWhatsappSubmenuOpen(!whatsappSubmenuOpen);
                        onNavigate('whatsapp-central');
                      } else {
                        onNavigate(item.id);
                        setSidebarOpen(false);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[13px] transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#0071E3] text-white font-semibold shadow-[0_1px_3px_rgba(0,113,227,0.28)] apple-solid-btn'
                        : item.highlight
                        ? 'text-[#0071E3] dark:text-[#409CFF] font-medium hover:bg-[#0071E3]/[0.08] dark:hover:bg-[#0A84FF]/15'
                        : 'text-[#424245] dark:text-[#D1D1D6] font-medium hover:bg-black/[0.045] dark:hover:bg-white/[0.07] hover:text-[#1D1D1F] dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? 'text-white'
                            : item.highlight
                            ? 'text-[#0071E3] dark:text-[#409CFF]'
                            : 'text-[#86868B] dark:text-[#98989D]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.hasSubmenu && (
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                          isSubmenuOpen ? 'rotate-180' : ''
                        } ${isActive ? 'text-white/90' : 'text-[#86868B]'}`}
                      />
                    )}
                  </button>

                  {item.hasSubmenu && isSubmenuOpen && (
                    <div className="pl-7 pr-1 py-1 space-y-0.5">
                      {item.subItems?.map((sub) => {
                        const subActive = currentSection === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              onNavigate(sub.id);
                              setSidebarOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer truncate ${
                              subActive
                                ? 'bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#409CFF] font-semibold'
                                : 'text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                            }`}
                          >
                            {sub.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer User Info & Logout */}
        <div className="p-3.5 border-t border-black/[0.06] dark:border-white/[0.08] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#1D1D1F] dark:bg-[#2C2C2E] flex items-center justify-center text-xs text-white font-semibold shrink-0 apple-solid-btn">
                {user?.displayName
                  ? user.displayName.charAt(0).toUpperCase()
                  : user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                  {user?.displayName || user?.email?.split('@')[0]}
                </p>
                <p className="text-[11px] text-[#86868B] truncate">{user?.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              title="Encerrar sessão"
              className="p-2 rounded-lg text-[#86868B] hover:text-[#D70015] dark:hover:text-[#FF453A] hover:bg-black/[0.045] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Frosted Apple Top Header */}
        <header className="h-16 bg-white/80 dark:bg-[#161618]/80 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/[0.08] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 gap-3">
          <div className="flex items-center space-x-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white lg:hidden shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className="hidden lg:inline-flex p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.05] dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
                title="Mostrar menu lateral (Ctrl+B)"
                aria-label="Mostrar menu lateral"
              >
                <PanelLeftOpen className="w-[18px] h-[18px]" />
              </button>
            )}

            <h1 className="text-[15px] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-[-0.015em] truncate hidden md:block">
              {getSectionTitle(currentSection)}
            </h1>
            {currentArea && areaLevels[currentArea] === 1 && (
              <span
                className="hidden md:inline-flex items-center gap-1 rounded-full bg-black/[0.05] dark:bg-white/[0.1] px-2.5 py-0.5 text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D] shrink-0"
                title="Você pode ver esta área, mas não alterar. Peça ao administrador se precisar editar."
              >
                <Eye className="w-3 h-3" />
                Somente leitura
              </span>
            )}
          </div>

          {/* Spotlight Search Bar */}
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            className="flex items-center space-x-2.5 bg-black/[0.045] hover:bg-black/[0.07] dark:bg-white/[0.08] dark:hover:bg-white/[0.12] px-3.5 py-2 rounded-xl text-xs text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white transition-all cursor-pointer flex-1 max-w-[220px] sm:max-w-xs md:max-w-sm mx-1"
            title="Buscar no sistema (⌘K)"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1 text-left">Buscar OS, peças, checklists...</span>
            <kbd className="hidden sm:inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md bg-white dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[10px] text-[#6E6E73] dark:text-[#AEAEB2] font-mono shrink-0">
              <span>⌘K</span>
            </kbd>
          </button>

          {/* Right Context Controls */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Master-only Organization Selector */}
            {isMaster && organizations.length > 1 && (
              <div className="hidden xl:flex items-center space-x-1.5 bg-black/[0.045] dark:bg-white/[0.08] px-2.5 py-1.5 rounded-xl text-xs">
                <Building className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#409CFF] shrink-0" />
                <select
                  value={organization?.id || ''}
                  onChange={(e) => selectOrganization(e.target.value)}
                  className="apple-inline-select bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
                  title="Alternar Empresa (Master)"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Unit Selector */}
            <div className="hidden sm:flex items-center space-x-1.5 bg-black/[0.045] dark:bg-white/[0.08] px-2.5 py-1.5 rounded-xl text-xs">
              <Building2 className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#98989D] shrink-0" />
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="apple-inline-select bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] font-medium focus:outline-none cursor-pointer max-w-[130px] truncate"
                title="Filtrar por Unidade"
              >
                <option value="todas">Todas as Unidades</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Contract Selector */}
            {contracts.length > 0 && (
              <div className="hidden lg:flex items-center space-x-1.5 bg-black/[0.045] dark:bg-white/[0.08] px-2.5 py-1.5 rounded-xl text-xs">
                <FileText className="w-3.5 h-3.5 text-[#6E6E73] dark:text-[#98989D] shrink-0" />
                <select
                  value={selectedContractId}
                  onChange={(e) => setSelectedContractId(e.target.value)}
                  className="apple-inline-select bg-transparent text-[#1D1D1F] dark:text-[#F5F5F7] font-medium focus:outline-none cursor-pointer max-w-[135px] truncate"
                >
                  <option value="todos">Todos os Contratos</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro'}
              className="inline-flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-black/[0.045] hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-[#1D1D1F] dark:text-[#F5F5F7] font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#6E6E73]" />
                  <span className="hidden sm:inline">Escuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#FF9F0A]" />
                  <span className="hidden sm:inline">Claro</span>
                </>
              )}
            </button>

          </div>
        </header>

        {/* Main Content Viewport */}
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto overflow-y-auto ${sidebarCollapsed ? 'lg:max-w-none' : ''} max-w-[1440px]`}>
          {children}
        </main>
      </div>

      {/* Global Spotlight Search */}
      <GlobalSearchModal
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
      />
    </div>
  );
};
