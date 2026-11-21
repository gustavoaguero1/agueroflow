import { runRestoreWorker } from '../../server/stateSync';
runRestoreWorker(new URL('./slowWorker.ts', import.meta.url));
