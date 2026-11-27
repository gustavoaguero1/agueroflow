/**
 * Motor de Engenharia de Custos e Formação de Preços — AGUERO INOX
 *
 * Reproduz e reconcilia toda a inteligência das 18 abas da Planilha XXXX-26 - MODELO,
 * corrigindo as divergências encontradas na auditoria (tabela HH unificada, ISS/ICMS
 * parametrizáveis, Price Breakdown reconciliado, contingência conectada à matriz de riscos,
 * desconto previsto vs desconto extra, e separação explícita entre Margem e Refaturamento).
 */

export type BillingCompanyId = 'aguero_inox' | 'aguero_abc' | 'aguero_projetos';
export type BillingPurpose = 'venda' | 'servico' | 'material_servico' | 'industrializacao';
export type DurationUnit = 'dias' | 'semanas' | 'meses';
export type AlloyDensityId = 'inox_304' | 'inox_316l' | 'aco_carbono' | 'aluminio' | 'planilha_padrao';
export type VehicleTypeId = 'passeio' | 'van' | 'micro_onibus';
export type ConsumablesMode = 'percentual' | 'detalhado' | 'misto';
export type ContingencyMode = 'percentual' | 'matriz_riscos' | 'misto';
export type MachineryUnit = 'hora' | 'diaria' | 'semana' | 'mes' | 'servico' | 'deslocamento';
export type RiskStrategy = 'aceitar' | 'mitigar' | 'transferir' | 'evitar';
export type ClientPresentationTemplate = 'padrao' | 'tetrapak' | 'breakdown';

export interface RoleRateTableEntry {
  id: string;
  roleName: string;
  salario: number;
  beneficios: number;
  encargos: number;
  epis: number;
  horasDia: number;
  diasMes: number;
  margemComercialPercent: number;
  hhCusto: number;
  hhVenda: number;
  useManualHH?: boolean;
}

export interface ExecutionPhaseLaborRow {
  id: string;
  roleId: string;
  roleName: string;
  quantity: number;
  horasNormais: number;
  horasExtras50: number;
  horasExtras100: number;
  hhCusto: number;
  hhVenda: number;
}

export interface ExecutionPhase {
  id: string;
  name: string;
  kind: 'principal' | 'comissionamento' | 'fabricacao' | 'outro';
  durationWeeks: number;
  weeklyHours: number;
  rows: ExecutionPhaseLaborRow[];
}

export interface SheetMaterialRow {
  id: string;
  description: string;
  alloy: AlloyDensityId;
  quantity: number;
  thicknessMm: number;
  widthM: number;
  lengthM: number;
  pricePerKg: number;
  refaturamentoPercent: number;
  icmsCreditPercent: number;
}

export interface BarTubeMaterialRow {
  id: string;
  description: string;
  gauge: string;
  quantity: number;
  lengthM: number;
  kgPerMeter: number;
  pricePerKg: number;
  refaturamentoPercent: number;
  icmsCreditPercent: number;
}

export interface ConnectionMaterialRow {
  id: string;
  description: string;
  group: 'mecanico' | 'eletrico' | 'outro';
  unit: string;
  quantity: number;
  unitCost: number;
  refaturamentoPercent: number;
  icmsCreditPercent: number;
}

export interface PaintingSpec {
  enabled: boolean;
  areaM2: number;
  coats: number;
  yieldM2PerGallon: number;
  lossPercent: number;
  reservePercent: number;
  pricePerGallon: number;
  refaturamentoPercent: number;
}

export interface PersonnelExpensesConfig {
  useAutoHeadcount: boolean;
  manualHeadcount: number;
  calendarDays: number;
  hospedagemDiaria: number;
  alimentacaoDiaria: number;
  manutencaoAlojamentoDiaria: number;
  folgaCampoUnit: number;
  folgasQuantidade: number;
  includeHospedagem: boolean;
  includeAlimentacao: boolean;
  includeManutencaoAloj: boolean;
  transport: {
    enabled: boolean;
    vehicleType: VehicleTypeId;
    kmPerDay: number;
    workDays: number;
    fuelPricePerLiter: number;
    monthsRental: number;
  };
  extras: Array<{
    id: string;
    description: string;
    quantity: number;
    unitCost: number;
  }>;
}

export interface ConsumablesConfig {
  mode: ConsumablesMode;
  percentOnMainLaborSell: number;
  items: Array<{
    id: string;
    description: string;
    unit: string;
    quantity: number;
    unitCost: number;
  }>;
}

export interface MachineryRow {
  id: string;
  name: string;
  ownership: 'proprio' | 'locado' | 'terceirizado';
  unit: MachineryUnit;
  quantity: number;
  duration: number;
  unitPrice: number;
  factor: number;
}

export interface SiteInfraRow {
  id: string;
  group: 'estrutura' | 'instalacoes' | 'mobiliario' | 'seguranca' | 'documentacao' | 'manutencao' | 'logistica';
  description: string;
  isContainer?: boolean;
  quantity: number;
  months: number;
  unitCost: number;
  freightPerTrip?: number;
}

export interface MobDesmobRow {
  id: string;
  phase: 'mobilizacao' | 'desmobilizacao';
  description: string;
  quantity: number;
  unitCost: number;
}

export interface ThirdPartyRow {
  id: string;
  description: string;
  supplier: string;
  quoteNumber: string;
  validityDate: string;
  paymentCondition: string;
  quantity: number;
  unitCost: number;
}

export interface AdminCostsConfig {
  adminCentralPercent: number;
  gerenciamentoProjetoPercent: number;
  ohsGestaoPercent: number;
  comissaoAdmPercent: number;
}

export interface TaxEngineConfig {
  company: BillingCompanyId;
  purpose: BillingPurpose;
  pisPercent: number;
  cofinsPercent: number;
  issPercent: number;
  icmsPercent: number;
  csllPercent: number;
  irpjPercent: number;
  icmsCreditDefaultPercent: number;
  serviceEffectiveRatePercent: number;
  materialEffectiveRatePercent: number;
  industrializationEffectiveRatePercent: number;
}

export interface CommercialConditionsConfig {
  paymentTermCode: '07_28' | '30' | '45' | '60' | '75' | '90' | '120';
  financialTermPercent: number;
  anticipationPercent: number;
  bankInsurancePercent: number;
  plannedDiscountPercent: number;
  commercialCommissionPercent: number;
  extraClosingDiscountPercent: number;
  fixedOverheadPercent: number;
  targetProfitPercent: number;
  defaultServiceMarginPercent: number;
}

export interface ProjectCategoryCriteria {
  clientScore: 1 | 2 | 3 | 4 | 5;
  locationScore: 1 | 2 | 3 | 4 | 5;
  complexityScore: 1 | 2 | 3 | 4 | 5;
  valueScoreAuto: boolean;
  manualValueScore: 1 | 2 | 3 | 4 | 5;
}

export interface RiskMatrixEntry {
  id: string;
  rootCause: string;
  effect: string;
  costAtRisk: number;
  probability: number; // 1-10
  impact: number; // 1-10
  strategy: RiskStrategy;
  action: string;
  actionCost: number;
  residualProbability: number; // 1-10
  residualImpact: number; // 1-10
}

export interface AgueroInoxBudgetModel {
  durationQty: number;
  durationUnit: DurationUnit;
  startDate: string;
  overtimeMult50: number;
  overtimeMult100: number;
  roleRates: RoleRateTableEntry[];
  phases: ExecutionPhase[];
  materialsFreightCost: number;
  materialsFreightRefatPercent: number;
  sheets: SheetMaterialRow[];
  barsTubes: BarTubeMaterialRow[];
  connections: ConnectionMaterialRow[];
  painting: PaintingSpec;
  personnelExpenses: PersonnelExpensesConfig;
  consumables: ConsumablesConfig;
  machinery: MachineryRow[];
  siteInfra: SiteInfraRow[];
  mobDesmob: MobDesmobRow[];
  thirdParty: ThirdPartyRow[];
  adminCosts: AdminCostsConfig;
  taxes: TaxEngineConfig;
  conditions: CommercialConditionsConfig;
  categoryCriteria: ProjectCategoryCriteria;
  contingencyMode: ContingencyMode;
  contingencyManualPercent: number;
  risks: RiskMatrixEntry[];
  presentationTemplate: ClientPresentationTemplate;
  actualCostsByGroup: Record<string, number>;
}

// ----------------------------------------------------------------------------
// REFERENCE CONSTANTS FROM AGUERO INOX MODEL (PLANILHA XXXX-26)
// ----------------------------------------------------------------------------

export const ALLOY_DENSITIES: Record<AlloyDensityId, { label: string; factor: number }> = {
  inox_304: { label: 'Aço Inox AISI 304 (7,93)', factor: 7.93 },
  inox_316l: { label: 'Aço Inox AISI 316L (8,00)', factor: 8.0 },
  aco_carbono: { label: 'Aço Carbono (7,85)', factor: 7.85 },
  aluminio: { label: 'Alumínio (2,70)', factor: 2.7 },
  planilha_padrao: { label: 'Padrão Planilha (8,00)', factor: 8.0 },
};

export const VEHICLE_PRESETS: Record<VehicleTypeId, { label: string; kmPerLiter: number; monthlyRental: number; passengers: number }> = {
  passeio: { label: 'Carro Passeio (5 lug.)', kmPerLiter: 11, monthlyRental: 4000, passengers: 5 },
  van: { label: 'Van Executiva (12 lug.)', kmPerLiter: 10, monthlyRental: 5000, passengers: 12 },
  micro_onibus: { label: 'Micro-ônibus (35 lug.)', kmPerLiter: 9, monthlyRental: 16000, passengers: 35 },
};

export const PAYMENT_TERM_RATES: Record<CommercialConditionsConfig['paymentTermCode'], { label: string; rate: number }> = {
  '07_28': { label: '07–28 DDL (0%)', rate: 0 },
  '30': { label: '30 DDL (3,0%)', rate: 3 },
  '45': { label: '45 DDL (4,5%)', rate: 4.5 },
  '60': { label: '60 DDL (6,0%)', rate: 6 },
  '75': { label: '75 DDL (7,5%)', rate: 7.5 },
  '90': { label: '90 DDL (9,0%)', rate: 9 },
  '120': { label: '120 DDL (12,0%)', rate: 12 },
};

export const BILLING_COMPANY_TAX_PRESETS: Record<
  BillingCompanyId,
  {
    label: string;
    pisPercent: number;
    cofinsPercent: number;
    csllPercent: number;
    irpjPercent: number;
    issPercent: number;
    icmsPercent: number;
    serviceEffectiveRatePercent: number;
    materialEffectiveRatePercent: number;
    industrializationEffectiveRatePercent: number;
  }
> = {
  aguero_inox: {
    label: 'Aguero Inox (Lucro Real)',
    pisPercent: 1.65,
    cofinsPercent: 7.6,
    csllPercent: 9.0,
    irpjPercent: 15.0,
    issPercent: 3.0,
    icmsPercent: 18.0,
    serviceEffectiveRatePercent: 12.25, // Divisor 0,8775
    materialEffectiveRatePercent: 27.25, // Divisor 0,7275
    industrializationEffectiveRatePercent: 9.25, // Divisor 0,9075
  },
  aguero_abc: {
    label: 'Aguero ABC (Presumido)',
    pisPercent: 0.65,
    cofinsPercent: 3.0,
    csllPercent: 2.88,
    irpjPercent: 5.43,
    issPercent: 3.0,
    icmsPercent: 18.0,
    serviceEffectiveRatePercent: 6.65,
    materialEffectiveRatePercent: 21.65,
    industrializationEffectiveRatePercent: 6.65,
  },
  aguero_projetos: {
    label: 'Aguero Projetos (Presumido)',
    pisPercent: 0.65,
    cofinsPercent: 3.0,
    csllPercent: 2.88,
    irpjPercent: 5.43,
    issPercent: 3.0,
    icmsPercent: 18.0,
    serviceEffectiveRatePercent: 6.65,
    materialEffectiveRatePercent: 21.65,
    industrializationEffectiveRatePercent: 6.65,
  },
};

export const DEFAULT_ROLE_RATES: RoleRateTableEntry[] = [
  { id: 'montador', roleName: 'Montador', salario: 5200, beneficios: 1650, encargos: 4280, epis: 391.14, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 59.51, hhVenda: 85.01, useManualHH: true },
  { id: 'encanador', roleName: 'Encanador', salario: 5200, beneficios: 1650, encargos: 4280, epis: 391.14, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 59.51, hhVenda: 85.01, useManualHH: true },
  { id: 'soldador', roleName: 'Soldador', salario: 5300, beneficios: 1650, encargos: 4340, epis: 399.57, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 60.38, hhVenda: 86.25, useManualHH: true },
  { id: 'ajudante', roleName: 'Ajudante', salario: 2950, beneficios: 1200, encargos: 2450, epis: 245.7, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 35.36, hhVenda: 50.51, useManualHH: true },
  { id: 'eletricista', roleName: 'Eletricista', salario: 5300, beneficios: 1650, encargos: 4340, epis: 397.63, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 60.37, hhVenda: 86.24, useManualHH: true },
  { id: 'tec_seguranca', roleName: 'Técnico de Segurança', salario: 4700, beneficios: 1550, encargos: 3890, epis: 378.29, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 54.33, hhVenda: 77.62, useManualHH: true },
  { id: 'supervisor', roleName: 'Supervisor', salario: 6800, beneficios: 1900, encargos: 5600, epis: 392.3, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 75.89, hhVenda: 108.42, useManualHH: true },
  { id: 'almoxarifado', roleName: 'Almoxarifado', salario: 3100, beneficios: 1250, encargos: 2580, epis: 248.69, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 37.08, hhVenda: 52.98, useManualHH: true },
  { id: 'administrativo', roleName: 'Administrativo', salario: 3120, beneficios: 1250, encargos: 2585, epis: 241.11, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 37.17, hhVenda: 53.1, useManualHH: true },
  { id: 'projetista', roleName: 'Projetista', salario: 11500, beneficios: 2400, encargos: 9600, epis: 351.52, horasDia: 8.8, diasMes: 22, margemComercialPercent: 30, hhCusto: 123.2, hhVenda: 176.0, useManualHH: true },
];

export const MACHINERY_CATALOG_PRESETS: Array<{ name: string; unit: MachineryUnit; unitPrice: number }> = [
  { name: 'Caminhão Munck', unit: 'diaria', unitPrice: 3200 },
  { name: 'Guindaste 50 T', unit: 'mes', unitPrice: 200000 },
  { name: 'Tartaruga', unit: 'mes', unitPrice: 3000 },
  { name: 'Plataforma articulada', unit: 'mes', unitPrice: 22000 },
  { name: 'Plataforma pantográfica', unit: 'mes', unitPrice: 15000 },
  { name: 'Plataforma tesoura', unit: 'mes', unitPrice: 17500 },
  { name: 'Compressor de ar', unit: 'mes', unitPrice: 8200 },
  { name: 'Andaimes', unit: 'mes', unitPrice: 5000 },
  { name: 'Talha', unit: 'mes', unitPrice: 3000 },
  { name: 'Empilhadeira elétrica', unit: 'mes', unitPrice: 5000 },
];

export const CATEGORY_WEIGHTS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 200,
};

// ----------------------------------------------------------------------------
// PURE MATH HELPERS
// ----------------------------------------------------------------------------

export function r2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function safeDiv(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < 1e-9) return 0;
  return num / den;
}

/** Calculates HH cost and commercial sell HH from base salary/benefits/charges/EPIs. */
export function computeRoleHH(entry: RoleRateTableEntry): { hhCusto: number; hhVenda: number } {
  if (entry.useManualHH) {
    return { hhCusto: r2(entry.hhCusto), hhVenda: r2(entry.hhVenda) };
  }
  const monthlyHours = Math.max(1, (entry.horasDia || 8.8) * (entry.diasMes || 22));
  const totalMonthly = (entry.salario || 0) + (entry.beneficios || 0) + (entry.encargos || 0) + (entry.epis || 0);
  const hhCusto = r2(totalMonthly / monthlyHours);
  const marginFrac = Math.min(0.85, Math.max(0, (entry.margemComercialPercent || 0) / 100));
  const hhVenda = r2(marginFrac > 0 ? hhCusto / (1 - marginFrac) : hhCusto);
  return { hhCusto, hhVenda };
}

/** Converts duration quantity + unit into calendar days and computes end date. */
export function computeDurationCalendarDays(qty: number, unit: DurationUnit): number {
  const safeQty = Math.max(1, Number(qty) || 1);
  if (unit === 'dias') return Math.round(safeQty);
  if (unit === 'semanas') return Math.round(safeQty * 7);
  return Math.round(safeQty * 30);
}

export function computeEndDateIso(startDateIso: string, qty: number, unit: DurationUnit): string {
  if (!startDateIso) return '';
  const d = new Date(`${startDateIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + computeDurationCalendarDays(qty, unit));
  return d.toISOString().slice(0, 10);
}

/** Sheet weight, area, cost, refaturamento sell, and ICMS credit. */
export function calculateSheetRow(row: SheetMaterialRow) {
  const factor = ALLOY_DENSITIES[row.alloy]?.factor ?? 8.0;
  const qty = Math.max(0, row.quantity || 0);
  const areaOneFace = r2(qty * (row.widthM || 0) * (row.lengthM || 0));
  const unitWeightKg = r2((row.thicknessMm || 0) * (row.widthM || 0) * (row.lengthM || 0) * factor);
  const totalWeightKg = r2(unitWeightKg * qty);
  const totalCost = r2(totalWeightKg * (row.pricePerKg || 0));
  const sellPreTax = r2(totalCost * (1 + (row.refaturamentoPercent || 0) / 100));
  const icmsCredit = r2(totalCost * ((row.icmsCreditPercent || 0) / 100));
  return { areaOneFace, unitWeightKg, totalWeightKg, totalCost, sellPreTax, icmsCredit };
}

/** Bars & tubes calculation. */
export function calculateBarTubeRow(row: BarTubeMaterialRow) {
  const totalWeightKg = r2(Math.max(0, row.quantity || 0) * (row.lengthM || 0) * (row.kgPerMeter || 0));
  const totalCost = r2(totalWeightKg * (row.pricePerKg || 0));
  const sellPreTax = r2(totalCost * (1 + (row.refaturamentoPercent || 0) / 100));
  const icmsCredit = r2(totalCost * ((row.icmsCreditPercent || 0) / 100));
  return { totalWeightKg, totalCost, sellPreTax, icmsCredit };
}

/** Connections & unit items calculation. */
export function calculateConnectionRow(row: ConnectionMaterialRow) {
  const totalCost = r2(Math.max(0, row.quantity || 0) * (row.unitCost || 0));
  const sellPreTax = r2(totalCost * (1 + (row.refaturamentoPercent || 0) / 100));
  const icmsCredit = r2(totalCost * ((row.icmsCreditPercent || 0) / 100));
  return { totalCost, sellPreTax, icmsCredit };
}

/** Painting calculator (ceil gallons with loss + 10% reserve). */
export function calculatePainting(p: PaintingSpec) {
  if (!p.enabled || p.areaM2 <= 0 || p.yieldM2PerGallon <= 0) {
    return { gallons: 0, totalCost: 0, sellPreTax: 0 };
  }
  const rawGallons = (p.areaM2 * Math.max(1, p.coats || 1)) / p.yieldM2PerGallon;
  const withLoss = rawGallons * (1 + (p.lossPercent || 0) / 100);
  const withReserve = withLoss * (1 + (p.reservePercent ?? 10) / 100);
  const gallons = Math.ceil(withReserve);
  const totalCost = r2(gallons * (p.pricePerGallon || 0));
  const sellPreTax = r2(totalCost * (1 + (p.refaturamentoPercent || 0) / 100));
  return { gallons, totalCost, sellPreTax };
}

/** Risk entry calculation (0-100 score and contingency reserve by strategy). */
export function calculateRiskEntry(entry: RiskMatrixEntry) {
  const prob = Math.min(10, Math.max(0, entry.probability || 0));
  const imp = Math.min(10, Math.max(0, entry.impact || 0));
  const scoreInitial = r2(prob * imp);
  const reserveUnmitigated = r2((entry.costAtRisk || 0) * (scoreInitial / 100));

  const resProb = Math.min(10, Math.max(0, entry.residualProbability || 0));
  const resImp = Math.min(10, Math.max(0, entry.residualImpact || 0));
  const scoreResidual = r2(resProb * resImp);
  const actionCost = r2(Math.max(0, entry.actionCost || 0));

  let contingencyReserve = 0;
  if (entry.strategy === 'aceitar') {
    contingencyReserve = reserveUnmitigated;
  } else if (entry.strategy === 'mitigar') {
    contingencyReserve = r2((entry.costAtRisk || 0) * (scoreResidual / 100));
  } else {
    // transferir | evitar
    contingencyReserve = 0;
  }
  const totalRiskImpact = r2(contingencyReserve + actionCost);
  return { scoreInitial, scoreResidual, reserveUnmitigated, contingencyReserve, actionCost, totalRiskImpact };
}

/** Project classification 1..5 using exact spreadsheet weights (10, 20, 30, 40, 200). */
export function calculateProjectCategory1to5(
  criteria: ProjectCategoryCriteria,
  sellingPrice: number,
): {
  valueScore: 1 | 2 | 3 | 4 | 5;
  scoresByCategory: Record<1 | 2 | 3 | 4 | 5, number>;
  finalCategory: 1 | 2 | 3 | 4 | 5;
  requiresDirectorApproval: boolean;
} {
  let autoVal: 1 | 2 | 3 | 4 | 5 = 1;
  if (sellingPrice > 4_000_000) autoVal = 5;
  else if (sellingPrice > 1_000_000) autoVal = 4;
  else if (sellingPrice > 500_000) autoVal = 3;
  else if (sellingPrice > 200_000) autoVal = 2;

  const valueScore = criteria.valueScoreAuto ? autoVal : criteria.manualValueScore;
  const picks: Array<1 | 2 | 3 | 4 | 5> = [
    criteria.clientScore,
    criteria.locationScore,
    criteria.complexityScore,
    valueScore,
  ];
  const scoresByCategory: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const cat of picks) {
    scoresByCategory[cat] += CATEGORY_WEIGHTS[cat];
  }

  let finalCategory: 1 | 2 | 3 | 4 | 5 = 1;
  let best = -1;
  ([1, 2, 3, 4, 5] as const).forEach((cat) => {
    if (scoresByCategory[cat] >= best) {
      best = scoresByCategory[cat];
      finalCategory = cat;
    }
  });

  return {
    valueScore,
    scoresByCategory,
    finalCategory,
    requiresDirectorApproval: finalCategory >= 4,
  };
}

// ----------------------------------------------------------------------------
// FULL BUDGET COMPUTATION (ALL 18 TABS RECONCILED)
// ----------------------------------------------------------------------------

export interface BudgetGroupSummary {
  id: string;
  label: string;
  nature: 'material' | 'servico';
  cost: number;
  sellWithoutTax: number;
  sellWithTax: number;
  marginPercent: number;
  sharePercent: number;
}

export interface AgueroInoxBudgetResult {
  calendarDays: number;
  endDate: string;
  totalHeadcount: number;
  totalLaborHours: number;
  groups: BudgetGroupSummary[];
  totalDirectCost: number;
  adminBase: number;
  totalAdminCost: number;
  totalProjectCost: number;
  icmsCreditTotal: number;
  riskMatrixReserveTotal: number;
  riskActionCostTotal: number;
  contingencyAmount: number;
  /** Subtotal sell before taxes, commercial conditions, and contingency */
  baseSellMaterialsNet: number;
  baseSellServicesNet: number;
  /** Sell before taxes including contingency and commercial conditions */
  sellMaterialsPreTax: number;
  sellServicesPreTax: number;
  totalSellWithoutTax: number;
  /** Tax divisors & tax amounts */
  serviceTaxRate: number;
  materialTaxRate: number;
  serviceDivisor: number;
  materialDivisor: number;
  taxMaterialsAmount: number;
  taxServicesAmount: number;
  totalTaxesAmount: number;
  /** Commercial conditions breakdown (inside calculation) */
  plannedDiscountReserve: number;
  commercialCommissionAmount: number;
  financialCostAmount: number;
  anticipationAmount: number;
  bankInsuranceAmount: number;
  /** Final reconciled prices */
  priceBeforeExtraDiscount: number;
  extraClosingDiscountAmount: number;
  finalSellingPrice: number;
  /** Exact reconciled Price Breakdown (materials + services === finalSellingPrice) */
  breakdownMaterialsGross: number;
  breakdownServicesGross: number;
  /** Viability / DRE (ANALISE tab) */
  netRevenueAfterTax: number;
  variableCostsTotal: number;
  fixedOverheadAmount: number;
  estimatedNetResult: number;
  estimatedNetResultPercent: number;
  minContributionAmount: number;
  maxContributionAmount: number;
  effectiveMarkupMultiplier: number;
  suggestedPriceForTargetProfit: number;
  /** Project Category 1..5 */
  categoryResult: ReturnType<typeof calculateProjectCategory1to5>;
  /** Transport auto-calc */
  transportSummary: {
    vehiclesNeeded: number;
    fuelLiters: number;
    fuelCost: number;
    rentalCost: number;
    totalTransportCost: number;
  };
  /** Warnings (e.g., consumable duplication, negative result, director approval) */
  warnings: string[];
}

export function calculateAgueroInoxBudget(model: AgueroInoxBudgetModel): AgueroInoxBudgetResult {
  const calendarDays = computeDurationCalendarDays(model.durationQty, model.durationUnit);
  const endDate = computeEndDateIso(model.startDate, model.durationQty, model.durationUnit);
  const mult50 = model.overtimeMult50 > 0 ? model.overtimeMult50 : 1.5;
  const mult100 = model.overtimeMult100 > 0 ? model.overtimeMult100 : 2.0;
  const svcMarginFrac = Math.min(0.85, Math.max(0, (model.conditions.defaultServiceMarginPercent || 0) / 100));
  const applySvcMargin = (cost: number) => (svcMarginFrac > 0 ? r2(cost / (1 - svcMarginFrac)) : r2(cost));

  // 1. Execution Phases (Main Labor + Commissioning + Any custom phases)
  let mainLaborCost = 0;
  let mainLaborSell = 0;
  let commissioningCost = 0;
  let commissioningSell = 0;
  let totalHeadcount = 0;
  let totalLaborHours = 0;

  for (const phase of model.phases) {
    for (const row of phase.rows) {
      const eqHours = (row.horasNormais || 0) + mult50 * (row.horasExtras50 || 0) + mult100 * (row.horasExtras100 || 0);
      const q = Math.max(0, row.quantity || 0);
      const cost = r2(q * (row.hhCusto || 0) * eqHours);
      const sell = r2(q * (row.hhVenda || 0) * eqHours);
      totalHeadcount += q;
      totalLaborHours += q * eqHours;
      if (phase.kind === 'comissionamento') {
        commissioningCost = r2(commissioningCost + cost);
        commissioningSell = r2(commissioningSell + sell);
      } else {
        mainLaborCost = r2(mainLaborCost + cost);
        mainLaborSell = r2(mainLaborSell + sell);
      }
    }
  }

  // 2. Personnel Expenses + Transport Calculator
  const pe = model.personnelExpenses;
  const people = pe.useAutoHeadcount ? totalHeadcount : Math.max(0, pe.manualHeadcount || 0);
  const days = Math.max(1, pe.calendarDays || calendarDays);
  const hospCost = pe.includeHospedagem ? r2(people * days * (pe.hospedagemDiaria || 0)) : 0;
  const alimCost = pe.includeAlimentacao ? r2(people * days * (pe.alimentacaoDiaria || 0)) : 0;
  const manutAlojCost = pe.includeManutencaoAloj ? r2(people * days * (pe.manutencaoAlojamentoDiaria || 0)) : 0;
  const folgaCost = r2((pe.folgasQuantidade || 0) * (pe.folgaCampoUnit || 0));
  const extrasPeCost = r2(pe.extras.reduce((s, e) => s + (e.quantity || 0) * (e.unitCost || 0), 0));

  const veh = VEHICLE_PRESETS[pe.transport.vehicleType] || VEHICLE_PRESETS.passeio;
  const vehiclesNeeded = pe.transport.enabled && people > 0 ? Math.max(1, Math.ceil(people / veh.passengers)) : 0;
  const fuelLiters = pe.transport.enabled
    ? r2(safeDiv(vehiclesNeeded * (pe.transport.kmPerDay || 0) * (pe.transport.workDays || 0), veh.kmPerLiter))
    : 0;
  const fuelCost = r2(fuelLiters * (pe.transport.fuelPricePerLiter || 0));
  const rentalCost = pe.transport.enabled ? r2(vehiclesNeeded * (pe.transport.monthsRental || 0) * veh.monthlyRental) : 0;
  const totalTransportCost = r2(fuelCost + rentalCost);

  const personnelTotalCost = r2(hospCost + alimCost + manutAlojCost + folgaCost + extrasPeCost + totalTransportCost);
  const personnelTotalSell = applySvcMargin(personnelTotalCost);

  // 3. Materials (Chapas, Barras/Tubos, Conexões, Pintura, Frete)
  let matCost = 0;
  let matSell = 0;
  let icmsCreditTotal = 0;

  for (const s of model.sheets) {
    const res = calculateSheetRow(s);
    matCost = r2(matCost + res.totalCost);
    matSell = r2(matSell + res.sellPreTax);
    icmsCreditTotal = r2(icmsCreditTotal + res.icmsCredit);
  }
  for (const b of model.barsTubes) {
    const res = calculateBarTubeRow(b);
    matCost = r2(matCost + res.totalCost);
    matSell = r2(matSell + res.sellPreTax);
    icmsCreditTotal = r2(icmsCreditTotal + res.icmsCredit);
  }
  for (const c of model.connections) {
    const res = calculateConnectionRow(c);
    matCost = r2(matCost + res.totalCost);
    matSell = r2(matSell + res.sellPreTax);
    icmsCreditTotal = r2(icmsCreditTotal + res.icmsCredit);
  }
  const paintRes = calculatePainting(model.painting);
  matCost = r2(matCost + paintRes.totalCost);
  matSell = r2(matSell + paintRes.sellPreTax);

  const freightCost = r2(Math.max(0, model.materialsFreightCost || 0));
  const freightSell = r2(freightCost * (1 + (model.materialsFreightRefatPercent || 0) / 100));
  matCost = r2(matCost + freightCost);
  matSell = r2(matSell + freightSell);

  // 4. Consumables (25% on Main Labor SELL or detailed or mixed)
  const consDetailedCost = r2(model.consumables.items.reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0));
  const consPercentCost = r2(mainLaborSell * ((model.consumables.percentOnMainLaborSell || 0) / 100));
  let consumablesCost = 0;
  if (model.consumables.mode === 'percentual') consumablesCost = consPercentCost;
  else if (model.consumables.mode === 'detalhado') consumablesCost = consDetailedCost;
  else consumablesCost = r2(consPercentCost + consDetailedCost);
  const consumablesSell = applySvcMargin(consumablesCost);

  // 5. Machinery
  const machineryCost = r2(
    model.machinery.reduce(
      (s, m) => s + Math.max(0, m.quantity || 0) * Math.max(0, m.duration || 0) * (m.unitPrice || 0) * (m.factor || 1),
      0,
    ),
  );
  const machinerySell = applySvcMargin(machineryCost);

  // 6. Site Infrastructure (Containers automatically add 2 freights: install + removal)
  const siteInfraCost = r2(
    model.siteInfra.reduce((s, item) => {
      const base = Math.max(0, item.quantity || 0) * Math.max(1, item.months || 1) * (item.unitCost || 0);
      const containerFreights = item.isContainer ? Math.max(0, item.quantity || 0) * 2 * (item.freightPerTrip || 0) : 0;
      return s + base + containerFreights;
    }, 0),
  );
  const siteInfraSell = applySvcMargin(siteInfraCost);

  // 7. Mob & Desmob
  const mobDesmobCost = r2(model.mobDesmob.reduce((s, item) => s + Math.max(0, item.quantity || 0) * (item.unitCost || 0), 0));
  const mobDesmobSell = applySvcMargin(mobDesmobCost);

  // 8. Third-Party Services
  const thirdPartyCost = r2(model.thirdParty.reduce((s, item) => s + Math.max(0, item.quantity || 0) * (item.unitCost || 0), 0));
  const thirdPartySell = applySvcMargin(thirdPartyCost);

  // Direct Costs Total
  const totalDirectCost = r2(
    mainLaborCost +
      commissioningCost +
      personnelTotalCost +
      matCost +
      consumablesCost +
      machineryCost +
      siteInfraCost +
      mobDesmobCost +
      thirdPartyCost,
  );

  // 9. Administrative Costs ("Por Dentro" exact formula: Base = CustosAnteriores / (1 - sumAliquotas))
  const admRateSum =
    ((model.adminCosts.adminCentralPercent || 0) +
      (model.adminCosts.gerenciamentoProjetoPercent || 0) +
      (model.adminCosts.ohsGestaoPercent || 0) +
      (model.adminCosts.comissaoAdmPercent || 0)) /
    100;
  const safeAdmRate = Math.min(0.45, Math.max(0, admRateSum));
  const adminBase = safeAdmRate > 0 ? r2(totalDirectCost / (1 - safeAdmRate)) : totalDirectCost;
  const totalAdminCost = r2(adminBase - totalDirectCost);
  const adminSell = applySvcMargin(totalAdminCost);

  const totalProjectCost = r2(totalDirectCost + totalAdminCost);

  // 10. Risk Matrix & Contingency
  let riskMatrixReserveTotal = 0;
  let riskActionCostTotal = 0;
  for (const risk of model.risks) {
    const rr = calculateRiskEntry(risk);
    riskMatrixReserveTotal = r2(riskMatrixReserveTotal + rr.contingencyReserve);
    riskActionCostTotal = r2(riskActionCostTotal + rr.actionCost);
  }
  const baseSellMaterialsNet = r2(matSell);
  const baseSellServicesNet = r2(
    mainLaborSell +
      commissioningSell +
      personnelTotalSell +
      consumablesSell +
      machinerySell +
      siteInfraSell +
      mobDesmobSell +
      thirdPartySell +
      adminSell,
  );
  const baseSellAllNet = r2(baseSellMaterialsNet + baseSellServicesNet);

  let contingencyAmount = 0;
  if (model.contingencyMode === 'percentual') {
    contingencyAmount = r2(baseSellAllNet * ((model.contingencyManualPercent || 0) / 100));
  } else if (model.contingencyMode === 'matriz_riscos') {
    contingencyAmount = r2(riskMatrixReserveTotal + riskActionCostTotal);
  } else {
    // misto: max(percentual, matriz) OR sum clearly controlled without hidden duplication -> sum of manual % + mitigation actions
    contingencyAmount = r2(
      Math.max(baseSellAllNet * ((model.contingencyManualPercent || 0) / 100), riskMatrixReserveTotal) + riskActionCostTotal,
    );
  }

  // 11. Commercial Conditions ("Por Dentro": Discount Reserve + Commission + Financial Term + Anticipation + Bank Bond)
  const cond = model.conditions;
  const baseWithCont = r2(baseSellAllNet + contingencyAmount);
  const discFrac = Math.min(0.4, Math.max(0, (cond.plannedDiscountPercent || 0) / 100));
  const commFrac = Math.min(0.3, Math.max(0, (cond.commercialCommissionPercent || 0) / 100));
  const finFrac = Math.min(0.3, Math.max(0, (cond.financialTermPercent || 0) / 100));
  const antFrac = Math.min(0.2, Math.max(0, (cond.anticipationPercent || 0) / 100));
  const bondFrac = Math.min(0.15, Math.max(0, (cond.bankInsurancePercent || 0) / 100));

  // Sequential inside gross-up matching Section 2.14 simulator
  const afterDisc = discFrac > 0 ? r2(baseWithCont / (1 - discFrac)) : baseWithCont;
  const plannedDiscountReserve = r2(afterDisc - baseWithCont);

  const afterComm = commFrac > 0 ? r2(afterDisc / (1 - commFrac)) : afterDisc;
  const commercialCommissionAmount = r2(afterComm - afterDisc);

  const financialCostAmount = r2(afterComm * finFrac);
  const anticipationAmount = r2((afterComm + financialCostAmount) * antFrac);
  const bankInsuranceAmount = r2(afterComm * bondFrac);

  const totalSellWithoutTax = r2(afterComm + financialCostAmount + anticipationAmount + bankInsuranceAmount);

  // Split proportionally between Materials and Services so Price Breakdown reconciles to the exact cent!
  const matShareOfBase = baseSellAllNet > 0 ? baseSellMaterialsNet / baseSellAllNet : 0;
  const sellMaterialsPreTax = r2(totalSellWithoutTax * matShareOfBase);
  const sellServicesPreTax = r2(totalSellWithoutTax - sellMaterialsPreTax);

  // 12. Tax Engine ("Por Dentro" by Purpose & Company, deducting ICMS credit on Materials)
  const tx = model.taxes;
  let serviceTaxRate = tx.serviceEffectiveRatePercent / 100;
  let materialTaxRate = tx.materialEffectiveRatePercent / 100;
  if (tx.purpose === 'industrializacao') {
    serviceTaxRate = tx.industrializationEffectiveRatePercent / 100;
    materialTaxRate = tx.industrializationEffectiveRatePercent / 100;
  } else if (tx.purpose === 'venda') {
    serviceTaxRate = materialTaxRate;
  } else if (tx.purpose === 'servico') {
    materialTaxRate = serviceTaxRate;
  }
  const serviceDivisor = Math.max(0.3, Math.round((1 - serviceTaxRate) * 10000) / 10000);
  const materialDivisor = Math.max(0.3, Math.round((1 - materialTaxRate) * 10000) / 10000);

  const matNetAfterIcmsCredit = Math.max(0, r2(sellMaterialsPreTax - icmsCreditTotal));
  const grossMaterialsBeforeExtra = sellMaterialsPreTax > 0 ? r2(matNetAfterIcmsCredit / materialDivisor + icmsCreditTotal) : 0;
  const grossServicesBeforeExtra = sellServicesPreTax > 0 ? r2(sellServicesPreTax / serviceDivisor) : 0;

  const taxMaterialsAmount = r2(Math.max(0, grossMaterialsBeforeExtra - sellMaterialsPreTax));
  const taxServicesAmount = r2(Math.max(0, grossServicesBeforeExtra - sellServicesPreTax));
  const totalTaxesAmount = r2(taxMaterialsAmount + taxServicesAmount);

  const priceBeforeExtraDiscount = r2(grossMaterialsBeforeExtra + grossServicesBeforeExtra);

  // Extra Closing Discount (never zeroes out final price when 0%!)
  const extraDiscFrac = Math.min(0.5, Math.max(0, (cond.extraClosingDiscountPercent || 0) / 100));
  const extraClosingDiscountAmount = r2(priceBeforeExtraDiscount * extraDiscFrac);
  const finalSellingPrice = r2(priceBeforeExtraDiscount - extraClosingDiscountAmount);

  // Exact reconciled Price Breakdown (always sums to finalSellingPrice!)
  const breakdownMaterialsGross = r2(grossMaterialsBeforeExtra * (1 - extraDiscFrac));
  const breakdownServicesGross = r2(finalSellingPrice - breakdownMaterialsGross);

  // 13. Viability / DRE (ANALISE tab)
  const netRevenueAfterTax = r2(finalSellingPrice - totalTaxesAmount);
  const variableCostsTotal = r2(
    commercialCommissionAmount + financialCostAmount + anticipationAmount + bankInsuranceAmount + extraClosingDiscountAmount,
  );
  const fixedOverheadAmount = r2(finalSellingPrice * ((cond.fixedOverheadPercent || 0) / 100));
  const estimatedNetResult = r2(netRevenueAfterTax - totalProjectCost - variableCostsTotal - fixedOverheadAmount);
  const estimatedNetResultPercent = finalSellingPrice > 0 ? r2((estimatedNetResult / finalSellingPrice) * 100) : 0;

  const minContributionAmount = r2(netRevenueAfterTax - totalProjectCost - variableCostsTotal - contingencyAmount);
  const maxContributionAmount = r2(netRevenueAfterTax - totalProjectCost - commercialCommissionAmount);
  const effectiveMarkupMultiplier = totalProjectCost > 0 ? r2(finalSellingPrice / totalProjectCost) : 0;

  // Markup price needed to hit Target Net Profit + Fixed Overhead + Average Tax + Variable Rate
  const avgTaxFrac = finalSellingPrice > 0 ? totalTaxesAmount / finalSellingPrice : serviceTaxRate;
  const varRateFrac = finalSellingPrice > 0 ? variableCostsTotal / finalSellingPrice : commFrac + finFrac;
  const fixedFrac = (cond.fixedOverheadPercent || 0) / 100;
  const targetProfitFrac = (cond.targetProfitPercent || 0) / 100;
  const markupDivisor = 1 - avgTaxFrac - varRateFrac - fixedFrac - targetProfitFrac;
  const suggestedPriceForTargetProfit =
    markupDivisor > 0.05 ? r2(totalProjectCost / markupDivisor) : r2(totalProjectCost * 2.5);

  // 14. Project Category 1..5
  const categoryResult = calculateProjectCategory1to5(model.categoryCriteria, finalSellingPrice);

  // 15. Per-Group Summary Table (Aba Geral)
  const rawGroups: Array<{ id: string; label: string; nature: 'material' | 'servico'; cost: number; sellNet: number }> = [
    { id: 'materiais', label: 'Materiais (Chapas, Tubos, Conexões, Pintura)', nature: 'material', cost: matCost, sellNet: matSell },
    { id: 'mao_de_obra', label: 'Mão de Obra Principal', nature: 'servico', cost: mainLaborCost, sellNet: mainLaborSell },
    { id: 'despesas_pessoal', label: 'Despesas com Pessoal & Transporte', nature: 'servico', cost: personnelTotalCost, sellNet: personnelTotalSell },
    { id: 'maquinario', label: 'Maquinário, Movimentação & Ferramental', nature: 'servico', cost: machineryCost, sellNet: machinerySell },
    { id: 'consumiveis', label: 'Consumíveis', nature: 'servico', cost: consumablesCost, sellNet: consumablesSell },
    { id: 'canteiro', label: 'Canteiro de Obra', nature: 'servico', cost: siteInfraCost, sellNet: siteInfraSell },
    { id: 'administrativo', label: 'Custos Administrativos (Por Dentro)', nature: 'servico', cost: totalAdminCost, sellNet: adminSell },
    { id: 'comissionamento', label: 'Equipe de Comissionamento', nature: 'servico', cost: commissioningCost, sellNet: commissioningSell },
    { id: 'terceiros', label: 'Contratação de Terceiros', nature: 'servico', cost: thirdPartyCost, sellNet: thirdPartySell },
    { id: 'mob_desmob', label: 'Mobilização & Desmobilização', nature: 'servico', cost: mobDesmobCost, sellNet: mobDesmobSell },
  ];

  const groups: BudgetGroupSummary[] = rawGroups.map((g) => {
    const div = g.nature === 'material' ? materialDivisor : serviceDivisor;
    const sellWithTax = g.sellNet > 0 ? r2(g.sellNet / div) : 0;
    const marginPercent = g.sellNet > 0 ? r2(((g.sellNet - g.cost) / g.sellNet) * 100) : 0;
    const sharePercent = priceBeforeExtraDiscount > 0 ? r2((sellWithTax / priceBeforeExtraDiscount) * 100) : 0;
    return {
      id: g.id,
      label: g.label,
      nature: g.nature,
      cost: g.cost,
      sellWithoutTax: g.sellNet,
      sellWithTax,
      marginPercent,
      sharePercent,
    };
  });

  // 16. Smart Warnings
  const warnings: string[] = [];
  if (model.consumables.mode === 'misto' && model.consumables.items.length > 0 && model.consumables.percentOnMainLaborSell > 0) {
    warnings.push('Consumíveis no modo Misto: verifique se os itens detalhados não estão duplicando o percentual aplicado sobre a Mão de Obra.');
  }
  if (model.adminCosts.comissaoAdmPercent > 0 && model.conditions.commercialCommissionPercent > 0) {
    warnings.push('Atenção: há Comissão Administrativa e Comissão Comercial preenchidas simultaneamente — confira para evitar dupla cobrança.');
  }
  if (finalSellingPrice > 0 && estimatedNetResult < 0) {
    warnings.push(`Alerta de Viabilidade: resultado líquido projetado negativo (${estimatedNetResultPercent.toFixed(1)}%). Preço sugerido p/ meta de ${cond.targetProfitPercent}%: R$ ${suggestedPriceForTargetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
  }
  if (categoryResult.requiresDirectorApproval) {
    warnings.push(`Projeto enquadrado na Categoria ${categoryResult.finalCategory} — requer validação da Diretoria antes da emissão final.`);
  }

  return {
    calendarDays,
    endDate,
    totalHeadcount,
    totalLaborHours: r2(totalLaborHours),
    groups,
    totalDirectCost,
    adminBase,
    totalAdminCost,
    totalProjectCost,
    icmsCreditTotal,
    riskMatrixReserveTotal,
    riskActionCostTotal,
    contingencyAmount,
    baseSellMaterialsNet,
    baseSellServicesNet,
    sellMaterialsPreTax,
    sellServicesPreTax,
    totalSellWithoutTax,
    serviceTaxRate: r2(serviceTaxRate * 100),
    materialTaxRate: r2(materialTaxRate * 100),
    serviceDivisor,
    materialDivisor,
    taxMaterialsAmount,
    taxServicesAmount,
    totalTaxesAmount,
    plannedDiscountReserve,
    commercialCommissionAmount,
    financialCostAmount,
    anticipationAmount,
    bankInsuranceAmount,
    priceBeforeExtraDiscount,
    extraClosingDiscountAmount,
    finalSellingPrice,
    breakdownMaterialsGross,
    breakdownServicesGross,
    netRevenueAfterTax,
    variableCostsTotal,
    fixedOverheadAmount,
    estimatedNetResult,
    estimatedNetResultPercent,
    minContributionAmount,
    maxContributionAmount,
    effectiveMarkupMultiplier,
    suggestedPriceForTargetProfit,
    categoryResult,
    transportSummary: {
      vehiclesNeeded,
      fuelLiters,
      fuelCost,
      rentalCost,
      totalTransportCost,
    },
    warnings,
  };
}

/** Creates a clean default Aguero Inox Budget Model with sensible defaults from the spreadsheet. */
export function createDefaultAgueroInoxModel(startDateIso = new Date().toISOString().slice(0, 10)): AgueroInoxBudgetModel {
  const preset = BILLING_COMPANY_TAX_PRESETS.aguero_inox;
  return {
    durationQty: 8,
    durationUnit: 'semanas',
    startDate: startDateIso,
    overtimeMult50: 1.5,
    overtimeMult100: 2.0,
    roleRates: DEFAULT_ROLE_RATES.map((r) => ({ ...r })),
    phases: [
      {
        id: 'phase_montagem',
        name: 'Montagem Industrial (Principal)',
        kind: 'principal',
        durationWeeks: 8,
        weeklyHours: 44,
        rows: [
          { id: 'r1', roleId: 'montador', roleName: 'Montador', quantity: 2, horasNormais: 352, horasExtras50: 0, horasExtras100: 0, hhCusto: 59.51, hhVenda: 85.01 },
          { id: 'r2', roleId: 'soldador', roleName: 'Soldador', quantity: 2, horasNormais: 352, horasExtras50: 0, horasExtras100: 0, hhCusto: 60.38, hhVenda: 86.25 },
          { id: 'r3', roleId: 'ajudante', roleName: 'Ajudante', quantity: 2, horasNormais: 352, horasExtras50: 0, horasExtras100: 0, hhCusto: 35.36, hhVenda: 50.51 },
        ],
      },
      {
        id: 'phase_comissionamento',
        name: 'Equipe de Comissionamento',
        kind: 'comissionamento',
        durationWeeks: 2,
        weeklyHours: 44,
        rows: [
          { id: 'rc1', roleId: 'supervisor', roleName: 'Supervisor', quantity: 1, horasNormais: 88, horasExtras50: 0, horasExtras100: 0, hhCusto: 75.89, hhVenda: 108.42 },
          { id: 'rc2', roleId: 'montador', roleName: 'Montador', quantity: 1, horasNormais: 88, horasExtras50: 0, horasExtras100: 0, hhCusto: 59.51, hhVenda: 85.01 },
        ],
      },
    ],
    materialsFreightCost: 0,
    materialsFreightRefatPercent: 20,
    sheets: [],
    barsTubes: [],
    connections: [
      { id: 'mat_mec', description: 'Materiais Mecânicos (tubulações, conexões e suportes)', group: 'mecanico', unit: 'cj', quantity: 1, unitCost: 0, refaturamentoPercent: 30, icmsCreditPercent: 18 },
      { id: 'mat_ele', description: 'Materiais Elétricos e Instrumentação', group: 'eletrico', unit: 'cj', quantity: 1, unitCost: 0, refaturamentoPercent: 15, icmsCreditPercent: 18 },
    ],
    painting: {
      enabled: false,
      areaM2: 0,
      coats: 2,
      yieldM2PerGallon: 35,
      lossPercent: 15,
      reservePercent: 10,
      pricePerGallon: 280,
      refaturamentoPercent: 60,
    },
    personnelExpenses: {
      useAutoHeadcount: true,
      manualHeadcount: 6,
      calendarDays: 56,
      hospedagemDiaria: 200,
      alimentacaoDiaria: 80,
      manutencaoAlojamentoDiaria: 30,
      folgaCampoUnit: 1000,
      folgasQuantidade: 0,
      includeHospedagem: true,
      includeAlimentacao: true,
      includeManutencaoAloj: false,
      transport: {
        enabled: true,
        vehicleType: 'van',
        kmPerDay: 40,
        workDays: 44,
        fuelPricePerLiter: 6.2,
        monthsRental: 2,
      },
      extras: [],
    },
    consumables: {
      mode: 'percentual',
      percentOnMainLaborSell: 25,
      items: [],
    },
    machinery: [],
    siteInfra: [],
    mobDesmob: [
      { id: 'mob_1', phase: 'mobilizacao', description: 'Mobilização inicial de ferramentas e equipe', quantity: 1, unitCost: 0 },
      { id: 'desmob_1', phase: 'desmobilizacao', description: 'Desmobilização e limpeza final de área', quantity: 1, unitCost: 0 },
    ],
    thirdParty: [],
    adminCosts: {
      adminCentralPercent: 1,
      gerenciamentoProjetoPercent: 2,
      ohsGestaoPercent: 0,
      comissaoAdmPercent: 0,
    },
    taxes: {
      company: 'aguero_inox',
      purpose: 'material_servico',
      pisPercent: preset.pisPercent,
      cofinsPercent: preset.cofinsPercent,
      issPercent: preset.issPercent,
      icmsPercent: preset.icmsPercent,
      csllPercent: preset.csllPercent,
      irpjPercent: preset.irpjPercent,
      icmsCreditDefaultPercent: 18,
      serviceEffectiveRatePercent: preset.serviceEffectiveRatePercent,
      materialEffectiveRatePercent: preset.materialEffectiveRatePercent,
      industrializationEffectiveRatePercent: preset.industrializationEffectiveRatePercent,
    },
    conditions: {
      paymentTermCode: '30',
      financialTermPercent: 3,
      anticipationPercent: 3,
      bankInsurancePercent: 0,
      plannedDiscountPercent: 5,
      commercialCommissionPercent: 5,
      extraClosingDiscountPercent: 0,
      fixedOverheadPercent: 23,
      targetProfitPercent: 10,
      defaultServiceMarginPercent: 30,
    },
    categoryCriteria: {
      clientScore: 2,
      locationScore: 2,
      complexityScore: 2,
      valueScoreAuto: true,
      manualValueScore: 2,
    },
    contingencyMode: 'percentual',
    contingencyManualPercent: 5,
    risks: [],
    presentationTemplate: 'padrao',
    actualCostsByGroup: {},
  };
}
