/**
 * Salário da equipe de campo fica fora de `field_workers` (que toda a Operação lê):
 * vai para `field_worker_pay/{id}`, lido só com acesso ao RH. Em `field_workers` fica
 * só o valor hora, usado para custear o RDO e o diário. Funções puras.
 */
import type { RhEmployee } from '../types/rhPayroll';
import { toDirectoryEntry } from './rhDirectory';

export const PAY_COLLECTION = 'field_worker_pay';

type Row = Record<string, unknown> & { id: string };
export type WorkerPay = { orgId: string; baseSalary: number; salaryHistory: unknown[] };

export function splitWorkerPay<T extends Row>(data: T): { worker: T; pay: WorkerPay | null } {
  const { baseSalary, salaryHistory, ...rest } = data as Row & { baseSalary?: unknown; salaryHistory?: unknown };
  const worker = { ...rest, baseSalary: 0 } as unknown as T;
  const salary = Number(baseSalary) || 0;
  const history = Array.isArray(salaryHistory) ? salaryHistory : [];
  const pay = salary > 0 || history.length ? { orgId: String(data.orgId || ''), baseSalary: salary, salaryHistory: history } : null;
  return { worker, pay };
}

export function mergeWorkerPay<T extends { id: string }>(
  workers: T[], pay: Map<string, { baseSalary?: number; salaryHistory?: unknown[] }>,
): T[] {
  return workers.map((w) => {
    const p = pay.get(w.id);
    return p ? { ...w, baseSalary: p.baseSalary || 0, salaryHistory: p.salaryHistory || [] } : w;
  });
}

export type MigrationOp = { kind: 'set' | 'strip'; path: string; data?: Record<string, unknown> };

/** O que falta para o acesso por área valer em dados antigos (roda no servidor, sem regras). */
export function planAccessMigration(input: {
  employees: RhEmployee[];
  directoryIds: Set<string>;
  workers: Row[];
}): MigrationOp[] {
  const ops: MigrationOp[] = [];
  for (const e of input.employees) {
    if (!input.directoryIds.has(e.id)) {
      const entry = Object.fromEntries(Object.entries(toDirectoryEntry(e)).filter(([, v]) => v !== undefined));
      ops.push({ kind: 'set', path: `rh_directory/${e.id}`, data: entry });
    }
  }
  for (const w of input.workers) {
    if (!('salaryHistory' in w) && !(Number(w.baseSalary) > 0)) continue;
    const { pay } = splitWorkerPay(w);
    if (pay) ops.push({ kind: 'set', path: `${PAY_COLLECTION}/${w.id}`, data: pay });
    ops.push({ kind: 'strip', path: `field_workers/${w.id}` });
  }
  return ops;
}
