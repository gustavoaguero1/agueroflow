import test from 'node:test';
import assert from 'node:assert/strict';
import { maxOrderSeq } from '../src/services/workOrderNumbering.ts';

test('maxOrderSeq parses OS-YYYY-NNN across years and ignores others', () => {
  assert.equal(maxOrderSeq([{ orderNumber: 'OS-2025-007' }, { orderNumber: 'OS-2026-012' }, { orderNumber: 'ORD-20260924-0002' }, {}]), 12);
  assert.equal(maxOrderSeq([]), 0);
});
