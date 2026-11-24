// Diretório de pessoas: a parte do cadastro do RH que o resto do sistema pode ver.
// Fica em `rh_directory/{id}`, sem nenhum valor de salário, para que Operações
// e outras áreas mostrem quem é quem sem precisar de acesso ao RH.
import type { RhEmployee } from '../types/rhPayroll';

export const DIRECTORY_FIELDS = [
  'id', 'orgId', 'name', 'role', 'active', 'admissionDate', 'dismissalDate',
  'department', 'registrationNumber', 'unitId', 'codigoObra', 'updatedAt',
] as const;

export type DirectoryEntry = Pick<RhEmployee, (typeof DIRECTORY_FIELDS)[number]>;

export function toDirectoryEntry(emp: RhEmployee): DirectoryEntry {
  const out: Record<string, unknown> = {};
  for (const k of DIRECTORY_FIELDS) {
    const v = (emp as unknown as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as DirectoryEntry;
}
