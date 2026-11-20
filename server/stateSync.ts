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

const localFiles = (root: string, paths: string[]) => walk(root).filter((r) => matches(r, paths));

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
  const watchers: fs.FSWatcher[] = [];

  const push = async (rel: string) => {
    pending.delete(rel);
    try {
      let data: Buffer;
      try { data = fs.readFileSync(path.join(root, rel)); } // re-read at upload time
      catch (e: any) {
        if (e?.code !== 'ENOENT' && e?.code !== 'EISDIR') throw e;
        if (e.code === 'ENOENT') await store!.delete(PREFIX + rel); // file gone: propagate deletion
        return;
      }
      await store!.upload(PREFIX + rel, data);
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

  const watched = new Set<string>();
  const watchDir = (d: string) => {
    const abs = path.join(root, d);
    if (watched.has(d) || !fs.existsSync(abs)) return;
    try {
      watchers.push(fs.watch(abs, (_ev, f) => {
        if (!f) return;
        const rel = d ? `${d}/${f}` : String(f);
        if (!d && dirNames.includes(rel)) { // dir spec appeared after boot: watch it and upload what is already inside
          watchDir(rel);
          if (watched.has(rel)) for (const r of walk(root, rel)) schedule(`${rel}/${r}`);
        }
        schedule(rel);
      }));
      watched.add(d);
    } catch { console.warn(`☁️ Não foi possível observar ${d || '.'}`); }
  };
  const dirNames = paths.filter((p) => p.endsWith('/')).map((p) => p.slice(0, -1));
  if (store) ['', ...dirNames].forEach(watchDir);

  return {
    async flush() {
      for (const [rel, t] of timers) { clearTimeout(t); timers.delete(rel); }
      await Promise.all([...inflight, ...[...pending].map(push)]);
    },
    close() { watchers.forEach((w) => w.close()); timers.forEach(clearTimeout); },
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
