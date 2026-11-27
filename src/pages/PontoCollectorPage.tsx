/**
 * Coletor de Ponto Eletrônico Próprio (REP-P / Portaria 671) — Rota pública /ponto.
 *
 * - PWA instalável no celular (Android/iOS) e no tablet-totem da obra.
 * - Pareamento com 1 toque via QR Code URL (/ponto?pair=CODIGO) ou código de 8 caracteres.
 * - Reconhecimento facial local 1:1 (celular pessoal) e 1:N (totem) + prova de vida passiva + GPS + selfie comprimida.
 * - 100% funcional OFFLINE (Service Worker + IndexedDB assinado com ECDSA P-256) com sincronização automática ao reconectar.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  CloudOff,
  Download,
  FileText,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
  AlertTriangle,
  LogOut,
  Search,
} from 'lucide-react';
import { TIPO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from '../ponto/config';
import { proximaMarcacao } from '../ponto/jornada';
import { obraMaisProxima } from '../ponto/geo';
import {
  FACE_MATCH_THRESHOLD,
  FACE_MODEL_VERSION,
  evaluateLiveness,
  matchFace1to1,
  matchFace1toN,
  type LivenessSample,
} from '../ponto/faceMath';
import {
  captureCompressedSelfie,
  detectFacePreview,
  extractFaceDescriptor,
  loadFaceModels,
  loadPreviewModels,
  yieldToMain,
} from '../ponto/faceEngine';
import {
  clearDeviceIdentity,
  computeCurrentTimestamp,
  enrollDeviceFace,
  extractPairCode,
  getClockAnchor,
  getDeviceIdentity,
  getLocalReceipts,
  listPendingQueue,
  pairDevice,
  refreshDeviceState,
  registrarPontoLocalESincronizar,
  syncPendingQueue,
  type ClockAnchor,
  type ComprovanteLocal,
  type DeviceIdentity,
  type PendingMarcacao,
} from '../ponto/deviceClient';
import { ALERTA_LABEL } from '../services/pontoApi';
import { FaceEnrollModal } from '../components/ponto/FaceEnrollModal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const fmtClock = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });

const fmtDateLong = (d: Date) =>
  d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });

const fmtIsoHora = (iso: string) => iso.slice(11, 19);
const fmtIsoData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function readCurrentGps(): Promise<{ lat: number; lng: number; precisaoM?: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisaoM: Math.round(pos.coords.accuracy),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 25_000 },
    );
  });
}

export const PontoCollectorPage: React.FC = () => {
  const [booting, setBooting] = useState(true);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [anchor, setAnchor] = useState<ClockAnchor | null>(null);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [pending, setPending] = useState<PendingMarcacao[]>([]);
  const [receipts, setReceipts] = useState<ComprovanteLocal[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // PWA install
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);

  // Pareamento
  const [pairCodeInput, setPairCodeInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return extractPairCode(params.get('pair') || params.get('code') || '');
  });
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);

  // GPS atual para indicador da cerca
  const [gps, setGps] = useState<{ lat: number; lng: number; precisaoM?: number } | null>(null);

  // Tipo de marcação selecionado (padrão = próxima marcação esperada)
  const [selectedTipo, setSelectedTipo] = useState<TipoMarcacao>('entrada');
  const [manualTipoOverride, setManualTipoOverride] = useState(false);

  // Modais / telas ativas
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showReceiptsModal, setShowReceiptsModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [totemSearch, setTotemSearch] = useState('');
  const [totemSelectedRhId, setTotemSelectedRhId] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  // Captura facial para bater ponto
  const [scanning, setScanning] = useState(false);
  const [scanFaceDetected, setScanFaceDetected] = useState(false);
  const [scanPhase, setScanPhase] = useState<string>('Abrindo câmera...');
  const [scanHint, setScanHint] = useState<string>('Olhe diretamente para a câmera');
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [successReceipt, setSuccessReceipt] = useState<ComprovanteLocal | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanRunningRef = useRef(false);

  // Registra Service Worker offline-first do Ponto
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/ponto-sw.js', { scope: '/' }).catch(() => {
        // Ignora em ambientes sem SW
      });
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const reloadLocalState = useCallback(async () => {
    const [id, anc, q, recs] = await Promise.all([
      getDeviceIdentity(),
      getClockAnchor(),
      listPendingQueue(),
      getLocalReceipts(),
    ]);
    setIdentity(id);
    setAnchor(anc);
    setPending(q);
    setReceipts(recs);
    return id;
  }, []);

  const handleSyncAll = useCallback(
    async (silent = false) => {
      if (!navigator.onLine) {
        if (!silent) setStatusBanner('Você está offline. As marcações serão enviadas automaticamente ao voltar o sinal.');
        return;
      }
      setSyncing(true);
      try {
        const res = await syncPendingQueue();
        const refreshed = await refreshDeviceState().catch(() => null);
        if (refreshed) setIdentity(refreshed);
        const [anc, q, recs] = await Promise.all([getClockAnchor(), listPendingQueue(), getLocalReceipts()]);
        setAnchor(anc);
        setPending(q);
        setReceipts(recs);
        if (res.syncedCount > 0) {
          setStatusBanner(`${res.syncedCount} marcação(ões) offline sincronizada(s) com sucesso!`);
        } else if (!silent) {
          setStatusBanner('Aparelho sincronizado com o servidor.');
        }
      } catch (e) {
        if (!silent) setErrorMsg(e instanceof Error ? e.message : 'Não foi possível sincronizar agora.');
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  // Inicialização do coletor
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = await reloadLocalState();
        if (id && navigator.onLine) {
          await handleSyncAll(true);
        }
        // Pré-aquece apenas o detector leve (265 KB) em segundo plano quando já pareado
        if (id) {
          loadPreviewModels().catch(() => undefined);
        }
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [handleSyncAll, reloadLocalState]);

  // Listeners de rede online/offline + sincronização automática ao reconectar
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void handleSyncAll(true);
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [handleSyncAll]);

  // Relógio com segundos (sincronizado com âncora do servidor)
  useEffect(() => {
    const tick = () => {
      const { nowDate: d } = computeCurrentTimestamp(anchor);
      setNowDate(d);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [anchor]);

  // Atualiza GPS periodicamente para feedback visual de cerca
  useEffect(() => {
    if (!identity) return;
    let active = true;
    const poll = async () => {
      const loc = await readCurrentGps();
      if (active && loc) setGps(loc);
    };
    void poll();
    const id = window.setInterval(poll, 30_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [identity]);

  // Sugere próxima marcação esperada no modo pessoal
  useEffect(() => {
    if (!identity || manualTipoOverride) return;
    if (identity.modo === 'pessoal') {
      const prox = proximaMarcacao(
        identity.ultimasDoDia.map((u) => u.tipo),
        identity.config,
      );
      setSelectedTipo(prox);
    }
  }, [identity, manualTipoOverride]);

  const nearestObra = useMemo(() => {
    if (!identity || !gps) return null;
    return obraMaisProxima(gps, identity.obras, identity.config.raioM);
  }, [gps, identity]);

  const stopScanCamera = useCallback(() => {
    scanRunningRef.current = false;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanFaceDetected(false);
    setScanning(false);
  }, []);

  useEffect(() => () => stopScanCamera(), [stopScanCamera]);

  const handleConfirmPair = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingBusy(true);
    setErrorMsg(null);
    try {
      const paired = await pairDevice(pairCodeInput, deviceNameInput);
      setIdentity(paired);
      // Limpa o ?pair= da barra de endereço após parear
      if (window.location.search.includes('pair=')) {
        window.history.replaceState({}, '', '/?ponto=1');
      }
      await reloadLocalState();
      // Pré-aquece apenas o detector leve (265 KB) em segundo plano
      loadPreviewModels().catch(() => undefined);
      // No celular pessoal sem rosto cadastrado, já abre o onboarding de LGPD + cadastro facial
      if (paired.modo === 'pessoal' && paired.biometria.status === 'pendente') {
        setShowEnrollModal(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível parear o aparelho.');
    } finally {
      setPairingBusy(false);
    }
  };

  const finalizePunch = useCallback(
    async (params: {
      rhId: string;
      pessoaNome: string;
      metodo: 'rosto' | 'pin' | 'nenhum';
      pin?: string;
      face?: { score: number; liveness?: number; modelo: string } | null;
      faceDescriptor?: number[] | null;
      fotoDataUrl?: string | null;
    }) => {
      const currentGps = (await readCurrentGps()) ?? gps;
      const prox = identity && currentGps ? obraMaisProxima(currentGps, identity.obras, identity.config.raioM) : null;
      const obraPrevista =
        prox && prox.dentro
          ? { unitId: prox.unitId, nome: identity?.obras.find((o) => o.id === prox.unitId)?.nome ?? '' }
          : null;

      const { receipt, syncedNow } = await registrarPontoLocalESincronizar({
        rhId: params.rhId,
        pessoaNome: params.pessoaNome,
        tipo: selectedTipo,
        gps: currentGps,
        obraPrevista,
        metodo: params.metodo,
        pin: params.pin,
        face: params.face,
        faceDescriptor: params.faceDescriptor,
        fotoDataUrl: params.fotoDataUrl,
      });

      setManualTipoOverride(false);
      await reloadLocalState();
      setSuccessReceipt(receipt);
      if (!syncedNow) {
        setStatusBanner('Ponto salvo com segurança no aparelho! Será sincronizado automaticamente ao conectar.');
      }
    },
    [gps, identity, reloadLocalState, selectedTipo],
  );

  // Fluxo principal em 2 estágios (ZERO congelamento): preview leve (265 KB) → 1 extração 128-D na confirmação!
  const handleStartFacialPunch = async () => {
    if (!identity) return;
    if (
      identity.modo === 'pessoal' &&
      !(identity.biometria.status === 'cadastrada' && identity.biometria.descriptors.length > 0)
    ) {
      setErrorMsg(
        'Seu rosto ainda não está cadastrado. Conclua o cadastro facial ou entre em contato com o departamento de RH para emissão do link de cadastro.',
      );
      return;
    }

    stopScanCamera();
    setErrorMsg(null);
    setStatusBanner(null);
    setScanning(true);
    setScanFaceDetected(false);
    setScanPhase('Abrindo câmera...');
    setScanHint('Centralize seu rosto no oval');
    setScanProgress(10);
    scanRunningRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      if (!scanRunningRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      await loadPreviewModels((msg) => setScanPhase(msg));
      if (!scanRunningRef.current) return;
      await loadFaceModels((msg) => setScanPhase(msg));
      if (!scanRunningRef.current) return;

      setScanPhase('Reconhecendo rosto...');
      setScanProgress(30);

      const startedAt = Date.now();
      const samples: LivenessSample[] = [];

      const tick = async () => {
        if (!scanRunningRef.current || !videoRef.current) return;
        try {
          const elapsed = Date.now() - startedAt;
          const preview = await detectFacePreview(videoRef.current);
          if (!scanRunningRef.current) return;

          if (preview.status === 'no_face') {
            setScanFaceDetected(false);
            setScanHint('Nenhum rosto encontrado — olhe para a câmera');
          } else if (preview.status === 'multiple_faces') {
            setScanFaceDetected(false);
            setScanHint('Mais de um rosto na câmera — deixe apenas uma pessoa');
          } else {
            setScanFaceDetected(true);
            samples.push({
              ear: preview.ear ?? 0.28,
              yaw: preview.yaw ?? 0,
              boxCx: preview.boxCx ?? 0.5,
              boxCy: preview.boxCy ?? 0.5,
            });
            if (samples.length > 10) samples.shift();

            const live = evaluateLiveness(samples);
            setScanProgress(Math.min(85, 30 + Math.round((samples.length / 3) * 40) + (live.passed ? 15 : 0)));

            if (!live.passed && elapsed > 1800) {
              setScanHint('Pisque uma vez para confirmar prova de vida');
            } else {
              setScanHint('Rosto enquadrado ✓ — confirmando identidade...');
            }

            // Assim que temos 3 quadros estáveis + prova de vida (ou 3.2s com rosto enquadrado), extrai 1 único vetor 128-D!
            if (samples.length >= 3 && (live.passed || elapsed >= 3200)) {
              setScanPhase('Validando identidade...');
              setScanProgress(92);
              await yieldToMain(35);
              if (!scanRunningRef.current || !videoRef.current) return;

              const extracted = await extractFaceDescriptor(videoRef.current);
              if (!scanRunningRef.current || !videoRef.current) return;

              if (extracted.status === 'ok' && extracted.descriptor) {
                const selfie = captureCompressedSelfie(videoRef.current);

                if (identity.modo === 'pessoal') {
                  const match = matchFace1to1(extracted.descriptor, identity.biometria.descriptors, FACE_MATCH_THRESHOLD);
                  stopScanCamera();
                  await finalizePunch({
                    rhId: identity.rhId!,
                    pessoaNome: identity.pessoa?.nome ?? 'Colaborador',
                    metodo: 'rosto',
                    face: { score: match.score, liveness: live.score, modelo: FACE_MODEL_VERSION },
                    faceDescriptor: extracted.descriptor,
                    fotoDataUrl: selfie,
                  });
                  return;
                } else {
                  const candidates = identity.totemPessoas.filter((p) => p.descriptors.length > 0);
                  const idMatch = matchFace1toN(extracted.descriptor, candidates, FACE_MATCH_THRESHOLD);
                  if (idMatch?.matched) {
                    stopScanCamera();
                    await finalizePunch({
                      rhId: idMatch.rhId,
                      pessoaNome: idMatch.nome,
                      metodo: 'rosto',
                      face: { score: idMatch.score, liveness: live.score, modelo: FACE_MODEL_VERSION },
                      faceDescriptor: extracted.descriptor,
                      fotoDataUrl: selfie,
                    });
                    return;
                  }
                  stopScanCamera();
                  setErrorMsg(
                    'Rosto não encontrado nos cadastros desta obra. Entre em contato com o departamento de RH para realizar o cadastro facial.',
                  );
                  return;
                }
              }
            }
          }
        } catch (err) {
          stopScanCamera();
          setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar o ponto.');
          return;
        }

        if (scanRunningRef.current) {
          scanTimerRef.current = window.setTimeout(() => void tick(), 280);
        }
      };

      scanTimerRef.current = window.setTimeout(() => void tick(), 200);
    } catch (err) {
      stopScanCamera();
      setErrorMsg(
        err instanceof Error
          ? `Câmera indisponível (${err.message}).`
          : 'Permissão de câmera negada.',
      );
    }
  };

  // Plano B: bater ponto via PIN
  const handleSubmitPinPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity) return;
    setPinBusy(true);
    setErrorMsg(null);
    try {
      let targetRhId = identity.rhId ?? '';
      let targetNome = identity.pessoa?.nome ?? '';
      if (identity.modo === 'totem') {
        const chosen = identity.totemPessoas.find((p) => p.rhId === totemSelectedRhId);
        if (!chosen) throw new Error('Selecione seu nome na lista.');
        targetRhId = chosen.rhId;
        targetNome = chosen.nome;
      }
      if (!/^\d{4,6}$/.test(pinValue.trim())) {
        throw new Error('Digite seu PIN de 4 a 6 números.');
      }
      await finalizePunch({
        rhId: targetRhId,
        pessoaNome: targetNome,
        metodo: 'pin',
        pin: pinValue.trim(),
        face: null,
        fotoDataUrl: null,
      });
      setPinValue('');
      setShowPinModal(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar com PIN.');
    } finally {
      setPinBusy(false);
    }
  };

  // Auto-fecha tela verde no modo totem após 4.5 segundos
  useEffect(() => {
    if (!successReceipt || identity?.modo !== 'totem') return;
    const t = window.setTimeout(() => setSuccessReceipt(null), 4500);
    return () => window.clearTimeout(t);
  }, [successReceipt, identity?.modo]);

  const handleInstallPwa = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } else {
      setShowIosInstallHint((v) => !v);
    }
  };

  const filteredTotemPeople = useMemo(() => {
    if (!identity) return [];
    const q = totemSearch.trim().toLowerCase();
    return identity.totemPessoas.filter((p) => !q || p.nome.toLowerCase().includes(q));
  }, [identity, totemSearch]);

  if (booting) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm text-slate-300">Carregando AgueroFlow Ponto...</p>
      </div>
    );
  }

  // ── TELA 1: PAREAMENTO (ainda não pareado) ──
  if (!identity) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md af-card rounded-3xl p-6 sm:p-7 space-y-5 border border-slate-800 bg-[#111827]">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Smartphone className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">AgueroFlow Ponto</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pareie este celular ou tablet com o código de 8 letras/números gerado pelo RH para registrar seu ponto com reconhecimento facial e funcionamento offline.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleConfirmPair} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                Código de pareamento do RH
              </label>
              <input
                type="text"
                value={pairCodeInput}
                onChange={(e) => setPairCodeInput(extractPairCode(e.target.value))}
                placeholder="Ex: ABCD1234"
                maxLength={12}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-center text-2xl font-mono tracking-[0.25em] text-white uppercase focus:outline-none focus:border-blue-500"
              />
              {pairCodeInput.length === 8 && (
                <p className="text-[11px] text-emerald-400 mt-1.5 text-center">
                  Código lido do QR Code! Toque abaixo para confirmar.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                Nome deste aparelho (opcional)
              </label>
              <input
                type="text"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="Ex: Celular do João ou Tablet Obra 01"
                maxLength={60}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={pairingBusy || pairCodeInput.length < 6}
              className="w-full py-3.5 rounded-2xl af-btn-primary text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer apple-solid-btn"
            >
              {pairingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{pairingBusy ? 'Pareando aparelho...' : 'Confirmar pareamento'}</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
            <p className="font-semibold text-slate-300">Como funciona:</p>
            <p>1. O RH abre <b>RH › Ponto › Pessoas</b> e clica em <b>Parear celular</b>.</p>
            <p>2. Você aponta a câmera do celular para o QR Code — esta página já abre com o código preenchido.</p>
            <p>3. Depois de parear, cadastre seu rosto uma vez e adicione este app à Tela Inicial para usar mesmo sem internet na obra.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── TELA VERDE GIGANTE DE CONFIRMAÇÃO (PADRÃO RH-ID) ──
  if (successReceipt) {
    return (
      <div className="ponto-success-screen min-h-screen bg-emerald-600 text-white flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-md bg-emerald-700/75 backdrop-blur-md border border-white/25 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="ponto-success-cta w-20 h-20 mx-auto rounded-full flex items-center justify-center shadow-lg">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest font-bold opacity-90">
              {successReceipt.provisorio ? 'Ponto salvo offline' : 'Ponto registrado'}
            </p>
            <h2 className="text-2xl font-extrabold mt-1">{successReceipt.pessoa.nome}</h2>
            <p className="text-4xl font-mono font-black tracking-tight mt-2">
              {fmtIsoHora(successReceipt.dataHora)}
            </p>
            <p className="text-sm font-semibold opacity-95 mt-1">
              {TIPO_LABEL[successReceipt.tipo]} · {fmtIsoData(successReceipt.dataHora)}
            </p>
          </div>

          <div className="bg-black/25 rounded-2xl p-3.5 text-left text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="opacity-80">Empresa</span>
              <span className="font-semibold text-right">{successReceipt.empresa.razaoSocial || 'Grupo Aguero'}</span>
            </div>
            {successReceipt.empresa.cnpj && (
              <div className="flex justify-between gap-2">
                <span className="opacity-80">CNPJ</span>
                <span className="font-mono">{successReceipt.empresa.cnpj}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="opacity-80">Local</span>
              <span className="font-semibold text-right">{successReceipt.obra?.nome ?? 'Registrado por GPS'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="opacity-80">NSR</span>
              <span className="font-mono font-bold">
                {successReceipt.nsr ? `#${String(successReceipt.nsr).padStart(9, '0')}` : 'Pendente de envio'}
              </span>
            </div>
            {successReceipt.hash && (
              <div className="pt-1 border-t border-white/15">
                <span className="text-[10px] opacity-80 block">Hash SHA-256 (Portaria 671)</span>
                <span className="font-mono text-[10px] break-all">{successReceipt.hash}</span>
              </div>
            )}
          </div>

          {successReceipt.provisorio && (
            <div className="p-2.5 rounded-xl bg-black/25 border border-white/30 text-xs flex items-center justify-center gap-2">
              <CloudOff className="w-4 h-4 shrink-0" />
              <span>Comprovante provisório — será enviado sozinho assim que voltar a internet.</span>
            </div>
          )}

          {successReceipt.alertas.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {successReceipt.alertas.map((a) => (
                <span key={a} className="px-2 py-0.5 rounded-full bg-black/25 text-[11px] font-medium">
                  {ALERTA_LABEL[a] ?? a}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSuccessReceipt(null)}
            className="ponto-success-cta w-full py-3.5 rounded-2xl font-bold text-sm shadow-md cursor-pointer"
          >
            {identity.modo === 'totem' ? 'Próximo colaborador' : 'Voltar ao relógio'}
          </button>
        </div>
      </div>
    );
  }

  // ── TELA PRINCIPAL DO COLETOR (PADRÃO RH-ID) ──
  return (
    <div className="min-h-screen bg-[#090D16] text-white flex flex-col">
      {/* Topbar limpa */}
      <header className="sticky top-0 z-20 bg-[#090D16]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-tight text-blue-400 uppercase">
                AgueroFlow Ponto
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isOnline
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-sm font-bold text-white truncate">
              {identity.modo === 'totem'
                ? `Totem · ${identity.obra?.nome ?? 'Obra'}`
                : identity.pessoa?.nome ?? 'Colaborador'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {pending.length > 0 && (
              <button
                type="button"
                onClick={() => void handleSyncAll(false)}
                disabled={syncing || !isOnline}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                title="Sincronizar marcações pendentes"
              >
                <UploadCloud className={`w-3.5 h-3.5 ${syncing ? 'animate-bounce' : ''}`} />
                <span>{pending.length}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowReceiptsModal(true)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Meus comprovantes"
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleSyncAll(false)}
              disabled={syncing || !isOnline}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
              title="Atualizar cadastro facial e sincronizar"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Banner de instalação PWA */}
        {(installPrompt || showIosInstallHint) && (
          <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="text-blue-100">
              {showIosInstallHint ? (
                <span>
                  No iPhone: toque em <b>Compartilhar</b> (ícone de seta) e depois em <b>Adicionar à Tela de Início</b> para usar offline.
                </span>
              ) : (
                <span>Instale o <b>Aguero Ponto</b> na tela inicial para abrir em 1 toque e bater ponto sem internet.</span>
              )}
            </div>
            {installPrompt && (
              <button
                type="button"
                onClick={() => void handleInstallPwa()}
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Instalar</span>
              </button>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-200 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {statusBanner && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-2">
            <span>{statusBanner}</span>
            <button type="button" onClick={() => setStatusBanner(null)} className="text-emerald-200 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Trava obrigatória: tela de bater ponto SÓ libera após rosto cadastrado (ou recusa LGPD com PIN ativo pelo RH) */}
        {(() => {
          const hasRegisteredFace =
            identity.modo === 'pessoal'
              ? identity.biometria.status === 'cadastrada' && identity.biometria.descriptors.length > 0
              : identity.totemPessoas.some((p) => p.temRosto);
          const hasLgpdPinFallback =
            identity.modo === 'pessoal'
              ? identity.biometria.status === 'recusada' && identity.pessoa?.temPin === true
              : identity.totemPessoas.some((p) => p.temPin);
          const isReadyToPunch = hasRegisteredFace || hasLgpdPinFallback;

          if (!isReadyToPunch) {
            return (
              <section className="rounded-3xl bg-[#111827] border border-amber-500/35 p-6 text-center space-y-4 shadow-xl">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
                  <ScanFace className="w-9 h-9" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold text-white">
                    {identity.modo === 'totem'
                      ? 'Nenhum rosto cadastrado nesta obra'
                      : identity.biometria.status === 'recusada'
                      ? 'PIN pendente no departamento de RH'
                      : 'Cadastro facial obrigatório'}
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {identity.modo === 'totem'
                      ? 'A tela de bater ponto só é liberada após pelo menos um colaborador da obra ter o rosto cadastrado. Entre em contato com o departamento de RH para emissão do link ou cadastro presencial.'
                      : identity.biometria.status === 'recusada'
                      ? 'Você optou por não usar reconhecimento facial, mas ainda não possui um PIN cadastrado. Entre em contato com o departamento de RH para definir seu PIN ou realize o cadastro facial abaixo.'
                      : 'A tela de bater ponto só é liberada depois que o seu rosto estiver cadastrado. Conclua o cadastro facial abaixo ou entre em contato com o departamento de RH para emissão do link de cadastro.'}
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  {identity.modo === 'pessoal' && (
                    <button
                      type="button"
                      onClick={() => setShowEnrollModal(true)}
                      className="apple-solid-btn w-full py-3.5 rounded-2xl af-btn-primary text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ScanFace className="w-5 h-5" />
                      <span>Cadastrar meu rosto agora</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={syncing || !isOnline}
                    onClick={() => void handleSyncAll(false)}
                    className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    <span>Já cadastrei no RH — Atualizar status</span>
                  </button>
                </div>
              </section>
            );
          }

          return (
            <>
              {/* Relógio Oficial + GPS */}
              <section className="rounded-3xl bg-[#111827] border border-slate-800 p-6 text-center space-y-2.5 shadow-xl">
                <p className="text-xs text-slate-400 capitalize">{fmtDateLong(nowDate)}</p>
                <div className="text-5xl sm:text-6xl font-mono font-black tracking-tight text-white tabular-nums">
                  {fmtClock(nowDate)}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
                      nearestObra?.dentro
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : gps
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {nearestObra?.dentro
                      ? `${identity.obras.find((o) => o.id === nearestObra.unitId)?.nome ?? 'Na obra'} (${nearestObra.distM} m)`
                      : gps
                      ? nearestObra
                        ? `Fora da cerca (${nearestObra.distM} m)`
                        : 'GPS ativo'
                      : 'Obtendo GPS...'}
                  </span>

                  {identity.modo === 'pessoal' && (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
                        identity.biometria.status === 'cadastrada'
                          ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <ScanFace className="w-3.5 h-3.5" />
                      {identity.biometria.status === 'cadastrada'
                        ? `Facial ativa (${identity.biometria.poses} poses)`
                        : 'Modo PIN (sem biometria)'}
                    </span>
                  )}
                </div>
              </section>

              {/* Seletor rápido do tipo da marcação */}
              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-400 px-1">
                  Marcação selecionada (sugerida automaticamente):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {TIPOS_MARCACAO.map((tipo) => {
                    const active = selectedTipo === tipo;
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => {
                          setSelectedTipo(tipo);
                          setManualTipoOverride(true);
                        }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                          active
                            ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-600/25 apple-solid-btn'
                            : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {TIPO_LABEL[tipo]}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Botão Gigante BATER PONTO */}
              {hasRegisteredFace ? (
                <button
                  type="button"
                  onClick={() => void handleStartFacialPunch()}
                  className="apple-solid-btn w-full py-6 rounded-3xl bg-gradient-to-b from-[#0A84FF] to-[#0066CC] hover:brightness-110 active:scale-[0.99] text-white shadow-2xl shadow-blue-600/30 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">
                    <Camera className="w-8 h-8" />
                  </div>
                  <span className="text-xl font-extrabold tracking-tight">BATER PONTO</span>
                  <span className="text-xs opacity-90">
                    {identity.modo === 'totem'
                      ? 'Toque e olhe para a câmera — identificação automática'
                      : `Registrar ${TIPO_LABEL[selectedTipo]} com reconhecimento facial`}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowPinModal(true);
                  }}
                  className="apple-solid-btn w-full py-6 rounded-3xl bg-gradient-to-b from-[#0A84FF] to-[#0066CC] hover:brightness-110 active:scale-[0.99] text-white shadow-2xl shadow-blue-600/30 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">
                    <KeyRound className="w-8 h-8" />
                  </div>
                  <span className="text-xl font-extrabold tracking-tight">BATER PONTO COM PIN</span>
                  <span className="text-xs opacity-90">
                    Registrar {TIPO_LABEL[selectedTipo]} (modo sem biometria)
                  </span>
                </button>
              )}

              {/* Plano B: PIN + ações secundárias */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowPinModal(true);
                  }}
                  className="py-3 px-3 rounded-2xl bg-[#111827] border border-slate-800 hover:border-slate-600 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Bater com PIN</span>
                </button>

                {identity.modo === 'pessoal' ? (
                  <button
                    type="button"
                    onClick={() => setShowEnrollModal(true)}
                    className="py-3 px-3 rounded-2xl bg-[#111827] border border-slate-800 hover:border-slate-600 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ScanFace className="w-4 h-4 text-cyan-400" />
                    <span>{identity.biometria.status === 'cadastrada' ? 'Recadastrar rosto' : 'Cadastrar rosto'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleInstallPwa()}
                    className="py-3 px-3 rounded-2xl bg-[#111827] border border-slate-800 hover:border-slate-600 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-400" />
                    <span>Instalar na tela</span>
                  </button>
                )}
              </div>

              {/* Marcações de hoje (modo pessoal) */}
              {identity.modo === 'pessoal' && identity.ultimasDoDia.length > 0 && (
                <section className="rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-2">
                  <h3 className="text-xs font-bold text-slate-300">Suas marcações de hoje</h3>
                  <div className="flex flex-wrap gap-2">
                    {identity.ultimasDoDia.map((m, i) => (
                      <span
                        key={`${m.dataHora}-${i}`}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100"
                      >
                        <span className="text-slate-400 mr-1.5 font-sans">{TIPO_LABEL[m.tipo]}</span>
                        {m.dataHora.slice(11, 16)}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          );
        })()}

        {/* Rodapé discreto */}
        <footer className="mt-auto pt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {identity.estabelecimento?.razaoSocial ?? 'Grupo Aguero'} · {identity.nomeAparelho}
          </span>
          <button
            type="button"
            onClick={async () => {
              if (pending.length > 0) {
                setErrorMsg('Sincronize as marcações pendentes antes de desparear este aparelho.');
                return;
              }
              if (window.confirm('Deseja desparear este aparelho? Será necessário gerar um novo QR no RH.')) {
                await clearDeviceIdentity();
                setIdentity(null);
              }
            }}
            className="text-slate-500 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Desparear</span>
          </button>
        </footer>
      </main>

      {/* ── OVERLAY DA CÂMERA DE RECONHECIMENTO FACIAL ── */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="ponto-camera-hud p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{scanPhase}</p>
              <p className={`text-xs ${scanFaceDetected ? 'ponto-hud-ok' : 'ponto-hud-accent'}`}>{scanHint}</p>
            </div>
            <button
              type="button"
              onClick={stopScanCamera}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer"
              aria-label="Cancelar câmera"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-60 h-76 rounded-full border-4 transition-colors duration-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.48)] ${
                  scanFaceDetected ? 'border-emerald-400' : 'border-cyan-400/90'
                }`}
              />
            </div>
            <div className="absolute bottom-6 left-4 right-4 max-w-md mx-auto space-y-3">
              <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  stopScanCamera();
                  setShowPinModal(true);
                }}
                className="ponto-camera-hud w-full py-3 rounded-2xl border border-white/25 text-xs font-semibold cursor-pointer"
              >
                Não reconheceu? Usar PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE PIN (PLANO B) ── */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitPinPunch}
            className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Registrar {TIPO_LABEL[selectedTipo]} com PIN</span>
              </h3>
              <button type="button" onClick={() => setShowPinModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {identity.modo === 'totem' && (
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-300">Quem vai bater o ponto?</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={totemSearch}
                    onChange={(e) => setTotemSearch(e.target.value)}
                    placeholder="Buscar nome..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {filteredTotemPeople.map((p) => (
                    <button
                      key={p.rhId}
                      type="button"
                      onClick={() => setTotemSelectedRhId(p.rhId)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                        totemSelectedRhId === p.rhId
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>{p.nome}</span>
                      {p.daObra && <span className="text-[10px] opacity-80">Desta obra</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">PIN (4 a 6 números)</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pinBusy || pinValue.length < 4 || (identity.modo === 'totem' && !totemSelectedRhId)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
              >
                {pinBusy ? 'Registrando...' : 'Confirmar ponto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL DE COMPROVANTES REP-P ── */}
      {showReceiptsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#111827] border border-slate-700 rounded-2xl p-5 max-h-[88vh] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>Comprovantes de Ponto (Portaria 671)</span>
              </h3>
              <button type="button" onClick={() => setShowReceiptsModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {pending.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-200">
                <span>{pending.length} marcação(ões) aguardando envio offline</span>
                <button
                  type="button"
                  disabled={!isOnline || syncing}
                  onClick={() => void handleSyncAll(false)}
                  className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold disabled:opacity-40 cursor-pointer"
                >
                  Enviar agora
                </button>
              </div>
            )}

            <div className="overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {receipts.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Nenhum comprovante salvo neste aparelho ainda.</p>
              ) : (
                receipts.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white">
                        {TIPO_LABEL[c.tipo]} · {fmtIsoData(c.dataHora)} às {fmtIsoHora(c.dataHora)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.provisorio
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {c.provisorio ? 'Pendente offline' : `NSR #${c.nsr}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {c.pessoa.nome} · {c.obra?.nome ?? 'GPS registrado'}
                    </p>
                    {c.hash && (
                      <p className="font-mono text-[10px] text-slate-500 truncate">Hash: {c.hash}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CADASTRO FACIAL + LGPD NO CELULAR PESSOAL ── */}
      {showEnrollModal && identity.modo === 'pessoal' && (
        <FaceEnrollModal
          personName={identity.pessoa?.nome ?? 'Colaborador'}
          context="self"
          existingPoses={identity.biometria.poses}
          onSaveFace={async (payload) => {
            const updated = await enrollDeviceFace({
              descriptors: payload.descriptors,
              lgpdAceito: true,
              adicionar: payload.adicionar,
            });
            setIdentity(updated);
          }}
          onDeclineBiometrics={async () => {
            const updated = await enrollDeviceFace({ recusar: true });
            setIdentity(updated);
          }}
          onClose={() => setShowEnrollModal(false)}
        />
      )}
    </div>
  );
};
