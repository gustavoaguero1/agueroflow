import type { AreaId, AreaLevel } from '../permissions/areas.ts';
import type { NavSection } from '../components/layout/AppLayout.tsx';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface ActionableNotification {
  id: string;
  title: string;
  detail: string;
  severity: NotificationSeverity;
  count: number;
  targetSection: NavSection;
  requiredArea?: AreaId;
}

export interface ActionableNotificationsInput {
  areaLevels: Partial<Record<AreaId, AreaLevel>>;
  isMaster?: boolean;
  todayIso: string; // YYYY-MM-DD
  workOrders?: ReadonlyArray<{ id: string; status?: string; scheduledEndDate?: string }>;
  safetyPermitStates?: ReadonlyArray<{ id: string; status?: string }>;
  assets?: ReadonlyArray<{ id: string; calibrationDueDate?: string; status?: string }>;
  trainingRecords?: ReadonlyArray<{ id: string; expirationDate?: string; validUntil?: string }>;
  purchaseOrders?: ReadonlyArray<{ id: string; status?: string; approvedAt?: string }>;
  bulletins?: ReadonlyArray<{ id: string; status?: string }>;
  supportTickets?: ReadonlyArray<{ id: string; status?: string }>;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 9999;
  return Math.round((b - a) / 86400000);
}

export function buildActionableNotifications(input: ActionableNotificationsInput): ActionableNotification[] {
  const today = input.todayIso.slice(0, 10);
  const canSee = (area?: AreaId) => !area || input.isMaster || Number(input.areaLevels[area] ?? 0) >= 1;
  const list: ActionableNotification[] = [];

  // 1. Delayed work orders (Operações)
  if (canSee('operacoes')) {
    const delayed = (input.workOrders || []).filter(
      (o) =>
        o.scheduledEndDate &&
        o.scheduledEndDate.slice(0, 10) < today &&
        o.status !== 'concluida' &&
        o.status !== 'encerrada' &&
        o.status !== 'cancelada',
    ).length;
    if (delayed > 0) {
      list.push({
        id: 'delayed-work-orders',
        title: `${delayed} OS atrasada(s)`,
        detail: 'Ordens com data prevista expirada aguardando conclusão.',
        severity: 'critical',
        count: delayed,
        targetSection: 'ordens',
        requiredArea: 'operacoes',
      });
    }

    // 2. Pending safety permits (SMS)
    const pendingPts = (input.safetyPermitStates || []).filter(
      (s) => s.status === 'pending_approval' || s.status === 'submitted' || s.status === 'pendente',
    ).length;
    if (pendingPts > 0) {
      list.push({
        id: 'pending-safety-permits',
        title: `${pendingPts} PT(s) aguardando aprovação`,
        detail: 'Permissões de Trabalho pendentes para liberação de campo.',
        severity: 'critical',
        count: pendingPts,
        targetSection: 'obras',
        requiredArea: 'operacoes',
      });
    }

    // 3. Measurement bulletins waiting review/approval
    const reviewBms = (input.bulletins || []).filter(
      (b) => b.status === 'em_revisao' || b.status === 'submetido',
    ).length;
    if (reviewBms > 0) {
      list.push({
        id: 'review-bulletins',
        title: `${reviewBms} Boletim(ns) de Medição em revisão`,
        detail: 'Medições submetidas aguardando validação/aprovação.',
        severity: 'info',
        count: reviewBms,
        targetSection: 'obras-medicoes',
        requiredArea: 'operacoes',
      });
    }
  }

  // 4. Equipment calibrations expiring within 15 days or expired
  if (canSee('operacoes')) {
    const expAssets = (input.assets || []).filter((a) => {
      if (!a.calibrationDueDate) return false;
      const d = daysBetween(today, a.calibrationDueDate);
      return d <= 15;
    }).length;
    if (expAssets > 0) {
      list.push({
        id: 'expiring-calibrations',
        title: `${expAssets} calibração(ões) vencendo ou vencida(s)`,
        detail: 'Instrumentos/ativos com calibração vencida ou vencendo em até 15 dias.',
        severity: 'warning',
        count: expAssets,
        targetSection: 'bens-manutencoes',
        requiredArea: 'operacoes',
      });
    }
  }

  // 5. NR/Safety certificates expiring within 30 days (RH or Operações)
  if (canSee('rh') || canSee('operacoes')) {
    const expNrs = (input.trainingRecords || []).filter((t) => {
      const exp = t.expirationDate || t.validUntil;
      if (!exp) return false;
      return daysBetween(today, exp) <= 30;
    }).length;
    if (expNrs > 0) {
      list.push({
        id: 'expiring-nrs',
        title: `${expNrs} certificado(s) NR vencendo ou vencido(s)`,
        detail: 'Treinamentos obrigatórios com validade crítica (<= 30 dias).',
        severity: 'warning',
        count: expNrs,
        targetSection: 'obras',
      });
    }
  }

  // 6. Purchase orders waiting server-side approval (Estoque/Compras)
  if (canSee('estoque')) {
    const unapprovedPos = (input.purchaseOrders || []).filter(
      (po) => po.status !== 'cancelada' && !po.approvedAt,
    ).length;
    if (unapprovedPos > 0) {
      list.push({
        id: 'pending-po-approvals',
        title: `${unapprovedPos} OC(s) aguardando alçada`,
        detail: 'Ordens de Compra pendentes de aprovação auditada.',
        severity: 'warning',
        count: unapprovedPos,
        targetSection: 'compras-pedidos',
        requiredArea: 'estoque',
      });
    }
  }

  // 7. Open support tickets
  const openTickets = (input.supportTickets || []).filter(
    (t) => t.status === 'aberto' || t.status === 'em_andamento',
  ).length;
  if (openTickets > 0) {
    list.push({
      id: 'open-support-tickets',
      title: `${openTickets} chamado(s) de Suporte aberto(s)`,
      detail: 'Solicitações internas aguardando retorno/encerramento.',
      severity: 'info',
      count: openTickets,
      targetSection: 'suporte',
    });
  }

  const weight: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return list.sort((a, b) => weight[a.severity] - weight[b.severity]);
}
