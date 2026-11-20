import React from 'react';
import {
  CollectiveAsset,
  CollectiveAssetCategory,
  CollectiveAssetMovement,
  CollectiveAssetService,
} from '../../types/collectiveAssets';
import {
  Boxes,
  CheckCircle2,
  Wrench,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { CollectiveAssetsSubSection } from '../../modules/CollectiveAssetsModule';

interface CollectiveAssetsOverviewProps {
  assets: CollectiveAsset[];
  categories: CollectiveAssetCategory[];
  movements: CollectiveAssetMovement[];
  services: CollectiveAssetService[];
  onNavigateTab: (tabId: CollectiveAssetsSubSection) => void;
  canOperate?: boolean;
  canManage?: boolean;
}

export const CollectiveAssetsOverview: React.FC<CollectiveAssetsOverviewProps> = ({
  assets,
  categories,
  movements,
  services,
  onNavigateTab,
  canOperate = true,
  canManage = true,
}) => {
  const total = assets.length;
  const disponiveis = assets.filter((a) => a.situation === 'DISPONIVEL').length;
  const emManutencao = assets.filter((a) => a.situation === 'EM_MANUTENCAO').length;
  const emUso = assets.filter((a) => a.situation === 'EM_USO').length;
  const bloqueados = assets.filter((a) => a.situation === 'BLOQUEADO').length;
  const baixados = assets.filter((a) => a.situation === 'BAIXADO').length;

  const pctDisponivel = total > 0 ? Math.round((disponiveis / total) * 100) : 0;
  const pctManutencao = total > 0 ? Math.round((emManutencao / total) * 100) : 0;
  const pctEmUso = total > 0 ? Math.round((emUso / total) * 100) : 0;
  const pctBloqueado = total > 0 ? Math.round((bloqueados / total) * 100) : 0;

  // SVG Donut calculation
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  // Cumulative stroke offsets
  const calcStroke = (val: number): number => {
    if (total === 0) return 0;
    return (val / total) * circumference;
  };

  const strokeDisp = calcStroke(disponiveis);
  const strokeManut = calcStroke(emManutencao);
  const strokeUso = calcStroke(emUso);
  const strokeBloq = calcStroke(bloqueados);

  // Offsets
  const offsetDisp = 0;
  const offsetManut = -strokeDisp;
  const offsetUso = -(strokeDisp + strokeManut);
  const offsetBloq = -(strokeDisp + strokeManut + strokeUso);

  return (
    <div className="bg-[#121826] rounded-2xl border border-slate-800 p-5 shadow-xl relative overflow-hidden">
      {/* Background soft ambient accents */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Visão Geral do Almoxarifado / Bens Coletivos
            </h2>
            <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-slate-700">
              Tempo Real
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Status operacional consolidado do patrimônio e disponibilidade de equipamentos
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          {canOperate && (
            <>
              <button
                onClick={() => onNavigateTab('bens-movimentacoes')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Retirada / Devolução
              </button>
              <button
                onClick={() => onNavigateTab('bens-manutencoes')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                Manutenção / OS
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Grid: Simple Graphical Dashboard (Donut + 3 Key Cards + Horizontal Bars) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 items-center">
        {/* Left: Donut Chart with Status Proportions */}
        <div className="lg:col-span-4 flex items-center justify-center p-3 bg-[#0b101b] rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-4">
            {/* SVG Donut */}
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-slate-800 fill-none"
                  strokeWidth="11"
                />

                {total > 0 ? (
                  <>
                    {/* Disponíveis Segment (Emerald) */}
                    {disponiveis > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        className="stroke-emerald-500 fill-none transition-all duration-700"
                        strokeWidth="11"
                        strokeDasharray={`${strokeDisp} ${circumference}`}
                        strokeDashoffset={offsetDisp}
                        strokeLinecap="round"
                      />
                    )}

                    {/* Em Manutenção Segment (Amber) */}
                    {emManutencao > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        className="stroke-amber-500 fill-none transition-all duration-700"
                        strokeWidth="11"
                        strokeDasharray={`${strokeManut} ${circumference}`}
                        strokeDashoffset={offsetManut}
                        strokeLinecap="round"
                      />
                    )}

                    {/* Em Uso Segment (Blue) */}
                    {emUso > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        className="stroke-blue-500 fill-none transition-all duration-700"
                        strokeWidth="11"
                        strokeDasharray={`${strokeUso} ${circumference}`}
                        strokeDashoffset={offsetUso}
                        strokeLinecap="round"
                      />
                    )}

                    {/* Bloqueados Segment (Rose) */}
                    {bloqueados > 0 && (
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        className="stroke-rose-500 fill-none transition-all duration-700"
                        strokeWidth="11"
                        strokeDasharray={`${strokeBloq} ${circumference}`}
                        strokeDashoffset={offsetBloq}
                        strokeLinecap="round"
                      />
                    )}
                  </>
                ) : (
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-slate-800 fill-none"
                    strokeWidth="11"
                  />
                )}
              </svg>

              {/* Center Stat */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-mono font-black text-white">{total}</span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Bens</span>
              </div>
            </div>

            {/* Quick Chart Legend */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-300 font-medium">Disponíveis:</span>
                <span className="font-mono text-emerald-400 font-bold ml-auto">{disponiveis}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-300 font-medium">Manutenção:</span>
                <span className="font-mono text-amber-400 font-bold ml-auto">{emManutencao}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-slate-300 font-medium">Em Uso:</span>
                <span className="font-mono text-blue-400 font-bold ml-auto">{emUso}</span>
              </div>
              {bloqueados > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-slate-300 font-medium">Bloqueados:</span>
                  <span className="font-mono text-rose-400 font-bold ml-auto">{bloqueados}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: The 3 Core Metric Cards Requested (Total, Disponíveis, Manutenção) */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 1. Inventário Total */}
          <div
            onClick={() => onNavigateTab('bens-lista')}
            className="group cursor-pointer bg-[#0b101b] hover:bg-slate-900/60 p-4 rounded-xl border border-slate-800 transition shadow-sm space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Inventário Total
              </span>
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition">
                <Boxes className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-black text-white">{total}</span>
              <span className="text-[11px] text-slate-400 font-medium">bens</span>
            </div>

            {/* Simple Graphic Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full rounded-full transition-all duration-500 w-full" />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>{categories.length} categorias</span>
              <span className="text-indigo-400 font-semibold group-hover:underline flex items-center gap-0.5">
                Ver bens <ArrowRight className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>

          {/* 2. Itens Disponíveis */}
          <div
            onClick={() => onNavigateTab('bens-movimentacoes')}
            className="group cursor-pointer bg-[#0b101b] hover:bg-slate-900/60 p-4 rounded-xl border border-slate-800 hover:border-emerald-500/40 transition shadow-sm space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                Itens Disponíveis
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-black text-emerald-400">{disponiveis}</span>
              <span className="text-[11px] font-mono text-emerald-400/80 font-bold">
                ({pctDisponivel}%)
              </span>
            </div>

            {/* Simple Graphic Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${pctDisponivel}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>Prontos para saída</span>
              <span className="text-emerald-400 font-semibold group-hover:underline flex items-center gap-0.5">
                Emprestar <ArrowRight className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>

          {/* 3. Itens em Manutenção */}
          <div
            onClick={() => onNavigateTab('bens-manutencoes')}
            className="group cursor-pointer bg-[#0b101b] hover:bg-slate-900/60 p-4 rounded-xl border border-slate-800 hover:border-amber-500/40 transition shadow-sm space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                Em Manutenção
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition">
                <Wrench className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-black text-amber-400">{emManutencao}</span>
              <span className="text-[11px] font-mono text-amber-400/80 font-bold">
                ({pctManutencao}%)
              </span>
            </div>

            {/* Simple Graphic Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${pctManutencao}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>{services.length} intervenções</span>
              <span className="text-amber-400 font-semibold group-hover:underline flex items-center gap-0.5">
                Ver OS <ArrowRight className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Proportional Segmented Progress Bar */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span className="text-[11px] uppercase tracking-wider">Distribuição Operacional Proporcional</span>
          <span className="text-[11px] font-mono text-slate-300">
            {disponiveis} disp • {emManutencao} manut • {emUso} em uso • {bloqueados} bloq
          </span>
        </div>
        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
          {total > 0 ? (
            <>
              <div
                style={{ width: `${(disponiveis / total) * 100}%` }}
                className="bg-emerald-500 hover:opacity-90 transition-all cursor-pointer"
                title={`Disponíveis: ${disponiveis} (${pctDisponivel}%)`}
              />
              <div
                style={{ width: `${(emUso / total) * 100}%` }}
                className="bg-blue-500 hover:opacity-90 transition-all cursor-pointer"
                title={`Em Uso: ${emUso} (${pctEmUso}%)`}
              />
              <div
                style={{ width: `${(emManutencao / total) * 100}%` }}
                className="bg-amber-500 hover:opacity-90 transition-all cursor-pointer"
                title={`Em Manutenção: ${emManutencao} (${pctManutencao}%)`}
              />
              <div
                style={{ width: `${(bloqueados / total) * 100}%` }}
                className="bg-rose-500 hover:opacity-90 transition-all cursor-pointer"
                title={`Bloqueados: ${bloqueados} (${pctBloqueado}%)`}
              />
              <div
                style={{ width: `${(baixados / total) * 100}%` }}
                className="bg-slate-700 hover:opacity-90 transition-all cursor-pointer"
                title={`Baixados: ${baixados}`}
              />
            </>
          ) : (
            <div className="w-full bg-slate-800" />
          )}
        </div>
      </div>
    </div>
  );
};
