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
  categoriaId: string;
  centroCustoId?: string;
  contractId?: string;
  workOrderId?: string;
  nfeChave?: string;
  purchaseOrderId?: string;
  rateio?: Rateio[];
  createdAt: string;
  createdBy: string;
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
  classificacao?: { runId?: string; by?: string; startedAt?: { toMillis(): number }; lines?: ClassifyLine[]; at?: string; byName?: string; purchaseOrderId?: string };
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
