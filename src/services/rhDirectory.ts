// Diretório de pessoas: a parte do cadastro do RH que o resto do sistema pode ver.
// Fica em `rh_directory/{id}`, sem nenhum valor de salário, para que Operações
// e outras áreas mostrem quem é quem sem precisar de acesso ao RH.
import type { RhEmployee } from '../types/rhPayroll';

export const DIRECTORY_FIELDS = [
  'id', 'orgId', 'name', 'role', 'active', 'admissionDate', 'dismissalDate',
  'department', 'registrationNumber', 'unitId', 'codigoObra', 'updatedAt',
] as const;

export type DirectoryEntry = Pick<RhEmployee, (typeof DIRECTORY_FIELDS)[number]> & {
  rhEmployeeId: string;
};

export type DirectoryOp = { kind: 'set'; id: string; data: DirectoryEntry } | { kind: 'delete'; id: string };

const sameEntry = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
};

/** O que gravar para o diretório ficar igual ao RH: só o que mudou, e apaga quem saiu do RH. */
export function directoryChanges(
  employees: RhEmployee[], directory: Array<{ id: string; data: Record<string, unknown> }>,
): DirectoryOp[] {
  const current = new Map(directory.map((d) => [d.id, d.data]));
  const ops: DirectoryOp[] = [];
  for (const e of employees) {
    const entry = toDirectoryEntry(e);
    const have = current.get(e.id);
    if (!have || !sameEntry(have, entry as Record<string, unknown>)) ops.push({ kind: 'set', id: e.id, data: entry });
  }
  const ids = new Set(employees.map((e) => e.id));
  for (const d of directory) if (!ids.has(d.id)) ops.push({ kind: 'delete', id: d.id });
  return ops;
}

export function toDirectoryEntry(emp: RhEmployee): DirectoryEntry {
  const out: Record<string, unknown> = { rhEmployeeId: emp.id };
  for (const k of DIRECTORY_FIELDS) {
    const v = (emp as unknown as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as DirectoryEntry;
}
