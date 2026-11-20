import { getAdmin } from './firebaseAdmin';
import { bucketStore, restoreState, STATE_PATHS } from './stateSync';

const admin = getAdmin();
if (admin) await restoreState(bucketStore(admin.bucket), process.cwd(), STATE_PATHS);
process.exit(0);
