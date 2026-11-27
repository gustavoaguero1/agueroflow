import React, { useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Cpu,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  BILLING_COMPANY_TAX_PRESETS,
  computeMachineHourlyRate,
  computeRoleHH,
  createDefaultEngineeringParams,
  type BillingCompanyId,
  type CommercialEngineeringParams,
} from '../../services/agueroInoxPricingEngine';

interface Props {
  initialParams?: Partial<CommercialEngineeringParams>;
  canEdit: boolean;
  onSaveParams: (params: CommercialEngineeringParams) => Promise<void>;
}

const brl = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const inp =
  'w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-60';
const card = 'rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-3';

export const CommercialEngineeringParamsPanel: React.FC<Props> = ({
  initialParams,
  canEdit,
  onSaveParams,
}) => {
  const [params, setParams] = useState<CommercialEngineeringParams>(() => {
    const def = createDefaultEngineeringParams();
    return {
      ...def,
      ...initialParams,
      roleRates:
        initialParams?.roleRates && initialParams.roleRates.length > 0
          ? initialParams.roleRates.map((r) => ({ ...r }))
          : def.roleRates,
      machineCalculator: {
        ...def.machineCalculator!,
        ...(initialParams?.machineCalculator || {}),
      },
    };
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const machineResult = useMemo(
    () => computeMachineHourlyRate(params.machineCalculator || createDefaultEngineeringParams().machineCalculator!),
    [params.machineCalculator],
  );

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setSavedMsg('');
    try {
      await onSaveParams(params);
      setSavedMsg('Parâmetros permanentes de Engenharia Comercial salvos! Novos orçamentos já herdam estes valores.');
      window.setTimeout(() => setSavedMsg(''), 4500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            Cadastros &amp; Parâmetros Permanentes — Aguero Inox
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Atualize salários, diárias, consumíveis e taxas em um só lugar. Novos orçamentos herdam automaticamente; revisões antigas preservam seus valores originais.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-950/50 border border-amber-700/60 text-[11px] text-amber-300">
              <ShieldCheck className="w-3.5 h-3.5" /> Somente leitura (Admin/Gerente edita)
            </span>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Restaurar os valores de referência padrão da planilha Aguero Inox?')) {
                    setParams(createDefaultEngineeringParams());
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar padrão
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl af-btn-primary text-xs font-bold cursor-pointer apple-solid-btn disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Salvando...' : 'Salvar Parâmetros'}
              </button>
            </>
          )}
        </div>
      </div>

      {savedMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {/* 1. Tabela Permanente de HH por Função */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Tabela Permanente de Hora-Homem (HH)</h4>
            <p className="text-[11px] text-slate-400">HH Custo = (Salário + Benefícios + Encargos + EPIs) ÷ (8,8h × 22 dias)</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() =>
                setParams((p) => ({
                  ...p,
                  roleRates: [
                    ...p.roleRates,
                    {
                      id: `role_${Date.now()}`,
                      roleName: 'Nova Função',
                      salario: 4500,
                      beneficios: 1400,
                      encargos: 3600,
                      epis: 350,
                      horasDia: 8.8,
                      diasMes: 22,
                      margemComercialPercent: 30,
                      hhCusto: 50.88,
                      hhVenda: 72.68,
                      useManualHH: false,
                    },
                  ],
                }))
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" /> Função
            </button>
          )}
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
                <th className="py-2 px-1 w-14 text-center">Manual</th>
                <th className="py-2 px-1 w-24">HH Custo</th>
                <th className="py-2 px-1 w-24">HH Venda</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {params.roleRates.map((r) => {
                const calc = computeRoleHH(r);
                const upd = (patch: Partial<typeof r>) =>
                  setParams((p) => ({
                    ...p,
                    roleRates: p.roleRates.map((x) => (x.id === r.id ? { ...x, ...patch } : x)),
                  }));
                return (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-1">
                      <input disabled={!canEdit} value={r.roleName} onChange={(e) => upd({ roleName: e.target.value })} className={inp} />
                    </td>
                    <td className="py-1.5 px-1"><input disabled={!canEdit} type="number" value={r.salario} onChange={(e) => upd({ salario: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1"><input disabled={!canEdit} type="number" value={r.beneficios} onChange={(e) => upd({ beneficios: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1"><input disabled={!canEdit} type="number" value={r.encargos} onChange={(e) => upd({ encargos: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1"><input disabled={!canEdit} type="number" value={r.epis} onChange={(e) => upd({ epis: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1"><input disabled={!canEdit} type="number" value={r.margemComercialPercent} onChange={(e) => upd({ margemComercialPercent: num(e.target.value), useManualHH: false })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1 text-center"><input disabled={!canEdit} type="checkbox" checked={Boolean(r.useManualHH)} onChange={(e) => upd({ useManualHH: e.target.checked })} /></td>
                    <td className="py-1.5 px-1">
                      {r.useManualHH ? (
                        <input disabled={!canEdit} type="number" step="0.01" value={r.hhCusto} onChange={(e) => upd({ hhCusto: num(e.target.value) })} className={`${inp} font-mono`} />
                      ) : (
                        <span className="font-mono text-slate-200">{brl(calc.hhCusto)}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-1">
                      {r.useManualHH ? (
                        <input disabled={!canEdit} type="number" step="0.01" value={r.hhVenda} onChange={(e) => upd({ hhVenda: num(e.target.value) })} className={`${inp} font-mono text-emerald-300`} />
                      ) : (
                        <span className="font-mono font-semibold text-emerald-400">{brl(calc.hhVenda)}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {canEdit && params.roleRates.length > 1 && (
                        <button type="button" onClick={() => setParams((p) => ({ ...p, roleRates: p.roleRates.filter((x) => x.id !== r.id) }))} className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Parâmetros Padrão de Campo, Impostos e Refaturamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Calculator className="w-4 h-4 text-cyan-400" /> Padrões de Obra, Despesas &amp; Refaturamento
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[10px] text-slate-400">Empresa Faturadora Padrão</label>
              <select disabled={!canEdit} value={params.defaultBillingCompany} onChange={(e) => setParams((p) => ({ ...p, defaultBillingCompany: e.target.value as BillingCompanyId }))} className={inp}>
                {Object.entries(BILLING_COMPANY_TAX_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div><label className="text-[10px] text-slate-400">Hospedagem/dia (R$)</label><input disabled={!canEdit} type="number" value={params.defaultHospedagemDiaria} onChange={(e) => setParams((p) => ({ ...p, defaultHospedagemDiaria: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Alimentação/dia (R$)</label><input disabled={!canEdit} type="number" value={params.defaultAlimentacaoDiaria} onChange={(e) => setParams((p) => ({ ...p, defaultAlimentacaoDiaria: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Combustível (R$/L)</label><input disabled={!canEdit} type="number" step="0.01" value={params.defaultFuelPricePerLiter} onChange={(e) => setParams((p) => ({ ...p, defaultFuelPricePerLiter: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Consumíveis (% MO)</label><input disabled={!canEdit} type="number" value={params.defaultConsumablesPercent} onChange={(e) => setParams((p) => ({ ...p, defaultConsumablesPercent: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Adm. Central (%)</label><input disabled={!canEdit} type="number" step="0.5" value={params.defaultAdminCentralPercent} onChange={(e) => setParams((p) => ({ ...p, defaultAdminCentralPercent: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Gerenc. Projeto (%)</label><input disabled={!canEdit} type="number" step="0.5" value={params.defaultGerenciamentoPercent} onChange={(e) => setParams((p) => ({ ...p, defaultGerenciamentoPercent: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Despesas Fixas (%)</label><input disabled={!canEdit} type="number" value={params.defaultFixedOverheadPercent} onChange={(e) => setParams((p) => ({ ...p, defaultFixedOverheadPercent: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Meta Lucro (%)</label><input disabled={!canEdit} type="number" value={params.defaultTargetProfitPercent} onChange={(e) => setParams((p) => ({ ...p, defaultTargetProfitPercent: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Margem Serviços (%)</label><input disabled={!canEdit} type="number" value={params.defaultServiceMarginPercent} onChange={(e) => setParams((p) => ({ ...p, defaultServiceMarginPercent: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Refat. Chapas/Tubos (%)</label><input disabled={!canEdit} type="number" value={params.defaultRefatChapas} onChange={(e) => setParams((p) => ({ ...p, defaultRefatChapas: num(e.target.value), defaultRefatTubos: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Refat. Pintura (%)</label><input disabled={!canEdit} type="number" value={params.defaultRefatPintura} onChange={(e) => setParams((p) => ({ ...p, defaultRefatPintura: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Refat. Frete (%)</label><input disabled={!canEdit} type="number" value={params.defaultRefatFrete} onChange={(e) => setParams((p) => ({ ...p, defaultRefatFrete: num(e.target.value) }))} className={`${inp} font-mono`} /></div>
          </div>
        </div>

        {/* 3. Calculadora Industrial de Custo-Hora de Máquina Própria (Aba Custos) */}
        <div className={card}>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-emerald-400" /> Calculadora de Máquina Própria (Aba Custos)
          </h4>
          <p className="text-[11px] text-slate-400">
            Depreciação + Energia elétrica + Manutenção anual + Área ocupada + Consumíveis por hora de uso fabril.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div><label className="text-[10px] text-slate-400">Valor Máquina (R$)</label><input type="number" value={params.machineCalculator?.acquisitionValue || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, acquisitionValue: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Vida útil (anos)</label><input type="number" min={1} value={params.machineCalculator?.usefulLifeYears || 10} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, usefulLifeYears: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Horas/mês</label><input type="number" min={1} value={params.machineCalculator?.monthlyHours || 176} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, monthlyHours: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Potência (kW)</label><input type="number" step="0.5" value={params.machineCalculator?.powerKw || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, powerKw: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Tarifa (R$/kWh)</label><input type="number" step="0.01" value={params.machineCalculator?.energyRatePerKwh || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, energyRatePerKwh: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Manut. anual (R$)</label><input type="number" value={params.machineCalculator?.annualMaintenanceCost || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, annualMaintenanceCost: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Área ocupada (m²)</label><input type="number" value={params.machineCalculator?.occupiedAreaM2 || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, occupiedAreaM2: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Aluguel/mês (R$/m²)</label><input type="number" value={params.machineCalculator?.monthlyRentPerM2 || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, monthlyRentPerM2: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
            <div><label className="text-[10px] text-slate-400">Consumíveis/ano (R$)</label><input type="number" value={params.machineCalculator?.annualConsumablesCost || 0} onChange={(e) => setParams((p) => ({ ...p, machineCalculator: { ...p.machineCalculator!, annualConsumablesCost: num(e.target.value) } }))} className={`${inp} font-mono`} /></div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400">
              <span>Depreciação: <strong className="font-mono text-slate-200">{brl(machineResult.depreciationPerHour)}/h</strong></span>
              <span>Energia: <strong className="font-mono text-slate-200">{brl(machineResult.energyPerHour)}/h</strong></span>
              <span>Manutenção: <strong className="font-mono text-slate-200">{brl(machineResult.maintenancePerHour)}/h</strong></span>
              <span>Área + Cons.: <strong className="font-mono text-slate-200">{brl(machineResult.spacePerHour + machineResult.consumablesPerHour)}/h</strong></span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
              <span className="font-bold text-white">Custo-Hora Total da Máquina</span>
              <strong className="font-mono text-base text-emerald-400">{brl(machineResult.totalHourlyCost)} / h</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
