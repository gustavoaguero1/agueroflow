import type { FinanceReceivable, FinanceReceivableReceiptRequest } from '../types/finance';

const cleanPart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 80);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (value: number) => cents(value) / 100;

export function financeReceivableReceiptId(orgId: string, receivableId: string, idempotencyKey: string): string {
  return ['recr', cleanPart(orgId), cleanPart(receivableId), cleanPart(idempotencyKey)].join('_');
}

export function financeReceivableBalance(receivable: Pick<FinanceReceivable, 'valor' | 'valorRecebido'>): number {
  return Math.max(0, cents(receivable.valor) - cents(receivable.valorRecebido ?? 0)) / 100;
}

export function isValidReceivableDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateFinanceReceivableReceiptRequest(input: FinanceReceivableReceiptRequest): string | null {
  if (!input.orgId?.trim() || !input.receivableId?.trim() || input.receivableId.includes('/')) return 'Empresa ou conta a receber inválida.';
  if (typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.idempotencyKey)) return 'Identificador da operação inválido. Reabra o recebimento e tente novamente.';
  if (!isValidReceivableDate(input.receiptDate)) return 'Informe uma data de recebimento válida.';
  if (!Number.isFinite(input.receiptAmount) || input.receiptAmount <= 0 || Math.abs(input.receiptAmount * 100 - cents(input.receiptAmount)) > 0.0001) return 'Informe um valor recebido maior que zero, com até duas casas decimais.';
  if (typeof input.paymentMethod !== 'string' || !['pix', 'transferencia', 'boleto', 'dinheiro', 'cartao', 'outro'].includes(input.paymentMethod)) return 'Selecione uma forma de recebimento válida.';
  for (const [field, limit, message] of [
    ['paymentReference', 200, 'A referência da transação deve ter no máximo 200 caracteres.'],
    ['proofReference', 1000, 'A referência do comprovante deve ter no máximo 1.000 caracteres.'],
    ['notes', 1000, 'As observações devem ter no máximo 1.000 caracteres.'],
  ] as const) {
    const value = input[field];
    if (typeof value !== 'undefined' && (typeof value !== 'string' || value.trim().length > limit)) return message;
  }
  return null;
}

export function validateFinanceReceivableReceiptEligibility(
  receivable: FinanceReceivable,
  orgId: string,
  request: FinanceReceivableReceiptRequest,
): string | null {
  if (!orgId || receivable.orgId !== orgId || request.orgId !== orgId) return 'A conta a receber não pertence à empresa selecionada.';
  if (receivable.status !== 'aberto') return 'Somente contas a receber em aberto podem receber baixa.';
  if (!(receivable.valor > 0) || !Number.isFinite(receivable.valor)) return 'O valor original da conta a receber é inválido.';
  if (cents(receivable.valorRecebido ?? 0) > cents(receivable.valor)) return 'O histórico acumulado desta conta está inconsistente. Solicite conferência antes de continuar.';
  if (!receivable.cliente?.nome?.trim() || !receivable.documento?.trim() || !isValidReceivableDate(receivable.vencimento)) return 'A conta a receber não possui cliente, documento ou vencimento válido.';
  const balance = financeReceivableBalance(receivable);
  if (balance <= 0) return 'Esta conta não possui saldo em aberto.';
  if (cents(request.receiptAmount) > cents(balance)) return 'O recebimento ultrapassa o saldo em aberto. Registre apenas o valor efetivamente recebido.';
  return null;
}

export function receivableReceiptRequestMatches(existing: Record<string, unknown>, request: FinanceReceivableReceiptRequest): boolean {
  return existing.orgId === request.orgId
    && existing.receivableId === request.receivableId
    && existing.idempotencyKey === request.idempotencyKey
    && existing.receiptDate === request.receiptDate
    && cents(Number(existing.receiptAmount ?? 0)) === cents(request.receiptAmount)
    && existing.paymentMethod === request.paymentMethod
    && (existing.paymentReference ?? '') === (request.paymentReference ?? '')
    && (existing.proofReference ?? '') === (request.proofReference ?? '')
    && (existing.notes ?? '') === (request.notes ?? '');
}

export const normalizeReceivableMoney = money;
