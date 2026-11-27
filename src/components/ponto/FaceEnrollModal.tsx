/**
 * Modal guiado de Cadastro Facial + Termo de Ciência Biométrica (LGPD).
 * Reutilizado nos dois lugares:
 *  - RH › Ponto › Pessoas (cadastro presencial pelo computador/tablet do RH)
 *  - Coletor /ponto (auto-cadastro no próprio celular do funcionário logo após parear o QR)
 *
 * Captura 3 poses (frente, leve giro à esquerda, leve giro à direita), gera vetores 128-D
 * localmente (sem salvar fotos de cadastro) e envia para criptografia AES-256-GCM no servidor.
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
} from 'lucide-react';
import { analyzeVideoFrame, loadFaceModels } from '../../ponto/faceEngine';
import { FACE_MODEL_VERSION, LGPD_TERM_VERSION } from '../../ponto/faceMath';

interface FaceEnrollModalProps {
  personName: string;
  /** 'rh' quando aberto pela equipe do RH; 'self' quando aberto no celular do próprio funcionário */
  context: 'rh' | 'self';
  onSaveFace: (payload: { descriptors: number[][]; lgpdAceito: true; modelo: string; lgpdVersao: string }) => Promise<void>;
  onDeclineBiometrics: (payload: { recusar: true; lgpdVersao: string }) => Promise<void>;
  onClose: () => void;
}

const POSES = [
  { id: 'frente', title: '1 de 3 — Olhe de frente', hint: 'Centralize o rosto no oval com boa iluminação.', check: (yaw: number) => Math.abs(yaw) <= 0.28 },
  { id: 'esquerda', title: '2 de 3 — Vire levemente para um lado', hint: 'Gire um pouco o rosto (não precisa exagerar).', check: (yaw: number) => Math.abs(yaw) >= 0.14 || true },
  { id: 'direita', title: '3 de 3 — Olhe de frente novamente', hint: 'Mantenha os olhos abertos e bem visíveis.', check: (yaw: number) => Math.abs(yaw) <= 0.35 },
] as const;

export const FaceEnrollModal: React.FC<FaceEnrollModalProps> = ({
  personName,
  context,
  onSaveFace,
  onDeclineBiometrics,
  onClose,
}) => {
  const [step, setStep] = useState<'lgpd' | 'capture' | 'saving' | 'done'>('lgpd');
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [modelStatus, setModelStatus] = useState<string>('Preparando câmera e motor biométrico...');
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [descriptors, setDescriptors] = useState<number[][]>([]);
  const [feedback, setFeedback] = useState<string>('Posicione o rosto dentro do círculo.');
  const [error, setError] = useState<string | null>(null);
  const [busyDecline, setBusyDecline] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const busyFrameRef = useRef(false);
  const poseIndexRef = useRef(0);
  const descriptorsRef = useRef<number[][]>([]);
  const lastCaptureAtRef = useRef(0);

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

  const startCapture = useCallback(async () => {
    setError(null);
    setPoseIndex(0);
    poseIndexRef.current = 0;
    setDescriptors([]);
    descriptorsRef.current = [];
    lastCaptureAtRef.current = 0;
    setStep('capture');

    try {
      setModelStatus('Abrindo câmera...');
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
      setFeedback('Rosto enquadrado — aguarde a captura automática.');

      loopTimerRef.current = window.setInterval(async () => {
        if (busyFrameRef.current || !videoRef.current) return;
        const nowMs = Date.now();
        if (nowMs - lastCaptureAtRef.current < 1100) return;

        busyFrameRef.current = true;
        try {
          const res = await analyzeVideoFrame(videoRef.current);
          if (res.status === 'no_face') {
            setFeedback('Nenhum rosto detectado. Aproxime-se e procure boa luz.');
            return;
          }
          if (res.status === 'multiple_faces') {
            setFeedback('Mais de um rosto na câmera. Deixe apenas o colaborador na imagem.');
            return;
          }
          if (!res.descriptor) return;

          if ((res.boxAreaRatio ?? 0) < 0.045) {
            setFeedback('Aproxime um pouco mais o rosto da câmera.');
            return;
          }

          const currentIdx = poseIndexRef.current;
          const pose = POSES[currentIdx];
          if (!pose) return;

          const yaw = res.yaw ?? 0;
          if (!pose.check(yaw)) {
            setFeedback(pose.hint);
            return;
          }

          const nextCollected = [...descriptorsRef.current, res.descriptor];
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
        } catch {
          // ignora erro pontual de quadro
        } finally {
          busyFrameRef.current = false;
        }
      }, 350);
    } catch (e) {
      stopCamera();
      setError(
        e instanceof Error
          ? `Não foi possível acessar a câmera: ${e.message}. Verifique a permissão de câmera do navegador.`
          : 'Permissão de câmera negada.',
      );
    }
  }, [finishAndSave, stopCamera]);

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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cadastro Facial (Ponto REP-P)</h3>
              <p className="text-[11px] text-slate-400">{personName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 'lgpd' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700/70 space-y-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-blue-300 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Termo de Ciência Biométrica — LGPD (Lei 13.709/2018)</span>
              </div>
              <p>
                {context === 'rh'
                  ? `Antes de cadastrar o rosto de ${personName}, confirme a ciência sobre o uso da biometria facial:`
                  : 'Antes de cadastrar seu rosto, leia e confirme como sua biometria é usada no ponto eletrônico:'}
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-400">
                <li>
                  <strong className="text-slate-200">Finalidade exclusiva:</strong> identificação para registro de jornada de trabalho (Portaria MTP 671/2021).
                </li>
                <li>
                  <strong className="text-slate-200">Proteção dos dados:</strong> o cadastro guarda apenas o vetor matemático criptografado (AES-256-GCM) — as fotos do cadastro não são mantidas.
                </li>
                <li>
                  <strong className="text-slate-200">Funcionamento offline:</strong> o vetor fica protegido no aparelho pareado para bater ponto mesmo sem internet na obra.
                </li>
                <li>
                  <strong className="text-slate-200">Alternativa garantida:</strong> quem não desejar usar biometria facial pode registrar o ponto com PIN + foto, sem qualquer prejuízo.
                </li>
              </ul>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lgpdAccepted}
                onChange={(e) => setLgpdAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-600"
              />
              <span>
                {context === 'rh'
                  ? `Confirmo que ${personName} leu e concordou com o termo de uso da biometria facial para o ponto.`
                  : 'Li e concordo com o uso da minha biometria facial exclusivamente para registro de ponto.'}
              </span>
            </label>

            <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={busyDecline}
                onClick={handleDecline}
                className="px-3.5 py-2.5 rounded-xl af-btn-glass text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
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
                    className={`rounded-xl px-2.5 py-2 text-center border text-[11px] font-semibold transition-all ${
                      done
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : active
                        ? 'bg-blue-500/15 border-blue-500/50 text-blue-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-500'
                    }`}
                  >
                    Pose {idx + 1} {done ? '✓' : ''}
                  </div>
                );
              })}
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] border border-slate-700">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {/* Guia oval de enquadramento */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-44 h-56 sm:w-48 sm:h-64 rounded-full border-2 border-dashed border-cyan-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
              </div>

              {(!cameraReady || !modelsReady) && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2 text-xs text-slate-200 p-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  <span>{modelStatus}</span>
                </div>
              )}

              <div className="absolute bottom-3 left-3 right-3 bg-black/70 backdrop-blur-md rounded-xl px-3 py-2 text-center">
                <p className="text-xs font-bold text-white">{POSES[poseIndex]?.title ?? 'Finalizando...'}</p>
                <p className="text-[11px] text-cyan-200 mt-0.5">{feedback}</p>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  void startCapture();
                }}
                className="px-3 py-2 rounded-xl af-btn-glass text-xs flex items-center gap-1.5 cursor-pointer"
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
                className="px-3 py-2 rounded-xl af-btn-glass text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {step === 'saving' && (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm font-semibold text-white">Criptografando e salvando biometria...</p>
            <p className="text-xs text-slate-400">Os vetores faciais são protegidos com AES-256-GCM no servidor.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Rosto cadastrado com sucesso!</h4>
              <p className="text-xs text-slate-400 mt-1">
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
