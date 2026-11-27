import type { NavSection } from '../components/layout/AppLayout.tsx';

export type QrEntityType = 'asset' | 'item' | 'order';

export interface QrDeepLinkTarget {
  entityType: QrEntityType;
  entityId: string;
  orgId?: string;
  section: NavSection;
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function sectionForQrEntity(entityType: QrEntityType): NavSection {
  if (entityType === 'asset') return 'bens-lista';
  if (entityType === 'item') return 'estoque';
  return 'ordens';
}

export function buildQrDeepLinkUrl(params: {
  origin: string;
  entityType: QrEntityType;
  entityId: string;
  orgId?: string;
}): string {
  const cleanId = String(params.entityId || '').trim();
  if (!SAFE_ID.test(cleanId)) {
    throw new Error('Identificador inválido para geração de QR Code.');
  }
  const cleanOrigin = String(params.origin || '').replace(/\/+$/, '');
  const query = new URLSearchParams();
  query.set('qrType', params.entityType);
  query.set('qrId', cleanId);
  if (params.orgId && SAFE_ID.test(params.orgId.trim())) {
    query.set('qrOrg', params.orgId.trim());
  }
  return `${cleanOrigin}/?${query.toString()}`;
}

export function parseQrDeepLinkSearch(search: string): QrDeepLinkTarget | null {
  const params = new URLSearchParams(search || '');
  const rawType = params.get('qrType');
  const rawId = (params.get('qrId') || '').trim();
  const rawOrg = (params.get('qrOrg') || '').trim();

  if (rawType !== 'asset' && rawType !== 'item' && rawType !== 'order') return null;
  if (!SAFE_ID.test(rawId)) return null;
  if (rawOrg && !SAFE_ID.test(rawOrg)) return null;

  return {
    entityType: rawType,
    entityId: rawId,
    ...(rawOrg ? { orgId: rawOrg } : {}),
    section: sectionForQrEntity(rawType),
  };
}
