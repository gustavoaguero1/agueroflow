import type { RecurringOrder } from '../types/index.ts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const cleanKey = (v: string) => String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');

export type RecurringOrderLifecycleStatus = 'ativa' | 'pausada' | 'cancelada' | 'encerrada';

export interface RecurringOrderConfig extends RecurringOrder {
  projectId?: string;
  contractId?: string;
  costCenterId?: string;
  checklistTemplateId?: string;
  lifecycleStatus?: RecurringOrderLifecycleStatus;
  exceptionDates?: string[];
  skipWeekends?: boolean;
  lastRunDate?: string;
  lastRunOrderId?: string;
  lastRunError?: string;
  lastRunFailedAt?: string;
}

export interface RecurringOrderRunRecord {
  id: string;
  orgId: string;
  recurringOrderId: string;
  periodDate: string;
  status: 'generated' | 'failed';
  workOrderId?: string;
  workOrderNumber?: string;
  nextRunDateAfter?: string;
  errorMessage?: string;
  triggeredByUid: string;
  triggeredByName: string;
  createdAt: string;
}

/** Deterministic idempotency key per (org, recurring plan, scheduled period). */
export function recurringRunId(orgId: string, recurringOrderId: string, periodDate: string): string {
  return `recrun_${cleanKey(orgId)}_${cleanKey(recurringOrderId)}_${cleanKey(periodDate)}`;
}

function parseUtcDate(dateStr: string): Date {
  if (!ISO_DATE_RE.test(dateStr)) {
    throw new Error(`Data inválida para recorrência: "${dateStr}". Use YYYY-MM-DD.`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Advances a recurring schedule date according to frequency, then skips any configured
 * holiday/exception dates (and optionally weekends) without ever stalling.
 */
export function advanceRecurringRunDate(
  currentDate: string,
  frequency: RecurringOrder['frequency'],
  options?: { exceptionDates?: readonly string[]; skipWeekends?: boolean },
): string {
  const dt = parseUtcDate(currentDate);
  switch (frequency) {
    case 'diaria':
      dt.setUTCDate(dt.getUTCDate() + 1);
      break;
    case 'semanal':
      dt.setUTCDate(dt.getUTCDate() + 7);
      break;
    case 'quinzenal':
      dt.setUTCDate(dt.getUTCDate() + 15);
      break;
    case 'mensal':
      dt.setUTCMonth(dt.getUTCMonth() + 1);
      break;
    case 'trimestral':
      dt.setUTCMonth(dt.getUTCMonth() + 3);
      break;
    case 'semestral':
      dt.setUTCMonth(dt.getUTCMonth() + 6);
      break;
    case 'anual':
      dt.setUTCFullYear(dt.getUTCFullYear() + 1);
      break;
    default:
      throw new Error(`Periodicidade inválida: ${String(frequency)}`);
  }

  const exceptions = new Set((options?.exceptionDates || []).map((d) => String(d || '').trim()).filter(Boolean));
  const skipWeekends = options?.skipWeekends === true;

  for (let guard = 0; guard < 31; guard += 1) {
    const candidate = formatUtcDate(dt);
    const blocked = exceptions.has(candidate) || (skipWeekends && isWeekendUtc(dt));
    if (!blocked) return candidate;
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return formatUtcDate(dt);
}

export function canExecuteRecurringOrder(rec: Pick<RecurringOrderConfig, 'active' | 'lifecycleStatus' | 'unitId' | 'nextRunDate'>): {
  allowed: boolean;
  reason?: string;
} {
  const lifecycle = rec.lifecycleStatus || (rec.active ? 'ativa' : 'pausada');
  if (lifecycle !== 'ativa') {
    return { allowed: false, reason: `Plano recorrente não está ativo (status: ${lifecycle}).` };
  }
  const unitId = String(rec.unitId || '').trim();
  if (!unitId || unitId === 'default_unit') {
    return { allowed: false, reason: 'Plano recorrente precisa de uma unidade operacional válida (default_unit não é permitido).' };
  }
  if (!ISO_DATE_RE.test(String(rec.nextRunDate || '').trim())) {
    return { allowed: false, reason: 'Data da próxima execução (nextRunDate) inválida.' };
  }
  return { allowed: true };
}

const ALLOWED_LIFECYCLE_TRANSITIONS: Record<RecurringOrderLifecycleStatus, RecurringOrderLifecycleStatus[]> = {
  ativa: ['pausada', 'cancelada', 'encerrada'],
  pausada: ['ativa', 'cancelada', 'encerrada'],
  cancelada: [],
  encerrada: [],
};

export function canTransitionRecurringLifecycle(
  from: RecurringOrderLifecycleStatus,
  to: RecurringOrderLifecycleStatus,
): boolean {
  return (ALLOWED_LIFECYCLE_TRANSITIONS[from] || []).includes(to);
}
