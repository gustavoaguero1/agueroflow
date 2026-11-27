import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eraser, Image as ImageIcon, Link2, PenTool, Trash2 } from 'lucide-react';

interface EvidenceCaptureInputProps {
  mode: 'foto' | 'assinatura';
  value: string;
  onChange: (nextValue: string) => void;
}

/** Compresses a camera/gallery image into a lightweight JPEG data URL (~40-90 KB). */
async function compressImageFile(file: File, maxDim = 960, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido ou corrompido.'));
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponível neste navegador.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const EvidenceCaptureInput: React.FC<EvidenceCaptureInputProps> = ({
  mode,
  value,
  onChange,
}) => {
  const [showUrlFallback, setShowUrlFallback] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signature pad state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);

  useEffect(() => {
    if (mode !== 'assinatura') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!value) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      hasStrokesRef.current = false;
    }
  }, [mode, value]);

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setBusy(true);
    try {
      const dataUrl = await compressImageFile(file);
      onChange(dataUrl);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    } finally {
      setBusy(false);
    }
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    if (!hasStrokesRef.current && !value) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const { x, y } = getCanvasPoint(e);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokesRef.current = true;
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasStrokesRef.current) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    hasStrokesRef.current = false;
    onChange('');
  };

  const isInlineImage = value.startsWith('data:image/');

  if (mode === 'foto') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs cursor-pointer apple-solid-btn">
            <Camera className="w-3.5 h-3.5" />
            <span>{busy ? 'Comprimindo...' : value ? 'Trocar foto' : 'Tirar foto / Galeria'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => void handlePhotoFile(e)}
              disabled={busy}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowUrlFallback((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
          >
            <Link2 className="w-3 h-3" />
            <span>{showUrlFallback ? 'Ocultar link' : 'Colar link HTTPS'}</span>
          </button>

          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 text-[11px] font-medium cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remover</span>
            </button>
          )}
        </div>

        {photoError && <p className="text-[11px] text-rose-400">{photoError}</p>}

        {isInlineImage && (
          <div className="inline-flex items-center gap-3 p-2 rounded-xl bg-slate-950/70 border border-emerald-500/30">
            <img
              src={value}
              alt="Evidência fotográfica"
              className="w-20 h-16 object-cover rounded-lg border border-slate-700"
            />
            <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Foto anexada e comprimida</span>
            </div>
          </div>
        )}

        {!isInlineImage && value && !showUrlFallback && (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 truncate">
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{value}</span>
          </p>
        )}

        {showUrlFallback && (
          <input
            type="url"
            value={isInlineImage ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... (opcional, caso a foto esteja em nuvem externa)"
            className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 font-medium">
          <PenTool className="w-3.5 h-3.5 text-blue-400" />
          <span>Assine no quadro abaixo (dedo ou mouse)</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearSignature}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
          >
            <Eraser className="w-3 h-3" />
            <span>Limpar</span>
          </button>
          <button
            type="button"
            onClick={() => setShowUrlFallback((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
          >
            <Link2 className="w-3 h-3" />
            <span>{showUrlFallback ? 'Ocultar link' : 'Link HTTPS'}</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-700 bg-white">
        <canvas
          ref={canvasRef}
          width={520}
          height={150}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-32 touch-none cursor-crosshair block"
          style={{ backgroundColor: '#FFFFFF' }}
        />
      </div>

      {value && (
        <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Assinatura capturada com sucesso</span>
        </p>
      )}

      {showUrlFallback && (
        <input
          type="url"
          value={isInlineImage ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://... (link da assinatura no Storage, opcional)"
          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
};
