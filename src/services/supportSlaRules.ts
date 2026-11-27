export type SupportPriority = 'baixa' | 'media' | 'alta' | 'critica';

export const SUPPORT_SLA_HOURS: Record<SupportPriority, number> = {
  critica: 4,
  alta: 8,
  media: 24,
  baixa: 72,
};

export interface SupportSlaEvaluation {
  slaHours: number;
  dueAtIso: string;
  remainingHours: number;
  status: 'encerrado' | 'dentro_prazo' | 'atencao' | 'estourado';
  label: string;
}

export function evaluateSupportTicketSla(params: {
  priority: string;
  status: string;
  createdAt: string;
  nowIso?: string;
}): SupportSlaEvaluation {
  const normalizedPriority: SupportPriority =
    params.priority === 'critica' || params.priority === 'alta' || params.priority === 'baixa'
      ? params.priority
      : 'media';
  const slaHours = SUPPORT_SLA_HOURS[normalizedPriority];
  const createdMs = new Date(params.createdAt).getTime();
  const nowMs = new Date(params.nowIso || new Date().toISOString()).getTime();
  const validCreated = Number.isFinite(createdMs) ? createdMs : nowMs;
  const dueMs = validCreated + slaHours * 3600 * 1000;
  const remainingHours = Math.round(((dueMs - nowMs) / (3600 * 1000)) * 10) / 10;
  const dueAtIso = new Date(dueMs).toISOString();

  if (params.status === 'resolvido' || params.status === 'fechado' || params.status === 'encerrado') {
    return {
      slaHours,
      dueAtIso,
      remainingHours,
      status: 'encerrado',
      label: `SLA ${slaHours}h · Encerrado`,
    };
  }
  if (remainingHours < 0) {
    return {
      slaHours,
      dueAtIso,
      remainingHours,
      status: 'estourado',
      label: `SLA estourado há ${Math.abs(remainingHours).toFixed(1)}h`,
    };
  }
  if (remainingHours <= Math.max(1, slaHours * 0.25)) {
    return {
      slaHours,
      dueAtIso,
      remainingHours,
      status: 'atencao',
      label: `Vence em ${remainingHours.toFixed(1)}h`,
    };
  }
  return {
    slaHours,
    dueAtIso,
    remainingHours,
    status: 'dentro_prazo',
    label: `SLA ${slaHours}h (${remainingHours.toFixed(0)}h rest.)`,
  };
}
