export type CommercialItemMatchClassification =
  | 'EXATO'
  | 'COMPARAVEL'
  | 'EQUIVALENTE_TECNICO'
  | 'NAO_ENCONTRADO';

export type PriceSourceType =
  | 'codigo_interno_exato'
  | 'codigo_fabricante_exato'
  | 'cotacao_confirmada'
  | 'compra_historica'
  | 'item_comparavel'
  | 'equivalente_tecnico'
  | 'manual';

export type CommercialProposalStatus =
  | 'rascunho'
  | 'parcial'
  | 'aguardando_revisao'
  | 'aprovada'
  | 'finalizada'
  | 'rejeitada'
  // Estágio comercial junto ao cliente (funil de vendas)
  | 'enviada'
  | 'negociacao'
  | 'ganha'
  | 'perdida';

export interface CommercialClient {
  id: string;
  organizationId: string;
  name: string;
  tradeName?: string;
  cnpjCpf: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  zipCode?: string;
  segment?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommercialMaterial {
  id: string;
  organizationId: string;
  internalCode: string;
  manufacturerCode?: string;
  brand?: string;
  originalDescription: string;
  normalizedDescription: string;
  technicalSpecs: {
    materialGrade?: string; // e.g., AISI 304, AISI 316L, A106 Gr B
    dimension?: string; // e.g., 2", DN50, OD 60.3mm
    scheduleClass?: string; // e.g., SCH 10, SCH 40, 150#, 300#
    connectionType?: string; // e.g., Flangeado, Roscado NPT, Solda BW, Tri-Clamp
    standardNorm?: string; // e.g., ANSI B16.5, ASTM A312, DIN 11851
    finish?: string; // e.g., Polido, Decapado, Sanitário
    notes?: string;
  };
  unit: string; // m, un, pç, kg, barra
  packaging?: string;
  baseCost: number; // strictly confidential internal cost
  currency: string; // BRL, USD, EUR
  supplierName?: string;
  sourceType: PriceSourceType;
  quoteDate: string; // YYYY-MM-DD
  validityDays: number; // e.g., 15, 30, 60 days
  category: string; // Tubulações, Válvulas, Conexões, Instrumentação, Fixação
  freightCost?: number;
  taxCost?: number;
  sourceDocumentRef?: string;
  importedBy?: string;
  /** Vínculo explícito (confirmado por revisão humana) com o catálogo mestre `items`. */
  masterItemId?: string | null;
  masterItemSku?: string | null;
  masterItemName?: string | null;
  masterLinkStatus?: 'unlinked' | 'linked' | 'rejected';
  masterLinkConfirmedBy?: string;
  masterLinkConfirmedAt?: string;
  masterLinkNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommercialProposalItem {
  id: string;
  proposalId: string;
  organizationId: string;
  itemNumber: number;
  originalLineNumber?: number;

  // BOM Original Input Data
  inputCode?: string;
  inputManufacturerCode?: string;
  inputBrand?: string;
  inputDescription: string;
  inputSpecs?: string;
  inputUnit: string;
  inputQuantity: number;

  // Matching & Price Resolution (INTERNAL)
  matchClassification: CommercialItemMatchClassification;
  matchedMaterialId?: string;
  matchedInternalCode?: string;
  matchedManufacturerCode?: string;
  matchedDescription?: string;
  priceSourceType?: PriceSourceType;
  priceSourceDate?: string;
  priceSourceDocument?: string;
  supplierName?: string; // Internal confidential
  isPriceExpired?: boolean;

  // Technical Differences / Explanations
  technicalDifferencesExplanation?: string;

  // Substitution tracking
  isSubstituted?: boolean;
  substitutionOriginalMaterialId?: string;
  substitutionJustification?: string;
  substitutedBy?: string;
  substitutionApprovedBy?: string;

  // Pricing & Deterministic Calculation (INTERNAL)
  baseCost: number; // R$ 0 if not found, excluded from calculations
  freightComponent: number;
  taxComponent: number;
  markupPercent: number; // Authorized markup on cost (e.g. 25%)

  // Client Facing Unit & Total Price
  // Proposed Price = BaseCost * (1 + markup/100) + freight + tax
  proposedUnitPrice: number;
  proposedTotalPrice: number;

  // Status & Pending Tracking
  isPending: boolean;
  pendingReason?: string;
  status: 'ok' | 'pendente_cotacao' | 'pendente_aprovacao' | 'substituido';

  notes?: string;
}

export interface CommercialProposal {
  id: string;
  organizationId: string;
  projectId?: string;
  contractId?: string;
  unitId?: string;
  code: string; // e.g., PROP-2026-001
  title: string;

  // Client Information
  clientId: string;
  clientName: string;
  clientCnpjCpf: string;
  clientContactPerson?: string;
  clientEmail?: string;
  clientPhone?: string;

  // Commercial Terms (Client-Facing)
  currency: string;
  issueDate: string;
  validityDate: string; // Data de validade da proposta
  deliveryLocation: string; // Local de entrega
  deliveryTimeframeDays: number; // Prazo de entrega em dias
  paymentTerms: string; // e.g., "30/60 dias", "À vista 5% desc"
  warrantyTerms: string; // e.g., "12 meses contra defeitos de fabricação"
  scopeDescription: string;

  // Financial Totals (Internal vs Client)
  totalItemsCount: number;
  pricedItemsCount: number;
  pendingItemsCount: number;

  // Confidential Internal Financials
  totalBaseCost: number; // Soma dos custos dos itens precificados
  globalMarkupPercent: number; // Markup autorizado geral
  totalFreightCost: number;
  totalTaxCost: number;
  grossMarginAmount: number; // proposedTotal - totalBaseCost
  grossMarginPercent: number; // (grossMargin / proposedTotal) * 100

  // Client-Facing Proposal Total
  proposedTotal: number;

  // Lifecycle & Human Approvals
  status: CommercialProposalStatus;
  isPartial: boolean; // True if there are unpriced items
  partialExportAuthorized?: boolean;
  partialExportAuthorizedBy?: string;

  createdBy: string;
  createdByName?: string;
  reviewedBy?: string;
  approvedBy?: string;
  rejectionReason?: string;
  approvalDate?: string;

  // Funil de vendas
  probabilidade?: number; // 0-100
  previsaoFechamento?: string;
  motivoPerda?: string;
  workOrderId?: string;
  workOrderCode?: string;
  projectCode?: string;
  costCenterId?: string;
  approvedBaselineSnapshot?: import('./project').ProjectBudgetBaseline;
  statusHistory?: Array<{ status: CommercialProposalStatus; at: string; by: string }>;

  history: Array<{
    date: string;
    action: string;
    userName: string;
    details?: string;
  }>;

  createdAt: string;
  updatedAt: string;
}

export interface CommercialPolicy {
  id: string;
  organizationId: string;
  defaultMarkupPercent: number; // e.g., 25%
  minMarkupPercent: number; // e.g., 15%
  maxMarkupPercent: number; // e.g., 50%
  categoryMarkups: Record<string, number>; // Category name -> default markup %
  quoteValidityDaysByCategory: Record<string, number>; // Category -> validity days (e.g., Inox: 15, Válvulas: 30)
  requireReviewForMarginBelowPercent?: number; // e.g., 20%
  allowedCurrencies: string[]; // ['BRL', 'USD', 'EUR']
  engineeringParams?: import('../services/agueroInoxPricingEngine').CommercialEngineeringParams;
  updatedAt: string;
  updatedBy: string;
}

export type ImportActionDecision = 'CRIAR_NOVO' | 'ATUALIZAR_PRECO' | 'IGNORAR_DUPLICADO';

export interface ImportItemDiff {
  id: string;
  lineNumber: number;
  incomingCode?: string;
  incomingManufacturerCode?: string;
  incomingBrand?: string;
  incomingDescription: string;
  incomingSpecs?: string;
  incomingUnit: string;
  incomingQuantity: number;
  incomingCost: number; // Preço unitário vindo da planilha
  incomingCategory?: string;
  incomingSupplier?: string;
  incomingValidityDays?: number;

  // Comparison against current catalog
  matchStatus: 'NOVO' | 'ATUALIZAR_PRECO' | 'IDENTICO' | 'CONFLITO_CODIGO';
  matchedMaterialId?: string;
  matchedInternalCode?: string;
  matchedDescription?: string;
  existingBaseCost?: number;
  existingSupplier?: string;
  existingQuoteDate?: string;
  existingValidityDays?: number;
  priceDiffAmount?: number; // incomingCost - existingBaseCost
  priceDiffPercent?: number; // ((incomingCost - existingBaseCost) / existingBaseCost) * 100

  // User decision in comparison UI
  action: ImportActionDecision;
  isSelected: boolean;
}

export interface MaterialPreviousSnapshot {
  materialId: string;
  internalCode: string;
  description: string;
  previousBaseCost: number;
  newBaseCost: number;
  previousSupplierName?: string;
  previousQuoteDate?: string;
  previousValidityDays?: number;
}

export interface ImportedItemAuditRecord {
  internalCode: string;
  description: string;
  unit: string;
  baseCost: number;
  category?: string;
  supplierName?: string;
  materialId?: string;
  actionTaken: 'criado' | 'atualizado' | 'ignorado';
}

export interface CommercialImportBatch {
  id: string;
  organizationId: string;
  batchCode: string;
  fileName: string;
  sourceType: 'BOM_PROPOSTA' | 'CATALOGO_PRECOS' | 'COTACAO_FORNECEDOR' | 'COTACAO_IMAGEM';
  importedBy: string;
  importedByName: string;
  createdAt: string;
  totalRowsRead: number;
  acceptedRows: number;
  duplicateRows: number;
  incompleteRows: number;
  rejectedRows: number;
  status: 'processado' | 'revertido' | 'pendente_revisao' | 'erro';
  rejectionReasons?: string[];
  proposalId?: string; // If attached to a specific proposal

  // Rollback and audit tracking
  createdMaterialIds?: string[];
  updatedMaterialsSnapshots?: MaterialPreviousSnapshot[];
  importedItemsSnapshot?: ImportedItemAuditRecord[];
  isReverted?: boolean;
  revertedAt?: string;
  revertedBy?: string;
  revertedByName?: string;
}

export type PriceComparisonStatus = 'cheaper' | 'more_expensive' | 'identical' | 'new';

export interface ExtractedQuoteItem {
  id: string;
  internalCode?: string;
  manufacturerCode?: string;
  brand?: string;
  description: string;
  normalizedDescription?: string;
  specs?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  category: string;
  materialGrade?: string;
  dimension?: string;
  scheduleClass?: string;
  connectionType?: string;
  standardNorm?: string;
  flags?: string[]; // e.g., ["Preço unitário ausente", "Item duplicado no catálogo"]
  duplicateMatchId?: string; // id of existing material in catalog if matched
  isDuplicate?: boolean;

  // Active Catalog Comparison Fields
  comparisonStatus?: PriceComparisonStatus;
  existingBaseCost?: number; // Preço atual no catálogo
  priceVariationDelta?: number; // unitPrice - existingBaseCost (em R$)
  priceVariationPercent?: number; // ((unitPrice - existingBaseCost) / existingBaseCost) * 100
  totalPotentialSaving?: number; // (existingBaseCost - unitPrice) * quantity (se for mais barato)
  matchedMaterialName?: string;
  matchedInternalCode?: string;
  existingSupplier?: string;
  existingQuoteDate?: string;
  existingValidityDays?: number;
}

export interface ExtractedSupplierQuote {
  supplierName: string;
  quoteDate: string;
  validityDays: number;
  quoteNumber?: string;
  currency: string;
  notes?: string;
  fileName: string;
  filePreviewUrl?: string;
  fileType?: string;
  items: ExtractedQuoteItem[];

  // Comparative Intelligence Summary Metrics
  matchedItemsCount?: number;
  unmatchedNewCount?: number;
  cheaperItemsCount?: number;
  moreExpensiveCount?: number;
  identicalItemsCount?: number;
  totalQuotedAmount?: number;
  totalCatalogBaselineAmount?: number;
  netFinancialDelta?: number;
  netFinancialDeltaPercent?: number;
  totalPotentialSavings?: number;
}


