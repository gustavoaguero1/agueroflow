import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Nenhum número de WhatsApp pode ficar fixo no código: cada usuário conecta o próprio.
const FORBIDDEN = [/917897747/, /91789-7747/];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx|js|html)$/.test(e.name) ? [p] : [];
  });
}

test('nenhum número de telefone fixo em src/, server/ e server.ts', () => {
  const hits = [...files('src'), ...files('server'), 'server.ts'].filter((f) => {
    const t = fs.readFileSync(f, 'utf8');
    return FORBIDDEN.some((re) => re.test(t));
  });
  assert.deepEqual(hits, []);
});
