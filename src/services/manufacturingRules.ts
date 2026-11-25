import type { FabricationOrder, FabricationOperationStage, FabricationRoutingStep } from '../types/manufacturing.ts';

const VALID_STAGES: ReadonlySet<FabricationOperationStage> = new Set([
  'corte',
  'preparacao',
  'conformacao',
  'montagem',
  'solda',
  'acabamento',
  'inspecao',
  'expedicao',
]);

export function normalizeFabricationRouting(
  rawSteps: ReadonlyArray<Partial<FabricationRoutingStep>>,
): FabricationRoutingStep[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error('A Ordem de Fabricação precisa ter ao menos 1 operação no roteiro.');
  }
  return rawSteps.map((s, idx) => {
    const stage = String(s.stage || '').trim() as FabricationOperationStage;
    if (!VALID_STAGES.has(stage)) {
      throw new Error(`Operação #${idx + 1}: estágio de fabricação inválido (${String(s.stage)}).`);
    }
    const description = String(s.description || stage).trim();
    const plannedHours = Math.max(0, Number(s.plannedHours) || 0);
    return {
      id: String(s.id || `op_${idx + 1}`).trim(),
      sequence: idx + 1,
      stage,
      description,
      isHoldPoint: s.isHoldPoint === true || stage === 'inspecao',
      plannedHours,
      actualHours: Math.max(0, Number(s.actualHours) || 0),
      goodQty: Math.max(0, Number(s.goodQty) || 0),
      scrapQty: Math.max(0, Number(s.scrapQty) || 0),
      reworkQty: Math.max(0, Number(s.reworkQty) || 0),
      status: s.status && ['pendente', 'em_andamento', 'concluida', 'reprovada'].includes(s.status) ? s.status : 'pendente',
    };
  });
}

export function canShipFabricationOrder(order: Pick<FabricationOrder, 'status' | 'routing'>): {
  allowed: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (order.status === 'cancelada' || order.status === 'expedida') {
    blockers.push(`Ordem de Fabricação em status "${order.status}" não pode ser expedida.`);
  }
  for (const step of order.routing || []) {
    if (step.stage === 'expedicao') continue;
    if (step.status !== 'concluida') {
      blockers.push(`Operação ${step.sequence} (${step.stage}: ${step.description}) ainda está "${step.status}".`);
    }
  }
  return { allowed: blockers.length === 0, blockers };
}

export function computeFabricationMetrics(order: Pick<FabricationOrder, 'routing'>): {
  progressPct: number;
  totalPlannedHours: number;
  totalActualHours: number;
  totalGoodQty: number;
  totalScrapQty: number;
  totalReworkQty: number;
} {
  const steps = order.routing || [];
  const completed = steps.filter((s) => s.status === 'concluida').length;
  const progressPct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;
  return {
    progressPct,
    totalPlannedHours: Math.round(steps.reduce((acc, s) => acc + (s.plannedHours || 0), 0) * 100) / 100,
    totalActualHours: Math.round(steps.reduce((acc, s) => acc + (s.actualHours || 0), 0) * 100) / 100,
    totalGoodQty: steps.reduce((acc, s) => acc + (s.goodQty || 0), 0),
    totalScrapQty: steps.reduce((acc, s) => acc + (s.scrapQty || 0), 0),
    totalReworkQty: steps.reduce((acc, s) => acc + (s.reworkQty || 0), 0),
  };
}
