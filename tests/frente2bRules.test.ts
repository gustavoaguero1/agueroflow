import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQrDeepLinkUrl,
  parseQrDeepLinkSearch,
  sectionForQrEntity,
} from '../src/services/qrDeepLinkRules.ts';
import {
  enqueueOfflineMutation,
  reconcileServerSyncResult,
} from '../src/services/offlineSyncQueue.ts';

test('qrDeepLinkRules gera e interpreta deep-links seguros para ativo, item e OS', () => {
  const url = buildQrDeepLinkUrl({
    origin: 'https://agueroflow.app/',
    entityType: 'asset',
    entityId: 'asset_tig_01',
    orgId: 'org_aguero',
  });
  assert.equal(url, 'https://agueroflow.app/?qrType=asset&qrId=asset_tig_01&qrOrg=org_aguero');

  const parsed = parseQrDeepLinkSearch('?qrType=asset&qrId=asset_tig_01&qrOrg=org_aguero');
  assert.deepEqual(parsed, {
    entityType: 'asset',
    entityId: 'asset_tig_01',
    orgId: 'org_aguero',
    section: 'bens-lista',
  });

  assert.equal(sectionForQrEntity('item'), 'estoque');
  assert.equal(sectionForQrEntity('order'), 'ordens');

  // Rejeita path traversal / IDs malformados
  assert.throws(() =>
    buildQrDeepLinkUrl({ origin: 'https://agueroflow.app', entityType: 'item', entityId: '../secret' }),
  );
  assert.equal(parseQrDeepLinkSearch('?qrType=item&qrId=../secret'), null);
  assert.equal(parseQrDeepLinkSearch('?qrType=unknown&qrId=abc'), null);
});

test('offlineSyncQueue garante enfileiramento idempotente e preserva conflito HTTP 409 sem sobrescrita silenciosa', () => {
  const nowIso = '2026-11-26T12:00:00.000Z';
  const q1 = enqueueOfflineMutation([], {
    id: 'mut_1',
    idempotencyKey: 'idem_rdo_1',
    orgId: 'org_1',
    entityType: 'rdo_entry',
    entityId: 'rdo_99',
    payload: { progress: 45 },
    createdAt: nowIso,
  });
  const q2 = enqueueOfflineMutation(q1, {
    id: 'mut_2',
    idempotencyKey: 'idem_rdo_1',
    orgId: 'org_1',
    entityType: 'rdo_entry',
    entityId: 'rdo_99',
    payload: { progress: 45 },
    createdAt: nowIso,
  });
  assert.equal(q2.length, 1);

  const conflicted = reconcileServerSyncResult({
    item: q2[0],
    serverStatus: 409,
    serverVersion: 'v7',
    nowIso,
  });
  assert.equal(conflicted.status, 'conflito');
  assert.match(conflicted.errorReason || '', /v7/);

  const synced = reconcileServerSyncResult({
    item: q2[0],
    serverStatus: 200,
    nowIso,
  });
  assert.equal(synced.status, 'sincronizado');
});
