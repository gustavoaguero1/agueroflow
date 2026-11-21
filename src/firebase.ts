import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator, initializeAuth, inMemoryPersistence, type Auth } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFirestore, doc, getDocFromServer, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
// Local dev/E2E only: same project id and (default) database as the server's emulator setup.
const useEmulators = import.meta.env.VITE_USE_EMULATORS === '1';
export const app = getApps().length === 0 ? initializeApp(useEmulators ? { ...firebaseConfig, projectId: 'demo-agueroflow' } : firebaseConfig) : getApp();

// CRITICAL: Initialize Firestore with the exact database ID from config
export const db = useEmulators ? getFirestore(app) : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const storage = getStorage(app);

// Initialize Firebase Auth & Providers
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8085);
  connectStorageEmulator(storage, 'localhost', 9199);
}

let isolated: Auth | undefined;
/** In-memory Auth on a separate app: one-off sign-ins (e.g. password change on the login screen) that must not touch the main session. */
export function isolatedAuth(): Auth {
  if (!isolated) {
    isolated = initializeAuth(initializeApp(app.options, 'isolated'), { persistence: inMemoryPersistence });
    if (useEmulators) connectAuthEmulator(isolated, 'http://localhost:9099', { disableWarnings: true });
  }
  return isolated;
}

// Firestore Error Handler adhering strictly to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test helper
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client offline ou em configuração.');
    }
    return false;
  }
}
