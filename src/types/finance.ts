export type Destino = 'estoque' | 'consumo' | 'despesa';
export type CategoryGroup = 'Custo direto' | 'Custo indireto' | 'Despesa administrativa' | 'Impostos';

export interface FinanceCategory {
  id: string;
  orgId: string;
  nome: string;
  grupo: CategoryGroup;
  ativo: boolean;
}

export interface FinanceRule {
  id?: string;
  orgId: string;
  chave: string; // 'cnpj:<cnpj>' | 'ncm:<ncm>' | 'cnpj_ncm:<cnpj>_<ncm>'
  destino: Destino;
  categoriaId: string;
  centroCustoId?: string;
  itemId?: string;
  updatedAt: string;
}

export interface Rateio { categoriaId: string; centroCustoId?: string; contractId?: string; workOrderId?: string; valor: number }

export interface FinancePayable {
  id: string;
  orgId: string;
  origem: 'nfe' | 'oc' | 'reembolso' | 'manual';
  fornecedor: { cnpj?: string; nome: string };
  documento: string;
  parcela?: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  status: 'aberto' | 'pago' | 'cancelado';
  pagoEm?: string;
  pagoPor?: string;
  /** Valores acumulados pela rota transacional de baixas; títulos antigos começam em zero. */
  valorPago?: number;
  valorAbatido?: number;
  saldoAberto?: number;
  settlementCount?: number;
  lastSettlementId?: string;
  lastSettlementAt?: unknown;
  lastSettlementBy?: string;
  settlementId?: string;
  categoriaId: string;
  centroCustoId?: string;
  contractId?: string;
  workOrderId?: string;
  nfeChave?: string;
  purchaseOrderId?: string;
  purchaseOrderCode?: string;
  receiptId?: string;
  workOrderNumber?: string;
  rateio?: Rateio[];
  createdAt: string;
  createdBy: string;
}

export type FinanceReconciliationCaseStatus = 'aberta' | 'em_analise' | 'aprovada' | 'rejeitada';
export type FinanceReconciliationIssueType =
  | 'divergencia_valor_produtos'
  | 'divergencia_preco_unitario'
  | 'quantidade_faturada_acima'
  | 'quantidade_recebida_sem_nf'
  | 'qualidade_pendente'
  | 'item_sem_vinculo'
  | 'xml_ausente'
  | 'outra';

export interface FinanceReconciliationCaseSnapshot {
  reconciliationStatus: string;
  orderSubtotal: number;
  orderTotal: number;
  invoiceProductsValue: number;
  invoiceTotalValue: number;
  orderValueForInvoicedQuantity: number;
  productValueDelta: number;
  orderedQuantity: number;
  invoicedQuantity: number;
  physicalQuantity: number;
  acceptedQuantity: number;
  stockQuantity: number;
  invoiceNumbers: string[];
  /** NF-e access keys; optional for legacy cases created before payable authorization. */
  invoiceKeys?: string[];
  receiptIds: string[];
  sourceIssues: string[];
}

export interface FinanceReconciliationCase {
  id: string;
  orgId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  supplierName: string;
  supplierCnpj: string;
  workOrderId?: string;
  workOrderNumber?: string;
  issueType: FinanceReconciliationIssueType;
  issueTitle: string;
  description: string;
  evidenceReference?: string;
  snapshot: FinanceReconciliationCaseSnapshot;
  status: FinanceReconciliationCaseStatus;
  createdBy: string;
  createdByName: string;
  createdAt: unknown;
  updatedAt: unknown;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: unknown;
  resolutionNotes?: string;
}

export interface FinancePayableAuthorization {
  id: string;
  orgId: string;
  payableId: string;
  caseId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  nfeChave: string;
  documento: string;
  parcela?: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  authorizedValue: number;
  dueDate: string;
  payableStatusAtAuthorization: 'aberto';
  authorizationStatus: 'registrada';
  issueTitle: string;
  resolutionNotes: string;
  approvedBy: string;
  approvedByName: string;
  approvedAt: unknown;
  authorizedBy: string;
  authorizedByName: string;
  authorizedAt: unknown;
  createdAt: unknown;
}

export type FinancePaymentMethod = 'pix' | 'transferencia' | 'boleto' | 'dinheiro' | 'cartao' | 'outro';
export type FinancePayableAuthorizationDifference = 'valor' | 'vencimento' | 'fornecedor_nome' | 'fornecedor_cnpj';

export interface FinancePayableSettlementRequest {
  orgId: string;
  payableId: string;
  /** Idempotency key for safe retries; every user-confirmed operation gets a new key. */
  idempotencyKey: string;
  paymentDate: string;
  paymentAmount: number;
  discountAmount: number;
  paymentMethod?: FinancePaymentMethod;
  discountReason?: string;
  paymentReference?: string;
  proofReference?: string;
  notes?: string;
  confirmAuthorizationDivergence?: boolean;
}

export interface FinancePayableSettlement {
  id: string;
  orgId: string;
  payableId: string;
  paymentDate: string;
  paymentMethod?: FinancePaymentMethod;
  paymentReference?: string;
  proofReference?: string;
  notes?: string;
  /** Cash actually paid. Optional on legacy single-settlement events. */
  paymentAmount?: number;
  /** Amount removed from the debt as an approved discount/write-off. */
  discountAmount?: number;
  discountReason?: string;
  /** Total reduction of the payable balance (paymentAmount + discountAmount). */
  settledValue: number;
  remainingBefore?: number;
  remainingAfter?: number;
  paymentSequence?: number;
  idempotencyKey?: string;
  authorizationDivergenceConfirmed?: boolean;
  payableStatusAfter?: 'aberto' | 'pago';
  payableSnapshot: {
    origem: FinancePayable['origem'];
    documento: string;
    parcela?: string;
    supplierName: string;
    supplierCnpj: string;
    value: number;
    dueDate: string;
    balanceBefore?: number;
    nfeChave?: string;
    purchaseOrderId?: string;
    purchaseOrderCode?: string;
    workOrderNumber?: string;
  };
  authorizationId?: string;
  authorizationSnapshot?: {
    authorizedValue: number;
    dueDate: string;
    fornecedorNome: string;
    fornecedorCnpj: string;
  };
  authorizationDifferences: FinancePayableAuthorizationDifference[];
  settledBy: string;
  settledByEmail: string;
  settledAt: unknown;
  createdAt: unknown;
}

export interface NfeItem {
  n: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  ean?: string;
  // Parsed since the tax extraction; older docs lack them (code falls back to valorTotal).
  vFrete?: number;
  vSeg?: number;
  vDesc?: number;
  vOutro?: number;
  impostos?: {
    vICMS: number; vICMSST: number; vFCPST?: number; vIPI: number; vIPIDevol?: number; vII?: number; vPIS: number; vCOFINS: number;
    pICMS?: number; pIPI?: number;
  };
  custoTotal?: number;
}

export type NfeStatus = 'resumo' | 'aguardando_classificacao' | 'classificando' | 'classificada' | 'erro_classificacao';

export interface NfeDocument {
  id: string;
  orgId: string;
  chave: string;
  numero?: string;
  serie?: string;
  emitidaEm: string;
  emitente: { cnpj: string; nome: string };
  destinatario?: { cnpj: string; nome: string };
  valorTotal: number;
  valorProdutos?: number;
  valorFrete?: number;
  valorIcms?: number;
  valorIpi?: number;
  valorDesconto?: number;
  valorSeguro?: number;
  valorOutros?: number;
  valorSt?: number;
  valorPis?: number;
  valorCofins?: number;
  itens?: NfeItem[];
  duplicatas?: { numero: string; vencimento: string; valor: number }[];
  status: NfeStatus;
  source?: 'upload' | 'sefaz';
  recebidaEm?: string;
  updatedAt?: string;
  erroClassificacao?: string;
  classificacao?: { runId?: string; by?: string; startedAt?: { toMillis(): number }; lines?: ClassifyLine[]; at?: string; byName?: string; purchaseOrderId?: string; purchaseOrderCode?: string; receiptId?: string; stockControlledByReceipt?: boolean };
}

export interface ClassifyLine {
  n: number;
  destino: Destino;
  categoriaId: string;
  centroCustoId?: string;
  contractId?: string;
  workOrderId?: string;
  itemId?: string;
  unitId?: string;
}
