// SPIKE (descartável): descobre onde está a API REST do Protheus e o que o usuário consegue ler.
// shortcut: diagnóstico único, sem cache nem paginação; substituir pelo cliente real do módulo Protheus.
import { Router } from 'express';
import { requireModuleAccess } from './authMiddleware';

const PATHS = [
  '/rest/',
  '/rest/api/framework/environment/v1/serverdate',
  '/rest/api/framework/v1/users?count=1',
  '/rest/api/ctb/v1/costcenters?pageSize=3',
  '/rest/api/ctb/v1/costCenter?pageSize=3',
  '/rest/api/est/v1/products?pageSize=3',
  '/rest/api/fin/v1/accountspayable?pageSize=3',
  '/api/framework/environment/v1/serverdate',
];

type Result = { url: string; status: number | string; contentType?: string; preview?: string };

/** Tries the usual Protheus REST locations on the configured port and nearby ports. */
export async function probeProtheus(base: string, user: string, pass: string): Promise<Result[]> {
  const u = new URL(base);
  const port = Number(u.port || 443);
  const ports = [...new Set([port, ...Array.from({ length: 11 }, (_, i) => port - 5 + i)])].filter((p) => p > 0);
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const targets = ports.flatMap((p) => PATHS.map((path) => `${u.protocol}//${u.hostname}:${p}${path}`));
  return Promise.all(targets.map(async (url): Promise<Result> => {
    try {
      const r = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      const text = await r.text();
      return { url, status: r.status, contentType: r.headers.get('content-type') ?? undefined, preview: text.replace(/\s+/g, ' ').slice(0, 300) };
    } catch (e) {
      return { url, status: e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout' : e.message.slice(0, 80)) : 'erro' };
    }
  }));
}

export const protheusProbeRouter = Router();
protheusProbeRouter.get('/diagnostico', requireModuleAccess('financeiro-notas', 4), async (_req, res) => {
  const { PROTHEUS_URL, PROTHEUS_USER, PROTHEUS_PASSWORD } = process.env;
  if (!PROTHEUS_URL || !PROTHEUS_USER || !PROTHEUS_PASSWORD) {
    return res.status(400).json({ error: 'Configure PROTHEUS_URL, PROTHEUS_USER e PROTHEUS_PASSWORD nos Secrets e reinicie o servidor.' });
  }
  const results = await probeProtheus(PROTHEUS_URL, PROTHEUS_USER, PROTHEUS_PASSWORD);
  // Answers first (anything that is not a network failure), most useful on top.
  const rank = (r: Result) => (typeof r.status === 'number' ? (r.status < 300 ? 0 : r.status === 401 || r.status === 403 ? 1 : 2) : 3);
  res.json({ respondeu: results.filter((r) => typeof r.status === 'number').sort((a, b) => rank(a) - rank(b)), semResposta: results.filter((r) => typeof r.status !== 'number').length });
});
