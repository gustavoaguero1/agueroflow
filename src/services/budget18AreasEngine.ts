// ============================================================================
// AGUEROFLOW — CAMADA DE SERVIÇO DAS 18 ÁREAS DO ORÇAMENTO (SERVICE LAYER)
// Complete Industrial Cost Engineering Engine — Real-time Dependencies & Validations
// ============================================================================

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
  ProjectClassificationResult,
  TaxConfiguration,
  FinancialAndCommercialSettings,
  PriceFormationMemory,
  PricingScenario,
  OperationalCostsSheet,
  TetrapakSheetData,
  SheetTabId,
} from '../types/costComposition';

// ----------------------------------------------------------------------------
// INTERFACES DE RETORNO ESPECÍFICAS DE CADA ÁREA
// ----------------------------------------------------------------------------

export interface AreaTotalSummary {
  sheetTabId: SheetTabId;
  title: string;
  costTotal: number;
  sellTotal?: number;
  marginPercent?: number;
  itemsCount: number;
}

export interface GeralReconciliationRow {
  index: number;
  itemCode: string;
  itemDescription: string;
  costAmount: number;
  costPercent: number;
  sellAmount: number;
  sellPercent: number;
  grossMarginAmount: number;
  grossMarginPercent: number;
}

export interface GeralPriceBreakdown {
  materiaisAmount: number;
  materiaisPercent: number;
  servicosAmount: number;
  servicosPercent: number;
  despesasAmount: number;
  despesasPercent: number;
  lucroLiquidoAmount: number;
  lucroLiquidoPercent: number;
  totalSellingPrice: number;
}

export interface ValidationIssue {
  sheetTabId: SheetTabId;
  field?: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  recommendation?: string;
}

export interface ValidationSummary {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: ValidationIssue[];
  issuesByTab: Record<SheetTabId, ValidationIssue[]>;
}

export interface RecalculationResult {
  updatedComposition: CostComposition;
  areaSummaries: Record<SheetTabId, AreaTotalSummary>;
  reconciliationTable: GeralReconciliationRow[];
  priceBreakdown: GeralPriceBreakdown;
  validations: ValidationSummary;
  crossTabAlerts: string[];
}

// ----------------------------------------------------------------------------
// MÉTODOS MATEMÁTICOS DE PRECISÃO
// ----------------------------------------------------------------------------

export function roundMoney(val: number): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

export function roundPercent(val: number): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

// ============================================================================
// SERVICE LAYER: BUDGET 18 AREAS ENGINE
// ============================================================================

export const Budget18AreasEngine = {
  // --------------------------------------------------------------------------
  // 1. ABA 1: GERAL (RECONCILIAÇÃO 15 LINHAS E PRICE BREAKDOWN)
  // --------------------------------------------------------------------------
  calculateGeralTotals(comp: CostComposition): {
    reconciliationTable: GeralReconciliationRow[];
    priceBreakdown: GeralPriceBreakdown;
    directCostTotal: number;
    sellingPriceTotal: number;
    taxesTotal: number;
    sellWithoutTaxes: number;
  } {
    const pf = comp.priceFormation;
    const catTotals = comp.priceFormation.totalDirectCosts;

    // Subtotais de Custo e Venda por Linha (Conforme Geral!A7:K26)
    const moCost = roundMoney((comp.laborRoles || []).reduce((acc, r) => acc + (Number(r.totalCost) || 0), 0));
    const moSell = roundMoney((comp.laborRoles || []).reduce((acc, r) => acc + (Number(r.sellTotal) || (r.sellRateHourly ? r.sellRateHourly * ((r.regularHours || 0) + (r.overtimeHours50 || 0)) : r.totalCost * 1.35)), 0));

    const comCost = roundMoney((comp.commissioningMembers || []).reduce((acc, c) => acc + (Number(c.totalCost) || 0), 0));
    const comSell = roundMoney((comp.commissioningMembers || []).reduce((acc, c) => acc + (Number(c.sellTotal) || (c.sellDailyRate ? c.sellDailyRate * (c.periodQuantity || 0) : c.totalCost * 1.4)), 0));

    const despCost = roundMoney((comp.personnelExpenses || []).reduce((acc, p) => acc + (Number(p.totalCost) || 0), 0));
    const despSell = despCost; // Despesas sem markup adicional

    const tercCost = roundMoney((comp.thirdPartyServices || []).reduce((acc, t) => acc + (Number(t.totalCost) || 0), 0));
    const tercSell = roundMoney((comp.thirdPartyServices || []).reduce((acc, t) => acc + (Number(t.sellPrice) || t.totalCost), 0));

    const matCost = roundMoney((comp.items || []).filter((i) => i.category === 'materiais').reduce((acc, i) => acc + (Number(i.totalCost) || (Number(i.quantity) * Number(i.unitCost))), 0));
    const matSell = roundMoney(matCost * (1 + ((comp.financialSettings?.targetNetMarginPercent || 15) / 100)));

    const consCost = roundMoney((comp.consumables || []).reduce((acc, c) => acc + (Number(c.totalCost) || 0), 0));
    const consSell = roundMoney((comp.consumables || []).reduce((acc, c) => acc + (Number(c.sellPrice) || c.totalCost * 1.15), 0));

    const maqCost = roundMoney((comp.machinery || []).reduce((acc, m) => acc + (Number(m.totalCost) || 0), 0));
    const maqSell = maqCost;

    const cantCost = roundMoney((comp.siteInfrastructure || []).reduce((acc, s) => acc + (Number(s.totalCost) || 0), 0));
    const cantSell = cantCost;

    const mobCost = roundMoney((comp.mobDesmob || []).reduce((acc, m) => acc + (Number(m.totalCost) || 0), 0));
    const mobSell = mobCost;

    const admCost = roundMoney((comp.adminCosts || []).reduce((acc, a) => acc + (Number(a.totalCost) || 0), 0));
    const admSell = admCost;

    const contCost = pf.riskContingencyAmount || 0;
    const contSell = contCost;

    const descCost = 0;
    const descSell = 0;

    const comissaoCost = 0;
    const comissaoSell = pf.commercialCommissionAmount || 0;

    const finCost = 0;
    const finSell = pf.financialCostAmount || 0;

    const antecipacaoSell = 0;

    const directSum = roundMoney(moCost + comCost + despCost + tercCost + matCost + consCost + maqCost + cantCost + mobCost + admCost);
    const totalSellingPrice = pf.suggestedSellingPrice || roundMoney(moSell + comSell + despSell + tercSell + matSell + consSell + maqSell + cantSell + mobSell + admSell + contSell + comissaoSell + finSell + pf.taxesTotalAmount);
    const taxesTotal = pf.taxesTotalAmount || roundMoney(totalSellingPrice * ((comp.taxConfig?.totalTaxOnRevenuePercent || 11.53) / 100));
    const sellWithoutTaxes = roundMoney(totalSellingPrice - taxesTotal);

    const rows: GeralReconciliationRow[] = [
      {
        index: 1,
        itemCode: 'MO-01',
        itemDescription: 'Mão de Obra de Montagem e Caldeiraria',
        costAmount: moCost,
        costPercent: directSum > 0 ? roundPercent((moCost / directSum) * 100) : 0,
        sellAmount: moSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((moSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: roundMoney(moSell - moCost),
        grossMarginPercent: moSell > 0 ? roundPercent(((moSell - moCost) / moSell) * 100) : 0,
      },
      {
        index: 2,
        itemCode: 'COM-02',
        itemDescription: 'Comissionamento, Start-Up e Testes',
        costAmount: comCost,
        costPercent: directSum > 0 ? roundPercent((comCost / directSum) * 100) : 0,
        sellAmount: comSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((comSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: roundMoney(comSell - comCost),
        grossMarginPercent: comSell > 0 ? roundPercent(((comSell - comCost) / comSell) * 100) : 0,
      },
      {
        index: 3,
        itemCode: 'DESP-03',
        itemDescription: 'Despesas com Pessoal (Hotel, Refeições, Vans)',
        costAmount: despCost,
        costPercent: directSum > 0 ? roundPercent((despCost / directSum) * 100) : 0,
        sellAmount: despSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((despSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 4,
        itemCode: 'TERC-04',
        itemDescription: 'Contratação de Terceiros e Ensaios END',
        costAmount: tercCost,
        costPercent: directSum > 0 ? roundPercent((tercCost / directSum) * 100) : 0,
        sellAmount: tercSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((tercSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: roundMoney(tercSell - tercCost),
        grossMarginPercent: tercSell > 0 ? roundPercent(((tercSell - tercCost) / tercSell) * 100) : 0,
      },
      {
        index: 5,
        itemCode: 'MAT-05',
        itemDescription: 'Materiais Tubulares, Conexões e Válvulas',
        costAmount: matCost,
        costPercent: directSum > 0 ? roundPercent((matCost / directSum) * 100) : 0,
        sellAmount: matSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((matSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: roundMoney(matSell - matCost),
        grossMarginPercent: matSell > 0 ? roundPercent(((matSell - matCost) / matSell) * 100) : 0,
      },
      {
        index: 6,
        itemCode: 'CONS-06',
        itemDescription: 'Consumíveis de Soldagem e Montagem',
        costAmount: consCost,
        costPercent: directSum > 0 ? roundPercent((consCost / directSum) * 100) : 0,
        sellAmount: consSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((consSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: roundMoney(consSell - consCost),
        grossMarginPercent: consSell > 0 ? roundPercent(((consSell - consCost) / consSell) * 100) : 0,
      },
      {
        index: 7,
        itemCode: 'MAQ-07',
        itemDescription: 'Maquinário e Locação de Equipamentos',
        costAmount: maqCost,
        costPercent: directSum > 0 ? roundPercent((maqCost / directSum) * 100) : 0,
        sellAmount: maqSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((maqSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 8,
        itemCode: 'CANT-08',
        itemDescription: 'Canteiro de Obras, Containers e ART',
        costAmount: cantCost,
        costPercent: directSum > 0 ? roundPercent((cantCost / directSum) * 100) : 0,
        sellAmount: cantSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((cantSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 9,
        itemCode: 'MOB-09',
        itemDescription: 'Mobilização e Desmobilização de Equipes',
        costAmount: mobCost,
        costPercent: directSum > 0 ? roundPercent((mobCost / directSum) * 100) : 0,
        sellAmount: mobSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((mobSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 10,
        itemCode: 'ADM-10',
        itemDescription: 'Custos Administrativos, Matriz e Gestão',
        costAmount: admCost,
        costPercent: directSum > 0 ? roundPercent((admCost / directSum) * 100) : 0,
        sellAmount: admSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((admSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 11,
        itemCode: 'CONT-11',
        itemDescription: 'Contingências Técnicas e Reserva de Risco',
        costAmount: contCost,
        costPercent: 0,
        sellAmount: contSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((contSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: contSell,
        grossMarginPercent: 100,
      },
      {
        index: 12,
        itemCode: 'DESC-12',
        itemDescription: 'Desconto Comercial Aplicado',
        costAmount: descCost,
        costPercent: 0,
        sellAmount: descSell,
        sellPercent: 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 13,
        itemCode: 'COM-13',
        itemDescription: 'Comissão de Vendas e Representação',
        costAmount: comissaoCost,
        costPercent: 0,
        sellAmount: comissaoSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((comissaoSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 14,
        itemCode: 'FIN-14',
        itemDescription: 'Custo Financeiro e Capital de Giro',
        costAmount: finCost,
        costPercent: 0,
        sellAmount: finSell,
        sellPercent: totalSellingPrice > 0 ? roundPercent((finSell / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
      {
        index: 15,
        itemCode: 'IMP-15',
        itemDescription: 'Tributos e Impostos sobre Faturamento',
        costAmount: 0,
        costPercent: 0,
        sellAmount: taxesTotal,
        sellPercent: totalSellingPrice > 0 ? roundPercent((taxesTotal / totalSellingPrice) * 100) : 0,
        grossMarginAmount: 0,
        grossMarginPercent: 0,
      },
    ];

    // Price Breakdown (Geral!A29:Q31: Materiais 32.13%, Serviços 67.54%, Despesas 0.30%, Lucro Líquido 10%)
    const materiaisAmount = roundMoney(matSell + consSell);
    const materiaisPercent = totalSellingPrice > 0 ? roundPercent((materiaisAmount / totalSellingPrice) * 100) : 0;

    const servicosAmount = roundMoney(moSell + comSell + tercSell + maqSell + cantSell + mobSell + admSell + contSell + comissaoSell + finSell + taxesTotal - materiaisAmount);
    const servicosPercent = totalSellingPrice > 0 ? roundPercent((servicosAmount / totalSellingPrice) * 100) : 0;

    const despesasAmount = roundMoney(despSell * 0.028); // Componente direto de deslocamento
    const despesasPercent = totalSellingPrice > 0 ? roundPercent((despesasAmount / totalSellingPrice) * 100) : 0;

    const lucroLiquidoAmount = pf.netProfitAmount || roundMoney(totalSellingPrice * 0.10);
    const lucroLiquidoPercent = totalSellingPrice > 0 ? roundPercent((lucroLiquidoAmount / totalSellingPrice) * 100) : 10;

    return {
      reconciliationTable: rows,
      priceBreakdown: {
        materiaisAmount,
        materiaisPercent,
        servicosAmount,
        servicosPercent,
        despesasAmount,
        despesasPercent,
        lucroLiquidoAmount,
        lucroLiquidoPercent,
        totalSellingPrice,
      },
      directCostTotal: directSum,
      sellingPriceTotal: totalSellingPrice,
      taxesTotal,
      sellWithoutTaxes,
    };
  },

  // --------------------------------------------------------------------------
  // 2. ABA 2: CUSTOS OPERACIONAIS FABRIS
  // --------------------------------------------------------------------------
  calculateOperationalCostsTotals(operationalCosts?: OperationalCostsSheet): {
    subtotal: number;
    linesCount: number;
    hourlyCostRef: number;
    depreciationMonthly: number;
    energyMonthlyCost: number;
  } {
    if (!operationalCosts) {
      return { subtotal: 0, linesCount: 0, hourlyCostRef: 41.21, depreciationMonthly: 2175, energyMonthlyCost: 1230 };
    }
    const subtotal = roundMoney(
      (operationalCosts.lines || []).reduce((acc, line) => acc + (Number(line.totalCost) || Number(line.quantity) * Number(line.unitCost)), 0)
    );
    return {
      subtotal,
      linesCount: operationalCosts.lines?.length || 0,
      hourlyCostRef: operationalCosts.averageHourlyCostRef || 41.21,
      depreciationMonthly: operationalCosts.depreciationMonthly || 2175,
      energyMonthlyCost: operationalCosts.energyMonthlyCost || 1230,
    };
  },

  // --------------------------------------------------------------------------
  // 3. ABA 3: MÃO DE OBRA
  // --------------------------------------------------------------------------
  calculateLaborTotals(laborRoles: LaborRoleItem[]): {
    totalPeople: number;
    totalRegularHours: number;
    totalOvertime50Hours: number;
    totalOvertime100Hours: number;
    totalCost: number;
    totalSell: number;
    averageCostPerHour: number;
    averageSellPerHour: number;
    grossMarginPercent: number;
  } {
    let totalPeople = 0;
    let totalRegularHours = 0;
    let totalOvertime50Hours = 0;
    let totalOvertime100Hours = 0;
    let totalCost = 0;
    let totalSell = 0;

    for (const role of laborRoles) {
      const qty = Number(role.quantity) || 1;
      totalPeople += qty;
      totalRegularHours += (Number(role.regularHours) || 0) * qty;
      totalOvertime50Hours += (Number(role.overtimeHours50) || 0) * qty;
      totalOvertime100Hours += (Number(role.overtimeHours100) || 0) * qty;

      const cost = Number(role.totalCost) || 0;
      totalCost += cost;

      const sell = Number(role.sellTotal) || (role.sellRateHourly ? role.sellRateHourly * ((Number(role.regularHours) || 0) + (Number(role.overtimeHours50) || 0)) * qty : cost * 1.35);
      totalSell += sell;
    }

    const allHours = totalRegularHours + totalOvertime50Hours + totalOvertime100Hours;
    const averageCostPerHour = allHours > 0 ? roundMoney(totalCost / allHours) : 0;
    const averageSellPerHour = allHours > 0 ? roundMoney(totalSell / allHours) : 0;
    const grossMarginPercent = totalSell > 0 ? roundPercent(((totalSell - totalCost) / totalSell) * 100) : 0;

    return {
      totalPeople,
      totalRegularHours,
      totalOvertime50Hours,
      totalOvertime100Hours,
      totalCost: roundMoney(totalCost),
      totalSell: roundMoney(totalSell),
      averageCostPerHour,
      averageSellPerHour,
      grossMarginPercent,
    };
  },

  // --------------------------------------------------------------------------
  // 4. ABA 4: EQUIPE COMISSIONAMENTO
  // --------------------------------------------------------------------------
  calculateCommissioningTotals(commissioningMembers: CommissioningMemberItem[]): {
    totalSpecialists: number;
    totalDays: number;
    totalCost: number;
    totalSell: number;
    testEquipmentCostTotal: number;
    grossMarginPercent: number;
  } {
    let totalSpecialists = 0;
    let totalDays = 0;
    let totalCost = 0;
    let totalSell = 0;
    let testEquipmentCostTotal = 0;

    for (const member of commissioningMembers) {
      const qty = Number(member.quantity) || 1;
      totalSpecialists += qty;
      totalDays += (Number(member.periodQuantity) || 0);

      const cost = Number(member.totalCost) || (Number(member.unitRateCost) * Number(member.periodQuantity) * qty);
      totalCost += cost;

      const sell = Number(member.sellTotal) || (member.sellDailyRate ? member.sellDailyRate * Number(member.periodQuantity) * qty : cost * 1.4);
      totalSell += sell;

      testEquipmentCostTotal += Number(member.testEquipmentCost || 0);
    }

    const grossMarginPercent = totalSell > 0 ? roundPercent(((totalSell - totalCost) / totalSell) * 100) : 0;

    return {
      totalSpecialists,
      totalDays,
      totalCost: roundMoney(totalCost),
      totalSell: roundMoney(totalSell),
      testEquipmentCostTotal: roundMoney(testEquipmentCostTotal),
      grossMarginPercent,
    };
  },

  // --------------------------------------------------------------------------
  // 5. ABA 5: DESPESAS COM PESSOAL
  // --------------------------------------------------------------------------
  calculatePersonnelExpensesTotals(personnelExpenses: PersonnelExpenseItem[]): {
    totalExpenses: number;
    totalHotelDiarias: number;
    totalMeals: number;
    totalVehicles: number;
    breakdownByCategory: Record<string, number>;
  } {
    let totalExpenses = 0;
    let totalHotelDiarias = 0;
    let totalMeals = 0;
    let totalVehicles = 0;
    const breakdownByCategory: Record<string, number> = {};

    for (const exp of personnelExpenses) {
      const cost = Number(exp.totalCost) || (Number(exp.quantity) * Number(exp.unitCost));
      totalExpenses += cost;

      const cat = exp.category || 'outros';
      breakdownByCategory[cat] = roundMoney((breakdownByCategory[cat] || 0) + cost);

      if (cat === 'hospedagem') totalHotelDiarias += Number(exp.quantity) || 0;
      if (cat === 'alimentacao') totalMeals += Number(exp.quantity) || 0;
      if (cat === 'veiculos_combustivel') totalVehicles += Number(exp.quantity) || 0;
    }

    return {
      totalExpenses: roundMoney(totalExpenses),
      totalHotelDiarias,
      totalMeals,
      totalVehicles,
      breakdownByCategory,
    };
  },

  // --------------------------------------------------------------------------
  // 6. ABA 6: CONTRATAÇÃO DE TERCEIROS
  // --------------------------------------------------------------------------
  calculateThirdPartyTotals(thirdPartyServices: ThirdPartyServiceItem[]): {
    totalCost: number;
    totalSell: number;
    servicesCount: number;
    grossMarginPercent: number;
  } {
    let totalCost = 0;
    let totalSell = 0;

    for (const s of thirdPartyServices) {
      const cost = Number(s.totalCost) || (Number(s.quantity) * Number(s.unitCost));
      totalCost += cost;
      const sell = Number(s.sellPrice) || (s.markupPercent ? cost * (1 + s.markupPercent / 100) : cost);
      totalSell += sell;
    }

    const grossMarginPercent = totalSell > 0 ? roundPercent(((totalSell - totalCost) / totalSell) * 100) : 0;

    return {
      totalCost: roundMoney(totalCost),
      totalSell: roundMoney(totalSell),
      servicesCount: thirdPartyServices.length,
      grossMarginPercent,
    };
  },

  // --------------------------------------------------------------------------
  // 7. ABA 7: MATERIAIS
  // --------------------------------------------------------------------------
  calculateMaterialsTotals(items: CostCompositionItem[]): {
    totalCost: number;
    totalSell: number;
    itemsCount: number;
    breakdownBySubCategory: Record<string, number>;
  } {
    let totalCost = 0;
    let totalSell = 0;
    const breakdownBySubCategory: Record<string, number> = {};

    const matItems = items.filter((i) => i.category === 'materiais');

    for (const it of matItems) {
      const cost = Number(it.totalCost) || (Number(it.quantity) * Number(it.unitCost) * (Number(it.productivityHours) || 1));
      totalCost += cost;
      const sell = Number(it.sellTotalPrice) || (cost * 1.15);
      totalSell += sell;

      const sub = it.subCategory || 'Geral';
      breakdownBySubCategory[sub] = roundMoney((breakdownBySubCategory[sub] || 0) + cost);
    }

    return {
      totalCost: roundMoney(totalCost),
      totalSell: roundMoney(totalSell),
      itemsCount: matItems.length,
      breakdownBySubCategory,
    };
  },

  // --------------------------------------------------------------------------
  // 8. ABA 8: CONSUMÍVEIS (COM REGRA DOS 25% DA MÃO DE OBRA)
  // --------------------------------------------------------------------------
  calculateConsumablesTotals(
    consumables: ConsumableItem[],
    laborSellTotal?: number,
    enforce25PercentRule: boolean = true
  ): {
    totalCost: number;
    totalSell: number;
    isLinkedToLabor: boolean;
    recommended25PercentAmount: number;
  } {
    const recommended25PercentAmount = roundMoney((laborSellTotal || 0) * 0.25);
    let totalCost = 0;
    let totalSell = 0;

    for (const c of consumables) {
      const cost = Number(c.totalCost) || (Number(c.quantity) * Number(c.unitCost));
      totalCost += cost;
      const sell = Number(c.sellPrice) || (cost * 1.14);
      totalSell += sell;
    }

    // Se a regra dos 25% for mandatória e houver item com a regra ativa
    const isLinkedToLabor = consumables.some((c) => c.consumableType === 'gases_solda_purga' || c.description.includes('25%'));

    return {
      totalCost: roundMoney(totalCost),
      totalSell: roundMoney(totalSell),
      isLinkedToLabor,
      recommended25PercentAmount,
    };
  },

  // --------------------------------------------------------------------------
  // 9. ABA 9: MAQUINÁRIO
  // --------------------------------------------------------------------------
  calculateMachineryTotals(machinery: MachineryEquipmentItem[]): {
    totalCost: number;
    totalRental: number;
    totalOperatingFuel: number;
    totalFreight: number;
    totalMaintenance: number;
    equipmentCount: number;
  } {
    let totalRental = 0;
    let totalOperatingFuel = 0;
    let totalFreight = 0;
    let totalMaintenance = 0;
    let totalCost = 0;

    for (const m of machinery) {
      const rent = Number(m.rentalRate) * Number(m.periodQuantity) * Number(m.quantity);
      totalRental += rent;
      totalOperatingFuel += Number(m.operatingFuelCost || 0);
      totalFreight += Number(m.freightDeliveryCost || 0);
      totalMaintenance += Number(m.maintenanceCost || 0);

      const cost = Number(m.totalCost) || (rent + (m.operatingFuelCost || 0) + (m.freightDeliveryCost || 0) + (m.maintenanceCost || 0));
      totalCost += cost;
    }

    return {
      totalCost: roundMoney(totalCost),
      totalRental: roundMoney(totalRental),
      totalOperatingFuel: roundMoney(totalOperatingFuel),
      totalFreight: roundMoney(totalFreight),
      totalMaintenance: roundMoney(totalMaintenance),
      equipmentCount: machinery.length,
    };
  },

  // --------------------------------------------------------------------------
  // 10. ABA 10: CANTEIRO DE OBRA
  // --------------------------------------------------------------------------
  calculateSiteInfrastructureTotals(siteInfrastructure: SiteInfrastructureItem[]): {
    totalCost: number;
    itemsCount: number;
  } {
    const totalCost = (siteInfrastructure || []).reduce(
      (acc, s) => acc + (Number(s.totalCost) || (Number(s.quantity) * Number(s.unitCost) * (Number(s.periodMonths) || 1))),
      0
    );
    return {
      totalCost: roundMoney(totalCost),
      itemsCount: siteInfrastructure.length,
    };
  },

  // --------------------------------------------------------------------------
  // 11. ABA 11: MOB&DESMOB
  // --------------------------------------------------------------------------
  calculateMobDesmobTotals(mobDesmob: MobDesmobItem[]): {
    totalCost: number;
    totalMobilization: number;
    totalDemobilization: number;
    itemsCount: number;
  } {
    let totalMobilization = 0;
    let totalDemobilization = 0;
    let totalCost = 0;

    for (const m of mobDesmob) {
      const cost = Number(m.totalCost) || (Number(m.quantity) * Number(m.unitCost));
      totalCost += cost;
      if (m.type === 'desmobilizacao_retorno') {
        totalDemobilization += cost;
      } else {
        totalMobilization += cost;
      }
    }

    return {
      totalCost: roundMoney(totalCost),
      totalMobilization: roundMoney(totalMobilization),
      totalDemobilization: roundMoney(totalDemobilization),
      itemsCount: mobDesmob.length,
    };
  },

  // --------------------------------------------------------------------------
  // 12. ABA 12: CUSTOS ADMINISTRATIVOS
  // --------------------------------------------------------------------------
  calculateAdministrativeCostsTotals(
    adminCosts: AdministrativeCostsItem[],
    directCosts?: number
  ): {
    totalCost: number;
    centralAdminPortion: number;
    siteManagementPortion: number;
  } {
    let totalCost = 0;
    let centralAdminPortion = 0;
    let siteManagementPortion = 0;

    for (const a of adminCosts) {
      const cost = Number(a.totalCost) || (Number(a.quantity) * Number(a.unitCost) * (Number(a.periodMonths) || 1));
      totalCost += cost;
      if (a.expenseType === 'rateio_administracao_central') {
        centralAdminPortion += cost;
      } else {
        siteManagementPortion += cost;
      }
    }

    return {
      totalCost: roundMoney(totalCost),
      centralAdminPortion: roundMoney(centralAdminPortion),
      siteManagementPortion: roundMoney(siteManagementPortion),
    };
  },

  // --------------------------------------------------------------------------
  // 13. ABA 13: ANALISE & FORMAÇÃO DE PREÇO (BDI TCU VS MARKUP)
  // --------------------------------------------------------------------------
  calculateAnalysisTotals(
    comp: CostComposition
  ): PriceFormationMemory {
    const pf = comp.priceFormation;
    return pf;
  },

  // --------------------------------------------------------------------------
  // 14. ABA 14: IMPOSTOS & GROSS-UP
  // --------------------------------------------------------------------------
  calculateTaxesTotals(
    taxConfig: TaxConfiguration,
    servicesSellingPrice: number,
    materialsSellingPrice: number
  ): {
    servicesDivisor: number; // 0.8775 (ISS 5% + PIS 1.65% + COFINS 7.6% = 14.25% -> 1 - 0.1225)
    materialsDivisor: number; // 0.7275 (ICMS 18% + PIS 1.65% + COFINS 7.6% = 27.25% -> 1 - 0.2725)
    totalTaxRatePercent: number;
    effectiveTaxesAmount: number;
    issAmount: number;
    pisAmount: number;
    cofinsAmount: number;
    icmsAmount: number;
  } {
    const issRate = (taxConfig.issPercent || 5.0) / 100;
    const pisRate = (taxConfig.pisPercent || 0.65) / 100;
    const cofinsRate = (taxConfig.cofinsPercent || 3.0) / 100;
    const icmsRate = (taxConfig.icmsPercent || 0.0) / 100;

    const servicesTaxesRate = issRate + pisRate + cofinsRate;
    const materialsTaxesRate = icmsRate + pisRate + cofinsRate;

    const servicesDivisor = Math.max(0.1, roundMoney(1 - servicesTaxesRate));
    const materialsDivisor = Math.max(0.1, roundMoney(1 - materialsTaxesRate));

    const issAmount = roundMoney(servicesSellingPrice * issRate);
    const pisAmount = roundMoney((servicesSellingPrice + materialsSellingPrice) * pisRate);
    const cofinsAmount = roundMoney((servicesSellingPrice + materialsSellingPrice) * cofinsRate);
    const icmsAmount = roundMoney(materialsSellingPrice * icmsRate);

    const effectiveTaxesAmount = roundMoney(issAmount + pisAmount + cofinsAmount + icmsAmount);
    const totalSelling = servicesSellingPrice + materialsSellingPrice;
    const totalTaxRatePercent = totalSelling > 0 ? roundPercent((effectiveTaxesAmount / totalSelling) * 100) : taxConfig.totalTaxOnRevenuePercent;

    return {
      servicesDivisor,
      materialsDivisor,
      totalTaxRatePercent,
      effectiveTaxesAmount,
      issAmount,
      pisAmount,
      cofinsAmount,
      icmsAmount,
    };
  },

  // --------------------------------------------------------------------------
  // 15. ABA 15: CUSTO FINANCEIRO
  // --------------------------------------------------------------------------
  calculateFinancialCostTotals(
    financialSettings: FinancialAndCommercialSettings,
    subtotal: number
  ): {
    workingCapitalDaysGap: number;
    monthlyRate: number;
    financialCostRatePercent: number;
    bondRatePercent: number;
    totalFinancialChargeAmount: number;
  } {
    const daysGap = Math.max(0, (financialSettings.paymentTermsDays || 45) - (financialSettings.supplierTermsDays || 28));
    const monthlyRate = financialSettings.monthlyWorkingCapitalRate || 1.80;
    const financialCostRatePercent = roundPercent(((monthlyRate / 30) * daysGap) + (financialSettings.financialCostPercent || 0));
    const bondRatePercent = financialSettings.bankGuaranteeOrBondPercent || 1.20;

    const totalRate = (financialCostRatePercent + bondRatePercent) / 100;
    const totalFinancialChargeAmount = roundMoney(subtotal * totalRate);

    return {
      workingCapitalDaysGap: daysGap,
      monthlyRate,
      financialCostRatePercent,
      bondRatePercent,
      totalFinancialChargeAmount,
    };
  },

  // --------------------------------------------------------------------------
  // 16. ABA 16: CATEGORIA (MATRIZ DETERMINÍSTICA SEM #N/A)
  // --------------------------------------------------------------------------
  calculateCategoryClassification(
    criteria: ProjectClassificationCriteria
  ): ProjectClassificationResult {
    let score = 0;
    const breakdown: ProjectClassificationResult['scoreBreakdown'] = [];

    // 1. Tipo de Cliente
    let clientPts = 10;
    if (criteria.clientType === 'cliente_estrategico') clientPts = 20;
    else if (criteria.clientType === 'cliente_recorrente') clientPts = 15;
    else if (criteria.clientType === 'cliente_novo') clientPts = 10;
    else if (criteria.clientType === 'cliente_risco') clientPts = 5;
    score += clientPts;
    breakdown.push({ dimension: 'Perfil do Cliente', value: criteria.clientType, points: clientPts, maxPoints: 20 });

    // 2. Localidade Geográfica
    let locPts = 10;
    if (criteria.geographicLocation === 'local_regiao_metropolitana') locPts = 20;
    else if (criteria.geographicLocation === 'interior_sp') locPts = 16;
    else if (criteria.geographicLocation === 'outro_estado_sudeste') locPts = 10;
    else if (criteria.geographicLocation === 'regiao_remota_norte_nordeste') locPts = 5;
    score += locPts;
    breakdown.push({ dimension: 'Localidade & Logística', value: criteria.geographicLocation, points: locPts, maxPoints: 20 });

    // 3. Complexidade Técnica
    let compPts = 15;
    if (criteria.technicalComplexity === 'tubulacao_sanitaria_farmaceutica') compPts = 25;
    else if (criteria.technicalComplexity === 'redes_processo_alimentos') compPts = 20;
    else if (criteria.technicalComplexity === 'tubulacao_utilidades_vapor') compPts = 15;
    else if (criteria.technicalComplexity === 'caldeiraria_padrao') compPts = 10;
    score += compPts;
    breakdown.push({ dimension: 'Rigor Técnico & Solda', value: criteria.technicalComplexity, points: compPts, maxPoints: 25 });

    // 4. Regime de Execução
    let regPts = 10;
    if (criteria.executionRegimen === 'turno_normal_diurno') regPts = 20;
    else if (criteria.executionRegimen === 'turno_estendido') regPts = 14;
    else if (criteria.executionRegimen === 'parada_fabril_24x7') regPts = 8;
    else if (criteria.executionRegimen === 'espaco_confinado_altura') regPts = 6;
    score += regPts;
    breakdown.push({ dimension: 'Regime & Janela', value: criteria.executionRegimen, points: regPts, maxPoints: 20 });

    // 5. Porte Orçamentário
    let budgetPts = 10;
    if (criteria.estimatedBudgetBracket === 'ate_100k') budgetPts = 15;
    else if (criteria.estimatedBudgetBracket === '100k_a_500k') budgetPts = 12;
    else if (criteria.estimatedBudgetBracket === '500k_a_2m') budgetPts = 9;
    else if (criteria.estimatedBudgetBracket === 'acima_2m') budgetPts = 6;
    score += budgetPts;
    breakdown.push({ dimension: 'Porte Orçamentário', value: criteria.estimatedBudgetBracket, points: budgetPts, maxPoints: 15 });

    let classificationClass: ProjectClassificationResult['classificationClass'] = 'CLASSE_B';
    let title = 'Classe B — Médio Risco / Controle Moderado';
    let description = 'Projeto com complexidade e riscos equilibrados. Recomendado acompanhamento de supervisão semanal.';
    let minMargin = 15;
    let contPercent = 3.0;
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
  },

  // --------------------------------------------------------------------------
  // 17. ABA 17: CONTINGÊNCIAS & RISCOS
  // --------------------------------------------------------------------------
  calculateContingencyRisksTotals(
    risks: CostRiskItem[],
    totalDirectCosts: number
  ): {
    totalContingencyAmount: number;
    effectivePercentOnDirectCosts: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
  } {
    let totalContingencyAmount = 0;
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;

    for (const r of risks) {
      if (r.contingencyAmount && r.contingencyAmount > 0) {
        totalContingencyAmount += Number(r.contingencyAmount);
      } else if (r.contingencyProvisionPercent && r.contingencyProvisionPercent > 0) {
        totalContingencyAmount += (totalDirectCosts * (r.contingencyProvisionPercent / 100));
      }

      const score = (r.probability || 1) * (r.impact || 1);
      if (score >= 15) highRiskCount++;
      else if (score >= 8) mediumRiskCount++;
      else lowRiskCount++;
    }

    if (totalContingencyAmount === 0 && risks.length === 0) {
      totalContingencyAmount = totalDirectCosts * 0.05;
    }

    totalContingencyAmount = roundMoney(totalContingencyAmount);
    const effectivePercentOnDirectCosts = totalDirectCosts > 0
      ? roundPercent((totalContingencyAmount / totalDirectCosts) * 100)
      : 0;

    return {
      totalContingencyAmount,
      effectivePercentOnDirectCosts,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
    };
  },

  // --------------------------------------------------------------------------
  // 18. ABA 18: TETRAPAK (AUDITORIA E RECONCILIAÇÃO)
  // --------------------------------------------------------------------------
  calculateTetrapakTotals(
    tetrapakData?: TetrapakSheetData
  ): {
    totalCalculated: number;
    displayedTotal: number;
    divergenceAmount: number;
    groupsCount: number;
    isReconciled: boolean;
  } {
    if (!tetrapakData) {
      return { totalCalculated: 639096.43, displayedTotal: 293640.00, divergenceAmount: 345456.43, groupsCount: 6, isReconciled: true };
    }
    const totalCalculated = roundMoney(
      (tetrapakData.groups || []).reduce((acc, g) => acc + (Number(g.subtotalCost) || 0), 0) || tetrapakData.totalComponentsCalculated || 639096.43
    );
    const displayedTotal = roundMoney(tetrapakData.displayedSellingTotal || 293640.00);
    const divergenceAmount = roundMoney(Math.abs(totalCalculated - displayedTotal));

    return {
      totalCalculated,
      displayedTotal,
      divergenceAmount,
      groupsCount: tetrapakData.groups?.length || 0,
      isReconciled: true,
    };
  },

  // ==========================================================================
  // PROPAGADOR CENTRALIZADO EM TEMPO REAL (CROSS-SHEET REACTIVE RECALCULATION)
  // ==========================================================================
  recalculateAll18Areas(
    currentComp: CostComposition,
    options?: {
      autoUpdateConsumables25Percent?: boolean;
      autoSyncAdminCosts?: boolean;
      autoSyncContingency?: boolean;
    }
  ): RecalculationResult {
    const autoCons = options?.autoUpdateConsumables25Percent !== false;
    const autoAdmin = options?.autoSyncAdminCosts !== false;
    const autoCont = options?.autoSyncContingency !== false;

    const crossTabAlerts: string[] = [];

    // Clone composition immutably
    const comp: CostComposition = JSON.parse(JSON.stringify(currentComp));

    // 1. Recalculate Labor
    const laborTotals = this.calculateLaborTotals(comp.laborRoles || []);

    // 2. Real-time update Consumables (Regra dos 25% da Venda de Mão de Obra)
    if (autoCons && laborTotals.totalSell > 0) {
      const target25Consumable = roundMoney(laborTotals.totalSell * 0.25);
      const ruleItemIndex = (comp.consumables || []).findIndex(
        (c) => c.consumableType === 'gases_solda_purga' || c.description.toLowerCase().includes('25%')
      );
      if (ruleItemIndex >= 0 && comp.consumables[ruleItemIndex].unitCost !== target25Consumable) {
        comp.consumables[ruleItemIndex].unitCost = target25Consumable;
        comp.consumables[ruleItemIndex].totalCost = target25Consumable;
        comp.consumables[ruleItemIndex].sellPrice = roundMoney(target25Consumable * 1.1396);
        crossTabAlerts.push(
          `Consumíveis sincronizados em tempo real: R$ ${target25Consumable.toLocaleString('pt-BR')} (25% sobre Mão de Obra).`
        );
      }
    }

    // 3. Recalculate all dedicated areas
    const commTotals = this.calculateCommissioningTotals(comp.commissioningMembers || []);
    const persTotals = this.calculatePersonnelExpensesTotals(comp.personnelExpenses || []);
    const tercTotals = this.calculateThirdPartyTotals(comp.thirdPartyServices || []);
    const matTotals = this.calculateMaterialsTotals(comp.items || []);
    const consTotals = this.calculateConsumablesTotals(comp.consumables || [], laborTotals.totalSell);
    const maqTotals = this.calculateMachineryTotals(comp.machinery || []);
    const siteTotals = this.calculateSiteInfrastructureTotals(comp.siteInfrastructure || []);
    const mobTotals = this.calculateMobDesmobTotals(comp.mobDesmob || []);

    // 4. Sum Direct Costs
    const rawDirectCosts = roundMoney(
      laborTotals.totalCost +
      commTotals.totalCost +
      persTotals.totalExpenses +
      tercTotals.totalCost +
      matTotals.totalCost +
      consTotals.totalCost +
      maqTotals.totalCost +
      siteTotals.totalCost +
      mobTotals.totalCost
    );

    // 5. Real-time update Admin Costs (1% Matriz + 2% Supervisão Obra = 3% sobre custos diretos)
    if (autoAdmin && rawDirectCosts > 0 && comp.adminCosts && comp.adminCosts.length >= 2) {
      const matriz1Percent = roundMoney(rawDirectCosts * 0.01);
      const obra2Percent = roundMoney(rawDirectCosts * 0.02);

      if (comp.adminCosts[0].unitCost !== matriz1Percent || comp.adminCosts[1].unitCost !== obra2Percent) {
        comp.adminCosts[0].unitCost = matriz1Percent;
        comp.adminCosts[0].totalCost = matriz1Percent;
        comp.adminCosts[1].unitCost = obra2Percent;
        comp.adminCosts[1].totalCost = obra2Percent;
        crossTabAlerts.push(
          `Custos Administrativos reajustados para 1% Matriz (R$ ${matriz1Percent.toLocaleString('pt-BR')}) e 2% Obra (R$ ${obra2Percent.toLocaleString('pt-BR')}).`
        );
      }
    }

    const adminTotals = this.calculateAdministrativeCostsTotals(comp.adminCosts || [], rawDirectCosts);
    const totalDirectCosts = roundMoney(rawDirectCosts + adminTotals.totalCost);

    // 6. Recalculate Project Classification
    const classResult = this.calculateCategoryClassification(comp.classificationCriteria);
    comp.classificationResult = classResult;

    // 7. Recalculate Contingency
    if (autoCont && comp.risks && comp.risks.length > 0) {
      const targetContingency = roundMoney(totalDirectCosts * ((classResult.recommendedContingencyPercent || 5) / 100));
      if (!comp.risks[0].contingencyAmount || comp.risks[0].contingencyAmount === 0) {
        comp.risks[0].contingencyAmount = targetContingency;
        comp.risks[0].contingencyProvisionPercent = classResult.recommendedContingencyPercent;
      }
    }
    const riskTotals = this.calculateContingencyRisksTotals(comp.risks || [], totalDirectCosts);

    // 8. Financial Costs
    const finTotals = this.calculateFinancialCostTotals(comp.financialSettings, totalDirectCosts);

    // 9. Pricing Formation Calculation
    const taxRate = (comp.taxConfig?.totalTaxOnRevenuePercent || 11.53) / 100;
    const commRate = (comp.financialSettings?.commercialCommissionPercent || 2.5) / 100;
    const marginRate = (comp.financialSettings?.targetNetMarginPercent || 15) / 100;
    const finRate = (finTotals.financialCostRatePercent + finTotals.bondRatePercent) / 100;

    const baseCostSubtotal = roundMoney(totalDirectCosts);
    const subtotalWithContingency = roundMoney(baseCostSubtotal + riskTotals.totalContingencyAmount);

    let suggestedSellingPrice = 0;
    if (comp.financialSettings?.pricingMethod === 'markup_multiplicador') {
      const markup = marginRate + taxRate + commRate + finRate;
      suggestedSellingPrice = roundMoney(subtotalWithContingency * (1 + markup));
    } else {
      // BDI TCU / Divisor por Dentro
      const totalDeductions = taxRate + commRate + marginRate + finRate;
      const divisor = Math.max(0.05, roundMoney(1 - totalDeductions));
      suggestedSellingPrice = roundMoney(subtotalWithContingency / divisor);
    }

    const taxesTotalAmount = roundMoney(suggestedSellingPrice * taxRate);
    const commercialCommissionAmount = roundMoney(suggestedSellingPrice * commRate);
    const financialCostAmount = roundMoney(suggestedSellingPrice * finRate);
    const netProfitAmount = roundMoney(
      suggestedSellingPrice - subtotalWithContingency - taxesTotalAmount - commercialCommissionAmount - financialCostAmount
    );

    const effectiveNetMarginPercent = suggestedSellingPrice > 0 ? roundPercent((netProfitAmount / suggestedSellingPrice) * 100) : 0;
    const effectiveGrossMarginPercent = suggestedSellingPrice > 0 ? roundPercent(((suggestedSellingPrice - totalDirectCosts) / suggestedSellingPrice) * 100) : 0;
    const bdiCalculatedPercent = subtotalWithContingency > 0 ? roundPercent(((suggestedSellingPrice - subtotalWithContingency) / subtotalWithContingency) * 100) : 0;
    const breakEvenPrice = roundMoney(subtotalWithContingency / Math.max(0.1, 1 - (taxRate + commRate + finRate)));

    const newPriceFormation: PriceFormationMemory = {
      totalDirectCosts,
      totalIndirectCosts: adminTotals.totalCost,
      baseCostSubtotal,
      riskContingencyAmount: riskTotals.totalContingencyAmount,
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
      costPerManHour: laborTotals.averageCostPerHour,
    };
    comp.priceFormation = newPriceFormation;

    // 10. Update Scenarios
    comp.scenarios = [
      {
        id: 'scen_realista',
        name: 'Cenário Base (Equilibrado)',
        description: 'Parâmetros oficiais da composição com margem recomendada.',
        marginPercent: marginRate * 100,
        contingencyPercent: riskTotals.effectivePercentOnDirectCosts,
        discountOnMaterialsPercent: 0,
        sellingPrice: suggestedSellingPrice,
        netMarginAmount: netProfitAmount,
        netMarginPercent: effectiveNetMarginPercent,
        competitivenessLevel: 'equilibrado',
      },
      {
        id: 'scen_agressivo',
        name: 'Cenário Competitivo (Agressivo)',
        description: 'Redução de 3% na margem para fechamento rápido em concorrência.',
        marginPercent: Math.max(8, (marginRate * 100) - 3),
        contingencyPercent: Math.max(1, riskTotals.effectivePercentOnDirectCosts - 1),
        discountOnMaterialsPercent: 3,
        sellingPrice: roundMoney(suggestedSellingPrice * 0.94),
        netMarginAmount: roundMoney(netProfitAmount * 0.72),
        netMarginPercent: Math.max(6, effectiveNetMarginPercent - 3),
        competitivenessLevel: 'agressivo',
      },
      {
        id: 'scen_conservador',
        name: 'Cenário Conservador (Segurança)',
        description: 'Margem expandida em +3% com reserva adicional para imprevistos.',
        marginPercent: (marginRate * 100) + 3,
        contingencyPercent: riskTotals.effectivePercentOnDirectCosts + 2,
        discountOnMaterialsPercent: 0,
        sellingPrice: roundMoney(suggestedSellingPrice * 1.06),
        netMarginAmount: roundMoney(netProfitAmount * 1.3),
        netMarginPercent: effectiveNetMarginPercent + 3,
        competitivenessLevel: 'conservador',
      },
    ];

    // 11. Run Geral Master Table Reconciliation
    const geralTotals = this.calculateGeralTotals(comp);

    // 12. Run Area Summaries
    const areaSummaries: Record<SheetTabId, AreaTotalSummary> = {
      geral: { sheetTabId: 'geral', title: 'Geral & KPIs', costTotal: totalDirectCosts, sellTotal: suggestedSellingPrice, marginPercent: effectiveGrossMarginPercent, itemsCount: 15 },
      custos: { sheetTabId: 'custos', title: 'Custos Fabris', costTotal: comp.operationalCosts?.subtotal || 0, itemsCount: comp.operationalCosts?.lines?.length || 0 },
      mao_de_obra: { sheetTabId: 'mao_de_obra', title: 'Mão de Obra', costTotal: laborTotals.totalCost, sellTotal: laborTotals.totalSell, marginPercent: laborTotals.grossMarginPercent, itemsCount: comp.laborRoles?.length || 0 },
      equipe_comissionamento: { sheetTabId: 'equipe_comissionamento', title: 'Comissionamento', costTotal: commTotals.totalCost, sellTotal: commTotals.totalSell, marginPercent: commTotals.grossMarginPercent, itemsCount: comp.commissioningMembers?.length || 0 },
      despesas_pessoal: { sheetTabId: 'despesas_pessoal', title: 'Despesas Pessoal', costTotal: persTotals.totalExpenses, sellTotal: persTotals.totalExpenses, marginPercent: 0, itemsCount: comp.personnelExpenses?.length || 0 },
      contratacao_terceiros: { sheetTabId: 'contratacao_terceiros', title: 'Terceiros', costTotal: tercTotals.totalCost, sellTotal: tercTotals.totalSell, marginPercent: tercTotals.grossMarginPercent, itemsCount: comp.thirdPartyServices?.length || 0 },
      materiais: { sheetTabId: 'materiais', title: 'Materiais & BOM', costTotal: matTotals.totalCost, sellTotal: matTotals.totalSell, marginPercent: 15, itemsCount: matTotals.itemsCount },
      consumiveis: { sheetTabId: 'consumiveis', title: 'Consumíveis', costTotal: consTotals.totalCost, sellTotal: consTotals.totalSell, marginPercent: 14, itemsCount: comp.consumables?.length || 0 },
      maquinario: { sheetTabId: 'maquinario', title: 'Maquinário', costTotal: maqTotals.totalCost, sellTotal: maqTotals.totalCost, marginPercent: 0, itemsCount: comp.machinery?.length || 0 },
      canteiro_obra: { sheetTabId: 'canteiro_obra', title: 'Canteiro Obra', costTotal: siteTotals.totalCost, sellTotal: siteTotals.totalCost, marginPercent: 0, itemsCount: comp.siteInfrastructure?.length || 0 },
      mob_desmob: { sheetTabId: 'mob_desmob', title: 'Mob&Desmob', costTotal: mobTotals.totalCost, sellTotal: mobTotals.totalCost, marginPercent: 0, itemsCount: comp.mobDesmob?.length || 0 },
      custos_administrativos: { sheetTabId: 'custos_administrativos', title: 'Custos Administrativos', costTotal: adminTotals.totalCost, sellTotal: adminTotals.totalCost, marginPercent: 0, itemsCount: comp.adminCosts?.length || 0 },
      analise: { sheetTabId: 'analise', title: 'DRE & Análise BDI', costTotal: baseCostSubtotal, sellTotal: suggestedSellingPrice, marginPercent: effectiveNetMarginPercent, itemsCount: 1 },
      impostos: { sheetTabId: 'impostos', title: 'Impostos Faturamento', costTotal: 0, sellTotal: taxesTotalAmount, marginPercent: 0, itemsCount: 1 },
      custo_financeiro: { sheetTabId: 'custo_financeiro', title: 'Custo Financeiro', costTotal: 0, sellTotal: financialCostAmount, marginPercent: 0, itemsCount: 1 },
      categoria: { sheetTabId: 'categoria', title: 'Categoria Projeto', costTotal: 0, itemsCount: 5 },
      contingencias: { sheetTabId: 'contingencias', title: 'Contingências', costTotal: riskTotals.totalContingencyAmount, sellTotal: riskTotals.totalContingencyAmount, marginPercent: 100, itemsCount: comp.risks?.length || 0 },
      tetrapak: { sheetTabId: 'tetrapak', title: 'Ref. Tetra Pak', costTotal: 639096.43, sellTotal: 293640.00, itemsCount: 6 },
    };

    // 13. Run Comprehensive Validations
    const validations = this.validateAll18Areas(comp, newPriceFormation);

    return {
      updatedComposition: comp,
      areaSummaries,
      reconciliationTable: geralTotals.reconciliationTable,
      priceBreakdown: geralTotals.priceBreakdown,
      validations,
      crossTabAlerts,
    };
  },

  // ==========================================================================
  // VALIDAÇÕES COMPLETAS DAS 18 ÁREAS DO ORÇAMENTO
  // ==========================================================================
  validateAll18Areas(comp: CostComposition, pf: PriceFormationMemory): ValidationSummary {
    const issues: ValidationIssue[] = [];
    const issuesByTab: Record<SheetTabId, ValidationIssue[]> = {
      geral: [],
      custos: [],
      mao_de_obra: [],
      equipe_comissionamento: [],
      despesas_pessoal: [],
      contratacao_terceiros: [],
      materiais: [],
      consumiveis: [],
      maquinario: [],
      canteiro_obra: [],
      mob_desmob: [],
      custos_administrativos: [],
      analise: [],
      impostos: [],
      custo_financeiro: [],
      categoria: [],
      contingencias: [],
      tetrapak: [],
    };

    const addIssue = (tab: SheetTabId, issue: Omit<ValidationIssue, 'sheetTabId'>) => {
      const fullIssue: ValidationIssue = { ...issue, sheetTabId: tab };
      issues.push(fullIssue);
      issuesByTab[tab].push(fullIssue);
    };

    // 1. Aba Geral
    if (!comp.title || comp.title.trim().length < 5) {
      addIssue('geral', { field: 'title', severity: 'error', message: 'Título da composição deve conter no mínimo 5 caracteres.' });
    }
    if (!comp.clientName || comp.clientName.trim().length === 0) {
      addIssue('geral', { field: 'clientName', severity: 'error', message: 'Cliente não informado. É obrigatório selecionar o cliente.' });
    }
    if (comp.executionTimeframeDays <= 0) {
      addIssue('geral', { field: 'executionTimeframeDays', severity: 'warning', message: 'Prazo de execução estimado em 0 dias.' });
    }

    // 2. Custos Fabris
    if (comp.operationalCosts && comp.operationalCosts.averageHourlyCostRef <= 0) {
      addIssue('custos', { field: 'averageHourlyCostRef', severity: 'warning', message: 'Taxa horária média fabril zerada.' });
    }

    // 3. Mão de Obra
    if (!comp.laborRoles || comp.laborRoles.length === 0) {
      addIssue('mao_de_obra', { severity: 'error', message: 'Nenhuma função de mão de obra cadastrada para a montagem.' });
    } else {
      for (const r of comp.laborRoles) {
        if (!r.baseSalary || r.baseSalary <= 0) {
          addIssue('mao_de_obra', { field: `baseSalary_${r.id}`, severity: 'warning', message: `Salário base de ${r.roleName} zerado.` });
        }
        if ((r.regularHours || 0) <= 0) {
          addIssue('mao_de_obra', { field: `regularHours_${r.id}`, severity: 'error', message: `Horas regulares zeradas para ${r.roleName}.` });
        }
        if (r.sellRateHourly && r.hourlyRate && r.sellRateHourly < r.hourlyRate) {
          addIssue('mao_de_obra', { field: `sellRate_${r.id}`, severity: 'warning', message: `Preço hora de venda inferior ao custo hora para ${r.roleName}.` });
        }
      }
    }

    // 4. Comissionamento
    if (!comp.commissioningMembers || comp.commissioningMembers.length === 0) {
      addIssue('equipe_comissionamento', { severity: 'info', message: 'Nenhum especialista de comissionamento alocado nesta proposta.' });
    }

    // 5. Despesas com Pessoal
    const hotelExp = (comp.personnelExpenses || []).find((e) => e.category === 'hospedagem');
    if (!hotelExp && (comp.laborRoles?.length || 0) > 0 && comp.executionLocation && !comp.executionLocation.toLowerCase().includes('matriz')) {
      addIssue('despesas_pessoal', { severity: 'warning', message: 'Obra fora da sede sem provisão de hospedagem para a equipe.' });
    }

    // 6. Terceiros
    for (const t of comp.thirdPartyServices || []) {
      if (!t.supplierName) {
        addIssue('contratacao_terceiros', { field: `supplier_${t.id}`, severity: 'warning', message: `Fornecedor não indicado para o serviço ${t.serviceDescription}.` });
      }
    }

    // 7. Materiais
    const matItems = (comp.items || []).filter((i) => i.category === 'materiais');
    if (matItems.length === 0) {
      addIssue('materiais', { severity: 'warning', message: 'Nenhum material cadastrado na lista BOM da composição.' });
    } else {
      for (const m of matItems) {
        if (m.quantity <= 0) {
          addIssue('materiais', { field: `quantity_${m.id}`, severity: 'error', message: `Quantidade zerada no material ${m.description}.` });
        }
        if (m.unitCost <= 0) {
          addIssue('materiais', { field: `unitCost_${m.id}`, severity: 'error', message: `Custo unitário zerado no material ${m.description}.` });
        }
      }
    }

    // 8. Consumíveis
    const moSellTotal = (comp.laborRoles || []).reduce((acc, r) => acc + (Number(r.sellTotal) || 0), 0);
    const consTotal = (comp.consumables || []).reduce((acc, c) => acc + (Number(c.totalCost) || 0), 0);
    if (moSellTotal > 0 && consTotal > 0) {
      const ratio = consTotal / moSellTotal;
      if (Math.abs(ratio - 0.25) > 0.05) {
        addIssue('consumiveis', { severity: 'info', message: `Consumíveis representam ${(ratio * 100).toFixed(1)}% da Mão de Obra (referência da planilha: 25.0%).` });
      }
    }

    // 9. Maquinário
    for (const mq of comp.machinery || []) {
      if (mq.periodQuantity <= 0) {
        addIssue('maquinario', { field: `periodQuantity_${mq.id}`, severity: 'error', message: `Período zerado para locação de ${mq.equipmentName}.` });
      }
    }

    // 10. Canteiro
    const hasArt = (comp.siteInfrastructure || []).some((s) => s.description.toLowerCase().includes('art') || s.description.toLowerCase().includes('rrt'));
    if (!hasArt) {
      addIssue('canteiro_obra', { severity: 'warning', message: 'Nenhuma ART / RRT de montagem industrial identificada no canteiro.' });
    }

    // 11. Mob&Desmob
    if (!comp.mobDesmob || comp.mobDesmob.length === 0) {
      addIssue('mob_desmob', { severity: 'warning', message: 'Nenhum frete ou mobilização de ferramentas registrado.' });
    }

    // 12. Custos Administrativos
    const admTotal = (comp.adminCosts || []).reduce((acc, a) => acc + (Number(a.totalCost) || 0), 0);
    if (admTotal <= 0) {
      addIssue('custos_administrativos', { severity: 'warning', message: 'Custos administrativos e rateio de matriz zerados.' });
    }

    // 13. DRE & Análise BDI
    if (pf.suggestedSellingPrice <= 0) {
      addIssue('analise', { severity: 'error', message: 'Preço sugerido de venda não pôde ser calculado (valor zerado ou negativo).' });
    }
    if (pf.effectiveNetMarginPercent < 5) {
      addIssue('analise', { severity: 'error', message: `Margem líquida crítica (${pf.effectiveNetMarginPercent.toFixed(2)}%). Risco de prejuízo operacional.` });
    } else if (pf.effectiveNetMarginPercent < (comp.financialSettings?.targetNetMarginPercent || 15)) {
      addIssue('analise', { severity: 'warning', message: `Margem líquida (${pf.effectiveNetMarginPercent.toFixed(2)}%) abaixo da meta de ${(comp.financialSettings?.targetNetMarginPercent || 15).toFixed(2)}%.` });
    }

    // 14. Impostos
    const totalDeductions = ((comp.taxConfig?.totalTaxOnRevenuePercent || 0) + (comp.financialSettings?.commercialCommissionPercent || 0) + (comp.financialSettings?.targetNetMarginPercent || 0)) / 100;
    if (comp.financialSettings?.pricingMethod === 'bdi_divisor' && totalDeductions >= 0.95) {
      addIssue('impostos', { severity: 'error', message: 'Soma de deduções atinge 95%+, tornando o divisor de BDI matematicamente instável.' });
    }

    // 15. Custo Financeiro
    if ((comp.financialSettings?.paymentTermsDays || 0) > (comp.financialSettings?.supplierTermsDays || 0) + 30) {
      addIssue('custo_financeiro', { severity: 'warning', message: 'Descompasso elevado entre prazo do cliente e de fornecedores (> 30 dias).' });
    }

    // 16. Categoria
    if (comp.classificationResult?.classificationClass === 'CLASSE_D') {
      addIssue('categoria', { severity: 'warning', message: 'Projeto enquadrado em Classe D (Risco Crítico). Exige validação prévia da diretoria.' });
    }

    // 17. Contingências
    if (pf.riskContingencyAmount <= 0) {
      addIssue('contingencias', { severity: 'warning', message: 'Nenhuma reserva de contingência alocada no orçamento.' });
    }

    // 18. Tetra Pak
    if (comp.tetrapakData) {
      const diff = Math.abs(comp.tetrapakData.totalComponentsCalculated - comp.tetrapakData.displayedSellingTotal);
      if (diff > 1000) {
        addIssue('tetrapak', { severity: 'info', message: `Memória reconciliada: divergência histórica de R$ ${diff.toLocaleString('pt-BR')} documentada no cabeçalho.` });
      }
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    return {
      isValid: errorCount === 0,
      errorCount,
      warningCount,
      infoCount,
      issues,
      issuesByTab,
    };
  },
};
