import type { EngineeringDocumentEventType } from '../types/engineeringDocuments';

export const ENGINEERING_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const ENGINEERING_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type EngineeringDocumentStatus =
  | 'internal_review'
  | 'internal_approved'
  | 'internal_changes'
  | 'client_review'
  | 'client_approved'
  | 'client_changes'
  | 'as_built'
  | 'unknown';

export function normalizeEngineeringDocumentCode(value: string): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 40);

  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(normalized)) {
    throw new Error('Informe um código de documento válido (até 40 caracteres).');
  }
  return normalized;
}

export function normalizeEngineeringRevision(value: string): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 12);

  if (!/^[A-Z0-9][A-Z0-9._-]{0,11}$/.test(normalized)) {
    throw new Error('Informe uma revisão válida (até 12 caracteres).');
  }
  return normalized;
}

export function buildEngineeringDocumentGroupId(orgId: string, documentCode: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(orgId)) {
    throw new Error('Identificador da empresa inválido.');
  }
  return `eng_${orgId}_${normalizeEngineeringDocumentCode(documentCode)}`;
}

/** A deterministic ID prevents two users from registering the same revision concurrently. */
export function buildEngineeringDocumentId(orgId: string, documentCode: string, revision: string): string {
  return `${buildEngineeringDocumentGroupId(orgId, documentCode)}_${normalizeEngineeringRevision(revision)}`;
}

/** Natural ordering supports common drawing revisions such as A/B/C, 00/01/02 and 1.0/1.1. */
export function compareEngineeringRevisions(left: string, right: string): number {
  return normalizeEngineeringRevision(left).localeCompare(
    normalizeEngineeringRevision(right),
    'pt-BR',
    { numeric: true, sensitivity: 'base' },
  );
}

export function isEngineeringDocumentFileAllowed(file: { type: string; size: number; name?: string }): boolean {
  return (ENGINEERING_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)
    && Number.isFinite(file.size)
    && file.size > 0
    && file.size <= ENGINEERING_DOCUMENT_MAX_BYTES
    && (!file.name || file.name.trim().length <= 180);
}

export function getEngineeringDocumentStatus(eventType?: EngineeringDocumentEventType): EngineeringDocumentStatus {
  switch (eventType) {
    case 'submitted_internal': return 'internal_review';
    case 'approved_internal': return 'internal_approved';
    case 'rejected_internal': return 'internal_changes';
    case 'submitted_client': return 'client_review';
    case 'approved_client': return 'client_approved';
    case 'rejected_client': return 'client_changes';
    case 'marked_as_built': return 'as_built';
    default: return 'unknown';
  }
}

export function engineeringDocumentStatusLabel(status: EngineeringDocumentStatus): string {
  const labels: Record<EngineeringDocumentStatus, string> = {
    internal_review: 'Em revisão interna',
    internal_approved: 'Aprovado internamente',
    internal_changes: 'Ajustes internos solicitados',
    client_review: 'Aguardando retorno do cliente',
    client_approved: 'Retorno de aprovação do cliente registrado',
    client_changes: 'Ajustes solicitados pelo cliente',
    as_built: 'As Built',
    unknown: 'Sem movimentação registrada',
  };
  return labels[status];
}

export function engineeringDocumentDateMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === 'function') return toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
