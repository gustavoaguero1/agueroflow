/**
 * AgueroFlow — Módulo de Compras & Gestão de Suprimentos (Purchasing)
 * Tipagem oficial para compradores, requisições, mapa de cotação e ordens de compra
 */

export type PurchasingSubSection =
  | 'compras-painel'
  | 'compras-requisicoes'
  | 'compras-cotacoes'
  | 'compras-tomada-precos'
  | 'compras-pedidos'
  | 'compras-historico'
  | 'compras-inteligencia'
  | 'compras-fornecedores'
  | 'compras-recebimento';

export type RequisitionUrgency = 'baixa' | 'normal' | 'alta' | 'urgente_parada_obra';

export type RequisitionStatus =
  | 'pendente'
  | 'em_cotacao'
  | 'cotada'
  | 'pedido_gerado'
  | 'cancelada';

export interface PurchaseRequisitionItem {
  id: string;
  code?: string;
  description: string;
  specs?: string;
  unit: string;
  quantity: number;
  estimatedCost?: number;
  currentStock?: number;
  notes?: string;
}

export interface PurchaseRequisition {
  id: string;
  organizationId: string;
  code: string; // Ex: RC-2026-001
  title: string;
  requestedBy: string;
  requestedByName: string;
  department: 'Obras & Montagem' | 'Caldeiraria & Fábrica' | 'Estoque & Manutenção' | 'Comercial & Propostas';
  costCenter?: string;
  urgency: RequisitionUrgency;
  neededByDate: string;
  items: PurchaseRequisitionItem[];
  status: RequisitionStatus;
  linkedWorkOrderId?: string;
  linkedProposalId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierBidItemPrice {
  itemId: string;
  unitPrice: number;
  totalPrice: number;
  brand?: string;
  deliveryDays?: number;
  notes?: string;
}

export interface SupplierBid {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCnpj?: string;
  contactName?: string;
  quoteNumber?: string;
  quoteDate: string;
  validityDays: number;
  freightType: 'CIF' | 'FOB';
  freightCost: number;
  paymentTerms: string; // Ex: '28 DDL', '30 DDL', '14/28 DDL', 'À Vista'
  deliveryDays: number;
  itemsPrices: SupplierBidItemPrice[];
  totalValue: number;
  isWinner?: boolean;
  notes?: string;
  attachmentName?: string;
}

export interface PurchaseQuotationMap {
  id: string;
  organizationId: string;
  code: string; // Ex: MAP-2026-001
  title: string;
  requisitionId?: string;
  requisitionCode?: string;
  items: PurchaseRequisitionItem[];
  bids: SupplierBid[];
  winningSupplierId?: string;
  winningSupplierName?: string;
  winningJustification?: string;
  status: 'aberto' | 'em_analise' | 'homologado' | 'cancelado';
  buyerName: string;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseOrderStatus =
  | 'emitida'
  | 'confirmada_fornecedor'
  | 'em_transito'
  | 'recebida_parcial'
  | 'recebida_total'
  | 'cancelada';

export interface PurchaseOrderItem {
  id: string;
  itemNumber: number;
  internalCode?: string;
  manufacturerCode?: string;
  brand?: string;
  description: string;
  specs?: string;
  unit: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitPrice: number;
  totalPrice: number;
  heatNumber?: string; // Número de Corrida Metalúrgica
  materialCertificateRef?: string;
}

export interface PurchaseOrder {
  id: string;
  organizationId: string;
  code: string; // Ex: OC-2026-0042
  requisitionCode?: string;
  quotationMapCode?: string;
  supplierId: string;
  supplierName: string;
  supplierCnpj: string;
  supplierContact?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  buyerId: string;
  buyerName: string;
  emissionDate: string;
  expectedDeliveryDate: string;
  deliveryLocation: string;
  billingAddress: string;
  paymentTerms: string;
  freightType: 'CIF' | 'FOB';
  freightValue: number;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxValue: number;
  totalValue: number;
  status: PurchaseOrderStatus;
  carrierName?: string;
  trackingCode?: string;
  invoiceNumber?: string; // NF-e de entrada
  receiptDate?: string;
  inspectionNotes?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchasingSupplier {
  id: string;
  organizationId: string;
  name: string;
  tradeName?: string;
  cnpj: string;
  stateRegistration?: string;
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  address?: string;
  categories: string[];
  rating: number; // 1 to 5
  isCertifiedIso: boolean;
  status: 'homologado' | 'em_avaliacao' | 'bloqueado';
  notes?: string;
  createdAt: string;
}

export interface MaterialReceiptRecord {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  supplierName: string;
  invoiceNumber: string; // NF-e
  invoiceKey?: string;
  receiptDate: string;
  receivedBy: string;
  receivedByName: string;
  itemsReceived: {
    itemId: string;
    description: string;
    quantityReceived: number;
    unit: string;
    heatNumber?: string; // Corrida de usina
    isConform: boolean;
    nonConformityNotes?: string;
  }[];
  certificatePdfAttached?: boolean;
  notes?: string;
  status: 'conforme' | 'conforme_com_ressalva' | 'rejeitado';
  createdAt: string;
}

export interface MarketPriceBenchmarkItem {
  id: string;
  materialName: string;
  category: string;
  unit: string;
  averagePaidPrice: number;
  currentMarketPrice: number;
  priceDeltaPercent: number; // e.g. -9.8% (paid less than market = saving)
  trend: 'alta' | 'estavel' | 'queda';
  lastUpdated: string;
  sourceNotes?: string;
}

export interface MonthlySavingsReport {
  month: string;
  totalMonthlySpend: number;
  estimatedMarketSpend: number;
  totalSavingsAmount: number;
  savingsPercentage: number;
  topSavedItems: MarketPriceBenchmarkItem[];
  aiMarketAnalysisSummary: string;
  /** true when values are reference fallbacks, not real market/ERP data. */
  isEstimate?: boolean;
  commodityIndices: {
    nickelLmeUsdTon: number;
    dollarPtaxBrl: number;
    stainlessSurchargeTrend: string;
  };
}
