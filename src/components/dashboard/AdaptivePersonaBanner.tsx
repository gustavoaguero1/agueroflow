import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { ArrowUpRight } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { NavSection } from '../layout/AppLayout';
import {
  DASHBOARD_PERSONA_CATALOG,
  getAvailableDashboardPersonas,
  resolveDefaultDashboardPersona,
  type DashboardPersona,
} from '../../services/dashboardPersonaRules';

interface AdaptivePersonaBannerProps {
  onNavigate: (section: NavSection) => void;
  delayedOrdersCount: number;
  inProgressOrdersCount: number;
  pendingChecklistsCount: number;
  criticalItemsCount: number;
}

const fmtBrl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const AdaptivePersonaBanner: React.FC<AdaptivePersonaBannerProps> = ({
  onNavigate,
  delayedOrdersCount,
  inProgressOrdersCount,
  pendingChecklistsCount,
  criticalItemsCount,
}) => {
  const { organization, areaLevels, role, isMaster } = useAuth();
  const orgId = organization?.id || '';

  const availablePersonas = useMemo(
    () => getAvailableDashboardPersonas({ areaLevels, role, isMaster }),
    [areaLevels, role, isMaster],
  );
  const defaultPersona = useMemo(
    () => resolveDefaultDashboardPersona({ areaLevels, role, isMaster }),
    [areaLevels, role, isMaster],
  );

  const [persona, setPersona] = useState<DashboardPersona>(defaultPersona);

  useEffect(() => {
    if (!availablePersonas.includes(persona)) {
      setPersona(defaultPersona);
    }
  }, [availablePersonas, defaultPersona, persona]);

  const [finStats, setFinStats] = useState<{ openPayables: number; openReceivables: number; dueToday: number }>({
    openPayables: 0,
    openReceivables: 0,
    dueToday: 0,
  });
  const [compStats, setCompStats] = useState<{ openRcs: number; pendingPos: number; activeRes: number }>({
    openRcs: 0,
    pendingPos: 0,
    activeRes: 0,
  });
  const [rhStats, setRhStats] = useState<{ activeEmployees: number; expiringNrs: number }>({
    activeEmployees: 0,
    expiringNrs: 0,
  });

  useEffect(() => {
    if (!orgId) return;
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    if (persona === 'financeiro' || persona === 'gestao') {
      Promise.all([
        getDocs(query(collection(db, 'finance_payables'), where('orgId', '==', orgId), limit(200))).catch(() => null),
        getDocs(query(collection(db, 'finance_receivables'), where('orgId', '==', orgId), limit(200))).catch(() => null),
      ]).then(([pSnap, rSnap]) => {
        const pays = pSnap ? pSnap.docs.map((d) => d.data() as Record<string, any>) : [];
        const recs = rSnap ? rSnap.docs.map((d) => d.data() as Record<string, any>) : [];
        const openPayables = pays
          .filter((p) => p.status === 'aberto')
          .reduce((s, p) => s + (Number(p.saldoAberto ?? p.valor) || 0), 0);
        const openReceivables = recs
          .filter((r) => r.status === 'aberto')
          .reduce((s, r) => s + (Number(r.saldoAberto ?? r.valor) || 0), 0);
        const dueToday = pays.filter((p) => p.status === 'aberto' && String(p.vencimento || '').slice(0, 10) <= today).length;
        setFinStats({ openPayables, openReceivables, dueToday });
      });
    }

    if (persona === 'compras' || persona === 'gestao') {
      Promise.all([
        getDocs(query(collection(db, 'purchasing_requisitions'), where('organizationId', '==', orgId), limit(150))).catch(() => null),
        getDocs(query(collection(db, 'purchasing_orders'), where('organizationId', '==', orgId), limit(150))).catch(() => null),
        getDocs(query(collection(db, 'stock_reservations'), where('orgId', '==', orgId), where('status', '==', 'ativa'), limit(150))).catch(() => null),
      ]).then(([rcSnap, poSnap, resSnap]) => {
        const openRcs = rcSnap
          ? rcSnap.docs.filter((d) => ['pendente', 'em_cotacao'].includes(String(d.data().status || ''))).length
          : 0;
        const pendingPos = poSnap
          ? poSnap.docs.filter((d) => d.data().status !== 'cancelada' && !d.data().approvedAt).length
          : 0;
        setCompStats({ openRcs, pendingPos, activeRes: resSnap ? resSnap.size : 0 });
      });
    }

    if (persona === 'rh' || persona === 'gestao') {
      Promise.all([
        getDocs(query(collection(db, 'rh_employees'), where('orgId', '==', orgId), limit(250))).catch(() => null),
        getDocs(query(collection(db, 'safety_training_records'), where('orgId', '==', orgId), limit(250))).catch(() => null),
      ]).then(([eSnap, tSnap]) => {
        const activeEmployees = eSnap
          ? eSnap.docs.filter((d) => d.data().status !== 'desligado' && d.data().active !== false).length
          : 0;
        const expiringNrs = tSnap
          ? tSnap.docs.filter((d) => {
              const exp = String(d.data().expirationDate || d.data().validUntil || '').slice(0, 10);
              return Boolean(exp && exp <= in30Days);
            }).length
          : 0;
        setRhStats({ activeEmployees, expiringNrs });
      });
    }
  }, [orgId, persona]);

  const meta = DASHBOARD_PERSONA_CATALOG[persona];

  return (
    <div className="af-card rounded-[22px] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0071E3] dark:text-[#409CFF]">
            Painel Contextual por Perfil
          </span>
          <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mt-0.5">{meta.label}</h3>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">{meta.description}</p>
        </div>

        {availablePersonas.length > 1 && (
          <div className="af-seg rounded-xl p-1 inline-flex flex-wrap gap-0.5 text-xs">
            {availablePersonas.map((pId) => (
              <button
                key={pId}
                type="button"
                onClick={() => setPersona(pId)}
                className={`px-3 py-1.5 rounded-lg cursor-pointer ${
                  persona === pId ? 'af-seg-btn-active font-semibold' : 'af-seg-btn font-medium'
                }`}
              >
                {DASHBOARD_PERSONA_CATALOG[pId].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contextual Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {persona === 'campo' && (
          <>
            <button
              type="button"
              onClick={() => onNavigate('ordens')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>OS em Execução</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#409CFF] mt-1">
                {inProgressOrdersCount}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ordens')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>OS Atrasadas</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  delayedOrdersCount > 0 ? 'text-[#D70015] dark:text-[#FF453A]' : 'text-[#1D1D1F] dark:text-white'
                }`}
              >
                {delayedOrdersCount}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('checklists')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Checklists Pendentes</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-white mt-1">
                {pendingChecklistsCount}
              </p>
            </button>
          </>
        )}

        {persona === 'financeiro' && (
          <>
            <button
              type="button"
              onClick={() => onNavigate('financeiro-receber')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>A Receber em Aberto</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#1E7E34] dark:text-[#30D158] mt-1">
                {fmtBrl(finStats.openReceivables)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('financeiro-pagar')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>A Pagar em Aberto</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#B25000] dark:text-[#FF9F0A] mt-1">
                {fmtBrl(finStats.openPayables)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('financeiro-pagar')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Títulos Vencidos / Hoje</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  finStats.dueToday > 0 ? 'text-[#D70015] dark:text-[#FF453A]' : 'text-[#1D1D1F] dark:text-white'
                }`}
              >
                {finStats.dueToday}
              </p>
            </button>
          </>
        )}

        {persona === 'compras' && (
          <>
            <button
              type="button"
              onClick={() => onNavigate('compras-requisicoes')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>RCs Pendentes / Cotação</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#409CFF] mt-1">
                {compStats.openRcs}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('compras-pedidos')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>OCs Aguardando Alçada</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#B25000] dark:text-[#FF9F0A] mt-1">
                {compStats.pendingPos}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('estoque')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Reservas OS / Itens Críticos</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-white mt-1">
                {compStats.activeRes} / {criticalItemsCount}
              </p>
            </button>
          </>
        )}

        {persona === 'rh' && (
          <>
            <button
              type="button"
              onClick={() => onNavigate('rh-funcionarios')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Colaboradores Ativos</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#409CFF] mt-1">
                {rhStats.activeEmployees}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('obras')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>NRs Vencendo (&le; 30d)</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  rhStats.expiringNrs > 0 ? 'text-[#D70015] dark:text-[#FF453A]' : 'text-[#1E7E34] dark:text-[#30D158]'
                }`}
              >
                {rhStats.expiringNrs}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('rh-pendencias')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Auditoria Cadastral RH</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-sm font-semibold text-[#1D1D1F] dark:text-white mt-2">Abrir Pendências Legadas</p>
            </button>
          </>
        )}

        {persona === 'gestao' && (
          <>
            <button
              type="button"
              onClick={() => onNavigate('financeiro-receber')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>A Receber / A Pagar (Aberto)</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-sm font-bold font-mono tabular-nums text-[#1E7E34] dark:text-[#30D158] mt-1">
                {fmtBrl(finStats.openReceivables)}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#B25000] dark:text-[#FF9F0A]">
                Pagar: {fmtBrl(finStats.openPayables)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('compras-pedidos')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Suprimentos (RCs / Alçadas)</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#409CFF] mt-1">
                {compStats.openRcs} RCs · {compStats.pendingPos} OCs
              </p>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('relatorios')}
              className="text-left p-3.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] hover:opacity-90 transition cursor-pointer"
            >
              <div className="flex justify-between text-[#6E6E73] dark:text-[#98989D]">
                <span>Conformidade &amp; Resultado</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <p className="text-sm font-bold font-mono tabular-nums text-[#1D1D1F] dark:text-white mt-1">
                {rhStats.activeEmployees} colab. · {rhStats.expiringNrs} NR(s) críticas
              </p>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
