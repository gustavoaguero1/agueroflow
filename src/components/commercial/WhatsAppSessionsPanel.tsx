import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Star, UserCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  claimLegacyWhatsAppSession,
  fetchWhatsAppSessions,
  setOfficialWhatsAppSession,
  type WhatsAppSessionSummary,
} from '../../services/composioWhatsAppClient';

/**
 * WhatsApps da empresa: cada pessoa conecta o próprio (QR ao lado). Admin escolhe qual número a
 * empresa usa para avisos e automações e pode assumir o WhatsApp antigo (que era único para todos).
 */
export const WhatsAppSessionsPanel: React.FC = () => {
  const { isAdmin, isManagerOrAbove, isMaster } = useAuth();
  const canSee = isMaster || isManagerOrAbove;
  const canEdit = isMaster || isAdmin;
  const [sessions, setSessions] = useState<WhatsAppSessionSummary[]>([]);
  const [mine, setMine] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchWhatsAppSessions().catch(() => null);
    if (r?.success) {
      setSessions(r.sessions || []);
      setMine(r.mySessionKey || '');
    }
  }, []);
  useEffect(() => { if (canSee) load(); }, [canSee, load]);

  if (!canSee) return null;

  const act = async (fn: () => Promise<{ success: boolean; error?: string; message?: string }>, ok: string) => {
    setBusy(true);
    setMsg('');
    const r: { success: boolean; error?: string; message?: string } = await fn().catch((e) => ({ success: false, error: String(e?.message || e) }));
    setMsg(r.success ? r.message || ok : r.error || 'Não foi possível concluir.');
    setBusy(false);
    load();
  };

  const legacy = sessions.find((s) => s.legacy);
  const hasOfficial = sessions.some((s) => s.official);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">WhatsApps da empresa</h3>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Atualizar lista">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Cada pessoa conecta o próprio WhatsApp pelo QR Code. O número marcado como oficial envia os avisos e as automações da
        empresa (NDs, comandos programados e resumo semanal).
        {!hasOfficial && ' Nenhum número oficial escolhido: as automações usam o primeiro WhatsApp conectado.'}
      </p>

      {sessions.length === 0 && <div className="text-sm text-slate-500">Ninguém conectou um WhatsApp nesta empresa ainda.</div>}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {sessions.map((s) => (
          <li key={s.key} className="py-2 flex items-center gap-3 text-sm">
            <Smartphone className={`w-4 h-4 shrink-0 ${s.state === 'conectado' ? 'text-emerald-500' : 'text-slate-400'}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-slate-900 dark:text-slate-100">
                {s.connectedName || s.connectedNumber || (s.legacy ? 'WhatsApp antigo (único)' : 'WhatsApp de um usuário')}
                {s.key === mine && <span className="ml-2 text-xs text-blue-600">você</span>}
              </div>
              <div className="text-xs text-slate-500">
                {s.connectedNumber || 'sem número'} · {s.state === 'conectado' ? 'conectado' : 'desconectado'}
                {s.legacy && ' · era o número de todos'}
              </div>
            </div>
            {s.official ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Star className="w-3.5 h-3.5" /> Oficial</span>
            ) : (
              canEdit && (
                <button disabled={busy} onClick={() => act(() => setOfficialWhatsAppSession(s.key), 'Número oficial atualizado.')}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 hover:border-blue-500 disabled:opacity-50">
                  Tornar oficial
                </button>
              )
            )}
          </li>
        ))}
      </ul>

      {canEdit && legacy && (
        <button disabled={busy} onClick={() => act(claimLegacyWhatsAppSession, 'O WhatsApp antigo agora é o seu.')}
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50">
          <UserCheck className="w-4 h-4" /> O WhatsApp antigo é meu: assumir como o meu WhatsApp
        </button>
      )}
      {msg && <div className="text-xs text-slate-600 dark:text-slate-300">{msg}</div>}
    </div>
  );
};
