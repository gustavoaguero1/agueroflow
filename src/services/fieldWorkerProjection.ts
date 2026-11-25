import type { FieldWorker } from '../types';
import type { RhEmployee } from '../types/rhPayroll';

/**
 * Builds the Operations projection from the authoritative RH employee.
 * Missing source values remain missing (0/empty), never invented. Existing
 * manually-maintained field data is preserved only for the same stable RH id.
 */
export function buildFieldWorkerProjection(
  employee: RhEmployee,
  existing?: Partial<FieldWorker> | null,
  salaryHistory?: FieldWorker['salaryHistory'],
): FieldWorker {
  const baseSalaryFromRh = Math.max(0, (Number(employee.baseSalaryCarteira) || 0) + (Number(employee.baseSalaryPorFora) || 0));
  const hourlyRateFromRh = Math.max(0, (Number(employee.hourlyRateCarteira) || 0) + (Number(employee.hourlyRatePorFora) || 0));
  const registrationCode = employee.codigoObra?.trim() || employee.registrationNumber?.trim() || '';
  const admissionDate = employee.admissionDate?.trim() || '';

  return {
    id: existing?.id || `fw_${employee.id.replace(/^emp_/, '')}`,
    orgId: employee.orgId,
    rhEmployeeId: employee.id,
    name: employee.name.trim(),
    cpf: existing?.cpf || '',
    role: employee.role?.trim() || existing?.role || '',
    baseSalary: baseSalaryFromRh > 0
      ? Math.round((baseSalaryFromRh + Number.EPSILON) * 100) / 100
      : (employee.isDemo === true ? 0 : Number(existing?.baseSalary) || 0),
    hourlyRate: hourlyRateFromRh > 0
      ? Math.round((hourlyRateFromRh + Number.EPSILON) * 100) / 100
      : (employee.isDemo === true ? 0 : Number(existing?.hourlyRate) || 0),
    currentSite: existing?.currentSite?.trim() || (registrationCode ? `Obra ${registrationCode}` : ''),
    status: employee.active ? 'ativo' : 'desligado',
    admissionDate: admissionDate || (employee.isDemo === true ? '' : existing?.admissionDate || ''),
    certifications: existing?.certifications || [],
    nrCertifications: existing?.nrCertifications || [],
    salaryHistory: salaryHistory || existing?.salaryHistory || [],
    shiftId: existing?.shiftId,
    shiftName: existing?.shiftName,
    customCalculationRules: existing?.customCalculationRules,
    isDemo: employee.isDemo ?? existing?.isDemo ?? false,
    createdAt: existing?.createdAt || employee.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
