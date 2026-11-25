import type { ChecklistItemAnswer, ChecklistTemplate } from '../types';

export interface ChecklistCompletionAssessment {
  progressPercent: number;
  answeredCount: number;
  requiredCount: number;
  missingRequired: string[];
  nonConformityCount: number;
  canComplete: boolean;
}

function isAnswered(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

/** Creates unanswered answers. A checklist must never start in a conforming state. */
export function createInitialChecklistAnswers(
  template: ChecklistTemplate
): Record<string, ChecklistItemAnswer> {
  return Object.fromEntries(
    template.items.map((item) => [
      item.id,
      {
        itemId: item.id,
        itemTitle: item.title,
        type: item.type,
        value: '',
      } satisfies ChecklistItemAnswer,
    ])
  );
}

/** Shared, deterministic validation for progress, mandatory fields and negative answers. */
export function assessChecklistCompletion(
  template: ChecklistTemplate,
  answers: Record<string, ChecklistItemAnswer>
): ChecklistCompletionAssessment {
  const items = Array.isArray(template.items) ? template.items : [];
  const answeredCount = items.filter((item) => isAnswered(answers[item.id]?.value)).length;
  const requiredItems = items.filter((item) => item.required);
  const missingRequired = requiredItems
    .filter((item) => !isAnswered(answers[item.id]?.value))
    .map((item) => item.title || item.id);
  const nonConformityCount = items.filter((item) => {
    const answer = answers[item.id];
    return answer?.value === 'nao' || answer?.conforme === false;
  }).length;

  return {
    progressPercent: items.length === 0 ? 0 : Math.round((answeredCount / items.length) * 100),
    answeredCount,
    requiredCount: requiredItems.length,
    missingRequired,
    nonConformityCount,
    canComplete: items.length > 0 && missingRequired.length === 0,
  };
}
