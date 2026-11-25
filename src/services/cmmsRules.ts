import type { AssetReliabilityKpis, CmmsMaintenanceRecord, CmmsPreventivePlan } from '../types/cmms.ts';

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const cleanKey = (v: string) => String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');

/** Idempotent trigger key per (org, CMMS preventive plan, due marker date/hourmeter). */
export function cmmsTriggerKey(orgId: string, planId: string, dueMarker: string): string {
  return `cmms_${cleanKey(orgId)}_${cleanKey(planId)}_${cleanKey(dueMarker)}`;
}

export function isCmmsPlanDue(
  plan: Pick<CmmsPreventivePlan, 'active' | 'triggerType' | 'nextDueDate' | 'nextDueHourmeter'>,
  context: { todayIso: string; currentHourmeter?: number },
): { due: boolean; marker: string } {
  if (!plan.active) return { due: false, marker: '' };
  if (plan.triggerType === 'calendario' && plan.nextDueDate) {
    const today = context.todayIso.slice(0, 10);
    return { due: plan.nextDueDate <= today, marker: plan.nextDueDate };
  }
  if (plan.triggerType === 'horimetro' && typeof plan.nextDueHourmeter === 'number') {
    const cur = Number(context.currentHourmeter) || 0;
    return { due: cur >= plan.nextDueHourmeter, marker: `hm_${plan.nextDueHourmeter}` };
  }
  return { due: false, marker: '' };
}

/**
 * Computes MTBF, MTTR, and availability (%) strictly from real corrective failure records.
 * Never fabricates reliability indices when insufficient real history exists.
 */
export function computeAssetReliabilityKpis(params: {
  assetId: string;
  records: readonly CmmsMaintenanceRecord[];
  operatingWindowHours: number;
}): AssetReliabilityKpis {
  const windowHours = Math.max(0, Number(params.operatingWindowHours) || 0);
  const corrective = params.records.filter((r) => r.assetId === params.assetId && r.type === 'corretiva');
  const totalDowntimeHours = round2(corrective.reduce((s, r) => s + Math.max(0, Number(r.downtimeHours) || 0), 0));

  if (windowHours <= 0 || corrective.length < 2) {
    return {
      assetId: params.assetId,
      correctiveFailuresCount: corrective.length,
      totalDowntimeHours,
      operatingWindowHours: windowHours,
      mtbfHours: null,
      mttrHours: corrective.length === 1 ? round2(totalDowntimeHours) : null,
      availabilityPct: windowHours > 0 ? round2(Math.max(0, ((windowHours - totalDowntimeHours) / windowHours) * 100)) : null,
      sufficientData: false,
      coverageNote: 'Dados insuficientes: MTBF exige janela operacional válida e ao menos 2 falhas corretivas registradas.',
    };
  }

  const uptimeHours = Math.max(0, windowHours - totalDowntimeHours);
  const mtbfHours = round2(uptimeHours / corrective.length);
  const mttrHours = round2(totalDowntimeHours / corrective.length);
  const availabilityPct = round2((uptimeHours / windowHours) * 100);

  return {
    assetId: params.assetId,
    correctiveFailuresCount: corrective.length,
    totalDowntimeHours,
    operatingWindowHours: windowHours,
    mtbfHours,
    mttrHours,
    availabilityPct,
    sufficientData: true,
    coverageNote: `Calculado sobre ${corrective.length} falha(s) corretiva(s) em janela de ${windowHours}h.`,
  };
}
