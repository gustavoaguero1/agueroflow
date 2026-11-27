// Registro de uma marcação no ARP: valida, calcula alertas, atribui NSR e hash encadeado, monta o comprovante.
// Nunca recusa por cerca, rosto ou relógio (a Portaria proíbe restringir a marcação): grava com alertas.
import { TIPOS_MARCACAO, resolveConfig, type TipoMarcacao } from '../../src/ponto/config.ts';
import { obraMaisProxima } from '../../src/ponto/geo.ts';
import { toBrt, diaBrt } from '../../src/ponto/tempo.ts';
import { camposTipo7, hashTipo7 } from './afd.ts';
import { nsrKey, type Alerta, type MarcacaoRegistro, type MetodoIdent, type PontoStore } from './store.ts';
import { openFaceDescriptors, sanitizePontoPhoto } from './bioCrypto.ts';
import { FACE_MODEL_VERSION, matchFace1to1, sanitizeDescriptor } from '../../src/ponto/faceMath.ts';
import { scryptSync, timingSafeEqual } from 'node:crypto';

export class PontoErro extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409, message: string) { super(message); }
}

export interface MarcacaoInput {
  clientId: string; deviceId: string; rhId: string; tipo: TipoMarcacao; dataHora: string; offline: boolean;
  gps: MarcacaoRegistro['gps']; face: MarcacaoRegistro['face'];
  /** Vetor facial capturado na marcação (128-D) para conferência adicional no servidor. */
  faceDescriptor?: number[] | null;
  /** Selfie comprimida (~20-35 KB JPEG/WebP) para conferência visual do RH no espelho. */
  fotoDataUrl?: string | null;
  relogio: { sincronizadoEm: string; decorridoMs: number } | null;
  /** Como a pessoa foi identificada. Padrão: 'rosto' se veio `face`, senão 'nenhum'. */
  metodo?: MetodoIdent;
  /** PIN digitado (só quando metodo = 'pin'); conferido no servidor e nunca guardado. */
  pin?: string;
}

export interface Comprovante {
  nsr: number; empresa: { razaoSocial: string; cnpj: string }; pessoa: { nome: string; cpf: string };
  tipo: TipoMarcacao; dataHora: string; obra: { unitId: string; nome: string } | null; hash: string; alertas: Alerta[];
}

export const FACE_MIN = 0.6;
const RELOGIO_FOLGA_MS = 30_000;
/** Online: hora do aparelho x hora do servidor, com folga de rede. */
const ONLINE_FOLGA_MS = 90_000;

export function conferePin(pin: string, pinHash: string | undefined): boolean {
  const [alg, salt, hash] = String(pinHash ?? '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = scryptSync(String(pin ?? ''), salt, 32);
  const b = Buffer.from(hash, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}

const okGps = (g: unknown): g is { lat: number; lng: number; precisaoM?: number } =>
  !!g && typeof g === 'object' && Number.isFinite((g as any).lat) && Number.isFinite((g as any).lng);

export async function registrarMarcacao(
  store: PontoStore, orgId: string, input: MarcacaoInput, now: () => Date, opts: { faceMin?: number; alertasExtra?: Alerta[] } = {},
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
  let face = input.face && Number.isFinite(input.face.score) ? { ...input.face } : null;
  const probeDescriptor = sanitizeDescriptor(input.faceDescriptor);
  if (probeDescriptor && pessoa.biometria?.status === 'cadastrada' && pessoa.biometria.vetoresSelados) {
    const enrolled = openFaceDescriptors(pessoa.biometria.vetoresSelados);
    if (enrolled?.length) {
      const serverMatch = matchFace1to1(probeDescriptor, enrolled, opts.faceMin ?? FACE_MIN);
      face = {
        score: serverMatch.score,
        ...(face?.liveness !== undefined ? { liveness: face.liveness } : {}),
        modelo: face?.modelo || pessoa.biometria.modelo || FACE_MODEL_VERSION,
      };
    }
  }
  const fotoDataUrl = sanitizePontoPhoto(input.fotoDataUrl);
  const prox = obraMaisProxima(gps, await store.listObras(orgId), cfg.raioM);
  const metodo: MetodoIdent = input.metodo === 'pin' || input.metodo === 'nenhum' || input.metodo === 'rosto' ? input.metodo : face ? 'rosto' : 'nenhum';
  if (metodo === 'pin' && !conferePin(String(input.pin ?? ''), pessoa.pinHash)) throw new PontoErro(403, 'PIN incorreto.');

  const alertas: Alerta[] = [];
  if (!gps) alertas.push('sem_gps');
  else if (!prox || !prox.dentro) alertas.push('fora_da_cerca');
  if (face && face.score < (opts.faceMin ?? FACE_MIN)) alertas.push('rosto');
  const desvio = Date.parse(dataHora) - Date.parse(gravadoEm);
  const temRelogio = !!input.relogio && Number.isFinite(Date.parse(input.relogio.sincronizadoEm)) && Number.isFinite(input.relogio.decorridoMs);
  let relogioRuim = desvio > RELOGIO_FOLGA_MS // marcação "no futuro" em relação ao servidor
    || (!input.offline && Math.abs(desvio) > ONLINE_FOLGA_MS) // online tem que bater com a hora do servidor
    || (!!input.offline && !temRelogio); // offline sem referência de relógio
  if (temRelogio) {
    const esperado = Date.parse(input.relogio!.sincronizadoEm) + input.relogio!.decorridoMs;
    if (Math.abs(Date.parse(dataHora) - esperado) > RELOGIO_FOLGA_MS) relogioRuim = true;
  }
  if (relogioRuim) alertas.push('relogio');
  if (input.offline) alertas.push('offline');
  if (!face) alertas.push('sem_biometria');
  for (const a of opts.alertasExtra ?? []) if (!alertas.includes(a)) alertas.push(a);

  const dentro = prox && prox.dentro ? prox : null;
  const clientKey = `${String(input.deviceId ?? '')}__${input.clientId}`;
  const { registro, duplicada } = await store.appendMarcacao(estab.id, orgId, clientKey, (prev) => {
    const nsr = prev.nsr + 1;
    const campos = camposTipo7({ nsr, dataHora, cpf: pessoa.cpf, gravadoEm, coletor: '01', offline: !!input.offline });
    return {
      id: nsrKey(estab.id, nsr), orgId, estabId: estab.id, nsr, rhId: pessoa.rhId, cpf: pessoa.cpf, tipo: input.tipo,
      dataHora, dia: diaBrt(dataHora), gravadoEm, diaGrav: diaBrt(gravadoEm), coletor: '01', offline: !!input.offline, metodo,
      campos, hash: hashTipo7(campos, prev.hash), prevHash: prev.hash, clientId: input.clientId, deviceId: String(input.deviceId ?? ''),
      gps, face, ...(fotoDataUrl ? { fotoDataUrl } : {}), unitId: dentro?.unitId ?? null, distM: prox?.distM ?? null, alertas,
    };
  });
  if (duplicada && registro.rhId !== pessoa.rhId) throw new PontoErro(409, 'Este código de marcação já foi usado para outra pessoa.');

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
