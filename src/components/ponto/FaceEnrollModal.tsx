/**
 * Modal guiado de Cadastro Facial + Termo de Ciência Biométrica (LGPD).
 * Reutilizado nos dois lugares:
 *  - RH › Ponto › Pessoas (cadastro presencial pelo computador/tablet do RH ou em nova aba fora de iframe)
 *  - Coletor /?ponto=1 (auto-cadastro no próprio celular do funcionário logo após parear o QR)
 *
 * Melhorias de UX e confiabilidade:
 *  - Alto contraste garantido tanto no tema Claro quanto no tema Escuro;
 *  - Detecção robusta (SSD MobileNetV1 + TinyFaceDetector via canvas 2D) com anel oval verde ao detectar rosto;
 *  - Captura automática fluida das 3 poses + botão manual "Capturar pose agora";
 *  - Se a câmera for bloqueada pelo iframe (ex: AI Studio preview), oferece botão direto "Abrir em nova aba".
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
} from 'lucide-react';
import { analyzeVideoFrame, loadFaceModels } from '../../ponto/faceEngine';
import { FACE_MODEL_VERSION, LGPD_TERM_VERSION } from '../../ponto/faceMath';

interface FaceEnrollModalProps {
  personName: string;
  /** 'rh' quando aberto pela equipe do RH; 'self' quando aberto no celular do próprio funcionário */
  context: 'rh' | 'self';
  /** URL opcional para abrir a captura em nova aba caso o ERP esteja dentro de um iframe sem permissão de câmera */
  openInNewTabUrl?: string;
  onSaveFace: (payload: { descriptors: number[][]; lgpdAceito: true; modelo: string; lgpdVersao: string }) => Promise<void>;
  onDeclineBiometrics: (payload: { recusar: true; lgpdVersao: string }) => Promise<void>;
  onClose: () => void;
}

const POSES = [
  { id: 'frente', title: 'Pose 1 de 3 — Olhe de frente', hint: 'Mantenha o rosto centralizado no círculo.' },
  { id: 'angulo', title: 'Pose 2 de 3 — Mova levemente o rosto', hint: 'Um leve giro ou inclinação ajuda no reconhecimento.' },
  { id: 'final', title: 'Pose 3 de 3 — Confirmação final', hint: 'Olhe de frente novamente para concluir.' },
] as const;

export const FaceEnrollModal: React.FC<FaceEnrollModalProps> = ({
  personName,
  context,
  openInNewTabUrl,
  onSaveFace,
  onDeclineBiometrics,
  onClose,
}) => {
  const [step, setStep] = useState<'lgpd' | 'capture' | 'saving' | 'done'>('lgpd');
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [modelStatus, setModelStatus] = useState<string>('Preparando câmera e motor biométrico...');
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetectedNow, setFaceDetectedNow] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [descriptors, setDescriptors] = useState<number[][]>([]);
  const [feedback, setFeedback] = useState<string>('Posicione o rosto dentro do círculo.');
  const [error, setError] = useState<string | null>(null);
  const [cameraBlockedInIframe, setCameraBlockedInIframe] = useState(false);
  const [busyDecline, setBusyDecline] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const busyFrameRef = useRef(false);
  const poseIndexRef = useRef(0);
  const descriptorsRef = useRef<number[][]>([]);
  const lastCaptureAtRef = useRef(0);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const stopCamera = useCallback(() => {
    if (loopTimerRef.current !== null) {
      window.clearInterval(loopTimerRef.current);
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
    async (collected: number[][]) => {
      stopCamera();
      setStep('saving');
      setError(null);
      try {
        await onSaveFace({
          descriptors: collected,
          lgpdAceito: true,
          modelo: FACE_MODEL_VERSION,
          lgpdVersao: LGPD_TERM_VERSION,
        });
        setStep('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível salvar o cadastro facial.');
        setStep('capture');
      }
    },
    [onSaveFace, stopCamera],
  );

  const registerCapturedPose = useCallback(
    async (descriptor: number[]) => {
      const nextCollected = [...descriptorsRef.current, descriptor];
      descriptorsRef.current = nextCollected;
      setDescriptors(nextCollected);
      lastCaptureAtRef.current = Date.now();

      if (nextCollected.length >= POSES.length) {
        await finishAndSave(nextCollected);
      } else {
        poseIndexRef.current = nextCollected.length;
        setPoseIndex(nextCollected.length);
        setFeedback(`Pose ${nextCollected.length} capturada! ${POSES[nextCollected.length].title}`);
      }
    },
    [finishAndSave],
  );

  const startCapture = useCallback(async () => {
    setError(null);
    setCameraBlockedInIframe(false);
    setPoseIndex(0);
    poseIndexRef.current = 0;
    setDescriptors([]);
    descriptorsRef.current = [];
    lastCaptureAtRef.current = 0;
    setFaceDetectedNow(false);
    setStep('capture');

    try {
      setModelStatus('Abrindo câmera...');
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Navegador sem suporte à câmera (verifique se está em HTTPS).');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);

      await loadFaceModels((msg) => setModelStatus(msg));
      setModelsReady(true);
      setFeedback('Câmera pronta — olhe para o círculo para captura automática.');

      loopTimerRef.current = window.setInterval(async () => {
        if (busyFrameRef.current || !videoRef.current) return;
        const nowMs = Date.now();
        if (nowMs - lastCaptureAtRef.current < 1050) return;

        busyFrameRef.current = true;
        try {
          const res = await analyzeVideoFrame(videoRef.current);
          if (res.status === 'no_face') {
            setFaceDetectedNow(false);
            setFeedback('Aguardando rosto no círculo... procure boa iluminação.');
            return;
          }
          if (res.status === 'multiple_faces') {
            setFaceDetectedNow(false);
            setFeedback('Mais de um rosto em destaque. Deixe apenas o colaborador na imagem.');
            return;
          }
          if (!res.descriptor) {
            setFaceDetectedNow(false);
            return;
          }

          setFaceDetectedNow(true);

          if ((res.boxAreaRatio ?? 0) < 0.025) {
            setFeedback('Rosto detectado! Aproxime só um pouco mais da câmera.');
            return;
          }

          setFeedback(`Rosto detectado (${Math.round((res.confidence ?? 0.9) * 100)}%) — capturando...`);
          await registerCapturedPose(res.descriptor);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Falha na leitura do quadro facial.';
          setFeedback(`Aviso: ${msg}`);
        } finally {
          busyFrameRef.current = false;
        }
      }, 450);
    } catch (e) {
      stopCamera();
      const rawMsg = e instanceof Error ? e.message : 'Permissão de câmera negada.';
      const isPermDenied =
        /notallowed|permission|denied|dismissed|security|policy/i.test(rawMsg) ||
        (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError'));
      if (isPermDenied && isInsideIframe) {
        setCameraBlockedInIframe(true);
        setError(
          'A janela incorporada (iframe) do painel bloqueia o acesso à câmera neste navegador, mesmo com permissão liberada. Abra a captura em uma nova aba abaixo — lá a câmera abre na hora.',
        );
      } else {
        setError(`Não foi possível acessar a câmera: ${rawMsg}. Verifique a permissão de câmera do navegador.`);
      }
    }
  }, [isInsideIframe, registerCapturedPose, stopCamera]);

  const handleManualCapture = async () => {
    if (!videoRef.current || manualBusy) return;
    setManualBusy(true);
    setError(null);
    try {
      const res = await analyzeVideoFrame(videoRef.current);
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
        {/* Cabeçalho de alto contraste */}
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500 dark:text-blue-400">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Cadastro Facial (Ponto REP-P)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{personName}</p>
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

        {/* Alerta de erro (com atalho para nova aba quando bloqueado por iframe) */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 text-rose-700 dark:text-rose-200 text-xs space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span className="leading-relaxed">{error}</span>
            </div>
            {cameraBlockedInIframe && openInNewTabUrl && (
              <a
                href={openInNewTabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold apple-solid-btn"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir captura facial em nova aba</span>
              </a>
            )}
          </div>
        )}

        {step === 'lgpd' && (
          <div className="space-y-4">
            {/* Aviso preventivo quando RH está dentro de iframe */}
            {context === 'rh' && isInsideIframe && openInNewTabUrl && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-blue-100">
                  Se a câmera estiver bloqueada nesta janela, abra o cadastro em nova aba:
                </span>
                <a
                  href={openInNewTabUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg af-btn-primary text-[11px] font-semibold apple-solid-btn"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Abrir em nova aba</span>
                </a>
              </div>
            )}

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
                  <strong className="text-slate-900 dark:text-white">Proteção dos dados:</strong> o cadastro guarda apenas o vetor matemático criptografado (AES-256-GCM) — as fotos do cadastro não são mantidas.
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

            <div className="flex flex-col sm:flex-row justify-between gap-2.5 pt-1">
              <button
                type="button"
                disabled={busyDecline}
                onClick={handleDecline}
                className="px-4 py-2.5 rounded-xl af-btn-glass text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>{busyDecline ? 'Salvando...' : 'Recusar biometria (usar PIN)'}</span>
              </button>
              <button
                type="button"
                disabled={!lgpdAccepted}
                onClick={() => void startCapture()}
                className="px-5 py-2.5 rounded-xl af-btn-primary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer apple-solid-btn"
              >
                <Camera className="w-4 h-4" />
                <span>Iniciar captura do rosto</span>
              </button>
            </div>
          </div>
        )}

        {step === 'capture' && (
          <div className="space-y-3">
            {/* Progresso das 3 poses */}
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
              {/* Guia oval — fica VERDE quando o rosto é detectado */}
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
                    onClose();
                  }}
                  className="px-3 py-2 rounded-xl af-btn-glass text-xs font-medium cursor-pointer"
                >
                  Cancelar
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
