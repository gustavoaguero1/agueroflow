import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { NavSection } from './AppLayout';
import {
  buildActionableNotifications,
  type ActionableNotification,
} from '../../services/actionableNotifications';

interface NotificationsBellProps {
  onNavigate: (section: NavSection) => void;
}

export const NotificationsBell: React.FC<NotificationsBellProps> = ({ onNavigate }) => {
  const { organization, areaLevels, isMaster } = useAuth();
  const orgId = organization?.id || '';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActionableNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const safe = async (coll: string, field: 'orgId' | 'organizationId' = 'orgId') => {
        try {
          const snap = await getDocs(query(collection(db, coll), where(field, '==', orgId), limit(150)));
          return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }));
        } catch {
          return [];
        }
      };

      const can = (area: keyof typeof areaLevels) => isMaster || Number(areaLevels[area] ?? 0) >= 1;

      const [workOrders, safetyPermitStates, assets, trainingRecords, purchaseOrders, bulletins, supportTickets] =
        await Promise.all([
          can('operacoes') ? safe('work_orders') : Promise.resolve([]),
          can('operacoes') ? safe('safety_permit_states') : Promise.resolve([]),
          can('operacoes') ? safe('assets') : Promise.resolve([]),
          can('rh') || can('operacoes') ? safe('safety_training_records') : Promise.resolve([]),
          can('estoque') ? safe('purchasing_orders', 'organizationId') : Promise.resolve([]),
          can('operacoes') ? safe('measurement_bulletins') : Promise.resolve([]),
          safe('support_tickets'),
        ]);

      setItems(
        buildActionableNotifications({
          areaLevels,
          isMaster,
          todayIso: new Date().toISOString().slice(0, 10),
          workOrders,
          safetyPermitStates,
          assets,
          trainingRecords,
          purchaseOrders,
          bulletins,
          supportTickets,
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [orgId, isMaster]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const totalAlerts = useMemo(() => items.reduce((sum, it) => sum + it.count, 0), [items]);
  const hasCritical = items.some((i) => i.severity === 'critical');

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadNotifications();
        }}
        title="Central de Pendências Acionáveis"
        aria-label="Central de Pendências Acionáveis"
        className="relative inline-flex items-center justify-center p-2 rounded-xl af-btn-glass cursor-pointer"
      >
        <Bell className="w-4 h-4 text-[#424245] dark:text-[#D1D1D6]" />
        {totalAlerts > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center tabular-nums ${
              hasCritical ? 'bg-[#D70015]' : 'bg-[#0071E3]'
            }`}
          >
            {totalAlerts > 99 ? '99+' : totalAlerts}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 af-glass-strong rounded-2xl overflow-hidden text-xs">
          <div className="px-4 py-3 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#1D1D1F] dark:text-white">Pendências Acionáveis</p>
              <p className="text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                Filtradas automaticamente pelas suas permissões.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="p-1.5 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-[#6E6E73] cursor-pointer"
              title="Atualizar pendências"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {items.length === 0 ? (
              <div className="py-8 text-center text-[#6E6E73] dark:text-[#98989D] space-y-1.5">
                <CheckCircle2 className="w-6 h-6 mx-auto text-[#1E7E34] dark:text-[#30D158]" />
                <p className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">Nenhuma pendência crítica no momento</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onNavigate(n.targetSection);
                    setOpen(false);
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-start justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                        n.severity === 'critical'
                          ? 'bg-[#D70015] af-live-dot'
                          : n.severity === 'warning'
                          ? 'bg-[#FF9F0A]'
                          : 'bg-[#0071E3]'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate flex items-center gap-1.5">
                        {n.severity === 'critical' && <AlertTriangle className="w-3 h-3 text-[#D70015] shrink-0" />}
                        <span>{n.title}</span>
                      </p>
                      <p className="text-[11px] text-[#6E6E73] dark:text-[#98989D] mt-0.5 leading-snug">{n.detail}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#86868B] shrink-0 mt-0.5" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
