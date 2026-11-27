import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Trash2 } from 'lucide-react';
import { useOfflineSync } from '../../contexts/OfflineSyncContext';

export const OfflineSyncIndicator: React.FC = () => {
  const { isOnline, items, pendingCount, conflictCount, dismissItem, clearSynced } = useOfflineSync();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const badgeCount = pendingCount + conflictCount;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        title={isOnline ? 'Conexão ativa e fila de sincronização' : 'Sem conexão — operando em modo offline'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer af-btn-glass ${
          !isOnline || conflictCount > 0 ? 'border-amber-500/50' : ''
        }`}
      >
        {isOnline ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] af-live-dot" />
            <Cloud className="w-3.5 h-3.5 text-[#1E7E34] dark:text-[#30D158]" />
          </>
        ) : (
          <>
            <CloudOff className="w-3.5 h-3.5 text-[#D70015] dark:text-[#FF453A]" />
            <span className="hidden xl:inline text-[#D70015] dark:text-[#FF453A] font-semibold">Offline</span>
          </>
        )}
        {badgeCount > 0 && (
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white tabular-nums ${
              conflictCount > 0 ? 'bg-[#D70015]' : 'bg-[#0071E3]'
            }`}
          >
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 af-glass-strong rounded-2xl overflow-hidden text-xs">
          <div className="px-4 py-3 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#1D1D1F] dark:text-white">
                {isOnline ? 'Sincronização Online' : 'Modo Offline Ativo'}
              </p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                Fila idempotente com proteção contra conflito (HTTP 409).
              </p>
            </div>
            {items.some((i) => i.status === 'sincronizado') && (
              <button
                type="button"
                onClick={clearSynced}
                className="text-[11px] text-[#0071E3] dark:text-[#409CFF] hover:underline font-medium cursor-pointer"
              >
                Limpar OK
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto custom-scrollbar p-2.5 space-y-2">
            {items.length === 0 ? (
              <div className="py-6 text-center text-[#6E6E73] dark:text-[#98989D] space-y-1">
                <CheckCircle2 className="w-5 h-5 mx-auto text-[#1E7E34] dark:text-[#30D158]" />
                <p className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">Fila de campo 100% sincronizada</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.06] dark:border-white/[0.08] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-[#1D1D1F] dark:text-white truncate">
                      {item.entityType} · {item.entityId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        item.status === 'conflito'
                          ? 'bg-[#FFE5E7] text-[#D70015]'
                          : item.status === 'sincronizado'
                          ? 'bg-[#E8F8EE] text-[#1E7E34]'
                          : 'bg-[#EBF5FF] text-[#0066CC]'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  {item.errorReason && (
                    <p className="text-[11px] text-[#D70015] dark:text-[#FF453A] flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{item.errorReason}</span>
                    </p>
                  )}
                  {(item.status === 'conflito' || item.status === 'rejeitado') && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => dismissItem(item.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#D70015] dark:text-[#FF453A] hover:underline cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Manter versão do servidor (descartar local)</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
