import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../server/passwords.ts';

test('hash roundtrip', async () => {
  const hash = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', hash), true);
});

test('wrong password rejected', async () => {
  const hash = await hashPassword('correct horse');
  assert.equal(await verifyPassword('battery staple', hash), false);
});

test('hash format is scrypt$salt$key', async () => {
  const hash = await hashPassword('x');
  const parts = hash.split('$');
  assert.equal(parts.length, 3);
  assert.equal(parts[0], 'scrypt');
  assert.equal(Buffer.from(parts[1], 'base64').length, 16);
  assert.equal(Buffer.from(parts[2], 'base64').length, 64);
});

test('two hashes of same password differ', async () => {
  const a = await hashPassword('same');
  const b = await hashPassword('same');
  assert.notEqual(a, b);
});

test('malformed stored value returns false', async () => {
  const valid = await hashPassword('pw');
  const [, salt, key] = valid.split('$');
  const bad = [
    '',
    'garbage',
    `bcrypt$${salt}$${key}`,
    `scrypt$${salt}`,
    `scrypt$${salt}$${key}$extra`,
    'scrypt$!!!notb64$!!!notb64',
    `scrypt$${salt}$${Buffer.alloc(32).toString('base64')}`,
    `scrypt$${Buffer.alloc(8).toString('base64')}$${key}`,
  ];
  for (const stored of bad) {
    assert.equal(await verifyPassword('pw', stored), false, `stored=${stored}`);
  }
});
