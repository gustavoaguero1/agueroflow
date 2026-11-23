import React, { useEffect, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import { postJson, apiFetch } from '../apiAuthFetch';
import { GatLogo } from '../components/common/GatLogo';

export const FirstAccessPage: React.FC<{ token: string }> = ({ token }) => {
  const [info, setInfo] = useState<{ memberName: string; orgName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    apiFetch(`/api/auth/first-access/check/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok && !d.error) return setInfo(d);
        // Same rule as postJson: only sentences are user-facing; codes like 'auth_unavailable' get a generic message.
        setError(typeof d.error === 'string' && d.error.includes(' ') ? d.error : 'Não foi possível validar o link. Tente novamente.');
      })
      .catch(() => setError('Não foi possível validar o link. Tente novamente.'))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.trim().length < 6) return setError('A nova senha deve ter no mínimo 6 caracteres.');
    if (password !== confirm) return setError('As senhas digitadas não conferem.');
    setSaving(true);
    try {
      const res = await postJson('/api/auth/first-access/complete', { token, newPassword: password });
      if (!res.ok) throw new Error(res.error || 'Não foi possível cadastrar a senha.');
      await signInWithCustomToken(auth, res.data.token);
      window.location.replace('/');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível cadastrar a senha.');
      setSaving(false);
    }
  };

  const input =
    'w-full px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-sm outline-none focus:border-[#0071E3]';

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] flex items-center justify-center p-4 text-[#1D1D1F] dark:text-[#F5F5F7] font-sans">
      <div className="w-full max-w-sm bg-white dark:bg-[#1C1C1E] rounded-2xl shadow p-6 space-y-4">
        <GatLogo size="lg" />
        <h1 className="text-lg font-semibold">Primeiro acesso</h1>
        {checking && <p className="text-sm">Validando link...</p>}
        {info && (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm">
              {info.memberName}
              {info.orgName ? ` — ${info.orgName}` : ''}: defina sua senha pessoal.
            </p>
            <input type="password" aria-label="Nova senha" placeholder="Nova senha (mínimo 6 caracteres)" className={input}
              value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <input type="password" aria-label="Confirmar senha" placeholder="Confirme a nova senha" className={input}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            <button type="submit" disabled={saving}
              className="w-full py-3 rounded-xl bg-[#0071E3] text-white font-semibold text-sm disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar senha e entrar'}
            </button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
};
