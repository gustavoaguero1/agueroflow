import type {
  FinancePayable,
  FinancePayableAuthorization,
  FinancePayableAuthorizationDifference,
  FinancePayableSettlementRequest,
  FinancePaymentMethod,
} from '../types/finance';

export const FINANCE_PAYMENT_METHODS: FinancePaymentMethod[] = ['pix', 'transferencia', 'boleto', 'dinheiro', 'cartao', 'outro'];
const cleanPart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 90);
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizedName = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (value: number) => cents(value) / 100;

export function financePayableSettlementId(orgId: string, payableId: string, idempotencyKey?: string): string {
  const base = 'pays_' + cleanPart(orgId) + '_' + cleanPart(payableId);
  // No key preserves the original Etapa 2.7 id so legacy events can be detected and displayed.
  return idempotencyKey ? base + '_' + cleanPart(idempotencyKey) : base;
}

export function financePayableBalance(payable: Pick<FinancePayable, 'valor' | 'valorPago' | 'valorAbatido'>): number {
  return Math.max(0, cents(payable.valor) - cents(payable.valorPago ?? 0) - cents(payable.valorAbatido ?? 0)) / 100;
}

export function isValidPaymentDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getFinancePayableAuthorizationDifferences(
  payable: FinancePayable,
  authorization?: FinancePayableAuthorization,
): FinancePayableAuthorizationDifference[] {
  if (!authorization) return [];
  const differences: FinancePayableAuthorizationDifference[] = [];
  if (cents(Number(payable.valor)) !== cents(Number(authorization.authorizedValue))) differences.push('valor');
  if (payable.vencimento !== authorization.dueDate) differences.push('vencimento');
  if (normalizedName(payable.fornecedor?.nome) !== normalizedName(authorization.fornecedorNome)) differences.push('fornecedor_nome');
  if (digits(payable.fornecedor?.cnpj) !== digits(authorization.fornecedorCnpj)) differences.push('fornecedor_cnpj');
  return differences;
}

export function validateFinancePayableSettlementRequest(input: FinancePayableSettlementRequest): string | null {
  if (!input.orgId?.trim() || !input.payableId?.trim() || input.payableId.includes('/')) return 'Empresa ou título inválido.';
  if (typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.idempotencyKey)) return 'Identificador da operação inválido. Reabra a baixa e tente novamente.';
  if (!isValidPaymentDate(input.paymentDate)) return 'Informe uma data de pagamento válida.';
  if (!Number.isFinite(input.paymentAmount) || input.paymentAmount < 0 || Math.abs(input.paymentAmount * 100 - cents(input.paymentAmount)) > 0.0001) return 'Informe um valor de pagamento válido, com até duas casas decimais.';
  if (!Number.isFinite(input.discountAmount) || input.discountAmount < 0 || Math.abs(input.discountAmount * 100 - cents(input.discountAmount)) > 0.0001) return 'Informe um abatimento válido, com até duas casas decimais.';
  if (cents(input.paymentAmount) + cents(input.discountAmount) <= 0) return 'Informe um pagamento ou abatimento maior que zero.';
  if (input.paymentAmount > 0 && (!input.paymentMethod || !FINANCE_PAYMENT_METHODS.includes(input.paymentMethod))) return 'Selecione uma forma de pagamento válida.';
  if (input.paymentAmount === 0 && input.paymentMethod) return 'Não informe forma de pagamento quando o lançamento for somente abatimento.';
  if (input.discountAmount > 0 && (typeof input.discountReason !== 'string' || input.discountReason.trim().length < 5 || input.discountReason.trim().length > 500)) return 'Informe uma justificativa de abatimento com pelo menos 5 caracteres.';
  if (input.discountAmount === 0 && typeof input.discountReason !== 'undefined' && (typeof input.discountReason !== 'string' || input.discountReason.trim().length > 500)) return 'A justificativa deve ter no máximo 500 caracteres.';
  if (typeof input.paymentReference !== 'undefined' && (typeof input.paymentReference !== 'string' || input.paymentReference.trim().length > 200)) return 'A referência da transação deve ter no máximo 200 caracteres.';
  if (typeof input.proofReference !== 'undefined' && (typeof input.proofReference !== 'string' || input.proofReference.trim().length > 1000)) return 'A referência do comprovante deve ter no máximo 1.000 caracteres.';
  if (typeof input.notes !== 'undefined' && (typeof input.notes !== 'string' || input.notes.trim().length > 1000)) return 'As observações devem ter no máximo 1.000 caracteres.';
  if (typeof input.confirmAuthorizationDivergence !== 'undefined' && typeof input.confirmAuthorizationDivergence !== 'boolean') return 'Confirmação de divergência inválida.';
  return null;
}

export function validateFinancePayableSettlementEligibility(
  payable: FinancePayable, orgId: string, request: FinancePayableSettlementRequest, authorization?: FinancePayableAuthorization,
): string | null {
  if (!orgId || payable.orgId !== orgId || request.orgId !== orgId) return 'O título não pertence à empresa selecionada.';
  if (payable.status !== 'aberto') return 'Somente títulos em aberto podem receber baixa.';
  if (!(payable.valor > 0) || !Number.isFinite(payable.valor)) return 'O valor original do título é inválido.';
  if (cents((payable.valorPago ?? 0) + (payable.valorAbatido ?? 0)) > cents(payable.valor)) return 'O histórico acumulado deste título está inconsistente. Solicite conferência antes de continuar.';
  if (!payable.fornecedor?.nome?.trim() || !payable.vencimento) return 'O título não possui fornecedor ou vencimento válido.';
  if (authorization && (authorization.orgId !== orgId || authorization.payableId !== payable.id)) return 'A autorização vinculada não corresponde a este título.';
  const balance = financePayableBalance(payable);
  if (balance <= 0) return 'Este título não possui saldo em aberto.';
  if (cents(request.paymentAmount) + cents(request.discountAmount) > cents(balance)) return 'Pagamento mais abatimento ultrapassam o saldo em aberto do título.';
  if (getFinancePayableAuthorizationDifferences(payable, authorization).length && request.confirmAuthorizationDivergence !== true) {
    return 'A autorização vinculada diverge dos dados atuais do título. Confira as alterações e confirme antes da baixa.';
  }
  return null;
}

export function settlementRequestMatches(existing: Record<string, unknown>, request: FinancePayableSettlementRequest): boolean {
  const sameAmount = (a: unknown, b: number) => cents(Number(a ?? 0)) === cents(b);
  return existing.orgId === request.orgId
    && existing.payableId === request.payableId
    && existing.idempotencyKey === request.idempotencyKey
    && existing.paymentDate === request.paymentDate
    && sameAmount(existing.paymentAmount, request.paymentAmount)
    && sameAmount(existing.discountAmount, request.discountAmount)
    && (existing.paymentMethod ?? '') === (request.paymentMethod ?? '')
    && (existing.discountReason ?? '') === (request.discountReason ?? '')
    && (existing.paymentReference ?? '') === (request.paymentReference ?? '')
    && (existing.proofReference ?? '') === (request.proofReference ?? '')
    && (existing.notes ?? '') === (request.notes ?? '')
    && Boolean(existing.authorizationDivergenceConfirmed) === Boolean(request.confirmAuthorizationDivergence);
}
