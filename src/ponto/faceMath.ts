/**
 * Matemática biométrica facial pura (sem dependências de DOM ou Node).
 * Compartilhada entre o Coletor PWA (reconhecimento 1:1 e 1:N offline) e o servidor (revalidação).
 */

export const FACE_DIM = 128;
export const FACE_MODEL_VERSION = 'faceapi-resnet128-v1';
export const FACE_MATCH_THRESHOLD = 0.6;
export const FACE_MAX_POSES = 5;
export const LGPD_TERM_VERSION = '2026-11-v1';

export interface Point2D {
  x: number;
  y: number;
}

export interface FaceCandidate {
  rhId: string;
  nome: string;
  descriptors: number[][];
}

export interface FaceMatchResult {
  matched: boolean;
  score: number;
  distance: number;
}

export interface FaceIdentifyResult extends FaceMatchResult {
  rhId: string;
  nome: string;
}

export interface LivenessSample {
  ear: number;
  yaw: number;
  boxCx: number;
  boxCy: number;
}

export interface LivenessResult {
  passed: boolean;
  score: number;
  blinkDetected: boolean;
  motionDetected: boolean;
  reason: string;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Valida e retorna um vetor facial de exatamente 128 números finitos; senão null. */
export function sanitizeDescriptor(raw: unknown): number[] | null {
  if (!Array.isArray(raw) && !(raw instanceof Float32Array)) return null;
  const arr = Array.from(raw as ArrayLike<number>);
  if (arr.length !== FACE_DIM) return null;
  const out = new Array<number>(FACE_DIM);
  for (let i = 0; i < FACE_DIM; i++) {
    const n = Number(arr[i]);
    if (!Number.isFinite(n)) return null;
    out[i] = Math.round(n * 1e6) / 1e6;
  }
  return out;
}

/** Valida um conjunto de 1 a 5 vetores faciais (poses do cadastro). */
export function sanitizeDescriptors(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > FACE_MAX_POSES) return null;
  const out: number[][] = [];
  for (const item of raw) {
    const vec = sanitizeDescriptor(item);
    if (!vec) return null;
    out.push(vec);
  }
  return out;
}

/** Distância euclidiana entre dois vetores faciais de mesma dimensão. */
export function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Converte a distância euclidiana do face-api (ResNet-34 128-D) para score [0..1].
 * Calibrado para alinhar com FACE_MATCH_THRESHOLD = 0.60:
 *   - dist = 0.00 → score 1.00
 *   - dist = 0.40 → score 0.71 (mesma pessoa com alta confiança)
 *   - dist = 0.55 → score 0.60 (limiar de aprovação em ambiente de obra)
 *   - dist = 0.70 → score 0.49 (outra pessoa → alerta)
 */
export function distanceToScore(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  const raw = 1 - distance / 1.38;
  return Math.round(clamp(raw, 0, 1) * 1000) / 1000;
}

/** Comparação 1:1 (celular pessoal): compara contra todas as poses cadastradas e fica com o melhor score. */
export function matchFace1to1(
  probe: readonly number[],
  enrolledDescriptors: readonly (readonly number[])[],
  threshold = FACE_MATCH_THRESHOLD,
): FaceMatchResult {
  let bestDist = Number.POSITIVE_INFINITY;
  for (const ref of enrolledDescriptors) {
    const d = euclideanDistance(probe, ref);
    if (d < bestDist) bestDist = d;
  }
  const score = distanceToScore(bestDist);
  return {
    matched: score >= threshold,
    score,
    distance: Number.isFinite(bestDist) ? Math.round(bestDist * 10000) / 10000 : 99,
  };
}

/** Comparação 1:N (totem da obra): encontra o melhor candidato entre os funcionários com rosto cadastrado. */
export function matchFace1toN(
  probe: readonly number[],
  candidates: readonly FaceCandidate[],
  threshold = FACE_MATCH_THRESHOLD,
): FaceIdentifyResult | null {
  let best: FaceIdentifyResult | null = null;
  for (const cand of candidates) {
    if (!cand.descriptors?.length) continue;
    const res = matchFace1to1(probe, cand.descriptors, threshold);
    if (!best || res.score > best.score) {
      best = { rhId: cand.rhId, nome: cand.nome, ...res };
    }
  }
  return best;
}

const dist2D = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Eye Aspect Ratio (EAR) a partir dos 6 pontos de um olho (landmarks 68: 36..41 esquerdo, 42..47 direito).
 * Olho aberto típico ~0.26–0.36; piscada cai abaixo de ~0.21.
 */
export function computeEyeAspectRatio(eye: readonly Point2D[]): number {
  if (eye.length < 6) return 0;
  const v1 = dist2D(eye[1], eye[5]);
  const v2 = dist2D(eye[2], eye[4]);
  const h = dist2D(eye[0], eye[3]);
  if (h <= 0.0001) return 0;
  return (v1 + v2) / (2 * h);
}

/**
 * Razão horizontal de giro de cabeça (yaw) usando landmarks 68:
 * ponta do nariz (30), canto externo esquerdo (0), canto externo direito (16).
 * Valor próximo de 0 = olhando de frente; negativo = virado para um lado; positivo = outro lado.
 */
export function computeHeadYawRatio(landmarks68: readonly Point2D[]): number {
  if (landmarks68.length < 31) return 0;
  const leftCheek = landmarks68[0];
  const rightCheek = landmarks68[16];
  const nose = landmarks68[30];
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  if (faceWidth <= 1) return 0;
  const midX = (leftCheek.x + rightCheek.x) / 2;
  return Math.round(((nose.x - midX) / (faceWidth / 2)) * 1000) / 1000;
}

/**
 * Avalia prova de vida passiva a partir de uma sequência curta de quadros (~1.2s a 2.5s).
 * Combina variação natural de piscada (EAR), micro-movimento de posição/rotação (yaw + centro do rosto).
 */
export function evaluateLiveness(samples: readonly LivenessSample[]): LivenessResult {
  if (samples.length < 3) {
    return {
      passed: false,
      score: 0,
      blinkDetected: false,
      motionDetected: false,
      reason: 'Aguardando mais quadros do rosto',
    };
  }

  let minEar = Number.POSITIVE_INFINITY;
  let maxEar = Number.NEGATIVE_INFINITY;
  let minYaw = Number.POSITIVE_INFINITY;
  let maxYaw = Number.NEGATIVE_INFINITY;
  let minCx = Number.POSITIVE_INFINITY;
  let maxCx = Number.NEGATIVE_INFINITY;
  let minCy = Number.POSITIVE_INFINITY;
  let maxCy = Number.NEGATIVE_INFINITY;

  for (const s of samples) {
    if (s.ear > 0) {
      if (s.ear < minEar) minEar = s.ear;
      if (s.ear > maxEar) maxEar = s.ear;
    }
    if (s.yaw < minYaw) minYaw = s.yaw;
    if (s.yaw > maxYaw) maxYaw = s.yaw;
    if (s.boxCx < minCx) minCx = s.boxCx;
    if (s.boxCx > maxCx) maxCx = s.boxCx;
    if (s.boxCy < minCy) minCy = s.boxCy;
    if (s.boxCy > maxCy) maxCy = s.boxCy;
  }

  const earDelta = Number.isFinite(minEar) && Number.isFinite(maxEar) ? maxEar - minEar : 0;
  const yawDelta = maxYaw - minYaw;
  const posDelta = Math.hypot(maxCx - minCx, maxCy - minCy);

  // Piscada clara ou variação natural de pálpebra + micro-movimento de rosto vivo
  const blinkDetected = earDelta >= 0.045 || (Number.isFinite(minEar) && minEar < 0.215 && maxEar > 0.25);
  const motionDetected = yawDelta >= 0.045 || posDelta >= 0.014;

  let score = 0.35;
  if (blinkDetected) score += 0.4;
  else score += clamp(earDelta / 0.045, 0, 1) * 0.25;

  if (motionDetected) score += 0.25;
  else score += clamp(Math.max(yawDelta / 0.045, posDelta / 0.014), 0, 1) * 0.2;

  score = Math.round(clamp(score, 0, 1) * 1000) / 1000;
  const passed = blinkDetected || (motionDetected && score >= 0.65);

  return {
    passed,
    score,
    blinkDetected,
    motionDetected,
    reason: passed ? 'Prova de vida confirmada' : 'Pisque uma vez ou mova levemente o rosto',
  };
}
