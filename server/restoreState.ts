import { getAdmin } from './firebaseAdmin';
import { bucketStore, runRestoreWorker, watchState, STATE_PATHS } from './stateSync';

// Blocking (not top-level await): siblings like whatsappWebBridgeServer read state at import time.
const admin = getAdmin();
if (admin) runRestoreWorker(new URL('./restoreStateWorker.ts', import.meta.url));

const watcher = watchState(admin ? bucketStore(admin.bucket) : null, process.cwd(), STATE_PATHS);
// Deferred so server.ts's own SIGTERM/SIGINT handlers (which write state) run first; the delay lets their
// fs events reach the watcher before flushing.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => setImmediate(() => setTimeout(() => watcher.flush().finally(() => process.exit(0)), 300)));
}
