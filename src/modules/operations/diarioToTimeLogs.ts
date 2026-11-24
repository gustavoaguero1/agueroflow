/**
 * Diário de obras (Operações) → apontamento de jornada (worker_time_logs, usado em Obras e RDO).
 * Um registro por pessoa/dia com horas; id determinístico para regravar sem duplicar.
 * Custos ficam zerados: o painel de custo calcula a partir das horas e do RH.
 */
import type { WorkerTimeLog } from '../../types';

export interface DiarioLinha {
  obra?: string;
  sit?: string;
  hn?: number | string;
  h50?: number | string;
  h100?: number | string;
  obs?: string;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** O id leva a empresa (ids fixos não podem colidir entre empresas). */
export const timeLogIdPrefix = (orgId: string, isoDate: string) => `wtl_ops_${orgId}_${isoDate}_`;

/** Mesma regra do RH (syncRhEmployeeToFieldWorker): fw_<id sem "emp_">, ou o de mesmo nome que já existia. */
export function fieldWorkerIdFor(emp: { id: string; name: string }, workers: Array<{ id: string; name: string }>): string {
  const byRule = `fw_${emp.id.replace(/^emp_/, '')}`;
  if (workers.some((w) => w.id === byRule)) return byRule;
  const byName = workers.find((w) => (w.name || '').trim() === (emp.name || '').trim());
  return byName ? byName.id : byRule;
}

export function diarioToTimeLogs(
  orgId: string,
  isoDate: string,
  linhas: Record<string, DiarioLinha>,
  colabs: Map<string, { rhId?: string; workerId?: string; hourlyRate?: number; nome: string; funcao: string }>,
  obras: Map<string, { nome: string; unitId?: string }>,
): WorkerTimeLog[] {
  const out: WorkerTimeLog[] = [];
  for (const [colabId, l] of Object.entries(linhas || {})) {
    const c = colabs.get(colabId);
    if (!c?.rhId) continue;
    const viagem = l.sit === 'Viagem';
    const hn = n(l.hn), h50 = n(l.h50), h100 = n(l.h100);
    if (hn + h50 + h100 === 0) continue;
    if (l.sit && l.sit !== 'Trabalhou' && !viagem) continue;
    const o = l.obra ? obras.get(l.obra) : undefined;
    const now = new Date().toISOString();
    out.push({
      id: `${timeLogIdPrefix(orgId, isoDate)}${colabId}`,
      orgId,
      workerId: c.workerId || `fw_${c.rhId.replace(/^emp_/, '')}`,
      workerName: c.nome,
      role: c.funcao,
      date: isoDate,
      siteName: o?.nome || '',
      ...(o?.unitId ? { unitId: o.unitId } : {}),
      normalHours: viagem ? 0 : hn,
      overtime50Hours: h50,
      overtime100Hours: h100,
      travelHours: viagem ? hn : 0,
      nightShiftHours: 0,
      mealAllowance: 0,
      lodgingAllowance: 0,
      otherExpenses: 0,
      hourlyRate: c.hourlyRate || 0,
      totalLaborCost: 0,
      notes: l.obs ? `Diário de Operações: ${l.obs}` : 'Diário de Operações',
      registeredBy: 'Diário de Operações',
      createdAt: now,
    });
  }
  return out;
}
