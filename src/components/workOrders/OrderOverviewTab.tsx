import React from 'react';
import {
  WorkOrder,
  WorkOrderStatusConfig,
  Asset,
} from '../../types';
import {
  Clock,
  Activity,
  Calendar,
  Tag,
  DollarSign,
  User,
  Users,
  Wrench,
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { getActiveTimeInfo, getPlanningSummary } from './workOrderHelpers';

interface OrderOverviewTabProps {
  order: WorkOrder;
  statuses: WorkOrderStatusConfig[];
  statusChangeNote: string;
  setStatusChangeNote: (val: string) => void;
  onUpdateStatus: (order: WorkOrder, targetStatusId: string, note?: string) => Promise<void>;
  onOpenStatusConfig: () => void;
  canViewFinancials: boolean;
  onNavigateTab: (tab: 'overview' | 'discussion' | 'planning' | 'timeline') => void;
  asset?: Asset;
}

export const OrderOverviewTab: React.FC<OrderOverviewTabProps> = ({
  order,
  statuses,
  statusChangeNote,
  setStatusChangeNote,
  onUpdateStatus,
  onOpenStatusConfig,
  canViewFinancials,
  onNavigateTab,
  asset,
}) => {
  const activeTime = getActiveTimeInfo(order);
  const planning = getPlanningSummary(order);

  const resolveStatusKey = (rawStatus: string | undefined): string => {
    if (!rawStatus) return statuses[0]?.id || 'aberto';
    const direct = statuses.find((s) => s.id === rawStatus || s.name.toLowerCase() === rawStatus.toLowerCase());
    if (direct) return direct.id;
    return rawStatus;
  };

  const currentStatusId = resolveStatusKey(order.status);

  return (
    <div className="space-y-4 text-xs">
      {/* Active Time & SLA Highlight Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-900/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">
                Tempo Ativo da Demanda
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activeTime.slaBadgeColor}`}>
                {activeTime.slaLabel}
              </span>
            </div>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl font-black font-mono text-white tracking-tight">
                {activeTime.durationText}
              </span>
              <span className="text-xs text-slate-400">
                {activeTime.isCompleted ? 'tempo total de ciclo' : 'decorrido desde o apontamento'}
              </span>
            </div>
          </div>
        </div>

        {/* SLA Progress Bar / Dates */}
        <div className="flex-1 max-w-xs space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Início: <strong>{order.actualStartDate || order.createdAt.split('T')[0]}</strong></span>
            <span>Meta: <strong>{order.scheduledEndDate || 'Não def.'}</strong></span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                activeTime.isDelayed
                  ? 'bg-rose-500'
                  : activeTime.percentSla >= 80
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, activeTime.percentSla || (activeTime.isCompleted ? 100 : 40))}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>SLA Operacional</span>
            <span>{activeTime.percentSla}% consumido</span>
          </div>
        </div>
      </div>

      {/* Status Pipeline Transition Bar */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-xs font-bold text-white block">
              Ciclo Operacional & Transição de Estados
            </span>
            <span className="text-[11px] text-slate-400">
              Clique no estado desejado para avançar ou recuar o fluxo da OS com registro na linha do tempo.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenStatusConfig}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1 cursor-pointer self-start sm:self-auto"
          >
            <Sliders className="w-3 h-3" />
            <span>Personalizar Pipeline</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {statuses.map((st, idx) => {
            const isCurrent = currentStatusId === st.id;

            return (
              <button
                key={st.id}
                type="button"
                disabled={isCurrent}
                onClick={() => onUpdateStatus(order, st.id, statusChangeNote)}
                className={`p-2.5 rounded-lg text-xs font-semibold flex flex-col items-center justify-center text-center transition-all cursor-pointer relative border ${
                  isCurrent
                    ? 'bg-blue-600/30 text-white border-blue-500 shadow-md ring-2 ring-blue-500/50'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/90 hover:text-white border-slate-700/60'
                }`}
              >
                <span className="text-[10px] text-slate-400 font-mono mb-0.5">Etapa {idx + 1}</span>
                <span className="font-bold">{st.name}</span>
                {isCurrent && (
                  <span className="text-[9px] mt-1 px-1.5 py-0.2 rounded bg-blue-500 text-white font-bold">
                    Estado Atual
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Status Note Input */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={statusChangeNote}
            onChange={(e) => setStatusChangeNote(e.target.value)}
            placeholder="Justificativa ou apontamento da transição (opcional, registrado no histórico)..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          {statusChangeNote && (
            <span className="text-[10px] text-amber-400 shrink-0">
              * Será anexado ao histórico do evento.
            </span>
          )}
        </div>
      </div>

      {/* 4 Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Asset / Equipment */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
            <span>Ativo Vinculado</span>
            <Tag className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="font-bold text-white truncate block">
            {asset ? asset.name : 'Equipamento Geral'}
          </span>
          <span className="font-mono text-[10px] text-blue-400 block mt-0.5">
            {asset ? asset.tag : 'TAG-001'}
          </span>
        </div>

        {/* Responsible Team / Requester */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
            <span>Equipe Responsável</span>
            <Users className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="font-bold text-slate-200 truncate block">
            {order.assignedTeam || 'Sem equipe'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
            Sol: {order.requesterName}
          </span>
        </div>

        {/* Planning Progress Summary */}
        <div
          onClick={() => onNavigateTab('planning')}
          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
            <span>Planejamento</span>
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="font-bold text-white text-base">
              {planning.overallProgressPercent}%
            </span>
            <span className="text-[10px] text-slate-400">concluído</span>
          </div>
          <span className="text-[10px] text-blue-400 hover:underline block mt-0.5">
            {planning.servicesCount} serviços • {planning.partsCount} peças →
          </span>
        </div>

        {/* Financials */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-500 text-[10px] mb-1">
            <span>Custo Planejado</span>
            <DollarSign className="w-3.5 h-3.5 text-purple-400" />
          </div>
          {canViewFinancials ? (
            <div>
              <span className="font-mono font-bold text-emerald-400 text-sm block">
                R$ {planning.totalPlannedCost.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {order.estimatedHours || 0}h estimadas
              </span>
            </div>
          ) : (
            <span className="text-slate-500 italic text-[11px] block mt-1">Oculto</span>
          )}
        </div>
      </div>

      {/* Description & Execution Note */}
      <div className="space-y-3">
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
          <h4 className="font-bold text-slate-200 mb-1 text-xs">Descrição Operacional da Demanda</h4>
          <p className="text-slate-300 leading-relaxed text-xs">{order.description}</p>
        </div>

        {order.reworkReason && (
          <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-800/40 text-amber-200">
            <h4 className="font-bold text-amber-400 mb-1 text-xs flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Justificativa de Retrabalho</span>
            </h4>
            <p className="leading-relaxed text-xs">{order.reworkReason}</p>
          </div>
        )}

        {order.notes && (
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <h4 className="font-bold text-slate-300 mb-1 text-xs">Observações Gerais</h4>
            <p className="text-slate-400 leading-relaxed text-xs">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Quick Access Action Bar to other OS sections */}
      <div className="pt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigateTab('discussion')}
          className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Abrir Conversa Operacional (Superior ↔ Responsável)</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('planning')}
          className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Ver Planejamento de Serviços, Mão de Obra e Peças</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('timeline')}
          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Ver Linha do Tempo Auditável</span>
        </button>
      </div>
    </div>
  );
};
