/**
 * Motor de reconhecimento facial local e offline no navegador usando @vladmandic/face-api (MIT).
 * Os modelos (~6.5 MB) ficam em /ponto-models e são cacheados pelo Service Worker para funcionar sem internet.
 * Carregado sob demanda (dynamic import) para não pesar no bundle principal do ERP.
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

export interface VideoFaceAnalysis {
  status: 'ok' | 'no_face' | 'multiple_faces';
  descriptor?: number[];
  ear?: number;
  yaw?: number;
  boxCx?: number;
  boxCy?: number;
  boxAreaRatio?: number;
}

async function getFaceApi(): Promise<FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api');
  }
  return faceApiPromise;
}

/**
 * Carrega os 3 modelos leves locais de /ponto-models (TinyFaceDetector + Landmarks68Tiny + FaceRecognition).
 * Idempotente: chamadas subsequentes reutilizam os modelos em memória.
 */
export async function loadFaceModels(onStatus?: (msg: string) => void): Promise<void> {
  if (modelsLoadedPromise) return modelsLoadedPromise;

  modelsLoadedPromise = (async () => {
    onStatus?.('Inicializando motor biométrico...');
    const faceapi = await getFaceApi();
    const modelUrl = '/ponto-models';

    onStatus?.('Carregando detector facial offline...');
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);

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
 * Analisa um quadro do elemento <video>, garantindo rosto único e extraindo
 * descriptor 128-D + métricas de prova de vida (EAR dos olhos, Yaw e posição).
 */
export async function analyzeVideoFrame(video: HTMLVideoElement): Promise<VideoFaceAnalysis> {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return { status: 'no_face' };
  }

  await loadFaceModels();
  const faceapi = await getFaceApi();

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.45,
  });

  const detections = await faceapi
    .detectAllFaces(video, options)
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  if (!detections || detections.length === 0) {
    return { status: 'no_face' };
  }
  if (detections.length > 1) {
    return { status: 'multiple_faces' };
  }

  const d = detections[0];
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
  const vw = video.videoWidth;
  const vh = video.videoHeight;
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
  // Se passar de 55 KB, reduz qualidade suavemente
  if (dataUrl.length > 72_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.55);
  }
  return dataUrl;
}
