// Armazenamento do ponto (ARP). Tudo fica em coleções só do servidor (firestore.rules nega o navegador).
// Consultas por período usam campos "<chave>|<dia>" com `in`, sem depender de índice composto.
import { getAdmin } from '../firebaseAdmin.ts';
import type { PontoConfig, TipoMarcacao } from '../../src/ponto/config.ts';
import type { ObraGeo } from '../../src/ponto/geo.ts';
import { diasEntre } from '../../src/ponto/tempo.ts';

export interface Estabelecimento { id: string; orgId: string; cnpj: string; razaoSocial: string; endereco?: string; config?: Partial<PontoConfig> }
export interface PessoaPonto {
  orgId: string; rhId: string; nome: string; cpf: string; estabelecimentoId: string; vinculo: 'CLT' | 'PJ';
  pinHash?: string; config?: Partial<PontoConfig>;
}
export type Alerta = 'fora_da_cerca' | 'sem_gps' | 'rosto' | 'relogio' | 'offline';
export interface MarcacaoRegistro {
  id: string; orgId: string; estabId: string; nsr: number; rhId: string; cpf: string; tipo: TipoMarcacao;
  dataHora: string; dia: string; gravadoEm: string; coletor: '01'; offline: boolean;
  campos: string; hash: string; prevHash: string | null; clientId: string; deviceId: string;
  gps: { lat: number; lng: number; precisaoM?: number } | null;
  face: { score: number; liveness?: number; modelo: string } | null;
  unitId: string | null; distM: number | null; alertas: Alerta[];
}
export interface EventoRegistro { id: string; orgId: string; estabId: string; nsr: number; tipo: 2 | 5; linha: string; gravadoEm: string; dia: string }
export interface Ajuste {
  id: string; orgId: string; rhId: string; data: string; acao: 'incluir' | 'desconsiderar';
  tipo?: TipoMarcacao; dataHora?: string; nsrRef?: number; estabId?: string;
  justificativa: string; autorUid: string; criadoEm: string;
}
export interface Device {
  id: string; orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string;
  publicKeyJwk: JsonWebKey; nome: string; criadoEm: string; revogadoEm?: string;
}
export interface Pairing {
  code: string; orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string;
  expiraEm: string; usadoEm?: string; criadoPor: string;
}

type Prev = { nsr: number; hash: string | null };

export interface PontoStore {
  getEstab(id: string): Promise<Estabelecimento | undefined>;
  listEstabs(orgId: string): Promise<Estabelecimento[]>;
  saveEstab(e: Estabelecimento): Promise<void>;
  getPessoa(orgId: string, rhId: string): Promise<PessoaPonto | undefined>;
  listPessoas(orgId: string): Promise<PessoaPonto[]>;
  savePessoa(p: PessoaPonto): Promise<void>;
  listObras(orgId: string): Promise<ObraGeo[]>;
  /** Atômico por estabelecimento: devolve o registro já existente se o clientId repetir. */
  appendMarcacao(estabId: string, orgId: string, clientId: string, build: (prev: Prev) => MarcacaoRegistro): Promise<{ registro: MarcacaoRegistro; duplicada: boolean }>;
  /** Mesma sequência de NSR das marcações; não mexe no último hash. */
  appendEvento(estabId: string, build: (nsr: number) => EventoRegistro): Promise<EventoRegistro>;
  listMarcacoes(orgId: string, f: { rhId?: string; desde: string; ate: string }): Promise<MarcacaoRegistro[]>;
  listMarcacoesEstab(estabId: string, desde: string, ate: string): Promise<MarcacaoRegistro[]>;
  listEventosEstab(estabId: string, desde: string, ate: string): Promise<EventoRegistro[]>;
  addAjuste(a: Ajuste): Promise<void>;
  listAjustes(orgId: string, f: { rhId?: string; desde: string; ate: string }): Promise<Ajuste[]>;
  savePairing(p: Pairing): Promise<void>;
  getPairing(code: string): Promise<Pairing | undefined>;
  /** Só a primeira chamada vence. */
  markPairingUsed(code: string, at: string): Promise<boolean>;
  saveDevice(d: Device): Promise<void>;
  getDevice(id: string): Promise<Device | undefined>;
  listDevices(orgId: string): Promise<Device[]>;
  revokeDevice(id: string, at: string): Promise<void>;
}

export const pessoaKey = (orgId: string, rhId: string) => `${orgId}__${rhId}`;
export const nsrKey = (estabId: string, nsr: number) => `${estabId}__${String(nsr).padStart(9, '0')}`;
const inRange = (dia: string, desde: string, ate: string) => dia >= desde && dia <= ate;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Em memória (testes). `obras` permite simular a coleção `units`. */
export function memoryPontoStore() {
  const estabs = new Map<string, Estabelecimento>();
  const pessoas = new Map<string, PessoaPonto>();
  const marc = new Map<string, MarcacaoRegistro>();
  const evts = new Map<string, EventoRegistro>();
  const byClient = new Map<string, string>();
  const state = new Map<string, Prev>();
  const ajustes: Ajuste[] = [];
  const pairings = new Map<string, Pairing>();
  const devices = new Map<string, Device>();
  const obras = new Map<string, ObraGeo[]>();
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
    queues.set(key, run.catch(() => undefined));
    return run;
  };
  const nextState = (estabId: string) => state.get(estabId) ?? { nsr: 0, hash: null };

  const store: PontoStore & { obras: Map<string, ObraGeo[]> } = {
    obras,
    getEstab: async (id) => (estabs.has(id) ? clone(estabs.get(id)!) : undefined),
    listEstabs: async (o) => [...estabs.values()].filter((e) => e.orgId === o).map(clone),
    saveEstab: async (e) => { estabs.set(e.id, clone(e)); },
    getPessoa: async (o, r) => { const p = pessoas.get(pessoaKey(o, r)); return p ? clone(p) : undefined; },
    listPessoas: async (o) => [...pessoas.values()].filter((p) => p.orgId === o).map(clone),
    savePessoa: async (p) => { pessoas.set(pessoaKey(p.orgId, p.rhId), clone(p)); },
    listObras: async (o) => clone(obras.get(o) ?? []),
    appendMarcacao: (estabId, orgId, clientId, build) => serial(estabId, async () => {
      const ck = `${orgId}__${clientId}`;
      const existing = byClient.get(ck);
      if (existing) return { registro: clone(marc.get(existing)!), duplicada: true };
      const prev = nextState(estabId);
      const reg = build(prev);
      marc.set(reg.id, clone(reg));
      byClient.set(ck, reg.id);
      state.set(estabId, { nsr: reg.nsr, hash: reg.hash });
      return { registro: clone(reg), duplicada: false };
    }),
    appendEvento: (estabId, build) => serial(estabId, async () => {
      const prev = nextState(estabId);
      const ev = build(prev.nsr + 1);
      evts.set(ev.id, clone(ev));
      state.set(estabId, { nsr: ev.nsr, hash: prev.hash });
      return clone(ev);
    }),
    listMarcacoes: async (o, f) => [...marc.values()].filter((m) => m.orgId === o && (!f.rhId || m.rhId === f.rhId) && inRange(m.dia, f.desde, f.ate)).map(clone),
    listMarcacoesEstab: async (e, d, a) => [...marc.values()].filter((m) => m.estabId === e && inRange(m.dia, d, a)).map(clone),
    listEventosEstab: async (e, d, a) => [...evts.values()].filter((v) => v.estabId === e && inRange(v.dia, d, a)).map(clone),
    addAjuste: async (a) => { ajustes.push(clone(a)); },
    listAjustes: async (o, f) => ajustes.filter((a) => a.orgId === o && (!f.rhId || a.rhId === f.rhId) && inRange(a.data, f.desde, f.ate)).map(clone),
    savePairing: async (p) => { pairings.set(p.code, clone(p)); },
    getPairing: async (c) => (pairings.has(c) ? clone(pairings.get(c)!) : undefined),
    markPairingUsed: async (c, at) => {
      const p = pairings.get(c);
      if (!p || p.usadoEm) return false;
      p.usadoEm = at;
      return true;
    },
    saveDevice: async (d) => { devices.set(d.id, clone(d)); },
    getDevice: async (id) => (devices.has(id) ? clone(devices.get(id)!) : undefined),
    listDevices: async (o) => [...devices.values()].filter((d) => d.orgId === o).map(clone),
    revokeDevice: async (id, at) => { const d = devices.get(id); if (d && !d.revogadoEm) d.revogadoEm = at; },
  };
  return store;
}

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Firestore (Admin SDK). */
export function firestorePontoStore(): PontoStore | null {
  const h = getAdmin();
  if (!h) return null;
  const db = h.db;
  const C = {
    estabs: db.collection('ponto_estabelecimentos'), pessoas: db.collection('ponto_pessoas'),
    marc: db.collection('ponto_marcacoes'), evts: db.collection('ponto_eventos'), state: db.collection('ponto_estab_state'),
    clients: db.collection('ponto_clientids'), ajustes: db.collection('ponto_ajustes'),
    pairings: db.collection('ponto_pairings'), devices: db.collection('ponto_devices'),
  };
  const data = <T>(d: FirebaseFirestore.DocumentSnapshot) => (d.exists ? (d.data() as T) : undefined);
  const porDias = async <T>(col: FirebaseFirestore.CollectionReference, field: string, prefix: string, desde: string, ate: string) => {
    const keys = diasEntre(desde, ate).map((d) => `${prefix}|${d}`);
    const out: T[] = [];
    for (const part of chunk(keys, 30)) {
      if (!part.length) continue;
      const snap = await col.where(field, 'in', part).get();
      snap.docs.forEach((d) => out.push(d.data() as T));
    }
    return out;
  };
  const withKeys = (m: MarcacaoRegistro) => ({ ...m, orgDia: `${m.orgId}|${m.dia}`, estabDia: `${m.estabId}|${m.dia}`, pessoaDia: `${m.orgId}__${m.rhId}|${m.dia}` });

  return {
    getEstab: async (id) => data<Estabelecimento>(await C.estabs.doc(id).get()),
    listEstabs: async (o) => (await C.estabs.where('orgId', '==', o).get()).docs.map((d) => d.data() as Estabelecimento),
    saveEstab: async (e) => { await C.estabs.doc(e.id).set(clone(e)); },
    getPessoa: async (o, r) => data<PessoaPonto>(await C.pessoas.doc(pessoaKey(o, r)).get()),
    listPessoas: async (o) => (await C.pessoas.where('orgId', '==', o).get()).docs.map((d) => d.data() as PessoaPonto),
    savePessoa: async (p) => { await C.pessoas.doc(pessoaKey(p.orgId, p.rhId)).set(clone(p)); },
    listObras: async (o) => (await db.collection('units').where('orgId', '==', o).get()).docs
      .map((d) => ({ id: d.id, nome: String(d.get('name') ?? ''), geo: d.get('geo') ?? null })),
    appendMarcacao: (estabId, orgId, clientId, build) => db.runTransaction(async (tx) => {
      const cref = C.clients.doc(`${orgId}__${clientId}`);
      const sref = C.state.doc(estabId);
      const [c, s] = await Promise.all([tx.get(cref), tx.get(sref)]);
      if (c.exists) {
        const ex = await tx.get(C.marc.doc(String(c.get('id'))));
        return { registro: ex.data() as MarcacaoRegistro, duplicada: true };
      }
      const prev: Prev = s.exists ? { nsr: Number(s.get('lastNsr') ?? 0), hash: (s.get('lastHash') as string | null) ?? null } : { nsr: 0, hash: null };
      const reg = build(prev);
      tx.set(C.marc.doc(reg.id), clone(withKeys(reg)));
      tx.set(cref, { id: reg.id });
      tx.set(sref, { lastNsr: reg.nsr, lastHash: reg.hash }, { merge: true });
      return { registro: reg, duplicada: false };
    }),
    appendEvento: (estabId, build) => db.runTransaction(async (tx) => {
      const sref = C.state.doc(estabId);
      const s = await tx.get(sref);
      const ev = build(Number(s.get('lastNsr') ?? 0) + 1);
      tx.set(C.evts.doc(ev.id), { ...clone(ev), estabDia: `${ev.estabId}|${ev.dia}` });
      tx.set(sref, { lastNsr: ev.nsr }, { merge: true });
      return ev;
    }),
    listMarcacoes: (o, f) => (f.rhId
      ? porDias<MarcacaoRegistro>(C.marc, 'pessoaDia', `${o}__${f.rhId}`, f.desde, f.ate)
      : porDias<MarcacaoRegistro>(C.marc, 'orgDia', o, f.desde, f.ate)),
    listMarcacoesEstab: (e, d, a) => porDias<MarcacaoRegistro>(C.marc, 'estabDia', e, d, a),
    listEventosEstab: (e, d, a) => porDias<EventoRegistro>(C.evts, 'estabDia', e, d, a),
    addAjuste: async (a) => { await C.ajustes.doc(a.id).set({ ...clone(a), orgDia: `${a.orgId}|${a.data}` }); },
    listAjustes: async (o, f) => (await porDias<Ajuste>(C.ajustes, 'orgDia', o, f.desde, f.ate)).filter((a) => !f.rhId || a.rhId === f.rhId),
    savePairing: async (p) => { await C.pairings.doc(p.code).set(clone(p)); },
    getPairing: async (c) => data<Pairing>(await C.pairings.doc(c).get()),
    markPairingUsed: (c, at) => db.runTransaction(async (tx) => {
      const ref = C.pairings.doc(c);
      const d = await tx.get(ref);
      if (!d.exists || d.get('usadoEm')) return false;
      tx.update(ref, { usadoEm: at });
      return true;
    }),
    saveDevice: async (d) => { await C.devices.doc(d.id).set(clone(d)); },
    getDevice: async (id) => data<Device>(await C.devices.doc(id).get()),
    listDevices: async (o) => (await C.devices.where('orgId', '==', o).get()).docs.map((d) => d.data() as Device),
    revokeDevice: async (id, at) => { await C.devices.doc(id).set({ revogadoEm: at }, { merge: true }); },
  };
}
