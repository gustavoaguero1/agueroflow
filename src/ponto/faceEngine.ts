/**
 * Motor de reconhecimento facial local e offline no navegador usando @vladmandic/face-api (MIT).
 *
 * Correções importantes de confiabilidade em câmeras reais (notebook + celular Android/iOS):
 * - Desenha cada quadro do <video> num <canvas> 2D normalizado (<= 480px) antes da inferência,
 *   evitando falhas de textura WebGL/YUV em alguns navegadores.
 * - Usa SSD MobileNetV1 como detector principal (muito mais confiável para rostos próximos, barba,
 *   óculos e luz de teto) com fallback automático para TinyFaceDetector (inputSize 320, threshold 0.22).
 * - Os modelos ficam em /ponto-models e são cacheados pelo Service Worker para rodar 100% offline.
 */
import {
  computeEyeAspectRatio,
  computeHeadYawRatio,
  sanitizeDescriptor,
  type Point2D,
} from './faceMath';

type FaceApiModule = typeof import('@vladmandic/face-api');

let faceApiPromise: Promise<FaceApiModule> | null = null;
let modelsLoadedPromise: Promise<void> | null = null;
let workCanvas: HTMLCanvasElement | null = null;

export interface VideoFaceAnalysis {
  status: 'ok' | 'no_face' | 'multiple_faces';
  descriptor?: number[];
  ear?: number;
  yaw?: number;
  boxCx?: number;
  boxCy?: number;
  boxAreaRatio?: number;
  confidence?: number;
}

async function getFaceApi(): Promise<FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api');
  }
  return faceApiPromise;
}

function drawVideoToCanvas(video: HTMLVideoElement, maxWidth = 480): HTMLCanvasElement | null {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.max(160, Math.round(video.videoWidth * scale));
  const h = Math.max(120, Math.round(video.videoHeight * scale));

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

/**
 * Carrega os modelos locais de /ponto-models (SSD MobileNetV1 + TinyFaceDetector + Landmarks68Tiny + FaceRecognition).
 * Idempotente: chamadas subsequentes reutilizam os modelos em memória.
 */
export async function loadFaceModels(onStatus?: (msg: string) => void): Promise<void> {
  if (modelsLoadedPromise) return modelsLoadedPromise;

  modelsLoadedPromise = (async () => {
    onStatus?.('Inicializando motor biométrico...');
    const faceapi = await getFaceApi();
    const tfAny = faceapi.tf as unknown as { ready?: () => Promise<void> } | undefined;
    if (typeof tfAny?.ready === 'function') {
      await tfAny.ready();
    }
    const modelUrl = '/ponto-models';

    onStatus?.('Carregando detector facial de alta precisão...');
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl),
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
    ]);

    onStatus?.('Carregando pontos faciais (prova de vida)...');
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);

    onStatus?.('Carregando modelo de reconhecimento (128-D)...');
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);

    onStatus?.('Motor facial pronto.');
  })().catch((err) => {
    modelsLoadedPromise = null;
    throw err;
  });

  return modelsLoadedPromise;
}

export function areFaceModelsLoaded(): boolean {
  return modelsLoadedPromise !== null;
}

/**
 * Analisa um quadro do elemento <video> via canvas 2D normalizado, garantindo rosto único e extraindo
 * descriptor 128-D + métricas de prova de vida (EAR dos olhos, Yaw e posição).
 */
export async function analyzeVideoFrame(video: HTMLVideoElement): Promise<VideoFaceAnalysis> {
  const canvas = drawVideoToCanvas(video, 480);
  if (!canvas) {
    return { status: 'no_face' };
  }

  await loadFaceModels();
  const faceapi = await getFaceApi();

  // 1. Detector principal: SSD MobileNetV1 (excelente para rostos próximos, barba, óculos e luz de teto)
  let detections = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  // 2. Fallback automático: TinyFaceDetector calibrado
  if (!detections || detections.length === 0) {
    detections = await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.22 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();
  }

  if (!detections || detections.length === 0) {
    return { status: 'no_face' };
  }

  // Se houver rostos de fundo muito pequenos (< 25% da área do maior rosto), considera apenas o rosto principal em primeiro plano
  const sorted = [...detections].sort(
    (a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height,
  );
  const mainArea = sorted[0].detection.box.width * sorted[0].detection.box.height;
  const foregroundFaces = sorted.filter((item) => item.detection.box.width * item.detection.box.height >= mainArea * 0.35);

  if (foregroundFaces.length > 1) {
    return { status: 'multiple_faces' };
  }

  const d = foregroundFaces[0];
  const descriptor = sanitizeDescriptor(d.descriptor);
  if (!descriptor) {
    return { status: 'no_face' };
  }

  const pts: Point2D[] = d.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
  const leftEye = pts.slice(36, 42);
  const rightEye = pts.slice(42, 48);
  const ear = (computeEyeAspectRatio(leftEye) + computeEyeAspectRatio(rightEye)) / 2;
  const yaw = computeHeadYawRatio(pts);

  const box = d.detection.box;
  const vw = canvas.width;
  const vh = canvas.height;
  const boxCx = (box.x + box.width / 2) / vw;
  const boxCy = (box.y + box.height / 2) / vh;
  const boxAreaRatio = (box.width * box.height) / (vw * vh);

  return {
    status: 'ok',
    descriptor,
    ear,
    yaw,
    boxCx,
    boxCy,
    boxAreaRatio,
    confidence: d.detection.score,
  };
}

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

  // Espelha horizontalmente para ficar natural como selfie
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (dataUrl.length > 72_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.55);
  }
  return dataUrl;
}
