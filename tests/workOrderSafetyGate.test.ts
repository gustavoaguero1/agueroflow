import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWorkOrderSafetyGate,
  isExecutionTransitionStatus,
  isRiskWorkOrder,
} from '../src/services/workOrderSafetyGate';
import type { SafetyPermitRecord, SafetyPermitState } from '../src/types/safety';
import type { SafetyComplianceSnapshot } from '../src/services/safetyCompliance';

const basePermit: SafetyPermitRecord = {
  id: 'pt_1',
  orgId: 'org_a',
  unitId: 'unit_a',
  contractId: 'ct_a',
  documentType: 'pt',
  relatedAprId: 'apr_1',
  permitCode: 'PT-2026-001',
  permitDate: '2026-11-25',
  permitType: 'trabalho_em_altura',
  activityTitle: 'Montagem em altura',
  description: 'Solda em pipe rack',
  location: 'Área 2',
  validFrom: '2026-11-25T07:00:00.000Z',
  validUntil: '2026-11-25T19:00:00.000Z',
  supervisorName: 'Supervisor A',
  teamMembers: ['João'],
  teamMemberIds: ['emp_1'],
  risks: [],
  controls: { teamBriefed: true, ppeInspected: true, areaIsolated: true },
  emergencyPlan: 'Acionar brigada',
  createdByUid: 'u_1',
  createdByName: 'Resp',
  createdAt: '2026-11-25T06:00:00.000Z',
};

const approvedState: SafetyPermitState = {
  id: 'pt_1',
  orgId: 'org_a',
  unitId: 'unit_a',
  contractId: 'ct_a',
  permitId: 'pt_1',
  status: 'approved',
  latestEventId: 'evt_2',
  updatedByUid: 'sup_1',
  updatedByName: 'Sup',
  updatedAt: '2026-11-25T06:30:00.000Z',
};

const compliantSnapshot: SafetyComplianceSnapshot = {
  loading: false,
  employees: [{ id: 'emp_1', orgId: 'org_a', name: 'João Silva', active: true }],
  ppeCatalog: [
    {
      id: 'ppe_cinto',
      orgId: 'org_a',
      name: 'Cinto Paraquedista',
      category: 'Cinto paraquedista',
      caNumber: 'CA-12345',
      caExpiresAt: '2027-12-31',
      requiredForPermitTypes: ['trabalho_em_altura'],
      active: true,
      createdByUid: 'u_1',
    },
  ],
  ppeMovements: [
    {
      id: 'mov_1',
      orgId: 'org_a',
      employeeId: 'emp_1',
      employeeName: 'João Silva',
      ppeId: 'ppe_cinto',
      ppeName: 'Cinto Paraquedista',
      eventType: 'entregue',
      movementDate: '2026-10-01',
      createdByUid: 'u_1',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
  ],
  trainingCatalog: [],
  trainingRecords: [
    {
      id: 'tr_1',
      orgId: 'org_a',
      employeeId: 'emp_1',
      employeeName: 'João Silva',
      trainingCode: 'NR-35',
      title: 'Trabalho em Altura',
      issueDate: '2026-01-01',
      expirationDate: '2027-01-01',
      createdByUid: 'u_1',
    },
  ],
  legacyTrainingRecords: [],
};

test('non-risk work order bypasses SMS gate', () => {
  assert.equal(isRiskWorkOrder({}), false);
  assert.equal(isExecutionTransitionStatus('em_execucao'), true);
  assert.equal(isExecutionTransitionStatus('aberto'), false);
  const res = evaluateWorkOrderSafetyGate({
    order: { id: 'os_1', orgId: 'org_a', unitId: 'unit_a' },
    permit: null,
    permitState: null,
    compliance: compliantSnapshot,
    nowIso: '2026-11-25T10:00:00.000Z',
  });
  assert.equal(res.requiresGate, false);
  assert.equal(res.allowed, true);
});

test('risk work order passes when PT is approved, in validity window, and crew has valid NR-35 and EPI', () => {
  const res = evaluateWorkOrderSafetyGate({
    order: {
      id: 'os_risk',
      orgId: 'org_a',
      unitId: 'unit_a',
      contractId: 'ct_a',
      requiresSafetyPermit: true,
      safetyPermitType: 'trabalho_em_altura',
      safetyPermitId: 'pt_1',
      assignedEmployeeIds: ['emp_1'],
    },
    permit: basePermit,
    permitState: approvedState,
    compliance: compliantSnapshot,
    nowIso: '2026-11-25T10:00:00.000Z',
  });
  assert.equal(res.requiresGate, true);
  assert.equal(res.allowed, true);
  assert.equal(res.permitCode, 'PT-2026-001');
  assert.equal(res.checkedEmployeeCount, 1);
});

test('risk work order blocks expired PT, unapproved PT, expired NR-35, and missing EPI', () => {
  const expired = evaluateWorkOrderSafetyGate({
    order: {
      id: 'os_risk',
      orgId: 'org_a',
      unitId: 'unit_a',
      requiresSafetyPermit: true,
      safetyPermitType: 'trabalho_em_altura',
      safetyPermitId: 'pt_1',
      assignedEmployeeIds: ['emp_1'],
    },
    permit: basePermit,
    permitState: { ...approvedState, status: 'awaiting_approval' },
    compliance: {
      ...compliantSnapshot,
      trainingRecords: [
        { ...compliantSnapshot.trainingRecords[0], expirationDate: '2026-11-01' },
      ],
    },
    nowIso: '2026-11-26T10:00:00.000Z',
  });
  assert.equal(expired.allowed, false);
  const codes = expired.blockers.map((b) => b.code);
  assert.ok(codes.includes('permit_not_approved'));
  assert.ok(codes.includes('permit_expired_or_not_yet_valid'));
  assert.ok(codes.includes('crew_compliance_blocker'));
});
