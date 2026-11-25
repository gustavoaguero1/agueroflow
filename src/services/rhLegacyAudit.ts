import type { FieldWorker } from '../types';
import type { RhEmployee } from '../types/rhPayroll';

export type RhAuditSeverity = 'critica' | 'atencao';

export type RhEmployeeMissingField =
  | 'name'
  | 'admissionDate'
  | 'registrationNumber'
  | 'role'
  | 'department'
  | 'compensation'
  | 'unitId';

export interface RhEmployeePendency {
  employeeId: string;
  employeeName: string;
  registrationNumber: string;
  active: boolean;
  severity: RhAuditSeverity;
  missingFields: RhEmployeeMissingField[];
  reasons: string[];
}

export interface RhCandidateSuggestion {
  employeeId: string;
  employeeName: string;
  registrationNumber: string;
  active: boolean;
  matchBasis: 'normalized_name';
  requiresHumanReview: true;
}

export interface FieldWorkerLinkPendency {
  fieldWorkerId: string;
  workerName: string;
  cpf: string;
  role: string;
  status: FieldWorker['status'] | string;
  issueType: 'missing_rh_link' | 'broken_rh_link';
  currentRhEmployeeId?: string;
  severity: 'critica';
  reason: string;
  suggestedCandidates: RhCandidateSuggestion[];
  requiresHumanReview: true;
}

export type RhDuplicateKind =
  | 'duplicate_field_worker_link'
  | 'duplicate_field_worker_cpf'
  | 'duplicate_field_worker_name'
  | 'duplicate_rh_employee_name'
  | 'duplicate_rh_employee_registration';

export interface RhDuplicateRecordRef {
  collection: 'rh_employees' | 'field_workers';
  id: string;
  name: string;
  code?: string;
  rhEmployeeId?: string;
  status?: string;
}

export interface RhPossibleDuplicate {
  kind: RhDuplicateKind;
  severity: RhAuditSeverity;
  matchKey: string;
  matchLabel: string;
  reason: string;
  recordIds: string[];
  records: RhDuplicateRecordRef[];
  requiresHumanReview: true;
}

export interface RhLegacyAuditSummary {
  orgId: string;
  generatedAt: string;
  totalRhEmployees: number;
  totalFieldWorkers: number;
  demoRecordsExcluded: number;
  employeesWithPendencies: number;
  criticalEmployeePendencies: number;
  unlinkedFieldWorkersCount: number;
  brokenFieldWorkerLinksCount: number;
  possibleDuplicatesCount: number;
  totalIssues: number;
  isClean: boolean;
}

export interface RhLegacyAuditReport {
  summary: RhLegacyAuditSummary;
  employeePendencies: RhEmployeePendency[];
  unlinkedFieldWorkers: FieldWorkerLinkPendency[];
  possibleDuplicates: RhPossibleDuplicate[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalizes a person's name for read-only duplicate detection (never for automatic merging). */
export function normalizePersonName(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  const s = String(value ?? '').trim();
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Produces an auditable, read-only legacy HR pendency report for human review.
 * Never mutates inputs, never links records automatically by name, and excludes demo data.
 */
export function buildRhLegacyAuditReport(params: {
  orgId: string;
  employees: readonly RhEmployee[];
  fieldWorkers: readonly FieldWorker[];
  generatedAt?: string;
}): RhLegacyAuditReport {
  const orgId = params.orgId;
  const generatedAt = params.generatedAt || new Date().toISOString();

  let demoRecordsExcluded = 0;
  const employees = params.employees.filter((e) => {
    if (e.isDemo === true) {
      demoRecordsExcluded++;
      return false;
    }
    return !orgId || e.orgId === orgId;
  });

  const fieldWorkers = params.fieldWorkers.filter((w) => {
    if (w.isDemo === true) {
      demoRecordsExcluded++;
      return false;
    }
    return !orgId || w.orgId === orgId;
  });

  const employeeById = new Map<string, RhEmployee>();
  const employeesByNormName = new Map<string, RhEmployee[]>();
  const employeesByReg = new Map<string, RhEmployee[]>();

  for (const emp of employees) {
    employeeById.set(emp.id, emp);
    const normName = normalizePersonName(emp.name);
    if (normName) {
      const list = employeesByNormName.get(normName) || [];
      list.push(emp);
      employeesByNormName.set(normName, list);
    }
    const reg = (emp.registrationNumber || emp.codigoObra || '').trim().toUpperCase();
    if (reg) {
      const list = employeesByReg.get(reg) || [];
      list.push(emp);
      employeesByReg.set(reg, list);
    }
  }

  // 1. Audit RH employees with missing mandatory fields
  const employeePendencies: RhEmployeePendency[] = [];
  for (const emp of employees) {
    const missingFields: RhEmployeeMissingField[] = [];
    const reasons: string[] = [];
    let hasCritical = false;

    const cleanName = (emp.name || '').trim();
    if (!cleanName) {
      missingFields.push('name');
      reasons.push('Nome completo ausente.');
      hasCritical = true;
    }

    if (!isValidIsoDate(emp.admissionDate)) {
      missingFields.push('admissionDate');
      reasons.push(
        emp.admissionDate
          ? `Data de admissão inválida ("${emp.admissionDate}").`
          : 'Data de admissão ausente (impede cálculo de 13º salário).'
      );
      hasCritical = true;
    }

    const regCode = (emp.codigoObra || emp.registrationNumber || '').trim();
    if (!regCode) {
      missingFields.push('registrationNumber');
      reasons.push('Código da obra / matrícula ausente.');
      hasCritical = true;
    }

    if (!(emp.role || '').trim()) {
      missingFields.push('role');
      reasons.push('Cargo / função não informado.');
    }

    if (!(emp.department || '').trim()) {
      missingFields.push('department');
      reasons.push('Departamento / setor não informado.');
    }

    const hasComp =
      (Number(emp.hourlyRateCarteira) || 0) > 0 ||
      (Number(emp.hourlyRatePorFora) || 0) > 0 ||
      (Number(emp.baseSalaryCarteira) || 0) > 0 ||
      (Number(emp.baseSalaryPorFora) || 0) > 0;
    if (!hasComp) {
      missingFields.push('compensation');
      reasons.push('Sem valor hora ou salário-base informado (pendente de cadastro salarial).');
      if (emp.active) hasCritical = true;
    }

    if (!(emp.unitId || '').trim()) {
      missingFields.push('unitId');
      reasons.push('Unidade / obra de alocação não vinculada.');
    }

    if (missingFields.length > 0) {
      employeePendencies.push({
        employeeId: emp.id,
        employeeName: cleanName || '(Sem nome)',
        registrationNumber: regCode,
        active: emp.active,
        severity: hasCritical ? 'critica' : 'atencao',
        missingFields,
        reasons,
      });
    }
  }

  employeePendencies.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critica' ? -1 : 1;
    return a.employeeName.localeCompare(b.employeeName);
  });

  // 2. Audit field_workers missing rhEmployeeId or pointing to a nonexistent rh_employees doc
  const unlinkedFieldWorkers: FieldWorkerLinkPendency[] = [];
  const workersByRhId = new Map<string, FieldWorker[]>();
  const workersByCpf = new Map<string, FieldWorker[]>();
  const workersByNormName = new Map<string, FieldWorker[]>();

  for (const fw of fieldWorkers) {
    const rhId = (fw.rhEmployeeId || '').trim();
    if (rhId) {
      const list = workersByRhId.get(rhId) || [];
      list.push(fw);
      workersByRhId.set(rhId, list);
    }

    const cpfDigits = normalizeDigits(fw.cpf);
    if (cpfDigits.length === 11) {
      const list = workersByCpf.get(cpfDigits) || [];
      list.push(fw);
      workersByCpf.set(cpfDigits, list);
    }

    const normName = normalizePersonName(fw.name);
    if (normName) {
      const list = workersByNormName.get(normName) || [];
      list.push(fw);
      workersByNormName.set(normName, list);
    }

    if (!rhId || !employeeById.has(rhId)) {
      const candidates = (normName ? employeesByNormName.get(normName) || [] : []).map(
        (cand): RhCandidateSuggestion => ({
          employeeId: cand.id,
          employeeName: cand.name,
          registrationNumber: (cand.codigoObra || cand.registrationNumber || '').trim(),
          active: cand.active,
          matchBasis: 'normalized_name',
          requiresHumanReview: true,
        })
      );

      unlinkedFieldWorkers.push({
        fieldWorkerId: fw.id,
        workerName: (fw.name || '').trim() || '(Sem nome)',
        cpf: (fw.cpf || '').trim(),
        role: (fw.role || '').trim(),
        status: fw.status,
        issueType: !rhId ? 'missing_rh_link' : 'broken_rh_link',
        ...(rhId ? { currentRhEmployeeId: rhId } : {}),
        severity: 'critica',
        reason: !rhId
          ? 'Colaborador de campo sem rhEmployeeId vinculado (revisão humana necessária; sem associação automática por nome).'
          : `rhEmployeeId "${rhId}" não corresponde a nenhum colaborador ativo/cadastrado em rh_employees.`,
        suggestedCandidates: candidates,
        requiresHumanReview: true,
      });
    }
  }

  unlinkedFieldWorkers.sort((a, b) => a.workerName.localeCompare(b.workerName));

  // 3. Audit possible duplicates (read-only flags for human review; never auto-merged)
  const possibleDuplicates: RhPossibleDuplicate[] = [];

  for (const [rhId, list] of workersByRhId.entries()) {
    if (list.length > 1) {
      possibleDuplicates.push({
        kind: 'duplicate_field_worker_link',
        severity: 'critica',
        matchKey: rhId,
        matchLabel: `rhEmployeeId ${rhId}`,
        reason: `${list.length} registros em field_workers apontam para o mesmo colaborador RH (${rhId}).`,
        recordIds: list.map((w) => w.id).sort(),
        records: list.map((w) => ({
          collection: 'field_workers',
          id: w.id,
          name: w.name,
          rhEmployeeId: w.rhEmployeeId,
          status: w.status,
        })),
        requiresHumanReview: true,
      });
    }
  }

  for (const [cpf, list] of workersByCpf.entries()) {
    if (list.length > 1) {
      possibleDuplicates.push({
        kind: 'duplicate_field_worker_cpf',
        severity: 'critica',
        matchKey: cpf,
        matchLabel: `CPF ${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`,
        reason: `${list.length} registros em field_workers compartilham o mesmo CPF.`,
        recordIds: list.map((w) => w.id).sort(),
        records: list.map((w) => ({
          collection: 'field_workers',
          id: w.id,
          name: w.name,
          rhEmployeeId: w.rhEmployeeId,
          status: w.status,
        })),
        requiresHumanReview: true,
      });
    }
  }

  for (const [normName, list] of workersByNormName.entries()) {
    if (list.length > 1) {
      possibleDuplicates.push({
        kind: 'duplicate_field_worker_name',
        severity: 'atencao',
        matchKey: normName,
        matchLabel: list[0].name,
        reason: `${list.length} registros em field_workers possuem o mesmo nome normalizado (verificar se são homônimos ou duplicidade legada).`,
        recordIds: list.map((w) => w.id).sort(),
        records: list.map((w) => ({
          collection: 'field_workers',
          id: w.id,
          name: w.name,
          rhEmployeeId: w.rhEmployeeId,
          status: w.status,
        })),
        requiresHumanReview: true,
      });
    }
  }

  for (const [normName, list] of employeesByNormName.entries()) {
    if (list.length > 1) {
      possibleDuplicates.push({
        kind: 'duplicate_rh_employee_name',
        severity: 'atencao',
        matchKey: normName,
        matchLabel: list[0].name,
        reason: `${list.length} colaboradores em rh_employees possuem o mesmo nome normalizado (verificar homônimos ou duplicidade).`,
        recordIds: list.map((e) => e.id).sort(),
        records: list.map((e) => ({
          collection: 'rh_employees',
          id: e.id,
          name: e.name,
          code: (e.codigoObra || e.registrationNumber || '').trim() || undefined,
          status: e.active ? 'ativo' : 'inativo',
        })),
        requiresHumanReview: true,
      });
    }
  }

  possibleDuplicates.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critica' ? -1 : 1;
    return a.matchLabel.localeCompare(b.matchLabel);
  });

  const brokenFieldWorkerLinksCount = unlinkedFieldWorkers.filter(
    (item) => item.issueType === 'broken_rh_link'
  ).length;
  const unlinkedFieldWorkersCount = unlinkedFieldWorkers.filter(
    (item) => item.issueType === 'missing_rh_link'
  ).length;
  const criticalEmployeePendencies = employeePendencies.filter(
    (item) => item.severity === 'critica'
  ).length;
  const totalIssues =
    employeePendencies.length + unlinkedFieldWorkers.length + possibleDuplicates.length;

  return {
    summary: {
      orgId,
      generatedAt,
      totalRhEmployees: employees.length,
      totalFieldWorkers: fieldWorkers.length,
      demoRecordsExcluded,
      employeesWithPendencies: employeePendencies.length,
      criticalEmployeePendencies,
      unlinkedFieldWorkersCount,
      brokenFieldWorkerLinksCount,
      possibleDuplicatesCount: possibleDuplicates.length,
      totalIssues,
      isClean: totalIssues === 0,
    },
    employeePendencies,
    unlinkedFieldWorkers,
    possibleDuplicates,
  };
}

function escapeCsvCell(value: string): string {
  const safe = String(value ?? '').replace(/"/g, '""');
  return `"${safe}"`;
}

/** Formats the legacy HR pendency audit report as a UTF-8 CSV snapshot for compliance review. */
export function formatRhLegacyAuditCsv(report: RhLegacyAuditReport): string {
  const headers = [
    'Gerado_Em',
    'Org_ID',
    'Categoria',
    'Severidade',
    'Colecao',
    'Registro_IDs',
    'Nome_ou_Chave',
    'Detalhes',
    'Revisao_Humana_Obrigatoria',
  ];

  const rows: string[][] = [];

  for (const item of report.employeePendencies) {
    rows.push([
      report.summary.generatedAt,
      report.summary.orgId,
      'pendencia_cadastral_rh',
      item.severity,
      'rh_employees',
      item.employeeId,
      item.employeeName,
      item.reasons.join(' | '),
      'SIM',
    ]);
  }

  for (const item of report.unlinkedFieldWorkers) {
    const candidateNote =
      item.suggestedCandidates.length > 0
        ? ` | Candidatos por nome (revisão manual): ${item.suggestedCandidates
            .map((c) => `${c.employeeName} (${c.employeeId})`)
            .join(', ')}`
        : '';
    rows.push([
      report.summary.generatedAt,
      report.summary.orgId,
      item.issueType,
      item.severity,
      'field_workers',
      item.fieldWorkerId,
      item.workerName,
      `${item.reason}${candidateNote}`,
      'SIM',
    ]);
  }

  for (const dup of report.possibleDuplicates) {
    rows.push([
      report.summary.generatedAt,
      report.summary.orgId,
      dup.kind,
      dup.severity,
      dup.records[0]?.collection || 'rh_employees',
      dup.recordIds.join(', '),
      dup.matchLabel,
      dup.reason,
      'SIM',
    ]);
  }

  return [
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((row) => row.map(escapeCsvCell).join(';')),
  ].join('\n');
}
