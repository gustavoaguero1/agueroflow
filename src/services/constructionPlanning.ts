export interface ConstructionScheduleProgressInput {
  weightPercentage?: number | null;
  completedPercentage?: number | null;
}

export interface ConstructionScheduleStatusInput {
  completedPercentage?: number | null;
  status?: string | null;
  targetDate?: string | null;
}

export type ConstructionScheduleStatus =
  | 'concluida'
  | 'atrasada'
  | 'no_prazo'
  | 'sem_prazo';

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Calculates physical progress using milestone weights.
 * Invalid/negative weights are ignored and individual progress is clamped to 0–100.
 * The result is normalized by the sum of valid weights, so templates do not need
 * to be perfectly weighted to 100 to avoid division errors.
 */
export function calculateWeightedPhysicalProgress(
  milestones: readonly ConstructionScheduleProgressInput[],
): number {
  let totalWeight = 0;
  let weightedProgress = 0;

  for (const milestone of milestones) {
    const weight = Number(milestone.weightPercentage);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    const rawProgress = Number(milestone.completedPercentage ?? 0);
    const progress = Number.isFinite(rawProgress)
      ? Math.min(100, Math.max(0, rawProgress))
      : 0;

    totalWeight += weight;
    weightedProgress += weight * progress;
  }

  if (totalWeight <= 0) return 0;
  return Math.round(weightedProgress / totalWeight);
}

/** Classifies a milestone against a caller-supplied local calendar date (YYYY-MM-DD). */
export function getConstructionScheduleStatus(
  milestone: ConstructionScheduleStatusInput,
  today: string,
): ConstructionScheduleStatus {
  const progress = Number(milestone.completedPercentage ?? 0);
  if (milestone.status === 'concluido' || (Number.isFinite(progress) && progress >= 100)) {
    return 'concluida';
  }

  const targetDate = typeof milestone.targetDate === 'string' ? milestone.targetDate : '';
  if (!isIsoCalendarDate(today) || !isIsoCalendarDate(targetDate)) return 'sem_prazo';
  return targetDate < today ? 'atrasada' : 'no_prazo';
}

/** Validates optional schedule dates. Returns a user-facing error or null when valid. */
export function validateMilestoneScheduleDates(
  plannedStartDate?: string | null,
  targetDate?: string | null,
): string | null {
  const start = plannedStartDate || '';
  const finish = targetDate || '';

  if (start && !isIsoCalendarDate(start)) return 'A data prevista de início é inválida.';
  if (finish && !isIsoCalendarDate(finish)) return 'O prazo previsto é inválido.';
  if (start && finish && start > finish) {
    return 'O prazo previsto não pode ser anterior ao início planejado.';
  }

  return null;
}
