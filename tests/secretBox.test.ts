import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sealSecret, openSecret, parseSecretKey } from '../server/secretBox.ts';

const key = randomBytes(32).toString('base64');

test('cofre: guarda e devolve a senha sem deixá-la em texto puro', () => {
  const box = sealSecret('Senha-de-teste-123', key);
  assert.ok(box.iv && box.tag && box.data);
  assert.ok(!JSON.stringify(box).includes('Senha-de-teste-123'));
  assert.equal(openSecret(box, key), 'Senha-de-teste-123');
});

test('cofre: cada gravação usa um vetor novo (mesma senha, caixas diferentes)', () => {
  const a = sealSecret('x', key);
  const b = sealSecret('x', key);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('cofre: chave errada ou caixa adulterada não abrem', () => {
  const box = sealSecret('segredo', key);
  assert.throws(() => openSecret(box, randomBytes(32).toString('base64')));
  const flipped = { ...box, data: Buffer.from('outro conteúdo').toString('base64') };
  assert.throws(() => openSecret(flipped, key));
});

test('cofre: chave precisa ter 32 bytes em base64', () => {
  assert.equal(parseSecretKey(undefined), null);
  assert.equal(parseSecretKey(''), null);
  assert.equal(parseSecretKey(Buffer.from('curta').toString('base64')), null);
  assert.equal(parseSecretKey(key)?.length, 32);
});
