import React, { useState } from 'react';
import { OrderEvent, WorkOrderStatusConfig } from '../../types';
import {
  Activity,
  Clock,
  ArrowRight,
  MessageSquare,
  Wrench,
  Boxes,
  CheckCircle,
  FileCheck,
  Shield,
  Filter,
} from 'lucide-react';

interface OrderTimelineTabProps {
  events: OrderEvent[];
  statuses: WorkOrderStatusConfig[];
  orderCreatedAt?: string;
}

export const OrderTimelineTab: React.FC<OrderTimelineTabProps> = ({
  events,
  statuses,
  orderCreatedAt,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'status' | 'dialogo' | 'planning'>('all');

  const filteredEvents = events.filter((evt) => {
    if (filterType === 'status') return evt.eventType === 'mudanca_status' || evt.eventType === 'criacao';
    if (filterType === 'dialogo') return evt.eventType === 'dialogo' || evt.eventType === 'comentario';
    if (filterType === 'planning') return evt.eventType === 'planejamento' || evt.eventType === 'servico' || evt.eventType === 'pecas';
    return true;
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'criacao':
        return { icon: Activity, bg: 'bg-blue-600', text: 'text-white' };
      case 'mudanca_status':
        return { icon: ArrowRight, bg: 'bg-purple-600', text: 'text-white' };
      case 'dialogo':
      case 'comentario':
        return { icon: MessageSquare, bg: 'bg-amber-600', text: 'text-white' };
      case 'planejamento':
      case 'servico':
        return { icon: Wrench, bg: 'bg-emerald-600', text: 'text-white' };
      case 'pecas':
        return { icon: Boxes, bg: 'bg-cyan-600', text: 'text-white' };
      case 'checklist':
      case 'inspecao':
      case 'aprovacao':
        return { icon: Shield, bg: 'bg-indigo-600', text: 'text-white' };
      default:
        return { icon: Clock, bg: 'bg-slate-700', text: 'text-slate-300' };
    }
  };

  const getRelativeTime = (timestamp: string) => {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d atrás`;
    if (diffHours > 0) return `${diffHours}h atrás`;
    if (diffMins > 0) return `${diffMins}m atrás`;
    return 'agora mesmo';
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 text-xs">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h4 className="font-bold text-white">Linha do Tempo & Trilha de Auditoria</h4>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
            {events.length} marcos registrados
          </span>
        </div>

        <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px]">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
              filterType === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('status')}
            className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
              filterType === 'status' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Status
          </button>
          <button
            type="button"
            onClick={() => setFilterType('dialogo')}
            className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
              filterType === 'dialogo' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Conversas
          </button>
          <button
            type="button"
            onClick={() => setFilterType('planning')}
            className={`px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
              filterType === 'planning' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Planejamento
          </button>
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredEvents.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs">
          Nenhum evento registrado nesta categoria.
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800 max-h-[56vh] overflow-y-auto pr-2">
          {filteredEvents.map((evt, idx) => {
            const iconCfg = getEventIcon(evt.eventType);
            const Icon = iconCfg.icon;

            return (
              <div key={evt.id || idx} className="relative group">
                {/* Node icon */}
                <div
                  className={`absolute -left-6 top-1 w-5 h-5 rounded-full ${iconCfg.bg} ${iconCfg.text} flex items-center justify-center shadow-md ring-4 ring-[#121826] transition-transform group-hover:scale-110`}
                >
                  <Icon className="w-2.5 h-2.5" />
                </div>

                {/* Card */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 transition-colors text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1 text-[10px]">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-white text-xs">{evt.userName}</span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase font-semibold text-[9px]">
                        {evt.eventType.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-slate-400 font-mono text-[10px]">
                      <span className="text-blue-400 font-semibold">{getRelativeTime(evt.timestamp)}</span>
                      <span>•</span>
                      <span>{new Date(evt.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  <p className="text-slate-300 text-xs leading-relaxed mt-1">{evt.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
