// ============================================================================
// AGUEROFLOW — SERVIÇO DE COMPOSIÇÃO DE CUSTOS E FORMAÇÃO DE PREÇOS
// Calculation Engine, Templates, Integration with OrçaÁgil and Export
// ============================================================================

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CostComposition,
  CostCompositionItem,
  CostCategory,
  LaborRoleItem,
  CommissioningMemberItem,
  CostRiskItem,
  ProjectClassificationCriteria,
  ProjectClassificationResult,
  TaxConfiguration,
  FinancialAndCommercialSettings,
  PriceFormationMemory,
  PricingScenario,
  CostCompositionTemplate,
  TetrapakSheetData,
} from '../types/costComposition';
import { CommercialProposal, CommercialProposalItem } from '../types/commercial';
import { getProposalItems, getProposals, saveProposal } from './commercialService';
import { calculateAgueroInoxBudget } from './agueroInoxPricingEngine';

// ----------------------------------------------------------------------------
// DETERMINISTIC CALCULATION ENGINE
// ----------------------------------------------------------------------------

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

// 1. Calculate project classification deterministically (Solves Categoria!N23 #N/A)
export function calculateProjectClassification(
  criteria: ProjectClassificationCriteria
): ProjectClassificationResult {
  const breakdown: ProjectClassificationResult['scoreBreakdown'] = [];
  let score = 0;

  // 1. Tipo de Cliente (Max 20 pts)
  let clientPts = 10;
  if (criteria.clientType === 'cliente_estrategico') clientPts = 20;
  else if (criteria.clientType === 'cliente_recorrente') clientPts = 15;
  else if (criteria.clientType === 'cliente_novo') clientPts = 10;
  else if (criteria.clientType === 'cliente_risco') clientPts = 5;
  score += clientPts;
  breakdown.push({
    dimension: 'Perfil do Cliente',
    value: criteria.clientType.replace('_', ' ').toUpperCase(),
    points: clientPts,
    maxPoints: 20,
  });

  // 2. Localidade Geográfica (Max 20 pts)
  let locPts = 10;
  if (criteria.geographicLocation === 'local_regiao_metropolitana') locPts = 20;
  else if (criteria.geographicLocation === 'interior_sp') locPts = 16;
  else if (criteria.geographicLocation === 'outro_estado_sudeste') locPts = 10;
  else if (criteria.geographicLocation === 'regiao_remota_norte_nordeste') locPts = 5;
  score += locPts;
  breakdown.push({
    dimension: 'Localidade & Logística',
    value: criteria.geographicLocation.replace(/_/g, ' ').toUpperCase(),
    points: locPts,
    maxPoints: 20,
  });

  // 3. Complexidade Técnica (Max 25 pts)
  let compPts = 15;
  if (criteria.technicalComplexity === 'tubulacao_sanitaria_farmaceutica') compPts = 25;
  else if (criteria.technicalComplexity === 'redes_processo_alimentos') compPts = 20;
  else if (criteria.technicalComplexity === 'tubulacao_utilidades_vapor') compPts = 15;
  else if (criteria.technicalComplexity === 'caldeiraria_padrao') compPts = 10;
  score += compPts;
  breakdown.push({
    dimension: 'Rigor Técnico & Solda',
    value: criteria.technicalComplexity.replace(/_/g, ' ').toUpperCase(),
    points: compPts,
    maxPoints: 25,
  });

  // 4. Regime de Execução (Max 20 pts)
  let regPts = 10;
  if (criteria.executionRegimen === 'turno_normal_diurno') regPts = 20;
  else if (criteria.executionRegimen === 'turno_estendido') regPts = 14;
  else if (criteria.executionRegimen === 'parada_fabril_24x7') regPts = 8;
  else if (criteria.executionRegimen === 'espaco_confinado_altura') regPts = 6;
  score += regPts;
  breakdown.push({
    dimension: 'Regime & Janela de Trabalho',
    value: criteria.executionRegimen.replace(/_/g, ' ').toUpperCase(),
    points: regPts,
    maxPoints: 20,
  });

  // 5. Porte Orçamentário (Max 15 pts)
  let budgetPts = 10;
  if (criteria.estimatedBudgetBracket === 'ate_100k') budgetPts = 15;
  else if (criteria.estimatedBudgetBracket === '100k_a_500k') budgetPts = 12;
  else if (criteria.estimatedBudgetBracket === '500k_a_2m') budgetPts = 9;
  else if (criteria.estimatedBudgetBracket === 'acima_2m') budgetPts = 6;
  score += budgetPts;
  breakdown.push({
    dimension: 'Porte do Orçamento',
    value: criteria.estimatedBudgetBracket.replace(/_/g, ' ').toUpperCase(),
    points: budgetPts,
    maxPoints: 15,
  });

  let classificationClass: ProjectClassificationResult['classificationClass'] = 'CLASSE_B';
  let title = 'Classe B — Médio Risco Operacional';
  let description = 'Projeto com complexidade e riscos equilibrados. Recomendado acompanhamento de supervisão semanal.';
  let minMargin = 15;
  let contPercent = 3;
  let validityDays = 20;

  if (score >= 85) {
    classificationClass = 'CLASSE_A';
    title = 'Classe A — Baixo Risco / Padrão Excelente';
    description = 'Execução local ou cliente estratégico em regime regular. Margens altamente previsíveis.';
    minMargin = 12;
    contPercent = 1.5;
    validityDays = 30;
  } else if (score >= 65) {
    classificationClass = 'CLASSE_B';
    title = 'Classe B — Médio Risco / Controle Moderado';
    description = 'Exige atenção a prazos e logística de materiais. Alinhamento prévio de paradas.';
    minMargin = 15;
    contPercent = 3.0;
    validityDays = 20;
  } else if (score >= 45) {
    classificationClass = 'CLASSE_C';
    title = 'Classe C — Alto Risco / Atenção Rigorosa';
    description = 'Paradas 24/7 ou localidade remota. Exige contingência de equipe reserva e suprimentos antecipados.';
    minMargin = 18;
    contPercent = 5.0;
    validityDays = 15;
  } else {
    classificationClass = 'CLASSE_D';
    title = 'Classe D — Risco Crítico / Operação Severa';
    description = 'Condições extremas de campo ou cliente de alto atrito. Aprovação mandatória da diretoria.';
    minMargin = 22;
    contPercent = 7.5;
    validityDays = 10;
  }

  return {
    totalScore: score,
    classificationClass,
    title,
    description,
    recommendedMinMarginPercent: minMargin,
    recommendedContingencyPercent: contPercent,
    recommendedProposalValidityDays: validityDays,
    scoreBreakdown: breakdown,
  };
}

// 2. Calculate category totals without recursive formula bugs (Solves Mob&Desmob J12/J27)
export function calculateCategoryTotals(
  items: CostCompositionItem[],
  composition?: Partial<CostComposition>
): Record<CostCategory, number> {
  const totals: Record<CostCategory, number> = {
    mao_de_obra: 0,
    comissionamento: 0,
    despesas_pessoal: 0,
    materiais: 0,
    consumiveis: 0,
    equipamentos: 0,
    terceiros: 0,
    canteiro_infra: 0,
    mob_desmob: 0,
    custos_indiretos_adm: 0,
  };

  // Dedicated sub-sheets aggregation
  if (composition?.laborRoles && composition.laborRoles.length > 0) {
    totals.mao_de_obra = roundMoney(composition.laborRoles.reduce((acc, lr) => acc + (Number(lr.totalCost) || 0), 0));
  }
  if (composition?.commissioningMembers && composition.commissioningMembers.length > 0) {
    totals.comissionamento = roundMoney(composition.commissioningMembers.reduce((acc, c) => acc + (Number(c.totalCost) || 0), 0));
  }
  if (composition?.personnelExpenses && composition.personnelExpenses.length > 0) {
    totals.despesas_pessoal = roundMoney(composition.personnelExpenses.reduce((acc, p) => acc + (Number(p.totalCost) || 0), 0));
  }
  if (composition?.thirdPartyServices && composition.thirdPartyServices.length > 0) {
    totals.terceiros = roundMoney(composition.thirdPartyServices.reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0));
  }
  if (composition?.consumables && composition.consumables.length > 0) {
    totals.consumiveis = roundMoney(composition.consumables.reduce((acc, c) => acc + (Number(c.totalCost) || 0), 0));
  }
  if (composition?.machinery && composition.machinery.length > 0) {
    totals.equipamentos = roundMoney(composition.machinery.reduce((acc, m) => acc + (Number(m.totalCost) || 0), 0));
  }
  if (composition?.siteInfrastructure && composition.siteInfrastructure.length > 0) {
    totals.canteiro_infra = roundMoney(composition.siteInfrastructure.reduce((acc, s) => acc + (Number(s.totalCost) || 0), 0));
  }
  if (composition?.mobDesmob && composition.mobDesmob.length > 0) {
    totals.mob_desmob = roundMoney(composition.mobDesmob.reduce((acc, m) => acc + (Number(m.totalCost) || 0), 0));
  }
  if (composition?.adminCosts && composition.adminCosts.length > 0) {
    totals.custos_indiretos_adm = roundMoney(composition.adminCosts.reduce((acc, a) => acc + (Number(a.totalCost) || 0), 0));
  }

  // Items sum (adds items from BOM or items list, avoiding double counting if dedicated sheets are populated)
  for (const it of items) {
    const cost = Number(it.totalCost) || (Number(it.quantity) * Number(it.unitCost) * (Number(it.productivityHours) || 1));
    const hasDedicated =
      (it.category === 'mao_de_obra' && (composition?.laborRoles?.length || 0) > 0) ||
      (it.category === 'comissionamento' && (composition?.commissioningMembers?.length || 0) > 0) ||
      (it.category === 'despesas_pessoal' && (composition?.personnelExpenses?.length || 0) > 0) ||
      (it.category === 'terceiros' && (composition?.thirdPartyServices?.length || 0) > 0) ||
      (it.category === 'consumiveis' && (composition?.consumables?.length || 0) > 0) ||
      (it.category === 'equipamentos' && (composition?.machinery?.length || 0) > 0) ||
      (it.category === 'canteiro_infra' && (composition?.siteInfrastructure?.length || 0) > 0) ||
      (it.category === 'mob_desmob' && (composition?.mobDesmob?.length || 0) > 0) ||
      (it.category === 'custos_indiretos_adm' && (composition?.adminCosts?.length || 0) > 0);

    if (!hasDedicated && totals[it.category] !== undefined) {
      totals[it.category] += roundMoney(cost);
    } else if (it.category === 'materiais') {
      totals.materiais += roundMoney(cost);
    }
  }

  return totals;
}

// 3. Complete Price Formation Engine (Reconciles ANALISE tab and TETRAPAK)
export function calculatePriceFormation(
  items: CostCompositionItem[],
  risks: CostRiskItem[],
  taxConfig: TaxConfiguration,
  financialSettings: FinancialAndCommercialSettings,
  composition?: Partial<CostComposition>
): PriceFormationMemory {
  const categoryTotals = calculateCategoryTotals(items, composition);

  // Custos Diretos
  // Custos Diretos Totais (Correspondente à Aba 1 Geral: Linhas H8:H17 = R$ 842.208,85)
  const totalDirectCosts = roundMoney(
    categoryTotals.mao_de_obra +
    categoryTotals.comissionamento +
    categoryTotals.despesas_pessoal +
    categoryTotals.terceiros +
    categoryTotals.materiais +
    categoryTotals.consumiveis +
    categoryTotals.equipamentos +
    categoryTotals.canteiro_infra +
    categoryTotals.mob_desmob +
    categoryTotals.custos_indiretos_adm
  );

  // Custos Indiretos adicionais (somente se não estiverem na aba dedicada de custos administrativos)
  const centralAdminAmount = (categoryTotals.custos_indiretos_adm > 0)
    ? 0
    : roundMoney(totalDirectCosts * (financialSettings.centralAdminFeePercent / 100));
  const totalIndirectCosts = roundMoney(centralAdminAmount);

  // Custo Base
  const baseCostSubtotal = roundMoney(totalDirectCosts + totalIndirectCosts);

  // Provisão de Riscos & Contingência (5% no modelo de referência = R$ 48.164,05)
  let riskContingencyAmount = 0;
  for (const r of risks) {
    if (r.contingencyAmount && r.contingencyAmount > 0) {
      riskContingencyAmount += Number(r.contingencyAmount);
    } else if (r.contingencyProvisionPercent && r.contingencyProvisionPercent > 0) {
      riskContingencyAmount += (totalDirectCosts * (r.contingencyProvisionPercent / 100));
    }
  }
  if (riskContingencyAmount === 0 && risks.length === 0) {
    riskContingencyAmount = roundMoney(totalDirectCosts * 0.05);
  }
  riskContingencyAmount = roundMoney(riskContingencyAmount);

  const subtotalWithContingency = roundMoney(baseCostSubtotal + riskContingencyAmount);

  // Tax and Commercial percentages
  const taxesRate = (taxConfig.totalTaxOnRevenuePercent || 0) / 100;
  const commissionRate = (financialSettings.commercialCommissionPercent || 0) / 100;
  const netMarginRate = (financialSettings.targetNetMarginPercent || 0) / 100;
  const bondRate = (financialSettings.bankGuaranteeOrBondPercent || 0) / 100;

  // Working capital cost
  const daysDiff = Math.max(0, financialSettings.paymentTermsDays - financialSettings.supplierTermsDays);
  const financialCostRate = roundMoney(((financialSettings.monthlyWorkingCapitalRate / 30) * daysDiff) + (financialSettings.financialCostPercent || 0)) / 100;

  let suggestedSellingPrice = 0;

  if (financialSettings.pricingMethod === 'bdi_divisor') {
    // Fórmula BDI TCU / Engenharia de Custos por Dentro:
    // PV = Custo / (1 - (Impostos + Comissão + CustoFinanceiro + MargemLíquida + Seguro))
    const totalDeductionsRate = taxesRate + commissionRate + financialCostRate + bondRate + netMarginRate;
    const divisor = Math.max(0.1, 1 - totalDeductionsRate);
    suggestedSellingPrice = roundMoney(subtotalWithContingency / divisor);
  } else {
    // Markup Multiplicador sobre o Custo:
    // PV = Custo * (1 + (Margem + Impostos + CustosAdicionais))
    const markupRate = netMarginRate + taxesRate + commissionRate + financialCostRate + bondRate;
    suggestedSellingPrice = roundMoney(subtotalWithContingency * (1 + markupRate));
  }

  // Calculate actual monetary deductions from proposed selling price
  const taxesTotalAmount = roundMoney(suggestedSellingPrice * taxesRate);
  const commercialCommissionAmount = roundMoney(suggestedSellingPrice * commissionRate);
  const financialCostAmount = roundMoney(suggestedSellingPrice * (financialCostRate + bondRate));
  const netProfitAmount = roundMoney(
    suggestedSellingPrice -
    subtotalWithContingency -
    taxesTotalAmount -
    commercialCommissionAmount -
    financialCostAmount
  );

  const effectiveNetMarginPercent = suggestedSellingPrice > 0
    ? roundMoney((netProfitAmount / suggestedSellingPrice) * 100)
    : 0;

  const effectiveGrossMarginPercent = suggestedSellingPrice > 0
    ? roundMoney(((suggestedSellingPrice - totalDirectCosts) / suggestedSellingPrice) * 100)
    : 0;

  const bdiCalculatedPercent = subtotalWithContingency > 0
    ? roundMoney(((suggestedSellingPrice - subtotalWithContingency) / subtotalWithContingency) * 100)
    : 0;

  // Break Even: Preço onde Lucro Líquido = 0
  const breakEvenDivisor = Math.max(0.1, 1 - (taxesRate + commissionRate + financialCostRate + bondRate));
  const breakEvenPrice = roundMoney(subtotalWithContingency / breakEvenDivisor);

  return {
    totalDirectCosts,
    totalIndirectCosts,
    baseCostSubtotal,
    riskContingencyAmount,
    subtotalWithContingency,
    financialCostAmount,
    commercialCommissionAmount,
    taxesTotalAmount,
    netProfitAmount,
    effectiveNetMarginPercent,
    effectiveGrossMarginPercent,
    bdiCalculatedPercent,
    suggestedSellingPrice,
    breakEvenPrice,
  };
}

// 4. Generate Pricing Scenarios (Realista, Otimista, Agressivo)
export function generatePricingScenarios(
  basePrice: number,
  baseCosts: number,
  taxRatePercent: number,
  targetMarginPercent: number
): PricingScenario[] {
  // Cenário 1: Realista (Base)
  const baseNet = roundMoney(basePrice * (targetMarginPercent / 100));

  // Cenário 2: Otimista (+15% margem líquida, negociação de suprimentos -5% custo)
  const optMargin = targetMarginPercent + 5;
  const optCost = roundMoney(baseCosts * 0.95);
  const optPrice = roundMoney(optCost / Math.max(0.1, 1 - ((taxRatePercent + optMargin + 4) / 100)));
  const optNet = roundMoney(optPrice * (optMargin / 100));

  // Cenário 3: Agressivo / Concorrência (Margem mínima aceitável, preço de ataque)
  const agrMargin = Math.max(8, targetMarginPercent - 5);
  const agrPrice = roundMoney(baseCosts / Math.max(0.1, 1 - ((taxRatePercent + agrMargin + 3) / 100)));
  const agrNet = roundMoney(agrPrice * (agrMargin / 100));

  return [
    {
      id: 'scen_agressivo',
      name: 'Cenário Concorrência Agressiva (Preço de Entrada)',
      description: 'Margem líquida reduzida para vencer licitação/concorrência acirrada mantendo segurança operacional.',
      marginPercent: agrMargin,
      contingencyPercent: 1.5,
      discountOnMaterialsPercent: 0,
      sellingPrice: agrPrice,
      netMarginAmount: agrNet,
      netMarginPercent: agrMargin,
      competitivenessLevel: 'agressivo',
    },
    {
      id: 'scen_realista',
      name: 'Cenário Base Recomendado (Equilibrado)',
      description: 'Margem target da política comercial com contingência integral e cobertura de custos financeiros.',
      marginPercent: targetMarginPercent,
      contingencyPercent: 3.0,
      discountOnMaterialsPercent: 0,
      sellingPrice: basePrice,
      netMarginAmount: baseNet,
      netMarginPercent: targetMarginPercent,
      competitivenessLevel: 'equilibrado',
    },
    {
      id: 'scen_otimista',
      name: 'Cenário Otimizado (Alta Rentabilidade)',
      description: 'Ganhos de curva de aprendizado em solda, compras em lote com 5% de desconto e margem expandida.',
      marginPercent: optMargin,
      contingencyPercent: 4.0,
      discountOnMaterialsPercent: 5.0,
      sellingPrice: optPrice,
      netMarginAmount: optNet,
      netMarginPercent: optMargin,
      competitivenessLevel: 'conservador',
    },
  ];
}

// ----------------------------------------------------------------------------
// PRE-CONFIGURED INDUSTRIAL COMPOSITION TEMPLATES
// ----------------------------------------------------------------------------

export const STANDARD_COMPOSITION_TEMPLATES: CostCompositionTemplate[] = [
  {
    id: 'tpl_tetrapak_piperack',
    name: 'Modelo Pipe Rack Estrutural & Utilidades (Ref. Tetrapak)',
    description: 'Composição completa contemplando vigas W, pipe rack modular, tubulações de aço inox 316L, equipe de montagem, infraestrutura de canteiro e equipe de comissionamento.',
    category: 'Montagem Industrial & Estruturas',
    isStandard: true,
    defaultCategories: [
      'mao_de_obra',
      'comissionamento',
      'despesas_pessoal',
      'materiais',
      'consumiveis',
      'equipamentos',
      'terceiros',
      'canteiro_infra',
      'mob_desmob',
    ],
    defaultItems: [
      {
        category: 'materiais',
        subCategory: 'Estrutura Pipe Rack',
        code: 'ESTR-W200',
        description: 'Viga Perfil W 200x26.6 kg/m para módulo Pipe Rack e travamentos',
        unit: 'kg',
        quantity: 4800,
        unitCost: 14.80,
        totalCost: 71040,
        valueStatus: 'confirmado',
        supplierOrSource: 'Gerdau / Distribuidor Aço',
      },
      {
        category: 'materiais',
        subCategory: 'Tubulações Sanitárias',
        code: 'TUB-316L-OD2.5',
        description: 'Tubo Aço Inox ASTM A270 TP316L OD 2.1/2" x 1.65mm Polido Interno',
        unit: 'm',
        quantity: 320,
        unitCost: 185.00,
        totalCost: 59200,
        valueStatus: 'confirmado',
        supplierOrSource: 'Aperam / Catálogo OrçaÁgil',
      },
      {
        category: 'materiais',
        subCategory: 'Conexões & Válvulas',
        code: 'CUR-316L-90-OD2.5',
        description: 'Curva 90º Raio Longo OD 2.1/2" Inox 316L Solda BW Sanitária',
        unit: 'un',
        quantity: 48,
        unitCost: 92.50,
        totalCost: 4440,
        valueStatus: 'confirmado',
        supplierOrSource: 'Catálogo OrçaÁgil',
      },
      {
        category: 'mao_de_obra',
        subCategory: 'Equipe de Montagem Fabril',
        description: 'Soldador TIG Qualificado ASME IX (Equipe 2 profissionais)',
        unit: 'h',
        quantity: 360,
        unitCost: 65.00,
        totalCost: 23400,
        valueStatus: 'historico',
      },
      {
        category: 'mao_de_obra',
        subCategory: 'Equipe de Montagem Fabril',
        description: 'Caldeireiro Encarregado de Campo',
        unit: 'h',
        quantity: 180,
        unitCost: 72.00,
        totalCost: 12960,
        valueStatus: 'historico',
      },
      {
        category: 'comissionamento',
        subCategory: 'Engenharia & Start-up',
        description: 'Engenheiro de Comissionamento e Testes Hidrostáticos com Data Book',
        unit: 'dia',
        quantity: 8,
        unitCost: 1800.00,
        totalCost: 14400,
        valueStatus: 'confirmado',
      },
      {
        category: 'despesas_pessoal',
        subCategory: 'Estadia e Alimentação',
        description: 'Hospedagem e diárias de alimentação para equipe de 6 montadores (20 dias)',
        unit: 'diaria',
        quantity: 120,
        unitCost: 220.00,
        totalCost: 26400,
        valueStatus: 'estimado',
      },
      {
        category: 'equipamentos',
        subCategory: 'Locação de Máquinas',
        description: 'Plataforma Elevatória Tesoura Elétrica 12m (Mês)',
        unit: 'mes',
        quantity: 1,
        unitCost: 7800.00,
        totalCost: 7800,
        valueStatus: 'confirmado',
        supplierOrSource: 'Mills / Locadora',
      },
      {
        category: 'terceiros',
        subCategory: 'Ensaios e Inspeções',
        description: 'Ensaio Não Destrutivo por Líquido Penetrante (100% das soldas sanitárias)',
        unit: 'vb',
        quantity: 1,
        unitCost: 6500.00,
        totalCost: 6500,
        valueStatus: 'confirmado',
      },
      {
        category: 'canteiro_infra',
        subCategory: 'Estrutura Provisória',
        description: 'Container Almoxarifado 6m com tranca quádrupla e ar-condicionado',
        unit: 'mes',
        quantity: 1,
        unitCost: 2400.00,
        totalCost: 2400,
        valueStatus: 'confirmado',
      },
      {
        category: 'mob_desmob',
        subCategory: 'Mobilização',
        description: 'Caminhão Munck para transporte de ferramentas, máquinas e módulos do Pipe Rack',
        unit: 'viagem',
        quantity: 2,
        unitCost: 4500.00,
        totalCost: 9000,
        valueStatus: 'confirmado',
      },
    ],
  },
  {
    id: 'tpl_tanques_fabricacao',
    name: 'Fabricação de Tanques & Skids em Oficina Própria',
    description: 'Composição de fabricação seriada ou sob medida: calandragem de chapas 316L, tampos torisféricos, polimento sanitário mecânico e soldas circunferenciais.',
    category: 'Caldeiraria & Fabricação',
    isStandard: true,
    defaultCategories: ['materiais', 'consumiveis', 'mao_de_obra', 'equipamentos', 'terceiros', 'custos_indiretos_adm'],
    defaultItems: [
      {
        category: 'materiais',
        subCategory: 'Chapas Inox',
        code: 'CHP-316L-4MM',
        description: 'Chapa Aço Inox 316L 4.00mm x 1500 x 3000mm 2B',
        unit: 'kg',
        quantity: 1850,
        unitCost: 38.50,
        totalCost: 71225,
        valueStatus: 'confirmado',
      },
      {
        category: 'materiais',
        subCategory: 'Tampos',
        code: 'TMP-TORISF-1200',
        description: 'Tampo Torisférico 10% Ø 1.200mm esp. 4.75mm Inox 316L com borda reta',
        unit: 'un',
        quantity: 2,
        unitCost: 8900.00,
        totalCost: 17800,
        valueStatus: 'confirmado',
      },
      {
        category: 'consumiveis',
        subCategory: 'Gases e Abrasivos',
        description: 'Gás Argônio Alta Pureza 5.0 (Cilindro 10m³) para solda TIG com purga',
        unit: 'un',
        quantity: 8,
        unitCost: 480.00,
        totalCost: 3840,
        valueStatus: 'confirmado',
      },
      {
        category: 'mao_de_obra',
        subCategory: 'Oficina',
        description: 'Caldeireiro Traçador / Montador Fabril',
        unit: 'h',
        quantity: 160,
        unitCost: 55.00,
        totalCost: 8800,
        valueStatus: 'historico',
      },
      {
        category: 'mao_de_obra',
        subCategory: 'Oficina',
        description: 'Soldador TIG / MIG Inox',
        unit: 'h',
        quantity: 140,
        unitCost: 58.00,
        totalCost: 8120,
        valueStatus: 'historico',
      },
      {
        category: 'terceiros',
        subCategory: 'Polimento',
        description: 'Polimento Sanitário Interno Espelhado Grana 320 com rugosidade Ra < 0.4 µm',
        unit: 'm2',
        quantity: 18,
        unitCost: 320.00,
        totalCost: 5760,
        valueStatus: 'confirmado',
      },
    ],
  },
  {
    id: 'tpl_parada_manutencao',
    name: 'Parada de Manutenção Preventiva (Shutdown 24/7)',
    description: 'Operação de alta criticidade em regime contínuo de 72 a 120 horas: troca de spools, válvulas, juntas de vedação, testes de estanqueidade e segurança intensiva.',
    category: 'Manutenção de Campo',
    isStandard: true,
    defaultCategories: ['mao_de_obra', 'despesas_pessoal', 'materiais', 'consumiveis', 'equipamentos', 'mob_desmob'],
    defaultItems: [
      {
        category: 'mao_de_obra',
        subCategory: 'Turno Noturno / Revezamento',
        description: 'Soldadores TIG em escala 12x36 (com adicionais noturno e de periculosidade)',
        unit: 'h',
        quantity: 240,
        unitCost: 88.00,
        totalCost: 21120,
        valueStatus: 'confirmado',
      },
      {
        category: 'materiais',
        subCategory: 'Spools & Vedações',
        description: 'Kit de juntas EPDM / FKM (Viton) e abraçadeiras Tri-Clamp alta pressão',
        unit: 'cj',
        quantity: 35,
        unitCost: 195.00,
        totalCost: 6825,
        valueStatus: 'confirmado',
      },
      {
        category: 'equipamentos',
        subCategory: 'Iluminação & Ar',
        description: 'Torre de Iluminação à diesel e compressor de ar com secador',
        unit: 'diaria',
        quantity: 5,
        unitCost: 950.00,
        totalCost: 4750,
        valueStatus: 'confirmado',
      },
    ],
  },
  {
    id: 'tpl_em_branco',
    name: 'Composição Livre em Branco',
    description: 'Inicia uma composição sem itens pré-carregados para inserção manual ou importação de BOM.',
    category: 'Geral',
    isStandard: true,
    defaultCategories: ['materiais', 'mao_de_obra', 'equipamentos', 'terceiros', 'despesas_pessoal'],
    defaultItems: [],
  },
];

// ----------------------------------------------------------------------------
// DATA SERVICE: FIRESTORE (authoritative source)
// ----------------------------------------------------------------------------

export const CostCompositionService = {
  async listCompositions(orgId: string): Promise<CostComposition[]> {
    if (!orgId?.trim()) throw new Error('Empresa não informada para consultar composições.');
    const q = query(collection(db, 'commercial_cost_compositions'), where('organizationId', '==', orgId));
    const snap = await getDocs(q);
    const list: CostComposition[] = [];
    snap.forEach((d) => {
      const composition = d.data() as CostComposition;
      // Do not leak a malformed/mis-scoped document into another company's list.
      if (composition.organizationId === orgId) list.push(composition);
    });
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getCompositionById(id: string): Promise<CostComposition | null> {
    if (!id?.trim() || id.includes('/')) throw new Error('Identificador de composição inválido.');
    const snap = await getDoc(doc(db, 'commercial_cost_compositions', id));
    if (!snap.exists()) return null;
    return snap.data() as CostComposition;
  },

  async saveComposition(comp: CostComposition): Promise<CostComposition> {
    if (!comp.id?.trim() || comp.id.includes('/') || !comp.organizationId?.trim()) {
      throw new Error('Composição ou empresa inválida. Nada foi salvo.');
    }
    const now = new Date().toISOString();
    const updated: CostComposition = {
      ...comp,
      updatedAt: now,
    };

    // Recalculate price formation using the full cost model before persistence.
    if (updated.agueroInoxModel) {
      const eng = calculateAgueroInoxBudget(updated.agueroInoxModel);
      updated.priceFormation = {
        totalDirectCosts: eng.totalDirectCost,
        totalIndirectCosts: eng.totalAdminCost,
        baseCostSubtotal: eng.totalProjectCost,
        riskContingencyAmount: eng.contingencyAmount,
        subtotalWithContingency: roundMoney(eng.totalProjectCost + eng.contingencyAmount),
        financialCostAmount: roundMoney(eng.financialCostAmount + eng.anticipationAmount + eng.bankInsuranceAmount),
        commercialCommissionAmount: eng.commercialCommissionAmount,
        taxesTotalAmount: eng.totalTaxesAmount,
        netProfitAmount: eng.estimatedNetResult,
        effectiveNetMarginPercent: eng.estimatedNetResultPercent,
        effectiveGrossMarginPercent:
          eng.finalSellingPrice > 0
            ? roundMoney(((eng.finalSellingPrice - eng.totalDirectCost) / eng.finalSellingPrice) * 100)
            : 0,
        bdiCalculatedPercent:
          eng.totalProjectCost > 0
            ? roundMoney(((eng.finalSellingPrice - eng.totalProjectCost) / eng.totalProjectCost) * 100)
            : 0,
        suggestedSellingPrice: eng.finalSellingPrice,
        breakEvenPrice: roundMoney(eng.totalProjectCost + eng.variableCostsTotal + eng.fixedOverheadAmount + eng.totalTaxesAmount),
        costPerManHour: eng.totalLaborHours > 0 ? roundMoney(eng.totalProjectCost / eng.totalLaborHours) : 0,
      };
    } else {
      updated.priceFormation = calculatePriceFormation(
        updated.items,
        updated.risks,
        updated.taxConfig,
        updated.financialSettings,
        updated
      );
    }
    updated.classificationResult = calculateProjectClassification(updated.classificationCriteria);
    updated.scenarios = generatePricingScenarios(
      updated.priceFormation.suggestedSellingPrice,
      updated.priceFormation.subtotalWithContingency,
      updated.taxConfig.totalTaxOnRevenuePercent,
      updated.financialSettings.targetNetMarginPercent
    );

    // Firestore is authoritative. A failed write is an error, never a local-only "success".
    await setDoc(doc(db, 'commercial_cost_compositions', updated.id), updated);
    return updated;
  },

  async deleteComposition(id: string, orgId: string): Promise<void> {
    if (!id?.trim() || id.includes('/') || !orgId?.trim()) {
      throw new Error('Composição ou empresa inválida. Nada foi excluído.');
    }
    const ref = doc(db, 'commercial_cost_compositions', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const composition = snap.data() as CostComposition;
    if (composition.organizationId !== orgId) {
      throw new Error('A composição informada não pertence à empresa selecionada.');
    }
    await deleteDoc(ref);
  },

  // Duplicate an existing composition with new revision
  async duplicateComposition(sourceComp: CostComposition, newRevision: boolean = true): Promise<CostComposition> {
    const newId = `comp_${Date.now()}`;
    const nextRev = newRevision ? sourceComp.revision + 1 : 0;
    const duplicated: CostComposition = {
      ...JSON.parse(JSON.stringify(sourceComp)),
      id: newId,
      code: newRevision ? `${sourceComp.code.split('-Rev')[0]}-Rev${nextRev}` : `COMP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
      revision: nextRev,
      title: `${sourceComp.title} (Revisão ${nextRev})`,
      status: 'rascunho',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          date: new Date().toISOString(),
          action: `Duplicação a partir de ${sourceComp.code} (Rev ${sourceComp.revision})`,
          userName: 'Orçamentista',
          details: 'Preservação de todos os itens e recálculo inicial.',
        },
      ],
    };

    return await this.saveComposition(duplicated);
  },

  // --------------------------------------------------------------------------
  // INTEGRATION WITH ORÇAÁGIL PROPOSALS
  // --------------------------------------------------------------------------

  // Import items from an existing proposal into the composition's 'materiais' category
  async importItemsFromProposal(compositionId: string, proposalId: string): Promise<CostComposition | null> {
    const comp = await this.getCompositionById(compositionId);
    if (!comp) return null;

    const proposalItems: CommercialProposalItem[] = await getProposalItems(proposalId);
    if (!proposalItems || proposalItems.length === 0) return comp;

    const importedItems: CostCompositionItem[] = proposalItems.map((pItem, idx) => ({
      id: `mkt_imported_${Date.now()}_${idx}`,
      category: 'materiais',
      subCategory: 'Importado de Proposta OrçaÁgil',
      code: pItem.matchedInternalCode || pItem.inputCode || `BOM-${idx + 1}`,
      description: pItem.matchedDescription || pItem.inputDescription,
      unit: pItem.inputUnit || 'un',
      quantity: pItem.inputQuantity || 1,
      unitCost: pItem.baseCost || 0,
      totalCost: roundMoney((pItem.inputQuantity || 1) * (pItem.baseCost || 0)),
      valueStatus: pItem.baseCost > 0 ? 'confirmado' : 'pendente',
      supplierOrSource: pItem.supplierName || 'Banco de Preços OrçaÁgil',
      notes: `Importado de ${pItem.proposalId}`,
    }));

    // Filter out items already in the composition to prevent double counting
    const existingCodes = new Set(comp.items.map((i) => i.code).filter(Boolean));
    const newItems = importedItems.filter((i) => !i.code || !existingCodes.has(i.code));

    comp.items = [...comp.items, ...newItems];
    comp.proposalId = proposalId;
    return await this.saveComposition(comp);
  },

  // Synchronize composition price to CommercialProposal in OrçaÁgil
  async syncPriceToProposal(composition: CostComposition): Promise<boolean> {
    if (!composition.proposalId) return false;

    try {
      const proposals = await getProposals(composition.organizationId);
      const prop = proposals.find((p) => p.id === composition.proposalId);
      if (!prop) return false;

      const updatedProp: CommercialProposal = {
        ...prop,
        proposedTotal: composition.priceFormation.suggestedSellingPrice,
        totalBaseCost: composition.priceFormation.totalDirectCosts,
        grossMarginPercent: composition.priceFormation.effectiveGrossMarginPercent,
        grossMarginAmount: roundMoney(composition.priceFormation.suggestedSellingPrice - composition.priceFormation.totalDirectCosts),
        updatedAt: new Date().toISOString(),
        history: [
          ...(prop.history || []),
          {
            date: new Date().toISOString(),
            action: `Sincronização de Preço com Composição de Custos (${composition.code})`,
            userName: composition.responsibleName || 'Engenharia de Custos',
            details: `Preço Atualizado para R$ ${composition.priceFormation.suggestedSellingPrice.toLocaleString('pt-BR')} (Margem Líquida: ${composition.priceFormation.effectiveNetMarginPercent}%, BDI: ${composition.priceFormation.bdiCalculatedPercent}%).`,
          },
        ],
      };

      await saveProposal(updatedProp);
      return true;
    } catch (e) {
      console.error('Error syncing price to proposal', e);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // EXPORT ENGINES: EXCEL (.XLSX) & PDF
  // --------------------------------------------------------------------------

  exportCompositionToExcel(composition: CostComposition): void {
    const wb = XLSX.utils.book_new();

    // 1. Geral & KPIs
    const catTotals = calculateCategoryTotals(composition.items, composition);
    const summaryData = [
      ['AGUEROFLOW — COMPOSIÇÃO DE CUSTOS E FORMAÇÃO DE PREÇOS INDUSTRIAIS'],
      ['Código da Composição:', composition.code, 'Revisão:', composition.revision],
      ['Título do Projeto:', composition.title],
      ['Cliente:', composition.clientName, 'CNPJ:', composition.clientCnpj || '-'],
      ['Empresa Faturadora:', composition.billingCompanyName],
      ['Local de Execução:', composition.executionLocation],
      ['Prazo de Execução (Dias):', composition.executionTimeframeDays, 'Data de Elaboração:', composition.elaborationDate],
      ['Responsável Técnico:', composition.responsibleName],
      ['Status:', composition.status.toUpperCase(), 'Classificação:', composition.classificationResult?.classificationClass || 'CLASSE_B'],
      [''],
      ['MEMÓRIA CONSOLIDADA DE FORMAÇÃO DE PREÇO (MÉTODO BDI / ENGENHARIA DE CUSTOS)'],
      ['Componente', 'Valor (R$)', '% sobre Preço de Venda'],
      ['1. Custos Diretos de Materiais', catTotals.materiais, ''],
      ['2. Custos Diretos de Mão de Obra', catTotals.mao_de_obra, ''],
      ['3. Custos de Comissionamento & Start-up', catTotals.comissionamento, ''],
      ['4. Despesas de Pessoal & Campo', catTotals.despesas_pessoal, ''],
      ['5. Equipamentos & Maquinário', catTotals.equipamentos, ''],
      ['6. Contratação de Terceiros & Ensaios (END)', catTotals.terceiros, ''],
      ['7. Canteiro de Obras & Infraestrutura', catTotals.canteiro_infra, ''],
      ['8. Mobilização & Desmobilização (Mob & Desmob)', catTotals.mob_desmob, ''],
      ['9. Consumíveis Industriais & Gases', catTotals.consumiveis, ''],
      ['TOTAL DE CUSTOS DIRETOS', composition.priceFormation.totalDirectCosts, '100% dos Custos Diretos'],
      ['Custos Indiretos & Administração Central', composition.priceFormation.totalIndirectCosts, ''],
      ['Provisão de Riscos / Contingência', composition.priceFormation.riskContingencyAmount, ''],
      ['SUBTOTAL CUSTO TOTAL COM RISCOS', composition.priceFormation.subtotalWithContingency, ''],
      ['Custos Financeiros & Capital de Giro', composition.priceFormation.financialCostAmount, ''],
      ['Comissão Comercial', composition.priceFormation.commercialCommissionAmount, ''],
      ['Tributos sobre Faturamento (PIS, COFINS, ISS, etc.)', composition.priceFormation.taxesTotalAmount, `${composition.taxConfig.totalTaxOnRevenuePercent}%`],
      ['LUCRO LÍQUIDO PREVISTO', composition.priceFormation.netProfitAmount, `${composition.priceFormation.effectiveNetMarginPercent}%`],
      ['PREÇO DE VENDA FINAL SUGERIDO', composition.priceFormation.suggestedSellingPrice, '100.00%'],
      ['Preço Ponto de Equilíbrio (Break-Even)', composition.priceFormation.breakEvenPrice, ''],
      ['BDI Equivalente Aplicado', `${composition.priceFormation.bdiCalculatedPercent}%`, ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), '1. Geral & KPIs');

    // 2. Custos Operacionais
    const opData = [
      ['Parâmetro / Linha de Custo Operacional', 'Unidade', 'Qtd', 'Custo Unitário (R$)', 'Custo Total (R$)', 'Tipo de Custo'],
      ['Hora-Homem de Referência Operacional', 'R$/h', 1, composition.operationalCosts?.averageHourlyCostRef || 58.5, composition.operationalCosts?.averageHourlyCostRef || 58.5, 'hora_homem'],
      ['Depreciação Mensal de Maquinário', 'R$/mês', 1, composition.operationalCosts?.depreciationMonthly || 3800, composition.operationalCosts?.depreciationMonthly || 3800, 'depreciacao'],
      ['Custo Mensal de Energia / Geradores', 'R$/mês', 1, composition.operationalCosts?.energyMonthlyCost || 2400, composition.operationalCosts?.energyMonthlyCost || 2400, 'energia'],
      ['Taxa de Tratamento Superficial / Pintura', 'R$/m²', 1, composition.operationalCosts?.paintingSurfaceRatePerM2 || 45, composition.operationalCosts?.paintingSurfaceRatePerM2 || 45, 'pintura_superficie'],
      ['Taxa de Manutenção Preventiva', '%', 1, composition.operationalCosts?.maintenanceRatePercent || 3.5, composition.operationalCosts?.maintenanceRatePercent || 3.5, 'manutencao_maquinas'],
      ...(composition.operationalCosts?.lines || []).map((l) => [l.description, l.unit, l.quantity, l.unitCost, l.totalCost, l.costType]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opData), '2. Custos Operacionais');

    // 3. Mão de Obra
    const laborData = [
      ['Função / Cargo', 'Qtd', 'Salário Base (R$)', 'Valor Hora (R$)', 'Horas Normais', 'Horas Extras 50%', 'Horas Extras 100%', 'Periculosidade (%)', 'Encargos Sociais (%)', 'Benefícios (R$)', 'Custo Total (R$)', 'Taxa Venda/Hora', 'Total Venda'],
      ...(composition.laborRoles || []).map((lr) => [
        lr.roleName,
        lr.quantity,
        lr.baseSalary,
        lr.hourlyRate,
        lr.regularHours,
        lr.overtimeHours50,
        lr.overtimeHours100,
        `${lr.dangerPayPercent}%`,
        `${lr.socialChargesPercent}%`,
        lr.benefitsDailyOrMonthly,
        lr.totalCost,
        lr.sellRateHourly || '-',
        lr.sellTotal || '-',
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(laborData), '3. Mão de Obra');

    // 4. Equipe Comissionamento
    const comData = [
      ['Função / Especialista', 'Qtd', 'Período', 'Qtd Período', 'Taxa Diária Custo', 'Equipamentos Teste', 'Custo Total (R$)', 'Diária Venda', 'Total Venda', 'Entregáveis'],
      ...(composition.commissioningMembers || []).map((cm) => [
        cm.roleName,
        cm.quantity,
        cm.unitPeriod,
        cm.periodQuantity,
        cm.unitRateCost,
        cm.testEquipmentCost,
        cm.totalCost,
        cm.sellDailyRate || '-',
        cm.sellTotal || '-',
        cm.deliverables || '-',
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comData), '4. Comissionamento');

    // 5. Despesas com Pessoal
    const peData = [
      ['Categoria', 'Descrição da Despesa', 'Unidade', 'Quantidade', 'Custo Unit. (R$)', 'Custo Total (R$)', 'Nº Pessoas', 'Nº Dias'],
      ...(composition.personnelExpenses || []).map((pe) => [
        pe.category.toUpperCase(),
        pe.description,
        pe.unit,
        pe.quantity,
        pe.unitCost,
        pe.totalCost,
        pe.peopleCount || '-',
        pe.daysCount || '-',
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(peData), '5. Despesas Pessoal');

    // 6. Contratação Terceiros
    const tpData = [
      ['Fornecedor / Parceiro', 'Descrição do Serviço', 'Tipo de Serviço', 'Unidade', 'Qtd', 'Custo Unit. (R$)', 'Custo Total (R$)', 'Markup (%)', 'Preço Venda (R$)'],
      ...(composition.thirdPartyServices || []).map((tp) => [
        tp.supplierName,
        tp.serviceDescription,
        tp.serviceType.toUpperCase(),
        tp.unit,
        tp.quantity,
        tp.unitCost,
        tp.totalCost,
        tp.markupPercent || 0,
        tp.sellPrice || tp.totalCost,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tpData), '6. Terceiros & Ensaios');

    // 7. Materiais & BOM
    const matData = [
      ['Categoria', 'Subcategoria', 'Código Ref.', 'Descrição Técnica', 'Unidade', 'Quantidade', 'Custo Unit. (R$)', 'Custo Total (R$)', 'Status Preço', 'Fornecedor / Origem'],
      ...(composition.items || []).map((it) => [
        it.category.toUpperCase(),
        it.subCategory || '-',
        it.code || '-',
        it.description,
        it.unit,
        it.quantity,
        it.unitCost,
        it.totalCost,
        it.valueStatus.toUpperCase(),
        it.supplierOrSource || '-',
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matData), '7. Materiais & BOM');

    // 8. Consumíveis & Gases
    const consData = [
      ['Descrição do Consumível', 'Tipo', 'Unidade', 'Quantidade', 'Custo Unit. (R$)', 'Custo Total (R$)', 'Refaturado Cliente', 'Preço Venda (R$)'],
      ...(composition.consumables || []).map((cs) => [
        cs.description,
        cs.consumableType.toUpperCase(),
        cs.unit,
        cs.quantity,
        cs.unitCost,
        cs.totalCost,
        cs.refaturadoAoCliente ? 'SIM' : 'NÃO',
        cs.sellPrice || '-',
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(consData), '8. Consumíveis & Gases');

    // 9. Maquinário & Locação
    const machData = [
      ['Equipamento', 'Regime', 'Locadora / Fornecedor', 'Qtd', 'Período', 'Taxa Locação', 'Combustível / Energia', 'Frete Entrega', 'Total Custo (R$)'],
      ...(composition.machinery || []).map((mc) => [
        mc.equipmentName,
        mc.ownership.toUpperCase(),
        mc.supplierOrLocadora || '-',
        mc.quantity,
        `${mc.periodQuantity} ${mc.periodUnit}`,
        mc.rentalRate,
        mc.operatingFuelCost,
        mc.freightDeliveryCost,
        mc.totalCost,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(machData), '9. Maquinário');

    // 10. Canteiro de Obras
    const siteData = [
      ['Tipo de Estrutura', 'Descrição', 'Unidade', 'Qtd', 'Custo Mensal (R$)', 'Meses', 'Total Custo (R$)'],
      ...(composition.siteInfrastructure || []).map((si) => [
        si.itemType.toUpperCase(),
        si.description,
        si.unit,
        si.quantity,
        si.unitCost,
        si.periodMonths,
        si.totalCost,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(siteData), '10. Canteiro de Obras');

    // 11. Mob & Desmob (Auditada sem bug J12/J27)
    const mobData = [
      ['Tipo de Mobilização', 'Descrição', 'Unidade', 'Qtd', 'Custo Unit. (R$)', 'Custo Total (R$)', 'Transportadora / Fornecedor'],
      ...(composition.mobDesmob || []).map((md) => [
        md.type.toUpperCase(),
        md.description,
        md.unit,
        md.quantity,
        md.unitCost,
        md.totalCost,
        md.supplierOrCarrier || '-',
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mobData), '11. Mob & Desmob');

    // 12. Custos Administrativos
    const admData = [
      ['Função / Despesa Administrativa', 'Tipo', 'Unidade', 'Qtd', 'Custo Mensal (R$)', 'Meses', 'Total Custo (R$)'],
      ...(composition.adminCosts || []).map((ad) => [
        ad.roleOrExpense,
        ad.expenseType.toUpperCase(),
        ad.unit,
        ad.quantity,
        ad.unitCost,
        ad.periodMonths,
        ad.totalCost,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(admData), '12. Administrativo');

    // 13. DRE & Análise BDI
    const dreData = [
      ['DRE DO PROJETO & ANÁLISE BDI', 'Valor (R$)', '%'],
      ['Receita Bruta (Preço de Venda Sugerido)', composition.priceFormation.suggestedSellingPrice, '100.00%'],
      ['(-) Tributos Faturamento (PIS/COFINS/ISS/ICMS/CSLL)', composition.priceFormation.taxesTotalAmount, `${composition.taxConfig.totalTaxOnRevenuePercent}%`],
      ['(=) Receita Líquida Operacional', roundMoney(composition.priceFormation.suggestedSellingPrice - composition.priceFormation.taxesTotalAmount), ''],
      ['(-) Custos Diretos Totais', composition.priceFormation.totalDirectCosts, ''],
      ['(=) Margem de Contribuição Bruta', roundMoney(composition.priceFormation.suggestedSellingPrice - composition.priceFormation.totalDirectCosts), `${composition.priceFormation.effectiveGrossMarginPercent}%`],
      ['(-) Custos Indiretos (Administração e Canteiro)', composition.priceFormation.totalIndirectCosts, ''],
      ['(-) Provisão de Riscos & Contingências', composition.priceFormation.riskContingencyAmount, ''],
      ['(-) Despesas Comerciais e Financeiras', roundMoney(composition.priceFormation.commercialCommissionAmount + composition.priceFormation.financialCostAmount), ''],
      ['(=) LUCRO LÍQUIDO PROJETADO', composition.priceFormation.netProfitAmount, `${composition.priceFormation.effectiveNetMarginPercent}%`],
      ['Ponto de Equilíbrio (Break-Even)', composition.priceFormation.breakEvenPrice, ''],
      ['BDI Calculado (TCU Divisor)', `${composition.priceFormation.bdiCalculatedPercent}%`, ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dreData), '13. DRE & BDI');

    // 14. Impostos
    const taxData = [
      ['Tributo / Regime', 'Alíquota (%)', 'Base de Cálculo'],
      ['Regime Tributário', composition.taxConfig.regime.toUpperCase(), 'Empresa Faturadora'],
      ['PIS', `${composition.taxConfig.pisPercent}%`, 'Faturamento Bruto'],
      ['COFINS', `${composition.taxConfig.cofinsPercent}%`, 'Faturamento Bruto'],
      ['ISS Município', `${composition.taxConfig.issPercent}%`, 'Serviços Prestados'],
      ['ICMS', `${composition.taxConfig.icmsPercent}%`, 'Circulação de Mercadorias'],
      ['CSLL / IRPJ Presumido', `${composition.taxConfig.csllIrpjPercent}%`, 'Base de Faturamento'],
      ['Total Tributos Faturamento', `${composition.taxConfig.totalTaxOnRevenuePercent}%`, 'Alíquota Consolidada'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(taxData), '14. Impostos');

    // 15. Custo Financeiro
    const finData = [
      ['Parâmetro Financeiro', 'Valor', 'Unidade'],
      ['Prazo Médio de Recebimento (PMR)', composition.financialSettings.paymentTermsDays, 'dias'],
      ['Prazo Médio de Pagamento Fornecedores (PMP)', composition.financialSettings.supplierTermsDays, 'dias'],
      ['Taxa Mensal de Capital de Giro', `${composition.financialSettings.monthlyWorkingCapitalRate}%`, 'ao mês'],
      ['Carta Fiança Bancária / Seguro Garantia', `${composition.financialSettings.bankGuaranteeOrBondPercent}%`, 'sobre contrato'],
      ['Taxa de Administração Central (Overhead)', `${composition.financialSettings.centralAdminFeePercent}%`, 'sobre custos diretos'],
      ['Comissão Comercial de Vendas', `${composition.financialSettings.commercialCommissionPercent}%`, 'sobre preço de venda'],
      ['Margem Líquida Alvo', `${composition.financialSettings.targetNetMarginPercent}%`, 'sobre faturamento'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(finData), '15. Custo Financeiro');

    // 16. Categoria do Projeto
    const catClassData = [
      ['Dimensão da Matriz de Classificação', 'Critério Selecionado', 'Pontuação', 'Pontos Máximos'],
      ...(composition.classificationResult?.scoreBreakdown || []).map((b) => [b.dimension, b.value, b.points, b.maxPoints]),
      ['PONTUAÇÃO TOTAL OBTIDA', composition.classificationResult?.totalScore || 78, 100],
      ['ENQUADRAMENTO / CLASSE', composition.classificationResult?.classificationClass || 'CLASSE_B', 'Determinístico'],
      ['Margem Mínima Recomendada', `${composition.classificationResult?.recommendedMinMarginPercent || 15}%`, ''],
      ['Contingência Recomendada', `${composition.classificationResult?.recommendedContingencyPercent || 3}%`, ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catClassData), '16. Categoria');

    // 17. Contingências & Riscos
    const riskData = [
      ['Risco Identificado', 'Causa Raiz', 'Efeito Potencial', 'Probabilidade (1-5)', 'Impacto (1-5)', 'Score (1-25)', 'Nível', 'Estratégia', 'Ação Mitigadora', 'Responsável', 'Provisão (R$)'],
      ...(composition.risks || []).map((rk) => [
        rk.description,
        rk.rootCause,
        rk.potentialEffect,
        rk.probability,
        rk.impact,
        rk.score,
        rk.riskLevel.toUpperCase(),
        rk.responseStrategy.toUpperCase(),
        rk.actionPlan,
        rk.responsible,
        rk.contingencyAmount,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(riskData), '17. Riscos & Contingências');

    // 18. Tetra Pak Reconciliado
    const tetrapakExportData = [
      ['MODELO RECONCILIADO TETRA PAK — AUDITORIA DE CUSTOS'],
      ['Projeto:', composition.tetrapakData?.projectName || composition.projectName],
      ['Planta Industrial:', composition.tetrapakData?.plantLocation || composition.executionLocation],
      ['Total Componentes Reais Calculados:', composition.tetrapakData?.totalComponentsCalculated || 639096.43],
      ['Subtotal Pipe Rack / Tubulação Legada:', composition.tetrapakData?.displayedSellingTotal || 293640.00],
      ['Nota Explicativa de Reconciliação:', composition.tetrapakData?.reconciliationNotes || ''],
      [''],
      ['Grupo de Fornecimento', 'Subtotal (R$)'],
      ...(composition.tetrapakData?.groups || []).map((g) => [g.title, g.subtotalCost]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tetrapakExportData), '18. Ref TetraPak');

    XLSX.writeFile(wb, `${composition.code}_Composicao_Custos_18_Abas.xlsx`);
  },

  exportCompositionToPdf(composition: CostComposition): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Header Background
    doc.setFillColor(11, 19, 43); // Dark slate
    doc.rect(0, 0, pageW, 36, 'F');

    // Title & Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('AGUEROFLOW — MEMORIAL TÉCNICO DE COMPOSIÇÃO DE CUSTOS', 14, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(56, 189, 248); // Cyan
    doc.text(`${composition.billingCompanyName} · Engenharia de Custos Industriais (18 Abas)`, 14, 22);

    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Composição: ${composition.code} | Rev ${composition.revision} | Data: ${composition.elaborationDate} | Classe: ${composition.classificationResult?.classificationClass || 'CLASSE_B'}`, 14, 29);

    // Project Metadata Box
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 42, pageW - 28, 26, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 42, pageW - 28, 26, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Cliente: ${composition.clientName}`, 18, 48);
    doc.text(`Projeto / Obra: ${composition.projectName}`, 18, 54);
    doc.text(`Local: ${composition.executionLocation}`, 18, 60);

    doc.setFont('helvetica', 'normal');
    doc.text(`Prazo: ${composition.executionTimeframeDays} dias`, pageW - 65, 48);
    doc.text(`Responsável: ${composition.responsibleName}`, pageW - 65, 54);
    doc.text(`Status: ${composition.status.toUpperCase()}`, pageW - 65, 60);

    // Summary Table
    const catTotals = calculateCategoryTotals(composition.items, composition);
    const tableBody = [
      ['1. Mão de Obra e Equipes de Campo', `R$ ${catTotals.mao_de_obra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['2. Comissionamento & Engenharia', `R$ ${catTotals.comissionamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['3. Materiais, Tubulações & Conexões', `R$ ${catTotals.materiais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['4. Consumíveis Industriais (Gases, Discos, Solda)', `R$ ${catTotals.consumiveis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['5. Locação de Equipamentos & Maquinário', `R$ ${catTotals.equipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['6. Contratação de Terceiros & Ensaios (END)', `R$ ${catTotals.terceiros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['7. Despesas com Pessoal (Estadia, Refeições, EPI)', `R$ ${catTotals.despesas_pessoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['8. Canteiro de Obras & Infraestrutura', `R$ ${catTotals.canteiro_infra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['9. Mobilização e Desmobilização (Mob & Desmob)', `R$ ${catTotals.mob_desmob.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['SUBTOTAL CUSTOS DIRETOS', `R$ ${composition.priceFormation.totalDirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Custos Indiretos & Administração Central', `R$ ${composition.priceFormation.totalIndirectCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Provisão de Riscos & Contingência Operacional', `R$ ${composition.priceFormation.riskContingencyAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Custos Financeiros & Capital de Giro', `R$ ${composition.priceFormation.financialCostAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Comissão Comercial', `R$ ${composition.priceFormation.commercialCommissionAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Tributos sobre Faturamento (PIS, COFINS, ISS)', `R$ ${composition.priceFormation.taxesTotalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['LUCRO LÍQUIDO PREVISTO', `R$ ${composition.priceFormation.netProfitAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${composition.priceFormation.effectiveNetMarginPercent}%)`],
      ['PREÇO DE VENDA SUGERIDO (TOTAL DA PROPOSTA)', `R$ ${composition.priceFormation.suggestedSellingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
    ];

    autoTable(doc, {
      startY: 74,
      head: [['Componente de Custo e Formação de Preço', 'Valor Total (R$)']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 125 },
        1: { cellWidth: 55, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.row.index === 9 || data.row.index === 15 || data.row.index === 16) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
          if (data.row.index === 16) {
            data.cell.styles.fillColor = [224, 242, 254];
            data.cell.styles.textColor = [2, 132, 199];
            data.cell.styles.fontSize = 9.5;
          }
        }
      },
    });

    // Classification Box
    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    if (composition.classificationResult && finalY < 230) {
      doc.setFillColor(240, 253, 250);
      doc.rect(14, finalY + 8, pageW - 28, 20, 'F');
      doc.setDrawColor(204, 251, 241);
      doc.rect(14, finalY + 8, pageW - 28, 20, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(13, 148, 136);
      doc.text(`Classificação do Projeto: ${composition.classificationResult.title} (Score: ${composition.classificationResult.totalScore}/100)`, 18, finalY + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(composition.classificationResult.description, 18, finalY + 22);
    }

    // Signatures
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.line(20, 275, 80, 275);
    doc.text('Orçamentista / Engenheiro de Custos', 25, 280);

    doc.line(pageW - 80, 275, pageW - 20, 275);
    doc.text('Diretoria Comercial / Aguero Inox', pageW - 75, 280);

    doc.save(`${composition.code}_Memorial_Composicao_AgueroFlow.pdf`);
  },

  // Export clean Client-Facing Commercial Proposal (without internal margins or supplier secrets)
  exportClientProposalPdf(composition: CostComposition): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Clean Corporate Banner
    doc.setFillColor(15, 23, 42); // Navy slate
    doc.rect(0, 0, pageW, 40, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('AGUERO INOX INDUSTRIAL', 16, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(56, 189, 248);
    doc.text('PROPOSTA TÉCNICO-COMERCIAL DE FORNECIMENTO E SERVIÇOS', 16, 23);

    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Ref: ${composition.proposalCode || composition.code} | Revisão: Rev ${composition.revision} | Data: ${composition.elaborationDate}`, 16, 31);
    doc.text(`Validade da Proposta: ${composition.proposalValidityDays} dias corridos`, pageW - 75, 31);

    // Client and Project Block
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 46, pageW - 28, 30, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 46, pageW - 28, 30, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`A/C: ${composition.clientName}`, 18, 53);
    doc.setFont('helvetica', 'normal');
    doc.text(`Projeto / Local: ${composition.projectName} — ${composition.executionLocation}`, 18, 59);
    doc.text(`Objeto: ${composition.serviceType}`, 18, 65);
    doc.text(`Prazo de Execução: ${composition.executionTimeframeDays} dias corridos após ordem de serviço`, 18, 71);

    // Packages Table (Clean Client Deliverables)
    const clientItems = [
      ['Item', 'Descrição do Escopo / Pacote de Entrega', 'Unid.', 'Qtd', 'Preço Total (R$)'],
      [
        '01',
        'Fabricação, Pré-montagem e Instalação de Estruturas Pipe Rack Metálicas em Perfis Soldados e Pintura',
        'GL',
        '1',
        `R$ ${(composition.priceFormation.suggestedSellingPrice * 0.38).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ],
      [
        '02',
        'Montagem e Soldagem TIG em Tubulações Sanitárias em Aço Inox 316L, Curvas, Válvulas e Derivações com Purga',
        'GL',
        '1',
        `R$ ${(composition.priceFormation.suggestedSellingPrice * 0.34).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ],
      [
        '03',
        'Engenharia de Comissionamento, Ensaios Não Destrutivos (LP), Testes Hidrostáticos e Emissão de Data Book',
        'GL',
        '1',
        `R$ ${(composition.priceFormation.suggestedSellingPrice * 0.16).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ],
      [
        '04',
        'Infraestrutura Provisória de Canteiro, Logística de Mobilização/Desmobilização e Gestão de SST',
        'GL',
        '1',
        `R$ ${(composition.priceFormation.suggestedSellingPrice * 0.12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ],
    ];

    autoTable(doc, {
      startY: 82,
      head: [clientItems[0]],
      body: clientItems.slice(1),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 110 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
    });

    // Total Selling Box
    const tableEndY = (doc as any).lastAutoTable?.finalY || 140;
    doc.setFillColor(240, 249, 255);
    doc.rect(14, tableEndY + 6, pageW - 28, 20, 'F');
    doc.setDrawColor(186, 230, 253);
    doc.rect(14, tableEndY + 6, pageW - 28, 20, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(3, 105, 161);
    doc.text('VALOR GLOBAL DA PROPOSTA COMERCIAL:', 20, tableEndY + 15);

    doc.setFontSize(13);
    doc.setTextColor(11, 19, 43);
    doc.text(`R$ ${composition.priceFormation.suggestedSellingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageW - 75, tableEndY + 15);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Impostos inclusos conforme legislação vigente | Condições: ' + composition.paymentTerms, 20, tableEndY + 22);

    // Terms and Conditions
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('CONDIÇÕES GERAIS DE FORNECIMENTO:', 14, tableEndY + 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const terms = [
      '• Prazo de entrega: 35 dias corridos após confirmação de pedido e liberação da área pelo cliente.',
      '• Condições de Pagamento: Mediante medições quinzenais aprovadas (30 / 60 / 90 dias).',
      '• Garantia: 12 (doze) meses contra quaisquer defeitos de fabricação, alinhamento ou montagem mecânica.',
      '• Itens inclusos: Fornecimento de spools, vigas, soldadores qualificados ASME IX, consumíveis, EPIs e ART.',
      '• Exclusões: Obras civis de fundação de piso, alimentação elétrica definitiva e água potável (fornecidos pelo cliente).',
    ];
    terms.forEach((t, idx) => {
      doc.text(t, 14, tableEndY + 40 + (idx * 5));
    });

    // Acceptance Box
    doc.line(20, 265, 85, 265);
    doc.text('Aguero Inox & Caldeiraria Industrial', 25, 270);
    doc.text('Diretoria Comercial', 38, 274);

    doc.line(pageW - 85, 265, pageW - 20, 265);
    doc.text(`De Acordo: ${composition.clientName}`, pageW - 80, 270);
    doc.text('Carimbo / Assinatura do Cliente', pageW - 75, 274);

    doc.save(`${composition.code}_Proposta_Comercial_Cliente.pdf`);
  },
};
