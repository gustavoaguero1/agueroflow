import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  WorkOrder,
  Occurrence,
  StockBalance,
  Item,
  Inspection,
  ChecklistRun,
  Team,
  CostCenter,
} from '../types';
import {
  ClipboardList,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Plus,
  Filter,
  TrendingUp,
  RotateCcw,
  Calendar,
  Lock,
  EyeOff,
  User,
  ShieldCheck,
  RefreshCw,
  XCircle,
  FileCheck,
  Building2,
} from 'lucide-react';
import { NavSection } from '../components/layout/AppLayout';
import { PendingCenter } from '../components/dashboard/PendingCenter';
import { todaySaoPaulo } from '../services/pendingService';

// Used until the org has configured work_order_statuses.
const FALLBACK_COMPLETED = ['concluido', 'validado', 'concluida', 'encerrada'];
const completedFrom = (cfg: { id: string; isCompleted?: boolean }[]) =>
  cfg.length ? cfg.filter((c) => c.isCompleted).map((c) => c.id) : FALLBACK_COMPLETED;

interface DashboardModuleProps {
  onNavigate: (section: NavSection) => void;
}

type PeriodFilterType =
  | 'todos'
  | 'hoje'
  | '7dias'
  | '30dias'
  | 'mes_atual'
  | 'mes_anterior'
  | 'ano_atual'
  | 'personalizado';

export const DashboardModule: React.FC<DashboardModuleProps> = ({ onNavigate }) => {
  const {
    organization,
    canViewFinancials,
    selectedUnitId: globalUnitId,
    selectedContractId: globalContractId,
    units,
    contracts,
  } = useAuth();

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [checklistRuns, setChecklistRuns] = useState<ChecklistRun[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState<string[]>(FALLBACK_COMPLETED);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterType>('todos');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [unitFilter, setUnitFilter] = useState<string>('todas');
  const [contractFilter, setContractFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todas');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [teamFilter, setTeamFilter] = useState<string>('todas');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('todos');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('');

  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [onlyRework, setOnlyRework] = useState(false);
  const [onlyPendingChecklist, setOnlyPendingChecklist] = useState(false);

  // Sync with global header filters
  useEffect(() => {
    if (globalUnitId) setUnitFilter(globalUnitId);
  }, [globalUnitId]);

  useEffect(() => {
    if (globalContractId) setContractFilter(globalContractId);
  }, [globalContractId]);

  useEffect(() => {
    if (!organization) return;

    const unsubWO = onSnapshot(
      query(collection(db, 'work_orders'), where('orgId', '==', organization.id)),
      (snap) => setWorkOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)))
    );

    const unsubOcc = onSnapshot(
      query(collection(db, 'occurrences'), where('orgId', '==', organization.id)),
      (snap) => setOccurrences(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Occurrence)))
    );

    const unsubStock = onSnapshot(
      query(collection(db, 'stock_balances'), where('orgId', '==', organization.id)),
      (snap) => setStockBalances(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockBalance)))
    );

    const unsubItems = onSnapshot(
      query(collection(db, 'items'), where('orgId', '==', organization.id)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Item)))
    );

    const unsubInsp = onSnapshot(
      query(collection(db, 'inspections'), where('orgId', '==', organization.id)),
      (snap) => setInspections(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Inspection)))
    );

    const unsubRuns = onSnapshot(
      query(collection(db, 'checklist_runs'), where('orgId', '==', organization.id)),
      (snap) => setChecklistRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistRun)))
    );

    const unsubTeams = onSnapshot(
      query(collection(db, 'teams'), where('orgId', '==', organization.id)),
      (snap) => setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Team)))
    );

    const unsubCC = onSnapshot(
      query(collection(db, 'cost_centers'), where('orgId', '==', organization.id)),
      (snap) => setCostCenters(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenter)))
    );

    const unsubStatuses = onSnapshot(
      query(collection(db, 'work_order_statuses'), where('orgId', '==', organization.id)),
      (snap) => setCompletedIds(completedFrom(snap.docs.map((d) => ({ id: d.id.replace(`${organization.id}_`, ''), ...d.data() } as { id: string; isCompleted?: boolean }))))
    );

    setLoading(false);

    return () => {
      unsubStatuses();
      unsubWO();
      unsubOcc();
      unsubStock();
      unsubItems();
      unsubInsp();
      unsubRuns();
      unsubTeams();
      unsubCC();
    };
  }, [organization]);

  const handleClearFilters = () => {
    setPeriodFilter('todos');
    setCustomStartDate('');
    setCustomEndDate('');
    setUnitFilter('todas');
    setContractFilter('todos');
    setStatusFilter('todos');
    setPriorityFilter('todas');
    setTypeFilter('todos');
    setTeamFilter('todas');
    setCostCenterFilter('todos');
    setResponsibleFilter('');
    setOnlyDelayed(false);
    setOnlyRework(false);
    setOnlyPendingChecklist(false);
  };

  // Filtered dataset
  const filteredOrders = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();

    return workOrders.filter((wo) => {
      // Unit filter
      if (unitFilter !== 'todas' && wo.unitId !== unitFilter) return false;

      // Contract filter
      if (contractFilter !== 'todos' && wo.contractId !== contractFilter) return false;

      // Status filter
      if (statusFilter !== 'todos' && wo.status !== statusFilter) return false;

      // Priority filter
      if (priorityFilter !== 'todas' && wo.priority !== priorityFilter) return false;

      // Type filter
      if (typeFilter !== 'todos' && wo.type !== typeFilter && wo.orderType !== typeFilter) return false;

      // Team filter
      if (teamFilter !== 'todas' && wo.assignedTeam !== teamFilter) return false;

      // Cost center filter
      if (costCenterFilter !== 'todos' && wo.costCenterId !== costCenterFilter) return false;

      // Responsible filter
      if (responsibleFilter.trim() && !wo.assignedTo?.toLowerCase().includes(responsibleFilter.toLowerCase())) {
        return false;
      }

      // Rework filter
      if (onlyRework && !wo.isRework) return false;

      // Pending checklist filter
      if (onlyPendingChecklist && wo.checklistStatus !== 'pendente') return false;

      // Delayed filter
      if (onlyDelayed) {
        if (!wo.scheduledEndDate) return false;
        if (wo.status === 'concluida' || wo.status === 'encerrada') return false;
        if (wo.scheduledEndDate >= today) return false;
      }

      // Period filter
      if (periodFilter !== 'todos' && wo.createdAt) {
        const createdDate = wo.createdAt.split('T')[0];
        const createdTime = new Date(wo.createdAt).getTime();

        if (periodFilter === 'hoje') {
          if (createdDate !== today) return false;
        } else if (periodFilter === '7dias') {
          if (now - createdTime > 7 * 24 * 3600 * 1000) return false;
        } else if (periodFilter === '30dias') {
          if (now - createdTime > 30 * 24 * 3600 * 1000) return false;
        } else if (periodFilter === 'mes_atual') {
          const currentMonth = today.slice(0, 7);
          if (!createdDate.startsWith(currentMonth)) return false;
        } else if (periodFilter === 'mes_anterior') {
          const d = new Date();
          d.setMonth(d.getMonth() - 1);
          const prevMonth = d.toISOString().slice(0, 7);
          if (!createdDate.startsWith(prevMonth)) return false;
        } else if (periodFilter === 'ano_atual') {
          const currentYear = today.slice(0, 4);
          if (!createdDate.startsWith(currentYear)) return false;
        } else if (periodFilter === 'personalizado') {
          if (customStartDate && createdDate < customStartDate) return false;
          if (customEndDate && createdDate > customEndDate) return false;
        }
      }

      return true;
    });
  }, [
    workOrders,
    unitFilter,
    contractFilter,
    statusFilter,
    priorityFilter,
    typeFilter,
    teamFilter,
    costCenterFilter,
    responsibleFilter,
    onlyRework,
    onlyDelayed,
    onlyPendingChecklist,
    periodFilter,
    customStartDate,
    customEndDate,
  ]);

  // Operational KPIs
  const totalOrders = filteredOrders.length;
  const unplannedOrders = filteredOrders.filter((wo) => wo.status === 'rascunho').length;
  const plannedOrders = filteredOrders.filter((wo) => wo.status === 'planejada' || wo.status === 'agendada').length;
  const inProgressOrders = filteredOrders.filter((wo) => wo.status === 'em_execucao').length;
  const pausedOrders = filteredOrders.filter((wo) => wo.status === 'pausada').length;
  const completedOrders = filteredOrders.filter((wo) => completedIds.includes(wo.status)).length;
  const canceledOrders = filteredOrders.filter((wo) => (wo.status as any) === 'cancelada').length;

  const todayStr = todaySaoPaulo();
  const delayedOrdersCount = filteredOrders.filter(
    (wo) => wo.scheduledEndDate && wo.scheduledEndDate < todayStr && !completedIds.includes(wo.status)
  ).length;

  const pendingChecklistsCount = filteredOrders.filter((wo) => wo.checklistStatus === 'pendente').length;

  const reworkCount = filteredOrders.filter((wo) => wo.isRework).length;
  const reworkRate = totalOrders > 0 ? ((reworkCount / totalOrders) * 100).toFixed(1) : '0.0';

  const plannedHours = filteredOrders.reduce((sum, wo) => sum + (wo.estimatedHours || 0), 0);
  const actualHours = filteredOrders.reduce((sum, wo) => sum + (wo.actualHours || 0), 0);

  // Financial total
  const totalCost = filteredOrders.reduce((sum, wo) => sum + (wo.estimatedCost || 0), 0);

  // Occurrences in scope
  const filteredOccurrences = occurrences.filter((occ) => {
    if (unitFilter !== 'todas' && occ.unitId !== unitFilter) return false;
    return true;
  });
  const openOccurrences = filteredOccurrences.filter(
    (occ) => occ.status !== 'fechada' && occ.status !== 'verificacao'
  ).length;

  // Pending inspections in scope
  const pendingInspectionsCount = inspections.filter((i) => {
    if (unitFilter !== 'todas' && i.unitId !== unitFilter) return false;
    return i.result === 'pendente' || i.result === 'nao_conforme';
  }).length;

  // Stock alerts in scope
  const criticalItemsCount = stockBalances.filter((bal) => {
    const item = items.find((i) => i.id === bal.itemId);
    if (!item || item.criticalStock === undefined) return false;
    if (unitFilter !== 'todas' && bal.unitId !== unitFilter) return false;
    return bal.currentBalance <= item.criticalStock;
  }).length;

  return (
    <div className="space-y-6">
      <PendingCenter onNavigate={onNavigate} workOrders={workOrders} completedStatusIds={completedIds} />

      {/* Top Banner & Comprehensive Filter Bar */}
      <div className="bg-white dark:bg-[#1C1C1E] p-5 sm:p-6 rounded-[22px] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.025)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] tracking-[-0.02em]">
              Painel Operacional
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
              Indicadores consolidados em tempo real de {organization?.name || 'sua empresa'}.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-black/[0.045] hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-[#424245] dark:text-[#D1D1D6] text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar Filtros</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ordens')}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold shadow-[0_1px_3px_rgba(0,113,227,0.28)] transition-all cursor-pointer whitespace-nowrap apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Demanda / OS</span>
            </button>
          </div>
        </div>

        {/* Primary Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] text-xs">
          <div>
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] font-medium mb-1">Período</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none"
            >
              <option value="todos">Todo o Histórico</option>
              <option value="hoje">Hoje</option>
              <option value="7dias">Últimos 7 dias</option>
              <option value="30dias">Últimos 30 dias</option>
              <option value="mes_atual">Mês Atual</option>
              <option value="mes_anterior">Mês Anterior</option>
              <option value="ano_atual">Ano Atual</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] font-medium mb-1">Unidade</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none"
            >
              <option value="todas">Todas as Unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] font-medium mb-1">Contrato</label>
            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none"
            >
              <option value="todos">Todos os Contratos</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] font-medium mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none"
            >
              <option value="todos">Todos os Status</option>
              <option value="rascunho">Rascunho</option>
              <option value="planejada">Planejada</option>
              <option value="agendada">Agendada</option>
              <option value="em_execucao">Em Execução</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluída</option>
              <option value="encerrada">Encerrada</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] font-medium mb-1">Tipo de Demanda</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none"
            >
              <option value="todos">Todos os Tipos</option>
              <option value="preventiva">Preventiva</option>
              <option value="corretiva">Corretiva</option>
              <option value="emergencial">Emergencial</option>
              <option value="solicitacao">Solicitação</option>
              <option value="instalacao">Instalação</option>
              <option value="atendimento">Atendimento</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] font-medium mb-1">Equipe</label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-[#F5F5F7] focus:outline-none"
            >
              <option value="todas">Todas as Equipes</option>
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Period Date Range Pickers */}
        {periodFilter === 'personalizado' && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <div>
              <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] mb-1">Data Início</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] mb-1">Data Fim</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-xs"
              />
            </div>
          </div>
        )}

        {/* Quick Filter Toggles */}
        <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-[#424245] dark:text-[#AEAEB2]">
          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyDelayed}
              onChange={(e) => setOnlyDelayed(e.target.checked)}
              className="rounded border-black/20 text-[#D70015] focus:ring-0"
            />
            <span className={onlyDelayed ? 'text-[#D70015] dark:text-[#FF453A] font-semibold' : ''}>
              Apenas Demandas Atrasadas
            </span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyRework}
              onChange={(e) => setOnlyRework(e.target.checked)}
              className="rounded border-black/20 text-[#B25000] focus:ring-0"
            />
            <span className={onlyRework ? 'text-[#B25000] dark:text-[#FF9F0A] font-semibold' : ''}>
              Apenas Retrabalhos
            </span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyPendingChecklist}
              onChange={(e) => setOnlyPendingChecklist(e.target.checked)}
              className="rounded border-black/20 text-[#0071E3] focus:ring-0"
            />
            <span className={onlyPendingChecklist ? 'text-[#0071E3] dark:text-[#409CFF] font-semibold' : ''}>
              Checklists Pendentes
            </span>
          </label>
        </div>
      </div>

      {/* Primary Operational KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-4 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Total de OS</span>
          <p className="text-2xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mt-1.5 tabular-nums tracking-[-0.02em]">
            {totalOrders}
          </p>
          <span className="text-[11px] text-[#86868B] tabular-nums">{unplannedOrders} não programadas</span>
        </div>

        <div className="p-4 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Planejadas</span>
          <p className="text-2xl font-bold text-[#B25000] dark:text-[#FF9F0A] mt-1.5 tabular-nums tracking-[-0.02em]">
            {plannedOrders}
          </p>
          <span className="text-[11px] text-[#86868B]">Aguardando início</span>
        </div>

        <div className="p-4 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Em Execução</span>
          <p className="text-2xl font-bold text-[#0071E3] dark:text-[#409CFF] mt-1.5 tabular-nums tracking-[-0.02em]">
            {inProgressOrders}
          </p>
          <span className="text-[11px] text-[#86868B] tabular-nums">{pausedOrders} pausadas</span>
        </div>

        <div className="p-4 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Concluídas</span>
          <p className="text-2xl font-bold text-[#1E7E34] dark:text-[#30D158] mt-1.5 tabular-nums tracking-[-0.02em]">
            {completedOrders}
          </p>
          <span className="text-[11px] text-[#86868B] tabular-nums">
            {totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0}% de resolução
          </span>
        </div>

        <div className="p-4 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Atrasadas</span>
          <p
            className={`text-2xl font-bold mt-1.5 tabular-nums tracking-[-0.02em] ${
              delayedOrdersCount > 0
                ? 'text-[#D70015] dark:text-[#FF453A]'
                : 'text-[#1D1D1F] dark:text-[#F5F5F7]'
            }`}
          >
            {delayedOrdersCount}
          </p>
          <span className="text-[11px] text-[#86868B]">Prazo expirado</span>
        </div>

        <div className="p-4 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Ocorrências</span>
          <p className="text-2xl font-bold text-[#B25000] dark:text-[#FF9F0A] mt-1.5 tabular-nums tracking-[-0.02em]">
            {openOccurrences}
          </p>
          <span className="text-[11px] text-[#86868B] tabular-nums">{criticalItemsCount} estoque crítico</span>
        </div>
      </div>

      {/* Secondary Operational Metrics & Financials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Horas de Execução</span>
            <div className="mt-1.5 flex items-baseline space-x-2.5 tabular-nums">
              <div>
                <p className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">{plannedHours}h</p>
                <span className="text-[11px] text-[#86868B]">Estimadas</span>
              </div>
              <span className="text-[#86868B]">/</span>
              <div>
                <p className="text-xl font-bold text-[#0071E3] dark:text-[#409CFF]">{actualHours}h</p>
                <span className="text-[11px] text-[#86868B]">Realizadas</span>
              </div>
            </div>
          </div>
          <Clock className="w-6 h-6 text-[#86868B]/40 shrink-0" />
        </div>

        <div className="p-5 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Índice de Retrabalho</span>
            <p className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mt-1.5 tabular-nums">{reworkRate}%</p>
            <span className="text-[11px] text-[#86868B] tabular-nums">{reworkCount} ordens marcadas</span>
          </div>
          <AlertTriangle className="w-6 h-6 text-[#B25000]/35 dark:text-[#FF9F0A]/40 shrink-0" />
        </div>

        <div className="p-5 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Checklists & Inspeções</span>
            <p className="text-xl font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mt-1.5 tabular-nums">
              {pendingChecklistsCount + pendingInspectionsCount}
            </p>
            <span className="text-[11px] text-[#86868B] tabular-nums">
              {pendingChecklistsCount} checklists · {pendingInspectionsCount} vistorias
            </span>
          </div>
          <FileCheck className="w-6 h-6 text-[#1E7E34]/35 dark:text-[#30D158]/40 shrink-0" />
        </div>

        <div className="p-5 rounded-[20px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center justify-between">
          {canViewFinancials ? (
            <div>
              <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium">Custo Estimado</span>
              <p className="text-xl font-bold text-[#1E7E34] dark:text-[#30D158] mt-1.5 tabular-nums">
                R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[11px] text-[#86868B]">Demandas no escopo</span>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs text-[#6E6E73] dark:text-[#98989D] font-medium flex items-center space-x-1.5">
                <EyeOff className="w-3.5 h-3.5" />
                <span>Gestão Financeira</span>
              </span>
              <p className="text-xs font-semibold text-[#86868B]">Oculto neste perfil</p>
            </div>
          )}
          <TrendingUp className="w-6 h-6 text-[#1E7E34]/35 dark:text-[#30D158]/40 shrink-0" />
        </div>
      </div>

      {/* Main Grid: Recent Work Orders & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-[22px] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">Demandas Recentes</h3>
              <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5 tabular-nums">
                {filteredOrders.length} {filteredOrders.length === 1 ? 'demanda no filtro ativo' : 'demandas nos filtros ativos'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ordens')}
              className="text-xs text-[#0071E3] dark:text-[#409CFF] hover:underline font-semibold cursor-pointer inline-flex items-center space-x-1"
            >
              <span>Ver todas</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-[#F5F5F7] dark:bg-[#2C2C2E]/60 text-[#6E6E73] dark:text-[#98989D] text-xs">
              <ClipboardList className="w-8 h-8 text-[#86868B] mx-auto mb-2 opacity-60" />
              <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                Nenhuma demanda localizada para os filtros selecionados.
              </p>
              <p className="text-xs text-[#86868B] mt-1">
                Ajuste os filtros ou cadastre uma nova ordem de serviço.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {filteredOrders.slice(0, 6).map((wo) => {
                const isDelayed =
                  wo.scheduledEndDate &&
                  wo.scheduledEndDate < todayStr &&
                  wo.status !== 'concluida' &&
                  wo.status !== 'encerrada';

                return (
                  <div
                    key={wo.id}
                    onClick={() => onNavigate('ordens')}
                    className="py-3.5 first:pt-0 last:pb-0 hover:bg-[#F5F5F7]/70 dark:hover:bg-white/[0.03] -mx-3 px-3 rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#0071E3] dark:text-[#409CFF]">
                          {wo.orderNumber}
                        </span>
                        <span className="text-[#86868B]">·</span>
                        <span
                          className={`text-[11px] font-semibold capitalize ${
                            wo.priority === 'critica'
                              ? 'text-[#D70015] dark:text-[#FF453A]'
                              : wo.priority === 'alta'
                              ? 'text-[#B25000] dark:text-[#FF9F0A]'
                              : 'text-[#6E6E73] dark:text-[#98989D]'
                          }`}
                        >
                          Prioridade {wo.priority}
                        </span>
                        {wo.isRework && (
                          <span className="text-[11px] font-semibold text-[#B25000] dark:text-[#FF9F0A]">
                            · Retrabalho
                          </span>
                        )}
                        {isDelayed && (
                          <span className="text-[11px] font-semibold text-[#D70015] dark:text-[#FF453A]">
                            · Atrasada
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">
                        {wo.title}
                      </p>
                      <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">
                        {wo.assignedTeam || 'Sem equipe'} · Previsão: {wo.scheduledStartDate || '—'}
                      </p>
                    </div>

                    <div className="sm:shrink-0">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize ${
                          wo.status === 'em_execucao'
                            ? 'bg-[#EBF5FF] dark:bg-[#0A84FF]/15 text-[#0066CC] dark:text-[#409CFF]'
                            : wo.status === 'concluida' || wo.status === 'encerrada'
                            ? 'bg-[#E8F8EE] dark:bg-[#30D158]/15 text-[#1E7E34] dark:text-[#30D158]'
                            : 'bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#424245] dark:text-[#D1D1D6]'
                        }`}
                      >
                        {wo.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-[22px] p-6">
            <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7] mb-4">
              Distribuição por Status
            </h3>
            <div className="space-y-3.5 text-xs">
              {[
                { label: 'Em Execução', count: inProgressOrders, color: 'bg-[#0071E3]' },
                { label: 'Planejadas / Agendadas', count: plannedOrders, color: 'bg-[#FF9500]' },
                { label: 'Concluídas', count: completedOrders, color: 'bg-[#34C759]' },
                { label: 'Rascunhos', count: unplannedOrders, color: 'bg-[#8E8E93]' },
              ].map((st) => {
                const pct = totalOrders > 0 ? Math.round((st.count / totalOrders) * 100) : 0;
                return (
                  <div key={st.label} className="space-y-1.5">
                    <div className="flex justify-between text-[#424245] dark:text-[#D1D1D6]">
                      <span className="font-medium">{st.label}</span>
                      <span className="font-mono text-[#6E6E73] dark:text-[#98989D] tabular-nums">
                        {st.count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
                      <div className={`${st.color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-[22px] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">Ocorrências Ativas</h3>
              <button
                type="button"
                onClick={() => onNavigate('ocorrencias')}
                className="text-xs text-[#0071E3] dark:text-[#409CFF] hover:underline font-semibold cursor-pointer"
              >
                Ver todas
              </button>
            </div>

            {filteredOccurrences.length === 0 ? (
              <p className="text-xs text-[#86868B] py-4 text-center">
                Nenhuma ocorrência registrada no escopo.
              </p>
            ) : (
              <div className="space-y-2.5">
                {filteredOccurrences.slice(0, 3).map((occ) => (
                  <div
                    key={occ.id}
                    className="p-3 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] text-xs"
                  >
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="font-semibold text-[#B25000] dark:text-[#FF9F0A] capitalize">
                        {occ.type}
                      </span>
                      <span className="text-[#86868B] capitalize">{occ.urgency}</span>
                    </div>
                    <p className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] line-clamp-1">
                      {occ.title}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
