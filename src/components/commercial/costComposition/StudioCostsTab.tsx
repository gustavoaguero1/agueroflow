import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Users,
  Package,
  Hotel,
  Wrench,
  HardHat,
  Sliders,
  Truck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  ALLOY_DENSITIES,
  MACHINERY_CATALOG_PRESETS,
  VEHICLE_PRESETS,
  calculateBarTubeRow,
  calculateConnectionRow,
  calculatePainting,
  calculateSheetRow,
  computeRoleHH,
  r2,
  type AgueroInoxBudgetModel,
  type AgueroInoxBudgetResult,
  type AlloyDensityId,
  type MachineryUnit,
  type VehicleTypeId,
} from '../../../services/agueroInoxPricingEngine';

import type { CommercialMaterial } from '../../../types/commercial';

export type CostSubTab = 'equipes' | 'materiais' | 'despesas' | 'consumiveis_maq' | 'canteiro_mob_terc' | 'parametros_hh';

interface Props {
  model: AgueroInoxBudgetModel;
  result: AgueroInoxBudgetResult;
  catalog?: CommercialMaterial[];
  onChange: (updater: (prev: AgueroInoxBudgetModel) => AgueroInoxBudgetModel) => void;
  activeSubTab: CostSubTab;
  onSelectSubTab: (t: CostSubTab) => void;
}

const brl = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const inp =
  'w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500';
const card = 'rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-3';

export const StudioCostsTab: React.FC<Props> = ({
  model,
  result,
  catalog = [],
  onChange,
  activeSubTab,
  onSelectSubTab,
}) => {
  const [matSub, setMatSub] = useState<'chapas' | 'tubos' | 'conexoes' | 'pintura'>('chapas');

  const tabs: Array<{ id: CostSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'equipes', label: 'Equipes & HH', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'materiais', label: 'Materiais', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'despesas', label: 'Despesas & Transporte', icon: <Hotel className="w-3.5 h-3.5" /> },
    { id: 'consumiveis_maq', label: 'Consumíveis & Maquinário', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'canteiro_mob_terc', label: 'Canteiro, Mob & Terceiros', icon: <HardHat className="w-3.5 h-3.5" /> },
    { id: 'parametros_hh', label: 'Parâmetros HH', icon: <Sliders className="w-3.5 h-3.5" /> },
  ];

  const syncRatesIntoPhases = () => {
    onChange((prev) => {
      const rateMap = new Map(
        prev.roleRates.map((r) => {
          const calc = computeRoleHH(r);
          return [r.id, { roleName: r.roleName, hhCusto: calc.hhCusto, hhVenda: calc.hhVenda }];
        }),
      );
      return {
        ...prev,
        phases: prev.phases.map((p) => ({
          ...p,
          rows: p.rows.map((row) => {
            const found = rateMap.get(row.roleId);
            return found ? { ...row, ...found } : row;
          }),
        })),
      };
    });
  };

  const paintCalc = calculatePainting(model.painting);

  return (
    <div className="space-y-4">
      {/* Sub-navigation pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectSubTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition cursor-pointer ${
              activeSubTab === t.id
                ? 'bg-blue-600 text-white border-blue-500 apple-solid-btn'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-600'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── 1. EQUIPES MULTI-FASE (MÃO DE OBRA + COMISSIONAMENTO) ── */}
      {activeSubTab === 'equipes' && (
        <div className="space-y-4">
          <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h3 className="text-sm font-bold text-white">Dimensionamento de Equipes por Fase</h3>
              <p className="text-[11px] text-slate-400">
                Fórmula: Q × HH × (HN + {model.overtimeMult50}×HE50 + {model.overtimeMult100}×HE100). Total: {result.totalHeadcount} profissionais · {result.totalLaborHours.toLocaleString('pt-BR')} h.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-slate-300">
                <span>Mult. HE50%</span>
                <input
                  type="number"
                  step="0.1"
                  value={model.overtimeMult50}
                  onChange={(e) => onChange((p) => ({ ...p, overtimeMult50: Math.max(1, num(e.target.value)) }))}
                  className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                <span>Mult. HE100%</span>
                <input
                  type="number"
                  step="0.1"
                  value={model.overtimeMult100}
                  onChange={(e) => onChange((p) => ({ ...p, overtimeMult100: Math.max(1, num(e.target.value)) }))}
                  className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  onChange((p) => ({
                    ...p,
                    phases: [
                      ...p.phases,
                      {
                        id: `phase_${Date.now()}`,
                        name: 'Nova Fase (ex: Fabricação / Elétrica)',
                        kind: 'fabricacao',
                        durationWeeks: 4,
                        weeklyHours: 44,
                        rows: [],
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold cursor-pointer apple-solid-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova fase</span>
              </button>
            </div>
          </div>

          {model.phases.map((phase) => {
            const phaseCost = r2(
              phase.rows.reduce(
                (s, r) =>
                  s +
                  r.quantity *
                    r.hhCusto *
                    (r.horasNormais + model.overtimeMult50 * r.horasExtras50 + model.overtimeMult100 * r.horasExtras100),
                0,
              ),
            );
            const phaseSell = r2(
              phase.rows.reduce(
                (s, r) =>
                  s +
                  r.quantity *
                    r.hhVenda *
                    (r.horasNormais + model.overtimeMult50 * r.horasExtras50 + model.overtimeMult100 * r.horasExtras100),
                0,
              ),
            );

            return (
              <div key={phase.id} className={card}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                    <input
                      value={phase.name}
                      onChange={(e) =>
                        onChange((p) => ({
                          ...p,
                          phases: p.phases.map((ph) => (ph.id === phase.id ? { ...ph, name: e.target.value } : ph)),
                        }))
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-white min-w-[210px]"
                    />
                    <select
                      value={phase.kind}
                      onChange={(e) =>
                        onChange((p) => ({
                          ...p,
                          phases: p.phases.map((ph) =>
                            ph.id === phase.id ? { ...ph, kind: e.target.value as typeof ph.kind } : ph,
                          ),
                        }))
                      }
                      className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-200"
                    >
                      <option value="principal">Mão de Obra Principal</option>
                      <option value="comissionamento">Comissionamento</option>
                      <option value="fabricacao">Fabricação / Caldeiraria</option>
                      <option value="outro">Outra Etapa</option>
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Sem.:</span>
                      <input
                        type="number"
                        min={1}
                        value={phase.durationWeeks}
                        onChange={(e) => {
                          const wks = Math.max(1, num(e.target.value));
                          onChange((p) => ({
                            ...p,
                            phases: p.phases.map((ph) =>
                              ph.id === phase.id
                                ? {
                                    ...ph,
                                    durationWeeks: wks,
                                    rows: ph.rows.map((r) => ({ ...r, horasNormais: wks * ph.weeklyHours })),
                                  }
                                : ph,
                            ),
                          }));
                        }}
                        className="w-14 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>h/sem:</span>
                      <input
                        type="number"
                        min={1}
                        value={phase.weeklyHours}
                        onChange={(e) => {
                          const hrs = Math.max(1, num(e.target.value));
                          onChange((p) => ({
                            ...p,
                            phases: p.phases.map((ph) =>
                              ph.id === phase.id
                                ? {
                                    ...ph,
                                    weeklyHours: hrs,
                                    rows: ph.rows.map((r) => ({ ...r, horasNormais: ph.durationWeeks * hrs })),
                                  }
                                : ph,
                            ),
                          }));
                        }}
                        className="w-14 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">
                      Custo: <strong className="font-mono text-white">{brl(phaseCost)}</strong>
                    </span>
                    <span className="text-slate-400">
                      Venda HH: <strong className="font-mono text-emerald-400">{brl(phaseSell)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const def = model.roleRates[0];
                        const calc = def ? computeRoleHH(def) : { hhCusto: 59.51, hhVenda: 85.01 };
                        onChange((p) => ({
                          ...p,
                          phases: p.phases.map((ph) =>
                            ph.id === phase.id
                              ? {
                                  ...ph,
                                  rows: [
                                    ...ph.rows,
                                    {
                                      id: `lr_${Date.now()}`,
                                      roleId: def?.id || 'montador',
                                      roleName: def?.roleName || 'Montador',
                                      quantity: 1,
                                      horasNormais: ph.durationWeeks * ph.weeklyHours,
                                      horasExtras50: 0,
                                      horasExtras100: 0,
                                      hhCusto: calc.hhCusto,
                                      hhVenda: calc.hhVenda,
                                    },
                                  ],
                                }
                              : ph,
                          ),
                        }));
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Função
                    </button>
                    {model.phases.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          onChange((p) => ({ ...p, phases: p.phases.filter((ph) => ph.id !== phase.id) }))
                        }
                        className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Remover fase"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse min-w-[740px]">
                    <thead>
                      <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                        <th className="py-2 pr-2">Função</th>
                        <th className="py-2 px-1.5 w-16">Qtd</th>
                        <th className="py-2 px-1.5 w-20">H. Normais</th>
                        <th className="py-2 px-1.5 w-20">HE 50%</th>
                        <th className="py-2 px-1.5 w-20">HE 100%</th>
                        <th className="py-2 px-1.5 w-24">HH Custo</th>
                        <th className="py-2 px-1.5 w-24">HH Venda</th>
                        <th className="py-2 px-2 text-right">Custo Total</th>
                        <th className="py-2 px-2 text-right">Venda HH</th>
                        <th className="py-2 pl-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {phase.rows.map((row) => {
                        const eqH =
                          row.horasNormais +
                          model.overtimeMult50 * row.horasExtras50 +
                          model.overtimeMult100 * row.horasExtras100;
                        const rowCost = r2(row.quantity * row.hhCusto * eqH);
                        const rowSell = r2(row.quantity * row.hhVenda * eqH);
                        const updateRow = (patch: Partial<typeof row>) =>
                          onChange((p) => ({
                            ...p,
                            phases: p.phases.map((ph) =>
                              ph.id === phase.id
                                ? { ...ph, rows: ph.rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) }
                                : ph,
                            ),
                          }));

                        return (
                          <tr key={row.id}>
                            <td className="py-1.5 pr-2">
                              <select
                                value={row.roleId}
                                onChange={(e) => {
                                  const found = model.roleRates.find((rr) => rr.id === e.target.value);
                                  if (found) {
                                    const calc = computeRoleHH(found);
                                    updateRow({
                                      roleId: found.id,
                                      roleName: found.roleName,
                                      hhCusto: calc.hhCusto,
                                      hhVenda: calc.hhVenda,
                                    });
                                  }
                                }}
                                className={inp}
                              >
                                {model.roleRates.map((rr) => (
                                  <option key={rr.id} value={rr.id}>
                                    {rr.roleName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" min={0} value={row.quantity} onChange={(e) => updateRow({ quantity: num(e.target.value) })} className={`${inp} font-mono text-center`} />
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" min={0} value={row.horasNormais} onChange={(e) => updateRow({ horasNormais: num(e.target.value) })} className={`${inp} font-mono text-right`} />
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" min={0} value={row.horasExtras50} onChange={(e) => updateRow({ horasExtras50: num(e.target.value) })} className={`${inp} font-mono text-right`} />
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" min={0} value={row.horasExtras100} onChange={(e) => updateRow({ horasExtras100: num(e.target.value) })} className={`${inp} font-mono text-right`} />
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" step="0.01" value={row.hhCusto} onChange={(e) => updateRow({ hhCusto: num(e.target.value) })} className={`${inp} font-mono text-right`} />
                            </td>
                            <td className="py-1.5 px-1">
                              <input type="number" step="0.01" value={row.hhVenda} onChange={(e) => updateRow({ hhVenda: num(e.target.value) })} className={`${inp} font-mono text-right`} />
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-200">{brl(rowCost)}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-emerald-400">{brl(rowSell)}</td>
                            <td className="py-1.5 pl-1 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  onChange((p) => ({
                                    ...p,
                                    phases: p.phases.map((ph) =>
                                      ph.id === phase.id
                                        ? { ...ph, rows: ph.rows.filter((r) => r.id !== row.id) }
                                        : ph,
                                    ),
                                  }))
                                }
                                className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {phase.rows.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-4 text-center text-slate-500">
                            Nenhuma função nesta fase. Clique em &ldquo;+ Função&rdquo;.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2. MATERIAIS (CHAPAS, BARRAS/TUBOS, CONEXÕES, PINTURA, FRETE) ── */}
      {activeSubTab === 'materiais' && (
        <div className="space-y-4">
          <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['chapas', `A. Chapas (${model.sheets.length})`],
                ['tubos', `B. Barras & Tubos (${model.barsTubes.length})`],
                ['conexoes', `C. Conexões & Conjuntos (${model.connections.length})`],
                ['pintura', `D. Pintura & Frete`],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMatSub(k)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border ${
                    matSub === k
                      ? 'bg-blue-600 text-white border-blue-500 apple-solid-btn'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-400 flex flex-wrap gap-3">
              <span>
                Crédito ICMS: <strong className="font-mono text-cyan-300">{brl(result.icmsCreditTotal)}</strong>
              </span>
              <span>
                Venda Mat. (s/ imp.): <strong className="font-mono text-emerald-400">{brl(result.baseSellMaterialsNet)}</strong>
              </span>
            </div>
          </div>

          {matSub === 'chapas' && (
            <div className={card}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Calculadora de Chapas (densidade por liga)</h4>
                  <p className="text-[11px] text-slate-400">Peso = Espessura (mm) × Largura (m) × Comprimento (m) × Densidade da liga.</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      sheets: [
                        ...p.sheets,
                        {
                          id: `sh_${Date.now()}`,
                          description: 'Chapa Inox 316L',
                          alloy: 'inox_316l',
                          quantity: 1,
                          thicknessMm: 2,
                          widthM: 1.5,
                          lengthM: 2,
                          pricePerKg: 32,
                          refaturamentoPercent: 30,
                          icmsCreditPercent: p.taxes.icmsCreditDefaultPercent,
                        },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
                >
                  <Plus className="w-3.5 h-3.5" /> Chapa
                </button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[860px]">
                  <thead>
                    <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-2">Descrição</th>
                      <th className="py-2 px-1 w-36">Liga / Densidade</th>
                      <th className="py-2 px-1 w-14">Qtd</th>
                      <th className="py-2 px-1 w-16">Esp.(mm)</th>
                      <th className="py-2 px-1 w-16">Larg.(m)</th>
                      <th className="py-2 px-1 w-16">Comp.(m)</th>
                      <th className="py-2 px-1 w-20">R$/kg</th>
                      <th className="py-2 px-1 w-16">Refat.%</th>
                      <th className="py-2 px-1 w-16">ICMS%</th>
                      <th className="py-2 px-2 text-right">Peso / Área</th>
                      <th className="py-2 px-2 text-right">Custo / Venda</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {model.sheets.map((s) => {
                      const c = calculateSheetRow(s);
                      const upd = (patch: Partial<typeof s>) =>
                        onChange((p) => ({ ...p, sheets: p.sheets.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }));
                      return (
                        <tr key={s.id}>
                          <td className="py-1.5 pr-1"><input value={s.description} onChange={(e) => upd({ description: e.target.value })} className={inp} /></td>
                          <td className="py-1.5 px-1">
                            <select value={s.alloy} onChange={(e) => upd({ alloy: e.target.value as AlloyDensityId })} className={inp}>
                              {Object.entries(ALLOY_DENSITIES).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-1"><input type="number" min={0} value={s.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.1" value={s.thicknessMm} onChange={(e) => upd({ thicknessMm: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={s.widthM} onChange={(e) => upd({ widthM: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={s.lengthM} onChange={(e) => upd({ lengthM: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={s.pricePerKg} onChange={(e) => upd({ pricePerKg: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="1" value={s.refaturamentoPercent} onChange={(e) => upd({ refaturamentoPercent: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.5" value={s.icmsCreditPercent} onChange={(e) => upd({ icmsCreditPercent: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                            <div className="text-white">{c.totalWeightKg} kg</div>
                            <div className="text-slate-400">{c.areaOneFace} m²</div>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                            <div className="text-slate-300">{brl(c.totalCost)}</div>
                            <div className="text-emerald-400 font-bold">{brl(c.sellPreTax)}</div>
                          </td>
                          <td className="py-1.5 text-right">
                            <button type="button" onClick={() => onChange((p) => ({ ...p, sheets: p.sheets.filter((x) => x.id !== s.id) }))} className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {model.sheets.length === 0 && (
                      <tr><td colSpan={12} className="py-5 text-center text-slate-500">Nenhuma chapa lançada. Clique em &ldquo;+ Chapa&rdquo; para calcular peso, área e refaturamento automaticamente.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {matSub === 'tubos' && (
            <div className={card}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white">Barras, Tubos e Perfis (Peso = Qtd × Comp. × kg/m)</h4>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      barsTubes: [
                        ...p.barsTubes,
                        {
                          id: `bt_${Date.now()}`,
                          description: 'Tubo Inox 304 OD 2"',
                          gauge: '2" x 1,5mm',
                          quantity: 10,
                          lengthM: 6,
                          kgPerMeter: 1.9,
                          pricePerKg: 36,
                          refaturamentoPercent: 30,
                          icmsCreditPercent: p.taxes.icmsCreditDefaultPercent,
                        },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
                >
                  <Plus className="w-3.5 h-3.5" /> Tubo / Barra
                </button>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[780px]">
                  <thead>
                    <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-2">Descrição</th>
                      <th className="py-2 px-1 w-24">Bitola</th>
                      <th className="py-2 px-1 w-14">Qtd</th>
                      <th className="py-2 px-1 w-16">Comp.(m)</th>
                      <th className="py-2 px-1 w-16">kg/m</th>
                      <th className="py-2 px-1 w-20">R$/kg</th>
                      <th className="py-2 px-1 w-16">Refat.%</th>
                      <th className="py-2 px-2 text-right">Peso</th>
                      <th className="py-2 px-2 text-right">Custo / Venda</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {model.barsTubes.map((b) => {
                      const c = calculateBarTubeRow(b);
                      const upd = (patch: Partial<typeof b>) =>
                        onChange((p) => ({ ...p, barsTubes: p.barsTubes.map((x) => (x.id === b.id ? { ...x, ...patch } : x)) }));
                      return (
                        <tr key={b.id}>
                          <td className="py-1.5 pr-1"><input value={b.description} onChange={(e) => upd({ description: e.target.value })} className={inp} /></td>
                          <td className="py-1.5 px-1"><input value={b.gauge} onChange={(e) => upd({ gauge: e.target.value })} className={inp} /></td>
                          <td className="py-1.5 px-1"><input type="number" value={b.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.1" value={b.lengthM} onChange={(e) => upd({ lengthM: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={b.kgPerMeter} onChange={(e) => upd({ kgPerMeter: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={b.pricePerKg} onChange={(e) => upd({ pricePerKg: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" value={b.refaturamentoPercent} onChange={(e) => upd({ refaturamentoPercent: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-2 text-right font-mono">{c.totalWeightKg} kg</td>
                          <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                            <div className="text-slate-300">{brl(c.totalCost)}</div>
                            <div className="text-emerald-400 font-bold">{brl(c.sellPreTax)}</div>
                          </td>
                          <td className="py-1.5 text-right">
                            <button type="button" onClick={() => onChange((p) => ({ ...p, barsTubes: p.barsTubes.filter((x) => x.id !== b.id) }))} className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {model.barsTubes.length === 0 && (
                      <tr><td colSpan={10} className="py-5 text-center text-slate-500">Nenhuma barra ou tubo lançado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {matSub === 'conexoes' && (
            <div className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-white">Conexões, Válvulas, Materiais Mecânicos e Elétricos (fator individual)</h4>
                <div className="flex flex-wrap items-center gap-1.5">
                  {catalog.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const found = catalog.find((c) => c.id === e.target.value);
                        e.target.value = '';
                        if (!found) return;
                        onChange((p) => ({
                          ...p,
                          connections: [
                            ...p.connections,
                            {
                              id: `cn_${Date.now()}`,
                              description: `${found.internalCode ? `[${found.internalCode}] ` : ''}${found.originalDescription || found.normalizedDescription}`,
                              group: (found.category || '').toLowerCase().includes('eletr') ? 'eletrico' : 'mecanico',
                              unit: found.unit || 'un',
                              quantity: 1,
                              unitCost: Number(found.baseCost) || 0,
                              refaturamentoPercent: 30,
                              icmsCreditPercent: p.taxes.icmsCreditDefaultPercent,
                            },
                          ],
                        }));
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 max-w-[240px] cursor-pointer"
                    >
                      <option value="">+ Importar do Catálogo ({catalog.length})...</option>
                      {catalog.slice(0, 80).map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.internalCode ? `[${mat.internalCode}] ` : ''}{mat.originalDescription || mat.normalizedDescription} ({brl(mat.baseCost || 0)})
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onChange((p) => ({
                        ...p,
                        connections: [
                          ...p.connections,
                          {
                            id: `cn_${Date.now()}`,
                            description: 'Novo lote / conexão / válvula',
                            group: 'mecanico',
                            unit: 'un',
                            quantity: 1,
                            unitCost: 0,
                            refaturamentoPercent: 30,
                            icmsCreditPercent: p.taxes.icmsCreditDefaultPercent,
                          },
                        ],
                      }))
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
                  >
                    <Plus className="w-3.5 h-3.5" /> Item / Conjunto
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[740px]">
                  <thead>
                    <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-2">Descrição</th>
                      <th className="py-2 px-1 w-28">Grupo</th>
                      <th className="py-2 px-1 w-16">Qtd</th>
                      <th className="py-2 px-1 w-28">Custo Unit. (R$)</th>
                      <th className="py-2 px-1 w-20">Refat. %</th>
                      <th className="py-2 px-1 w-16">ICMS %</th>
                      <th className="py-2 px-2 text-right">Custo</th>
                      <th className="py-2 px-2 text-right">Venda s/ Imp.</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {model.connections.map((cn) => {
                      const c = calculateConnectionRow(cn);
                      const upd = (patch: Partial<typeof cn>) =>
                        onChange((p) => ({ ...p, connections: p.connections.map((x) => (x.id === cn.id ? { ...x, ...patch } : x)) }));
                      return (
                        <tr key={cn.id}>
                          <td className="py-1.5 pr-1"><input value={cn.description} onChange={(e) => upd({ description: e.target.value })} className={inp} /></td>
                          <td className="py-1.5 px-1">
                            <select value={cn.group} onChange={(e) => upd({ group: e.target.value as typeof cn.group })} className={inp}>
                              <option value="mecanico">Mecânico</option>
                              <option value="eletrico">Elétrico</option>
                              <option value="outro">Outros</option>
                            </select>
                          </td>
                          <td className="py-1.5 px-1"><input type="number" value={cn.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.01" value={cn.unitCost} onChange={(e) => upd({ unitCost: num(e.target.value) })} className={`${inp} font-mono text-right`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="1" value={cn.refaturamentoPercent} onChange={(e) => upd({ refaturamentoPercent: num(e.target.value) })} className={`${inp} font-mono text-right`} /></td>
                          <td className="py-1.5 px-1"><input type="number" step="0.5" value={cn.icmsCreditPercent} onChange={(e) => upd({ icmsCreditPercent: num(e.target.value) })} className={`${inp} font-mono text-right`} /></td>
                          <td className="py-1.5 px-2 text-right font-mono">{brl(c.totalCost)}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-semibold text-emerald-400">{brl(c.sellPreTax)}</td>
                          <td className="py-1.5 text-right">
                            <button type="button" onClick={() => onChange((p) => ({ ...p, connections: p.connections.filter((x) => x.id !== cn.id) }))} className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {matSub === 'pintura' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className={card}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white">Calculadora de Pintura Industrial</h4>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={model.painting.enabled}
                      onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, enabled: e.target.checked } }))}
                    />
                    Incluir pintura
                  </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400">Área total (m²)</label>
                    <input type="number" value={model.painting.areaM2} onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, areaM2: num(e.target.value) } }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Demãos</label>
                    <input type="number" min={1} value={model.painting.coats} onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, coats: num(e.target.value) } }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Rendim. (m²/galão)</label>
                    <input type="number" min={1} value={model.painting.yieldM2PerGallon} onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, yieldM2PerGallon: num(e.target.value) } }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Perda (%)</label>
                    <input type="number" value={model.painting.lossPercent} onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, lossPercent: num(e.target.value) } }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Preço / Galão (R$)</label>
                    <input type="number" value={model.painting.pricePerGallon} onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, pricePerGallon: num(e.target.value) } }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Refaturamento (%)</label>
                    <input type="number" value={model.painting.refaturamentoPercent} onChange={(e) => onChange((p) => ({ ...p, painting: { ...p.painting, refaturamentoPercent: num(e.target.value) } }))} className={inp} />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Galões (+10% reserva, arred. cima): <strong className="text-white font-mono">{paintCalc.gallons}</strong></span>
                  <span className="font-mono text-emerald-400 font-bold">{brl(paintCalc.totalCost)} → {brl(paintCalc.sellPreTax)}</span>
                </div>
              </div>

              <div className={card}>
                <h4 className="text-xs font-bold text-white">Frete de Materiais</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400">Custo do Frete (R$)</label>
                    <input type="number" value={model.materialsFreightCost} onChange={(e) => onChange((p) => ({ ...p, materialsFreightCost: num(e.target.value) }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Refaturamento Frete (%)</label>
                    <input type="number" value={model.materialsFreightRefatPercent} onChange={(e) => onChange((p) => ({ ...p, materialsFreightRefatPercent: num(e.target.value) }))} className={inp} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Venda do frete s/ impostos: <strong className="font-mono text-emerald-400">{brl(r2(model.materialsFreightCost * (1 + model.materialsFreightRefatPercent / 100)))}</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. DESPESAS COM PESSOAL + CALCULADORA DE TRANSPORTE ── */}
      {activeSubTab === 'despesas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={card}>
            <h4 className="text-xs font-bold text-white">Hospedagem, Alimentação e Alojamento (dias corridos)</h4>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <label className="col-span-2 inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={model.personnelExpenses.useAutoHeadcount}
                  onChange={(e) =>
                    onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, useAutoHeadcount: e.target.checked } }))
                  }
                />
                Importar equipe automaticamente das fases ({result.totalHeadcount} profissionais)
              </label>
              {!model.personnelExpenses.useAutoHeadcount && (
                <div>
                  <label className="text-[10px] text-slate-400">Qtd. Profissionais (manual)</label>
                  <input type="number" value={model.personnelExpenses.manualHeadcount} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, manualHeadcount: num(e.target.value) } }))} className={inp} />
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-400">Dias corridos (incl. fins de semana)</label>
                <input type="number" value={model.personnelExpenses.calendarDays} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, calendarDays: num(e.target.value) } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex items-center gap-1">
                  <input type="checkbox" checked={model.personnelExpenses.includeHospedagem} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, includeHospedagem: e.target.checked } }))} />
                  Hospedagem / dia (R$)
                </label>
                <input type="number" value={model.personnelExpenses.hospedagemDiaria} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, hospedagemDiaria: num(e.target.value) } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex items-center gap-1">
                  <input type="checkbox" checked={model.personnelExpenses.includeAlimentacao} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, includeAlimentacao: e.target.checked } }))} />
                  Alimentação / dia (R$)
                </label>
                <input type="number" value={model.personnelExpenses.alimentacaoDiaria} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, alimentacaoDiaria: num(e.target.value) } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex items-center gap-1">
                  <input type="checkbox" checked={model.personnelExpenses.includeManutencaoAloj} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, includeManutencaoAloj: e.target.checked } }))} />
                  Manut. alojamento / dia (R$)
                </label>
                <input type="number" value={model.personnelExpenses.manutencaoAlojamentoDiaria} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, manutencaoAlojamentoDiaria: num(e.target.value) } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Folgas de campo (Qtd × R$ {model.personnelExpenses.folgaCampoUnit})</label>
                <input type="number" value={model.personnelExpenses.folgasQuantidade} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, folgasQuantidade: num(e.target.value) } }))} className={inp} />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">Outras despesas (Passagens, Treinamentos, SST, Integração, ART)</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      personnelExpenses: {
                        ...p.personnelExpenses,
                        extras: [...p.personnelExpenses.extras, { id: `pe_${Date.now()}`, description: 'Passagens / Treinamento NR', quantity: 1, unitCost: 0 }],
                      },
                    }))
                  }
                  className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] text-blue-300 font-semibold cursor-pointer"
                >
                  + Despesa
                </button>
              </div>
              {model.personnelExpenses.extras.map((ex) => (
                <div key={ex.id} className="grid grid-cols-12 gap-1.5 items-center">
                  <input value={ex.description} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, extras: p.personnelExpenses.extras.map((x) => (x.id === ex.id ? { ...x, description: e.target.value } : x)) } }))} className={`${inp} col-span-6`} />
                  <input type="number" value={ex.quantity} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, extras: p.personnelExpenses.extras.map((x) => (x.id === ex.id ? { ...x, quantity: num(e.target.value) } : x)) } }))} className={`${inp} col-span-2 font-mono`} />
                  <input type="number" value={ex.unitCost} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, extras: p.personnelExpenses.extras.map((x) => (x.id === ex.id ? { ...x, unitCost: num(e.target.value) } : x)) } }))} className={`${inp} col-span-3 font-mono`} />
                  <button type="button" onClick={() => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, extras: p.personnelExpenses.extras.filter((x) => x.id !== ex.id) } }))} className="col-span-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Calculadora de Transporte */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5"><Truck className="w-4 h-4 text-blue-400" /> Calculadora Automática de Transporte</h4>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={model.personnelExpenses.transport.enabled}
                  onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, transport: { ...p.personnelExpenses.transport, enabled: e.target.checked } } }))}
                />
                Ativo
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="col-span-2">
                <label className="text-[10px] text-slate-400">Tipo de Veículo</label>
                <select
                  value={model.personnelExpenses.transport.vehicleType}
                  onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, transport: { ...p.personnelExpenses.transport, vehicleType: e.target.value as VehicleTypeId } } }))}
                  className={inp}
                >
                  {Object.entries(VEHICLE_PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label} · {v.kmPerLiter} km/L · {brl(v.monthlyRental)}/mês
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Distância ida+volta/dia (km)</label>
                <input type="number" value={model.personnelExpenses.transport.kmPerDay} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, transport: { ...p.personnelExpenses.transport, kmPerDay: num(e.target.value) } } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Dias trabalhados</label>
                <input type="number" value={model.personnelExpenses.transport.workDays} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, transport: { ...p.personnelExpenses.transport, workDays: num(e.target.value) } } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Meses de locação</label>
                <input type="number" step="0.5" value={model.personnelExpenses.transport.monthsRental} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, transport: { ...p.personnelExpenses.transport, monthsRental: num(e.target.value) } } }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Combustível (R$/L)</label>
                <input type="number" step="0.01" value={model.personnelExpenses.transport.fuelPricePerLiter} onChange={(e) => onChange((p) => ({ ...p, personnelExpenses: { ...p.personnelExpenses, transport: { ...p.personnelExpenses.transport, fuelPricePerLiter: num(e.target.value) } } }))} className={inp} />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">Veículos necessários (por capacidade)</span><strong className="font-mono text-white">{result.transportSummary.vehiclesNeeded} un.</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Aluguel de veículos</span><strong className="font-mono text-white">{brl(result.transportSummary.rentalCost)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Combustível ({result.transportSummary.fuelLiters} L)</span><strong className="font-mono text-white">{brl(result.transportSummary.fuelCost)}</strong></div>
              <div className="flex justify-between pt-1.5 border-t border-slate-800"><span className="text-slate-300 font-semibold">Total Transporte</span><strong className="font-mono text-emerald-400">{brl(result.transportSummary.totalTransportCost)}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. CONSUMÍVEIS & MAQUINÁRIO ── */}
      {activeSubTab === 'consumiveis_maq' && (
        <div className="space-y-4">
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-white">Consumíveis (Discos, Gases, Varetas, Abrasivos)</h4>
                <p className="text-[11px] text-slate-400">Regra Aguero Inox: percentual aplicado sobre a VENDA da mão de obra principal (padrão 25%).</p>
              </div>
              <div className="flex gap-1">
                {(['percentual', 'detalhado', 'misto'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange((p) => ({ ...p, consumables: { ...p.consumables, mode: m } }))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize cursor-pointer ${
                      model.consumables.mode === m ? 'bg-blue-600 text-white apple-solid-btn' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {model.consumables.mode === 'misto' && (
              <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-[11px] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Modo Misto ativo: certifique-se de que os itens listados abaixo são específicos e não duplicam o percentual sobre mão de obra.</span>
              </div>
            )}

            {(model.consumables.mode === 'percentual' || model.consumables.mode === 'misto') && (
              <div className="flex items-center gap-3 text-xs">
                <label className="text-slate-300">Percentual sobre venda da Mão de Obra Principal (%):</label>
                <input
                  type="number"
                  step="1"
                  value={model.consumables.percentOnMainLaborSell}
                  onChange={(e) => onChange((p) => ({ ...p, consumables: { ...p.consumables, percentOnMainLaborSell: num(e.target.value) } }))}
                  className="w-20 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
            )}

            {(model.consumables.mode === 'detalhado' || model.consumables.mode === 'misto') && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      consumables: {
                        ...p.consumables,
                        items: [...p.consumables.items, { id: `cs_${Date.now()}`, description: 'Gás Argônio / Disco corte', unit: 'un', quantity: 1, unitCost: 0 }],
                      },
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-blue-300 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Item consumível
                </button>
                {model.consumables.items.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 gap-1.5 items-center">
                    <input value={it.description} onChange={(e) => onChange((p) => ({ ...p, consumables: { ...p.consumables, items: p.consumables.items.map((x) => (x.id === it.id ? { ...x, description: e.target.value } : x)) } }))} className={`${inp} col-span-6`} />
                    <input type="number" value={it.quantity} onChange={(e) => onChange((p) => ({ ...p, consumables: { ...p.consumables, items: p.consumables.items.map((x) => (x.id === it.id ? { ...x, quantity: num(e.target.value) } : x)) } }))} className={`${inp} col-span-2 font-mono`} />
                    <input type="number" value={it.unitCost} onChange={(e) => onChange((p) => ({ ...p, consumables: { ...p.consumables, items: p.consumables.items.map((x) => (x.id === it.id ? { ...x, unitCost: num(e.target.value) } : x)) } }))} className={`${inp} col-span-3 font-mono`} />
                    <button type="button" onClick={() => onChange((p) => ({ ...p, consumables: { ...p.consumables, items: p.consumables.items.filter((x) => x.id !== it.id) } }))} className="col-span-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-white">Maquinário, Movimentação &amp; Ferramental</h4>
                <p className="text-[11px] text-slate-400">Suporta hora, diária, semana, mês, serviço ou deslocamento — sem limitar apenas a meses.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const preset = MACHINERY_CATALOG_PRESETS.find((x) => x.name === e.target.value);
                    e.target.value = '';
                    if (!preset) return;
                    onChange((p) => ({
                      ...p,
                      machinery: [
                        ...p.machinery,
                        { id: `mq_${Date.now()}`, name: preset.name, ownership: 'locado', unit: preset.unit, quantity: 1, duration: 1, unitPrice: preset.unitPrice, factor: 1 },
                      ],
                    }));
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 cursor-pointer"
                >
                  <option value="">+ Catálogo rápido...</option>
                  {MACHINERY_CATALOG_PRESETS.map((m) => (
                    <option key={m.name} value={m.name}>{m.name} ({brl(m.unitPrice)}/{m.unit})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      machinery: [...p.machinery, { id: `mq_${Date.now()}`, name: 'Equipamento / Ferramental', ownership: 'locado', unit: 'mes', quantity: 1, duration: 1, unitPrice: 0, factor: 1 }],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
                >
                  <Plus className="w-3.5 h-3.5" /> Equipamento
                </button>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[740px]">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                    <th className="py-2 pr-2">Equipamento</th>
                    <th className="py-2 px-1 w-24">Origem</th>
                    <th className="py-2 px-1 w-24">Unidade</th>
                    <th className="py-2 px-1 w-14">Qtd</th>
                    <th className="py-2 px-1 w-16">Período</th>
                    <th className="py-2 px-1 w-24">Valor Unit.</th>
                    <th className="py-2 px-1 w-14">Fator</th>
                    <th className="py-2 px-2 text-right">Total</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {model.machinery.map((m) => {
                    const tot = r2(m.quantity * m.duration * m.unitPrice * (m.factor || 1));
                    const upd = (patch: Partial<typeof m>) =>
                      onChange((p) => ({ ...p, machinery: p.machinery.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) }));
                    return (
                      <tr key={m.id}>
                        <td className="py-1.5 pr-1"><input value={m.name} onChange={(e) => upd({ name: e.target.value })} className={inp} /></td>
                        <td className="py-1.5 px-1">
                          <select value={m.ownership} onChange={(e) => upd({ ownership: e.target.value as typeof m.ownership })} className={inp}>
                            <option value="locado">Locado</option>
                            <option value="proprio">Próprio</option>
                            <option value="terceirizado">Terceirizado</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-1">
                          <select value={m.unit} onChange={(e) => upd({ unit: e.target.value as MachineryUnit })} className={inp}>
                            <option value="hora">Hora</option>
                            <option value="diaria">Diária</option>
                            <option value="semana">Semana</option>
                            <option value="mes">Mês</option>
                            <option value="servico">Serviço</option>
                            <option value="deslocamento">Desloc.</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-1"><input type="number" value={m.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                        <td className="py-1.5 px-1"><input type="number" step="0.5" value={m.duration} onChange={(e) => upd({ duration: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                        <td className="py-1.5 px-1"><input type="number" value={m.unitPrice} onChange={(e) => upd({ unitPrice: num(e.target.value) })} className={`${inp} font-mono text-right`} /></td>
                        <td className="py-1.5 px-1"><input type="number" step="0.05" value={m.factor} onChange={(e) => upd({ factor: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                        <td className="py-1.5 px-2 text-right font-mono text-white font-semibold">{brl(tot)}</td>
                        <td className="py-1.5 text-right">
                          <button type="button" onClick={() => onChange((p) => ({ ...p, machinery: p.machinery.filter((x) => x.id !== m.id) }))} className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {model.machinery.length === 0 && (
                    <tr><td colSpan={9} className="py-4 text-center text-slate-500">Nenhum equipamento adicionado. Use o catálogo rápido acima.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. CANTEIRO (FRETE AUTO CONTAINER), MOB&DESMOB E TERCEIROS ── */}
      {activeSubTab === 'canteiro_mob_terc' && (
        <div className="space-y-4">
          <div className={card}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white">Canteiro de Obra (Dependência automática de frete em containers)</h4>
                <p className="text-[11px] text-slate-400">Ao marcar como container, 2 fretes (instalação + retirada) são somados automaticamente por unidade.</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      siteInfra: [
                        ...p.siteInfra,
                        { id: `si_${Date.now()}`, group: 'estrutura', description: 'Container Almoxarifado 20 pés', isContainer: true, quantity: 1, months: 2, unitCost: 1500, freightPerTrip: 900 },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
                >
                  <Plus className="w-3.5 h-3.5" /> Container (c/ 2 fretes)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      siteInfra: [...p.siteInfra, { id: `si_${Date.now()}`, group: 'instalacoes', description: 'Instalação elétrica / água / internet', isContainer: false, quantity: 1, months: 1, unitCost: 0 }],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
                >
                  <Plus className="w-3.5 h-3.5" /> Item Canteiro
                </button>
              </div>
            </div>
            {model.siteInfra.map((item) => {
              const total = r2(item.quantity * item.months * item.unitCost + (item.isContainer ? item.quantity * 2 * (item.freightPerTrip || 0) : 0));
              const upd = (patch: Partial<typeof item>) =>
                onChange((p) => ({ ...p, siteInfra: p.siteInfra.map((x) => (x.id === item.id ? { ...x, ...patch } : x)) }));
              return (
                <div key={item.id} className="grid grid-cols-12 gap-1.5 items-center text-xs">
                  <input value={item.description} onChange={(e) => upd({ description: e.target.value })} className={`${inp} col-span-4`} />
                  <input type="number" value={item.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} title="Qtd" className={`${inp} col-span-1 font-mono`} />
                  <input type="number" value={item.months} onChange={(e) => upd({ months: num(e.target.value) })} title="Meses" className={`${inp} col-span-1 font-mono`} />
                  <input type="number" value={item.unitCost} onChange={(e) => upd({ unitCost: num(e.target.value) })} title="Valor/mês" className={`${inp} col-span-2 font-mono`} />
                  <div className="col-span-2">
                    {item.isContainer ? (
                      <input type="number" value={item.freightPerTrip || 0} onChange={(e) => upd({ freightPerTrip: num(e.target.value) })} title="Frete por viagem (×2 automático)" placeholder="Frete/viag." className={`${inp} font-mono border-amber-700/60`} />
                    ) : (
                      <span className="text-[10px] text-slate-500">Sem frete auto</span>
                    )}
                  </div>
                  <span className="col-span-1 text-right font-mono font-semibold text-white">{brl(total)}</span>
                  <button type="button" onClick={() => onChange((p) => ({ ...p, siteInfra: p.siteInfra.filter((x) => x.id !== item.id) }))} className="col-span-1 text-right text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5 ml-auto" /></button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white">Mobilização &amp; Desmobilização (separados)</h4>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      mobDesmob: [...p.mobDesmob, { id: `md_${Date.now()}`, phase: 'mobilizacao', description: 'Frete / Pipe Shop', quantity: 1, unitCost: 0 }],
                    }))
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-blue-300 text-xs font-semibold cursor-pointer"
                >
                  + Item
                </button>
              </div>
              {model.mobDesmob.map((md) => {
                const upd = (patch: Partial<typeof md>) =>
                  onChange((p) => ({ ...p, mobDesmob: p.mobDesmob.map((x) => (x.id === md.id ? { ...x, ...patch } : x)) }));
                return (
                  <div key={md.id} className="grid grid-cols-12 gap-1.5 items-center text-xs">
                    <select value={md.phase} onChange={(e) => upd({ phase: e.target.value as typeof md.phase })} className={`${inp} col-span-3`}>
                      <option value="mobilizacao">Mobilização</option>
                      <option value="desmobilizacao">Desmob.</option>
                    </select>
                    <input value={md.description} onChange={(e) => upd({ description: e.target.value })} className={`${inp} col-span-4`} />
                    <input type="number" value={md.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} className={`${inp} col-span-2 font-mono`} />
                    <input type="number" value={md.unitCost} onChange={(e) => upd({ unitCost: num(e.target.value) })} className={`${inp} col-span-2 font-mono`} />
                    <button type="button" onClick={() => onChange((p) => ({ ...p, mobDesmob: p.mobDesmob.filter((x) => x.id !== md.id) }))} className="col-span-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>

            <div className={card}>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white">Contratação de Terceiros (com rastreabilidade de cotação)</h4>
                <button
                  type="button"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      thirdParty: [
                        ...p.thirdParty,
                        { id: `tp_${Date.now()}`, description: 'Endoscopia / Alvenaria / ART', supplier: '', quoteNumber: '', validityDate: '', paymentCondition: '30 DDL', quantity: 1, unitCost: 0 },
                      ],
                    }))
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-blue-300 text-xs font-semibold cursor-pointer"
                >
                  + Terceiro
                </button>
              </div>
              {model.thirdParty.map((tp) => {
                const upd = (patch: Partial<typeof tp>) =>
                  onChange((p) => ({ ...p, thirdParty: p.thirdParty.map((x) => (x.id === tp.id ? { ...x, ...patch } : x)) }));
                return (
                  <div key={tp.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs">
                    <div className="grid grid-cols-12 gap-1.5 items-center">
                      <input value={tp.description} onChange={(e) => upd({ description: e.target.value })} placeholder="Escopo do serviço" className={`${inp} col-span-6`} />
                      <input type="number" value={tp.quantity} onChange={(e) => upd({ quantity: num(e.target.value) })} className={`${inp} col-span-2 font-mono`} />
                      <input type="number" value={tp.unitCost} onChange={(e) => upd({ unitCost: num(e.target.value) })} className={`${inp} col-span-3 font-mono`} />
                      <button type="button" onClick={() => onChange((p) => ({ ...p, thirdParty: p.thirdParty.filter((x) => x.id !== tp.id) }))} className="col-span-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <input value={tp.supplier} onChange={(e) => upd({ supplier: e.target.value })} placeholder="Fornecedor" className={inp} />
                      <input value={tp.quoteNumber} onChange={(e) => upd({ quoteNumber: e.target.value })} placeholder="Nº Cotação" className={inp} />
                      <input value={tp.paymentCondition} onChange={(e) => upd({ paymentCondition: e.target.value })} placeholder="Cond. Pagto" className={inp} />
                    </div>
                  </div>
                );
              })}
              {model.thirdParty.length === 0 && <p className="text-xs text-slate-500 text-center py-3">Nenhum serviço terceirizado lançado.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. PARÂMETROS HH (TABELA CENTRALIZADA VERSIONADA NA PROPOSTA) ── */}
      {activeSubTab === 'parametros_hh' && (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-white">Tabela de Referência HH (snapshot preservado nesta revisão)</h4>
              <p className="text-[11px] text-slate-400">
                Fórmula: HH Custo = (Salário + Benefícios + Encargos + EPIs) ÷ (h/dia × dias/mês). Desmarque &ldquo;Manual&rdquo; para recalcular automaticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={syncRatesIntoPhases}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Aplicar nas fases deste orçamento
            </button>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs min-w-[820px]">
              <thead>
                <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-2">Função</th>
                  <th className="py-2 px-1 w-20">Salário</th>
                  <th className="py-2 px-1 w-20">Benef.</th>
                  <th className="py-2 px-1 w-20">Encargos</th>
                  <th className="py-2 px-1 w-16">EPIs</th>
                  <th className="py-2 px-1 w-16">Marg.%</th>
                  <th className="py-2 px-1 w-16 text-center">Manual</th>
                  <th className="py-2 px-1 w-24">HH Custo</th>
                  <th className="py-2 px-1 w-24">HH Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {model.roleRates.map((r) => {
                  const calc = computeRoleHH(r);
                  const upd = (patch: Partial<typeof r>) =>
                    onChange((p) => ({ ...p, roleRates: p.roleRates.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }));
                  return (
                    <tr key={r.id}>
                      <td className="py-1.5 pr-1 font-semibold text-white">{r.roleName}</td>
                      <td className="py-1.5 px-1"><input type="number" value={r.salario} onChange={(e) => upd({ salario: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                      <td className="py-1.5 px-1"><input type="number" value={r.beneficios} onChange={(e) => upd({ beneficios: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                      <td className="py-1.5 px-1"><input type="number" value={r.encargos} onChange={(e) => upd({ encargos: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                      <td className="py-1.5 px-1"><input type="number" value={r.epis} onChange={(e) => upd({ epis: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                      <td className="py-1.5 px-1"><input type="number" value={r.margemComercialPercent} onChange={(e) => upd({ margemComercialPercent: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                      <td className="py-1.5 px-1 text-center"><input type="checkbox" checked={Boolean(r.useManualHH)} onChange={(e) => upd({ useManualHH: e.target.checked })} /></td>
                      <td className="py-1.5 px-1">
                        {r.useManualHH ? (
                          <input type="number" step="0.01" value={r.hhCusto} onChange={(e) => upd({ hhCusto: num(e.target.value) })} className={`${inp} font-mono`} />
                        ) : (
                          <span className="font-mono text-slate-200">{brl(calc.hhCusto)}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1">
                        {r.useManualHH ? (
                          <input type="number" step="0.01" value={r.hhVenda} onChange={(e) => upd({ hhVenda: num(e.target.value) })} className={`${inp} font-mono text-emerald-300`} />
                        ) : (
                          <span className="font-mono font-semibold text-emerald-400">{brl(calc.hhVenda)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
