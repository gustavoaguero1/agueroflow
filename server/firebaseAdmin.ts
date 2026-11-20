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

type State = { handles: AdminHandles | null; reason?: string; credential?: 'service-account' | 'adc' | 'emulator' };
let memo: State | undefined;

function gcloudAdcFile(): string {
  const base = process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'gcloud') : join(homedir(), '.config', 'gcloud');
  return join(base, 'application_default_credentials.json');
}

function init(): State {
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  let credential;
  let kind: State['credential'] = 'emulator';
  if (!emulator) {
    // Explicit FIREBASE_SERVICE_ACCOUNT wins: on Cloud Run K_SERVICE is always set, so ADC would otherwise shadow it.
    let saError: string | undefined;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try { credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)); kind = 'service-account'; }
      catch { saError = 'FIREBASE_SERVICE_ACCOUNT inválido (JSON malformado)'; }
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
    return { handles: { auth: getAuth(app), db, bucket: getStorage(app).bucket() }, credential: kind };
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

export function adminStatus(): { enabled: boolean; reason?: string; credential?: State['credential'] } {
  getAdmin();
  return { enabled: !!memo!.handles, reason: memo!.reason, credential: memo!.credential };
}

export function resetAdminForTests(): void { memo = undefined; }
