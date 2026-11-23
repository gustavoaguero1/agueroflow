import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, cert, applicationDefault, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
export type AdminHandles = { auth: Auth; db: Firestore; bucket: Bucket };

const cfg = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));

type State = { handles: AdminHandles | null; reason?: string; warning?: string; credential?: 'service-account' | 'adc' | 'emulator' };
let memo: State | undefined;

function gcloudAdcFile(): string {
  const base = process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'gcloud') : join(homedir(), '.config', 'gcloud');
  return join(base, 'application_default_credentials.json');
}

/** Parses the service-account JSON as pasted into a secrets UI: plain, base64, wrapped in quotes,
 * or with the private key's \n escapes turned into real line breaks. Throws when none of them is JSON. */
export function parseServiceAccount(raw: string): { project_id?: string; client_email?: string; private_key?: string } {
  const candidates: string[] = [];
  let v = raw.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    try { const u = JSON.parse(v.startsWith("'") ? `"${v.slice(1, -1).replace(/"/g, '\\"')}"` : v); if (typeof u === 'string') v = u.trim(); }
    catch { v = v.slice(1, -1).trim(); }
  }
  candidates.push(v);
  if (!v.startsWith('{')) { try { candidates.push(Buffer.from(v, 'base64').toString('utf8').trim()); } catch { /* not base64 */ } }
  for (const c of candidates) {
    for (const text of [c, c.replace(/("private_key"\s*:\s*")([^"]*)(")/, (_m, a, b, z) => a + b.replace(/\r?\n/g, '\\n') + z)]) {
      try {
        const o = JSON.parse(text);
        if (!o || typeof o !== 'object') continue;
        // Secrets UIs sometimes escape the key's \n twice: a PEM never contains a literal backslash, so restore line breaks.
        if (typeof o.private_key === 'string') o.private_key = o.private_key.replace(/(?:\\r)?\\n/g, "\n").replace(/\\(?=\n|$)/g, '');
        return o;
      } catch { /* try next form */ }
    }
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT não é um JSON de conta de serviço');
}

/** Describes a secret's form (never its content) so a mis-pasted value can be diagnosed from /api/health. */
export function secretShape(raw: string): string {
  const first = raw.trimStart()[0] ?? '', last = raw.trimEnd().slice(-1);
  const safe = (c: string) => (/[{}"'\[\]]/.test(c) ? c : c ? 'outro' : 'vazio');
  return `tamanho ${raw.length}, linhas ${raw.split(/\r?\n/).length}, começa com '${safe(first)}', termina com '${safe(last)}', private_key: ${raw.includes('private_key') ? 'sim' : 'não'}`;
}

function init(): State {
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  let credential;
  let kind: State['credential'] = 'emulator';
  let saError: string | undefined;
  if (!emulator) {
    // Explicit FIREBASE_SERVICE_ACCOUNT wins: on Cloud Run K_SERVICE is always set, so ADC would otherwise shadow it.
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try { credential = cert(parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT) as Parameters<typeof cert>[0]); kind = 'service-account'; }
      catch { saError = `FIREBASE_SERVICE_ACCOUNT inválido (JSON malformado; ${secretShape(process.env.FIREBASE_SERVICE_ACCOUNT)})`; }
    }
    // Shorter alternative for secrets UIs that mangle long JSON: two separate values.
    if (!credential && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      try {
        credential = cert({ projectId: cfg.projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
          privateKey: process.env.FIREBASE_PRIVATE_KEY.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n') });
        kind = 'service-account'; saError = undefined;
      } catch (e) { saError = `FIREBASE_PRIVATE_KEY inválido (${e instanceof Error ? e.message : String(e)}; ${secretShape(process.env.FIREBASE_PRIVATE_KEY)})`; }
    }
    const adcOn = process.env.FIREBASE_ADMIN_DISABLE_ADC !== '1' &&
      !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || existsSync(gcloudAdcFile()));
    if (!credential && adcOn) {
      if (saError) warn(`${saError}; usando ADC`);
      credential = applicationDefault(); kind = 'adc';
    }
    if (!credential) return disabled(saError ?? 'nenhuma credencial encontrada (ADC ou FIREBASE_SERVICE_ACCOUNT)');
  }
  try {
    const projectId = emulator ? process.env.GCLOUD_PROJECT : cfg.projectId;
    const opts = { ...(credential && { credential }), projectId, storageBucket: cfg.storageBucket };
    const app: App = getApps()[0] ?? initializeApp(opts);
    const db = emulator ? getFirestore(app) : getFirestore(app, cfg.firestoreDatabaseId);
    return { handles: { auth: getAuth(app), db, bucket: getStorage(app).bucket() }, credential: kind, ...(saError && { warning: saError }) };
  } catch (e) {
    return disabled(`falha ao inicializar (${e instanceof Error ? e.message : String(e)})`);
  }
}

// node --test sets NODE_TEST_CONTEXT in test processes: keep test output quiet, never hide it in prod.
const warn = (msg: string) => { if (!process.env.NODE_TEST_CONTEXT) console.warn(msg); };

function disabled(reason: string): State {
  warn(`Firebase Admin desativado: ${reason}`);
  return { handles: null, reason };
}

export function getAdmin(): AdminHandles | null {
  return (memo ??= init()).handles;
}

export function adminStatus(): { enabled: boolean; reason?: string; warning?: string; credential?: State['credential'] } {
  getAdmin();
  return { enabled: !!memo!.handles, reason: memo!.reason, credential: memo!.credential, ...(memo!.warning && { warning: memo!.warning }) };
}

export function resetAdminForTests(): void { memo = undefined; }

let runtimeSa: Promise<string | undefined> | undefined;
/** Email of the host's default service account (Cloud Run metadata server); granting it roles is an alternative to a key. */
export function runtimeServiceAccount(): Promise<string | undefined> {
  if (!process.env.K_SERVICE) return Promise.resolve(undefined);
  return (runtimeSa ??= fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
    headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(1500),
  }).then((r) => (r.ok ? r.text() : undefined)).catch(() => undefined));
}
