import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Os dados do WhatsApp são por empresa (server/orgScopedStore.ts). Reatribuir o nome direto
// (`x = [...]`) trocaria a visão por uma lista solta e misturaria empresas.
const src = fs.readFileSync('server.ts', 'utf8');
const STORES = [
  'whatsAppContacts', 'whatsAppMessages', 'whatsAppNdRules', 'whatsAppNdRecords', 'whatsAppScheduledJobs',
  'whatsAppAiRules', 'whatsAppQuickReplies', 'whatsAppAiChat', 'whatsAppReceiptsConfig', 'ocrEnabledLockMap',
];

test('nenhum depósito do WhatsApp é reatribuído direto (usa x$.set)', () => {
  // A única atribuição permitida é a declaração da visão: `const x = x$.view`.
  const bad = STORES.filter((s) =>
    src.split('\n').some((l) => new RegExp(`(^|[^.\\w$])${s} = (?!=)`).test(l) && !new RegExp(`const ${s}(: any)? = ${s}\\$\\.view`).test(l)),
  );
  assert.deepEqual(bad, []);
});

test('cada depósito é criado por empresa (createOrgScoped*)', () => {
  const missing = STORES.filter((s) => !new RegExp(`const ${s}\\$ = createOrgScoped`).test(src));
  assert.deepEqual(missing, []);
});

test('gravação em disco usa os dados de todas as empresas (x$.all())', () => {
  const missing = STORES.filter((s) => !src.includes(`${s}$.all()`));
  assert.deepEqual(missing, []);
});
