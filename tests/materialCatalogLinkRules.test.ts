import test from 'node:test';
import assert from 'node:assert/strict';
import type { Item } from '../src/types/index.ts';
import type { CommercialMaterial } from '../src/types/commercial.ts';
import {
  auditMaterialCatalogLinks,
  buildMaterialMasterLinkPatch,
  buildMaterialMasterUnlinkPatch,
  suggestMasterItemMatches,
} from '../src/services/materialCatalogLinkRules.ts';

function makeMasterItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item_tubo_304',
    orgId: 'org_a',
    sku: 'TUBO-304-2POL',
    name: 'Tubo Inox AISI 304 SCH 10 2"',
    type: 'peca',
    category: 'Tubulações',
    unitOfMeasure: 'm',
    referencePrice: 95,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCommercialMaterial(overrides: Partial<CommercialMaterial> = {}): CommercialMaterial {
  return {
    id: 'cmat_1',
    organizationId: 'org_a',
    internalCode: 'TUBO-304-2POL',
    originalDescription: 'Tubo Inox AISI 304 SCH 10 2"',
    normalizedDescription: 'Tubo Inox AISI 304 SCH 10 2"',
    technicalSpecs: { materialGrade: 'AISI 304', dimension: '2"' },
    unit: 'mt',
    baseCost: 92,
    currency: 'BRL',
    sourceType: 'cotacao_confirmada',
    quoteDate: '2026-03-01',
    validityDays: 30,
    category: 'Tubulações',
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

test('suggestMasterItemMatches ranks active same-org candidates and always requires human review', () => {
  const material = makeCommercialMaterial();
  const candidates = suggestMasterItemMatches(material, [
    makeMasterItem(),
    makeMasterItem({ id: 'item_other_org', orgId: 'org_b' }),
    makeMasterItem({ id: 'item_inactive', active: false }),
    makeMasterItem({ id: 'item_partial', sku: 'OUTRO-1', name: 'Tubo Inox AISI 304 4"' }),
  ]);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].itemId, 'item_tubo_304');
  assert.equal(candidates[0].score, 100);
  assert.ok(candidates.every((c) => c.requiresHumanReview === true));
  // Never mutates the commercial material automatically
  assert.equal(material.masterItemId, undefined);
});

test('buildMaterialMasterLinkPatch enforces same-org active master item and records reviewer audit metadata', () => {
  const mat = makeCommercialMaterial();
  const item = makeMasterItem();

  const patch = buildMaterialMasterLinkPatch({
    material: mat,
    masterItem: item,
    actorUid: 'u_com',
    actorName: 'Comprador Técnico',
    notes: 'Equivalência conferida na especificação ASTM A312',
    nowIso: '2026-03-10T14:00:00.000Z',
  });

  assert.equal(patch.masterItemId, 'item_tubo_304');
  assert.equal(patch.masterItemSku, 'TUBO-304-2POL');
  assert.equal(patch.masterLinkStatus, 'linked');
  assert.equal(patch.masterLinkConfirmedBy, 'Comprador Técnico (u_com)');

  assert.throws(
    () =>
      buildMaterialMasterLinkPatch({
        material: mat,
        masterItem: makeMasterItem({ orgId: 'org_b' }),
        actorUid: 'u_com',
        actorName: 'Comprador',
      }),
    /outra empresa/,
  );

  assert.throws(
    () =>
      buildMaterialMasterLinkPatch({
        material: mat,
        masterItem: makeMasterItem({ active: false }),
        actorUid: 'u_com',
        actorName: 'Comprador',
      }),
    /inativo/,
  );

  const unlink = buildMaterialMasterUnlinkPatch({
    actorUid: 'u_com',
    actorName: 'Comprador',
    reason: 'Divergência de schedule',
    nowIso: '2026-03-11T10:00:00.000Z',
  });
  assert.equal(unlink.masterItemId, null);
  assert.equal(unlink.masterLinkStatus, 'unlinked');
});

test('auditMaterialCatalogLinks counts linked, unlinked, and broken links separately', () => {
  const audit = auditMaterialCatalogLinks({
    orgId: 'org_a',
    masterItems: [makeMasterItem(), makeMasterItem({ id: 'item_inativo', active: false })],
    commercialMaterials: [
      makeCommercialMaterial({ id: 'm1', masterItemId: 'item_tubo_304' }),
      makeCommercialMaterial({ id: 'm2' }),
      makeCommercialMaterial({ id: 'm3', masterItemId: 'item_deleted' }),
      makeCommercialMaterial({ id: 'm4', masterItemId: 'item_inativo' }),
    ],
  });

  assert.equal(audit.totalCommercialMaterials, 4);
  assert.equal(audit.linkedCount, 1);
  assert.equal(audit.unlinkedCount, 1);
  assert.equal(audit.brokenLinkCount, 2);
});
