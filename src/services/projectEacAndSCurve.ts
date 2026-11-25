import type { MeasurementBulletin } from '../types/measurement.ts';
import type { ProjectCostFact } from '../types/costLedger.ts';
import type { Project } from '../types/project.ts';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export interface ProjectEacProjection {
  projectId: string;
  baselineBudget: number;
  committedOpen: number;
  realizedToDate: number;
  /** Conservative EAC = max(baseline, realized + committedOpen) when progress is low, or CPI-based when progress >= 10% */
  eacProjectedCost: number;
  varianceAtCompletion: number; // baseline - EAC (negative = projected overrun)
  cpi: number | null;
  methodUsed: 'comprometido_mais_realizado' | 'cpi_avanco_fisico';
  assumptionNote: string;
}

export function computeProjectEac(params: {
  projectId: string;
  baselineBudget: number;
  committedOpen: number;
  realizedToDate: number;
  physicalProgressPct?: number;
}): ProjectEacProjection {
  const baseline = round2(Math.max(0, Number(params.baselineBudget) || 0));
  const committed = round2(Math.max(0, Number(params.committedOpen) || 0));
  const realized = round2(Math.max(0, Number(params.realizedToDate) || 0));
  const progressPct = Number.isFinite(Number(params.physicalProgressPct))
    ? Math.max(0, Math.min(100, Number(params.physicalProgressPct)))
    : null;

  if (progressPct !== null && progressPct >= 10 && baseline > 0 && realized > 0) {
    const earnedValue = round2((baseline * progressPct) / 100);
    const cpi = round2(earnedValue / realized);
    const cpiEac = cpi > 0 ? round2(baseline / cpi) : round2(realized + committed);
    const eacProjectedCost = round2(Math.max(cpiEac, realized + committed));
    return {
      projectId: params.projectId,
      baselineBudget: baseline,
      committedOpen: committed,
      realizedToDate: realized,
      eacProjectedCost,
      varianceAtCompletion: round2(baseline - eacProjectedCost),
      cpi,
      methodUsed: 'cpi_avanco_fisico',
      assumptionNote: `Projeção baseada no CPI (${cpi}) sobre avanço físico real de ${progressPct}% e piso Realizado + Comprometido.`,
    };
  }

  const remainingBaseline = Math.max(0, baseline - realized - committed);
  const eacProjectedCost = round2(realized + committed + remainingBaseline);
  return {
    projectId: params.projectId,
    baselineBudget: baseline,
    committedOpen: committed,
    realizedToDate: realized,
    eacProjectedCost,
    varianceAtCompletion: round2(baseline - eacProjectedCost),
    cpi: null,
    methodUsed: 'comprometido_mais_realizado',
    assumptionNote: 'Avanço físico abaixo de 10% ou sem realizado suficiente — projeção conservadora (Realizado + Comprometido + Saldo Previsto).',
  };
}

export interface ProjectSCurvePoint {
  month: string; // YYYY-MM
  plannedCumulative: number;
  realizedCumulative: number;
  approvedMeasurementCumulative: number;
}

/**
 * Generates monthly S-Curve separating baseline planned cost, realized cost ledger,
 * and client-approved measurement revenue (never mixing internal progress with approved revenue).
 */
export function computeProjectSCurve(params: {
  project: Project;
  realizedFacts: readonly ProjectCostFact[];
  approvedBulletins: readonly MeasurementBulletin[];
}): ProjectSCurvePoint[] {
  const { project } = params;
  const startMonth = (project.plannedStartDate || project.createdAt || new Date().toISOString()).slice(0, 7);
  const endMonth = (project.plannedEndDate || startMonth).slice(0, 7);
  const baseline =
    (Number(project.budgetBaseline?.plannedDirectCost) || 0) +
    (Number(project.budgetBaseline?.plannedIndirectCost) || 0);

  const monthSet = new Set<string>();
  const addMonthRange = (fromYm: string, toYm: string) => {
    if (!/^\d{4}-\d{2}$/.test(fromYm) || !/^\d{4}-\d{2}$/.test(toYm)) return;
    const [sy, sm] = fromYm.split('-').map(Number);
    const [ey, em] = toYm.split('-').map(Number);
    let y = sy;
    let m = sm;
    for (let guard = 0; guard < 60; guard += 1) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      monthSet.add(ym);
      if (y > ey || (y === ey && m >= em)) break;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  };
  addMonthRange(startMonth, endMonth >= startMonth ? endMonth : startMonth);

  const realizedByMonth = new Map<string, number>();
  for (const f of params.realizedFacts) {
    if (f.projectId !== project.id || f.stage !== 'realizado') continue;
    const ym = String(f.occurredAt || f.createdAt || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    monthSet.add(ym);
    realizedByMonth.set(ym, round2((realizedByMonth.get(ym) || 0) + (Number(f.amount) || 0)));
  }

  const approvedByMonth = new Map<string, number>();
  for (const b of params.approvedBulletins) {
    if (b.projectId !== project.id) continue;
    if (b.status !== 'aprovado' && b.status !== 'aprovado_parcial') continue;
    const ym = String(b.periodEnd || b.approvedAt || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    monthSet.add(ym);
    approvedByMonth.set(ym, round2((approvedByMonth.get(ym) || 0) + (Number(b.totalApprovedAmount) || 0)));
  }

  const months = Array.from(monthSet).sort();
  if (months.length === 0) return [];

  const plannedMonths = months.filter((m) => m >= startMonth && m <= (endMonth >= startMonth ? endMonth : startMonth));
  const plannedPerMonth = plannedMonths.length > 0 ? baseline / plannedMonths.length : 0;

  let cumPlanned = 0;
  let cumRealized = 0;
  let cumApproved = 0;

  return months.map((month) => {
    if (plannedMonths.includes(month)) cumPlanned = round2(Math.min(baseline, cumPlanned + plannedPerMonth));
    cumRealized = round2(cumRealized + (realizedByMonth.get(month) || 0));
    cumApproved = round2(cumApproved + (approvedByMonth.get(month) || 0));
    return {
      month,
      plannedCumulative: cumPlanned,
      realizedCumulative: cumRealized,
      approvedMeasurementCumulative: cumApproved,
    };
  });
}
