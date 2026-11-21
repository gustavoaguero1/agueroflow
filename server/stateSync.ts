import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import type { AdminHandles } from './firebaseAdmin';

export interface StateStore {
  list(prefix: string): Promise<string[]>;
  download(name: string): Promise<Buffer>;
  upload(name: string, data: Buffer): Promise<void>;
  delete(name: string): Promise<void>;
}

export const STATE_PATHS = ['data_whatsapp_auth/', 'data_nd_pdfs/', 'data_*.json'];
const PREFIX = 'server-state/';

export function bucketStore(bucket: AdminHandles['bucket']): StateStore {
  return {
    list: async (prefix) => (await bucket.getFiles({ prefix }))[0].map((f) => f.name),
    download: async (name) => (await bucket.file(name).download())[0],
    upload: async (name, data) => { await bucket.file(name).save(data); },
    delete: async (name) => { await bucket.file(name).delete({ ignoreNotFound: true }); },
  };
}

// Matches a root-relative posix path against STATE_PATHS-style specs.
function matches(rel: string, paths: string[]): boolean {
  if (rel.endsWith('.tmp')) return false;
  return paths.some((p) => {
    if (p.endsWith('/')) return rel.startsWith(p);
    const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    return re.test(rel);
  });
}

function walk(dir: string, rel = ''): string[] {
  let out: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out = out.concat(walk(dir, r));
    else out.push(r);
  }
  return out;
}

// Root files + recursive dir specs only (never walks node_modules etc.); tolerant of dirs vanishing.
function localFiles(root: string, paths: string[]): string[] {
  const out: string[] = [];
  try { for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isFile()) out.push(e.name); } catch { /* ignore */ }
  for (const p of paths) if (p.endsWith('/')) {
    const d = p.slice(0, -1);
    try { out.push(...walk(root, d)); } catch { /* dir missing */ }
  }
  return out.filter((r) => matches(r, paths));
}

export async function restoreState(store: StateStore | null, root: string, paths: string[]) {
  const res = { restored: 0, seeded: 0 };
  if (!store) return res;
  const remote = (await store.list(PREFIX)).filter((n) => n.length > PREFIX.length);
  if (remote.length) {
    for (const name of remote) {
      const rel = name.slice(PREFIX.length);
      if (!matches(rel, paths) || path.isAbsolute(rel) || rel.split('/').includes('..')) continue;
      const dest = path.join(root, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await store.download(name));
      res.restored++;
    }
  } else {
    for (const rel of localFiles(root, paths)) {
      await store.upload(PREFIX + rel, fs.readFileSync(path.join(root, rel)));
      res.seeded++;
    }
  }
  console.log(`☁️ Estado restaurado: ${res.restored} arquivos, ${res.seeded} enviados`);
  return res;
}

export function watchState(store: StateStore | null, root: string, paths: string[], debounceMs = 1500) {
  const pending = new Set<string>();
  const timers = new Map<string, NodeJS.Timeout>();
  const inflight = new Set<Promise<void>>();
  const sig = (rel: string) => { try { const st = fs.statSync(path.join(root, rel)); return `${st.mtimeMs}:${st.size}`; } catch { return undefined; } };
  const uploaded = new Map<string, string>(); // last synced mtime:size per file
  if (store) for (const rel of localFiles(root, paths)) uploaded.set(rel, sig(rel)!); // baseline: restore/seed just synced these

  const push = async (rel: string) => {
    pending.delete(rel);
    try {
      let data: Buffer;
      try { data = fs.readFileSync(path.join(root, rel)); } // re-read at upload time
      catch (e: any) {
        if (e?.code !== 'ENOENT' && e?.code !== 'EISDIR') throw e;
        if (e.code === 'ENOENT') { await store!.delete(PREFIX + rel); uploaded.delete(rel); } // file gone: propagate deletion
        return;
      }
      const s0 = sig(rel);
      await store!.upload(PREFIX + rel, data);
      if (s0) uploaded.set(rel, s0);
    } catch (e: any) {
      console.warn(`☁️ Falha ao sincronizar ${rel}: ${e?.message ?? e}`);
    }
  };
  const schedule = (rel: string) => {
    if (!matches(rel, paths)) return;
    pending.add(rel);
    clearTimeout(timers.get(rel));
    timers.set(rel, setTimeout(() => {
      timers.delete(rel);
      const p = push(rel).finally(() => inflight.delete(p));
      inflight.add(p);
    }, debounceMs));
  };

  const watched = new Map<string, fs.FSWatcher>();
  const unwatch = (d: string) => { watched.get(d)?.close(); watched.delete(d); };
  const watchDir = (d: string) => {
    const abs = path.join(root, d);
    if (watched.has(d) || !fs.existsSync(abs)) return;
    try {
      const w = fs.watch(abs, (_ev, f) => {
        if (!f) return;
        const rel = d ? `${d}/${f}` : String(f);
        try {
          if (d && !fs.existsSync(abs)) unwatch(d); // dir deleted: allow re-watch when recreated
          if (!d && dirNames.includes(rel)) { // dir spec appeared after boot: watch it and upload what is already inside
            watchDir(rel);
            for (const r of walk(root, rel)) schedule(r);
          }
        } catch (e: any) {
          // ENOENT: dir vanished between the event and the watch; the next event re-watches it.
          if (e?.code !== 'ENOENT') console.warn(`☁️ Falha ao observar ${rel}: ${e?.message ?? e}`);
        }
        schedule(rel);
      });
      w.on('error', (e) => { console.warn(`☁️ Erro no watcher de ${d || '.'}: ${e.message}`); unwatch(d); });
      w.on('close', () => { if (watched.get(d) === w) watched.delete(d); });
      watched.set(d, w);
    } catch { console.warn(`☁️ Não foi possível observar ${d || '.'}`); }
  };
  const dirNames = paths.filter((p) => p.endsWith('/')).map((p) => p.slice(0, -1));
  if (store) ['', ...dirNames].forEach(watchDir);

  return {
    async flush() {
      for (const [rel, t] of timers) { clearTimeout(t); timers.delete(rel); }
      if (store) { // guarantee: catch changes/deletions the watcher has not reported yet
        const now = new Set(localFiles(root, paths));
        for (const rel of now) if (sig(rel) !== uploaded.get(rel)) pending.add(rel);
        for (const rel of uploaded.keys()) if (!now.has(rel)) pending.add(rel);
      }
      await Promise.all([...inflight, ...[...pending].map(push)]);
    },
    close() { [...watched.keys()].forEach(unwatch); timers.forEach(clearTimeout); },
  };
}

// ESM top-level await does NOT block later sibling imports, so the restore runs in a child
// process and the importer blocks synchronously until it exits.
export function runRestoreWorker(script: URL, cwd = process.cwd()) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(script)], {
    cwd, stdio: 'inherit', env: process.env, timeout: 60_000, killSignal: 'SIGKILL',
  });
  if (r.error || r.signal) console.warn(`☁️ Restauração de estado excedeu o tempo limite ou foi interrompida (${r.error?.message ?? r.signal}); iniciando sem ela`);
  else if (r.status !== 0) console.warn('☁️ Falha ao restaurar estado (worker encerrou com erro)');
}
