import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Printer, QrCode, X } from 'lucide-react';
import { buildQrDeepLinkUrl, type QrEntityType } from '../../services/qrDeepLinkRules';

export interface QrLabelTarget {
  entityType: QrEntityType;
  entityId: string;
  orgId?: string;
  code: string;
  title: string;
  subtitle?: string;
  metaLines?: string[];
}

interface QrLabelModalProps {
  target: QrLabelTarget | null;
  onClose: () => void;
}

export const QrLabelModal: React.FC<QrLabelModalProps> = ({ target, onClose }) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const deepLink = target
    ? buildQrDeepLinkUrl({
        origin: typeof window !== 'undefined' ? window.location.origin : 'https://agueroflow.app',
        entityType: target.entityType,
        entityId: target.entityId,
        orgId: target.orgId,
      })
    : '';

  useEffect(() => {
    if (!deepLink) {
      setDataUrl('');
      return;
    }
    let mounted = true;
    QRCode.toDataURL(deepLink, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (mounted) setDataUrl(url);
      })
      .catch(() => {
        if (mounted) setDataUrl('');
      });
    return () => {
      mounted = false;
    };
  }, [deepLink]);

  if (!target) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=420,height=520');
    if (!win) return;
    const metas = (target.metaLines || [])
      .map((line) => `<div style="font-size:11px;color:#475569;margin-top:2px;">${line.replace(/</g, '&lt;')}</div>`)
      .join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta QR - ${target.code}</title></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:20px;display:flex;justify-content:center;">
        <div style="border:2px solid #0f172a;border-radius:14px;padding:18px;width:300px;text-align:center;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#0071E3;text-transform:uppercase;">AgueroFlow · Campo</div>
          <div style="font-family:monospace;font-size:18px;font-weight:800;margin-top:6px;">${target.code.replace(/</g, '&lt;')}</div>
          <div style="font-size:13px;font-weight:600;margin-top:2px;">${target.title.replace(/</g, '&lt;')}</div>
          ${target.subtitle ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${target.subtitle.replace(/</g, '&lt;')}</div>` : ''}
          ${dataUrl ? `<img src="${dataUrl}" alt="QR" style="width:180px;height:180px;margin:12px auto;display:block;" />` : ''}
          ${metas}
        </div>
        <script>window.onload=function(){window.print();};</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="af-glass-strong rounded-3xl max-w-sm w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#0071E3] dark:text-[#409CFF]">
              <QrCode className="w-3.5 h-3.5" />
              Etiqueta QR de Campo
            </span>
            <h3 className="text-base font-bold text-[#1D1D1F] dark:text-white mt-0.5">{target.code}</h3>
            <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">{target.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white rounded-2xl p-4 flex flex-col items-center justify-center border border-black/[0.08]">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR ${target.code}`} className="w-48 h-48" />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">Gerando QR...</div>
          )}
          {target.subtitle && <p className="text-xs font-medium text-slate-700 mt-2 text-center">{target.subtitle}</p>}
          {target.metaLines && target.metaLines.length > 0 && (
            <div className="mt-1 space-y-0.5 text-center">
              {target.metaLines.map((line, idx) => (
                <p key={idx} className="text-[11px] text-slate-500">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex-1 af-btn-glass py-2 px-3 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#1E7E34]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copiado' : 'Copiar Link'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 af-btn-primary py-2 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer apple-solid-btn"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Etiqueta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
