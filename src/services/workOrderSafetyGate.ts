import type { SafetyPermitRecord, SafetyPermitState, SafetyPermitType } from '../types/safety';
import {
  evaluateEmployeeSafetyCompliance,
  type SafetyComplianceSnapshot,
} from './safetyCompliance';

export interface WorkOrderSafetyTarget {
  id: string;
  orgId: string;
  unitId: string;
  contractId?: string;
  requiresSafetyPermit?: boolean;
  safetyPermitType?: SafetyPermitType;
  safetyPermitId?: string;
  assignedEmployeeIds?: string[];
}

export interface WorkOrderSafetyBlocker {
  code:
    | 'missing_permit'
    | 'permit_not_found'
    | 'permit_wrong_org'
    | 'permit_not_pt'
    | 'permit_scope_mismatch'
    | 'permit_type_mismatch'
    | 'permit_not_approved'
    | 'permit_expired_or_not_yet_valid'
    | 'missing_crew'
    | 'crew_compliance_blocker';
  message: string;
  employeeId?: string;
  employeeName?: string;
}

export interface WorkOrderSafetyGateResult {
  requiresGate: boolean;
  allowed: boolean;
  blockers: WorkOrderSafetyBlocker[];
  permitId?: string;
  permitCode?: string;
  permitType?: SafetyPermitType;
  checkedEmployeeCount: number;
}

const EXECUTION_STATUS_IDS = new Set([
  'em_execucao',
  'em_andamento',
  'executando',
  'em_campo',
]);

export function isExecutionTransitionStatus(statusId: string): boolean {
  return EXECUTION_STATUS_IDS.has(String(statusId || '').trim().toLowerCase());
}

export function isRiskWorkOrder(order: Pick<WorkOrderSafetyTarget, 'requiresSafetyPermit' | 'safetyPermitType'>): boolean {
  if (order.requiresSafetyPermit === true) return true;
  if (order.safetyPermitType && order.safetyPermitType !== 'geral') return true;
  return false;
}

function parseBoundaryMs(raw: string | undefined, endOfDayIfDateOnly: boolean): number {
  const s = String(raw || '').trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(endOfDayIfDateOnly ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`);
  }
  return Date.parse(s);
}

export function evaluateWorkOrderSafetyGate(params: {
  order: WorkOrderSafetyTarget;
  permit: SafetyPermitRecord | null;
  permitState: SafetyPermitState | null;
  compliance: SafetyComplianceSnapshot;
  nowIso?: string;
}): WorkOrderSafetyGateResult {
  const { order, permit, permitState, compliance } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const activityDate = nowIso.slice(0, 10);

  if (!isRiskWorkOrder(order)) {
    return { requiresGate: false, allowed: true, blockers: [], checkedEmployeeCount: 0 };
  }

  const blockers: WorkOrderSafetyBlocker[] = [];
  const permitId = (order.safetyPermitId || '').trim();

  if (!permitId) {
    blockers.push({
      code: 'missing_permit',
      message: 'OS classificada como atividade de risco exige Permissão de Trabalho (PT) vinculada e aprovada.',
    });
    return { requiresGate: true, allowed: false, blockers, checkedEmployeeCount: 0 };
  }

  if (!permit) {
    blockers.push({
      code: 'permit_not_found',
      message: `Permissão de Trabalho (${permitId}) não localizada.`,
    });
    return { requiresGate: true, allowed: false, blockers, permitId, checkedEmployeeCount: 0 };
  }

  if (permit.orgId !== order.orgId) {
    blockers.push({
      code: 'permit_wrong_org',
      message: 'A Permissão de Trabalho vinculada não pertence à empresa desta OS.',
    });
  }

  if (permit.documentType !== 'pt') {
    blockers.push({
      code: 'permit_not_pt',
      message: 'O documento vinculado à OS precisa ser uma PT (Permissão de Trabalho), e não apenas uma APR.',
    });
  }

  if (permit.unitId !== order.unitId) {
    blockers.push({
      code: 'permit_scope_mismatch',
      message: 'A PT vinculada pertence a outra unidade operacional diferente da unidade da OS.',
    });
  }

  if (order.contractId && permit.contractId && permit.contractId !== order.contractId) {
    blockers.push({
      code: 'permit_scope_mismatch',
      message: 'A PT vinculada pertence a outro contrato diferente do contrato da OS.',
    });
  }

  if (order.safetyPermitType && permit.permitType !== order.safetyPermitType) {
    blockers.push({
      code: 'permit_type_mismatch',
      message: `O tipo da PT (${permit.permitType}) não corresponde ao risco exigido pela OS (${order.safetyPermitType}).`,
    });
  }

  if (!permitState || permitState.status !== 'approved') {
    blockers.push({
      code: 'permit_not_approved',
      message: `A PT ${permit.permitCode || permit.id} não está aprovada (status atual: ${permitState?.status || 'indefinido'}).`,
    });
  }

  const validFromMs = parseBoundaryMs(permit.validFrom, false);
  const validUntilMs = parseBoundaryMs(permit.validUntil, true);
  if (!Number.isFinite(validFromMs) || !Number.isFinite(validUntilMs) || nowMs < validFromMs || nowMs > validUntilMs) {
    blockers.push({
      code: 'permit_expired_or_not_yet_valid',
      message: `A PT ${permit.permitCode || permit.id} está fora da janela de validade (${permit.validFrom || '?'} até ${permit.validUntil || '?'}).`,
    });
  }

  const employeeIds = Array.from(
    new Set(
      (Array.isArray(order.assignedEmployeeIds) && order.assignedEmployeeIds.length > 0
        ? order.assignedEmployeeIds
        : Array.isArray(permit.teamMemberIds)
        ? permit.teamMemberIds
        : []
      )
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  );

  if (employeeIds.length === 0) {
    blockers.push({
      code: 'missing_crew',
      message: 'Informe ao menos um colaborador (por ID oficial do RH) alocado na OS ou na equipe da PT.',
    });
  } else {
    const effectivePermitType: SafetyPermitType = order.safetyPermitType || permit.permitType;
    for (const empId of employeeIds) {
      const empBlockers = evaluateEmployeeSafetyCompliance(
        compliance,
        empId,
        effectivePermitType,
        activityDate,
        activityDate,
      );
      for (const b of empBlockers) {
        blockers.push({
          code: 'crew_compliance_blocker',
          employeeId: b.employeeId,
          employeeName: b.employeeName,
          message: b.message,
        });
      }
    }
  }

  return {
    requiresGate: true,
    allowed: blockers.length === 0,
    blockers,
    permitId: permit.id,
    permitCode: permit.permitCode,
    permitType: order.safetyPermitType || permit.permitType,
    checkedEmployeeCount: employeeIds.length,
  };
}
