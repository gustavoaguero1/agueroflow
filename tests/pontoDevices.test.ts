import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { criarPareamento, concluirPareamento, verificarAssinatura } from '../server/ponto/devices.ts';
import { PontoErro } from '../server/ponto/registrar.ts';

const subtle = webcrypto.subtle;
const t0 = new Date('2026-11-25T10:00:00Z');
const at = (min: number) => () => new Date(t0.getTime() + min * 60_000);

async function keyPair() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { kp, jwk: await subtle.exportKey('jwk', kp.publicKey) };
}
const sign = async (key: CryptoKey, s: string) =>
  Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(s))).toString('base64');

async function fixture() {
  const store = memoryPontoStore();
  await store.saveEstab({ id: 'e1', orgId: 'org', cnpj: '11222333000181', razaoSocial: 'AGUERO' });
  await store.savePessoa({ orgId: 'org', rhId: 'r1', nome: 'Ana', cpf: '52998224725', estabelecimentoId: 'e1', vinculo: 'CLT' });
  return store;
}

test('código de 8 caracteres, uso único, vence em 10 min', async () => {
  const store = await fixture();
  const p = await criarPareamento(store, { orgId: 'org', modo: 'pessoal', rhId: 'r1', criadoPor: 'u' }, at(0));
  assert.match(p.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const { jwk } = await keyPair();
  const dev = await concluirPareamento(store, { code: p.code, publicKeyJwk: jwk, nome: 'Moto G' }, at(1));
  assert.equal(dev.rhId, 'r1');
  assert.equal(dev.modo, 'pessoal');
  await assert.rejects(concluirPareamento(store, { code: p.code, publicKeyJwk: jwk, nome: 'x' }, at(2)), (e: any) => e instanceof PontoErro && e.status === 400);
  const p2 = await criarPareamento(store, { orgId: 'org', modo: 'pessoal', rhId: 'r1', criadoPor: 'u' }, at(0));
  await assert.rejects(concluirPareamento(store, { code: p2.code, publicKeyJwk: jwk, nome: 'x' }, at(11)), /Código inválido ou vencido/);
  await assert.rejects(concluirPareamento(store, { code: 'NAOEXIST', publicKeyJwk: jwk, nome: 'x' }, at(1)), /Código inválido ou vencido/);
});

test('pessoa sem CPF ou sem estabelecimento não pareia', async () => {
  const store = await fixture();
  await store.savePessoa({ orgId: 'org', rhId: 'r2', nome: 'Bia', cpf: '', estabelecimentoId: 'e1', vinculo: 'PJ' });
  await store.savePessoa({ orgId: 'org', rhId: 'r3', nome: 'Caio', cpf: '52998224725', estabelecimentoId: '', vinculo: 'CLT' });
  for (const rhId of ['r2', 'r3', 'nao-existe']) {
    await assert.rejects(criarPareamento(store, { orgId: 'org', modo: 'pessoal', rhId, criadoPor: 'u' }, at(0)), /Cadastre CPF e estabelecimento antes de parear/);
  }
});

test('novo celular da mesma pessoa revoga o anterior', async () => {
  const store = await fixture();
  const { jwk } = await keyPair();
  const p1 = await criarPareamento(store, { orgId: 'org', modo: 'pessoal', rhId: 'r1', criadoPor: 'u' }, at(0));
  const d1 = await concluirPareamento(store, { code: p1.code, publicKeyJwk: jwk, nome: 'A' }, at(1));
  const p2 = await criarPareamento(store, { orgId: 'org', modo: 'pessoal', rhId: 'r1', criadoPor: 'u' }, at(2));
  const d2 = await concluirPareamento(store, { code: p2.code, publicKeyJwk: jwk, nome: 'B' }, at(3));
  assert.ok((await store.getDevice(d1.id))?.revogadoEm);
  assert.equal((await store.getDevice(d2.id))?.revogadoEm, undefined);
});

test('assinatura válida passa; payload alterado ou outra chave falha', async () => {
  const a = await keyPair();
  const b = await keyPair();
  const sig = await sign(a.kp.privateKey, '{"x":1}');
  assert.equal(await verificarAssinatura(a.jwk, '{"x":1}', sig), true);
  assert.equal(await verificarAssinatura(a.jwk, '{"x":2}', sig), false);
  assert.equal(await verificarAssinatura(b.jwk, '{"x":1}', sig), false);
  assert.equal(await verificarAssinatura(a.jwk, '{"x":1}', 'lixo'), false);
  assert.equal(await verificarAssinatura({ kty: 'oct' } as any, '{"x":1}', sig), false);
});

test('totem pareia a uma obra e não exige pessoa', async () => {
  const store = await fixture();
  const p = await criarPareamento(store, { orgId: 'org', modo: 'totem', unitId: 'u1', criadoPor: 'u' }, at(0));
  const { jwk } = await keyPair();
  const d = await concluirPareamento(store, { code: p.code, publicKeyJwk: jwk, nome: 'Tablet obra' }, at(1));
  assert.equal(d.modo, 'totem');
  assert.equal(d.unitId, 'u1');
  await assert.rejects(criarPareamento(store, { orgId: 'org', modo: 'totem', criadoPor: 'u' }, at(0)), /obra/);
});
