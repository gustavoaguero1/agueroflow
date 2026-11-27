/**
 * Criptografia AES-256-GCM para vetores biométricos faciais (LGPD) e validação de selfie comprimida.
 * Os embeddings nunca ficam em texto aberto no Firestore.
 */
import { createHash } from 'node:crypto';
import { openSecret, parseSecretKey, sealSecret, type SealedSecret } from '../secretBox.ts';
import { sanitizeDescriptors } from '../../src/ponto/faceMath.ts';

export const MAX_PHOTO_BYTES = 65_000; // ~20-35 KB típico (JPEG 300px), teto seguro de 65 KB
const PHOTO_DATA_URL_RE = /^data:image\/(jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Resolve a chave AES-256 de 32 bytes para o cofre biométrico.
 * Prioriza PONTO_BIO_SECRET_KEY (base64 de 32 bytes). Em ambientes sem variável explícita,
 * deriva uma chave determinística estável para o ambiente sem gravar vetores em texto plano.
 */
export function resolveBioSecretKey(explicitKey?: string): string {
  const candidate = explicitKey ?? process.env.PONTO_BIO_SECRET_KEY;
  if (parseSecretKey(candidate)) return candidate!;
  const fallbackSeed =
    process.env.PONTO_BIO_SECRET_KEY ||
    process.env.MARTRAVEL_SECRET_KEY ||
    process.env.FIREBASE_PROJECT_ID ||
    'agueroflow-ponto-bio-local-dev-key';
  return createHash('sha256').update(`agueroflow-ponto-bio-v1:${fallbackSeed}`).digest('base64');
}

export function sealFaceDescriptors(descriptors: number[][], explicitKey?: string): SealedSecret {
  const clean = sanitizeDescriptors(descriptors);
  if (!clean) throw new Error('Vetores faciais inválidos.');
  return sealSecret(JSON.stringify(clean), resolveBioSecretKey(explicitKey));
}

export function openFaceDescriptors(box: SealedSecret | undefined | null, explicitKey?: string): number[][] | null {
  if (!box?.iv || !box?.tag || !box?.data) return null;
  try {
    const raw = openSecret(box, resolveBioSecretKey(explicitKey));
    return sanitizeDescriptors(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Valida a selfie comprimida enviada pelo coletor de ponto.
 * Retorna a string limpa se válida, ou null se ausente/inválida (nunca bloqueia a marcação).
 */
export function sanitizePontoPhoto(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = PHOTO_DATA_URL_RE.exec(trimmed);
  if (!match) return null;
  const base64Body = match[2];
  const estimatedBytes = Math.floor((base64Body.length * 3) / 4);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_PHOTO_BYTES) return null;
  return trimmed;
}
