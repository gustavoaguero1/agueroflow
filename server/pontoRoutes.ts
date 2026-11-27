/**
 * Ponto eletrônico (REP-P), montado em /api/ponto.
 *
 * Aparelho (público em PUBLIC_API_PATTERNS; autenticado pela assinatura ECDSA do aparelho pareado):
 *   GET  /device/time         → { agora } hora oficial do servidor
 *   POST /device/pair         → { code, publicKeyJwk, nome } conclui o pareamento
 *   GET  /device/me           → dados do aparelho (cabeçalhos x-ponto-device e x-ponto-sig)
 *   POST /device/marcacoes    → { items: [{ payload, signature }] } online ou lote offline
 *
 * RH (login normal, área RH): ver a parte de baixo deste arquivo.
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { resolveConfig } from '../src/ponto/config.ts';
import { toBrt, diaBrt } from '../src/ponto/tempo.ts';
import { firestorePontoStore, type Device, type PontoStore } from './ponto/store.ts';
import { registrarMarcacao, PontoErro, type MarcacaoInput } from './ponto/registrar.ts';
import { concluirPareamento, verificarAssinatura } from './ponto/devices.ts';
import { registerRhRoutes } from './ponto/rhRoutes.ts';

export const MAX_ITENS_LOTE = 200;

export interface PontoRouterOpts {
  store?: () => PontoStore | null;
  now?: () => Date;
  /** Chamado depois de cada marcação nova (ex.: recalcular o Diário do dia). Falha só gera log. */
  afterRegistro?: (orgId: string, dataISO: string) => Promise<void>;
}

export function createPontoRouter(opts: PontoRouterOpts = {}): Router {
  const getStore = opts.store ?? firestorePontoStore;
  const now = opts.now ?? (() => new Date());
  const r = Router();

  const wrap = (fn: (req: Request, res: Response, store: PontoStore) => Promise<unknown>): RequestHandler => (req, res) => {
    const store = getStore();
    if (!store) { res.status(503).json({ error: 'banco_indisponivel' }); return; }
    fn(req, res, store).catch((e) => {
      if (e instanceof PontoErro) { res.status(e.status).json({ error: e.message }); return; }
      console.error('ponto route error:', e);
      res.status(500).json({ error: 'internal' });
    });
  };

  const deviceFrom = async (req: Request, store: PontoStore): Promise<Device> => {
    const id = String(req.header('x-ponto-device') ?? '');
    const d = id ? await store.getDevice(id) : undefined;
    if (!d || d.revogadoEm) throw new PontoErro(401, 'Aparelho não pareado ou desativado. Peça ao RH para parear de novo.');
    return d;
  };

  const configPara = async (store: PontoStore, orgId: string, rhId?: string) => {
    const pessoa = rhId ? await store.getPessoa(orgId, rhId) : undefined;
    const estab = pessoa ? await store.getEstab(pessoa.estabelecimentoId) : undefined;
    return { pessoa, config: resolveConfig(estab?.config, pessoa?.config) };
  };

  r.get('/device/time', (_req, res) => { res.json({ agora: toBrt(now()) }); });

  r.post('/device/pair', wrap(async (req, res, store) => {
    const d = await concluirPareamento(store, { code: req.body?.code, publicKeyJwk: req.body?.publicKeyJwk, nome: req.body?.nome }, now);
    const { pessoa, config } = await configPara(store, d.orgId, d.rhId);
    res.json({ deviceId: d.id, modo: d.modo, rhId: d.rhId, unitId: d.unitId, pessoa: pessoa ? { nome: pessoa.nome } : undefined, config });
  }));

  r.get('/device/me', wrap(async (req, res, store) => {
    const d = await deviceFrom(req, store);
    const minuto = Math.floor(now().getTime() / 60000);
    const sig = String(req.header('x-ponto-sig') ?? '');
    let ok = false;
    for (const m of [minuto, minuto - 1, minuto + 1]) {
      if (await verificarAssinatura(d.publicKeyJwk, `GET /device/me|${m}`, sig)) { ok = true; break; }
    }
    if (!ok) throw new PontoErro(401, 'Assinatura do aparelho inválida.');
    const hoje = diaBrt(now());
    if (d.modo === 'pessoal') {
      const { pessoa, config } = await configPara(store, d.orgId, d.rhId);
      const ultimas = await store.listMarcacoes(d.orgId, { rhId: d.rhId, desde: hoje, ate: hoje });
      return res.json({
        modo: d.modo, pessoa: pessoa ? { rhId: pessoa.rhId, nome: pessoa.nome } : null, config,
        ultimasDoDia: ultimas.sort((a, b) => a.dataHora.localeCompare(b.dataHora)).map((m) => ({ tipo: m.tipo, dataHora: m.dataHora })),
      });
    }
    const [pessoas, rh] = await Promise.all([store.listPessoas(d.orgId), store.listRh(d.orgId)]);
    const rhById = new Map(rh.map((x) => [x.id, x]));
    const lista = pessoas
      .filter((p) => p.cpf && p.estabelecimentoId && rhById.get(p.rhId)?.active !== false)
      .map((p) => ({ rhId: p.rhId, nome: p.nome, daObra: rhById.get(p.rhId)?.unitId === d.unitId }))
      .sort((a, b) => Number(b.daObra) - Number(a.daObra) || a.nome.localeCompare(b.nome));
    res.json({ modo: d.modo, unitId: d.unitId, pessoas: lista, config: resolveConfig() });
  }));

  r.post('/device/marcacoes', wrap(async (req, res, store) => {
    const d = await deviceFrom(req, store);
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITENS_LOTE) {
      throw new PontoErro(400, `Envie de 1 a ${MAX_ITENS_LOTE} marcações por vez.`);
    }
    const results: unknown[] = [];
    const dias = new Set<string>();
    for (const it of items) {
      let clientId: string | undefined;
      try {
        const payload = typeof it?.payload === 'string' ? it.payload : '';
        const parsed = JSON.parse(payload || 'null') as Omit<MarcacaoInput, 'deviceId'> | null;
        clientId = typeof parsed?.clientId === 'string' ? parsed.clientId : undefined;
        if (!(await verificarAssinatura(d.publicKeyJwk, payload, it?.signature))) throw new PontoErro(401, 'Assinatura inválida.');
        if (!parsed) throw new PontoErro(400, 'Marcação vazia.');
        if (d.modo === 'pessoal' && parsed.rhId !== d.rhId) throw new PontoErro(403, 'Este celular só registra o ponto do próprio dono.');
        const out = await registrarMarcacao(store, d.orgId, { ...parsed, deviceId: d.id }, now);
        if (!out.duplicada) dias.add(out.registro.dia);
        results.push({ clientId, ok: true, comprovante: out.comprovante });
      } catch (e) {
        if (!(e instanceof PontoErro) && !(e instanceof SyntaxError)) console.error('ponto marcação:', e);
        results.push({ clientId, ok: false, error: e instanceof PontoErro ? e.message : 'Marcação inválida.' });
      }
    }
    if (opts.afterRegistro) {
      for (const dia of dias) await opts.afterRegistro(d.orgId, dia).catch((e) => console.warn('ponto: pós-registro', e));
    }
    res.json({ results });
  }));

  registerRhRoutes(r, { getStore, now, wrap });
  return r;
}
