/**
 * Motor de reconhecimento facial ULTRA-LEVE e offline no navegador (@vladmandic/face-api, MIT).
 *
 * Arquitetura em 2 estágios (ZERO travamento da aba "Página sem resposta"):
 * - Estágio 1 (`detectFacePreview`): roda apenas TinyFaceDetector (189 KB, inputSize 160) + Landmarks68Tiny (76 KB)
 *   sobre um canvas 2D de 240px. NÃO executa a rede pesada ResNet-34 no loop de câmera!
 * - Estágio 2 (`extractFaceDescriptor`): roda a rede FaceRecognition (128-D) SOMENTE no momento exato de
 *   capturar uma pose (3x no cadastro) ou confirmar o ponto (1x na batida), cedendo a main thread antes e depois.
 */
import {
  computeEyeAspectRatio,
  computeHeadYawRatio,
  sanitizeDescriptor,
  type Point2D,
} from './faceMath';

type FaceApiModule = typeof import('@vladmandic/face-api');

let faceApiPromise: Promise<FaceApiModule> | null = null;
let detectorLoadedPromise: Promise<void> | null = null;
let recognitionLoadedPromise: Promise<void> | null = null;
let workCanvas: HTMLCanvasElement | null = null;

export interface FacePreviewResult {
  status: 'ok' | 'no_face' | 'multiple_faces';
  ear?: number;
  yaw?: number;
  boxCx?: number;
  boxCy?: number;
  boxAreaRatio?: number;
  confidence?: number;
}

export interface VideoFaceAnalysis extends FacePreviewResult {
  descriptor?: number[];
}

/** Cede controle ao navegador para a UI nunca congelar ("Página sem resposta"). */
export const yieldToMain = (ms = 24): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

async function getFaceApi(): Promise<FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api');
  }
  return faceApiPromise;
}

async function initTfBackend(faceapi: FaceApiModule): Promise<void> {
  const tfAny = faceapi.tf as unknown as {
    getBackend?: () => string;
    setBackend?: (name: string) => Promise<boolean>;
    ready?: () => Promise<void>;
  } | undefined;
  if (!tfAny) return;
  try {
    if (typeof tfAny.setBackend === 'function' && tfAny.getBackend?.() !== 'webgl') {
      await tfAny.setBackend('webgl').catch(() => undefined);
    }
    if (typeof tfAny.ready === 'function') {
      await tfAny.ready();
    }
  } catch {
    // Segue com o backend padrão disponível
  }
}

function drawVideoToCanvas(video: HTMLVideoElement, maxWidth: number): HTMLCanvasElement | null {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.max(128, Math.round(video.videoWidth * scale));
  const h = Math.max(96, Math.round(video.videoHeight * scale));

  if (!workCanvas) {
    workCanvas = document.createElement('canvas');
  }
  if (workCanvas.width !== w || workCanvas.height !== h) {
    workCanvas.width = w;
    workCanvas.height = h;
  }
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return workCanvas;
}

/** Carrega apenas os 2 modelos minúsculos de preview (265 KB no total — abre em < 1s). */
export async function loadPreviewModels(onStatus?: (msg: string) => void): Promise<void> {
  if (detectorLoadedPromise) return detectorLoadedPromise;
  detectorLoadedPromise = (async () => {
    onStatus?.('Inicializando câmera e detector facial...');
    const faceapi = await getFaceApi();
    await initTfBackend(faceapi);
    await yieldToMain(16);

    const modelUrl = '/ponto-models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    await yieldToMain(16);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);
  })().catch((err) => {
    detectorLoadedPromise = null;
    throw err;
  });
  return detectorLoadedPromise;
}

/** Carrega todos os modelos necessários (detector + landmarks + reconhecimento 128-D). */
export async function loadFaceModels(onStatus?: (msg: string) => void): Promise<void> {
  await loadPreviewModels(onStatus);
  if (recognitionLoadedPromise) return recognitionLoadedPromise;

  recognitionLoadedPromise = (async () => {
    onStatus?.('Carregando modelo de reconhecimento (128-D)...');
    const faceapi = await getFaceApi();
    await yieldToMain(20);
    await faceapi.nets.faceRecognitionNet.loadFromUri('/ponto-models');
    onStatus?.('Motor facial pronto.');
  })().catch((err) => {
    recognitionLoadedPromise = null;
    throw err;
  });

  return recognitionLoadedPromise;
}

export function areFaceModelsLoaded(): boolean {
  return detectorLoadedPromise !== null && recognitionLoadedPromise !== null;
}

/**
 * Estágio 1 (ULTRA-LEVE): detecta presença de rosto único + landmarks para prova de vida e oval verde.
 * NÃO executa a rede pesada ResNet-34 — nunca congela a aba!
 */
export async function detectFacePreview(video: HTMLVideoElement): Promise<FacePreviewResult> {
  const canvas = drawVideoToCanvas(video, 240);
  if (!canvas) return { status: 'no_face' };

  await loadPreviewModels();
  const faceapi = await getFaceApi();
  await yieldToMain(12);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.22 }))
    .withFaceLandmarks(true);

  if (!detections || detections.length === 0) {
    return { status: 'no_face' };
  }

  const sorted = [...detections].sort(
    (a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height,
  );
  const mainArea = sorted[0].detection.box.width * sorted[0].detection.box.height;
  const foreground = sorted.filter((it) => it.detection.box.width * it.detection.box.height >= mainArea * 0.35);

  if (foreground.length > 1) {
    return { status: 'multiple_faces' };
  }

  const d = foreground[0];
  const pts: Point2D[] = d.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
  const leftEye = pts.slice(36, 42);
  const rightEye = pts.slice(42, 48);
  const ear = (computeEyeAspectRatio(leftEye) + computeEyeAspectRatio(rightEye)) / 2;
  const yaw = computeHeadYawRatio(pts);

  const box = d.detection.box;
  return {
    status: 'ok',
    ear,
    yaw,
    boxCx: (box.x + box.width / 2) / canvas.width,
    boxCy: (box.y + box.height / 2) / canvas.height,
    boxAreaRatio: (box.width * box.height) / (canvas.width * canvas.height),
    confidence: d.detection.score,
  };
}

/**
 * Estágio 2 (SOB DEMANDA): extrai o vetor facial 128-D do quadro atual para cadastro ou conferência do ponto.
 * Chamado apenas 1 vez por captura (não em loop contínuo).
 */
export async function extractFaceDescriptor(video: HTMLVideoElement): Promise<VideoFaceAnalysis> {
  const canvas = drawVideoToCanvas(video, 320);
  if (!canvas) return { status: 'no_face' };

  await loadFaceModels();
  const faceapi = await getFaceApi();
  await yieldToMain(24);

  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.22 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  await yieldToMain(24);

  if (!detections || detections.length === 0) {
    return { status: 'no_face' };
  }

  const sorted = [...detections].sort(
    (a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height,
  );
  const mainArea = sorted[0].detection.box.width * sorted[0].detection.box.height;
  const foreground = sorted.filter((it) => it.detection.box.width * it.detection.box.height >= mainArea * 0.35);

  if (foreground.length > 1) {
    return { status: 'multiple_faces' };
  }

  const d = foreground[0];
  const descriptor = sanitizeDescriptor(d.descriptor);
  if (!descriptor) return { status: 'no_face' };

  const pts: Point2D[] = d.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
  const leftEye = pts.slice(36, 42);
  const rightEye = pts.slice(42, 48);
  const ear = (computeEyeAspectRatio(leftEye) + computeEyeAspectRatio(rightEye)) / 2;
  const yaw = computeHeadYawRatio(pts);
  const box = d.detection.box;

  return {
    status: 'ok',
    descriptor,
    ear,
    yaw,
    boxCx: (box.x + box.width / 2) / canvas.width,
    boxCy: (box.y + box.height / 2) / canvas.height,
    boxAreaRatio: (box.width * box.height) / (canvas.width * canvas.height),
    confidence: d.detection.score,
  };
}

/** Mantido por compatibilidade — delega para extractFaceDescriptor. */
export const analyzeVideoFrame = extractFaceDescriptor;

/**
 * Captura selfie comprimida (~18-30 KB em JPEG 300px) para conferência visual no Espelho do RH.
 */
export function captureCompressedSelfie(
  video: HTMLVideoElement,
  maxWidth = 300,
  quality = 0.72,
): string | null {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.max(80, Math.round(video.videoWidth * scale));
  const h = Math.max(80, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (dataUrl.length > 72_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.55);
  }
  return dataUrl;
}
