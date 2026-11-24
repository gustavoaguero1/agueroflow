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
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { getBytes, getDownloadURL, ref, uploadBytes, uploadString } from 'firebase/storage';
import type { User } from 'firebase/auth';
import { db, storage } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import type { Unit, UserRole } from '../../types';
import { INOX_COLLECTIONS, rewriteUrls, type InoxBackup } from './inoxBackup';
import { createPeopleSource } from './peopleSource';
import { createObrasSource } from './obrasSource';
import { syncDiarioToTimeLogs } from './diarioSync';
import { matchByName, rhEmployeeFromInox } from './inoxBackup';
import { nextUnitCode, splitColabWrite, splitObraWrite } from './unifiedCollections';
import { syncAllRhEmployeesToFieldWorkers } from '../../services/rhPayrollService';
import type { RhEmployee } from '../../types/rhPayroll';

export { parseInoxBackup, summarizeInoxBackup, type InoxBackup } from './inoxBackup';

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

/** Documento de coleção virtual: mesmos métodos que a página usa, com os erros traduzidos. */
function wrapVirtualDoc(d: { id: string } & Record<string, any>) {
  const w = (fn?: (...a: any[]) => Promise<unknown>) => (...a: any[]) =>
    fn ? wrapErr(Promise.resolve().then(() => fn(...a))) : Promise.reject(Object.assign(new Error('não suportado'), { code: 'owned_elsewhere' }));
  return { id: d.id, set: w(d.set), update: w(d.update), delete: w(d.delete) };
}

const snapDoc = (d: DocumentSnapshot<DocumentData>) => ({ id: d.id, exists: d.exists(), data: () => d.data() });
const snapQuery = (s: QuerySnapshot<DocumentData>) => ({
  docs: s.docs.map(snapDoc),
  size: s.size,
  empty: s.empty,
});

export function createOpsBridge(ctx: OpsContext) {
  const subs = new Set<Unsub>();
  const base = (path: string) => `ops_orgs/${ctx.orgId}/${String(path).replace(/^\/+|\/+$/g, '')}`;

  // Pessoas e salários vêm do RH (ver peopleSource.ts); demais coleções ficam em ops_orgs/{orgId}.
  const track = (u: Unsub) => { subs.add(u); return () => { u(); subs.delete(u); }; };
  const people = createPeopleSource(ctx.orgId, track);
  const obras = createObrasSource(ctx.orgId, track);
  const split = (path: string) => {
    const p = String(path).replace(/^\/+|\/+$/g, '');
    const i = p.indexOf('/');
    return i < 0 ? { col: p, id: '' } : { col: p.slice(0, i), id: p.slice(i + 1) };
  };

  const docApi = (path: string): any => {
    const { col, id } = split(path);
    if (col === 'colaboradores' && id) return wrapVirtualDoc(people.colabDoc(id));
    if (col === 'salarios' && id) return wrapVirtualDoc(people.salarioDoc(id));
    if (col === 'obras' && id) return wrapVirtualDoc(obras.obraDoc(id));
    if (col === 'diario' && /^\d{4}-\d{2}-\d{2}$/.test(id)) return withDiarioSync(docApiRaw(path), id);
    return docApiRaw(path);
  };

  /** Diário gravado → apontamento de jornada do dia (falha no espelho não desfaz o diário). */
  const withDiarioSync = (d: any, iso: string) => {
    const after = (p: Promise<unknown>) =>
      p.then((r) => { syncDiarioToTimeLogs(ctx.orgId, iso).catch((e) => console.warn('[operacoes] apontamento do diário', e)); return r; });
    return { ...d, set: (...a: any[]) => after(d.set(...a)), update: (...a: any[]) => after(d.update(...a)) };
  };

  const docApiRaw = (path: string): any => {
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

  const collectionApi = (path: string): any => {
    const { col } = split(path);
    if (col === 'colaboradores') return people.colaboradores;
    if (col === 'salarios') return people.salarios;
    if (col === 'obras') return obras.obras;
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

  /** Arquivos de apoio do Inox (historico.json, lote2.json, fat_seed.json) guardados pelo importador. */
  const fileCache = new Map<string, Promise<unknown>>();
  const filesApi = {
    get: (name: string) => {
      if (!/^[\w.-]+\.json$/.test(name)) return Promise.resolve(null);
      if (!fileCache.has(name)) {
        fileCache.set(name, getBytes(ref(storage, `operacoes/${ctx.orgId}/arquivos_${name}`))
          .then((b) => JSON.parse(new TextDecoder().decode(b)))
          .catch(() => null));
      }
      return fileCache.get(name)!;
    },
  };

  return {
    api: { db: { collection: collectionApi, doc: docApi }, user: userApi, assets: assetsApi, sample: sampleApi, files: filesApi, downloads: null },
    dispose: () => { subs.forEach((u) => u()); subs.clear(); },
  };
}

// ---------------------------------------------------------------------------------------------
// Importação do backup do "Aguero Inox 2.0" (gerado por tools/exportar-inox.js).

/**
 * Grava o backup na base da empresa (ops_orgs/{orgId}). Mantém os ids originais, então importar
 * de novo atualiza em vez de duplicar. Anexos vão para o Storage e os links são trocados.
 */
export async function importInoxBackup(orgId: string, b: InoxBackup, onProgress: (msg: string) => void) {
  const urlMap = new Map<string, string>();
  const anexos = Object.entries(b.anexos || {});
  let n = 0;
  for (const [oldUrl, dataUrl] of anexos) {
    n++;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) continue;
    const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || 'application/octet-stream';
    const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5);
    const id = `inox_${n}_${Date.now().toString(36)}.${ext}`;
    const r = ref(storage, `operacoes/${orgId}/${id}`);
    await uploadString(r, dataUrl, 'data_url', { contentType: mime });
    urlMap.set(oldUrl, await getDownloadURL(r));
    if (n % 5 === 0 || n === anexos.length) onProgress(`Anexos: ${n} de ${anexos.length}`);
  }

  for (const [name, json] of Object.entries(b.arquivos || {})) {
    if (!/^[\w.-]+\.json$/.test(name)) continue;
    await uploadString(ref(storage, `operacoes/${orgId}/arquivos_${name}`), JSON.stringify(json), 'raw', { contentType: 'application/json' });
    onProgress(`Arquivo de apoio: ${name}`);
  }

  const writes: Array<{ path: string; data: DocumentData; merge?: boolean }> = [];
  const UNIFIED = ['colaboradores', 'salarios', 'obras'];

  // Obras → unidades do AgueroFlow (casa por código, depois por nome; senão cria a unidade).
  const units = (await getDocs(query(collection(db, 'units'), where('orgId', '==', orgId)))).docs
    .map((d) => ({ ...(d.data() as Unit), id: d.id }));
  const unitOfObra = new Map<string, Unit>();
  const stat = { pessoasCasadas: 0, pessoasCriadas: 0, obrasCasadas: 0, obrasCriadas: 0 };
  for (const row of b.colecoes.obras || []) {
    const { id, ...data } = row;
    if (!id) continue;
    let u = units.find((x) => data.os && String(x.code) === String(data.os)) || matchByName(String(data.nome || ''), units);
    if (u) stat.obrasCasadas++;
    else {
      const { unitPatch } = splitObraWrite(data);
      const now = new Date().toISOString();
      u = { orgId, name: unitPatch.name || 'Obra', code: unitPatch.code || nextUnitCode(units.map((x) => String(x.code))),
        city: unitPatch.city || '', state: unitPatch.state || '', managerName: unitPatch.managerName || '',
        createdAt: now, updatedAt: now, id: doc(collection(db, 'units')).id };
      const { id: uid, ...unitData } = u;
      writes.push({ path: `units/${uid}`, data: unitData });
      units.push(u);
      stat.obrasCriadas++;
    }
    unitOfObra.set(id, u);
    writes.push({ path: `ops_orgs/${orgId}/obras/${id}`, data: { ...stripUndefined(splitObraWrite(data).overlay), unitId: u.id } });
  }

  // Colaboradores → funcionários do RH (casa por nome único; senão cria no RH com o salário do backup).
  const rh = (await getDocs(query(collection(db, 'rh_employees'), where('orgId', '==', orgId)))).docs
    .map((d) => ({ ...(d.data() as RhEmployee), id: d.id }));
  const salById = new Map((b.colecoes.salarios || []).map((s) => [s.id, s as Record<string, unknown>]));
  for (const row of b.colecoes.colaboradores || []) {
    const { id, ...data } = row;
    if (!id) continue;
    let emp = matchByName(String(data.nome || ''), rh);
    if (emp) stat.pessoasCasadas++;
    else {
      emp = rhEmployeeFromInox(orgId, id, data, salById.get(id) || null);
      const { id: eid, ...empData } = emp;
      writes.push({ path: `rh_employees/${eid}`, data: empData });
      rh.push(emp);
      stat.pessoasCriadas++;
    }
    const overlay = rewriteUrls(stripUndefined(splitColabWrite(data).overlay), urlMap);
    writes.push({ path: `ops_orgs/${orgId}/colaboradores/${id}`, data: { ...overlay, rhId: emp.id } });
    const u = data.obraAtual ? unitOfObra.get(String(data.obraAtual)) : undefined;
    if (u) writes.push({ path: `rh_employees/${emp.id}`, data: { unitId: u.id, codigoObra: u.code }, merge: true });
  }

  for (const [col, rows] of Object.entries(b.colecoes)) {
    if (UNIFIED.includes(col)) continue;
    if (!(INOX_COLLECTIONS as readonly string[]).includes(col) || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const { id, ...data } = row;
      if (!id) continue;
      writes.push({ path: `ops_orgs/${orgId}/${col}/${id}`, data: rewriteUrls(stripUndefined(data), urlMap) });
    }
  }
  for (const [p, data] of Object.entries(b.docs || {})) {
    if (data && /^config\/[\w-]+$/.test(p)) writes.push({ path: `ops_orgs/${orgId}/${p}`, data: stripUndefined(data) });
  }

  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + 400)) batch.set(doc(db, w.path), w.data, w.merge ? { merge: true } : {});
    await batch.commit();
    onProgress(`Registros: ${Math.min(i + 400, writes.length)} de ${writes.length}`);
  }
  onProgress('Atualizando equipes de campo…');
  await syncAllRhEmployeesToFieldWorkers(orgId);
  return { registros: writes.length, anexos: urlMap.size, ...stat };
}
