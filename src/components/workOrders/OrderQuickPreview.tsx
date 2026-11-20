import React from 'react';
import { WorkOrder, Asset } from '../../types';
import {
  Clock,
  Wrench,
  Boxes,
  Users,
  MessageSquare,
  Activity,
  ArrowRight,
  HelpCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { getActiveTimeInfo, getPlanningSummary } from './workOrderHelpers';

interface OrderQuickPreviewProps {
  order: WorkOrder;
  asset?: Asset;
  onOpenModalTab: (order: WorkOrder, tab: 'overview' | 'discussion' | 'planning' | 'timeline') => void;
  canViewFinancials: boolean;
}

export const OrderQuickPreview: React.FC<OrderQuickPreviewProps> = ({
  order,
  asset,
  onOpenModalTab,
  canViewFinancials,
}) => {
  const activeTime = getActiveTimeInfo(order);
  const planning = getPlanningSummary(order);

  const services = order.plannedServices || [];
  const labor = order.plannedLabor || [];
  const parts = order.plannedParts || [];

  return (
    <div className="p-4 bg-[#0a0f1d] border-t border-b border-slate-800 text-xs text-slate-300 space-y-3.5 animate-fadeIn">
      {/* Top Quick Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-xs font-black text-blue-400">{order.orderNumber}</span>
          <span className="text-slate-500">•</span>
          <span className="font-bold text-white text-xs">{order.title}</span>
          {asset && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-blue-300 border border-slate-700">
              {asset.tag} - {asset.name}
            </span>
          )}
        </div>

        {/* Quick Action Navigation Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onOpenModalTab(order, 'discussion')}
            className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Conversa ({order.messageCount || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModalTab(order, 'planning')}
            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Wrench className="w-3 h-3" />
            <span>Planejamento</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModalTab(order, 'timeline')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Activity className="w-3 h-3" />
            <span>Linha do Tempo</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModalTab(order, 'overview')}
            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition-colors shadow-sm"
          >
            <span>Ver Completo</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 3 Quick Overview Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Col 1: Tempo Ativo & Execução */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-bold flex items-center space-x-1.5 text-white">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Tempo Ativo & SLA</span>
            </span>
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${activeTime.slaBadgeColor}`}>
              {activeTime.slaLabel}
            </span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-black font-mono text-white">{activeTime.durationText}</span>
            <span className="text-[10px] text-slate-400">
              {activeTime.isCompleted ? 'total acumulado' : 'ativo em andamento'}
            </span>
          </div>

          <div className="text-[10px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Data de Início:</span>
              <span className="text-slate-200 font-mono">
                {order.actualStartDate || order.createdAt.split('T')[0]}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Previsão de Término:</span>
              <span className={`font-mono ${activeTime.isDelayed ? 'text-red-400 font-bold' : 'text-slate-200'}`}>
                {order.scheduledEndDate || 'Não informada'}
              </span>
            </div>
          </div>
        </div>

        {/* Col 2: Planejamento Sintético */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-bold flex items-center space-x-1.5 text-white">
              <Wrench className="w-3.5 h-3.5 text-emerald-400" />
              <span>Planejamento Geral</span>
            </span>
            <span className="text-emerald-400 font-bold text-[10px]">
              {planning.overallProgressPercent}% concluído
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all"
              style={{ width: `${planning.overallProgressPercent}%` }}
            />
          </div>

          {/* Pills */}
          <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <span className="block text-[9px] text-slate-400">Serviços</span>
              <span className="font-bold text-white text-xs">
                {planning.servicesDone}/{planning.servicesCount}
              </span>
            </div>
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <span className="block text-[9px] text-slate-400">Mão de Obra</span>
              <span className="font-bold text-white text-xs">{planning.laborCount} téc.</span>
            </div>
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <span className="block text-[9px] text-slate-400">Peças</span>
              <span className="font-bold text-white text-xs">
                {planning.partsApplied}/{planning.partsCount}
              </span>
            </div>
          </div>
        </div>

        {/* Col 3: Conversa & Status Operacional */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span className="font-bold flex items-center space-x-1.5 text-white">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Diálogo & Execução</span>
              </span>
              {(order.pendingQuestionCount || 0) > 0 ? (
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                  {order.pendingQuestionCount} dúvida pendente
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">
                  {order.messageCount ? `${order.messageCount} mensagens` : 'Sem mensagens'}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-300 line-clamp-2 italic">
              {order.description || 'Nenhum detalhe adicional informado.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenModalTab(order, 'discussion')}
            className="w-full mt-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 text-[10px] font-semibold flex items-center justify-center space-x-1 cursor-pointer transition-colors"
          >
            <MessageSquare className="w-3 h-3 text-blue-400" />
            <span>Abrir Diálogo Superior ↔ Responsável</span>
          </button>
        </div>
      </div>
    </div>
  );
};
