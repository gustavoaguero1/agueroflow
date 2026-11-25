import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import { getAdmin } from './firebaseAdmin.ts';
import type { Role } from './authService.ts';
import { decodeAreas, resolveAreas, type AreaId, type AreaLevel } from '../src/permissions/areas.ts';

export type AuthUser = {
  uid: string; email?: string; emailVerified?: boolean; master: boolean; orgs: Record<string, Role>;
  areas?: Record<string, string>;
};

declare global {
  namespace Express {
    interface Request { user?: AuthUser; orgId?: string }
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
  /^\/api\/nd-export\//, // ND_EXPORT_TOKEN checked by its router
  /^\/api\/client-portal\/public\//, // Isolated external x-portal-token (SHA-256) checked by clientPortalRoutes
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
    // X-Firebase-Auth first: proxies in front of Cloud Run (Google AI Studio) can consume/strip Authorization.
    const raw = req.headers['x-firebase-auth'];
    const q = typeof req.query?._fbt === 'string' ? req.query._fbt : undefined;
    const token = /^Bearer (.+)$/.exec((typeof raw === 'string' && raw) || req.headers.authorization || '')?.[1]
      ?? (q && q !== 'none' ? q : undefined);
    if (!token) {
      // Say which channel arrived, so the screen itself shows where the login is lost.
      const seen = `authorization=${req.headers.authorization ? 'sim' : 'não'}, x-firebase-auth=${raw ? 'sim' : 'não'}, url=${q === 'none' ? 'sem usuário logado' : q ? 'sim' : 'não'}`;
      return res.status(401).json({ error: `unauthenticated: login não chegou ao servidor (${seen}; versão ${process.env.K_REVISION ?? 'local'})` });
    }
    try {
      const d = await auth.verifyIdToken(token, true);
      req.user = {
        uid: d.uid, email: d.email, emailVerified: d.email_verified === true,
        master: d.master === true, orgs: d.orgs && typeof d.orgs === 'object' ? d.orgs : {},
        ...(d.areas && typeof d.areas === 'object' ? { areas: d.areas } : {}),
      };
    } catch (e) {
      // Distinct from "no token" so a host misconfiguration (e.g. missing IAM role) is diagnosable.
      const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'unknown';
      if (!process.env.NODE_TEST_CONTEXT) console.warn(`[auth] token rejeitado (${code}): ${e instanceof Error ? e.message : String(e)}`);
      return res.status(401).json({ error: `invalid_token: o servidor não conseguiu verificar o login (${code})`, code });
    }
    next();
  };
}

export const createRequireAuth = (getAuth?: () => Verifier | null) => verifyToken(getAuth);
export const requireAuth: RequestHandler = createRequireAuth();

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** The org a request targets; null when the request names it ambiguously or with a non-string value. */
export function orgIdOf(req: Request): string | undefined | null {
  const named = [req.params?.orgId, req.query?.orgId, req.body?.orgId, req.body?.organizationId].filter((v) => v !== undefined);
  if (named.some((v) => typeof v !== 'string' || !v) || new Set(named).size > 1) return null;
  if (named.length) return named[0] as string;
  const orgs = Object.keys(req.user?.orgs ?? {});
  return orgs.length === 1 ? orgs[0] : undefined;
}

/** Empresa da requisição em que a pessoa é membro (master: qualquer uma); senão undefined. Não muda req. */
export function memberOrgOf(req: Request): string | undefined {
  const u = req.user;
  if (!u) return undefined;
  const org = orgIdOf(req);
  if (!org) return undefined;
  return u.master || u.orgs?.[org] ? org : undefined;
}

/** Passes master or a member whose role in the target org is allowed; sets req.orgId to the authorized org. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'unauthenticated' });
    const org = orgIdOf(req);
    if (org === null || (!u.master && !(org && roles.includes(u.orgs[org])))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    req.orgId = org;
    next();
  };
}

/**
 * Nível da pessoa numa área da empresa. Master: 2. Não é da empresa: 0.
 * Token antigo (sem áreas) cai no padrão do perfil — RH fica só com Admin e Gerente.
 */
export function areaLevelOf(u: AuthUser | undefined, org: string | undefined | null, area: AreaId): AreaLevel {
  if (!u) return 0;
  if (u.master) return 2;
  const role = org ? u.orgs?.[org] : undefined;
  if (!org || !role) return 0;
  const levels = decodeAreas(u.areas?.[org]) ?? resolveAreas(role);
  return levels[area] ?? 0;
}

/** Passa quem tem pelo menos `level` na área da empresa da requisição; marca req.orgId. */
export function requireArea(area: AreaId, level: 1 | 2): RequestHandler {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'unauthenticated' });
    const org = orgIdOf(req);
    if (org === null || (!u.master && areaLevelOf(u, org, area) < level)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    req.orgId = org;
    next();
  };
}

const digest = (s: string) => createHash('sha256').update(s).digest();

export const requireWebhookSecret: RequestHandler = (req, res, next) => {
  const secret = process.env.WEBHOOK_SECRET;
  const given = str(req.query?.token) ?? str(req.headers['x-webhook-token']);
  if (secret && given && timingSafeEqual(digest(given), digest(secret))) return next();
  res.status(403).json({ error: 'forbidden' });
};
