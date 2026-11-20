type FetchTarget = { fetch: typeof fetch; location: { origin: string } };

/** Wraps target.fetch so same-origin /api/ calls carry `Authorization: Bearer <token>` (never overwriting one). */
export function installApiAuthFetch(getToken: () => Promise<string | null>, target: FetchTarget = globalThis as any): void {
  const orig = target.fetch.bind(target);
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const isReq = typeof Request !== 'undefined' && input instanceof Request;
    const raw = isReq ? (input as Request).url : input instanceof URL ? input.href : String(input);
    const url = new URL(raw, target.location.origin);
    if (url.origin !== target.location.origin || !url.pathname.startsWith('/api/')) return orig(input, init);
    const headers = new Headers(init?.headers ?? (isReq ? (input as Request).headers : undefined));
    if (headers.has('Authorization')) return orig(input, init);
    const token = await getToken().catch(() => null);
    if (!token) return orig(input, init);
    headers.set('Authorization', `Bearer ${token}`);
    return orig(input, { ...init, headers });
  };
}

/** POST JSON to our API. `error` is the server's Portuguese message; machine codes (no spaces, e.g. 'internal') are dropped. */
export async function postJson<T = any>(
  path: string, body: unknown = {}, headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  const error = typeof data?.error === 'string' && data.error.includes(' ') ? data.error : undefined;
  return { ok: r.ok && data?.ok !== false, status: r.status, data, error };
}

/** Fire-and-forget: recompute a member's claims after create / role or org change / removal. */
export function refreshClaims(memberId: string): void {
  postJson(`/api/auth/refresh-claims/${encodeURIComponent(memberId)}`)
    .then((r) => { if (!r.ok) console.warn('Falha ao atualizar permissões do colaborador:', r.status, r.error); })
    .catch((err) => console.warn('Falha ao atualizar permissões do colaborador:', err));
}

/** Downloads an /api/ file through fetch (so it carries the token); a plain link or window.open would not. */
export async function downloadApi(url: string, fileName: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob());
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
