import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkOrderAndCreationEvent,
  validateWorkOrderCreateInput,
} from '../src/services/workOrderCreateRules.ts';

test('validateWorkOrderCreateInput rejeita default_unit e campos obrigatórios ausentes', () => {
  const res = validateWorkOrderCreateInput({
    orgId: 'org_a',
    unitId: 'default_unit',
    title: 'OS',
    orderType: 'corretiva',
    priority: 'alta',
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('default_unit')));
  assert.ok(res.errors.some((e) => e.includes('título')));
});

test('validateWorkOrderCreateInput valida e normaliza vínculos opcionais e SMS', () => {
  const res = validateWorkOrderCreateInput({
    orgId: 'org_a',
    unitId: 'unit_a',
    projectId: 'proj_1',
    contractId: 'ct_1',
    costCenterId: 'cc_1',
    assetId: 'asset_1',
    title: 'Soldagem de tubulação sanitária linha 02',
    description: 'Montagem em aço inox 316L',
    orderType: 'instalacao',
    priority: 'alta',
    requiresSafetyPermit: true,
    safetyPermitType: 'trabalho_a_quente',
    safetyPermitId: 'pt_001',
    assignedEmployeeIds: ['emp_1', 'emp_1', 'emp_2'],
    estimatedHours: 24,
    estimatedCost: 4800,
  });

  assert.equal(res.valid, true);
  assert.equal(res.normalized?.projectId, 'proj_1');
  assert.equal(res.normalized?.requiresSafetyPermit, true);
  assert.equal(res.normalized?.safetyPermitType, 'trabalho_a_quente');
  assert.deepEqual(res.normalized?.assignedEmployeeIds, ['emp_1', 'emp_2']);
});

test('validateWorkOrderCreateInput rejeita IDs malformados (path traversal)', () => {
  const res = validateWorkOrderCreateInput({
    orgId: 'org_a',
    unitId: 'unit_a',
    projectId: '../other_org',
    title: 'Inspeção de tanque',
    orderType: 'inspecao',
    priority: 'media',
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Projeto/Obra')));
});

test('buildWorkOrderAndCreationEvent monta OS e evento inicial consistentes e zera custo quando sem permissão financeira', () => {
  const validation = validateWorkOrderCreateInput({
    orgId: 'org_a',
    unitId: 'unit_a',
    title: 'Manutenção bomba centrífuga',
    orderType: 'preventiva',
    priority: 'media',
    estimatedHours: 8,
    estimatedCost: 1500,
  });
  assert.equal(validation.valid, true);
  const { order, creationEvent } = buildWorkOrderAndCreationEvent({
    orderId: 'os_123',
    orgId: 'org_a',
    orderNumber: 'OS-2026-0001',
    statusId: 'aberto',
    statusName: 'Aberto',
    normalized: validation.normalized!,
    actor: { uid: 'uid_1', name: 'Carlos' },
    nowIso: '2026-11-25T12:00:00.000Z',
    canViewFinancials: false,
  });

  assert.equal(order.id, 'os_123');
  assert.equal(order.estimatedCost, 0);
  assert.equal(creationEvent.id, 'os_123_created');
  assert.equal(creationEvent.orderId, 'os_123');
  assert.equal(creationEvent.eventType, 'criacao');
  assert.equal(creationEvent.newStatus, 'aberto');
});
