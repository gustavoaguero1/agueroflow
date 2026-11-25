import test from 'node:test';
import assert from 'node:assert/strict';
import type { CollectiveAssetWorker } from '../src/types/collectiveAssets.ts';
import type { DirectoryEntry } from '../src/services/rhDirectory.ts';
import {
  auditCollectiveWorkerLinks,
  buildCollectiveWorkerProjectionFromDirectory,
  canonicalCollectiveWorkerId,
  validateExplicitPersonLink,
} from '../src/services/masterIdentityRules.ts';

const dirEntry: DirectoryEntry = {
  id: 'emp_42',
  rhEmployeeId: 'emp_42',
  orgId: 'org_a',
  name: 'Roberto Mendes',
  role: 'Soldador TIG',
  active: true,
  admissionDate: '2025-01-10',
  department: 'Caldeiraria',
  registrationNumber: 'MAT-042',
  codigoObra: 'OBRA-09',
  unitId: 'unit_1',
  updatedAt: '2026-03-01T10:00:00.000Z',
};

test('buildCollectiveWorkerProjectionFromDirectory anchors collective_asset_workers by stable rhEmployeeId', () => {
  const projected = buildCollectiveWorkerProjectionFromDirectory(dirEntry, null, '2026-03-02T00:00:00.000Z');
  assert.equal(projected.id, canonicalCollectiveWorkerId('emp_42'));
  assert.equal(projected.rhEmployeeId, 'emp_42');
  assert.equal(projected.orgId, 'org_a');
  assert.equal(projected.registrationNumber, 'OBRA-09');
  assert.equal(projected.active, true);
});

test('buildCollectiveWorkerProjectionFromDirectory rejects cross-org or conflicting rhEmployeeId', () => {
  assert.throws(
    () => buildCollectiveWorkerProjectionFromDirectory(dirEntry, { orgId: 'org_b' }),
    /outra empresa/,
  );
  assert.throws(
    () => buildCollectiveWorkerProjectionFromDirectory(dirEntry, { orgId: 'org_a', rhEmployeeId: 'emp_other' }),
    /outro colaborador RH/,
  );
});

test('validateExplicitPersonLink enforces same-org active RH master identity', () => {
  assert.deepEqual(
    validateExplicitPersonLink({ targetOrgId: 'org_a', rhEntry: dirEntry, actorUid: 'u1' }),
    [],
  );
  assert.ok(
    validateExplicitPersonLink({ targetOrgId: 'org_b', rhEntry: dirEntry, actorUid: 'u1' }).some((e) =>
      e.includes('outra empresa'),
    ),
  );
  assert.ok(
    validateExplicitPersonLink({
      targetOrgId: 'org_a',
      rhEntry: { ...dirEntry, active: false },
      actorUid: 'u1',
    }).some((e) => e.includes('inativo')),
  );
});

test('auditCollectiveWorkerLinks flags unlinked, broken, and duplicate rhEmployeeId links without auto-linking', () => {
  const workers: CollectiveAssetWorker[] = [
    {
      id: 'caw_42',
      orgId: 'org_a',
      rhEmployeeId: 'emp_42',
      registrationNumber: 'OBRA-09',
      name: 'Roberto Mendes',
      department: 'Caldeiraria',
      role: 'Soldador TIG',
      active: true,
      createdAt: 'c',
      updatedAt: 'u',
    },
    {
      id: 'wrk_legacy',
      orgId: 'org_a',
      registrationNumber: '',
      name: 'Roberto Mendes',
      department: 'Caldeiraria',
      role: 'Soldador',
      active: true,
      createdAt: 'c',
      updatedAt: 'u',
    },
    {
      id: 'wrk_broken',
      orgId: 'org_a',
      rhEmployeeId: 'emp_missing',
      registrationNumber: 'X',
      name: 'Inexistente',
      department: 'Obras',
      role: 'Auxiliar',
      active: true,
      createdAt: 'c',
      updatedAt: 'u',
    },
  ];

  const report = auditCollectiveWorkerLinks({
    orgId: 'org_a',
    directory: [dirEntry],
    collectiveWorkers: workers,
  });

  assert.equal(report.linkedCount, 1);
  assert.equal(report.unlinkedCount, 1);
  assert.equal(report.brokenLinkCount, 1);
  const unlinked = report.issues.find((i) => i.collectiveWorkerId === 'wrk_legacy');
  assert.ok(unlinked);
  assert.equal(unlinked.suggestedCandidates.length, 1);
  assert.equal(unlinked.suggestedCandidates[0].rhEmployeeId, 'emp_42');
  assert.equal(unlinked.suggestedCandidates[0].requiresHumanReview, true);
  // Original worker must remain unmutated
  assert.equal(workers[1].rhEmployeeId, undefined);
});
