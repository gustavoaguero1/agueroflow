import fs from 'node:fs';
import path from 'node:path';
export const seen = fs.readFileSync(path.join(process.env.TLA_DIR!, 'data_x.json'), 'utf8');
