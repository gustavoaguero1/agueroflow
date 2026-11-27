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

export interface ImageFaceAnalysis {
  status: 'ok' | 'no_face' | 'multiple_faces' | 'low_quality';
  descriptor?: number[];
  confidence?: number;
  brightness?: number;
  qualityLabel?: 'otima' | 'boa' | 'atencao';
  message: string;
  /** Miniatura local com retângulo verde no rosto para conferência imediata (nunca enviada ao servidor). */
  previewDataUrl?: string;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir esta imagem. Use JPG, PNG ou WebP.'));
    };
    img.src = url;
  });
}

function computeRegionBrightness(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.min(ctx.canvas.width - sx, Math.floor(w)));
  const sh = Math.max(1, Math.min(ctx.canvas.height - sy, Math.floor(h)));
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let sum = 0;
  let count = 0;
  // Amostra a cada 4 pixels para ser instantâneo
  for (let i = 0; i < data.length; i += 16) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count += 1;
  }
  return count > 0 ? Math.round(sum / count) : 128;
}

/**
 * Analisa uma foto enviada (3x4, foto de admissão ou selfie frontal), valida qualidade
 * (rosto único, tamanho mínimo, brilho) e extrai o vetor 128-D localmente no navegador.
 */
export async function analyzeImageFile(file: File): Promise<ImageFaceAnalysis> {
  const img = await loadImageElement(file);
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(120, Math.round(img.naturalWidth * scale));
  const h = Math.max(120, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { status: 'low_quality', message: 'Erro ao preparar a imagem no navegador.' };
  }
  ctx.drawImage(img, 0, 0, w, h);

  await loadFaceModels();
  const faceapi = await getFaceApi();
  await yieldToMain(20);

  // Tenta inputSize 320 primeiro (rápido e ótimo para selfies/3x4) e 416 como segunda chance para fotos mais distantes
  let detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.24 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  if (!detections || detections.length === 0) {
    await yieldToMain(20);
    detections = await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.20 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();
  }

  await yieldToMain(16);

  if (!detections || detections.length === 0) {
    return {
      status: 'no_face',
      message: 'Nenhum rosto nítido detectado. Use uma foto frontal bem iluminada, sem boné ou óculos escuros.',
    };
  }

  const sorted = [...detections].sort(
    (a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height,
  );
  const mainArea = sorted[0].detection.box.width * sorted[0].detection.box.height;
  const foreground = sorted.filter((it) => it.detection.box.width * it.detection.box.height >= mainArea * 0.35);

  if (foreground.length > 1) {
    return {
      status: 'multiple_faces',
      message: 'Mais de uma pessoa aparece na foto. Envie uma foto individual (3x4 ou selfie só do colaborador).',
    };
  }

  const d = foreground[0];
  const box = d.detection.box;
  const descriptor = sanitizeDescriptor(d.descriptor);
  if (!descriptor) {
    return { status: 'low_quality', message: 'Não foi possível extrair o vetor facial desta imagem.' };
  }

  const brightness = computeRegionBrightness(ctx, box.x, box.y, box.width, box.height);
  const confidence = Math.round(d.detection.score * 100) / 100;

  if (box.width < 48 || box.height < 48) {
    return {
      status: 'low_quality',
      brightness,
      confidence,
      message: 'O rosto está muito pequeno ou distante na foto. Envie uma foto mais próxima (tipo 3x4 ou selfie).',
    };
  }
  if (brightness < 38) {
    return {
      status: 'low_quality',
      brightness,
      confidence,
      message: 'A foto está muito escura no rosto. Tire ou envie uma foto em local mais iluminado.',
    };
  }
  if (brightness > 242) {
    return {
      status: 'low_quality',
      brightness,
      confidence,
      message: 'A foto está estourada de luz no rosto. Evite flash direto ou sol forte atrás/na frente.',
    };
  }

  // Gera miniatura local com moldura verde no rosto detectado para feedback visual imediato
  const previewCanvas = document.createElement('canvas');
  const pScale = Math.min(1, 220 / Math.max(w, h));
  previewCanvas.width = Math.max(80, Math.round(w * pScale));
  previewCanvas.height = Math.max(80, Math.round(h * pScale));
  const pCtx = previewCanvas.getContext('2d');
  let previewDataUrl: string | undefined;
  if (pCtx) {
    pCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
    pCtx.strokeStyle = '#10B981';
    pCtx.lineWidth = 3;
    pCtx.strokeRect(box.x * pScale, box.y * pScale, box.width * pScale, box.height * pScale);
    previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.75);
  }

  const qualityLabel: 'otima' | 'boa' | 'atencao' =
    confidence >= 0.72 && brightness >= 70 && brightness <= 215
      ? 'otima'
      : confidence >= 0.45
      ? 'boa'
      : 'atencao';

  return {
    status: 'ok',
    descriptor,
    confidence,
    brightness,
    qualityLabel,
    previewDataUrl,
    message:
      qualityLabel === 'otima'
        ? `Rosto validado com ótima nitidez (${Math.round(confidence * 100)}%).`
        : qualityLabel === 'boa'
        ? `Rosto validado com boa qualidade (${Math.round(confidence * 100)}%).`
        : `Rosto aceito (${Math.round(confidence * 100)}%), mas recomenda-se adicionar mais 1 selfie bem iluminada.`,
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

  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);

  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (dataUrl.length > 72_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.55);
  }
  return dataUrl;
}
