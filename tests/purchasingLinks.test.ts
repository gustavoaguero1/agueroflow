import test from 'node:test';
import assert from 'node:assert/strict';
import { workOrderLinkFields } from '../src/services/purchasingLinks';

test('work order link copies id, number and title', () => {
  assert.deepEqual(workOrderLinkFields({
    id: 'wo_123',
    orderNumber: 'OS-2026-0042',
    title: 'Montagem de linha sanitária',
  }), {
    linkedWorkOrderId: 'wo_123',
    linkedWorkOrderNumber: 'OS-2026-0042',
    linkedWorkOrderTitle: 'Montagem de linha sanitária',
  });
});

test('missing work order produces no empty reference fields', () => {
  assert.deepEqual(workOrderLinkFields(undefined), {});
  assert.deepEqual(workOrderLinkFields({ title: 'Sem identificador' }), {});
});
