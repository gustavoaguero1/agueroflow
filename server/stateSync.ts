import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import type { AdminHandles } from './firebaseAdmin';

export interface StateStore {
  list(prefix: string): Promise<string[]>;
  download(name: string): Promise<Buffer>;
  upload(name: string, data: Buffer): Promise<void>;
}

export const STATE_PATHS = ['data_whatsapp_auth/', 'data_nd_pdfs/', 'data_*.json'];
const PREFIX = 'server-state/';

export function bucketStore(bucket: AdminHandles['bucket']): StateStore {
  return {
    list: async (prefix) => (await bucket.getFiles({ prefix }))[0].map((f) => f.name),
    download: async (name) => (await bucket.file(name).download())[0],
    upload: async (name, data) => { await bucket.file(name).save(data); },
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
      const data = fs.readFileSync(path.join(root, rel)); // re-read at upload time
      await store!.upload(PREFIX + rel, data);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') console.warn(`☁️ Falha ao enviar ${rel}: ${e?.message ?? e}`);
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

  if (store) {
    const dirs = ['', ...paths.filter((p) => p.endsWith('/')).map((p) => p.slice(0, -1))];
    for (const d of dirs) {
      const abs = path.join(root, d);
      if (!fs.existsSync(abs)) continue;
      try {
        watchers.push(fs.watch(abs, (_ev, f) => { if (f) schedule(d ? `${d}/${f}` : String(f)); }));
      } catch (e) { console.warn(`☁️ Não foi possível observar ${d || '.'}`); }
    }
  }

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
  const r = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(script)], { cwd, stdio: 'inherit', env: process.env });
  if (r.status !== 0) console.warn('☁️ Falha ao restaurar estado (worker encerrou com erro)');
}
