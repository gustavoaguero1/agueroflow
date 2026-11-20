import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import { getAdmin } from './firebaseAdmin.ts';
import type { Role } from './authService.ts';

export type AuthUser = { uid: string; email?: string; emailVerified?: boolean; master: boolean; orgs: Record<string, Role> };

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export const PUBLIC_API_PATTERNS: RegExp[] = [
  /^\/api\/health\/?$/,
  /^\/api\/auth\/credential-login\/?$/,
  /^\/api\/auth\/first-access\/check\/[^/]+\/?$/,
  /^\/api\/auth\/first-access\/complete\/?$/,
  /^\/api\/hr\/onboarding\/check\/[^/]+\/?$/,
  /^\/api\/hr\/onboarding\/submit\/?$/,
  /^\/api\/leads\/demo\/?$/,
  /^\/api\/outlook\/oauth\/callback\/?$/,
  /^\/api\/composio\/whatsapp\/webhook\/?$/,
  /^\/api\/webhooks\/whatsapp-receipts\/?$/,
];

export const isPublicPath = (originalUrl: string) => {
  const path = originalUrl.split('?')[0];
  return PUBLIC_API_PATTERNS.some((r) => r.test(path));
};

type Verifier = Pick<Auth, 'verifyIdToken'>;

/** Verifies the Bearer ID token (rejecting revoked ones) unless the path is public. */
export function verifyToken(getAuth: () => Verifier | null = () => getAdmin()?.auth ?? null, skipPublic = true): RequestHandler {
  return async (req, res, next) => {
    if (req.user || (skipPublic && isPublicPath(req.originalUrl))) return next();
    const auth = getAuth();
    if (!auth) return res.status(503).json({ error: 'auth_unavailable' });
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) return res.status(401).json({ error: 'unauthenticated' });
    try {
      const d = await auth.verifyIdToken(token, true);
      req.user = {
        uid: d.uid, email: d.email, emailVerified: d.email_verified === true,
        master: d.master === true, orgs: d.orgs && typeof d.orgs === 'object' ? d.orgs : {},
      };
    } catch {
      return res.status(401).json({ error: 'unauthenticated' });
    }
    next();
  };
}

export const createRequireAuth = (getAuth?: () => Verifier | null) => verifyToken(getAuth);
export const requireAuth: RequestHandler = createRequireAuth();

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function orgIdOf(req: Request): string | undefined {
  const explicit = str(req.params?.orgId) ?? str(req.query?.orgId) ?? str(req.body?.orgId) ?? str(req.body?.organizationId);
  if (explicit) return explicit;
  const orgs = Object.keys(req.user?.orgs ?? {});
  return orgs.length === 1 ? orgs[0] : undefined;
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'unauthenticated' });
    if (u.master) return next();
    const org = orgIdOf(req);
    const role = org ? u.orgs[org] : undefined;
    if (role && roles.includes(role)) return next();
    res.status(403).json({ error: 'forbidden' });
  };
}

const digest = (s: string) => createHash('sha256').update(s).digest();

export const requireWebhookSecret: RequestHandler = (req, res, next) => {
  const secret = process.env.WEBHOOK_SECRET;
  const given = str(req.query?.token) ?? str(req.headers['x-webhook-token']);
  if (secret && given && timingSafeEqual(digest(given), digest(secret))) return next();
  res.status(403).json({ error: 'forbidden' });
};
