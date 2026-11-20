import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(plain, salt, KEY_BYTES);
  return `${PREFIX}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const [, saltB64, keyB64] = parts;
  if (!BASE64_RE.test(saltB64) || !BASE64_RE.test(keyB64)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

  const actual = await scrypt(plain, salt, KEY_BYTES);
  return timingSafeEqual(actual, expected);
}
