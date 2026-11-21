import { Router, type Request, type RequestHandler, type Response } from 'express';
import { getAdmin, type AdminHandles } from './firebaseAdmin.ts';
import { verifyToken } from './authMiddleware.ts';
import {
  credentialLogin, syncSession, setPassword, verifyMemberPassword, issueFirstAccessToken,
  checkFirstAccessToken, completeFirstAccess, refreshMemberClaims, ERR_SHORT_NEW, ERR_NO_MEMBER,
} from './authService.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const validId = (id: string) => !!id && !id.includes('/');

// shortcut: in-memory per-process limiter, fine for max instances = 1; move to a shared store if the server scales out
function rateLimit(max = 10, windowMs = 60_000): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? '';
    let e = hits.get(key);
    if (!e || e.reset <= now) {
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      hits.set(key, (e = { n: 0, reset: now + windowMs }));
    }
    if (++e.n > max) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
    next();
  };
}

/** Master, Admin of the member's org, or Gerente of it for a non-Admin member. Missing member: only master. */
async function canManage(h: AdminHandles, req: Request, memberId: string): Promise<boolean> {
  const u = req.user!;
  if (u.master) return true;
  const snap = await h.db.doc(`org_members/${memberId}`).get();
  const org = snap.get('orgId') || snap.get('organizationId');
  const role = typeof org === 'string' ? u.orgs[org] : undefined;
  // A Gerente must not take over an Admin account (password or first-access link).
  return role === 'Admin' || (role === 'Gerente' && snap.get('role') !== 'Admin');
}

const BUSINESS_ERRORS = new Set([ERR_SHORT_NEW, ERR_NO_MEMBER]);

/** Known business errors go to the client as 400; anything else is logged and hidden. */
function sendError(res: Response, e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (BUSINESS_ERRORS.has(msg)) return res.status(400).json({ ok: false, error: msg });
  console.error('auth route error:', e);
  res.status(500).json({ error: 'internal' });
}

export function createAuthRouter(getH: () => AdminHandles | null = getAdmin): Router {
  const r = Router();
  const handles = new WeakMap<Request, AdminHandles>();
  const h = (req: Request) => handles.get(req)!;
  const fail = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });

  r.use((req, res, next) => {
    const admin = getH();
    if (!admin) return res.status(503).json({ error: 'auth_unavailable' });
    handles.set(req, admin);
    next();
  });
  // Protected routes verify here too, so the router is safe even if mounted without the global requireAuth.
  const auth = verifyToken(() => getH()?.auth ?? null, false);
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
    fn(req, res).catch(next);
  };

  r.post('/credential-login', rateLimit(), wrap(async (req, res) => {
    const b = req.body ?? {};
    res.json(await credentialLogin(h(req), {
      nameOrEmail: str(b.nameOrEmail), password: str(b.password), company: str(b.company) || undefined,
    }));
  }));

  r.post('/session', auth, wrap(async (req, res) => {
    const u = req.user!;
    // Email comes only from the verified token, never from the body.
    const { claims, member } = await syncSession(h(req), u.uid, u.email, u.emailVerified === true);
    const orgSnap = member?.orgId ? await h(req).db.doc(`organizations/${member.orgId}`).get() : null;
    res.json({ claims, member, org: orgSnap?.exists ? { ...orgSnap.data(), id: orgSnap.id } : null });
  }));

  r.post('/set-password', rateLimit(), auth, wrap(async (req, res) => {
    const b = req.body ?? {};
    const newPassword = str(b.newPassword);
    if (newPassword.trim().length < 6) return fail(res, 400, ERR_SHORT_NEW);
    const selfId = /^member_(.+)$/.exec(req.user!.uid)?.[1];
    const memberId = str(b.memberId) || selfId || '';
    if (!validId(memberId)) return fail(res, 400, 'Colaborador não informado.');
    if (memberId === selfId) {
      if (!(await verifyMemberPassword(h(req), memberId, str(b.currentPassword)))) {
        return fail(res, 403, 'Senha atual incorreta.');
      }
    } else if (!(await canManage(h(req), req, memberId))) {
      return fail(res, 403, 'Sem permissão para alterar a senha deste colaborador.');
    }
    try {
      await setPassword(h(req), memberId, newPassword);
    } catch (e) {
      return sendError(res, e);
    }
    res.json({ ok: true });
  }));

  r.post('/first-access/link', auth, wrap(async (req, res) => {
    const memberId = str(req.body?.memberId);
    if (!validId(memberId)) return fail(res, 400, 'Colaborador não informado.');
    if (!(await canManage(h(req), req, memberId))) return fail(res, 403, 'Sem permissão para gerar link deste colaborador.');
    try {
      res.json(await issueFirstAccessToken(h(req), memberId, req.user!.uid));
    } catch (e) {
      sendError(res, e);
    }
  }));

  r.get('/first-access/check/:token', wrap(async (req, res) => {
    const out = await checkFirstAccessToken(h(req), req.params.token);
    res.status('error' in out ? 400 : 200).json(out);
  }));

  r.post('/first-access/complete', rateLimit(), wrap(async (req, res) => {
    const out = await completeFirstAccess(h(req), str(req.body?.token), str(req.body?.newPassword));
    res.status(out.ok ? 200 : 400).json(out);
  }));

  r.post('/refresh-claims/:memberId', auth, wrap(async (req, res) => {
    const { memberId } = req.params;
    if (!validId(memberId)) return fail(res, 400, 'Colaborador não informado.');
    if (!(await canManage(h(req), req, memberId))) return fail(res, 403, 'Sem permissão para este colaborador.');
    await refreshMemberClaims(h(req), memberId);
    res.json({ ok: true });
  }));

  return r;
}

export const authRouter: Router = createAuthRouter();
