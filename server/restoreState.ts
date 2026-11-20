import { getAdmin } from './firebaseAdmin';
import { bucketStore, runRestoreWorker, watchState, STATE_PATHS } from './stateSync';

// Blocking (not top-level await): siblings like whatsappWebBridgeServer read state at import time.
const admin = getAdmin();
if (admin) runRestoreWorker(new URL('./restoreStateWorker.ts', import.meta.url));

const watcher = watchState(admin ? bucketStore(admin.bucket) : null, process.cwd(), STATE_PATHS);
process.once('SIGTERM', () => { watcher.flush().finally(() => process.exit(0)); });
