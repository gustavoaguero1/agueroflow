import React, { useState } from 'react';
import { postJson } from '../../apiAuthFetch';

/** "Gerar link de primeiro acesso" for a member without password: generates, then offers copy + WhatsApp share. */
export const FirstAccessLinkButton: React.FC<{ memberId: string; memberName: string; className?: string }> = ({
  memberId,
  memberName,
  className,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await postJson<{ url: string }>('/api/auth/first-access/link', { memberId });
      if (!res.ok) return alert(res.error || 'Não foi possível gerar o link de primeiro acesso.');
      // Server returns a relative URL when APP_URL is not configured.
      setUrl(new URL(res.data.url, window.location.origin).href);
    } catch {
      alert('Não foi possível gerar o link de primeiro acesso.');
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(url!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const text = () =>
    encodeURIComponent(`Olá ${memberName}! Use este link de uso único para definir sua senha de acesso:\n\n${url}`);

  const btn = className || 'px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer';
  if (!url) {
    return (
      <button type="button" onClick={generate} disabled={busy} className={btn}>
        {busy ? 'Gerando...' : 'Gerar link de primeiro acesso'}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={copy} className={btn} title={url}>
        {copied ? 'Copiado!' : 'Copiar link'}
      </button>
      <a href={`https://wa.me/?text=${text()}`} target="_blank" rel="noreferrer" className={btn}>
        WhatsApp
      </a>
    </span>
  );
};
