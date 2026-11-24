import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('logo do Grupo Aguero: arquivos existem nas versões escura e clara', () => {
  for (const n of ['grupo-aguero', 'grupo-aguero-simbolo', 'grupo-aguero-nome']) {
    assert.ok(fs.existsSync(`public/brand/${n}.png`), n);
    assert.ok(fs.existsSync(`public/brand/${n}-claro.png`), `${n}-claro`);
  }
  assert.ok(fs.existsSync('public/favicon.png'));
});

test('nada mais usa o logo GAT', () => {
  const tracked = execFileSync('git', ['ls-files', 'src', 'index.html', 'public'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = tracked.filter((f) => /\.(tsx?|html)$/.test(f) && fs.existsSync(f)
    && /GatLogo|gat-logo|favicon\.svg/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
