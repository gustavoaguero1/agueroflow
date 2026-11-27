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
import { firestorePontoStore, type Alerta, type Device, type PontoStore } from './ponto/store.ts';
import { registrarMarcacao, PontoErro, type MarcacaoInput } from './ponto/registrar.ts';
import { concluirPareamento, verificarAssinatura } from './ponto/devices.ts';
import { registerRhRoutes } from './ponto/rhRoutes.ts';
import { recalcularPontoDia, firestorePontoDiaWriter } from './ponto/diarioSync.ts';

export const MAX_ITENS_LOTE = 200;

export interface PontoRouterOpts {
  store?: () => PontoStore | null;
  now?: () => Date;
  /** Chamado depois de cada marcação nova (ex.: recalcular o Diário do dia). Falha só gera log. */
  afterRegistro?: (orgId: string, dataISO: string, rhId?: string) => Promise<void>;
}

export function createPontoRouter(opts: PontoRouterOpts = {}): Router {
  const getStore = opts.store ?? firestorePontoStore;
  const now = opts.now ?? (() => new Date());
  const after = opts.afterRegistro ?? (async (orgId: string, dia: string, rhId?: string) => {
    const s = getStore();
    if (s) await recalcularPontoDia(s, firestorePontoDiaWriter, orgId, dia, now, rhId);
  });
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

  /** `aceitaRevogado`: o lote offline de um celular trocado ainda entrega o que foi marcado antes da troca. */
  const deviceFrom = async (req: Request, store: PontoStore, aceitaRevogado = false): Promise<Device> => {
    const id = String(req.header('x-ponto-device') ?? '');
    const d = id ? await store.getDevice(id) : undefined;
    if (!d || (d.revogadoEm && !aceitaRevogado)) throw new PontoErro(401, 'Aparelho não pareado ou desativado. Peça ao RH para parear de novo.');
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
    const d = await deviceFrom(req, store, true);
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITENS_LOTE) {
      throw new PontoErro(400, `Envie de 1 a ${MAX_ITENS_LOTE} marcações por vez.`);
    }
    const results: unknown[] = [];
    const dias = new Map<string, { dia: string; rhId: string }>();
    for (const it of items) {
      let clientId: string | undefined;
      try {
        const payload = typeof it?.payload === 'string' ? it.payload : '';
        const parsed = JSON.parse(payload || 'null') as Omit<MarcacaoInput, 'deviceId'> | null;
        clientId = typeof parsed?.clientId === 'string' ? parsed.clientId : undefined;
        if (!(await verificarAssinatura(d.publicKeyJwk, payload, it?.signature))) throw new PontoErro(401, 'Assinatura inválida.');
        if (!parsed) throw new PontoErro(400, 'Marcação vazia.');
        if (d.modo === 'pessoal' && parsed.rhId !== d.rhId) throw new PontoErro(403, 'Este celular só registra o ponto do próprio dono.');
        const extra: Alerta[] = [];
        if (d.revogadoEm) {
          if (!(Date.parse(String(parsed.dataHora)) < Date.parse(d.revogadoEm))) throw new PontoErro(401, 'Aparelho desativado. Peça ao RH para parear de novo.');
          extra.push('aparelho_revogado');
        }
        const out = await registrarMarcacao(store, d.orgId, { ...parsed, deviceId: d.id }, now, { alertasExtra: extra });
        if (!out.duplicada) dias.set(`${out.registro.dia}|${out.registro.rhId}`, { dia: out.registro.dia, rhId: out.registro.rhId });
        results.push({ clientId, ok: true, comprovante: out.comprovante });
      } catch (e) {
        // retry:false = o app descarta o item (dado inválido); retry:true = falha temporária, o app reenvia depois.
        if (e instanceof PontoErro || e instanceof SyntaxError) {
          results.push({ clientId, ok: false, retry: false, error: e instanceof PontoErro ? e.message : 'Marcação inválida.' });
        } else {
          console.error('ponto marcação:', e);
          results.push({ clientId, ok: false, retry: true, error: 'Falha temporária. O app tenta de novo.' });
        }
      }
    }
    for (const x of dias.values()) await after(d.orgId, x.dia, x.rhId).catch((e) => console.warn('ponto: pós-registro', e));
    res.json({ results });
  }));

  registerRhRoutes(r, { getStore, now, wrap, after });
  return r;
}
