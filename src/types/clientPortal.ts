export type ClientPortalScope =
  | 'schedule'
  | 'rdo'
  | 'measurements'
  | 'databook'
  | 'acceptance';

export interface ClientPortalGrant {
  id: string;
  orgId: string;
  clientName: string;
  clientEmail?: string;
  contractId: string;
  projectId: string;
  scopes: ClientPortalScope[];
  /** SHA-256 hex digest of the bearer portal token (never store plaintext token). */
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  revokedByUid?: string;
  createdByUid: string;
  createdByName: string;
  createdAt: string;
}

export interface ClientPortalAuditEntry {
  id: string;
  orgId: string;
  grantId: string;
  contractId: string;
  projectId: string;
  clientName: string;
  action: 'view_summary' | 'comment_measurement' | 'register_acceptance';
  targetId?: string;
  comment?: string;
  ip?: string;
  timestamp: string;
}
