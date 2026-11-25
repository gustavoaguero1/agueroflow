import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShortageRequisition,
  computeStockReservationSplit,
  reservationDocId,
} from '../src/services/stockReservationRules.ts';

test('computeStockReservationSplit separa saldo físico, reservado, disponível e falta', () => {
  const split = computeStockReservationSplit({
    physicalBalance: 100,
    existingActiveReservations: [
      { reservedQty: 40, status: 'ativa' },
      { reservedQty: 25, status: 'liberada' },
    ],
    requestedQty: 80,
  });

  assert.equal(split.physicalBalance, 100);
  assert.equal(split.activeReservedQty, 40);
  assert.equal(split.availableBalance, 60);
  assert.equal(split.qtyToReserve, 60);
  assert.equal(split.shortageQty, 20);
});

test('buildShortageRequisition monta RC vinculada à OS e ao Projeto para a falta exata', () => {
  const rc = buildShortageRequisition({
    requisitionId: 'rc_1',
    requisitionCode: 'RC-OS-0001',
    orgId: 'org_a',
    projectId: 'proj_1',
    workOrderId: 'os_1',
    workOrderNumber: 'OS-2026-0001',
    workOrderTitle: 'Montagem Linha Inox',
    item: { id: 'it_1', sku: 'TB-316L-2', name: 'Tubo Inox 316L 2"', unitOfMeasure: 'M', unitCost: 120 },
    shortageQty: 20,
    currentStock: 60,
    neededByDate: '2026-12-05',
    actor: { uid: 'u1', name: 'João' },
    nowIso: '2026-11-25T14:00:00.000Z',
  });

  assert.equal(rc.organizationId, 'org_a');
  assert.equal(rc.projectId, 'proj_1');
  assert.equal(rc.linkedWorkOrderId, 'os_1');
  assert.equal(rc.items[0].quantity, 20);
  assert.equal(rc.status, 'pendente');
  assert.ok(reservationDocId('org_a', 'k1').startsWith('sres_org_a_'));
});
