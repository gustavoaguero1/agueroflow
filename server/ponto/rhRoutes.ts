/**
 * Rotas do RH para o ponto (todas com orgId em query ou body):
 *   GET  /estabelecimentos              (rh 1)   PUT /estabelecimentos/:id (rh 2; grava evento tipo 2)
 *   GET  /pessoas                       (rh 1)   PUT /pessoas/:rhId        (rh 2; grava evento tipo 5)
 *   POST /pareamentos/pessoal           (rh 2)   POST /pareamentos/totem   (Admin ou Gerente)
 *   GET  /espelho?rhId&inicio&fim       (rh 1)   GET /dia?data             (rh 1)
 *   POST /ajustes                       (rh 2)   GET /afd?estabId&inicio&fim (rh 1, ISO-8859-1)
 *   GET  /aparelhos                     (rh 1)   DELETE /aparelhos/:id     (rh 2; revoga, não apaga)
 */
import type { Router, Request, Response, RequestHandler } from 'express';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { requireArea, requireRole } from '../authMiddleware.ts';
import { resolveConfig, TIPOS_MARCACAO, type PontoConfig, type TipoMarcacao } from '../../src/ponto/config.ts';
import { proximaMarcacao } from '../../src/ponto/jornada.ts';
import { isValidCpf, onlyDigitsCpf } from '../../src/ponto/cpf.ts';
import { toBrt, diaBrt } from '../../src/ponto/tempo.ts';
import { gerarAfd, linhaTipo2, linhaTipo5, linhaTipo7 } from './afd.ts';
import { montarEspelho } from './espelho.ts';
import { criarPareamento } from './devices.ts';
import { PontoErro } from './registrar.ts';
import { nsrKey, type Alerta, type Estabelecimento, type PessoaPonto, type PontoStore } from './store.ts';

export interface RhRouteCtx {
  getStore: () => PontoStore | null;
  now: () => Date;
  wrap: (fn: (req: Request, res: Response, store: PontoStore) => Promise<unknown>) => RequestHandler;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 62;

export const mascaraCpf = (cpf: string) => {
  const d = onlyDigitsCpf(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null;
};
const hashPin = (pin: string) => {
  const salt = randomBytes(16).toString('base64');
  return `scrypt$${salt}$${scryptSync(pin, salt, 32).toString('base64')}`;
};

/** Só os campos de configuração conhecidos, com tipos certos. */
function limparConfig(c: unknown): Partial<PontoConfig> | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  const out: Partial<PontoConfig> = {};
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof o.inicio === 'string' && hhmm.test(o.inicio)) out.inicio = o.inicio;
  if (typeof o.fim === 'string' && hhmm.test(o.fim)) out.fim = o.fim;
  const num = (k: keyof PontoConfig, min: number, max: number) => {
    const v = Number(o[k]);
    if (o[k] !== undefined && o[k] !== null && o[k] !== '' && Number.isFinite(v) && v >= min && v <= max) (out as any)[k] = v;
  };
  num('almocoMin', 0, 240); num('raioM', 20, 5000); num('toleranciaMin', 0, 60);
  if (o.marcacoesPorDia === 2 || o.marcacoesPorDia === 4) out.marcacoesPorDia = o.marcacoesPorDia;
  if (Array.isArray(o.dias)) out.dias = [...new Set(o.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (Array.isArray(o.feriados)) out.feriados = [...new Set(o.feriados.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d)))].sort();
  if (typeof o.batePonto === 'boolean') out.batePonto = o.batePonto;
  return Object.keys(out).length ? out : undefined;
}

function periodo(q: Record<string, unknown>, maxDias = MAX_DIAS) {
  const inicio = String(q.inicio ?? '');
  const fim = String(q.fim ?? '');
  if (!DATE_RE.test(inicio) || !DATE_RE.test(fim) || inicio > fim) throw new PontoErro(400, 'Use datas no formato AAAA-MM-DD, com o início antes do fim.');
  if ((Date.parse(fim) - Date.parse(inicio)) / 86400_000 + 1 > maxDias) throw new PontoErro(400, `Período de no máximo ${maxDias} dias.`);
  return { inicio, fim };
}

export function registerRhRoutes(r: Router, ctx: RhRouteCtx): void {
  const { wrap, now } = ctx;
  const org = (req: Request) => String(req.orgId ?? '');
  const rhLer = requireArea('rh', 1);
  const rhGravar = requireArea('rh', 2);

  const estabDaOrg = async (store: PontoStore, orgId: string, id: string) => {
    const e = await store.getEstab(id);
    if (!e || e.orgId !== orgId) throw new PontoErro(404, 'Estabelecimento não encontrado.');
    return e;
  };

  // ── Estabelecimentos ──
  r.get('/estabelecimentos', rhLer, wrap(async (req, res, store) => {
    res.json({ items: await store.listEstabs(org(req)) });
  }));

  r.put('/estabelecimentos/:id', rhGravar, wrap(async (req, res, store) => {
    const id = String(req.params.id).slice(0, 80);
    const cnpj = String(req.body?.cnpj ?? '').replace(/\D/g, '');
    const razaoSocial = String(req.body?.razaoSocial ?? '').trim().slice(0, 150);
    if (cnpj.length !== 14) throw new PontoErro(400, 'CNPJ precisa ter 14 dígitos.');
    if (!razaoSocial) throw new PontoErro(400, 'Informe a razão social.');
    const atual = await store.getEstab(id);
    if (atual && atual.orgId !== org(req)) throw new PontoErro(404, 'Estabelecimento não encontrado.');
    const novo: Estabelecimento = {
      id, orgId: org(req), cnpj, razaoSocial,
      ...(req.body?.endereco ? { endereco: String(req.body.endereco).slice(0, 100) } : {}),
      ...(limparConfig(req.body?.config) ? { config: limparConfig(req.body.config) } : {}),
    };
    await store.saveEstab(novo);
    if (!atual || atual.cnpj !== cnpj || atual.razaoSocial !== razaoSocial) {
      const gravadoEm = toBrt(now());
      await store.appendEvento(id, (nsr) => ({
        id: `ev_${nsrKey(id, nsr)}`, orgId: org(req), estabId: id, nsr, tipo: 2, gravadoEm, dia: diaBrt(gravadoEm),
        linha: linhaTipo2({ nsr, gravadoEm, cpfResp: '', cnpj, razaoSocial, local: novo.endereco ?? '' }),
      }));
    }
    res.json({ ok: true, item: novo });
  }));

  // ── Pessoas ──
  r.get('/pessoas', rhLer, wrap(async (req, res, store) => {
    const [rh, pessoas, devices] = await Promise.all([store.listRh(org(req)), store.listPessoas(org(req)), store.listDevices(org(req))]);
    const byRh = new Map(pessoas.map((p) => [p.rhId, p]));
    const items = rh.filter((x) => x.active).map((x) => {
      const p = byRh.get(x.id);
      const dev = devices.find((d) => d.modo === 'pessoal' && d.rhId === x.id && !d.revogadoEm);
      return {
        rhId: x.id, nome: x.name, unitId: x.unitId ?? null,
        cpfMascarado: p ? mascaraCpf(p.cpf) : null, vinculo: p?.vinculo ?? null,
        batePonto: p?.config?.batePonto ?? true, estabelecimentoId: p?.estabelecimentoId ?? null,
        temPin: !!p?.pinHash, temRosto: false, config: p?.config ?? null,
        aparelho: dev ? { id: dev.id, nome: dev.nome, criadoEm: dev.criadoEm } : null,
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
    res.json({ items });
  }));

  r.put('/pessoas/:rhId', rhGravar, wrap(async (req, res, store) => {
    const rhId = String(req.params.rhId);
    const rh = (await store.listRh(org(req))).find((x) => x.id === rhId);
    if (!rh) throw new PontoErro(404, 'Funcionário não encontrado no cadastro do RH.');
    const atual = await store.getPessoa(org(req), rhId);
    const b = req.body ?? {};
    const cpf = b.cpf !== undefined && b.cpf !== '' ? onlyDigitsCpf(b.cpf) : atual?.cpf ?? '';
    if (cpf && !isValidCpf(cpf)) throw new PontoErro(400, 'CPF inválido.');
    const estabelecimentoId = String(b.estabelecimentoId ?? atual?.estabelecimentoId ?? '');
    if (estabelecimentoId) await estabDaOrg(store, org(req), estabelecimentoId).catch(() => { throw new PontoErro(400, 'Estabelecimento inválido.'); });
    const vinculo = b.vinculo === 'PJ' ? 'PJ' : b.vinculo === 'CLT' ? 'CLT' : atual?.vinculo ?? 'CLT';
    let pinHash = atual?.pinHash;
    if (b.pin !== undefined && b.pin !== '') {
      if (!/^\d{4,6}$/.test(String(b.pin))) throw new PontoErro(400, 'O PIN precisa ter de 4 a 6 números.');
      pinHash = hashPin(String(b.pin));
    }
    const config = { ...(atual?.config ?? {}), ...(limparConfig(b.config) ?? {}) } as Partial<PontoConfig>;
    if (typeof b.batePonto === 'boolean') config.batePonto = b.batePonto;
    const nova: PessoaPonto = {
      orgId: org(req), rhId, nome: rh.name, cpf, estabelecimentoId, vinculo,
      ...(pinHash ? { pinHash } : {}), ...(Object.keys(config).length ? { config } : {}),
    };
    await store.savePessoa(nova);

    // Evento tipo 5 (Portaria 671): inclusão, alteração ou exclusão do trabalhador no REP.
    const ativoAntes = !!atual?.cpf && !!atual?.estabelecimentoId && atual?.config?.batePonto !== false;
    const ativoAgora = !!cpf && !!estabelecimentoId && config.batePonto !== false;
    let op: 'I' | 'A' | 'E' | null = null;
    if (!ativoAntes && ativoAgora) op = 'I';
    else if (ativoAntes && !ativoAgora) op = 'E';
    else if (ativoAntes && ativoAgora && (atual!.cpf !== cpf || atual!.nome !== rh.name)) op = 'A';
    if (op) {
      const estabEv = op === 'E' ? atual!.estabelecimentoId : estabelecimentoId;
      const cpfEv = op === 'E' ? atual!.cpf : cpf;
      const gravadoEm = toBrt(now());
      await store.appendEvento(estabEv, (nsr) => ({
        id: `ev_${nsrKey(estabEv, nsr)}`, orgId: org(req), estabId: estabEv, nsr, tipo: 5, gravadoEm, dia: diaBrt(gravadoEm),
        linha: linhaTipo5({ nsr, gravadoEm, operacao: op!, cpf: cpfEv, nome: rh.name, cpfResp: '' }),
      }));
    }
    res.json({ ok: true, rhId, cpfMascarado: mascaraCpf(cpf), batePonto: config.batePonto ?? true });
  }));

  // ── Pareamento ──
  r.post('/pareamentos/pessoal', rhGravar, wrap(async (req, res, store) => {
    const p = await criarPareamento(store, { orgId: org(req), modo: 'pessoal', rhId: String(req.body?.rhId ?? ''), criadoPor: String(req.user?.uid ?? '') }, now);
    res.json({ code: p.code, expiraEm: p.expiraEm });
  }));
  r.post('/pareamentos/totem', requireRole('Admin', 'Gerente'), wrap(async (req, res, store) => {
    const p = await criarPareamento(store, { orgId: org(req), modo: 'totem', unitId: String(req.body?.unitId ?? ''), criadoPor: String(req.user?.uid ?? '') }, now);
    res.json({ code: p.code, expiraEm: p.expiraEm });
  }));

  // ── Espelho e painel do dia ──
  const cfgPessoa = async (store: PontoStore, p: PessoaPonto) => resolveConfig((await store.getEstab(p.estabelecimentoId))?.config, p.config);

  r.get('/espelho', rhLer, wrap(async (req, res, store) => {
    const { inicio, fim } = periodo(req.query as Record<string, unknown>);
    const rhId = String(req.query.rhId ?? '');
    const pessoa = await store.getPessoa(org(req), rhId);
    if (!pessoa) throw new PontoErro(404, 'Pessoa sem cadastro de ponto.');
    const [marcacoes, ajustes] = await Promise.all([
      store.listMarcacoes(org(req), { rhId, desde: inicio, ate: fim }),
      store.listAjustes(org(req), { rhId, desde: inicio, ate: fim }),
    ]);
    const esp = montarEspelho({ marcacoes, ajustes, cfg: await cfgPessoa(store, pessoa), inicio, fim });
    res.json({ pessoa: { rhId, nome: pessoa.nome, cpfMascarado: mascaraCpf(pessoa.cpf) }, ...esp });
  }));

  r.get('/dia', rhLer, wrap(async (req, res, store) => {
    const data = String(req.query.data ?? '');
    if (!DATE_RE.test(data)) throw new PontoErro(400, 'Data inválida.');
    const [rh, pessoas, marcacoes, ajustes] = await Promise.all([
      store.listRh(org(req)), store.listPessoas(org(req)),
      store.listMarcacoes(org(req), { desde: data, ate: data }), store.listAjustes(org(req), { desde: data, ate: data }),
    ]);
    const ativos = new Set(rh.filter((x) => x.active).map((x) => x.id));
    const out = [];
    for (const p of pessoas) {
      if (!ativos.has(p.rhId) || !p.cpf || !p.estabelecimentoId || p.config?.batePonto === false) continue;
      const cfg = await cfgPessoa(store, p);
      const esp = montarEspelho({
        marcacoes: marcacoes.filter((m) => m.rhId === p.rhId), ajustes: ajustes.filter((a) => a.rhId === p.rhId), cfg, inicio: data, fim: data,
      });
      const dia = esp.dias[0];
      const validas = dia.marcacoes.filter((m) => !m.desconsiderada);
      const alertas = [...new Set(validas.flatMap((m) => m.alertas))] as Alerta[];
      out.push({ rhId: p.rhId, nome: p.nome, marcacoes: dia.marcacoes, proxima: proximaMarcacao(validas.map((m) => m.tipo), cfg), alertas, incompleto: dia.horas.incompleto, horas: dia.horas });
    }
    out.sort((a, b) => a.nome.localeCompare(b.nome));
    res.json({ data, pessoas: out });
  }));

  // ── Ajustes ──
  r.post('/ajustes', rhGravar, wrap(async (req, res, store) => {
    const b = req.body ?? {};
    const justificativa = String(b.justificativa ?? '').trim();
    if (justificativa.length < 5) throw new PontoErro(400, 'Escreva a justificativa do ajuste.');
    if (!DATE_RE.test(String(b.data ?? ''))) throw new PontoErro(400, 'Data inválida.');
    const pessoa = await store.getPessoa(org(req), String(b.rhId ?? ''));
    if (!pessoa) throw new PontoErro(404, 'Pessoa sem cadastro de ponto.');
    const base = { id: `aj_${randomUUID()}`, orgId: org(req), rhId: pessoa.rhId, data: String(b.data), justificativa: justificativa.slice(0, 500), autorUid: String(req.user?.uid ?? ''), criadoEm: toBrt(now()) };
    if (b.acao === 'incluir') {
      if (!TIPOS_MARCACAO.includes(b.tipo) || !Number.isFinite(Date.parse(String(b.dataHora ?? '')))) throw new PontoErro(400, 'Informe o tipo e o horário da marcação.');
      const dataHora = toBrt(String(b.dataHora));
      if (diaBrt(dataHora) !== base.data) throw new PontoErro(400, 'O horário precisa ser do mesmo dia do ajuste.');
      await store.addAjuste({ ...base, acao: 'incluir', tipo: b.tipo as TipoMarcacao, dataHora });
    } else if (b.acao === 'desconsiderar') {
      const nsrRef = Number(b.nsrRef);
      if (!Number.isInteger(nsrRef) || nsrRef < 1) throw new PontoErro(400, 'Informe a marcação (NSR).');
      await store.addAjuste({ ...base, acao: 'desconsiderar', nsrRef, estabId: String(b.estabId ?? pessoa.estabelecimentoId) });
    } else {
      throw new PontoErro(400, 'Ação inválida.');
    }
    res.json({ ok: true, id: base.id });
  }));

  // ── AFD ──
  r.get('/afd', rhLer, wrap(async (req, res, store) => {
    const { inicio, fim } = periodo(req.query as Record<string, unknown>, 366);
    const estab = await estabDaOrg(store, org(req), String(req.query.estabId ?? ''));
    const [eventos, marcacoes] = await Promise.all([store.listEventosEstab(estab.id, inicio, fim), store.listMarcacoesEstab(estab.id, inicio, fim)]);
    const txt = gerarAfd({
      cnpj: estab.cnpj, razaoSocial: estab.razaoSocial, inpi: process.env.PONTO_INPI ?? '', inicio, fim, geradoEm: toBrt(now()),
      desenvolvedorCnpj: process.env.PONTO_DEV_CNPJ ?? estab.cnpj,
      linhas: [
        ...eventos.map((e) => ({ nsr: e.nsr, tipo: e.tipo, linha: e.linha })),
        ...marcacoes.map((m) => ({ nsr: m.nsr, tipo: 7 as const, linha: linhaTipo7(m.campos, m.hash) })),
      ],
    });
    res.setHeader('Content-Type', 'text/plain; charset=ISO-8859-1');
    res.setHeader('Content-Disposition', `attachment; filename="AFD_${estab.cnpj}_${inicio}_${fim}.txt"`);
    res.send(Buffer.from(txt, 'latin1'));
  }));

  // ── Aparelhos ──
  r.get('/aparelhos', rhLer, wrap(async (req, res, store) => {
    const items = (await store.listDevices(org(req))).map(({ publicKeyJwk: _k, ...d }) => d)
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    res.json({ items });
  }));
  r.delete('/aparelhos/:id', rhGravar, wrap(async (req, res, store) => {
    const d = await store.getDevice(String(req.params.id));
    if (!d || d.orgId !== org(req)) throw new PontoErro(404, 'Aparelho não encontrado.');
    await store.revokeDevice(d.id, toBrt(now()));
    res.json({ ok: true });
  }));
}
