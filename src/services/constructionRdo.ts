export interface RdoWorkforceDraft {
  role: string;
  count: string;
  hours: string;
}

export interface RdoEquipmentDraft {
  name: string;
  quantity: string;
  operationalHours: string;
}

export interface RdoWorkforceEntry {
  role: string;
  count: number;
  hours: number;
}

export interface RdoEquipmentEntry {
  name: string;
  quantity: number;
  operationalHours: number;
}

export interface RdoFieldRecordsResult {
  valid: boolean;
  errors: string[];
  workforce: RdoWorkforceEntry[];
  equipment: RdoEquipmentEntry[];
  totalPersonHours: number;
}

function isBlank(value: string | undefined): boolean {
  return value == null || value.trim() === '';
}

function parseFiniteNumber(value: string): number | null {
  if (isBlank(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts the RDO field drafts into explicit records.
 * Empty rows are omitted; no workforce or equipment is fabricated.
 * Hours are per professional, not the sum for the role.
 */
export function prepareRdoFieldRecords(
  workforceDrafts: readonly RdoWorkforceDraft[],
  equipmentDrafts: readonly RdoEquipmentDraft[],
): RdoFieldRecordsResult {
  const errors: string[] = [];
  const workforce: RdoWorkforceEntry[] = [];
  const equipment: RdoEquipmentEntry[] = [];
  let totalPersonHours = 0;

  for (const draft of workforceDrafts) {
    const countBlank = isBlank(draft.count);
    const hoursBlank = isBlank(draft.hours);
    if (countBlank && hoursBlank) continue;

    const count = parseFiniteNumber(draft.count);
    if (count == null || !Number.isInteger(count) || count < 0 || count > 500) {
      errors.push(`Informe uma quantidade inteira válida para ${draft.role} (0 a 500).`);
      continue;
    }

    if (count === 0) {
      if (!hoursBlank) {
        const hoursAtZero = parseFiniteNumber(draft.hours);
        if (hoursAtZero !== 0) {
          errors.push(`A quantidade de ${draft.role} é zero; não informe horas sem profissionais.`);
          continue;
        }
      }
      // An explicit zero is recorded; a completely blank row remains "not informed".
      workforce.push({ role: draft.role.trim(), count: 0, hours: 0 });
      continue;
    }

    const hours = parseFiniteNumber(draft.hours);
    if (hours == null || hours <= 0 || hours > 24) {
      errors.push(`Informe as horas por profissional de ${draft.role} (maior que 0 e até 24).`);
      continue;
    }

    workforce.push({ role: draft.role.trim(), count, hours });
    totalPersonHours += count * hours;
  }

  for (const [index, draft] of equipmentDrafts.entries()) {
    const nameBlank = isBlank(draft.name);
    const quantityBlank = isBlank(draft.quantity);
    const hoursBlank = isBlank(draft.operationalHours);
    if (nameBlank && quantityBlank && hoursBlank) continue;

    const name = draft.name.trim();
    const quantity = parseFiniteNumber(draft.quantity);
    const operationalHours = parseFiniteNumber(draft.operationalHours);

    if (name.length < 2 || name.length > 120) {
      errors.push(`Informe o nome do equipamento ${index + 1} (2 a 120 caracteres).`);
      continue;
    }
    if (quantity == null || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      errors.push(`Informe uma quantidade inteira válida para o equipamento ${index + 1}.`);
      continue;
    }
    if (operationalHours == null || operationalHours < 0 || operationalHours > 24) {
      errors.push(`Informe as horas em operação do equipamento ${index + 1} (0 a 24).`);
      continue;
    }

    equipment.push({ name, quantity, operationalHours });
  }

  return {
    valid: errors.length === 0,
    errors,
    workforce,
    equipment,
    totalPersonHours: Math.round((totalPersonHours + Number.EPSILON) * 100) / 100,
  };
}

/** Blank means "not reported", while an explicit zero remains a real value. */
export function parseOptionalRdoProgress(value: string): { value?: number; error?: string } {
  if (isBlank(value)) return {};
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { error: 'O avanço físico diário deve estar entre 0% e 100%.' };
  }
  return { value: Math.round(parsed * 100) / 100 };
}

/** Local date for date inputs; avoids UTC shifting the calendar day in Brazil. */
export function localDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** RDO number derived from its Firestore auto-id, avoiding reports.length races between users. */
export function buildRdoReportNumber(date: string, documentId: string): string {
  const hasDateShape = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date);
  const parsedDate = hasDateShape ? new Date(date + 'T00:00:00.000Z') : null;
  const validDate = parsedDate && Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === date;

  if (!validDate || documentId.trim().length < 8) {
    throw new Error('Não foi possível gerar o identificador do RDO.');
  }
  return 'RDO-' + date.slice(0, 4) + '-' + documentId.slice(-8).toUpperCase();
}
