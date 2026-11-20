export interface RhEmployee {
  id: string;
  orgId: string;
  codigoObra?: string; // Código da Obra onde o funcionário está alocado (Coluna Q, ex: 198)
  registrationNumber: string; // Alias para compatibilidade (mantém o valor do código da obra)
  name: string; // Nome do funcionário
  admissionDate: string; // YYYY-MM-DD
  dismissalDate?: string | null; // YYYY-MM-DD
  active: boolean;
  department: string; // Setor / Departamento
  role: string; // Cargo / Função
  companyName: string; // Empresa (ex: Aguero Inox, etc.)
  unitId?: string | null; // Vínculo com unidade
  contractId?: string | null; // Vínculo com contrato
  hourlyRateCarteira: number; // Valor Hora Carteira (CLT oficial)
  hourlyRatePorFora: number; // Valor Hora Por Fora (complementar)
  monthlyHours: number; // Padrão 220h (configurável)
  baseSalaryCarteira: number; // Valor total Carteira = hourlyRateCarteira * monthlyHours
  baseSalaryPorFora: number; // Valor total Por Fora = hourlyRatePorFora * monthlyHours
  dependentsCount?: number; // Para cálculo de deduções fiscais
  porForaEligible?: boolean; // Se o colaborador tem autorização para verba complementar
  notes?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RhInssBracket {
  minSalary: number;
  maxSalary: number;
  rate: number; // 0.075, 0.09, 0.12, 0.14
  deductionLimit?: number;
}

export interface RhDivergence {
  field: string;
  label: string;
  importedValue: number;
  calculatedValue: number;
  diff: number;
}

export interface RhThirteenthCalculation {
  id: string;
  orgId: string;
  runId: string; // Identificador da rodada de cálculo
  referenceYear: number; // Ex: 2025
  employeeId: string;
  employeeName: string;
  codigoObra?: string; // Código da Obra onde o colaborador está alocado (Coluna Q)
  registrationNumber: string; // Alias
  companyName: string;
  unitId?: string | null;
  contractId?: string | null;
  admissionDate: string;
  monthsWorked: number; // Qnt MÊS (Avos de direito: 0 a 12)
  monthlyHours: number; // 220h padrão

  // Valores Base
  hourlyRateCarteira: number;
  hourlyRatePorFora: number;
  baseSalaryCarteira: number; // Base mensal em folha
  baseSalaryPorFora: number; // Base mensal complementar
  baseSalaryTotal: number;

  // 13º Salário Integral Proporcional aos Avos
  thirteenthFullCarteira: number; // (Base Carteira / 12) * Avos
  thirteenthFullPorFora: number; // (Base Por Fora / 12) * Avos
  thirteenthFullCombined: number;

  // 1ª Parcela (Adiantamento - 50% sem desconto de INSS)
  firstInstallmentCarteira: number; // 50% do 13º CLT
  firstInstallmentPorFora: number; // 50% da verba complementar
  firstInstallmentTotal: number;

  // 2ª Parcela (Quitação final com descontos oficiais)
  secondInstallmentGrossCarteira: number; // 50% restante CLT
  inssDeductionCarteira: number; // Desconto oficial de INSS sobre base integral
  inssEffectiveRate?: number; // Alíquota efetiva percentual
  otherDeductionsCarteira: number; // Descontos adicionais informados
  secondInstallmentNetCarteira: number; // 2ª Parcela Líquida Carteira = Bruto - INSS - Descontos

  secondInstallmentPorFora: number; // 50% complementar restante
  secondInstallmentTotalNet: number; // 2ª Parcela Líquida Carteira + Por Fora

  // Totais Finais
  totalThirteenthCarteiraNet: number; // 1ª Parcela Carteira + 2ª Parcela Líquida Carteira
  totalThirteenthCombinedNet: number; // Total recebido incluindo verba complementar confirmada

  // Dados importados da planilha para fins de conferência / auditoria (se houver)
  importedReference?: {
    importedMonths?: number;
    importedBaseCarteira?: number;
    importedBasePorFora?: number;
    importedFirstInstallmentCarteira?: number;
    importedFirstInstallmentPorFora?: number;
    importedFirstInstallmentTotal?: number;
    importedSecondInstallmentCarteira?: number;
    importedSecondInstallmentPorFora?: number;
    importedSecondInstallmentDiscounts?: number;
    importedSecondInstallmentTotal?: number;
  };

  divergences?: RhDivergence[];
  hasDivergence: boolean;

  // Ajustes manuais com justificativa obrigatória
  manualAdjustment?: {
    adjustedBy: string;
    adjustedAt: string;
    originalAmount: number;
    adjustedAmount: number;
    reason: string;
  };

  porForaConfirmed: boolean; // Confirmação explícita de elegibilidade da verba complementar
  status: 'rascunho' | 'conferido' | 'aprovado' | 'divergente' | 'ajustado';
  notes?: string;
  isDemo?: boolean;
  calculatedAt: string;
  updatedAt: string;
}

export interface RhCalculationBatch {
  id: string;
  orgId: string;
  referenceYear: number;
  title: string;
  totalEmployees: number;
  totalGrossCarteira: number;
  totalInssDeduction: number;
  totalNetCarteira: number;
  totalPorFora: number;
  totalCombined: number;
  divergentCount: number;
  approvedCount: number;
  status: 'rascunho' | 'em_conferencia' | 'aprovado' | 'arquivado';
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface RhImportBatch {
  id: string;
  orgId: string;
  fileName: string;
  fileSize?: number;
  importMode: 'with_values' | 'cadastral_only';
  actionTaken: 'create_only' | 'update_existing' | 'preview_only';
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  duplicateRows: number;
  ignoredRows: number;
  warningsCount: number;
  divergenceCount: number;
  status: 'concluido' | 'com_erros' | 'cancelado' | 'processando';
  errorLog?: string[];
  importedBy: string;
  importedByName?: string;
  importedAt: string;
  isDemo?: boolean;
}

export interface RhPayrollPolicy {
  orgId: string;
  defaultMonthlyHours: number; // 220
  inssTableYear: number; // 2025
  allowComplementaryPorFora: boolean;
  requireSupervisorApproval: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface RhSpreadsheetRowData {
  rowNumber: number;
  nome: string; // Col A
  valorHoraCarteira: number; // Col B
  valorHoraPorFora: number; // Col C
  admissao: string; // Col D
  qntMes: number; // Col E
  valorTotalCarteira: number; // Col F
  valorTotalPorFora: number; // Col G
  carteira1aParcela: number; // Col H
  porFora1aParcela: number; // Col I
  carteira2aParcela: number; // Col J
  porFora2aParcela: number; // Col K
  total1aParcela: number; // Col L
  descontos2aParcela: number; // Col M
  total2aParcela: number; // Col N
  empresa: string; // Col O
  colunaP_auxiliar?: string; // Col P (não atribuir valor financeiro)
  codigoObra: string; // Col Q (Código da Obra onde o colaborador está alocado)
  codigoMatricula: string; // Alias para compatibilidade
  isValid: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  hasReferenceValues: boolean;
}
