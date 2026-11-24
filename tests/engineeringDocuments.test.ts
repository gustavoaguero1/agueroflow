import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEngineeringDocumentGroupId,
  compareEngineeringRevisions,
  buildEngineeringDocumentId,
  engineeringDocumentDateMillis,
  getEngineeringDocumentStatus,
  isEngineeringDocumentFileAllowed,
  normalizeEngineeringDocumentCode,
  normalizeEngineeringRevision,
  ENGINEERING_DOCUMENT_MAX_BYTES,
} from '../src/services/engineeringDocuments';

test('normalizes engineering document codes and revisions consistently', () => {
  assert.equal(normalizeEngineeringDocumentCode(' pid 101 / linha A '), 'PID-101-LINHA-A');
  assert.equal(normalizeEngineeringRevision(' rev a '), 'REV-A');
  assert.equal(buildEngineeringDocumentGroupId('org_aguero', 'P&ID 101'), 'eng_org_aguero_P-ID-101');
  assert.equal(buildEngineeringDocumentId('org_aguero', 'P&ID 101', 'A'), 'eng_org_aguero_P-ID-101_A');
});

test('rejects empty or invalid identifiers and unsafe organization ids', () => {
  assert.throws(() => normalizeEngineeringDocumentCode(' / '));
  assert.throws(() => normalizeEngineeringRevision(''));
  assert.throws(() => buildEngineeringDocumentId('org/a', 'P-101', 'A'));
});

test('compares engineering revisions in natural order', () => {
  assert.equal(compareEngineeringRevisions('A', 'B') < 0, true);
  assert.equal(compareEngineeringRevisions('00', '01') < 0, true);
  assert.equal(compareEngineeringRevisions('REV-2', 'REV-10') < 0, true);
  assert.equal(compareEngineeringRevisions('REV-B', 'REV-A') > 0, true);
});

test('accepts only supported private-document formats within the size limit', () => {
  assert.equal(isEngineeringDocumentFileAllowed({ name: 'isometrico.pdf', type: 'application/pdf', size: 100 }), true);
  assert.equal(isEngineeringDocumentFileAllowed({ name: 'foto.webp', type: 'image/webp', size: 100 }), true);
  assert.equal(isEngineeringDocumentFileAllowed({ name: 'modelo.dwg', type: 'application/acad', size: 100 }), false);
  assert.equal(isEngineeringDocumentFileAllowed({ name: 'arquivo.pdf', type: 'application/pdf', size: ENGINEERING_DOCUMENT_MAX_BYTES + 1 }), false);
  assert.equal(isEngineeringDocumentFileAllowed({ name: 'vazio.pdf', type: 'application/pdf', size: 0 }), false);
});

test('maps workflow events to explicit engineering statuses', () => {
  assert.equal(getEngineeringDocumentStatus('submitted_internal'), 'internal_review');
  assert.equal(getEngineeringDocumentStatus('approved_internal'), 'internal_approved');
  assert.equal(getEngineeringDocumentStatus('submitted_client'), 'client_review');
  assert.equal(getEngineeringDocumentStatus('approved_client'), 'client_approved');
  assert.equal(getEngineeringDocumentStatus('marked_as_built'), 'as_built');
  assert.equal(getEngineeringDocumentStatus(undefined), 'unknown');
});

test('orders Firestore timestamps, Date objects and ISO strings consistently', () => {
  assert.equal(engineeringDocumentDateMillis(new Date('2026-11-24T12:00:00.000Z')), Date.parse('2026-11-24T12:00:00.000Z'));
  assert.equal(engineeringDocumentDateMillis('2026-11-24T12:00:00.000Z'), Date.parse('2026-11-24T12:00:00.000Z'));
  assert.equal(engineeringDocumentDateMillis({ toMillis: () => 1234 }), 1234);
  assert.equal(engineeringDocumentDateMillis(undefined), 0);
});
