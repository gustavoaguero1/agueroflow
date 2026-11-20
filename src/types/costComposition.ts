// ============================================================================
// AGUEROFLOW — COMPOSIÇÃO DE CUSTOS E FORMAÇÃO DE PREÇOS (ORÇAÁGIL)
// Complete Industrial Cost Engineering Specification — 18 Sheets Architecture
// ============================================================================

export type SheetTabId =
  | 'geral'
  | 'custos'
  | 'mao_de_obra'
  | 'equipe_comissionamento'
  | 'despesas_pessoal'
  | 'contratacao_terceiros'
  | 'materiais'
  | 'consumiveis'
  | 'maquinario'
  | 'canteiro_obra'
  | 'mob_desmob'
  | 'custos_administrativos'
  | 'analise'
  | 'impostos'
  | 'custo_financeiro'
  | 'categoria'
  | 'contingencias'
  | 'tetrapak';

export type CostCategory =
  | 'mao_de_obra'
  | 'comissionamento'
  | 'despesas_pessoal'
  | 'materiais'
  | 'consumiveis'
  | 'equipamentos'
  | 'terceiros'
  | 'canteiro_infra'
  | 'mob_desmob'
  | 'custos_indiretos_adm';

export type ValueStatus = 'confirmado' | 'historico' | 'estimado' | 'pendente';
export type CompositionStatus = 'rascunho' | 'em_analise' | 'aprovada' | 'congelada' | 'rejeitada';
export type ProjectComplexityClass = 'CLASSE_A' | 'CLASSE_B' | 'CLASSE_C' | 'CLASSE_D';

// ----------------------------------------------------------------------------
// ABA 1: GERAL (DADOS BÁSICOS, CABEÇALHO E RESUMO EXECUTIVO)
// ----------------------------------------------------------------------------
export interface GeneralProjectHeader {
  code: string; // e.g. "PROP-2026-001" / "COMP-2026-001"
  revision: number;
  title: string;
  proposalId?: string;
  proposalCode?: string;
  clientId: string;
  clientName: string;
  clientCnpj?: string;
  clientContactPerson?: string;
  clientEmail?: string;
  clientPhone?: string;
  billingCompanyName: string;
  billingCompanyCnpj?: string;
  projectName: string;
  executionLocation: string;
  unitOrPlant?: string;
  workOrderId?: string;
  projectCategory: 'montagem_industrial' | 'fabricacao_equipamentos' | 'tubulacao_sanitaria' | 'manutencao_parada' | 'comissionamento' | 'especial';
  serviceType: string;
  responsibleName: string;
  elaborationDate: string;
  executionTimeframeDays: number;
  estimatedStartDate?: string;
  estimatedEndDate?: string;
  paymentTerms: string;
  proposalValidityDays: number;
  notes?: string;
  status: CompositionStatus;
  templateId?: string;
}

// ----------------------------------------------------------------------------
// ABA 2: CUSTOS (CUSTOS OPERACIONAIS DA EMPRESA, HORA-HOMEM, DEPRECIAÇÃO, PINTURA, ENERGIA)
// ----------------------------------------------------------------------------
export interface OperationalCostLine {
  id: string;
  code?: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  costType: 'hora_homem' | 'depreciacao' | 'energia' | 'pintura_superficie' | 'manutencao_maquinas' | 'consumiveis_operacionais' | 'outros';
  notes?: string;
}

export interface OperationalCostsSheet {
  averageHourlyCostRef: number; // R$/h médio
  depreciationMonthly: number; // Depreciação de máquinas e ferramental (R$/mês)
  energyMonthlyCost: number; // Energia elétrica / gerador (R$/mês)
  paintingSurfaceRatePerM2: number; // Taxa de tratamento superficial / pintura (R$/m²)
  maintenanceRatePercent: number; // % sobre equipamentos para manutenção
  lines: OperationalCostLine[];
  subtotal: number;
}

// ----------------------------------------------------------------------------
// ABA 3: MÃO DE OBRA (EQUIPES, FUNÇÕES, SALÁRIOS, ENCARGOS, BENEFÍCIOS, H. EXTRAS)
// ----------------------------------------------------------------------------
export interface LaborRoleItem {
  id: string;
  roleName: string;
  quantity: number;
  baseSalary: number; // Salário base mensal
  hourlyRate: number; // R$/hora base (salário / 176 ou 220)
  regularHours: number; // Horas normais estimadas por profissional
  overtimeHours50: number; // Horas extras 50%
  overtimeHours100: number; // Horas extras 100% (domingos e feriados)
  dangerPayPercent: number; // Adicional de periculosidade (30%)
  unhealthyPayPercent: number; // Adicional de insalubridade (20% ou 40%)
  nightShiftHours: number; // Horas com adicional noturno (20%)
  socialChargesPercent: number; // Encargos sociais e previdenciários (ex: 72.5%)
  benefitsDailyOrMonthly: number; // Benefícios (VT, VR, cesta, assistência, seguro)
  totalCost: number;
  sellRateHourly?: number; // Preço hora de venda ao cliente
  sellTotal?: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 4: EQUIPE COMISSIONAMENTO (COMISSIONAMENTO, START-UP, TESTES, ASSEPSIA)
// ----------------------------------------------------------------------------
export interface CommissioningMemberItem {
  id: string;
  roleName: string; // e.g. "Engenheiro de Comissionamento", "Técnico de Validação Sanitária"
  quantity: number;
  unitPeriod: 'dias' | 'horas' | 'visitas';
  periodQuantity: number;
  unitRateCost: number;
  testEquipmentCost: number; // Boroscópio, medidor de rugosidade Ra, bomba hidrostática
  totalCost: number;
  sellDailyRate?: number;
  sellTotal?: number;
  deliverables?: string; // e.g. "Emissão de Data Book e Laudo de Rugosidade"
}

// ----------------------------------------------------------------------------
// ABA 5: DESPESAS COM PESSOAL (HOSPEDAGEM, ALIMENTAÇÃO, TRANSPORTE, VEÍCULOS, EPI, FOLGAS)
// ----------------------------------------------------------------------------
export interface PersonnelExpenseItem {
  id: string;
  category: 'hospedagem' | 'alimentacao' | 'veiculos_combustivel' | 'epi_uniformes' | 'rotatividade_folgas' | 'passagens' | 'outros';
  description: string;
  unit: string; // diária, refeição, mês, kit, viagem
  quantity: number;
  unitCost: number;
  totalCost: number;
  peopleCount?: number;
  daysCount?: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 6: CONTRATAÇÃO DE TERCEIROS (SERVIÇOS EXTERNOS, ENSAIOS, LAUDOS, TRATAMENTO TÉRMICO)
// ----------------------------------------------------------------------------
export interface ThirdPartyServiceItem {
  id: string;
  supplierName: string;
  serviceDescription: string;
  serviceType: 'ensaios_end' | 'isolamento_termico' | 'tratamento_termico' | 'calibracao_psv' | 'usinagem_externa' | 'locacao_especial' | 'outros';
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  markupPercent?: number;
  sellPrice?: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 7: MATERIAIS (INTEGRADO AO ORÇAÁGIL — CHAPAS, TUBOS, CONEXÕES, VÁLVULAS)
// ----------------------------------------------------------------------------
export interface CostCompositionItem {
  id: string;
  category: CostCategory;
  subCategory?: string;
  code?: string;
  description: string;
  technicalSpecs?: {
    materialGrade?: string; // AISI 304, AISI 316L
    dimension?: string; // 2", OD 63.5mm
    scheduleClass?: string; // SCH 10, SCH 40
    connectionType?: string; // Tri-Clamp, Solda BW, SMS
    standardNorm?: string; // ASTM A270, DIN 11850
  };
  unit: string;
  quantity: number;
  productivityHours?: number;
  unitCost: number;
  totalCost: number;
  supplierOrSource?: string;
  sourceDate?: string;
  valueStatus: ValueStatus;
  notes?: string;
  refaturadoAoCliente?: boolean;
  markupPercent?: number;
  sellUnitPrice?: number;
  sellTotalPrice?: number;
}

// ----------------------------------------------------------------------------
// ABA 8: CONSUMÍVEIS (GASES, DISCOS, ABRASIVOS, VARETAS, FITAS, PASTAS DECAPANTES)
// ----------------------------------------------------------------------------
export interface ConsumableItem {
  id: string;
  description: string;
  consumableType: 'gases_solda_purga' | 'varetas_arames' | 'discos_abrasivos' | 'decapantes_passivantes' | 'eletrico_auxiliar' | 'outros';
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  refaturadoAoCliente: boolean;
  sellPrice?: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 9: MAQUINÁRIO (EQUIPAMENTOS, LOCAÇÃO, PERÍODOS, COMBUSTÍVEL, MANUTENÇÃO)
// ----------------------------------------------------------------------------
export interface MachineryEquipmentItem {
  id: string;
  equipmentName: string;
  ownership: 'proprio' | 'locado';
  supplierOrLocadora?: string;
  quantity: number;
  periodUnit: 'horas' | 'dias' | 'meses';
  periodQuantity: number;
  rentalRate: number; // Custo de locação por período
  operatingFuelCost: number; // Combustível / energia do equipamento
  freightDeliveryCost: number; // Frete entrega/retirada
  maintenanceCost: number; // Manutenção alocada
  totalCost: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 10: CANTEIRO DE OBRA (CONTAINERS, INSTALAÇÕES, INFRAESTRUTURA, LIMPEZA, DESPESAS)
// ----------------------------------------------------------------------------
export interface SiteInfrastructureItem {
  id: string;
  itemType: 'container_almoxarifado' | 'container_escritorio' | 'sanitarios_vestiario' | 'instalacao_eletrica_provisoria' | 'agua_esgoto' | 'limpeza_residuos' | 'outros';
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  periodMonths: number;
  totalCost: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 11: MOB&DESMOB (MOBILIZAÇÃO E DESMOBILIZAÇÃO SEM ERROS DE FÓRMULA J12/J27)
// ----------------------------------------------------------------------------
export interface MobDesmobItem {
  id: string;
  type: 'frete_equipamento_munck' | 'transporte_equipe_passagens' | 'exames_aso_nr35_nr33' | 'seguro_transporte_carga' | 'desmobilizacao_retorno';
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplierOrCarrier?: string;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 12: CUSTOS ADMINISTRATIVOS (ENGENHEIRO RESIDENTE, SST DEDICADO, RATEIO MATRIZ)
// ----------------------------------------------------------------------------
export interface AdministrativeCostsItem {
  id: string;
  roleOrExpense: string; // e.g. "Engenheiro Coordenador Residente", "Técnico de Segurança SST", "ART / RRT"
  expenseType: 'equipe_gestao' | 'seguranca_sst' | 'taxas_art_documentacao' | 'rateio_administracao_central' | 'outros';
  unit: string;
  quantity: number;
  unitCost: number;
  periodMonths: number;
  totalCost: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 13: ANALISE (DRE DO PROJETO, RECONCILIAÇÃO BDI DIVISOR VS MULTIPLICADOR, BREAK-EVEN)
// ----------------------------------------------------------------------------
export interface PriceFormationMemory {
  totalDirectCosts: number; // Materiais + MO + Comissionamento + Despesas + Equipamentos + Terceiros + Canteiro + MobDesmob + Consumíveis
  totalIndirectCosts: number; // Administração central, SST, gestão de obra
  baseCostSubtotal: number; // Custo Direto + Custo Indireto
  riskContingencyAmount: number; // Contingência monetária de risco
  subtotalWithContingency: number; // Custo Base + Contingência
  financialCostAmount: number; // Custo financeiro / capital de giro em R$
  commercialCommissionAmount: number; // Comissão de vendas em R$
  taxesTotalAmount: number; // Tributos totais faturamento (PIS, COFINS, ISS, etc.)
  netProfitAmount: number; // Lucro líquido projetado em R$
  effectiveNetMarginPercent: number; // Margem líquida % sobre preço de venda
  effectiveGrossMarginPercent: number; // Margem bruta % (Preço - Custo Direto) / Preço
  bdiCalculatedPercent: number; // BDI equivalente aplicado
  suggestedSellingPrice: number; // Preço Final Sugerido de Venda
  breakEvenPrice: number; // Preço de equilíbrio (lucro zero)
  costPerManHour?: number; // Custo médio apurado por hora-homem
}

// ----------------------------------------------------------------------------
// ABA 14: IMPOSTOS (REGIME TRIBUTÁRIO, PIS, COFINS, ISS, ICMS, CSLL/IRPJ, GROSS-UP)
// ----------------------------------------------------------------------------
export interface TaxConfiguration {
  regime: 'lucro_presumido' | 'lucro_real' | 'simples_nacional';
  companyBillingUnit: string; // Aguero Inox Ltda
  originCity: string;
  destinationCity: string;
  pisPercent: number; // e.g. 0.65% ou 1.65%
  cofinsPercent: number; // e.g. 3.00% ou 7.60%
  issPercent: number; // e.g. 2.00% a 5.00%
  icmsPercent: number; // e.g. 0.00% ou 12.0% ou 18.0%
  csllIrpjPercent: number; // e.g. 2.88% (Presumido)
  otherTaxesPercent: number;
  totalTaxOnRevenuePercent: number; // Soma total dos tributos sobre faturamento
  applyTaxesInside: boolean; // Cálculo "por dentro"
  notes?: string;
}

// ----------------------------------------------------------------------------
// ABA 15: CUSTO FINANCEIRO (PRAZOS PMR/PMP, ANTECIPAÇÃO, SEGUROS, CARTA-FIANÇA)
// ----------------------------------------------------------------------------
export interface FinancialAndCommercialSettings {
  paymentTermsDays: number; // Prazo médio de recebimento (dias)
  supplierTermsDays: number; // Prazo médio de pagamento a fornecedores
  monthlyWorkingCapitalRate: number; // Taxa mensal capital de giro/antecipação (e.g. 1.85%)
  financialCostPercent: number; // Custo financeiro calculado
  bankGuaranteeOrBondPercent: number; // Carta fiança ou seguro garantia (e.g. 1.2%)
  centralAdminFeePercent: number; // Taxa de administração central / overhead (e.g. 4.5%)
  commercialCommissionPercent: number; // Comissão de vendas (e.g. 2.5%)
  targetNetMarginPercent: number; // Margem líquida desejada (e.g. 15.0%)
  pricingMethod: 'bdi_divisor' | 'markup_multiplicador';
}

// ----------------------------------------------------------------------------
// ABA 16: CATEGORIA (MATRIZ DETERMINÍSTICA DE PONTUAÇÃO E ENQUADRAMENTO SEM #N/A)
// ----------------------------------------------------------------------------
export interface ProjectClassificationCriteria {
  clientType: 'cliente_estrategico' | 'cliente_recorrente' | 'cliente_novo' | 'cliente_risco';
  geographicLocation: 'local_regiao_metropolitana' | 'interior_sp' | 'outro_estado_sudeste' | 'regiao_remota_norte_nordeste';
  technicalComplexity: 'tubulacao_sanitaria_farmaceutica' | 'redes_processo_alimentos' | 'tubulacao_utilidades_vapor' | 'caldeiraria_padrao';
  executionRegimen: 'turno_normal_diurno' | 'turno_estendido' | 'parada_fabril_24x7' | 'espaco_confinado_altura';
  estimatedBudgetBracket: 'ate_100k' | '100k_a_500k' | '500k_a_2m' | 'acima_2m';
  customWeights?: Record<string, number>;
}

export interface ProjectClassificationResult {
  totalScore: number; // 0 - 100
  classificationClass: ProjectComplexityClass;
  title: string;
  description: string;
  recommendedMinMarginPercent: number;
  recommendedContingencyPercent: number;
  recommendedProposalValidityDays: number;
  scoreBreakdown: Array<{
    dimension: string;
    value: string;
    points: number;
    maxPoints: number;
  }>;
}

// ----------------------------------------------------------------------------
// ABA 17: CONTINGÊNCIAS (IDENTIFICAÇÃO DE RISCOS, MATRIZ 5X5, PROVISÃO TÉCNICA)
// ----------------------------------------------------------------------------
export interface CostRiskItem {
  id: string;
  description: string;
  rootCause: string;
  potentialEffect: string;
  category: 'escopo_tecnico' | 'prazo_cronograma' | 'seguranca_sst' | 'fornecedor_material' | 'cliente_acesso' | 'clima_externo';
  probability: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  score: number; // Probability * Impact (1 - 25)
  riskLevel: 'baixo' | 'medio' | 'alto' | 'critico';
  responseStrategy: 'mitigar' | 'aceitar' | 'transferir' | 'evitar';
  actionPlan: string;
  responsible: string;
  mitigationCost: number;
  contingencyProvisionPercent: number;
  contingencyAmount: number;
}

// ----------------------------------------------------------------------------
// ABA 18: TETRAPAK (MODELO ESPECÍFICO UNIFICADO PIPE RACK, TUBULAÇÃO, COMISSIONAMENTO)
// ----------------------------------------------------------------------------
export interface TetrapakModelGroup {
  id: string;
  groupName: 'pipe_rack_estrutural' | 'tubulacao_sanitaria' | 'equipe_suporte_campo' | 'comissionamento_startup' | 'infraestrutura_canteiro' | 'materiais_insumos' | 'despesas_viagens';
  title: string;
  items: CostCompositionItem[];
  subtotalCost: number;
}

export interface TetrapakSheetData {
  projectName: string;
  plantLocation: string;
  groups: TetrapakModelGroup[];
  totalComponentsCalculated: number; // R$ 639.096,43 real reconciliado
  displayedSellingTotal: number;
  reconciliationNotes: string;
}

// ----------------------------------------------------------------------------
// SIMULAÇÃO DE CENÁRIOS COMERCIAIS
// ----------------------------------------------------------------------------
export interface PricingScenario {
  id: string;
  name: string;
  description: string;
  marginPercent: number;
  contingencyPercent: number;
  discountOnMaterialsPercent: number;
  sellingPrice: number;
  netMarginAmount: number;
  netMarginPercent: number;
  competitivenessLevel: 'agressivo' | 'equilibrado' | 'conservador';
}

// ----------------------------------------------------------------------------
// MODELO DE COMPOSIÇÃO REUTILIZÁVEL (TEMPLATE)
// ----------------------------------------------------------------------------
export interface CostCompositionTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  isStandard: boolean;
  defaultCategories: CostCategory[];
  defaultItems: Array<Omit<CostCompositionItem, 'id'>>;
  defaultSettings?: Partial<FinancialAndCommercialSettings>;
  defaultTaxes?: Partial<TaxConfiguration>;
}

// ----------------------------------------------------------------------------
// COMPOSIÇÃO DE CUSTOS COMPLETA (DOCUMENTO MESTRE COM AS 18 ABAS)
// ----------------------------------------------------------------------------
export interface CostComposition {
  id: string;
  organizationId: string;

  // Aba 1: Geral
  code: string;
  revision: number;
  title: string;
  proposalId?: string;
  proposalCode?: string;
  clientId: string;
  clientName: string;
  clientCnpj?: string;
  clientContactPerson?: string;
  clientEmail?: string;
  clientPhone?: string;
  billingCompanyName: string;
  billingCompanyCnpj?: string;
  projectName: string;
  executionLocation: string;
  unitOrPlant?: string;
  workOrderId?: string;
  projectCategory: 'montagem_industrial' | 'fabricacao_equipamentos' | 'tubulacao_sanitaria' | 'manutencao_parada' | 'comissionamento' | 'especial';
  serviceType: string;
  responsibleName: string;
  elaborationDate: string;
  executionTimeframeDays: number;
  estimatedStartDate?: string;
  estimatedEndDate?: string;
  paymentTerms: string;
  proposalValidityDays: number;
  notes?: string;
  status: CompositionStatus;
  templateId?: string;

  // Aba 2: Custos Operacionais
  operationalCosts: OperationalCostsSheet;

  // Aba 3: Mão de Obra
  laborRoles: LaborRoleItem[];

  // Aba 4: Equipe Comissionamento
  commissioningMembers: CommissioningMemberItem[];

  // Aba 5: Despesas com Pessoal
  personnelExpenses: PersonnelExpenseItem[];

  // Aba 6: Contratação de Terceiros
  thirdPartyServices: ThirdPartyServiceItem[];

  // Aba 7: Materiais (Catálogo OrçaÁgil)
  items: CostCompositionItem[];

  // Aba 8: Consumíveis
  consumables: ConsumableItem[];

  // Aba 9: Maquinário
  machinery: MachineryEquipmentItem[];

  // Aba 10: Canteiro de Obra
  siteInfrastructure: SiteInfrastructureItem[];

  // Aba 11: Mob&Desmob
  mobDesmob: MobDesmobItem[];

  // Aba 12: Custos Administrativos
  adminCosts: AdministrativeCostsItem[];

  // Aba 13: ANALISE (DRE & Memória Reconciliada)
  priceFormation: PriceFormationMemory;

  // Aba 14: Impostos
  taxConfig: TaxConfiguration;

  // Aba 15: Custo Financeiro
  financialSettings: FinancialAndCommercialSettings;

  // Aba 16: Categoria (Classificação do Projeto)
  classificationCriteria: ProjectClassificationCriteria;
  classificationResult?: ProjectClassificationResult;

  // Aba 17: Contingências (Riscos)
  risks: CostRiskItem[];

  // Aba 18: TETRAPAK (Estrutura Específica Reconciliada)
  tetrapakData?: TetrapakSheetData;

  // Simulação de Cenários
  scenarios: PricingScenario[];

  // Auditoria e Histórico
  createdBy: string;
  createdByName: string;
  updatedBy?: string;
  updatedByName?: string;
  approvedBy?: string;
  approvedAt?: string;
  history: Array<{
    date: string;
    action: string;
    userName: string;
    details?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
