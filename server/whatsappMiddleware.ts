/**
 * Em qual WhatsApp cada requisição roda:
 * - gestão da PRÓPRIA conexão (status, conectar, desconectar, lista/oficial/assumir) → WhatsApp de quem chama;
 * - todo o resto (enviar pela central, grupos, keepalive, NDs, reembolsos...) → número oficial da empresa.
 * A empresa vem do pedido (orgId) e só vale se a pessoa for membro dela.
 */
import type { NextFunction, Request, Response } from 'express';
import { memberOrgOf } from './authMiddleware';
import { sessionForRequest } from './whatsappRouting';
import { effectiveOrg } from './orgDefaults';
import type { SessionContext } from './whatsappContext';

/** Rotas (relativas a /api/whatsapp/bridge) que tratam da conexão do próprio usuário. */
const OWN_SESSION_PATHS = ['/status', '/connect', '/disconnect', '/sessions', '/official', '/sessions/legacy/claim'];

export function createWhatsAppMiddlewares(deps: {
  runInSession: <T>(ctx: SessionContext, fn: () => T) => T;
  runAsOrgSender: <T>(orgId: string, fn: () => T) => T;
}) {
  return {
    companyContext(req: Request, _res: Response, next: NextFunction) {
      const org = memberOrgOf(req);
      if (!org) return next();
      deps.runAsOrgSender(effectiveOrg(org), next);
    },
    ownSessionContext(req: Request, _res: Response, next: NextFunction) {
      if (!OWN_SESSION_PATHS.includes(req.path)) return next();
      const s = sessionForRequest({ user: req.user, orgId: memberOrgOf(req) });
      if (!('key' in s)) return next();
      deps.runInSession(s, next);
    },
  };
}
