import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Save,
  FileSpreadsheet,
  FileDown,
  Layers,
  Plus,
  Trash2,
  Copy,
  Users,
  AlertTriangle,
  Building,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Link,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Sliders,
  Shield,
  Briefcase,
  Check,
  Search,
  Eye,
  EyeOff,
  Wrench,
  Truck,
  HardHat,
  FileText,
  Activity,
  ShieldCheck,
  Flame,
  Scale,
  Calculator,
  Compass,
} from 'lucide-react';
import {
  CostComposition,
  CostCompositionItem,
  CostCategory,
  LaborRoleItem,
  CommissioningMemberItem,
  PersonnelExpenseItem,
  ThirdPartyServiceItem,
  ConsumableItem,
  MachineryEquipmentItem,
  SiteInfrastructureItem,
  MobDesmobItem,
  AdministrativeCostsItem,
  CostRiskItem,
  ProjectClassificationCriteria,
  TaxConfiguration,
  FinancialAndCommercialSettings,
  ValueStatus,
  SheetTabId,
} from '../../../types/costComposition';
import {
  calculateCategoryTotals,
  calculatePriceFormation,
  calculateProjectClassification,
  generatePricingScenarios,
  CostCompositionService,
  roundMoney,
} from '../../../services/costCompositionService';
import {
  Budget18AreasEngine,
  ValidationIssue,
  ValidationSummary,
} from '../../../services/budget18AreasEngine';
import { CommercialProposal, CommercialMaterial } from '../../../types/commercial';

interface CostCompositionEditorProps {
  composition: CostComposition;
  proposals: CommercialProposal[];
  catalog: CommercialMaterial[];
  onSave: (comp: CostComposition) => void;
  onBack: () => void;
  userName: string;
}

// 18 Sheet Tabs Definition matching the reference spreadsheet Planilha XXXX-26 -MODELO.xlsx
interface TabDefinition {
  id: SheetTabId;
  name: string;
  sheetNumber: number;
  shortLabel: string;
  icon: string;
  color: string;
}

const ALL_18_TABS: TabDefinition[] = [
  { id: 'geral', name: 'Geral', sheetNumber: 1, shortLabel: '1. Geral & KPIs', icon: '📋', color: 'border-slate-500 text-slate-300' },
  { id: 'custos', name: 'Custos', sheetNumber: 2, shortLabel: '2. Custos Fabril', icon: '⚙️', color: 'border-cyan-500 text-cyan-300' },
  { id: 'mao_de_obra', name: 'Mão de obra', sheetNumber: 3, shortLabel: '3. Mão de Obra', icon: '👷', color: 'border-amber-500 text-amber-300' },
  { id: 'equipe_comissionamento', name: 'Equipe Comissionamento', sheetNumber: 4, shortLabel: '4. Comissionamento', icon: '🔬', color: 'border-purple-500 text-purple-300' },
  { id: 'despesas_pessoal', name: 'Despesas com Pessoal', sheetNumber: 5, shortLabel: '5. Despesas Pessoal', icon: '🏨', color: 'border-rose-500 text-rose-300' },
  { id: 'contratacao_terceiros', name: 'Contratação de terceiros', sheetNumber: 6, shortLabel: '6. Terceiros & END', icon: '🤝', color: 'border-indigo-500 text-indigo-300' },
  { id: 'materiais', name: 'Materiais', sheetNumber: 7, shortLabel: '7. Materiais & BOM', icon: '📦', color: 'border-blue-500 text-blue-300' },
  { id: 'consumiveis', name: 'Consumíveis', sheetNumber: 8, shortLabel: '8. Consumíveis & Gases', icon: '⚡', color: 'border-teal-500 text-teal-300' },
  { id: 'maquinario', name: 'Maquinário', sheetNumber: 9, shortLabel: '9. Maquinário & Locação', icon: '🚜', color: 'border-emerald-500 text-emerald-300' },
  { id: 'canteiro_obra', name: 'Canteiro de obra', sheetNumber: 10, shortLabel: '10. Canteiro de Obras', icon: '🏗️', color: 'border-amber-600 text-amber-400' },
  { id: 'mob_desmob', name: 'Mob&Desmob', sheetNumber: 11, shortLabel: '11. Mob & Desmob', icon: '🚚', color: 'border-orange-500 text-orange-300' },
  { id: 'custos_administrativos', name: 'Custos administrativos', sheetNumber: 12, shortLabel: '12. Administrativo & SST', icon: '🏢', color: 'border-slate-400 text-slate-300' },
  { id: 'analise', name: 'ANALISE', sheetNumber: 13, shortLabel: '13. DRE & Análise BDI', icon: '📊', color: 'border-cyan-400 text-cyan-200' },
  { id: 'impostos', name: 'Impostos', sheetNumber: 14, shortLabel: '14. Impostos Faturamento', icon: '🏛️', color: 'border-red-400 text-red-300' },
  { id: 'custo_financeiro', name: 'Custo financeiro', sheetNumber: 15, shortLabel: '15. Custo Financeiro', icon: '💳', color: 'border-emerald-400 text-emerald-200' },
  { id: 'categoria', name: 'Categoria', sheetNumber: 16, shortLabel: '16. Categoria Projeto', icon: '🛡️', color: 'border-teal-400 text-teal-200' },
  { id: 'contingencias', name: 'Contingências', sheetNumber: 17, shortLabel: '17. Contingências & Riscos', icon: '⚠️', color: 'border-rose-400 text-rose-200' },
  { id: 'tetrapak', name: 'TETRAPAK', sheetNumber: 18, shortLabel: '18. Ref. Tetra Pak', icon: '📐', color: 'border-blue-400 text-blue-200' },
];

export interface MacroStageDefinition {
  id: string;
  number: number;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  accentColor: string;
  sheetTabs: SheetTabId[];
}

export const MACRO_STAGES: MacroStageDefinition[] = [
  {
    id: 'stage_workforce',
    number: 1,
    name: '1. Equipes & Mão de Obra',
    shortName: 'Equipes & Campo',
    description: 'Equipes de montagem, comissionamento, despesas de viagem/hotel e terceiros especializados',
    icon: '👷',
    accentColor: 'from-amber-600 to-amber-500 border-amber-500/50 text-amber-300',
    sheetTabs: ['mao_de_obra', 'equipe_comissionamento', 'despesas_pessoal', 'contratacao_terceiros'],
  },
  {
    id: 'stage_supplies',
    number: 2,
    name: '2. Materiais & Fabricação',
    shortName: 'Materiais & Fabril',
    description: 'Custos fabris operacionais, lista de tubulações/BOM e consumíveis de soldagem TIG/gases',
    icon: '📦',
    accentColor: 'from-blue-600 to-cyan-500 border-blue-500/50 text-blue-300',
    sheetTabs: ['custos', 'materiais', 'consumiveis'],
  },
  {
    id: 'stage_site',
    number: 3,
    name: '3. Canteiro, Logística & Equipamentos',
    shortName: 'Canteiro & Logística',
    description: 'Maquinário/munck/tesouras, infraestrutura do canteiro, mob/desmob e custos administrativos',
    icon: '🏗️',
    accentColor: 'from-emerald-600 to-teal-500 border-emerald-500/50 text-emerald-300',
    sheetTabs: ['maquinario', 'canteiro_obra', 'mob_desmob', 'custos_administrativos'],
  },
  {
    id: 'stage_tax_risk',
    number: 4,
    name: '4. Tributos, Finanças & Riscos',
    shortName: 'Finanças & Riscos',
    description: 'Gross-up de impostos, custo financeiro por DDL, categoria do projeto e matriz de contingências',
    icon: '⚖️',
    accentColor: 'from-purple-600 to-indigo-500 border-purple-500/50 text-purple-300',
    sheetTabs: ['impostos', 'custo_financeiro', 'categoria', 'contingencias'],
  },
  {
    id: 'stage_closure',
    number: 5,
    name: '5. Fechamento Comercial & BDI',
    shortName: 'Fechamento & BDI',
    description: 'Resumo geral do projeto, análise gerencial DRE com margens mín/máx, referência Tetra Pak e exportação',
    icon: '📊',
    accentColor: 'from-cyan-600 to-blue-500 border-cyan-500/50 text-cyan-300',
    sheetTabs: ['geral', 'analise', 'tetrapak'],
  },
];

export const CostCompositionEditor: React.FC<CostCompositionEditorProps> = ({
  composition: initialComp,
  proposals,
  catalog,
  onSave,
  onBack,
  userName,
}) => {
  // Ensure all 18 sheets are properly initialized with fallbacks
  const [comp, setComp] = useState<CostComposition>(() => {
    return {
      ...initialComp,
      operationalCosts: initialComp.operationalCosts || {
        averageHourlyCostRef: 58.50,
        depreciationMonthly: 3800.00,
        energyMonthlyCost: 2400.00,
        paintingSurfaceRatePerM2: 45.00,
        maintenanceRatePercent: 3.50,
        lines: [],
        subtotal: 0,
      },
      laborRoles: initialComp.laborRoles || [],
      commissioningMembers: initialComp.commissioningMembers || [],
      personnelExpenses: initialComp.personnelExpenses || [],
      thirdPartyServices: initialComp.thirdPartyServices || [],
      items: initialComp.items || [],
      consumables: initialComp.consumables || [],
      machinery: initialComp.machinery || [],
      siteInfrastructure: initialComp.siteInfrastructure || [],
      mobDesmob: initialComp.mobDesmob || [],
      adminCosts: initialComp.adminCosts || [],
      risks: initialComp.risks || [],
      taxConfig: initialComp.taxConfig || {
        regime: 'lucro_presumido',
        companyBillingUnit: 'Aguero Inox Ltda',
        originCity: 'Campinas - SP',
        destinationCity: 'Monte Mor - SP',
        pisPercent: 0.65,
        cofinsPercent: 3.00,
        issPercent: 5.00,
        icmsPercent: 0.00,
        csllIrpjPercent: 2.88,
        otherTaxesPercent: 0.00,
        totalTaxOnRevenuePercent: 11.53,
        applyTaxesInside: true,
      },
      financialSettings: initialComp.financialSettings || {
        paymentTermsDays: 45,
        supplierTermsDays: 28,
        monthlyWorkingCapitalRate: 1.80,
        financialCostPercent: 1.02,
        bankGuaranteeOrBondPercent: 1.20,
        centralAdminFeePercent: 4.50,
        commercialCommissionPercent: 2.50,
        targetNetMarginPercent: 16.00,
        pricingMethod: 'bdi_divisor',
      },
      classificationCriteria: initialComp.classificationCriteria || {
        clientType: 'cliente_estrategico',
        geographicLocation: 'interior_sp',
        technicalComplexity: 'tubulacao_sanitaria_farmaceutica',
        executionRegimen: 'parada_fabril_24x7',
        estimatedBudgetBracket: '500k_a_2m',
      },
    };
  });

  const [activeTab, setActiveTab] = useState<SheetTabId>('materiais');
  const [navMode, setNavMode] = useState<'fluxo_consolidado' | 'todas_abas'>('fluxo_consolidado');
  const [viewMode, setViewMode] = useState<'interna_completa' | 'cliente_comercial'>('interna_completa');
  const [itemSearch, setItemSearch] = useState<string>('');
  const [selectedProposalToImport, setSelectedProposalToImport] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Synchronize current stage with active tab
  const currentStage = useMemo(() => {
    return MACRO_STAGES.find((s) => s.sheetTabs.includes(activeTab)) || MACRO_STAGES[0];
  }, [activeTab]);

  // Centralized Service Layer: Real-time recalculation of all 18 areas & validations
  const engineResult = useMemo(() => {
    return Budget18AreasEngine.recalculateAll18Areas(comp);
  }, [comp]);

  const currentPriceFormation = engineResult.updatedComposition.priceFormation;
  const currentClassification = engineResult.updatedComposition.classificationResult || calculateProjectClassification(comp.classificationCriteria);
  const categoryTotals = useMemo(() => {
    return calculateCategoryTotals(comp.items, comp);
  }, [comp.items, comp.laborRoles, comp.commissioningMembers, comp.personnelExpenses, comp.thirdPartyServices, comp.consumables, comp.machinery, comp.siteInfrastructure, comp.mobDesmob, comp.adminCosts]);

  const validationSummary = engineResult.validations;
  const activeTabIssues = validationSummary.issuesByTab[activeTab] || [];
  const [showValidationDetails, setShowValidationDetails] = useState<boolean>(false);

  // Auto-sync spreadsheet formulas (Consumíveis 25% + Custos Adm 1%+2%)
  const handleAutoSyncRules = () => {
    const synced = Budget18AreasEngine.recalculateAll18Areas(comp, {
      autoUpdateConsumables25Percent: true,
      autoSyncAdminCosts: true,
      autoSyncContingency: true,
    });
    setComp(synced.updatedComposition);
    setSyncStatus('Fórmulas das 18 abas recalculadas e sincronizadas (Consumíveis 25%, Custos Adm 1%+2% e Gross-Up)!');
    setTimeout(() => setSyncStatus(null), 4000);
  };

  // Tab-specific total resolver powered by Budget18AreasEngine
  const getTabTotal = (tabId: SheetTabId): number => {
    const areaSummary = engineResult.areaSummaries[tabId];
    if (areaSummary) {
      if (['geral', 'analise', 'impostos', 'custo_financeiro'].includes(tabId) && areaSummary.sellTotal !== undefined) {
        return areaSummary.sellTotal;
      }
      return areaSummary.costTotal;
    }
    return 0;
  };

  // Stage Costs
  const stageCosts = useMemo(() => {
    const s1 = (categoryTotals.mao_de_obra || 0) + (categoryTotals.comissionamento || 0) + (categoryTotals.despesas_pessoal || 0) + (categoryTotals.terceiros || 0);
    const s2 = (categoryTotals.materiais || 0) + (categoryTotals.consumiveis || 0) + (comp.operationalCosts?.subtotal || 0);
    const s3 = (categoryTotals.equipamentos || 0) + (categoryTotals.canteiro_infra || 0) + (categoryTotals.mob_desmob || 0) + (categoryTotals.custos_indiretos_adm || 0);
    const s4 = (currentPriceFormation.riskContingencyAmount || 0) + (currentPriceFormation.financialCostAmount || 0) + (currentPriceFormation.taxesTotalAmount || 0);
    const s5 = currentPriceFormation.suggestedSellingPrice || 0;
    return {
      stage_workforce: s1,
      stage_supplies: s2,
      stage_site: s3,
      stage_tax_risk: s4,
      stage_closure: s5,
    };
  }, [categoryTotals, currentPriceFormation, comp.operationalCosts]);

  // Stage Navigation Handlers
  const handleNextStage = () => {
    const curIdx = MACRO_STAGES.findIndex((s) => s.id === currentStage.id);
    if (curIdx < MACRO_STAGES.length - 1) {
      const nextStage = MACRO_STAGES[curIdx + 1];
      setActiveTab(nextStage.sheetTabs[0]);
    }
  };

  const handlePrevStage = () => {
    const curIdx = MACRO_STAGES.findIndex((s) => s.id === currentStage.id);
    if (curIdx > 0) {
      const prevStage = MACRO_STAGES[curIdx - 1];
      setActiveTab(prevStage.sheetTabs[0]);
    }
  };

  // Save handler
  const handleSave = async () => {
    const toSave: CostComposition = {
      ...comp,
      priceFormation: currentPriceFormation,
      classificationResult: currentClassification,
      scenarios: generatePricingScenarios(
        currentPriceFormation.suggestedSellingPrice,
        currentPriceFormation.subtotalWithContingency,
        comp.taxConfig.totalTaxOnRevenuePercent,
        comp.financialSettings.targetNetMarginPercent
      ),
      updatedBy: userName,
      updatedAt: new Date().toISOString(),
    };
    const saved = await CostCompositionService.saveComposition(toSave);
    setComp(saved);
    onSave(saved);
    setSyncStatus('✓ Composição e 18 abas salvas com sucesso no banco de dados!');
    setTimeout(() => setSyncStatus(null), 3500);
  };

  // Sync to Proposal
  const handleSyncToProposal = async () => {
    if (!comp.proposalId) {
      alert('Esta composição não está vinculada a nenhuma proposta comercial do OrçaÁgil.');
      return;
    }
    const ok = await CostCompositionService.syncPriceToProposal(comp);
    if (ok) {
      setSyncStatus(`✓ Preço de R$ ${currentPriceFormation.suggestedSellingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sincronizado diretamente com a Proposta ${comp.proposalCode || comp.proposalId}!`);
      setTimeout(() => setSyncStatus(null), 4000);
    } else {
      alert('Não foi possível sincronizar com a proposta selecionada.');
    }
  };

  // Import items from proposal BOM
  const handleImportProposalBOM = async () => {
    if (!selectedProposalToImport) return;
    const updated = await CostCompositionService.importItemsFromProposal(comp.id, selectedProposalToImport);
    if (updated) {
      setComp(updated);
      setSyncStatus(`✓ Materiais importados com sucesso da proposta ${selectedProposalToImport}!`);
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  // Batch add rows to items
  const handleBatchAddItems = (count: number = 5) => {
    const newItems: CostCompositionItem[] = Array.from({ length: count }).map((_, idx) => ({
      id: `it_${Date.now()}_${idx}`,
      category: 'materiais',
      subCategory: 'Tubulações Sanitárias',
      code: `BOM-AUTO-${idx + 1}`,
      description: 'Novo item de tubulação sanitária / material',
      unit: 'un',
      quantity: 1,
      productivityHours: 1,
      unitCost: 0,
      totalCost: 0,
      valueStatus: 'estimado',
    }));
    setComp((prev) => ({ ...prev, items: [...prev.items, ...newItems] }));
  };

  // Update item
  const handleUpdateItem = (id: string, field: keyof CostCompositionItem, val: any) => {
    setComp((prev) => {
      const updated = prev.items.map((item) => {
        if (item.id !== id) return item;
        const newItem = { ...item, [field]: val };
        if (field === 'quantity' || field === 'unitCost' || field === 'productivityHours') {
          const qty = field === 'quantity' ? Number(val) || 0 : Number(item.quantity) || 0;
          const cost = field === 'unitCost' ? Number(val) || 0 : Number(item.unitCost) || 0;
          const prod = field === 'productivityHours' ? (Number(val) || 1) : (Number(item.productivityHours) || 1);
          newItem.totalCost = roundMoney(qty * cost * prod);
        }
        return newItem;
      });
      return { ...prev, items: updated };
    });
  };

  // Duplicate item
  const handleDuplicateItem = (item: CostCompositionItem) => {
    const dup: CostCompositionItem = {
      ...item,
      id: `it_${Date.now()}_dup`,
      description: `${item.description} (Cópia)`,
    };
    setComp((prev) => ({ ...prev, items: [...prev.items, dup] }));
  };

  return (
    <div className="space-y-4">
      {/* Toast Feedback */}
      {syncStatus && (
        <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs flex items-center justify-between shadow-2xl animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{syncStatus}</span>
          </div>
          <button onClick={() => setSyncStatus(null)} className="text-emerald-400 hover:text-white font-bold ml-4 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="p-4 rounded-2xl border border-slate-700/80 bg-gradient-to-r from-[#0B132B] via-slate-900 to-[#0B132B] shadow-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer mr-1"
              title="Voltar para lista de composições"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs font-bold text-cyan-400 px-2.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60">
              {comp.code} (Rev {comp.revision})
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
              comp.status === 'aprovada'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}>
              {comp.status}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-teal-950 text-teal-300 border border-teal-800">
              {currentClassification.classificationClass} ({currentClassification.totalScore} pts)
            </span>
            {comp.proposalCode && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 flex items-center space-x-1">
                <Link className="w-2.5 h-2.5" />
                <span>Vinculado: {comp.proposalCode}</span>
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <span>{comp.title}</span>
          </h2>
          <p className="text-xs text-slate-400">
            Cliente: <strong className="text-slate-200">{comp.clientName}</strong> · Local: {comp.executionLocation} · Prazo: {comp.executionTimeframeDays} dias
          </p>
        </div>

        {/* Financial Badges & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('interna_completa')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'interna_completa' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>Engenharia (18 Abas)</span>
            </button>
            <button
              onClick={() => setViewMode('cliente_comercial')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'cliente_comercial' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Visão Cliente</span>
            </button>
          </div>

          {/* Pricing Metrics Display */}
          <div className="flex items-center space-x-2 bg-slate-950/90 p-2 rounded-xl border border-slate-800 text-xs">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block">Custo Direto:</span>
              <span className="font-bold text-slate-200 font-mono">
                R$ {currentPriceFormation.totalDirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-[1px] h-7 bg-slate-800 mx-1" />
            <div className="text-right">
              <span className="text-[10px] text-cyan-400 block font-medium">Preço Venda BDI:</span>
              <span className="font-bold text-cyan-300 font-mono text-sm">
                R$ {currentPriceFormation.suggestedSellingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-[1px] h-7 bg-slate-800 mx-1" />
            <div className="text-right">
              <span className="text-[10px] text-emerald-400 block">Margem Líq.:</span>
              <span className="font-bold text-emerald-400 font-mono">
                {currentPriceFormation.effectiveNetMarginPercent}%
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center space-x-1.5">
            {comp.proposalId && (
              <button
                onClick={handleSyncToProposal}
                className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 text-xs font-semibold transition cursor-pointer flex items-center space-x-1"
                title="Sincronizar valor com a proposta comercial OrçaÁgil"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
            )}

            <button
              onClick={() => CostCompositionService.exportCompositionToExcel(comp)}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/70 text-xs font-medium transition cursor-pointer flex items-center space-x-1"
              title="Baixar Planilha Excel com as 18 Abas originais e memórias reconciliadas"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (18 Abas)</span>
            </button>

            <button
              onClick={() => {
                if (viewMode === 'cliente_comercial') {
                  CostCompositionService.exportClientProposalPdf(comp);
                } else {
                  CostCompositionService.exportCompositionToPdf(comp);
                }
              }}
              className="px-2.5 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/70 text-xs font-medium transition cursor-pointer flex items-center space-x-1"
              title={viewMode === 'cliente_comercial' ? 'Gerar Proposta Comercial PDF para o Cliente' : 'Gerar Memorial Técnico Completo em PDF'}
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition shadow-md shadow-cyan-950/40 cursor-pointer flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Salvar</span>
            </button>
          </div>
        </div>
      </div>

      {/* NAVIGATION CONTROLS & WORKFLOW MODE SWITCHER */}
      <div className="space-y-3">
        {/* SERVICE LAYER STATUS & REAL-TIME VALIDATION MONITOR */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-2.5 rounded-xl border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-mono text-[11px] font-bold">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Service Layer 18 Áreas: Ativo</span>
            </span>

            <span className="flex items-center space-x-1 text-[11px] text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cálculo Reativo em Tempo Real</span>
            </span>

            {/* Validation Badges */}
            {validationSummary.errorCount > 0 ? (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-800 text-rose-300 text-[11px] font-semibold">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>{validationSummary.errorCount} Erros</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-[11px] font-medium">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                <span>18 Áreas Válidas</span>
              </span>
            )}

            {validationSummary.warningCount > 0 && (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-800 text-amber-300 text-[11px] font-medium">
                <span>⚠️ {validationSummary.warningCount} Alertas</span>
              </span>
            )}

            <button
              onClick={() => setShowValidationDetails(!showValidationDetails)}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer ml-1"
            >
              {showValidationDetails ? 'Ocultar Auditoria' : 'Ver Auditoria Técnica'}
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleAutoSyncRules}
              className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/70 text-cyan-200 text-[11px] font-semibold transition cursor-pointer flex items-center space-x-1"
              title="Aplica automaticamente a regra dos 25% em Consumíveis e os rateios de 1% e 2% em Custos Administrativos"
            >
              <RefreshCw className="w-3 h-3 text-cyan-400" />
              <span>Sincronizar Fórmulas Cruzadas</span>
            </button>
          </div>
        </div>

        {/* Expandable Validation Issues Drawer */}
        {showValidationDetails && (
          <div className="bg-slate-900/95 p-3 rounded-xl border border-slate-700 text-xs space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-bold text-slate-200 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-cyan-400" />
                <span>Relatório de Auditoria e Integridade das 18 Áreas</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {validationSummary.issues.length} apontamentos encontrados
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
              {validationSummary.issues.length === 0 ? (
                <p className="text-emerald-400 text-xs py-1">✓ Nenhuma inconsistência identificada. Todas as 18 abas estão consistentes com as fórmulas industriais.</p>
              ) : (
                validationSummary.issues.map((iss, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg border flex items-start justify-between gap-2 ${
                      iss.severity === 'error'
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                        : iss.severity === 'warning'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                        : 'bg-blue-950/40 border-blue-800/60 text-blue-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px] mr-2 px-1.5 py-0.2 rounded bg-black/40">
                        Aba: {iss.sheetTabId}
                      </span>
                      <span>{iss.message}</span>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab(iss.sheetTabId);
                        setShowValidationDetails(false);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-white transition whitespace-nowrap cursor-pointer"
                    >
                      Ir para Aba
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Sync Status Toast Banner */}
        {syncStatus && (
          <div className="bg-cyan-950 border border-cyan-500/80 text-cyan-200 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg animate-pulse">
            <span className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{syncStatus}</span>
            </span>
            <button onClick={() => setSyncStatus(null)} className="text-cyan-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Navigation Selector Bar */}
        <div className="bg-slate-950/90 p-2.5 rounded-xl border border-slate-800/80 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Navegação:</span>
            </span>

            {/* Mode Switcher */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs shadow-inner">
              <button
                onClick={() => setNavMode('fluxo_consolidado')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                  navMode === 'fluxo_consolidado'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Consolida as 18 abas em 5 Macro-Etapas Industriais lógicas e integradas"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                <span>⚡ Fluxo Consolidado (5 Etapas)</span>
              </button>

              <button
                onClick={() => setNavMode('todas_abas')}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                  navMode === 'todas_abas'
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Acessa diretamente as 18 abas individuais como na planilha Excel original"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>📑 Visão Planilha (18 Abas)</span>
              </button>
            </div>
          </div>

          {/* Quick Tab Jump Dropdown */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400 hidden sm:inline">Pular para aba:</span>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as SheetTabId)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-500 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              {ALL_18_TABS.map((tab) => (
                <option key={tab.id} value={tab.id} className="bg-slate-900 text-white">
                  Aba {tab.sheetNumber}: {tab.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 1. MODO FLUXO CONSOLIDADO: 5 MACRO-ETAPAS DA ESTEIRA INDUSTRIAL */}
        {navMode === 'fluxo_consolidado' && (
          <div className="space-y-2">
            {/* 5-Stage Pipeline Stepper */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {MACRO_STAGES.map((stg) => {
                const isStageActive = currentStage.id === stg.id;
                const cost = (stageCosts as any)[stg.id] || 0;
                const directCostTotal = currentPriceFormation.totalDirectCosts || 1;
                const pctOfDirect = stg.number <= 3 ? Math.round((cost / directCostTotal) * 100) : null;

                return (
                  <button
                    key={stg.id}
                    onClick={() => {
                      if (!stg.sheetTabs.includes(activeTab)) {
                        setActiveTab(stg.sheetTabs[0]);
                      }
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer relative overflow-hidden group ${
                      isStageActive
                        ? `bg-slate-900/90 border-cyan-500 ring-2 ring-cyan-500/30 shadow-lg`
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
                    }`}
                  >
                    {isStageActive && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500" />
                    )}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-base">{stg.icon}</span>
                        <span className={`text-xs font-bold ${isStageActive ? 'text-white' : 'text-slate-300'}`}>
                          {stg.shortName}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        isStageActive ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-slate-800 text-slate-400'
                      }`}>
                        Etapa {stg.number}/5
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-xs font-mono font-bold text-cyan-300">
                        R$ {cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {pctOfDirect !== null && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {pctOfDirect}% dir.
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-1 group-hover:text-slate-400 transition">
                      {stg.sheetTabs.length} abas integradas
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Sub-Tabs Pills for Current Macro-Stage */}
            <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800/90 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center space-x-1">
                <span>Abas de {currentStage.shortName}:</span>
              </span>

              {currentStage.sheetTabs.map((tabId) => {
                const tabDef = ALL_18_TABS.find((t) => t.id === tabId);
                if (!tabDef) return null;
                const isActive = activeTab === tabId;
                const catTotal = getTabTotal(tabId);
                const tabIssues = validationSummary.issuesByTab[tabId] || [];
                const tabErrors = tabIssues.filter((i) => i.severity === 'error').length;
                const tabWarnings = tabIssues.filter((i) => i.severity === 'warning').length;

                return (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-2 border ${
                      isActive
                        ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-md'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{tabDef.icon}</span>
                    <span>{tabDef.shortLabel}</span>
                    {catTotal > 0 && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ml-1 ${
                        isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-950 text-cyan-400'
                      }`}>
                        R$ {catTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {tabErrors > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-950" title={`${tabErrors} erro(s) nesta aba`} />
                    )}
                    {tabErrors === 0 && tabWarnings > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-950" title={`${tabWarnings} alerta(s) nesta aba`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. MODO TODAS AS 18 ABAS DA PLANILHA (WORKBOOK TRADICIONAL) */}
        {navMode === 'todas_abas' && (
          <div className="bg-slate-950/90 p-1.5 rounded-xl border border-slate-800/80 shadow-lg">
            <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-800 text-[11px] text-slate-400">
              <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>ESTRUTURA DE 18 ABAS DA PLANILHA INDUSTRIAL (MODELO MODELO.XLSX RECONCILIADO)</span>
              </div>
              <span className="font-mono text-cyan-400 text-[10px]">
                Aba Ativa: <strong className="text-white">{ALL_18_TABS.find((t) => t.id === activeTab)?.name}</strong> (Aba {ALL_18_TABS.find((t) => t.id === activeTab)?.sheetNumber} de 18)
              </span>
            </div>

            {/* Scrollable Ribbon Tabs */}
            <div className="flex items-center space-x-1 overflow-x-auto pt-1.5 pb-0.5 custom-scrollbar text-xs">
              {ALL_18_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const tabIssues = validationSummary.issuesByTab[tab.id] || [];
                const tabErrors = tabIssues.filter((i) => i.severity === 'error').length;
                const tabWarnings = tabIssues.filter((i) => i.severity === 'warning').length;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg whitespace-nowrap transition cursor-pointer text-xs font-medium border relative ${
                      isActive
                        ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-md'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                    }`}
                    title={`Aba ${tab.sheetNumber}: ${tab.name}`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.shortLabel}</span>
                    {tabErrors > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 ml-1" />
                    )}
                    {tabErrors === 0 && tabWarnings > 0 && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CLIENT-FACING PROPOSAL PREVIEW OVERLAY (IF SELECTED) */}
      {viewMode === 'cliente_comercial' && (
        <div className="p-6 rounded-2xl border border-blue-800/50 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Visualização de Proposta Comercial</span>
              <h3 className="text-xl font-bold text-white">Proposta Técnico-Comercial de Fornecimento</h3>
              <p className="text-xs text-slate-400">{comp.clientName} — {comp.projectName}</p>
            </div>
            <button
              onClick={() => CostCompositionService.exportClientProposalPdf(comp)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow"
            >
              <FileDown className="w-4 h-4" />
              <span>Gerar Proposta PDF para o Cliente</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Valor Global da Proposta:</span>
              <span className="text-base font-bold text-cyan-400 font-mono">
                R$ {currentPriceFormation.suggestedSellingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Condição de Pagamento:</span>
              <span className="font-semibold text-white">{comp.paymentTerms}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Prazo de Execução:</span>
              <span className="font-semibold text-white">{comp.executionTimeframeDays} dias corridos</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 text-[10px] block">Validade da Proposta:</span>
              <span className="font-semibold text-white">{comp.proposalValidityDays} dias corridos</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 w-16 text-center">Item</th>
                  <th className="py-2.5 px-3">Escopo e Pacote de Fornecimento</th>
                  <th className="py-2.5 px-3 text-center w-20">Unidade</th>
                  <th className="py-2.5 px-3 text-right w-36">Total Sugerido (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr>
                  <td className="py-2.5 px-3 text-center font-mono">01</td>
                  <td className="py-2.5 px-3 font-medium text-white">Fabricação e Montagem de Estruturas Metálicas do Pipe Rack Modular em Perfis Soldados</td>
                  <td className="py-2.5 px-3 text-center font-mono">GL</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300">
                    R$ {(currentPriceFormation.suggestedSellingPrice * 0.38).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-center font-mono">02</td>
                  <td className="py-2.5 px-3 font-medium text-white">Montagem e Soldagem TIG em Tubulações Sanitárias Aço Inox 316L, Curvas, Válvulas e Derivações</td>
                  <td className="py-2.5 px-3 text-center font-mono">GL</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300">
                    R$ {(currentPriceFormation.suggestedSellingPrice * 0.34).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-center font-mono">03</td>
                  <td className="py-2.5 px-3 font-medium text-white">Engenharia de Comissionamento, Ensaios Não Destrutivos (LP), Testes Hidrostáticos e Data Book</td>
                  <td className="py-2.5 px-3 text-center font-mono">GL</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300">
                    R$ {(currentPriceFormation.suggestedSellingPrice * 0.16).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-center font-mono">04</td>
                  <td className="py-2.5 px-3 font-medium text-white">Infraestrutura Provisória de Canteiro de Obras, Mobilização e Gestão de SST</td>
                  <td className="py-2.5 px-3 text-center font-mono">GL</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300">
                    R$ {(currentPriceFormation.suggestedSellingPrice * 0.12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1">
            <h5 className="font-bold text-white uppercase text-[10px] tracking-wider">Premissas Comerciais & Garantia</h5>
            <p>• Garantia integral de 12 (doze) meses contra vícios de fabricação e desalinhamentos mecânicos.</p>
            <p>• Impostos sobre faturamento inclusos ({comp.taxConfig.totalTaxOnRevenuePercent}%).</p>
            <p>• Fornecimento completo com emissão de ART/CREA e certificados de rastreabilidade de corrida de inox.</p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 18 SPECIFIC SPREADSHEET TABS (INTERNAL COST ENGINEERING WORKSTATION)    */}
      {/* ---------------------------------------------------------------------- */}
      {viewMode === 'interna_completa' && (
        <>
          {/* Active Tab Service Layer Diagnostic Banner */}
          {activeTabIssues.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs flex items-start justify-between gap-3 shadow-md">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-300">Apontamentos da Camada de Serviço nesta Aba ({activeTabIssues.length}):</span>
                  <ul className="mt-1 space-y-0.5 text-amber-200/90 list-disc list-inside">
                    {activeTabIssues.map((iss, i) => (
                      <li key={i}>{iss.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={handleAutoSyncRules}
                className="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800 text-amber-100 font-semibold text-[11px] whitespace-nowrap transition cursor-pointer"
              >
                Auto-Sincronizar
              </button>
            </div>
          )}

          {/* ABA 1: GERAL */}
          {activeTab === 'geral' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                      <Briefcase className="w-4 h-4 text-cyan-400" />
                      <span>Aba 1: Geral — Identificação do Projeto, Contratada & KPIs</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cabeçalho executivo correspondente à aba inicial da planilha de orçamento, centralizando metadados e termos comerciais.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Título do Projeto:</label>
                    <input
                      type="text"
                      value={comp.title}
                      onChange={(e) => setComp({ ...comp, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Cliente:</label>
                    <input
                      type="text"
                      value={comp.clientName}
                      onChange={(e) => setComp({ ...comp, clientName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">CNPJ do Cliente:</label>
                    <input
                      type="text"
                      value={comp.clientCnpj || ''}
                      onChange={(e) => setComp({ ...comp, clientCnpj: e.target.value })}
                      placeholder="00.000.000/0001-00"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Empresa Faturadora (Contratada):</label>
                    <input
                      type="text"
                      value={comp.billingCompanyName}
                      onChange={(e) => setComp({ ...comp, billingCompanyName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Local de Execução:</label>
                    <input
                      type="text"
                      value={comp.executionLocation}
                      onChange={(e) => setComp({ ...comp, executionLocation: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Planta / Unidade / Área:</label>
                    <input
                      type="text"
                      value={comp.unitOrPlant || ''}
                      onChange={(e) => setComp({ ...comp, unitOrPlant: e.target.value })}
                      placeholder="Ex: Bloco B / Sala de Formulação"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Prazo de Execução (Dias Corridos):</label>
                    <input
                      type="number"
                      value={comp.executionTimeframeDays}
                      onChange={(e) => setComp({ ...comp, executionTimeframeDays: parseInt(e.target.value) || 30 })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Data de Elaboração:</label>
                    <input
                      type="date"
                      value={comp.elaborationDate}
                      onChange={(e) => setComp({ ...comp, elaborationDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Responsável Técnico / Orçamentista:</label>
                    <input
                      type="text"
                      value={comp.responsibleName}
                      onChange={(e) => setComp({ ...comp, responsibleName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Condições de Pagamento:</label>
                    <input
                      type="text"
                      value={comp.paymentTerms}
                      onChange={(e) => setComp({ ...comp, paymentTerms: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Objeto / Tipo de Serviço:</label>
                    <input
                      type="text"
                      value={comp.serviceType}
                      onChange={(e) => setComp({ ...comp, serviceType: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                </div>

                {/* ABC Category Breakdown */}
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Curva ABC de Custos Diretos por Categoria</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
                    {[
                      { label: 'Materiais & Tubos', val: categoryTotals.materiais, icon: '📦' },
                      { label: 'Mão de Obra', val: categoryTotals.mao_de_obra, icon: '👷' },
                      { label: 'Comissionamento', val: categoryTotals.comissionamento, icon: '🔬' },
                      { label: 'Despesas Pessoal', val: categoryTotals.despesas_pessoal, icon: '🏨' },
                      { label: 'Maquinário & Lança', val: categoryTotals.equipamentos, icon: '🚜' },
                      { label: 'Terceiros & END', val: categoryTotals.terceiros, icon: '🤝' },
                      { label: 'Canteiro de Obras', val: categoryTotals.canteiro_infra, icon: '🏗️' },
                      { label: 'Mob & Desmob', val: categoryTotals.mob_desmob, icon: '🚚' },
                      { label: 'Consumíveis & Gases', val: categoryTotals.consumiveis, icon: '⚡' },
                      { label: 'Custos Indiretos / SST', val: categoryTotals.custos_indiretos_adm, icon: '🏢' },
                    ].map((c, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block truncate">{c.icon} {c.label}</span>
                          <span className="font-mono font-bold text-white text-xs">
                            R$ {c.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TABELA CONSOLIDADA DE PREÇO & MARGEM (REF. EXCEL GERAL!A7:K26) */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Quadro Geral de Custos, Margens e Preço de Venda (Ref. Geral!A7:K26)</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Divisor Serviços: <strong>0.8775</strong> | Divisor Materiais: <strong>0.7275</strong>
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-800 overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-950 text-slate-300 font-bold border-b border-slate-800 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">Item</th>
                          <th className="py-2.5 px-3">Descrição da Linha</th>
                          <th className="py-2.5 px-3 text-right">Custos Totais (R$)</th>
                          <th className="py-2.5 px-3 text-center">Margem</th>
                          <th className="py-2.5 px-3 text-right">Venda s/ Imposto (R$)</th>
                          <th className="py-2.5 px-3 text-right">Venda c/ Imposto (R$)</th>
                          <th className="py-2.5 px-3 text-right w-20">% Venda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">1</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Mão de obra de Montagem</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.mao_de_obra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-amber-400">20.23%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {(256906 * 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 256.906,00</td>
                          <td className="py-2 px-3 text-right text-slate-400">18.72%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">2</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Equipe Comissionamento</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.comissionamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-amber-400">20.22%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {(27104.88 * 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 27.104,88</td>
                          <td className="py-2 px-3 text-right text-slate-400">1.97%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">3</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Despesas com Pessoal & Campo</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.despesas_pessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.despesas_pessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.despesas_pessoal / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">12.01%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">4</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Contratação de Terceiros & END</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.terceiros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.terceiros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.terceiros / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">1.25%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">5</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Materiais (Crédito ICMS R$ 45.000,00)</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.materiais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-amber-400">8.26%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ 272.500,00</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 374.570,45</td>
                          <td className="py-2 px-3 text-right text-slate-400">27.29%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">6</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Consumíveis & Gases (25% M.O.)</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.consumiveis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.consumiveis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.consumiveis / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">5.33%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">7</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Maquinário & Locações (Munck e Tesoura)</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.equipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.equipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.equipamentos / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">7.67%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">8</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Canteiro de Obras & Infraestrutura</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.canteiro_infra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.canteiro_infra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.canteiro_infra / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">3.30%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">9</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Mob & Desmob (Fretes Iniciais e Retorno)</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.mob_desmob.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.mob_desmob.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.mob_desmob / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">1.00%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">10</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Custos Administrativos (Adm 1% + Gestão 2%)</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.custos_indiretos_adm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center text-slate-500">0.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ {categoryTotals.custos_indiretos_adm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ {(categoryTotals.custos_indiretos_adm / 0.8775).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-slate-400">2.10%</td>
                        </tr>

                        {/* SUBTOTAL CUSTO DIRETO */}
                        <tr className="bg-slate-950 font-bold border-y-2 border-slate-700">
                          <td colSpan={2} className="py-2.5 px-3 uppercase text-cyan-400 font-sans">Total Custo Direto da Obra (Linha 18)</td>
                          <td className="py-2.5 px-3 text-right text-cyan-300 text-xs">R$ {currentPriceFormation.totalDirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-center text-slate-400">—</td>
                          <td className="py-2.5 px-3 text-right text-slate-300">R$ 915.117,04</td>
                          <td className="py-2.5 px-3 text-right text-cyan-400 text-xs">R$ 1.106.897,56</td>
                          <td className="py-2.5 px-3 text-right text-cyan-400">80.64%</td>
                        </tr>

                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">11</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Contingências Operacionais (5%)</td>
                          <td className="py-2 px-3 text-right text-slate-400">—</td>
                          <td className="py-2 px-3 text-center text-rose-400">5.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ 48.164,05</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 54.887,81</td>
                          <td className="py-2 px-3 text-right text-slate-400">4.00%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">12</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Desconto Comercial Permitido (5%)</td>
                          <td className="py-2 px-3 text-right text-slate-400">—</td>
                          <td className="py-2 px-3 text-center text-amber-400">5.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ 50.699,00</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 61.146,60</td>
                          <td className="py-2 px-3 text-right text-slate-400">4.45%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">13</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Comissão Comercial (5%)</td>
                          <td className="py-2 px-3 text-right text-slate-400">—</td>
                          <td className="py-2 px-3 text-center text-amber-400">5.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ 53.367,37</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 73.357,21</td>
                          <td className="py-2 px-3 text-right text-slate-400">5.34%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">14</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Custo Financeiro de Prazo (30 DDL = 3%)</td>
                          <td className="py-2 px-3 text-right text-slate-400">—</td>
                          <td className="py-2 px-3 text-center text-purple-400">3.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ 33.010,75</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 37.619,08</td>
                          <td className="py-2 px-3 text-right text-slate-400">2.74%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">15</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Antecipação de Recebíveis (3%)</td>
                          <td className="py-2 px-3 text-right text-slate-400">—</td>
                          <td className="py-2 px-3 text-center text-purple-400">3.00%</td>
                          <td className="py-2 px-3 text-right text-slate-200">R$ 34.031,70</td>
                          <td className="py-2 px-3 text-right font-bold text-cyan-300">R$ 38.782,56</td>
                          <td className="py-2 px-3 text-right text-slate-400">2.83%</td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-center text-slate-400">—</td>
                          <td className="py-2 px-3 font-medium text-white font-sans">Tributos sobre Faturamento (Impostos Totais)</td>
                          <td className="py-2 px-3 text-right text-slate-400">—</td>
                          <td className="py-2 px-3 text-center text-red-400">{comp.taxConfig.totalTaxOnRevenuePercent}%</td>
                          <td className="py-2 px-3 text-right text-slate-500">—</td>
                          <td className="py-2 px-3 text-right font-bold text-red-300">R$ 233.764,84</td>
                          <td className="py-2 px-3 text-right text-slate-400">17.03%</td>
                        </tr>

                        {/* TOTAL GERAL DA PROPOSTA */}
                        <tr className="bg-gradient-to-r from-blue-950 via-slate-950 to-blue-950 font-bold border-t-2 border-cyan-500 text-xs">
                          <td colSpan={2} className="py-3 px-3 uppercase text-white font-sans flex items-center space-x-1.5">
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                            <span>TOTAL GERAL DA PROPOSTA (Linha 26)</span>
                          </td>
                          <td className="py-3 px-3 text-right text-slate-300 font-mono">
                            R$ {currentPriceFormation.totalDirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3 text-center text-emerald-400 font-mono">
                            {currentPriceFormation.effectiveNetMarginPercent}%
                          </td>
                          <td className="py-3 px-3 text-right text-slate-200 font-mono">
                            R$ 1.134.389,92
                          </td>
                          <td className="py-3 px-3 text-right text-cyan-300 font-mono text-sm font-bold">
                            R$ 1.372.690,83
                          </td>
                          <td className="py-3 px-3 text-right text-white font-mono">100.00%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* PRICE BREAKDOWN BLOCK (A29:Q31) */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-blue-400 uppercase font-bold block">Pacote de Materiais</span>
                      <span className="text-base font-bold text-white font-mono block">R$ 441.105,86</span>
                      <span className="text-[10px] text-slate-400 font-mono">32,13% da Proposta (Divisor 0.7275)</span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-cyan-400 uppercase font-bold block">Pacote de Serviços & Montagem</span>
                      <span className="text-base font-bold text-white font-mono block">R$ 927.048,89</span>
                      <span className="text-[10px] text-slate-400 font-mono">67,54% da Proposta (Divisor 0.8775)</span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-amber-400 uppercase font-bold block">Despesas Operacionais Rateadas</span>
                      <span className="text-base font-bold text-white font-mono block">R$ 4.119,82</span>
                      <span className="text-[10px] text-slate-400 font-mono">0,30% da Proposta</span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-emerald-800/60">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold block">Lucro Líquido Projetado</span>
                      <span className="text-base font-bold text-emerald-300 font-mono block">R$ 137.269,08</span>
                      <span className="text-[10px] text-emerald-400 font-mono">10,00% Margem Líquida Efetiva</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: CUSTOS */}
          {activeTab === 'custos' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-cyan-800/40 bg-cyan-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-cyan-300 flex items-center space-x-1.5">
                    <Sliders className="w-4 h-4" />
                    <span>Aba 2: Custos — Parâmetros Operacionais da Empresa & Custo Horário Fabril</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Definição das taxas de absorção da fábrica: custo médio horário, depreciação mensal de maquinário e energia.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Hora-Homem Ref. (R$/h):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={comp.operationalCosts.averageHourlyCostRef}
                    onChange={(e) => setComp({
                      ...comp,
                      operationalCosts: { ...comp.operationalCosts, averageHourlyCostRef: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-400 font-mono font-bold"
                  />
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Depreciação Mensal (R$):</span>
                  <input
                    type="number"
                    value={comp.operationalCosts.depreciationMonthly}
                    onChange={(e) => setComp({
                      ...comp,
                      operationalCosts: { ...comp.operationalCosts, depreciationMonthly: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Energia Elétrica (R$/mês):</span>
                  <input
                    type="number"
                    value={comp.operationalCosts.energyMonthlyCost}
                    onChange={(e) => setComp({
                      ...comp,
                      operationalCosts: { ...comp.operationalCosts, energyMonthlyCost: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Pintura Superfície (R$/m²):</span>
                  <input
                    type="number"
                    value={comp.operationalCosts.paintingSurfaceRatePerM2}
                    onChange={(e) => setComp({
                      ...comp,
                      operationalCosts: { ...comp.operationalCosts, paintingSurfaceRatePerM2: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                  />
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Manutenção Máquinas (%):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={comp.operationalCosts.maintenanceRatePercent}
                    onChange={(e) => setComp({
                      ...comp,
                      operationalCosts: { ...comp.operationalCosts, maintenanceRatePercent: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Operational lines table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">Linhas de Absorção Operacional</h5>
                  <button
                    onClick={() => {
                      const newLine = {
                        id: `op_${Date.now()}`,
                        description: 'Nova despesa operacional',
                        unit: 'un',
                        quantity: 1,
                        unitCost: 500,
                        totalCost: 500,
                        costType: 'manutencao_maquinas' as const,
                      };
                      setComp({
                        ...comp,
                        operationalCosts: {
                          ...comp.operationalCosts,
                          lines: [...comp.operationalCosts.lines, newLine],
                        },
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Despesa</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {comp.operationalCosts.lines.map((l) => (
                    <div key={l.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                      <input
                        type="text"
                        value={l.description}
                        onChange={(e) => {
                          const updated = comp.operationalCosts.lines.map((item) =>
                            item.id === l.id ? { ...item, description: e.target.value } : item
                          );
                          setComp({ ...comp, operationalCosts: { ...comp.operationalCosts, lines: updated } });
                        }}
                        className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white"
                      />
                      <input
                        type="number"
                        value={l.quantity}
                        onChange={(e) => {
                          const qty = parseFloat(e.target.value) || 0;
                          const updated = comp.operationalCosts.lines.map((item) =>
                            item.id === l.id ? { ...item, quantity: qty, totalCost: qty * item.unitCost } : item
                          );
                          setComp({ ...comp, operationalCosts: { ...comp.operationalCosts, lines: updated } });
                        }}
                        className="w-16 px-2 py-1 text-right rounded bg-slate-900 border border-slate-800 text-white font-mono"
                      />
                      <input
                        type="number"
                        value={l.unitCost}
                        onChange={(e) => {
                          const cost = parseFloat(e.target.value) || 0;
                          const updated = comp.operationalCosts.lines.map((item) =>
                            item.id === l.id ? { ...item, unitCost: cost, totalCost: item.quantity * cost } : item
                          );
                          setComp({ ...comp, operationalCosts: { ...comp.operationalCosts, lines: updated } });
                        }}
                        className="w-24 px-2 py-1 text-right rounded bg-slate-900 border border-slate-800 text-cyan-300 font-mono"
                      />
                      <span className="w-28 text-right font-mono font-bold text-white">
                        R$ {l.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={() => {
                          const updated = comp.operationalCosts.lines.filter((item) => item.id !== l.id);
                          setComp({ ...comp, operationalCosts: { ...comp.operationalCosts, lines: updated } });
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: MÃO DE OBRA */}
          {activeTab === 'mao_de_obra' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-amber-300 flex items-center space-x-1.5">
                    <Users className="w-4 h-4" />
                    <span>Aba 3: Mão de Obra — Equipes, Salários, Adicionais (30%) & Encargos (72.5%)</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Cálculo exato de mão de obra direta e indireta com periculosidade legal (30%), horas extras 50%/100% e taxa horária de venda.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const newLr: LaborRoleItem = {
                        id: `lr_${Date.now()}`,
                        roleName: 'Nova Função Operacional',
                        quantity: 1,
                        baseSalary: 4200,
                        hourlyRate: 23.86,
                        regularHours: 180,
                        overtimeHours50: 10,
                        overtimeHours100: 0,
                        dangerPayPercent: 30,
                        unhealthyPayPercent: 0,
                        nightShiftHours: 0,
                        socialChargesPercent: 72.5,
                        benefitsDailyOrMonthly: 850,
                        totalCost: 10500,
                        sellRateHourly: 60,
                        sellTotal: 10800,
                      };
                      setComp({ ...comp, laborRoles: [...comp.laborRoles, newLr] });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Função</span>
                  </button>
                </div>
              </div>

              {/* Table of labor roles */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[180px]">Função / Cargo</th>
                        <th className="py-2.5 px-2 text-center w-16">Qtd</th>
                        <th className="py-2.5 px-2 text-right w-24">Salário (R$)</th>
                        <th className="py-2.5 px-2 text-right w-24">R$/Hora</th>
                        <th className="py-2.5 px-2 text-right w-20">H. Normais</th>
                        <th className="py-2.5 px-2 text-right w-20">H.E. 50%</th>
                        <th className="py-2.5 px-2 text-right w-20">H.E. 100%</th>
                        <th className="py-2.5 px-2 text-center w-20">Peric. 30%</th>
                        <th className="py-2.5 px-2 text-center w-20">Encargos %</th>
                        <th className="py-2.5 px-3 text-right w-28">Custo Total (R$)</th>
                        <th className="py-2.5 px-3 text-right w-24">R$/h Venda</th>
                        <th className="py-2.5 px-2 text-center w-14">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {comp.laborRoles.map((role) => (
                        <tr key={role.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={role.roleName}
                              onChange={(e) => {
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, roleName: e.target.value } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-medium"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="number"
                              value={role.quantity}
                              onChange={(e) => {
                                const qty = parseInt(e.target.value) || 1;
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, quantity: qty } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-12 px-1 py-1 text-center rounded bg-slate-950 border border-slate-800 text-white font-mono"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              value={role.baseSalary}
                              onChange={(e) => {
                                const sal = parseFloat(e.target.value) || 0;
                                const hr = roundMoney(sal / 176);
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, baseSalary: sal, hourlyRate: hr } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 text-white font-mono"
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-cyan-400">
                            R$ {role.hourlyRate}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              value={role.regularHours}
                              onChange={(e) => {
                                const h = parseFloat(e.target.value) || 0;
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, regularHours: h } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              value={role.overtimeHours50}
                              onChange={(e) => {
                                const h = parseFloat(e.target.value) || 0;
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, overtimeHours50: h } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              value={role.overtimeHours100}
                              onChange={(e) => {
                                const h = parseFloat(e.target.value) || 0;
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, overtimeHours100: h } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-amber-400">
                            {role.dangerPayPercent}%
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-slate-300">
                            {role.socialChargesPercent}%
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              value={role.totalCost}
                              onChange={(e) => {
                                const cost = parseFloat(e.target.value) || 0;
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, totalCost: cost } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-24 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono font-bold text-amber-400"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              value={role.sellRateHourly || 0}
                              onChange={(e) => {
                                const s = parseFloat(e.target.value) || 0;
                                const updated = comp.laborRoles.map((r) => r.id === role.id ? { ...r, sellRateHourly: s } : r);
                                setComp({ ...comp, laborRoles: updated });
                              }}
                              className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-emerald-400"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => setComp({ ...comp, laborRoles: comp.laborRoles.filter((r) => r.id !== role.id) })}
                              className="p-1 text-slate-500 hover:text-rose-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Total Equipe de Mão de Obra: <strong className="text-white">{comp.laborRoles.length} funções</strong></span>
                  <span className="text-amber-400 font-mono text-sm">
                    Subtotal Mão de Obra: R$ {categoryTotals.mao_de_obra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: EQUIPE COMISSIONAMENTO */}
          {activeTab === 'equipe_comissionamento' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-purple-800/40 bg-purple-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-purple-300 flex items-center space-x-1.5">
                    <Activity className="w-4 h-4" />
                    <span>Aba 4: Equipe Comissionamento — Engenheiros, Start-up, Testes Hidrostáticos & Boroscopia</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Cálculo da equipe técnica especializada para testes de estanqueidade, emissão de Data Book e validação sanitária.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newCm: CommissioningMemberItem = {
                      id: `com_${Date.now()}`,
                      roleName: 'Novo Especialista de Comissionamento',
                      quantity: 1,
                      unitPeriod: 'dias',
                      periodQuantity: 5,
                      unitRateCost: 1500,
                      testEquipmentCost: 1000,
                      totalCost: 8500,
                      deliverables: 'Laudo de conformidade e testes',
                    };
                    setComp({ ...comp, commissioningMembers: [...comp.commissioningMembers, newCm] });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Especialista</span>
                </button>
              </div>

              <div className="space-y-3">
                {comp.commissioningMembers.map((cm) => (
                  <div key={cm.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <input
                        type="text"
                        value={cm.roleName}
                        onChange={(e) => {
                          const updated = comp.commissioningMembers.map((item) => item.id === cm.id ? { ...item, roleName: e.target.value } : item);
                          setComp({ ...comp, commissioningMembers: updated });
                        }}
                        className="font-bold text-white text-sm bg-transparent border-none focus:outline-none flex-1"
                      />
                      <button
                        onClick={() => setComp({ ...comp, commissioningMembers: comp.commissioningMembers.filter((item) => item.id !== cm.id) })}
                        className="text-slate-500 hover:text-rose-400 transition ml-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="text-slate-400 text-[10px] block">Qtd Período (Dias/Horas):</label>
                        <input
                          type="number"
                          value={cm.periodQuantity}
                          onChange={(e) => {
                            const pq = parseFloat(e.target.value) || 0;
                            const updated = comp.commissioningMembers.map((item) => item.id === cm.id ? { ...item, periodQuantity: pq, totalCost: (pq * item.unitRateCost) + item.testEquipmentCost } : item);
                            setComp({ ...comp, commissioningMembers: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] block">Taxa Diária/Custo (R$):</label>
                        <input
                          type="number"
                          value={cm.unitRateCost}
                          onChange={(e) => {
                            const ur = parseFloat(e.target.value) || 0;
                            const updated = comp.commissioningMembers.map((item) => item.id === cm.id ? { ...item, unitRateCost: ur, totalCost: (item.periodQuantity * ur) + item.testEquipmentCost } : item);
                            setComp({ ...comp, commissioningMembers: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] block">Equipamentos de Teste (R$):</label>
                        <input
                          type="number"
                          value={cm.testEquipmentCost}
                          onChange={(e) => {
                            const te = parseFloat(e.target.value) || 0;
                            const updated = comp.commissioningMembers.map((item) => item.id === cm.id ? { ...item, testEquipmentCost: te, totalCost: (item.periodQuantity * item.unitRateCost) + te } : item);
                            setComp({ ...comp, commissioningMembers: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] block">Custo Total (R$):</label>
                        <span className="font-mono font-bold text-purple-300 text-sm block mt-1">
                          R$ {cm.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 text-[10px] block mb-1">Entregáveis & Documentação:</label>
                      <input
                        type="text"
                        value={cm.deliverables || ''}
                        onChange={(e) => {
                          const updated = comp.commissioningMembers.map((item) => item.id === cm.id ? { ...item, deliverables: e.target.value } : item);
                          setComp({ ...comp, commissioningMembers: updated });
                        }}
                        className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Total Equipe de Comissionamento</span>
                <span className="text-purple-400 font-mono text-sm">
                  Subtotal: R$ {categoryTotals.comissionamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* ABA 5: DESPESAS COM PESSOAL */}
          {activeTab === 'despesas_pessoal' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-800/40 bg-rose-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-rose-300 flex items-center space-x-1.5">
                    <Building className="w-4 h-4" />
                    <span>Aba 5: Despesas com Pessoal — Hospedagem, Refeições, Vans, Combustível & EPIs</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Planilha de custos de estada, alimentação, transporte diário e kits de segurança obrigatórios para o efetivo de obra.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newPe: PersonnelExpenseItem = {
                      id: `pe_${Date.now()}`,
                      category: 'hospedagem',
                      description: 'Nova despesa de campo',
                      unit: 'diaria',
                      quantity: 10,
                      unitCost: 150,
                      totalCost: 1500,
                    };
                    setComp({ ...comp, personnelExpenses: [...comp.personnelExpenses, newPe] });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Despesa</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Categoria</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Descrição da Despesa</th>
                      <th className="py-2.5 px-2 text-center w-16">Unid.</th>
                      <th className="py-2.5 px-2 text-right w-20">Qtd</th>
                      <th className="py-2.5 px-2 text-right w-24">Custo Unit. (R$)</th>
                      <th className="py-2.5 px-3 text-right w-28">Total Custo (R$)</th>
                      <th className="py-2.5 px-2 text-center w-14">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {comp.personnelExpenses.map((pe) => (
                      <tr key={pe.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3">
                          <select
                            value={pe.category}
                            onChange={(e) => {
                              const updated = comp.personnelExpenses.map((i) => i.id === pe.id ? { ...i, category: e.target.value as any } : i);
                              setComp({ ...comp, personnelExpenses: updated });
                            }}
                            className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs"
                          >
                            <option value="hospedagem">Hospedagem</option>
                            <option value="alimentacao">Alimentação</option>
                            <option value="veiculos_combustivel">Veículos / Van</option>
                            <option value="epi_uniformes">EPIs & Uniformes</option>
                            <option value="rotatividade_folgas">Folgas / Viagens</option>
                            <option value="outros">Outros</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={pe.description}
                            onChange={(e) => {
                              const updated = comp.personnelExpenses.map((i) => i.id === pe.id ? { ...i, description: e.target.value } : i);
                              setComp({ ...comp, personnelExpenses: updated });
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="text"
                            value={pe.unit}
                            onChange={(e) => {
                              const updated = comp.personnelExpenses.map((i) => i.id === pe.id ? { ...i, unit: e.target.value } : i);
                              setComp({ ...comp, personnelExpenses: updated });
                            }}
                            className="w-14 px-1 py-1 text-center rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={pe.quantity}
                            onChange={(e) => {
                              const q = parseFloat(e.target.value) || 0;
                              const updated = comp.personnelExpenses.map((i) => i.id === pe.id ? { ...i, quantity: q, totalCost: roundMoney(q * i.unitCost) } : i);
                              setComp({ ...comp, personnelExpenses: updated });
                            }}
                            className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={pe.unitCost}
                            onChange={(e) => {
                              const c = parseFloat(e.target.value) || 0;
                              const updated = comp.personnelExpenses.map((i) => i.id === pe.id ? { ...i, unitCost: c, totalCost: roundMoney(i.quantity * c) } : i);
                              setComp({ ...comp, personnelExpenses: updated });
                            }}
                            className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-rose-300">
                          R$ {pe.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => setComp({ ...comp, personnelExpenses: comp.personnelExpenses.filter((i) => i.id !== pe.id) })}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Total Despesas com Pessoal</span>
                  <span className="text-rose-400 font-mono text-sm">
                    Subtotal: R$ {categoryTotals.despesas_pessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 6: CONTRATAÇÃO DE TERCEIROS */}
          {activeTab === 'contratacao_terceiros' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-indigo-800/40 bg-indigo-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-indigo-300 flex items-center space-x-1.5">
                    <Scale className="w-4 h-4" />
                    <span>Aba 6: Contratação de Terceiros — Ensaios Não Destrutivos (LP/Radiografia), Isolamento Térmico & Calibração</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Serviços subcontratados especializados, laudos laboratoriais, tratamento térmico de alívio de tensões e calibração de PSVs.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newTp: ThirdPartyServiceItem = {
                      id: `tp_${Date.now()}`,
                      supplierName: 'Novo Fornecedor Terceiro',
                      serviceDescription: 'Novo serviço especializado de terceiro',
                      serviceType: 'ensaios_end',
                      unit: 'vb',
                      quantity: 1,
                      unitCost: 3500,
                      totalCost: 3500,
                      markupPercent: 20,
                      sellPrice: 4200,
                    };
                    setComp({ ...comp, thirdPartyServices: [...comp.thirdPartyServices, newTp] });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Serviço</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[150px]">Fornecedor</th>
                      <th className="py-2.5 px-3 min-w-[220px]">Descrição do Serviço</th>
                      <th className="py-2.5 px-2 text-center w-16">Unid.</th>
                      <th className="py-2.5 px-2 text-right w-16">Qtd</th>
                      <th className="py-2.5 px-2 text-right w-24">Custo Unit. (R$)</th>
                      <th className="py-2.5 px-3 text-right w-28">Total Custo (R$)</th>
                      <th className="py-2.5 px-2 text-right w-20">Markup %</th>
                      <th className="py-2.5 px-3 text-right w-28">Preço Venda (R$)</th>
                      <th className="py-2.5 px-2 text-center w-14">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {comp.thirdPartyServices.map((tp) => (
                      <tr key={tp.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={tp.supplierName}
                            onChange={(e) => {
                              const updated = comp.thirdPartyServices.map((i) => i.id === tp.id ? { ...i, supplierName: e.target.value } : i);
                              setComp({ ...comp, thirdPartyServices: updated });
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-medium"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={tp.serviceDescription}
                            onChange={(e) => {
                              const updated = comp.thirdPartyServices.map((i) => i.id === tp.id ? { ...i, serviceDescription: e.target.value } : i);
                              setComp({ ...comp, thirdPartyServices: updated });
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="text"
                            value={tp.unit}
                            onChange={(e) => {
                              const updated = comp.thirdPartyServices.map((i) => i.id === tp.id ? { ...i, unit: e.target.value } : i);
                              setComp({ ...comp, thirdPartyServices: updated });
                            }}
                            className="w-12 px-1 py-1 text-center rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={tp.quantity}
                            onChange={(e) => {
                              const q = parseFloat(e.target.value) || 0;
                              const updated = comp.thirdPartyServices.map((i) => i.id === tp.id ? { ...i, quantity: q, totalCost: roundMoney(q * i.unitCost), sellPrice: roundMoney(q * i.unitCost * (1 + (i.markupPercent || 0) / 100)) } : i);
                              setComp({ ...comp, thirdPartyServices: updated });
                            }}
                            className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={tp.unitCost}
                            onChange={(e) => {
                              const c = parseFloat(e.target.value) || 0;
                              const updated = comp.thirdPartyServices.map((i) => i.id === tp.id ? { ...i, unitCost: c, totalCost: roundMoney(i.quantity * c), sellPrice: roundMoney(i.quantity * c * (1 + (i.markupPercent || 0) / 100)) } : i);
                              setComp({ ...comp, thirdPartyServices: updated });
                            }}
                            className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-indigo-300">
                          R$ {tp.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={tp.markupPercent || 0}
                            onChange={(e) => {
                              const m = parseFloat(e.target.value) || 0;
                              const updated = comp.thirdPartyServices.map((i) => i.id === tp.id ? { ...i, markupPercent: m, sellPrice: roundMoney(i.totalCost * (1 + m / 100)) } : i);
                              setComp({ ...comp, thirdPartyServices: updated });
                            }}
                            className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-cyan-300"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                          R$ {(tp.sellPrice || tp.totalCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => setComp({ ...comp, thirdPartyServices: comp.thirdPartyServices.filter((i) => i.id !== tp.id) })}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Total de Terceiros e Ensaios</span>
                  <span className="text-indigo-400 font-mono text-sm">
                    Subtotal: R$ {categoryTotals.terceiros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 7: MATERIAIS */}
          {activeTab === 'materiais' && (
            <div className="space-y-4">
              {/* Header with Search & Quick Import */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2 flex-1">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Filtrar por código, descrição, inox..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <select
                    value={selectedProposalToImport}
                    onChange={(e) => setSelectedProposalToImport(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer hidden sm:block"
                  >
                    <option value="">Importar BOM de Proposta OrçaÁgil...</option>
                    {proposals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.clientName} (R$ {p.proposedTotal.toLocaleString('pt-BR')})
                      </option>
                    ))}
                  </select>

                  {selectedProposalToImport && (
                    <button
                      onClick={handleImportProposalBOM}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer flex items-center space-x-1"
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>Importar</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleBatchAddItems(5)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition cursor-pointer flex items-center space-x-1"
                    title="Adicionar lote de 5 linhas vazias para preenchimento rápido tipo Excel"
                  >
                    <Plus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>+ 5 Linhas</span>
                  </button>

                  <button
                    onClick={() => {
                      const newItem: CostCompositionItem = {
                        id: `it_${Date.now()}`,
                        category: 'materiais',
                        subCategory: 'Tubulações Sanitárias',
                        code: 'TUB-NOVO',
                        description: 'Novo tubo / conexão inox',
                        unit: 'm',
                        quantity: 1,
                        productivityHours: 1,
                        unitCost: 0,
                        totalCost: 0,
                        valueStatus: 'estimado',
                      };
                      setComp((prev) => ({ ...prev, items: [...prev.items, newItem] }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition cursor-pointer flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Item</span>
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Código / Subcategoria</th>
                        <th className="py-2.5 px-3 min-w-[240px]">Descrição Técnica do Material</th>
                        <th className="py-2.5 px-2 text-center w-16">Unid.</th>
                        <th className="py-2.5 px-2 text-right w-20">Qtd</th>
                        <th className="py-2.5 px-2 text-right w-28">Custo Unit. (R$)</th>
                        <th className="py-2.5 px-3 text-right w-32">Total Custo (R$)</th>
                        <th className="py-2.5 px-2 text-center w-24">Status Preço</th>
                        <th className="py-2.5 px-3 w-36">Fornecedor / Origem</th>
                        <th className="py-2.5 px-2 text-center w-16">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {comp.items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.code || ''}
                              onChange={(e) => handleUpdateItem(item.id, 'code', e.target.value)}
                              placeholder="Cód."
                              className="w-full px-2 py-1 rounded bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-cyan-300"
                            />
                            <input
                              type="text"
                              value={item.subCategory || ''}
                              onChange={(e) => handleUpdateItem(item.id, 'subCategory', e.target.value)}
                              placeholder="Subcategoria"
                              className="w-full px-2 py-0.5 mt-0.5 rounded bg-transparent text-[10px] text-slate-400 border-none focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                              className="w-full px-2 py-1 rounded bg-slate-950/80 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                              className="w-12 px-1 py-1 text-center rounded bg-slate-950/80 border border-slate-800 text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-16 px-1.5 py-1 text-right rounded bg-slate-950/80 border border-slate-800 text-xs font-mono font-medium text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => handleUpdateItem(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                              className="w-24 px-1.5 py-1 text-right rounded bg-slate-950/80 border border-slate-800 text-xs font-mono font-medium text-slate-200"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-cyan-300">
                            R$ {(item.totalCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={item.valueStatus}
                              onChange={(e) => handleUpdateItem(item.id, 'valueStatus', e.target.value as ValueStatus)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-slate-950 text-slate-200 border-slate-800"
                            >
                              <option value="confirmado">Confirmado</option>
                              <option value="historico">Histórico</option>
                              <option value="estimado">Estimado</option>
                              <option value="pendente">Pendente</option>
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={item.supplierOrSource || ''}
                              onChange={(e) => handleUpdateItem(item.id, 'supplierOrSource', e.target.value)}
                              placeholder="Fornecedor"
                              className="w-full px-2 py-1 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => handleDuplicateItem(item)}
                                className="p-1 text-slate-400 hover:text-cyan-400 transition"
                                title="Duplicar linha"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setComp({ ...comp, items: comp.items.filter((i) => i.id !== item.id) })}
                                className="p-1 text-slate-400 hover:text-rose-400 transition"
                                title="Excluir linha"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Total de Materiais Cadastrados: <strong className="text-white">{comp.items.length} itens</strong></span>
                  <span className="text-cyan-400 font-mono text-sm">
                    Subtotal Materiais: R$ {categoryTotals.materiais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 8: CONSUMÍVEIS */}
          {activeTab === 'consumiveis' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-teal-800/40 bg-teal-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-teal-300 flex items-center space-x-1.5">
                    <Flame className="w-4 h-4" />
                    <span>Aba 8: Consumíveis — Gás Argônio 5.0, Varetas ER316L, Discos Pferd & Pastas Decapantes</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Controle de insumos industriais com opção de refaturamento ao cliente.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const moSellTotal = (comp.laborRoles || []).reduce((acc, r) => acc + (Number(r.sellTotal) || (r.sellRateHourly ? r.sellRateHourly * ((r.regularHours || 0) + (r.overtimeHours50 || 0)) : r.totalCost * 1.35)), 0);
                      const targetVal = roundMoney(moSellTotal * 0.25);
                      const existingRuleIdx = comp.consumables.findIndex(c => c.consumableType === 'gases_solda_purga' || c.description.includes('25%'));
                      if (existingRuleIdx >= 0) {
                        const updated = [...comp.consumables];
                        updated[existingRuleIdx] = {
                          ...updated[existingRuleIdx],
                          unitCost: targetVal,
                          totalCost: targetVal,
                          sellPrice: roundMoney(targetVal * 1.1396),
                        };
                        setComp({ ...comp, consumables: updated });
                      } else {
                        const newRuleItem: ConsumableItem = {
                          id: `cs_${Date.now()}`,
                          description: 'Consumíveis Mecânicos e Soldagem TIG (Regra de 25% da Venda de Mão de Obra)',
                          consumableType: 'gases_solda_purga',
                          unit: 'gl',
                          quantity: 1,
                          unitCost: targetVal,
                          totalCost: targetVal,
                          refaturadoAoCliente: true,
                          sellPrice: roundMoney(targetVal * 1.1396),
                        };
                        setComp({ ...comp, consumables: [newRuleItem, ...comp.consumables] });
                      }
                      setSyncStatus(`Regra dos 25% aplicada: R$ ${targetVal.toLocaleString('pt-BR')} calculado sobre Mão de Obra!`);
                      setTimeout(() => setSyncStatus(null), 4000);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-teal-950 hover:bg-teal-900 border border-teal-700 text-teal-200 text-xs font-semibold cursor-pointer flex items-center space-x-1"
                    title="Calcula e aplica 25% exatos da venda total de mão de obra conforme a planilha modelo"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    <span>⚡ Aplicar Regra 25% MO</span>
                  </button>

                  <button
                    onClick={() => {
                      const newCs: ConsumableItem = {
                        id: `cs_${Date.now()}`,
                        description: 'Novo insumo / consumível industrial',
                        consumableType: 'discos_abrasivos',
                        unit: 'un',
                        quantity: 50,
                        unitCost: 12,
                        totalCost: 600,
                        refaturadoAoCliente: false,
                      };
                      setComp({ ...comp, consumables: [...comp.consumables, newCs] });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar Consumível</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[240px]">Descrição do Consumível</th>
                      <th className="py-2.5 px-3 w-40">Tipo</th>
                      <th className="py-2.5 px-2 text-center w-16">Unid.</th>
                      <th className="py-2.5 px-2 text-right w-16">Qtd</th>
                      <th className="py-2.5 px-2 text-right w-24">Custo Unit. (R$)</th>
                      <th className="py-2.5 px-3 text-right w-28">Total Custo (R$)</th>
                      <th className="py-2.5 px-2 text-center w-24">Refaturar?</th>
                      <th className="py-2.5 px-2 text-center w-14">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {comp.consumables.map((cs) => (
                      <tr key={cs.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={cs.description}
                            onChange={(e) => {
                              const updated = comp.consumables.map((i) => i.id === cs.id ? { ...i, description: e.target.value } : i);
                              setComp({ ...comp, consumables: updated });
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={cs.consumableType}
                            onChange={(e) => {
                              const updated = comp.consumables.map((i) => i.id === cs.id ? { ...i, consumableType: e.target.value as any } : i);
                              setComp({ ...comp, consumables: updated });
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs"
                          >
                            <option value="gases_solda_purga">Gás Argônio / Purga</option>
                            <option value="varetas_arames">Varetas ER316L / MIG</option>
                            <option value="discos_abrasivos">Discos Corte / Flap</option>
                            <option value="decapantes_passivantes">Decapante / Passivante</option>
                            <option value="outros">Outros</option>
                          </select>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="text"
                            value={cs.unit}
                            onChange={(e) => {
                              const updated = comp.consumables.map((i) => i.id === cs.id ? { ...i, unit: e.target.value } : i);
                              setComp({ ...comp, consumables: updated });
                            }}
                            className="w-12 px-1 py-1 text-center rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={cs.quantity}
                            onChange={(e) => {
                              const q = parseFloat(e.target.value) || 0;
                              const updated = comp.consumables.map((i) => i.id === cs.id ? { ...i, quantity: q, totalCost: roundMoney(q * i.unitCost) } : i);
                              setComp({ ...comp, consumables: updated });
                            }}
                            className="w-16 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={cs.unitCost}
                            onChange={(e) => {
                              const c = parseFloat(e.target.value) || 0;
                              const updated = comp.consumables.map((i) => i.id === cs.id ? { ...i, unitCost: c, totalCost: roundMoney(i.quantity * c) } : i);
                              setComp({ ...comp, consumables: updated });
                            }}
                            className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-teal-300">
                          R$ {cs.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={cs.refaturadoAoCliente}
                            onChange={(e) => {
                              const updated = comp.consumables.map((i) => i.id === cs.id ? { ...i, refaturadoAoCliente: e.target.checked } : i);
                              setComp({ ...comp, consumables: updated });
                            }}
                            className="rounded bg-slate-950 border-slate-800 text-teal-500 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => setComp({ ...comp, consumables: comp.consumables.filter((i) => i.id !== cs.id) })}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Total de Consumíveis Industriais</span>
                  <span className="text-teal-400 font-mono text-sm">
                    Subtotal: R$ {categoryTotals.consumiveis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 9: MAQUINÁRIO */}
          {activeTab === 'maquinario' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-800/40 bg-emerald-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-emerald-300 flex items-center space-x-1.5">
                    <Truck className="w-4 h-4" />
                    <span>Aba 9: Maquinário — Plataformas Articuladas/Tesouras, Munck & Compressores</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Equipamentos pesados próprios e locados, frete de entrega/retirada e combustível operacional.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newMc: MachineryEquipmentItem = {
                      id: `mc_${Date.now()}`,
                      equipmentName: 'Novo Equipamento / Máquina',
                      ownership: 'locado',
                      quantity: 1,
                      periodUnit: 'meses',
                      periodQuantity: 1,
                      rentalRate: 4000,
                      operatingFuelCost: 500,
                      freightDeliveryCost: 1000,
                      maintenanceCost: 0,
                      totalCost: 5500,
                    };
                    setComp({ ...comp, machinery: [...comp.machinery, newMc] });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Máquina</span>
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[200px]">Equipamento</th>
                      <th className="py-2.5 px-2 text-center w-20">Regime</th>
                      <th className="py-2.5 px-3 w-36">Locadora</th>
                      <th className="py-2.5 px-2 text-right w-16">Qtd</th>
                      <th className="py-2.5 px-2 text-right w-24">Locação (R$)</th>
                      <th className="py-2.5 px-2 text-right w-24">Frete (R$)</th>
                      <th className="py-2.5 px-2 text-right w-24">Combustível</th>
                      <th className="py-2.5 px-3 text-right w-28">Total Custo (R$)</th>
                      <th className="py-2.5 px-2 text-center w-14">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {comp.machinery.map((mc) => (
                      <tr key={mc.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={mc.equipmentName}
                            onChange={(e) => {
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, equipmentName: e.target.value } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-medium"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <select
                            value={mc.ownership}
                            onChange={(e) => {
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, ownership: e.target.value as any } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            className="px-1.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs"
                          >
                            <option value="locado">Locado</option>
                            <option value="proprio">Próprio</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={mc.supplierOrLocadora || ''}
                            onChange={(e) => {
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, supplierOrLocadora: e.target.value } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            placeholder="Locadora"
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={mc.quantity}
                            onChange={(e) => {
                              const q = parseInt(e.target.value) || 1;
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, quantity: q, totalCost: roundMoney(q * (i.rentalRate + i.operatingFuelCost + i.freightDeliveryCost)) } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            className="w-14 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={mc.rentalRate}
                            onChange={(e) => {
                              const r = parseFloat(e.target.value) || 0;
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, rentalRate: r, totalCost: roundMoney(i.quantity * (r + i.operatingFuelCost + i.freightDeliveryCost)) } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={mc.freightDeliveryCost}
                            onChange={(e) => {
                              const f = parseFloat(e.target.value) || 0;
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, freightDeliveryCost: f, totalCost: roundMoney(i.quantity * (i.rentalRate + i.operatingFuelCost + f)) } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            value={mc.operatingFuelCost}
                            onChange={(e) => {
                              const c = parseFloat(e.target.value) || 0;
                              const updated = comp.machinery.map((i) => i.id === mc.id ? { ...i, operatingFuelCost: c, totalCost: roundMoney(i.quantity * (i.rentalRate + c + i.freightDeliveryCost)) } : i);
                              setComp({ ...comp, machinery: updated });
                            }}
                            className="w-20 px-1 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-300">
                          R$ {mc.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => setComp({ ...comp, machinery: comp.machinery.filter((i) => i.id !== mc.id) })}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400">Total de Maquinário & Locações</span>
                  <span className="text-emerald-400 font-mono text-sm">
                    Subtotal: R$ {categoryTotals.equipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 10: CANTEIRO DE OBRA */}
          {activeTab === 'canteiro_obra' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-amber-300 flex items-center space-x-1.5">
                    <Building className="w-4 h-4" />
                    <span>Aba 10: Canteiro de Obra — Containers, Sanitários, Instalação Provisória & Caçambas</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Estrutura física de apoio para segurança e guarda de ferramental de alto valor na planta.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newSi: SiteInfrastructureItem = {
                      id: `si_${Date.now()}`,
                      itemType: 'container_almoxarifado',
                      description: 'Nova infraestrutura de canteiro',
                      unit: 'mes',
                      quantity: 1,
                      unitCost: 1800,
                      periodMonths: 1,
                      totalCost: 1800,
                    };
                    setComp({ ...comp, siteInfrastructure: [...comp.siteInfrastructure, newSi] });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Item</span>
                </button>
              </div>

              <div className="space-y-2">
                {comp.siteInfrastructure.map((si) => (
                  <div key={si.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <input
                      type="text"
                      value={si.description}
                      onChange={(e) => {
                        const updated = comp.siteInfrastructure.map((i) => i.id === si.id ? { ...i, description: e.target.value } : i);
                        setComp({ ...comp, siteInfrastructure: updated });
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-medium"
                    />
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 text-[10px]">Custo Mensal:</span>
                      <input
                        type="number"
                        value={si.unitCost}
                        onChange={(e) => {
                          const c = parseFloat(e.target.value) || 0;
                          const updated = comp.siteInfrastructure.map((i) => i.id === si.id ? { ...i, unitCost: c, totalCost: roundMoney(c * (i.periodMonths || 1) * i.quantity) } : i);
                          setComp({ ...comp, siteInfrastructure: updated });
                        }}
                        className="w-24 px-2 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 text-[10px]">Meses:</span>
                      <input
                        type="number"
                        value={si.periodMonths}
                        onChange={(e) => {
                          const m = parseInt(e.target.value) || 1;
                          const updated = comp.siteInfrastructure.map((i) => i.id === si.id ? { ...i, periodMonths: m, totalCost: roundMoney(i.unitCost * m * i.quantity) } : i);
                          setComp({ ...comp, siteInfrastructure: updated });
                        }}
                        className="w-14 px-1.5 py-1 text-center rounded bg-slate-950 border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <span className="w-28 text-right font-mono font-bold text-amber-300">
                      R$ {si.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => setComp({ ...comp, siteInfrastructure: comp.siteInfrastructure.filter((i) => i.id !== si.id) })}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Total Infraestrutura & Canteiro</span>
                <span className="text-amber-400 font-mono text-sm">
                  Subtotal: R$ {categoryTotals.canteiro_infra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* ABA 11: MOB&DESMOB (SOLVES J12/J27 #VALOR!) */}
          {activeTab === 'mob_desmob' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-orange-800/40 bg-orange-950/20 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-orange-300 flex items-center space-x-1.5">
                    <Truck className="w-4 h-4" />
                    <span>Aba 11: Mob&Desmob — Mobilização e Desmobilização de Equipes, Fretes & Exames ASO</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Transporte rodoviário de spools, carretas, exames NR-35/NR-33 e seguro de carga.
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-[11px] text-emerald-300 flex items-center space-x-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Erro #VALOR! das células J12/J27 do Excel eliminado com soma tipada estrita.</span>
                </div>
              </div>

              <div className="space-y-2">
                {comp.mobDesmob.map((md) => (
                  <div key={md.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <input
                      type="text"
                      value={md.description}
                      onChange={(e) => {
                        const updated = comp.mobDesmob.map((i) => i.id === md.id ? { ...i, description: e.target.value } : i);
                        setComp({ ...comp, mobDesmob: updated });
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-medium"
                    />
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 text-[10px]">Qtd:</span>
                      <input
                        type="number"
                        value={md.quantity}
                        onChange={(e) => {
                          const q = parseFloat(e.target.value) || 0;
                          const updated = comp.mobDesmob.map((i) => i.id === md.id ? { ...i, quantity: q, totalCost: roundMoney(q * i.unitCost) } : i);
                          setComp({ ...comp, mobDesmob: updated });
                        }}
                        className="w-14 px-1.5 py-1 text-center rounded bg-slate-950 border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 text-[10px]">Custo Unit.:</span>
                      <input
                        type="number"
                        value={md.unitCost}
                        onChange={(e) => {
                          const c = parseFloat(e.target.value) || 0;
                          const updated = comp.mobDesmob.map((i) => i.id === md.id ? { ...i, unitCost: c, totalCost: roundMoney(i.quantity * c) } : i);
                          setComp({ ...comp, mobDesmob: updated });
                        }}
                        className="w-24 px-2 py-1 text-right rounded bg-slate-950 border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <span className="w-28 text-right font-mono font-bold text-orange-300">
                      R$ {md.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => setComp({ ...comp, mobDesmob: comp.mobDesmob.filter((i) => i.id !== md.id) })}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Total Mobilização & Desmobilização</span>
                <span className="text-orange-400 font-mono text-sm">
                  Subtotal: R$ {categoryTotals.mob_desmob.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* ABA 12: CUSTOS ADMINISTRATIVOS */}
          {activeTab === 'custos_administrativos' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-700 bg-slate-900 flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center space-x-1.5">
                    <HardHat className="w-4 h-4 text-cyan-400" />
                    <span>Aba 12: Custos Administrativos — Engenheiro Residente, Técnico SST & ART/CREA</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Custos indiretos de gestão dedicada em campo e emissão de documentações normativas.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const cd = currentPriceFormation.totalDirectCosts || 842208.85;
                    const matriz = roundMoney(cd * 0.01);
                    const obra = roundMoney(cd * 0.02);
                    const updated = [
                      {
                        id: 'ad_1',
                        roleOrExpense: 'Administração Central / Planejamento Matriz (1%)',
                        expenseType: 'rateio_administracao_central' as const,
                        unit: 'vb',
                        quantity: 1,
                        unitCost: matriz,
                        periodMonths: 1,
                        totalCost: matriz,
                      },
                      {
                        id: 'ad_2',
                        roleOrExpense: 'Gerenciamento e Supervisão Dedicada de Obra (2%)',
                        expenseType: 'equipe_gestao' as const,
                        unit: 'vb',
                        quantity: 1,
                        unitCost: obra,
                        periodMonths: 1,
                        totalCost: obra,
                      },
                    ];
                    setComp({ ...comp, adminCosts: updated });
                    setSyncStatus(`Custos Administrativos calculados: Matriz 1% (R$ ${matriz.toLocaleString('pt-BR')}) e Obra 2% (R$ ${obra.toLocaleString('pt-BR')})!`);
                    setTimeout(() => setSyncStatus(null), 4000);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 text-xs font-semibold cursor-pointer flex items-center space-x-1"
                  title="Calcula e aplica 1% de administração central e 2% de supervisão de obra conforme a planilha modelo"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>⚡ Aplicar 1% Matriz + 2% Obra</span>
                </button>
              </div>

              <div className="space-y-2">
                {comp.adminCosts.map((ad) => (
                  <div key={ad.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <input
                      type="text"
                      value={ad.roleOrExpense}
                      onChange={(e) => {
                        const updated = comp.adminCosts.map((i) => i.id === ad.id ? { ...i, roleOrExpense: e.target.value } : i);
                        setComp({ ...comp, adminCosts: updated });
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-white font-medium"
                    />
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400 text-[10px]">Custo Mensal:</span>
                      <input
                        type="number"
                        value={ad.unitCost}
                        onChange={(e) => {
                          const c = parseFloat(e.target.value) || 0;
                          const updated = comp.adminCosts.map((i) => i.id === ad.id ? { ...i, unitCost: c, totalCost: roundMoney(c * (i.periodMonths || 1) * i.quantity) } : i);
                          setComp({ ...comp, adminCosts: updated });
                        }}
                        className="w-24 px-2 py-1 text-right rounded bg-slate-900 border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <span className="w-28 text-right font-mono font-bold text-cyan-300">
                      R$ {ad.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => setComp({ ...comp, adminCosts: comp.adminCosts.filter((i) => i.id !== ad.id) })}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Total Custos Administrativos de Campo & SST</span>
                <span className="text-cyan-400 font-mono text-sm">
                  Subtotal: R$ {categoryTotals.custos_indiretos_adm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* ABA 13: ANALISE (DRE & BDI RECONCILIATION) */}
          {activeTab === 'analise' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-cyan-800/40 bg-cyan-950/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-cyan-300 flex items-center space-x-1.5">
                    <Percent className="w-4 h-4" />
                    <span>Aba 13: ANALISE — DRE Consolidado, BDI Divisor vs Multiplicador & Ponto de Equilíbrio</span>
                  </h4>
                  <p className="text-xs text-slate-300">
                    Demonstração do Resultado do Exercício (DRE) com conciliação matemática transparente e auditável.
                  </p>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Método de Precificação:</span>
                  <select
                    value={comp.financialSettings.pricingMethod}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, pricingMethod: e.target.value as any }
                    })}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-cyan-300 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="bdi_divisor">Fórmula BDI Divisor TCU (Engenharia Por Dentro)</option>
                    <option value="markup_multiplicador">Markup Multiplicador sobre o Custo</option>
                  </select>
                </div>
              </div>

              {/* DRE Breakdown Card */}
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950 space-y-4 shadow-xl">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Estrutura DRE do Projeto</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    BDI Equivalente Aplicado: {currentPriceFormation.bdiCalculatedPercent}%
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900 font-bold">
                    <span className="text-white">1. RECEITA BRUTA DE VENDA (PREÇO SUGERIDO):</span>
                    <span className="font-mono text-cyan-300 text-sm">
                      R$ {currentPriceFormation.suggestedSellingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (100.00%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 pl-6 text-rose-300">
                    <span>(-) Tributos sobre Faturamento ({comp.taxConfig.totalTaxOnRevenuePercent}%):</span>
                    <span className="font-mono">
                      - R$ {currentPriceFormation.taxesTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900 font-semibold border-l-2 border-cyan-500 pl-4">
                    <span className="text-slate-200">(=) RECEITA OPERACIONAL LÍQUIDA:</span>
                    <span className="font-mono text-white">
                      R$ {roundMoney(currentPriceFormation.suggestedSellingPrice - currentPriceFormation.taxesTotalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 pl-6 text-slate-300">
                    <span>(-) Custos Diretos de Execução (9 Categorias):</span>
                    <span className="font-mono text-amber-300">
                      - R$ {currentPriceFormation.totalDirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900 font-semibold border-l-2 border-emerald-500 pl-4">
                    <span className="text-slate-200">(=) MARGEM DE CONTRIBUIÇÃO BRUTA:</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      R$ {roundMoney(currentPriceFormation.suggestedSellingPrice - currentPriceFormation.totalDirectCosts).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({currentPriceFormation.effectiveGrossMarginPercent}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 pl-6 text-slate-400">
                    <span>(-) Custos Indiretos (SST + Gestão de Canteiro):</span>
                    <span className="font-mono">
                      - R$ {currentPriceFormation.totalIndirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 pl-6 text-slate-400">
                    <span>(-) Provisão de Riscos & Contingência Operacional:</span>
                    <span className="font-mono">
                      - R$ {currentPriceFormation.riskContingencyAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 pl-6 text-slate-400">
                    <span>(-) Custos Financeiros, Capital de Giro & Comissão:</span>
                    <span className="font-mono">
                      - R$ {roundMoney(currentPriceFormation.financialCostAmount + currentPriceFormation.commercialCommissionAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/70 border border-emerald-600 font-bold text-sm">
                    <span className="text-emerald-300">(=) LUCRO LÍQUIDO PROJETADO:</span>
                    <span className="font-mono text-emerald-400 text-base">
                      R$ {currentPriceFormation.netProfitAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({currentPriceFormation.effectiveNetMarginPercent}%)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900 text-slate-400 text-[11px] pt-2 border-t border-slate-800">
                    <span>Ponto de Equilíbrio Operacional (Preço Break-Even sem Lucro):</span>
                    <span className="font-mono font-bold text-white">
                      R$ {currentPriceFormation.breakEvenPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 14: IMPOSTOS */}
          {activeTab === 'impostos' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-red-800/40 bg-red-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-red-300 flex items-center space-x-1.5">
                    <Building className="w-4 h-4" />
                    <span>Aba 14: Impostos — Alíquotas de Faturamento & Gross-up</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Configuração tributária com suporte ao Lucro Presumido, Real e Simples com incidência por dentro.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">PIS (%):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={comp.taxConfig.pisPercent}
                    onChange={(e) => {
                      const pis = parseFloat(e.target.value) || 0;
                      const tot = pis + comp.taxConfig.cofinsPercent + comp.taxConfig.issPercent + comp.taxConfig.icmsPercent + comp.taxConfig.csllIrpjPercent;
                      setComp({ ...comp, taxConfig: { ...comp.taxConfig, pisPercent: pis, totalTaxOnRevenuePercent: roundMoney(tot) } });
                    }}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">COFINS (%):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={comp.taxConfig.cofinsPercent}
                    onChange={(e) => {
                      const cof = parseFloat(e.target.value) || 0;
                      const tot = comp.taxConfig.pisPercent + cof + comp.taxConfig.issPercent + comp.taxConfig.icmsPercent + comp.taxConfig.csllIrpjPercent;
                      setComp({ ...comp, taxConfig: { ...comp.taxConfig, cofinsPercent: cof, totalTaxOnRevenuePercent: roundMoney(tot) } });
                    }}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">ISS Município (%):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={comp.taxConfig.issPercent}
                    onChange={(e) => {
                      const iss = parseFloat(e.target.value) || 0;
                      const tot = comp.taxConfig.pisPercent + comp.taxConfig.cofinsPercent + iss + comp.taxConfig.icmsPercent + comp.taxConfig.csllIrpjPercent;
                      setComp({ ...comp, taxConfig: { ...comp.taxConfig, issPercent: iss, totalTaxOnRevenuePercent: roundMoney(tot) } });
                    }}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">ICMS (%):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={comp.taxConfig.icmsPercent}
                    onChange={(e) => {
                      const icms = parseFloat(e.target.value) || 0;
                      const tot = comp.taxConfig.pisPercent + comp.taxConfig.cofinsPercent + comp.taxConfig.issPercent + icms + comp.taxConfig.csllIrpjPercent;
                      setComp({ ...comp, taxConfig: { ...comp.taxConfig, icmsPercent: icms, totalTaxOnRevenuePercent: roundMoney(tot) } });
                    }}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">CSLL / IRPJ (%):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={comp.taxConfig.csllIrpjPercent}
                    onChange={(e) => {
                      const csll = parseFloat(e.target.value) || 0;
                      const tot = comp.taxConfig.pisPercent + comp.taxConfig.cofinsPercent + comp.taxConfig.issPercent + comp.taxConfig.icmsPercent + csll;
                      setComp({ ...comp, taxConfig: { ...comp.taxConfig, csllIrpjPercent: csll, totalTaxOnRevenuePercent: roundMoney(tot) } });
                    }}
                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Total Tributos:</span>
                  <span className="text-base font-bold text-red-400 font-mono block mt-1">
                    {comp.taxConfig.totalTaxOnRevenuePercent}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 15: CUSTO FINANCEIRO */}
          {activeTab === 'custo_financeiro' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-800/40 bg-emerald-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-emerald-300 flex items-center space-x-1.5">
                    <DollarSign className="w-4 h-4" />
                    <span>Aba 15: Custo Financeiro — Prazos PMR/PMP, Capital de Giro & Carta Fiança</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Ajuste fino de descasamento de caixa entre recebimento de medições e pagamento de fornecedores.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Prazo Médio Recebimento (PMR em Dias):</span>
                  <input
                    type="number"
                    value={comp.financialSettings.paymentTermsDays}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, paymentTermsDays: parseInt(e.target.value) || 30 }
                    })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Prazo Médio Pagamento Fornecedores (PMP em Dias):</span>
                  <input
                    type="number"
                    value={comp.financialSettings.supplierTermsDays}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, supplierTermsDays: parseInt(e.target.value) || 28 }
                    })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Taxa Mensal Capital de Giro (% a.m.):</span>
                  <input
                    type="number"
                    step="0.1"
                    value={comp.financialSettings.monthlyWorkingCapitalRate}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, monthlyWorkingCapitalRate: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Seguro Garantia / Carta Fiança (%):</span>
                  <input
                    type="number"
                    step="0.1"
                    value={comp.financialSettings.bankGuaranteeOrBondPercent}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, bankGuaranteeOrBondPercent: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Rateio Adm Central (% sobre custos):</span>
                  <input
                    type="number"
                    step="0.1"
                    value={comp.financialSettings.centralAdminFeePercent}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, centralAdminFeePercent: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[10px] block">Margem Líquida Alvo (% sobre faturamento):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={comp.financialSettings.targetNetMarginPercent}
                    onChange={(e) => setComp({
                      ...comp,
                      financialSettings: { ...comp.financialSettings, targetNetMarginPercent: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ABA 16: CATEGORIA (DETERMINISTIC CLASSIFICATION) */}
          {activeTab === 'categoria' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-teal-800/40 bg-teal-950/20 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-teal-300 flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Aba 16: Categoria — Matriz Determinística de Risco & Enquadramento</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Avaliação em 5 dimensões sem aproximações, recomendando diretrizes de margem e contingência mínima.
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-[11px] text-emerald-300 flex items-center space-x-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Erro #N/A da célula Categoria!N23 do Excel eliminado permanentemente.</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3 text-xs">
                  <h5 className="font-bold text-white uppercase text-[10px] tracking-wider">Critérios de Avaliação</h5>

                  <div>
                    <label className="text-slate-400 block mb-1">1. Perfil do Cliente:</label>
                    <select
                      value={comp.classificationCriteria.clientType}
                      onChange={(e) => setComp({
                        ...comp,
                        classificationCriteria: { ...comp.classificationCriteria, clientType: e.target.value as any }
                      })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="cliente_estrategico">Cliente Estratégico / Corporativo (20 pts)</option>
                      <option value="cliente_recorrente">Cliente Recorrente / Histórico Positivo (15 pts)</option>
                      <option value="cliente_novo">Cliente Novo / Primeiro Contrato (10 pts)</option>
                      <option value="cliente_risco">Cliente com Histórico de Atrito / Inadimplência (5 pts)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">2. Localidade & Logística:</label>
                    <select
                      value={comp.classificationCriteria.geographicLocation}
                      onChange={(e) => setComp({
                        ...comp,
                        classificationCriteria: { ...comp.classificationCriteria, geographicLocation: e.target.value as any }
                      })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="local_regiao_metropolitana">Local / Região Metropolitana (20 pts)</option>
                      <option value="interior_sp">Interior de SP (16 pts)</option>
                      <option value="outro_estado_sudeste">Outro Estado (Sudeste / Sul) (10 pts)</option>
                      <option value="regiao_remota_norte_nordeste">Área Remota / Norte / Nordeste (5 pts)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">3. Rigor Técnico & Solda:</label>
                    <select
                      value={comp.classificationCriteria.technicalComplexity}
                      onChange={(e) => setComp({
                        ...comp,
                        classificationCriteria: { ...comp.classificationCriteria, technicalComplexity: e.target.value as any }
                      })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="tubulacao_sanitaria_farmaceutica">Tubulação Sanitária Farmacêutica Ra &lt; 0.4 µm (25 pts)</option>
                      <option value="redes_processo_alimentos">Redes de Processo Alimentício / Bebidas (20 pts)</option>
                      <option value="tubulacao_utilidades_vapor">Tubulações de Vapor / Utilidades Aço Carbono (15 pts)</option>
                      <option value="caldeiraria_padrao">Caldeiraria Padrão / Estruturas Metálicas (10 pts)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">4. Regime de Trabalho:</label>
                    <select
                      value={comp.classificationCriteria.executionRegimen}
                      onChange={(e) => setComp({
                        ...comp,
                        classificationCriteria: { ...comp.classificationCriteria, executionRegimen: e.target.value as any }
                      })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="turno_normal_diurno">Turno Normal Diurno (20 pts)</option>
                      <option value="turno_estendido">Turno Estendido com Horas Extras (14 pts)</option>
                      <option value="parada_fabril_24x7">Parada Fabril Contínua 24/7 (8 pts)</option>
                      <option value="espaco_confinado_altura">Trabalho Crítico em Altura / Confinado (6 pts)</option>
                    </select>
                  </div>
                </div>

                {/* Score Result Card */}
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-950 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Pontuação Total Calculada:</span>
                      <span className="font-mono text-2xl font-bold text-teal-400">
                        {currentClassification.totalScore} / 100
                      </span>
                    </div>

                    <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <h4 className="text-sm font-bold text-white">{currentClassification.title}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{currentClassification.description}</p>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <h6 className="font-bold text-slate-400 uppercase text-[10px]">Diretrizes Recomendadas:</h6>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Margem Mínima Sugerida:</span>
                          <span className="font-mono font-bold text-emerald-400">{currentClassification.recommendedMinMarginPercent}%</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Contingência Mínima:</span>
                          <span className="font-mono font-bold text-amber-400">{currentClassification.recommendedContingencyPercent}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-[10px] text-slate-500 block">
                      Enquadramento 100% determinístico sem dependência de tabelas estáticas não ordenadas.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 17: CONTINGÊNCIAS (5X5 RISK MATRIX) */}
          {activeTab === 'contingencias' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-800/40 bg-rose-950/20 flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-rose-300 flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Aba 17: Contingências — Matriz 5x5 de Probabilidade x Impacto & Provisão Financeira</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Identificação de riscos técnicos, operacionais e de suprimentos com planos de mitigação e reserva monetária.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newRk: CostRiskItem = {
                      id: `rk_${Date.now()}`,
                      description: 'Novo risco identificado',
                      rootCause: 'Causa em análise',
                      potentialEffect: 'Possível impacto em prazo ou custo',
                      category: 'escopo_tecnico',
                      probability: 2,
                      impact: 3,
                      score: 6,
                      riskLevel: 'medio',
                      responseStrategy: 'mitigar',
                      actionPlan: 'Monitoramento contínuo em DDS',
                      responsible: 'Supervisor de Obra',
                      mitigationCost: 500,
                      contingencyProvisionPercent: 1.0,
                      contingencyAmount: 1500,
                    };
                    setComp({ ...comp, risks: [...comp.risks, newRk] });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Adicionar Risco</span>
                </button>
              </div>

              <div className="space-y-3">
                {comp.risks.map((rk) => (
                  <div key={rk.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          rk.riskLevel === 'critico' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                          rk.riskLevel === 'alto' ? 'bg-orange-950 text-orange-300 border border-orange-800' :
                          rk.riskLevel === 'medio' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {rk.riskLevel} (Score: {rk.score})
                        </span>
                        <input
                          type="text"
                          value={rk.description}
                          onChange={(e) => {
                            const updated = comp.risks.map((r) => r.id === rk.id ? { ...r, description: e.target.value } : r);
                            setComp({ ...comp, risks: updated });
                          }}
                          className="font-bold text-white text-xs bg-transparent border-none focus:outline-none flex-1"
                        />
                      </div>
                      <button
                        onClick={() => setComp({ ...comp, risks: comp.risks.filter((r) => r.id !== rk.id) })}
                        className="text-slate-500 hover:text-rose-400 transition self-end sm:self-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="text-[10px] text-slate-400 block">Causa Raiz:</label>
                        <input
                          type="text"
                          value={rk.rootCause}
                          onChange={(e) => {
                            const updated = comp.risks.map((r) => r.id === rk.id ? { ...r, rootCause: e.target.value } : r);
                            setComp({ ...comp, risks: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Plano de Mitigação:</label>
                        <input
                          type="text"
                          value={rk.actionPlan}
                          onChange={(e) => {
                            const updated = comp.risks.map((r) => r.id === rk.id ? { ...r, actionPlan: e.target.value } : r);
                            setComp({ ...comp, risks: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Probabilidade (1-5):</label>
                        <select
                          value={rk.probability}
                          onChange={(e) => {
                            const p = parseInt(e.target.value) as any;
                            const updated = comp.risks.map((r) => r.id === rk.id ? {
                              ...r,
                              probability: p,
                              score: p * r.impact,
                              riskLevel: ((p * r.impact) >= 18 ? 'critico' : (p * r.impact) >= 12 ? 'alto' : (p * r.impact) >= 6 ? 'medio' : 'baixo') as 'critico' | 'alto' | 'medio' | 'baixo'
                            } : r);
                            setComp({ ...comp, risks: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                        >
                          <option value={1}>1 - Muito Baixa</option>
                          <option value={2}>2 - Baixa</option>
                          <option value={3}>3 - Média</option>
                          <option value={4}>4 - Alta</option>
                          <option value={5}>5 - Muito Alta</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block">Impacto (1-5):</label>
                        <select
                          value={rk.impact}
                          onChange={(e) => {
                            const imp = parseInt(e.target.value) as any;
                            const updated = comp.risks.map((r) => r.id === rk.id ? {
                              ...r,
                              impact: imp,
                              score: r.probability * imp,
                              riskLevel: ((r.probability * imp) >= 18 ? 'critico' : (r.probability * imp) >= 12 ? 'alto' : (r.probability * imp) >= 6 ? 'medio' : 'baixo') as 'critico' | 'alto' | 'medio' | 'baixo'
                            } : r);
                            setComp({ ...comp, risks: updated });
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200"
                        >
                          <option value={1}>1 - Mínimo</option>
                          <option value={2}>2 - Baixo</option>
                          <option value={3}>3 - Moderado</option>
                          <option value={4}>4 - Alto</option>
                          <option value={5}>5 - Crítico</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400">Responsável: <strong>{rk.responsible}</strong></span>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400">Provisão Contingência:</span>
                        <input
                          type="number"
                          value={rk.contingencyAmount}
                          onChange={(e) => {
                            const ca = parseFloat(e.target.value) || 0;
                            const updated = comp.risks.map((r) => r.id === rk.id ? { ...r, contingencyAmount: ca } : r);
                            setComp({ ...comp, risks: updated });
                          }}
                          className="w-28 px-2 py-0.5 text-right font-mono font-bold text-rose-300 rounded bg-slate-950 border border-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Total Provisão de Riscos / Contingência</span>
                <span className="text-rose-400 font-mono text-sm">
                  Subtotal: R$ {currentPriceFormation.riskContingencyAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* ABA 18: TETRAPAK (AUDITED REFERENCE MODEL) */}
          {activeTab === 'tetrapak' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-800/40 bg-blue-950/20 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-blue-300 flex items-center space-x-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Aba 18: TETRAPAK — Modelo de Referência Reconciliado (R$ 639k Real vs R$ 293k Legado)</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Resolução definitiva da inconsistência de soma da aba original com todos os 6 pacotes de fornecimento estruturados.
                  </p>
                </div>
              </div>

              {/* Explanatory Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/60 space-y-2">
                  <span className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider">Total Real Reconciliado da Obra</span>
                  <span className="text-2xl font-bold text-white font-mono block">
                    R$ {(comp.tetrapakData?.totalComponentsCalculated || 639096.43).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Soma de todos os componentes da montagem: vigas W de pipe rack, tubulações de aço inox 316L, equipe de soldadores ASME IX, comissionamento e despesas de estadia.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Subtotal Legado da Planilha</span>
                  <span className="text-2xl font-bold text-slate-300 font-mono block">
                    R$ {(comp.tetrapakData?.displayedSellingTotal || 293640.00).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Corresponde estritamente ao pacote preliminar de tubulação e fabricação mecânica, agora claramente segregado sem conflitar com o total geral da proposta.
                  </p>
                </div>
              </div>

              {/* Groups Breakdown */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider">Grupos do Modelo Tetra Pak</h5>
                <div className="space-y-2">
                  {(comp.tetrapakData?.groups || []).map((grp) => (
                    <div key={grp.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-white block">{grp.title}</span>
                        <span className="text-slate-500 text-[11px]">{grp.items.length} itens vinculados ao pacote</span>
                      </div>
                      <span className="font-mono font-bold text-cyan-400 text-sm">
                        R$ {grp.subtotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STAGE WORKFLOW PROGRESS & FOOTER NAVIGATION */}
          {navMode === 'fluxo_consolidado' && (
            <div className="p-4 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
              <div>
                {MACRO_STAGES.findIndex((s) => s.id === currentStage.id) > 0 ? (
                  <button
                    onClick={handlePrevStage}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center space-x-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Etapa Anterior: {MACRO_STAGES[MACRO_STAGES.findIndex((s) => s.id === currentStage.id) - 1].shortName}</span>
                  </button>
                ) : (
                  <div className="text-xs text-slate-500 italic">Início do Fluxo Orçamentário</div>
                )}
              </div>

              <div className="text-center">
                <span className="text-xs text-slate-400 block">
                  Etapa <strong className="text-cyan-400">{currentStage.number}</strong> de 5 — <strong className="text-white">{currentStage.name}</strong>
                </span>
                <span className="text-[11px] font-mono text-cyan-300">
                  Subtotal da Etapa: R$ {((stageCosts as any)[currentStage.id] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                {MACRO_STAGES.findIndex((s) => s.id === currentStage.id) < MACRO_STAGES.length - 1 ? (
                  <button
                    onClick={handleNextStage}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition shadow-md shadow-cyan-950/40 cursor-pointer flex items-center space-x-2"
                  >
                    <span>Próxima Etapa: {MACRO_STAGES[MACRO_STAGES.findIndex((s) => s.id === currentStage.id) + 1].shortName}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setViewMode('cliente_comercial')}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition shadow-md shadow-emerald-950/40 cursor-pointer flex items-center space-x-2"
                  >
                    <span>Ver Proposta Comercial do Cliente</span>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
