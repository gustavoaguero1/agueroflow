type FetchTarget = { fetch: typeof fetch; location: { origin: string } };

/** Returns a fetch that adds `Authorization: Bearer <token>` (mirrored in `X-Firebase-Auth`) to same-origin /api/ calls (never overwriting one).
 * It never replaces window.fetch: some hosts (Google AI Studio) expose it as a read-only getter. */
export function createApiFetch(getToken: () => Promise<string | null>, target: FetchTarget = globalThis as any): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const orig = target.fetch.bind(target); // read at call time: the host may swap its own fetch
    const isReq = typeof Request !== 'undefined' && input instanceof Request;
    const raw = isReq ? (input as Request).url : input instanceof URL ? input.href : String(input);
    const url = new URL(raw, target.location.origin);
    if (url.origin !== target.location.origin || !url.pathname.startsWith('/api/')) return orig(input, init);
    const headers = new Headers(init?.headers ?? (isReq ? (input as Request).headers : undefined));
    let bearer = headers.get('Authorization');
    if (!bearer) {
      const token = await getToken().catch(() => null);
      if (!token) return orig(input, init);
      bearer = `Bearer ${token}`;
      headers.set('Authorization', bearer);
    }
    // Hosting proxies (Cloud Run behind Google AI Studio) can consume/strip Authorization: mirror it in our own header.
    if (!headers.has('X-Firebase-Auth')) headers.set('X-Firebase-Auth', bearer);
    return orig(input, { ...init, headers });
  };
}

let tokenGetter: () => Promise<string | null> = async () => null;
/** Called once at startup (main.tsx) with the Firebase ID token source. */
export function setApiTokenGetter(fn: () => Promise<string | null>): void { tokenGetter = fn; }
/** Use instead of fetch everywhere in the browser code: identical for other URLs, adds the token for /api/. */
export const apiFetch: typeof fetch = createApiFetch(() => tokenGetter());

/** POST JSON to our API. `error` is the server's Portuguese message; machine codes (no spaces, e.g. 'internal') are dropped. */
export async function postJson<T = any>(
  path: string, body: unknown = {}, headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const r = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
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
  const r = await apiFetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob());
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
