import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');

test('toda área que rola para o lado mostra uma barra fina (claro e escuro)', () => {
  assert.match(css, /\.overflow-x-auto\s*\{[^}]*scrollbar-width:\s*thin/);
  assert.match(css, /\.overflow-x-auto::-webkit-scrollbar\s*\{[^}]*height:\s*6px/);
  assert.match(css, /html\.dark \.overflow-x-auto::-webkit-scrollbar-thumb/);
  assert.match(css, /html\.light \.overflow-x-auto::-webkit-scrollbar-thumb/);
});

test('barras de abas dos módulos não escondem a rolagem', () => {
  for (const f of ['src/modules/TravelModule.tsx', 'src/modules/PurchasingModule.tsx', 'src/components/travel/ReceiptReimbursementsView.tsx']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /scrollbar-none|no-scrollbar/, f);
  }
});
