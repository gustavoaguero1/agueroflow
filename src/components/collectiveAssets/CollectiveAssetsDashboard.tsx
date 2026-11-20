import React, { useState, useMemo } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetCategory,
  CollectiveAssetMovement,
  CollectiveAssetService,
  CollectiveAssetPolicy,
} from '../../types/collectiveAssets';
import {
  LayoutDashboard,
  Boxes,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Wrench,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
} from 'lucide-react';

interface CollectiveAssetsDashboardProps {
  assets: CollectiveAsset[];
  categories: CollectiveAssetCategory[];
  movements: CollectiveAssetMovement[];
  services: CollectiveAssetService[];
  policy?: CollectiveAssetPolicy;
  onOpenAssetDetail: (asset: CollectiveAsset) => void;
  onOpenPolicyModal: () => void;
  onNavigateToTab: (tabId: string) => void;
}

export const CollectiveAssetsDashboard: React.FC<CollectiveAssetsDashboardProps> = ({
  assets,
  categories,
  movements,
  services,
  policy,
  onOpenAssetDetail,
  onOpenPolicyModal,
  onNavigateToTab,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. KPI Calculations (Exact formulas from user specifications)
  const kpis = useMemo(() => {
    const totalBens = assets.length;
    const disponiveis = assets.filter((a) => a.situation === 'DISPONIVEL').length;
    const emUso = assets.filter((a) => a.situation === 'EM_USO').length;
    const emManutencao = assets.filter((a) => a.situation === 'EM_MANUTENCAO').length;
    const bloqueados = assets.filter((a) => a.situation === 'BLOQUEADO').length;
    const baixados = assets.filter((a) => a.situation === 'BAIXADO').length;

    // Movimentações de hoje
    const retiradasHoje = movements.filter((m) => m.checkoutDate.startsWith(todayStr)).length;
    const devolucoesHoje = movements.filter((m) => m.returnDate && m.returnDate.startsWith(todayStr)).length;
    const retiradasHojeSemDevolucao = movements.filter(
      (m) => m.checkoutDate.startsWith(todayStr) && !m.returnDate
    ).length;

    // Empréstimos atrasados (saída em data anterior a hoje e sem devolução)
    const emprestimosAtrasados = movements.filter((m) => {
      if (m.returnDate) return false;
      const moveDate = m.checkoutDate.split('T')[0];
      return moveDate < todayStr;
    }).length;

    // Devoluções com condição diferente de OK (danificado, faltando acessório, precisa manutenção)
    const devolucoesComAvaria = movements.filter(
      (m) => m.returnDate && m.returnCondition && m.returnCondition !== 'ok'
    ).length;

    // Status de Alertas
    const vencidos = assets.filter((a) => a.alert === 'VENCIDO').length;
    const aVencer = assets.filter((a) => a.alert === 'A_VENCER').length;
    const semData = assets.filter((a) => a.alert === 'SEM_DATA').length;
    const emDia = assets.filter((a) => a.alert === 'EM_DIA').length;
    const naoAplicaveis = assets.filter((a) => a.alert === 'NAO_APLICAVEL').length;

    return {
      totalBens,
      disponiveis,
      emUso,
      emManutencao,
      bloqueados,
      baixados,
      retiradasHoje,
      devolucoesHoje,
      retiradasHojeSemDevolucao,
      emprestimosAtrasados,
      devolucoesComAvaria,
      vencidos,
      aVencer,
      semData,
      emDia,
      naoAplicaveis,
    };
  }, [assets, movements, todayStr]);

  // 2. Resumo por Categoria (Sem limite de 8 categorias, sem dupla contagem)
  // Cada bem é alocado exatamente em 1 estado de situação principal
  const categorySummary = useMemo(() => {
    return categories.map((cat) => {
      const catAssets = assets.filter((a) => a.categoryId === cat.id);
      const total = catAssets.length;
      const disponivel = catAssets.filter((a) => a.situation === 'DISPONIVEL').length;
      const emUso = catAssets.filter((a) => a.situation === 'EM_USO').length;
      const vencidoBloqueado = catAssets.filter((a) => a.situation === 'BLOQUEADO').length;
      const emManutencao = catAssets.filter((a) => a.situation === 'EM_MANUTENCAO').length;
      const baixado = catAssets.filter((a) => a.situation === 'BAIXADO').length;
      const naoAplicavel = catAssets.filter((a) => a.alert === 'NAO_APLICAVEL').length;

      return {
        id: cat.id,
        name: cat.name,
        active: cat.active,
        total,
        disponivel,
        emUso,
        vencidoBloqueado,
        emManutencao,
        baixado,
        naoAplicavel,
      };
    });
  }, [categories, assets]);

  // 3. Lista completa, pesquisável, filtrável e paginada de Alertas
  // Ordenados prioritariamente por: Vencidos -> A vencer -> Sem data registrada
  const [alertSearch, setAlertSearch] = useState('');
  const [alertCategoryFilter, setAlertCategoryFilter] = useState('todas');
  const [alertStatusFilter, setAlertStatusFilter] = useState('todos_alertas'); // todos_alertas | VENCIDO | A_VENCER | SEM_DATA
  const [alertUnitFilter, setAlertUnitFilter] = useState('todas');
  const [alertPage, setAlertPage] = useState(1);
  const itemsPerPage = 10;

  const filteredAlertAssets = useMemo(() => {
    return assets
      .filter((a) => {
        // Mostra bens que possuem alerta ativo ou que estão sob monitoramento
        if (alertStatusFilter === 'todos_alertas') {
          if (a.alert !== 'VENCIDO' && a.alert !== 'A_VENCER' && a.alert !== 'SEM_DATA') {
            return false;
          }
        } else if (alertStatusFilter !== 'todos') {
          if (a.alert !== alertStatusFilter) return false;
        }

        if (alertCategoryFilter !== 'todas' && a.categoryId !== alertCategoryFilter) {
          return false;
        }

        if (alertUnitFilter !== 'todas' && a.unitId && a.unitId !== alertUnitFilter) {
          return false;
        }

        if (alertSearch.trim()) {
          const q = alertSearch.toLowerCase();
          const matchCode = a.code.toLowerCase().includes(q);
          const matchDesc = a.description.toLowerCase().includes(q);
          const matchSerial = (a.serialNumber || '').toLowerCase().includes(q);
          const matchLoc = (a.storageLocation || '').toLowerCase().includes(q);
          if (!matchCode && !matchDesc && !matchSerial && !matchLoc) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Prioridade: VENCIDO (1) -> A_VENCER (2) -> SEM_DATA (3) -> outros (4)
        const priorityOrder: Record<string, number> = {
          VENCIDO: 1,
          A_VENCER: 2,
          SEM_DATA: 3,
          EM_DIA: 4,
          NAO_APLICAVEL: 5,
        };
        const pA = priorityOrder[a.alert || 'NAO_APLICAVEL'] || 99;
        const pB = priorityOrder[b.alert || 'NAO_APLICAVEL'] || 99;
        if (pA !== pB) return pA - pB;

        // Se ambos forem vencidos ou a vencer, ordena pelo menor diasRestantes
        if (a.daysRemaining !== null && b.daysRemaining !== null) {
          return (a.daysRemaining || 0) - (b.daysRemaining || 0);
        }
        return a.code.localeCompare(b.code);
      });
  }, [assets, alertSearch, alertCategoryFilter, alertStatusFilter, alertUnitFilter]);

  const totalAlertPages = Math.ceil(filteredAlertAssets.length / itemsPerPage) || 1;
  const paginatedAlerts = filteredAlertAssets.slice(
    (alertPage - 1) * itemsPerPage,
    alertPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      {/* Policy Status Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5">
          <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Info className="w-4 h-4" />
          </span>
          <div>
            <strong className="text-white block font-semibold">Política Operacional Ativa da Organização:</strong>
            <span className="text-slate-400">
              Bens <strong>Sem Data Registrada</strong>:{' '}
              {policy?.blockOnNoHistory ? (
                <span className="text-red-400 font-bold">Bloqueiam Nova Retirada</span>
              ) : (
                <span className="text-amber-400 font-bold">Apenas Emitem Alerta (Permitem Retirada)</span>
              )}{' '}
              • Antecedência Padrão de Aviso: <strong className="text-slate-200">{policy?.defaultWarningDays ?? 30} dias</strong>
            </span>
          </div>
        </div>

        <button
          onClick={onOpenPolicyModal}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold cursor-pointer shrink-0"
        >
          <Settings className="w-3.5 h-3.5 text-blue-400" />
          <span>Configurar Política</span>
        </button>
      </div>

      {/* Visual Overview Charts Component (Inventário Total, Itens Disponíveis e em Manutenção) */}
      <div className="bg-[#121826] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Visão Geral do Inventário de Bens Coletivos
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Distribuição proporcional do inventário ativo: disponíveis para retirada imediata, em uso e sob intervenção técnica.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Disponibilidade Operacional:</span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {kpis.totalBens > 0 ? Math.round((kpis.disponiveis / kpis.totalBens) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Proportional Segmented Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Composição do Almoxarifado</span>
            <span className="font-mono text-slate-200">{kpis.totalBens} itens registrados</span>
          </div>

          <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
            {kpis.totalBens > 0 ? (
              <>
                <div
                  style={{ width: `${(kpis.disponiveis / kpis.totalBens) * 100}%` }}
                  className="bg-emerald-500 hover:opacity-90 transition-all relative group cursor-pointer"
                  title={`Disponíveis: ${kpis.disponiveis} (${Math.round((kpis.disponiveis / kpis.totalBens) * 100)}%)`}
                />
                <div
                  style={{ width: `${(kpis.emUso / kpis.totalBens) * 100}%` }}
                  className="bg-blue-500 hover:opacity-90 transition-all relative group cursor-pointer"
                  title={`Em Uso: ${kpis.emUso} (${Math.round((kpis.emUso / kpis.totalBens) * 100)}%)`}
                />
                <div
                  style={{ width: `${(kpis.emManutencao / kpis.totalBens) * 100}%` }}
                  className="bg-amber-500 hover:opacity-90 transition-all relative group cursor-pointer"
                  title={`Em Manutenção: ${kpis.emManutencao} (${Math.round((kpis.emManutencao / kpis.totalBens) * 100)}%)`}
                />
                <div
                  style={{ width: `${(kpis.bloqueados / kpis.totalBens) * 100}%` }}
                  className="bg-rose-500 hover:opacity-90 transition-all relative group cursor-pointer"
                  title={`Bloqueados: ${kpis.bloqueados} (${Math.round((kpis.bloqueados / kpis.totalBens) * 100)}%)`}
                />
                <div
                  style={{ width: `${(kpis.baixados / kpis.totalBens) * 100}%` }}
                  className="bg-slate-700 hover:opacity-90 transition-all relative group cursor-pointer"
                  title={`Baixados: ${kpis.baixados} (${Math.round((kpis.baixados / kpis.totalBens) * 100)}%)`}
                />
              </>
            ) : (
              <div className="w-full bg-slate-800" />
            )}
          </div>

          {/* Simple Legend with count and percentage */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0" />
              <span>Disponíveis:</span>
              <strong className="text-emerald-400 font-mono">
                {kpis.disponiveis} ({kpis.totalBens > 0 ? Math.round((kpis.disponiveis / kpis.totalBens) * 100) : 0}%)
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded-sm bg-amber-500 shrink-0" />
              <span>Em Manutenção:</span>
              <strong className="text-amber-400 font-mono">
                {kpis.emManutencao} ({kpis.totalBens > 0 ? Math.round((kpis.emManutencao / kpis.totalBens) * 100) : 0}%)
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded-sm bg-blue-500 shrink-0" />
              <span>Em Uso:</span>
              <strong className="text-blue-400 font-mono">
                {kpis.emUso} ({kpis.totalBens > 0 ? Math.round((kpis.emUso / kpis.totalBens) * 100) : 0}%)
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded-sm bg-rose-500 shrink-0" />
              <span>Bloqueados / Vencidos:</span>
              <strong className="text-rose-400 font-mono">
                {kpis.bloqueados} ({kpis.totalBens > 0 ? Math.round((kpis.bloqueados / kpis.totalBens) * 100) : 0}%)
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded-sm bg-slate-700 shrink-0" />
              <span>Baixados:</span>
              <strong className="text-slate-400 font-mono">
                {kpis.baixados} ({kpis.totalBens > 0 ? Math.round((kpis.baixados / kpis.totalBens) * 100) : 0}%)
              </strong>
            </div>
          </div>
        </div>

        {/* Simple Bar Comparison Columns Chart */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Card 1: Inventário Total */}
          <div className="bg-[#0b101b] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total no Almoxarifado</span>
              <Boxes className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-white">{kpis.totalBens}</span>
              <span className="text-xs text-slate-500">itens cadastrados</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full rounded-full" style={{ width: '100%' }} />
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Categorias ativas: {categories.filter((c) => c.active).length}</span>
              <span>100% inventariado</span>
            </div>
          </div>

          {/* Card 2: Itens Disponíveis */}
          <div className="bg-[#0b101b] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Itens Disponíveis</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-emerald-400">{kpis.disponiveis}</span>
              <span className="text-xs text-emerald-500/80 font-medium">
                ({kpis.totalBens > 0 ? Math.round((kpis.disponiveis / kpis.totalBens) * 100) : 0}% do total)
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${kpis.totalBens > 0 ? (kpis.disponiveis / kpis.totalBens) * 100 : 0}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Aguardando retirada</span>
              <span className="text-emerald-400 font-medium">Prontos para operação</span>
            </div>
          </div>

          {/* Card 3: Itens em Manutenção */}
          <div className="bg-[#0b101b] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Itens em Manutenção</span>
              <Wrench className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-bold text-amber-400">{kpis.emManutencao}</span>
              <span className="text-xs text-amber-500/80 font-medium">
                ({kpis.totalBens > 0 ? Math.round((kpis.emManutencao / kpis.totalBens) * 100) : 0}% do total)
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${kpis.totalBens > 0 ? (kpis.emManutencao / kpis.totalBens) * 100 : 0}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>Em oficina / bancada</span>
              <span className="text-amber-400 font-medium">Requer liberação / OS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Status KPIs (Grid 1) */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
          Situação Atual dos Bens Coletivos
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div
            onClick={() => onNavigateToTab('bens-lista')}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Total de Bens</span>
              <Boxes className="w-4 h-4 text-blue-400" />
            </div>
            <strong className="text-xl text-white font-mono block mt-1">{kpis.totalBens}</strong>
            <span className="text-[10px] text-slate-500">Patrimônio individualizado</span>
          </div>

          <div
            onClick={() => onNavigateToTab('bens-lista')}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-800 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Disponíveis</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <strong className="text-xl text-emerald-400 font-mono block mt-1">{kpis.disponiveis}</strong>
            <span className="text-[10px] text-emerald-500/80">Prontos para retirada</span>
          </div>

          <div
            onClick={() => onNavigateToTab('bens-movimentacoes')}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-800 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Em Uso (Empréstimo)</span>
              <User className="w-4 h-4 text-blue-400" />
            </div>
            <strong className="text-xl text-blue-400 font-mono block mt-1">{kpis.emUso}</strong>
            <span className="text-[10px] text-blue-400/80">Com colaboradores</span>
          </div>

          <div
            onClick={() => onNavigateToTab('bens-manutencoes')}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-800 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Em Manutenção</span>
              <Wrench className="w-4 h-4 text-amber-400" />
            </div>
            <strong className="text-xl text-amber-400 font-mono block mt-1">{kpis.emManutencao}</strong>
            <span className="text-[10px] text-amber-500/80">Oficina ou externa</span>
          </div>

          <div
            onClick={() => onNavigateToTab('bens-lista')}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-800 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Bloqueados</span>
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <strong className="text-xl text-red-400 font-mono block mt-1">{kpis.bloqueados}</strong>
            <span className="text-[10px] text-red-400/80">Por vencimento / política</span>
          </div>

          <div
            onClick={() => onNavigateToTab('bens-lista')}
            className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium">Baixados</span>
              <AlertCircle className="w-4 h-4 text-slate-500" />
            </div>
            <strong className="text-xl text-slate-400 font-mono block mt-1">{kpis.baixados}</strong>
            <span className="text-[10px] text-slate-500">Fora de operação</span>
          </div>
        </div>
      </div>

      {/* Movement & Daily Activity KPIs (Grid 2) */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
          Movimentação Diária & Atrasos
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Retiradas Hoje</span>
            <strong className="text-lg text-white font-mono block mt-0.5">{kpis.retiradasHoje}</strong>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Devoluções Hoje</span>
            <strong className="text-lg text-emerald-400 font-mono block mt-0.5">{kpis.devolucoesHoje}</strong>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Retiradas de Hoje em Aberto</span>
            <strong className="text-lg text-blue-400 font-mono block mt-0.5">{kpis.retiradasHojeSemDevolucao}</strong>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-red-300 block font-bold flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 inline" />
              <span>Empréstimos Atrasados</span>
            </span>
            <strong className="text-lg text-red-400 font-mono block mt-0.5">{kpis.emprestimosAtrasados}</strong>
            <span className="text-[10px] text-red-400/80">Saída em dia anterior</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-amber-300 block font-bold">Devoluções com Avaria</span>
            <strong className="text-lg text-amber-400 font-mono block mt-0.5">{kpis.devolucoesComAvaria}</strong>
            <span className="text-[10px] text-amber-400/80">Condição diferente de OK</span>
          </div>
        </div>
      </div>

      {/* Compliance & Expiration Alerts KPIs (Grid 3) */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
          Conformidade de Manutenção & Calibração
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60">
            <span className="text-[11px] text-red-300 block font-bold">Vencidos</span>
            <strong className="text-lg text-red-400 font-mono block mt-0.5">{kpis.vencidos}</strong>
            <span className="text-[10px] text-red-400/70">Manut./Calib. atrasada</span>
          </div>

          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60">
            <span className="text-[11px] text-amber-300 block font-bold">A Vencer</span>
            <strong className="text-lg text-amber-400 font-mono block mt-0.5">{kpis.aVencer}</strong>
            <span className="text-[10px] text-amber-400/70">Na janela de antecedência</span>
          </div>

          <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/60">
            <span className="text-[11px] text-purple-300 block font-bold">Sem Data Registrada</span>
            <strong className="text-lg text-purple-300 font-mono block mt-0.5">{kpis.semData}</strong>
            <span className="text-[10px] text-purple-400/70">Controle sem histórico</span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60">
            <span className="text-[11px] text-emerald-300 block font-bold">Em Dia</span>
            <strong className="text-lg text-emerald-400 font-mono block mt-0.5">{kpis.emDia}</strong>
            <span className="text-[10px] text-emerald-400/70">Acima da janela</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Não Aplicáveis</span>
            <strong className="text-lg text-slate-400 font-mono block mt-0.5">{kpis.naoAplicaveis}</strong>
            <span className="text-[10px] text-slate-500">Sem ciclo periódico</span>
          </div>
        </div>
      </div>

      {/* Resumo por Categoria (Completo, sem limite de 8, sem dupla contagem) */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-xs sm:text-sm">Resumo Consolidado por Categoria</h3>
            <p className="text-[11px] text-slate-400">
              Distribuição dos bens por categoria cadastrada sem dupla contagem ({categorySummary.length} categorias cadastradas).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3 text-center">Total</th>
                <th className="py-2.5 px-3 text-center text-emerald-400">Disponível</th>
                <th className="py-2.5 px-3 text-center text-blue-400">Em Uso</th>
                <th className="py-2.5 px-3 text-center text-red-400">Vencido/Bloqueado</th>
                <th className="py-2.5 px-3 text-center text-amber-400">Em Manutenção</th>
                <th className="py-2.5 px-3 text-center text-slate-400">Baixado</th>
                <th className="py-2.5 px-3 text-center text-slate-500">Não Aplicável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {categorySummary.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Nenhuma categoria cadastrada ainda.
                  </td>
                </tr>
              ) : (
                categorySummary.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 font-semibold text-white flex items-center space-x-1.5">
                      <span>{cat.name}</span>
                      {!cat.active && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px]">
                          Inativa
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-white">{cat.total}</td>
                    <td className="py-2 px-3 text-center font-mono text-emerald-400 font-semibold">{cat.disponivel}</td>
                    <td className="py-2 px-3 text-center font-mono text-blue-400 font-semibold">{cat.emUso}</td>
                    <td className="py-2 px-3 text-center font-mono text-red-400 font-semibold">{cat.vencidoBloqueado}</td>
                    <td className="py-2 px-3 text-center font-mono text-amber-400 font-semibold">{cat.emManutencao}</td>
                    <td className="py-2 px-3 text-center font-mono text-slate-400">{cat.baixado}</td>
                    <td className="py-2 px-3 text-center font-mono text-slate-500">{cat.naoAplicavel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lista Completa, Pesquisável, Filtrável e Paginada de Alertas (Não limitada a 25) */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-3 p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-white text-xs sm:text-sm flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>Painel Geral de Alertas de Vencimento e Manutenções</span>
              <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800 text-[10px] font-bold">
                {filteredAlertAssets.length} item(ns)
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Ordenados por prioridade: <strong>Vencidos</strong> &gt; <strong>A vencer</strong> &gt; <strong>Sem data registrada</strong>.
            </p>
          </div>

          {/* Quick Filters Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={alertSearch}
                onChange={(e) => {
                  setAlertSearch(e.target.value);
                  setAlertPage(1);
                }}
                placeholder="Buscar código, bem, série..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={alertStatusFilter}
              onChange={(e) => {
                setAlertStatusFilter(e.target.value);
                setAlertPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="todos_alertas">Todos os Alertas Ativos</option>
              <option value="VENCIDO">Somente Vencidos</option>
              <option value="A_VENCER">Somente A Vencer</option>
              <option value="SEM_DATA">Sem Data Registrada</option>
              <option value="todos">Todos os Bens (Inclusive Em Dia)</option>
            </select>

            <select
              value={alertCategoryFilter}
              onChange={(e) => {
                setAlertCategoryFilter(e.target.value);
                setAlertPage(1);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="todas">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Alerts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Código & Bem</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Situação</th>
                <th className="py-2.5 px-3">Alerta de Vencimento</th>
                <th className="py-2.5 px-3">Próximo Vencimento</th>
                <th className="py-2.5 px-3">Dias Restantes</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {paginatedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Nenhum alerta localizado para os filtros informados.
                  </td>
                </tr>
              ) : (
                paginatedAlerts.map((a) => {
                  const isVencido = a.alert === 'VENCIDO';
                  const isAVencer = a.alert === 'A_VENCER';
                  const isSemData = a.alert === 'SEM_DATA';

                  return (
                    <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-cyan-400 block">{a.code}</span>
                        <span className="text-white truncate block max-w-xs">{a.description}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {a.categoryName || 'Geral'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            a.situation === 'DISPONIVEL'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : a.situation === 'EM_USO'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : a.situation === 'BLOQUEADO'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : a.situation === 'EM_MANUTENCAO'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {a.situation}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isVencido
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : isAVencer
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : isSemData
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {a.alert}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-200">
                        {a.nextDueDate || (isSemData ? 'Sem histórico' : 'Não aplicável')}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {a.daysRemaining != null ? (
                          <span className={a.daysRemaining < 0 ? 'text-red-400' : a.daysRemaining <= (a.effectiveWarningDays || 30) ? 'text-amber-400' : 'text-emerald-400'}>
                            {a.daysRemaining < 0
                              ? `${Math.abs(a.daysRemaining)}d atrasado`
                              : `${a.daysRemaining} dias`}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onOpenAssetDetail(a)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs inline-flex items-center space-x-1 cursor-pointer"
                          title="Ver ficha completa do bem"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ficha</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalAlertPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Página <strong>{alertPage}</strong> de <strong>{totalAlertPages}</strong> ({filteredAlertAssets.length} registros)
            </span>
            <div className="flex items-center space-x-1">
              <button
                disabled={alertPage <= 1}
                onClick={() => setAlertPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={alertPage >= totalAlertPages}
                onClick={() => setAlertPage((p) => Math.min(totalAlertPages, p + 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
