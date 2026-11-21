import fs from 'node:fs';
import path from 'node:path';
await new Promise((r) => setTimeout(r, 100));
fs.writeFileSync(path.join(process.env.TLA_DIR!, 'data_x.json'), 'REMOTE');
