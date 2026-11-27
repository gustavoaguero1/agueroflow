import type { ChecklistItemAnswer, ChecklistItemType, ChecklistTemplate } from '../types';

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

export interface ChecklistSubmissionValidation {
  canComplete: boolean;
  errors: string[];
  answers: Record<string, ChecklistItemAnswer>;
  answeredCount: number;
  progressPercent: number;
  nonConformityCount: number;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isBlankAnswer = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);

/**
 * Server-safe validation and normalization. The template is the source of truth:
 * client-supplied item titles, types and conformity flags are never trusted.
 */
export function validateChecklistSubmission(
  template: ChecklistTemplate,
  rawAnswers: unknown
): ChecklistSubmissionValidation {
  const items = Array.isArray(template.items) ? template.items : [];
  const errors: string[] = [];
  const answers: Record<string, ChecklistItemAnswer> = {};
  let answeredCount = 0;
  let nonConformityCount = 0;

  if (items.length === 0) errors.push('O template não possui itens para execução.');
  const answersInput: Record<string, unknown> = isPlainRecord(rawAnswers) ? rawAnswers : {};
  if (!isPlainRecord(rawAnswers)) {
    errors.push('As respostas do checklist estão em formato inválido.');
  }

  const itemIds = new Set(items.map((item) => item.id));
  for (const answerId of Object.keys(answersInput)) {
    if (!itemIds.has(answerId)) errors.push(`Resposta sem item correspondente: ${answerId}.`);
  }

  const supportedTypes: ChecklistItemType[] = [
    'sim_nao', 'multipla_escolha', 'texto', 'numerico', 'foto', 'assinatura',
  ];

  for (const item of items) {
    if (!item.id?.trim() || !item.title?.trim() || !supportedTypes.includes(item.type)) {
      errors.push('O template contém um item sem identificação, título ou tipo válido.');
      continue;
    }
    const source = answersInput[item.id];
    const sourceRecord = isPlainRecord(source) ? source : undefined;
    const rawValue = sourceRecord?.value;

    if (isBlankAnswer(rawValue)) {
      if (item.required) errors.push(`Preencha o item obrigatório: ${item.title}.`);
      continue;
    }

    let value: unknown = rawValue;
    if (item.type === 'sim_nao') {
      if (rawValue !== 'sim' && rawValue !== 'nao') {
        errors.push(`Resposta inválida para o item: ${item.title}.`);
        continue;
      }
      if (rawValue === 'nao') nonConformityCount++;
    } else if (item.type === 'multipla_escolha') {
      if (typeof rawValue !== 'string' || !Array.isArray(item.options) || !item.options.includes(rawValue)) {
        errors.push(`Selecione uma opção válida para o item: ${item.title}.`);
        continue;
      }
    } else if (item.type === 'texto') {
      if (typeof rawValue !== 'string' || rawValue.trim().length > 5000) {
        errors.push(`Texto inválido para o item: ${item.title}.`);
        continue;
      }
      value = rawValue.trim();
    } else if (item.type === 'numerico') {
      const parsed = typeof rawValue === 'number' ? rawValue
        : typeof rawValue === 'string' ? Number(rawValue.trim()) : NaN;
      if (!Number.isFinite(parsed)) {
        errors.push(`Informe um número válido para o item: ${item.title}.`);
        continue;
      }
      value = parsed;
    } else if (item.type === 'foto' || item.type === 'assinatura') {
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
      const isDataImage = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
      const validUrlRef = trimmed.length >= 5 && trimmed.length <= 2000 && !trimmed.toLowerCase().startsWith('data:');
      const validInlineImg = isDataImage && trimmed.length <= 350_000;
      if (!validUrlRef && !validInlineImg) {
        errors.push(`Referência de evidência inválida para o item: ${item.title}.`);
        continue;
      }
      value = trimmed;
    }

    const notes = sourceRecord?.notes;
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1500)) {
      errors.push(`Observações inválidas para o item: ${item.title}.`);
      continue;
    }

    answers[item.id] = {
      itemId: item.id,
      itemTitle: item.title,
      type: item.type,
      value,
      ...(item.type === 'sim_nao' ? { conforme: value === 'sim' } : {}),
      ...(typeof notes === 'string' && notes.trim() ? { notes: notes.trim() } : {}),
    };
    answeredCount++;
  }

  return {
    canComplete: items.length > 0 && errors.length === 0,
    errors,
    answers,
    answeredCount,
    progressPercent: items.length === 0 ? 0 : Math.round((answeredCount / items.length) * 100),
    nonConformityCount,
  };
}

