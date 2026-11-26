/**
 * Cofre de segredos do servidor (AES-256-GCM).
 * A chave vem de variável de ambiente (base64 de 32 bytes) e nunca vai para o repositório nem para o navegador.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SealedSecret {
  iv: string;
  tag: string;
  data: string;
}

/** Chave em base64 com exatamente 32 bytes; senão null. */
export function parseSecretKey(b64: string | undefined | null): Buffer | null {
  if (!b64) return null;
  const k = Buffer.from(b64, 'base64');
  return k.length === 32 ? k : null;
}

function keyOrThrow(b64: string): Buffer {
  const k = parseSecretKey(b64);
  if (!k) throw new Error('chave do cofre inválida');
  return k;
}

export function sealSecret(plain: string, keyB64: string): SealedSecret {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOrThrow(keyB64), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function openSecret(box: SealedSecret, keyB64: string): string {
  const d = createDecipheriv('aes-256-gcm', keyOrThrow(keyB64), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
}
