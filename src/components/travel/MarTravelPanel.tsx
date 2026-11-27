/**
 * Mar Travel: canal oficial de passagens. Mostra a conta Mar Travel de quem está usando
 * (login guardado no cofre do servidor; a senha nunca volta para a tela) e abre a plataforma.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Plane, Bus, Hotel, ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import { apiFetch } from '../../apiAuthFetch';
import { MARTRAVEL_LOGIN_URL } from '../../services/marTravel';
import { MarTravelCompras } from './MarTravelCompras';

interface Account { connected: boolean; login?: string; updatedAt?: string }

const card = 'bg-[#111827] border border-slate-700/80 rounded-2xl p-6 shadow-xl';
const input = 'w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500';

export const MarTravelPanel: React.FC<{ orgId: string; canManage?: boolean }> = ({ orgId, canManage = false }) => {
  const [acc, setAcc] = useState<Account | null>(null);
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/travel/martravel/account?orgId=${encodeURIComponent(orgId)}`);
      setAcc(r.ok ? await r.json() : { connected: false });
    } catch {
      setAcc({ connected: false });
    }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch('/api/travel/martravel/account', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, login, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error === 'cofre_indisponivel'
          ? 'O cofre de senhas ainda não foi configurado no servidor. Peça ao administrador para configurar a chave MARTRAVEL_SECRET_KEY.'
          : j.error || 'Não foi possível salvar agora.');
        return;
      }
      setPassword(''); setEditing(false); setMsg('Conta Mar Travel salva.');
      await load();
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setMsg(null);
    try {
      await apiFetch(`/api/travel/martravel/account?orgId=${encodeURIComponent(orgId)}`, { method: 'DELETE' });
      setMsg('Conta Mar Travel removida.');
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto text-slate-100">
      <div className={`${card} flex flex-col md:flex-row md:items-center justify-between gap-5`}>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
            <ShieldCheck className="w-4 h-4" /> Canal oficial de compra
          </div>
          <h1 className="text-xl font-bold text-white tracking-[-0.02em]">Mar Travel</h1>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Toda compra de passagem é feita pela Mar Travel, com as tarifas e os descontos negociados da empresa.
            Cada colaborador usa o próprio login.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 pt-1">
            <span className="flex items-center gap-1"><Plane className="w-3.5 h-3.5" /> Aéreo</span>
            <span className="flex items-center gap-1"><Bus className="w-3.5 h-3.5" /> Rodoviário</span>
            <span className="flex items-center gap-1"><Hotel className="w-3.5 h-3.5" /> Hotéis (em teste)</span>
          </div>
        </div>
        <a
          href={MARTRAVEL_LOGIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start md:self-auto px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
        >
          Abrir Mar Travel <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <MarTravelCompras orgId={orgId} canManage={canManage} />

      <div className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-cyan-400" /> Minha conta Mar Travel</h3>
          {acc?.connected && !editing && (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setLogin(acc.login || ''); setEditing(true); }} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">Trocar login</button>
              <button type="button" onClick={remove} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-rose-300 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Remover</button>
            </div>
          )}
        </div>

        {acc === null ? (
          <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
        ) : acc.connected && !editing ? (
          <p className="text-xs text-slate-300">
            Conectada como <b className="text-white">{acc.login}</b>
            {acc.updatedAt ? <span className="text-slate-500"> · salva em {new Date(acc.updatedAt).toLocaleDateString('pt-BR')}</span> : null}
          </p>
        ) : (
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end"
            onSubmit={(e) => { e.preventDefault(); if (login.trim() && password) save(); }}
          >
            <label className="space-y-1 text-xs text-slate-400">
              <span>Login (e-mail) da Mar Travel</span>
              <input className={input} type="email" autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              <span>Senha da Mar Travel</span>
              <input className={input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !login.trim() || !password} className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs">
                {busy ? 'Salvando…' : 'Salvar conta'}
              </button>
              {editing && <button type="button" onClick={() => { setEditing(false); setPassword(''); }} className="px-3 py-2 rounded-xl bg-slate-800 text-xs text-slate-200">Cancelar</button>}
            </div>
          </form>
        )}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          A senha fica cifrada no servidor e nunca volta para esta tela. As compras acima chegam pela integração oficial da empresa
          com a Mar Travel e não dependem desta senha; para comprar, use o botão "Abrir Mar Travel".
        </p>
        {msg && <p className="text-xs text-cyan-300">{msg}</p>}
      </div>
    </div>
  );
};
