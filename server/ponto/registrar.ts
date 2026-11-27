// Registro de uma marcação no ARP: valida, calcula alertas, atribui NSR e hash encadeado, monta o comprovante.
// Nunca recusa por cerca, rosto ou relógio (a Portaria proíbe restringir a marcação): grava com alertas.
import { TIPOS_MARCACAO, resolveConfig, type TipoMarcacao } from '../../src/ponto/config.ts';
import { obraMaisProxima } from '../../src/ponto/geo.ts';
import { toBrt, diaBrt } from '../../src/ponto/tempo.ts';
import { camposTipo7, hashTipo7 } from './afd.ts';
import { nsrKey, type Alerta, type MarcacaoRegistro, type PontoStore } from './store.ts';

export class PontoErro extends Error {
  constructor(public status: 400 | 401 | 403 | 404, message: string) { super(message); }
}

export interface MarcacaoInput {
  clientId: string; deviceId: string; rhId: string; tipo: TipoMarcacao; dataHora: string; offline: boolean;
  gps: MarcacaoRegistro['gps']; face: MarcacaoRegistro['face'];
  relogio: { sincronizadoEm: string; decorridoMs: number } | null;
}

export interface Comprovante {
  nsr: number; empresa: { razaoSocial: string; cnpj: string }; pessoa: { nome: string; cpf: string };
  tipo: TipoMarcacao; dataHora: string; obra: { unitId: string; nome: string } | null; hash: string; alertas: Alerta[];
}

export const FACE_MIN = 0.6;
const RELOGIO_FOLGA_MS = 30_000;

const okGps = (g: unknown): g is { lat: number; lng: number; precisaoM?: number } =>
  !!g && typeof g === 'object' && Number.isFinite((g as any).lat) && Number.isFinite((g as any).lng);

export async function registrarMarcacao(
  store: PontoStore, orgId: string, input: MarcacaoInput, now: () => Date, opts: { faceMin?: number } = {},
): Promise<{ registro: MarcacaoRegistro; comprovante: Comprovante; duplicada: boolean }> {
  if (typeof input?.clientId !== 'string' || !input.clientId || input.clientId.length > 100) throw new PontoErro(400, 'clientId inválido.');
  if (!TIPOS_MARCACAO.includes(input.tipo)) throw new PontoErro(400, 'Tipo de marcação inválido.');
  if (typeof input.dataHora !== 'string' || !Number.isFinite(Date.parse(input.dataHora))) throw new PontoErro(400, 'Data e hora inválidas.');

  const pessoa = await store.getPessoa(orgId, String(input.rhId ?? ''));
  if (!pessoa || !pessoa.cpf || !pessoa.estabelecimentoId) throw new PontoErro(404, 'Pessoa sem cadastro de ponto.');
  const estab = await store.getEstab(pessoa.estabelecimentoId);
  if (!estab) throw new PontoErro(404, 'Estabelecimento não encontrado.');
  const cfg = resolveConfig(estab.config, pessoa.config);

  const dataHora = toBrt(input.dataHora);
  const gravadoEm = toBrt(now());
  const gps = okGps(input.gps) ? { lat: input.gps.lat, lng: input.gps.lng, ...(Number.isFinite(input.gps.precisaoM) ? { precisaoM: input.gps.precisaoM } : {}) } : null;
  const face = input.face && Number.isFinite(input.face.score) ? input.face : null;
  const prox = obraMaisProxima(gps, await store.listObras(orgId), cfg.raioM);

  const alertas: Alerta[] = [];
  if (!gps) alertas.push('sem_gps');
  else if (!prox || !prox.dentro) alertas.push('fora_da_cerca');
  if (face && face.score < (opts.faceMin ?? FACE_MIN)) alertas.push('rosto');
  if (input.relogio && Number.isFinite(Date.parse(input.relogio.sincronizadoEm)) && Number.isFinite(input.relogio.decorridoMs)) {
    const esperado = Date.parse(input.relogio.sincronizadoEm) + input.relogio.decorridoMs;
    if (Math.abs(Date.parse(dataHora) - esperado) > RELOGIO_FOLGA_MS) alertas.push('relogio');
  }
  if (input.offline) alertas.push('offline');

  const dentro = prox && prox.dentro ? prox : null;
  const { registro, duplicada } = await store.appendMarcacao(estab.id, orgId, input.clientId, (prev) => {
    const nsr = prev.nsr + 1;
    const campos = camposTipo7({ nsr, dataHora, cpf: pessoa.cpf, gravadoEm, coletor: '01', offline: !!input.offline });
    return {
      id: nsrKey(estab.id, nsr), orgId, estabId: estab.id, nsr, rhId: pessoa.rhId, cpf: pessoa.cpf, tipo: input.tipo,
      dataHora, dia: diaBrt(dataHora), gravadoEm, coletor: '01', offline: !!input.offline,
      campos, hash: hashTipo7(campos, prev.hash), prevHash: prev.hash, clientId: input.clientId, deviceId: String(input.deviceId ?? ''),
      gps, face, unitId: dentro?.unitId ?? null, distM: prox?.distM ?? null, alertas,
    };
  });

  const obras = registro.unitId ? await store.listObras(orgId) : [];
  const obra = registro.unitId ? { unitId: registro.unitId, nome: obras.find((o) => o.id === registro.unitId)?.nome ?? '' } : null;
  return {
    registro, duplicada,
    comprovante: {
      nsr: registro.nsr, empresa: { razaoSocial: estab.razaoSocial, cnpj: estab.cnpj }, pessoa: { nome: pessoa.nome, cpf: pessoa.cpf },
      tipo: registro.tipo, dataHora: registro.dataHora, obra, hash: registro.hash, alertas: registro.alertas,
    },
  };
}
