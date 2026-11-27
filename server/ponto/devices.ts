// Pareamento de aparelho (celular pessoal ou totem da obra) e conferência de assinatura.
// O aparelho guarda a chave privada; o servidor guarda só a pública e confere cada envio.
import { randomInt, randomUUID, webcrypto } from 'node:crypto';
import { isValidCpf } from '../../src/ponto/cpf.ts';
import { toBrt } from '../../src/ponto/tempo.ts';
import { PontoErro } from './registrar.ts';
import type { Device, Pairing, PontoStore } from './store.ts';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALIDADE_MS = 10 * 60_000;

const gerarCodigo = () => Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');

export async function criarPareamento(
  store: PontoStore,
  p: { orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string; criadoPor: string },
  now: () => Date,
): Promise<Pairing> {
  if (p.modo === 'pessoal') {
    const pessoa = p.rhId ? await store.getPessoa(p.orgId, p.rhId) : undefined;
    if (!pessoa || !isValidCpf(pessoa.cpf) || !pessoa.estabelecimentoId) {
      throw new PontoErro(400, 'Cadastre CPF e estabelecimento antes de parear.');
    }
  } else if (p.modo === 'totem') {
    if (!p.unitId) throw new PontoErro(400, 'Escolha a obra do totem.');
  } else {
    throw new PontoErro(400, 'Modo inválido.');
  }
  const pairing: Pairing = {
    code: gerarCodigo(), orgId: p.orgId, modo: p.modo,
    ...(p.modo === 'pessoal' ? { rhId: p.rhId } : { unitId: p.unitId }),
    expiraEm: new Date(now().getTime() + VALIDADE_MS).toISOString(), criadoPor: p.criadoPor,
  };
  await store.savePairing(pairing);
  return pairing;
}

export async function concluirPareamento(
  store: PontoStore, p: { code: string; publicKeyJwk: JsonWebKey; nome: string }, now: () => Date,
): Promise<Device> {
  const invalido = new PontoErro(400, 'Código inválido ou vencido.');
  const code = String(p.code ?? '').trim().toUpperCase();
  const pairing = await store.getPairing(code);
  if (!pairing || pairing.usadoEm || Date.parse(pairing.expiraEm) < now().getTime()) throw invalido;
  if (!p.publicKeyJwk || p.publicKeyJwk.kty !== 'EC' || p.publicKeyJwk.crv !== 'P-256') throw new PontoErro(400, 'Chave do aparelho inválida.');
  if (!(await store.markPairingUsed(code, now().toISOString()))) throw invalido;

  const at = toBrt(now());
  if (pairing.modo === 'pessoal' && pairing.rhId) {
    for (const d of await store.listDevices(pairing.orgId)) {
      if (d.modo === 'pessoal' && d.rhId === pairing.rhId && !d.revogadoEm) await store.revokeDevice(d.id, at);
    }
  }
  const { kty, crv, x, y } = p.publicKeyJwk;
  const device: Device = {
    id: `dev_${randomUUID()}`, orgId: pairing.orgId, modo: pairing.modo,
    ...(pairing.rhId ? { rhId: pairing.rhId } : {}), ...(pairing.unitId ? { unitId: pairing.unitId } : {}),
    publicKeyJwk: { kty, crv, x, y }, nome: String(p.nome ?? '').slice(0, 80) || 'Aparelho', criadoEm: at,
  };
  await store.saveDevice(device);
  return device;
}

/** ECDSA P-256 / SHA-256; assinatura em base64 no formato IEEE P1363 (o padrão do WebCrypto). */
export async function verificarAssinatura(publicKeyJwk: JsonWebKey, payload: string, signatureB64: string): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Buffer.from(String(signatureB64 ?? ''), 'base64');
    if (sig.length !== 64) return false;
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}
