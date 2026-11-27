/**
 * Modal guiado de Cadastro Facial + Termo de Ciência Biométrica (LGPD).
 * Suporta dois modos no mesmo fluxo (tanto no RH quanto no celular do funcionário):
 *  1. Enviar foto (3x4, foto da admissão ou 1 a 3 selfies frontais): extrai os vetores 128-D no navegador
 *     com validação automática de qualidade (rosto único, tamanho mínimo e brilho) + preview verde local.
 *     As fotos nunca são enviadas nem salvas no servidor (apenas os vetores cifrados AES-256-GCM).
 *  2. Câmera ao vivo: loop leve em 2 estágios (265 KB no preview + extração 128-D sob demanda, zero travamento).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  X,
  RotateCcw,
  KeyRound,
  ExternalLink,
  ScanFace,
  Upload,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  analyzeImageFile,
  detectFacePreview,
  extractFaceDescriptor,
  loadFaceModels,
  loadPreviewModels,
  yieldToMain,
  type ImageFaceAnalysis,
} from '../../ponto/faceEngine';
import { FACE_MAX_POSES, FACE_MODEL_VERSION, LGPD_TERM_VERSION } from '../../ponto/faceMath';

interface FaceEnrollModalProps {
  personName: string;
  /** 'rh' quando aberto pela equipe do RH; 'self' quando aberto no celular do próprio funcionário */
  context: 'rh' | 'self';
  /** Quantidade de poses já cadastradas (quando > 0, oferece somar novas fotos/poses até 5) */
  existingPoses?: number;
  /** URL opcional para abrir a captura em nova aba caso o ERP esteja dentro de um iframe sem permissão de câmera */
  openInNewTabUrl?: string;
  onSaveFace: (payload: {
    descriptors: number[][];
    lgpdAceito: true;
    adicionar?: boolean;
    modelo: string;
    lgpdVersao: string;
  }) => Promise<void>;
  onDeclineBiometrics: (payload: { recusar: true; lgpdVersao: string }) => Promise<void>;
  onClose: () => void;
}

interface UploadedFaceItem {
  id: string;
  fileName: string;
  analysis: ImageFaceAnalysis;
}

const POSES = [
  { id: 'frente', title: 'Pose 1 de 3 — Olhe de frente', hint: 'Mantenha o rosto centralizado no círculo.' },
  { id: 'angulo', title: 'Pose 2 de 3 — Mova levemente o rosto', hint: 'Um leve giro ajuda no reconhecimento em obra.' },
  { id: 'final', title: 'Pose 3 de 3 — Confirmação final', hint: 'Olhe de frente novamente para concluir.' },
] as const;

export const FaceEnrollModal: React.FC<FaceEnrollModalProps> = ({
  personName,
  context,
  existingPoses = 0,
  openInNewTabUrl,
  onSaveFace,
  onDeclineBiometrics,
  onClose,
}) => {
  const [step, setStep] = useState<'lgpd' | 'photo' | 'capture' | 'saving' | 'done'>('lgpd');
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [appendMode, setAppendMode] = useState(existingPoses > 0 && existingPoses < FACE_MAX_POSES);

  // Modo câmera
  const [modelStatus, setModelStatus] = useState<string>('Preparando câmera e motor biométrico...');
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetectedNow, setFaceDetectedNow] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [descriptors, setDescriptors] = useState<number[][]>([]);
  const [feedback, setFeedback] = useState<string>('Posicione o rosto dentro do círculo.');
  const [cameraBlockedInIframe, setCameraBlockedInIframe] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

  // Modo foto (3x4 / selfie)
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedFaceItem[]>([]);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoStatusMsg, setPhotoStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busyDecline, setBusyDecline] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const poseIndexRef = useRef(0);
  const descriptorsRef = useRef<number[][]>([]);
  const lastCaptureAtRef = useRef(0);
  const stableHitsRef = useRef(0);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setFaceDetectedNow(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const finishAndSave = useCallback(
    async (collected: number[][], returnStep: 'photo' | 'capture') => {
      stopCamera();
      setStep('saving');
      setError(null);
      try {
        await onSaveFace({
          descriptors: collected,
          lgpdAceito: true,
          adicionar: appendMode && existingPoses > 0,
          modelo: FACE_MODEL_VERSION,
          lgpdVersao: LGPD_TERM_VERSION,
        });
        setStep('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível salvar o cadastro facial.');
        setStep(returnStep);
      }
    },
    [appendMode, existingPoses, onSaveFace, stopCamera],
  );

  const registerCapturedPose = useCallback(
    async (descriptor: number[]) => {
      const nextCollected = [...descriptorsRef.current, descriptor];
      descriptorsRef.current = nextCollected;
      setDescriptors(nextCollected);
      lastCaptureAtRef.current = Date.now();
      stableHitsRef.current = 0;

      if (nextCollected.length >= POSES.length) {
        await finishAndSave(nextCollected, 'capture');
      } else {
        poseIndexRef.current = nextCollected.length;
        setPoseIndex(nextCollected.length);
        setFeedback(`Pose ${nextCollected.length} capturada! ${POSES[nextCollected.length].title}`);
      }
    },
    [finishAndSave],
  );

  const startCapture = useCallback(async () => {
    stopCamera();
    setError(null);
    setCameraBlockedInIframe(false);
    setPoseIndex(0);
    poseIndexRef.current = 0;
    setDescriptors([]);
    descriptorsRef.current = [];
    lastCaptureAtRef.current = 0;
    stableHitsRef.current = 0;
    setFaceDetectedNow(false);
    setStep('capture');
    runningRef.current = true;

    try {
      setModelStatus('Abrindo câmera...');
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Navegador sem suporte à câmera (verifique se está em HTTPS).');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 480 },
          height: { ideal: 360 },
        },
        audio: false,
      });
      if (!runningRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);

      await loadPreviewModels((msg) => setModelStatus(msg));
      if (!runningRef.current) return;
      await loadFaceModels((msg) => setModelStatus(msg));
      if (!runningRef.current) return;

      setModelsReady(true);
      setFeedback('Câmera pronta — centralize o rosto no círculo.');

      const tick = async () => {
        if (!runningRef.current || !videoRef.current) return;
        try {
          const preview = await detectFacePreview(videoRef.current);
          if (!runningRef.current) return;

          if (preview.status === 'no_face') {
            stableHitsRef.current = 0;
            setFaceDetectedNow(false);
            setFeedback('Aguardando rosto no círculo... mantenha boa iluminação.');
          } else if (preview.status === 'multiple_faces') {
            stableHitsRef.current = 0;
            setFaceDetectedNow(false);
            setFeedback('Mais de um rosto detectado. Deixe apenas o colaborador na câmera.');
          } else {
            setFaceDetectedNow(true);
            if ((preview.boxAreaRatio ?? 0) < 0.025) {
              stableHitsRef.current = 0;
              setFeedback('Rosto detectado! Aproxime só um pouco mais da câmera.');
            } else {
              stableHitsRef.current += 1;
              const cooldownOk = Date.now() - lastCaptureAtRef.current >= 800;
              if (stableHitsRef.current >= 1 && cooldownOk) {
                setFeedback(`Capturando pose ${descriptorsRef.current.length + 1} de ${POSES.length}...`);
                await yieldToMain(30);
                if (!runningRef.current || !videoRef.current) return;
                const extracted = await extractFaceDescriptor(videoRef.current);
                if (!runningRef.current) return;
                if (extracted.status === 'ok' && extracted.descriptor) {
                  await registerCapturedPose(extracted.descriptor);
                }
              } else {
                setFeedback('Rosto enquadrado ✓ — capturando...');
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Falha na leitura do quadro.';
          setFeedback(`Aviso: ${msg}`);
        }

        if (runningRef.current) {
          loopTimerRef.current = window.setTimeout(() => void tick(), 260);
        }
      };

      loopTimerRef.current = window.setTimeout(() => void tick(), 180);
    } catch (e) {
      stopCamera();
      const rawMsg = e instanceof Error ? e.message : 'Permissão de câmera negada.';
      const isPermDenied =
        /notallowed|permission|denied|dismissed|security|policy/i.test(rawMsg) ||
        (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError'));
      if (isPermDenied && isInsideIframe) {
        setCameraBlockedInIframe(true);
        setError(
          'A janela incorporada (iframe) bloqueia a câmera ao vivo neste navegador. Você pode usar "Enviar foto (3x4 / selfie)" aqui mesmo ou abrir a câmera em nova aba.',
        );
      } else {
        setError(`Não foi possível acessar a câmera: ${rawMsg}. Você também pode cadastrar enviando uma foto 3x4 ou selfie.`);
      }
    }
  }, [isInsideIframe, registerCapturedPose, stopCamera]);

  const handleManualCapture = async () => {
    if (!videoRef.current || manualBusy) return;
    setManualBusy(true);
    setError(null);
    setFeedback('Processando captura...');
    try {
      await yieldToMain(24);
      const res = await extractFaceDescriptor(videoRef.current);
      if (res.status === 'ok' && res.descriptor) {
        setFaceDetectedNow(true);
        await registerCapturedPose(res.descriptor);
      } else if (res.status === 'multiple_faces') {
        setError('Mais de um rosto detectado na imagem. Deixe apenas o colaborador.');
      } else {
        setError('Não conseguimos localizar o rosto neste instante. Melhore a luz no rosto e tente novamente.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao capturar pose.');
    } finally {
      setManualBusy(false);
    }
  };

  const handlePhotoFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setError(null);
    setPhotoProcessing(true);
    try {
      setPhotoStatusMsg('Carregando motor biométrico local...');
      await loadFaceModels((msg) => setPhotoStatusMsg(msg));

      const remainingSlots = Math.max(1, FACE_MAX_POSES - uploadedPhotos.filter((u) => u.analysis.status === 'ok').length);
      const toProcess = files.slice(0, remainingSlots);
      const nextItems: UploadedFaceItem[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        const f = toProcess[i];
        setPhotoStatusMsg(`Analisando foto ${i + 1} de ${toProcess.length} (${f.name})...`);
        await yieldToMain(20);
        const analysis = await analyzeImageFile(f);
        nextItems.push({
          id: `ph_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          fileName: f.name,
          analysis,
        });
      }

      setUploadedPhotos((prev) => [...prev, ...nextItems]);
      setPhotoStatusMsg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível analisar a foto enviada.');
      setPhotoStatusMsg(null);
    } finally {
      setPhotoProcessing(false);
    }
  };

  const validPhotoDescriptors = uploadedPhotos
    .filter((item) => item.analysis.status === 'ok' && item.analysis.descriptor)
    .map((item) => item.analysis.descriptor!);

  const handleDecline = async () => {
    setBusyDecline(true);
    setError(null);
    try {
      await onDeclineBiometrics({ recusar: true, lgpdVersao: LGPD_TERM_VERSION });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a opção sem biometria.');
    } finally {
      setBusyDecline(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Cadastro facial de ${personName}`}
    >
      <div className="af-glass-modal rounded-2xl p-5 sm:p-6 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500 dark:text-blue-400">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Cadastro Facial (Ponto REP-P)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                {personName}
                {existingPoses > 0 ? ` · ${existingPoses} pose(s) atual(is)` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Fechar"
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Erro */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 text-rose-700 dark:text-rose-200 text-xs space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span className="leading-relaxed">{error}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {step !== 'photo' && (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setError(null);
                    setStep('photo');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl af-btn-primary text-xs font-semibold apple-solid-btn cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Enviar foto 3x4 / selfie</span>
                </button>
              )}
              {cameraBlockedInIframe && openInNewTabUrl && (
                <a
                  href={openInNewTabUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl af-btn-glass text-xs font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir câmera em nova aba</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* PASSO 1: TERMO LGPD + ESCOLHA DO MÉTODO (FOTO 3x4/SELFIE OU CÂMERA) */}
        {step === 'lgpd' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Termo de Ciência Biométrica — LGPD (Lei 13.709/2018)</span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                {context === 'rh'
                  ? `Antes de cadastrar o rosto de ${personName}, confirme a ciência sobre o uso da biometria facial:`
                  : 'Antes de cadastrar seu rosto, leia e confirme como sua biometria é usada no ponto eletrônico:'}
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-slate-900 dark:text-white">Finalidade exclusiva:</strong> identificação para registro de jornada de trabalho (Portaria MTP 671/2021).
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Proteção dos dados:</strong> o cadastro guarda apenas o vetor matemático criptografado (AES-256-GCM) — as fotos do cadastro (3x4 ou câmera) não são mantidas.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Funcionamento offline:</strong> o vetor fica protegido no aparelho pareado para bater ponto mesmo sem internet na obra.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Alternativa garantida:</strong> quem não desejar usar biometria facial pode registrar o ponto com PIN + foto, sem qualquer prejuízo.
                </li>
              </ul>
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lgpdAccepted}
                onChange={(e) => setLgpdAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-400 accent-blue-600 shrink-0"
              />
              <span className="font-medium leading-relaxed">
                {context === 'rh'
                  ? `Confirmo que ${personName} leu e concordou com o termo de uso da biometria facial para o ponto.`
                  : 'Li e concordo com o uso da minha biometria facial exclusivamente para registro de ponto.'}
              </span>
            </label>

            {existingPoses > 0 && (
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={appendMode}
                  onChange={(e) => setAppendMode(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-400 accent-blue-600"
                />
                <span>
                  Somar às {existingPoses} pose(s) já cadastradas (até {FACE_MAX_POSES} poses — melhora precisão em obra)
                </span>
              </label>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={!lgpdAccepted}
                onClick={() => {
                  setError(null);
                  setStep('photo');
                }}
                className="px-4 py-3 rounded-xl af-btn-primary text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer apple-solid-btn"
              >
                <Upload className="w-4 h-4" />
                <span>Enviar foto (3x4 ou selfie)</span>
              </button>

              <button
                type="button"
                disabled={!lgpdAccepted}
                onClick={() => void startCapture()}
                className="px-4 py-3 rounded-xl af-btn-glass text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-blue-500" />
                <span>Capturar pela câmera</span>
              </button>
            </div>

            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                disabled={busyDecline}
                onClick={handleDecline}
                className="text-xs text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{busyDecline ? 'Salvando...' : 'Recusar biometria (usar apenas PIN)'}</span>
              </button>

              {context === 'rh' && isInsideIframe && openInNewTabUrl && (
                <a
                  href={openInNewTabUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Abrir em nova aba</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* PASSO 2A: CADASTRO POR FOTO 3x4 OU SELFIE FRONTAL */}
        {step === 'photo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Envie de 1 a {FACE_MAX_POSES} fotos frontais (3x4 ou selfie recente)
              </p>
              <button
                type="button"
                onClick={() => void startCapture()}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Usar câmera ao vivo</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => void handlePhotoFilesSelected(e)}
              className="hidden"
            />

            <button
              type="button"
              disabled={photoProcessing || validPhotoDescriptors.length >= FACE_MAX_POSES}
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-5 rounded-2xl border-2 border-dashed border-blue-500/40 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 transition-all flex flex-col items-center justify-center gap-2 text-center disabled:opacity-50 cursor-pointer"
            >
              {photoProcessing ? (
                <>
                  <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {photoStatusMsg || 'Analisando foto...'}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Clique para escolher foto(s) 3x4 ou selfie
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Dica: 1 foto 3x4 + 1 selfie recente com boa luz garantem reconhecimento instantâneo na obra.
                  </span>
                </>
              )}
            </button>

            {uploadedPhotos.length > 0 && (
              <div className="space-y-2">
                {uploadedPhotos.map((item) => {
                  const ok = item.analysis.status === 'ok';
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border flex items-center gap-3 ${
                        ok
                          ? 'bg-emerald-500/10 border-emerald-500/35'
                          : 'bg-rose-500/10 border-rose-500/35'
                      }`}
                    >
                      {item.analysis.previewDataUrl ? (
                        <img
                          src={item.analysis.previewDataUrl}
                          alt={item.fileName}
                          className="w-14 h-14 rounded-lg object-cover border border-emerald-500/40 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-5 h-5 text-rose-500" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.fileName}</p>
                        <p
                          className={`text-[11px] mt-0.5 leading-snug ${
                            ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {item.analysis.message}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUploadedPhotos((prev) => prev.filter((x) => x.id !== item.id))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                        aria-label="Remover foto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Privacidade LGPD: as fotos acima ficam apenas temporariamente na tela para extrair o vetor matemático — o servidor recebe e guarda somente o vetor criptografado.
            </p>

            <div className="flex justify-between items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('lgpd')}
                className="px-3.5 py-2 rounded-xl af-btn-glass text-xs font-medium cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={validPhotoDescriptors.length === 0 || photoProcessing}
                onClick={() => void finishAndSave(validPhotoDescriptors, 'photo')}
                className="px-5 py-2.5 rounded-xl af-btn-primary text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer apple-solid-btn"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Salvar {validPhotoDescriptors.length} foto(s) validada(s)
                </span>
              </button>
            </div>
          </div>
        )}

        {/* PASSO 2B: CAPTURA PELA CÂMERA AO VIVO */}
        {step === 'capture' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {POSES.map((p, idx) => {
                const done = idx < descriptors.length;
                const active = idx === poseIndex;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl px-2.5 py-2 text-center border text-xs font-bold transition-all ${
                      done
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                        : active
                        ? 'bg-blue-500/15 border-blue-500/60 text-blue-700 dark:text-blue-200'
                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    Pose {idx + 1} {done ? '✓' : ''}
                  </div>
                );
              })}
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] border border-slate-300 dark:border-slate-700">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-44 h-56 sm:w-48 sm:h-64 rounded-full border-3 transition-colors duration-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.40)] ${
                    faceDetectedNow ? 'border-emerald-400 border-solid' : 'border-cyan-400/85 border-dashed'
                  }`}
                />
              </div>

              {(!cameraReady || !modelsReady) && (
                <div className="ponto-camera-hud absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs p-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="font-semibold">{modelStatus}</span>
                </div>
              )}

              <div className="ponto-camera-hud absolute bottom-3 left-3 right-3 rounded-xl px-3.5 py-2.5 text-center backdrop-blur-md">
                <p className="text-xs font-bold">{POSES[poseIndex]?.title ?? 'Finalizando...'}</p>
                <p className={`text-[11px] mt-0.5 font-medium ${faceDetectedNow ? 'ponto-hud-ok' : 'ponto-hud-accent'}`}>
                  {feedback}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    void startCapture();
                  }}
                  className="px-3 py-2 rounded-xl af-btn-glass text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Recomeçar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setStep('photo');
                  }}
                  className="px-3 py-2 rounded-xl af-btn-glass text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Enviar foto</span>
                </button>
              </div>

              <button
                type="button"
                disabled={!cameraReady || !modelsReady || manualBusy}
                onClick={() => void handleManualCapture()}
                className="px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer apple-solid-btn"
              >
                {manualBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                <span>Capturar pose agora</span>
              </button>
            </div>
          </div>
        )}

        {step === 'saving' && (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-bold text-slate-900 dark:text-white">Criptografando e salvando biometria...</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Os vetores faciais são protegidos com AES-256-GCM no servidor.
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">Rosto cadastrado com sucesso!</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {personName} já pode bater ponto por reconhecimento facial online e offline.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl af-btn-primary text-xs font-semibold cursor-pointer apple-solid-btn"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
