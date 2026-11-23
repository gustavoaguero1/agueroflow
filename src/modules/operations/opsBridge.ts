/**
 * Ponte do módulo Operações.
 *
 * A página de Operações (public/operacoes/index.html, vinda do "Aguero Inox 2.0") foi escrita sobre um
 * runtime com `claude.use('db' | 'user' | 'assets' | 'sample' | 'downloads')`. Este arquivo monta esses
 * objetos sobre o Firebase do AgueroFlow, e o OperationsModule publica o resultado em `window.__agueroOps`.
 *
 * Dados: tudo fica em `ops_orgs/{orgId}/...`, então `db.doc('config/params')` vira
 * `ops_orgs/{orgId}/config/params` e cada empresa tem a sua base, isolada pelo firestore.rules.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { User } from 'firebase/auth';
import { db, storage } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import type { UserRole } from '../../types';

export interface OpsContext {
  orgId: string;
  user: User;
  userName: string;
  role: UserRole;
  isManager: boolean; // Admin, Gerente ou master
}

type Unsub = () => void;

/** Firestore recusa `undefined`; a página às vezes manda campos vazios assim. */
function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as unknown as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = stripUndefined(x);
    return out as T;
  }
  return v;
}

/** A página trata `invalid_argument` como "sem permissão"; o Firestore usa `permission-denied`. */
function mapError(e: any): any {
  if (e && e.code === 'permission-denied') {
    const err: any = new Error(e.message);
    err.code = 'invalid_argument';
    return err;
  }
  return e;
}
const wrapErr = <T,>(p: Promise<T>) => p.catch((e) => { throw mapError(e); });

const snapDoc = (d: DocumentSnapshot<DocumentData>) => ({ id: d.id, exists: d.exists(), data: () => d.data() });
const snapQuery = (s: QuerySnapshot<DocumentData>) => ({
  docs: s.docs.map(snapDoc),
  size: s.size,
  empty: s.empty,
});

export function createOpsBridge(ctx: OpsContext) {
  const subs = new Set<Unsub>();
  const base = (path: string) => `ops_orgs/${ctx.orgId}/${String(path).replace(/^\/+|\/+$/g, '')}`;

  const docApi = (path: string) => {
    const r = doc(db, base(path));
    return {
      id: r.id,
      get: () => wrapErr(getDoc(r)).then(snapDoc),
      set: (data: DocumentData, opts?: { merge?: boolean }) =>
        wrapErr(setDoc(r, stripUndefined(data), opts?.merge ? { merge: true } : {})),
      update: (data: DocumentData) => wrapErr(updateDoc(r, stripUndefined(data))),
      delete: () => wrapErr(deleteDoc(r)),
      onSnapshot: (next: (s: ReturnType<typeof snapDoc>) => void, err?: (e: any) => void) => {
        const u = onSnapshot(r, (s) => next(snapDoc(s)), (e) => err?.(mapError(e)));
        subs.add(u);
        return () => { u(); subs.delete(u); };
      },
    };
  };

  const collectionApi = (path: string) => {
    const c = collection(db, base(path));
    return {
      doc: (id?: string) => docApi(`${path}/${id || doc(c).id}`),
      add: (data: DocumentData) => wrapErr(addDoc(c, stripUndefined(data))).then((r) => ({ id: r.id })),
      get: () => wrapErr(getDocs(c)).then(snapQuery),
      onSnapshot: (next: (s: ReturnType<typeof snapQuery>) => void, err?: (e: any) => void) => {
        const u = onSnapshot(c, (s) => next(snapQuery(s)), (e) => err?.(mapError(e)));
        subs.add(u);
        return () => { u(); subs.delete(u); };
      },
    };
  };

  // Pessoas da empresa (org_members). A uid de login com senha é `member_<docId>`; com Google, `userId`.
  let membersCache: Promise<Array<{ id: string; name: string; email: string }>> | null = null;
  const members = () =>
    (membersCache ||= getDocs(query(collection(db, 'org_members'), where('orgId', '==', ctx.orgId)))
      .then((s) =>
        s.docs
          .map((d) => ({ docId: d.id, ...(d.data() as any) }))
          .filter((m) => m.active !== false)
          .flatMap((m) => {
            const docId = m.docId;
            const out = [{ id: `member_${docId}`, name: m.userName || m.userEmail || '', email: m.userEmail || '' }];
            if (m.userId) out.push({ id: m.userId, name: m.userName || m.userEmail || '', email: m.userEmail || '' });
            return out;
          }),
      )
      .catch(() => []));

  const userApi = {
    id: async () => ctx.user.uid,
    me: async () => ({ id: ctx.user.uid, name: ctx.userName || ctx.user.displayName || ctx.user.email || '' }),
    isOwner: async () => ctx.isManager,
    canEdit: async () => ctx.isManager,
    can: async (perm: string) => (perm === 'data.write' ? ctx.role !== 'Visualizador' : true),
    profiles: async (ids: string[]) => {
      const all = await members();
      const out: Record<string, { name: string }> = {};
      for (const id of ids) {
        const m = all.find((x) => x.id === id);
        if (m) out[id] = { name: m.name };
      }
      return out;
    },
    search: async (q: string) => {
      const k = String(q || '').toLowerCase().trim();
      const seen = new Set<string>();
      return (await members())
        .filter((m) => m.id.startsWith('member_'))
        .filter((m) => !k || m.name.toLowerCase().includes(k) || m.email.toLowerCase().includes(k))
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
        .map((m) => ({ id: m.id, name: m.name }));
    },
  };

  const assetsApi = {
    upload: async (file: File) => {
      const safe = (file.name || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-80);
      const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
      const r = ref(storage, `operacoes/${ctx.orgId}/${id}`);
      await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
      return { id, url: await getDownloadURL(r) };
    },
  };

  const toBase64 = (b: Blob) =>
    new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(b);
    });

  const MAX_IMAGES = 8;
  const sampleApi = {
    limits: async () => ({ images: { maxCount: MAX_IMAGES } }),
    /** Lê imagens com a IA do servidor (Gemini) e devolve o JSON pedido no prompt. */
    json: async (prompt: string, opts?: { images?: Blob[] }) => {
      const images = await Promise.all(
        (opts?.images || []).slice(0, MAX_IMAGES).map(async (b) => ({ mimeType: b.type || 'image/jpeg', data: await toBase64(b) })),
      );
      const r = await apiFetch('/api/operacoes/ai-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, images }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(body.error || 'Falha na leitura por IA'), { code: 'ai_error' });
      return body.result;
    },
  };

  return {
    api: { db: { collection: collectionApi, doc: docApi }, user: userApi, assets: assetsApi, sample: sampleApi, downloads: null },
    dispose: () => { subs.forEach((u) => u()); subs.clear(); },
  };
}
