import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveOrg } from '../server/orgDefaults.ts';

test('effectiveOrg maps missing/legacy ids to DEFAULT_ORG_ID and keeps real ids', () => {
  const prev = process.env.DEFAULT_ORG_ID;
  try {
    delete process.env.DEFAULT_ORG_ID;
    assert.equal(effectiveOrg(undefined), 'org_aguero_default');
    assert.equal(effectiveOrg('org_aguero_default'), 'org_aguero_default');
    process.env.DEFAULT_ORG_ID = 'org_x';
    assert.equal(effectiveOrg(undefined), 'org_x');
    assert.equal(effectiveOrg(''), 'org_x');
    assert.equal(effectiveOrg('org_aguero_default'), 'org_x');
    assert.equal(effectiveOrg('org_y'), 'org_y');
  } finally {
    if (prev === undefined) delete process.env.DEFAULT_ORG_ID; else process.env.DEFAULT_ORG_ID = prev;
  }
});
