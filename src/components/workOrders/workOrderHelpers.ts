import { WorkOrder, PlannedService, PlannedLabor, PlannedPart } from '../../types';

export interface ActiveTimeInfo {
  durationText: string;
  totalHours: number;
  isActive: boolean;
  isCompleted: boolean;
  isDelayed: boolean;
  slaStatus: 'on_time' | 'warning' | 'delayed' | 'completed';
  slaLabel: string;
  slaBadgeColor: string;
  percentSla: number;
}

export function getActiveTimeInfo(order: WorkOrder): ActiveTimeInfo {
  const isCompleted =
    order.status === 'concluido' ||
    order.status === 'concluida' ||
    order.status === 'validado' ||
    order.status === 'encerrada';

  const startTimeStr = order.actualStartDate || order.createdAt || new Date().toISOString();
  const startTime = new Date(startTimeStr).getTime();
  const endTime = isCompleted && order.actualEndDate
    ? new Date(order.actualEndDate).getTime()
    : Date.now();

  const diffMs = Math.max(0, endTime - startTime);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(diffMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const remainingMins = diffMinutes % 60;

  let durationText = '';
  if (days > 0) {
    durationText = `${days}d ${remainingHours}h`;
  } else if (totalHours > 0) {
    durationText = `${totalHours}h ${remainingMins}m`;
  } else {
    durationText = `${Math.max(1, remainingMins)}m`;
  }

  // SLA Calculation
  const now = Date.now();
  const scheduledEnd = order.scheduledEndDate ? new Date(order.scheduledEndDate).getTime() : null;
  let isDelayed = false;
  let slaStatus: 'on_time' | 'warning' | 'delayed' | 'completed' = 'on_time';
  let slaLabel = 'No Prazo';
  let slaBadgeColor = 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40';
  let percentSla = 0;

  if (isCompleted) {
    slaStatus = 'completed';
    slaLabel = 'Concluído';
    slaBadgeColor = 'bg-slate-800/80 text-slate-300 border-slate-700/60';
    percentSla = 100;
  } else if (scheduledEnd) {
    const totalSlaWindow = Math.max(1, scheduledEnd - startTime);
    const elapsedSinceStart = now - startTime;
    percentSla = Math.min(100, Math.max(0, Math.round((elapsedSinceStart / totalSlaWindow) * 100)));

    if (now > scheduledEnd) {
      isDelayed = true;
      slaStatus = 'delayed';
      const delayMs = now - scheduledEnd;
      const delayHours = Math.floor(delayMs / (1000 * 60 * 60));
      const delayDays = Math.floor(delayHours / 24);
      slaLabel = delayDays > 0 ? `Atrasado (+${delayDays}d)` : `Atrasado (+${delayHours}h)`;
      slaBadgeColor = 'bg-rose-950/80 text-rose-300 border-rose-800/60 animate-pulse';
    } else if (percentSla >= 80) {
      slaStatus = 'warning';
      slaLabel = `Alerta SLA (${percentSla}%)`;
      slaBadgeColor = 'bg-amber-950/80 text-amber-300 border-amber-800/50';
    } else {
      slaStatus = 'on_time';
      slaLabel = `No Prazo (${percentSla}%)`;
      slaBadgeColor = 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40';
    }
  }

  return {
    durationText,
    totalHours,
    isActive: !isCompleted,
    isCompleted,
    isDelayed,
    slaStatus,
    slaLabel,
    slaBadgeColor,
    percentSla,
  };
}

export interface PlanningSummary {
  servicesCount: number;
  servicesDone: number;
  servicesPercent: number;
  laborCount: number;
  laborPlannedHours: number;
  laborActualHours: number;
  laborCost: number;
  partsCount: number;
  partsApplied: number;
  partsCost: number;
  totalPlannedCost: number;
  totalRealizedCost: number;
  overallProgressPercent: number;
}

export function getPlanningSummary(order: WorkOrder): PlanningSummary {
  const services: PlannedService[] = order.plannedServices || [];
  const labor: PlannedLabor[] = order.plannedLabor || [];
  const parts: PlannedPart[] = order.plannedParts || [];

  const servicesCount = services.length;
  const servicesDone = services.filter((s) => s.status === 'concluido').length;
  const servicesPercent = servicesCount > 0 ? Math.round((servicesDone / servicesCount) * 100) : 0;

  const laborCount = labor.length;
  const laborPlannedHours = labor.reduce((acc, l) => acc + (l.estimatedHours || 0), 0);
  const laborActualHours = labor.reduce((acc, l) => acc + (l.actualHours || 0), 0);
  const laborCost = labor.reduce((acc, l) => acc + (l.totalCost || (l.actualHours || l.estimatedHours || 0) * (l.hourlyRate || 0)), 0);

  const partsCount = parts.length;
  const partsApplied = parts.filter((p) => p.status === 'aplicado' || p.quantityUsed >= p.quantityPlanned).length;
  const partsCost = parts.reduce((acc, p) => acc + (p.totalCost || (p.quantityPlanned || 0) * (p.unitPrice || 0)), 0);

  const totalPlannedCost = laborCost + partsCost + (order.estimatedCost || 0);
  const totalRealizedCost = (laborActualHours * 65) + partsCost;

  // Overall planning progress calculation
  let progressPoints = 0;
  let totalPoints = 0;

  if (servicesCount > 0) {
    progressPoints += servicesDone * 2;
    totalPoints += servicesCount * 2;
  }
  if (partsCount > 0) {
    progressPoints += partsApplied;
    totalPoints += partsCount;
  }

  const overallProgressPercent = totalPoints > 0
    ? Math.round((progressPoints / totalPoints) * 100)
    : order.status === 'concluido' || order.status === 'validado'
    ? 100
    : order.status === 'em_execucao'
    ? 50
    : 10;

  return {
    servicesCount,
    servicesDone,
    servicesPercent,
    laborCount,
    laborPlannedHours,
    laborActualHours,
    laborCost,
    partsCount,
    partsApplied,
    partsCost,
    totalPlannedCost,
    totalRealizedCost,
    overallProgressPercent,
  };
}
