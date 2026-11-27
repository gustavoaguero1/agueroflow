import React from 'react';
import {
  Plus,
  Trash2,
  ShieldAlert,
  TrendingUp,
  Printer,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Sliders,
} from 'lucide-react';
import {
  BILLING_COMPANY_TAX_PRESETS,
  CATEGORY_WEIGHTS,
  PAYMENT_TERM_RATES,
  calculateRiskEntry,
  r2,
  type AgueroInoxBudgetModel,
  type AgueroInoxBudgetResult,
  type BillingCompanyId,
  type BillingPurpose,
  type ClientPresentationTemplate,
  type ContingencyMode,
  type RiskStrategy,
} from '../../../services/agueroInoxPricingEngine';

const brl = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const inp =
  'w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500';
const card = 'rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-3';

interface FinanceTabProps {
  model: AgueroInoxBudgetModel;
  result: AgueroInoxBudgetResult;
  onChange: (updater: (prev: AgueroInoxBudgetModel) => AgueroInoxBudgetModel) => void;
}

export const StudioFinanceTab: React.FC<FinanceTabProps> = ({ model, result, onChange }) => {
  const handleSelectCompany = (company: BillingCompanyId) => {
    const preset = BILLING_COMPANY_TAX_PRESETS[company];
    onChange((p) => ({
      ...p,
      taxes: {
        ...p.taxes,
        company,
        pisPercent: preset.pisPercent,
        cofinsPercent: preset.cofinsPercent,
        csllPercent: preset.csllPercent,
        irpjPercent: preset.irpjPercent,
        issPercent: preset.issPercent,
        icmsPercent: preset.icmsPercent,
        serviceEffectiveRatePercent: preset.serviceEffectiveRatePercent,
        materialEffectiveRatePercent: preset.materialEffectiveRatePercent,
        industrializationEffectiveRatePercent: preset.industrializationEffectiveRatePercent,
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Motor Tributário */}
        <div className={card}>
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-blue-400" /> Motor Tributário (Cálculo Por Dentro + Crédito ICMS)
          </h4>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[10px] text-slate-400">Empresa Faturadora</label>
              <select value={model.taxes.company} onChange={(e) => handleSelectCompany(e.target.value as BillingCompanyId)} className={inp}>
                {Object.entries(BILLING_COMPANY_TAX_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Finalidade do Faturamento</label>
              <select
                value={model.taxes.purpose}
                onChange={(e) => onChange((p) => ({ ...p, taxes: { ...p.taxes, purpose: e.target.value as BillingPurpose } }))}
                className={inp}
              >
                <option value="material_servico">Material / Serviço (combinado)</option>
                <option value="servico">Prestação de Serviços</option>
                <option value="venda">Venda de Materiais</option>
                <option value="industrializacao">Industrialização</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Alíquota Serviços (%)</label>
              <input type="number" step="0.05" value={model.taxes.serviceEffectiveRatePercent} onChange={(e) => onChange((p) => ({ ...p, taxes: { ...p.taxes, serviceEffectiveRatePercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Alíquota Materiais (%)</label>
              <input type="number" step="0.05" value={model.taxes.materialEffectiveRatePercent} onChange={(e) => onChange((p) => ({ ...p, taxes: { ...p.taxes, materialEffectiveRatePercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Alíquota Industrialização (%)</label>
              <input type="number" step="0.05" value={model.taxes.industrializationEffectiveRatePercent} onChange={(e) => onChange((p) => ({ ...p, taxes: { ...p.taxes, industrializationEffectiveRatePercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Crédito ICMS Padrão (%)</label>
              <input type="number" step="0.5" value={model.taxes.icmsCreditDefaultPercent} onChange={(e) => onChange((p) => ({ ...p, taxes: { ...p.taxes, icmsCreditDefaultPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block">Divisor Serviços</span>
              <span className="font-mono font-bold text-blue-300">{result.serviceDivisor.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Divisor Materiais</span>
              <span className="font-mono font-bold text-cyan-300">{result.materialDivisor.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Total Impostos</span>
              <span className="font-mono font-bold text-amber-300">{brl(result.totalTaxesAmount)}</span>
            </div>
          </div>

          {/* Custos Administrativos Por Dentro */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <h5 className="text-[11px] font-bold text-slate-300">Custos Administrativos (Cálculo Por Dentro: Base ÷ (1 − ΣAlíq.))</h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400">Adm. Central %</label>
                <input type="number" step="0.5" value={model.adminCosts.adminCentralPercent} onChange={(e) => onChange((p) => ({ ...p, adminCosts: { ...p.adminCosts, adminCentralPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Gerenc. Proj. %</label>
                <input type="number" step="0.5" value={model.adminCosts.gerenciamentoProjetoPercent} onChange={(e) => onChange((p) => ({ ...p, adminCosts: { ...p.adminCosts, gerenciamentoProjetoPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">OHS / Gestão %</label>
                <input type="number" step="0.5" value={model.adminCosts.ohsGestaoPercent} onChange={(e) => onChange((p) => ({ ...p, adminCosts: { ...p.adminCosts, ohsGestaoPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Comissão Adm %</label>
                <input type="number" step="0.5" value={model.adminCosts.comissaoAdmPercent} onChange={(e) => onChange((p) => ({ ...p, adminCosts: { ...p.adminCosts, comissaoAdmPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Custo administrativo calculado: <strong className="font-mono text-white">{brl(result.totalAdminCost)}</strong>
            </p>
          </div>
        </div>

        {/* Condições Comerciais & Simulador de Negociação */}
        <div className={card}>
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-emerald-400" /> Condições Comerciais &amp; Simulador de Negociação
          </h4>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-400">Prazo de Pagamento (Custo Financeiro)</label>
              <select
                value={model.conditions.paymentTermCode}
                onChange={(e) => {
                  const code = e.target.value as keyof typeof PAYMENT_TERM_RATES;
                  onChange((p) => ({
                    ...p,
                    conditions: { ...p.conditions, paymentTermCode: code, financialTermPercent: PAYMENT_TERM_RATES[code].rate },
                  }));
                }}
                className={inp}
              >
                {Object.entries(PAYMENT_TERM_RATES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Margem Padrão Serviços (%)</label>
              <input type="number" step="1" value={model.conditions.defaultServiceMarginPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, defaultServiceMarginPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Antecipação (%)</label>
              <input type="number" step="0.5" value={model.conditions.anticipationPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, anticipationPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Reserva Desconto Previsto (% por dentro)</label>
              <input type="number" step="0.5" value={model.conditions.plannedDiscountPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, plannedDiscountPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Comissão Comercial (% por dentro)</label>
              <input type="number" step="0.5" value={model.conditions.commercialCommissionPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, commercialCommissionPercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Seguro / Fiança Bancária (%)</label>
              <input type="number" step="0.5" value={model.conditions.bankInsurancePercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, bankInsurancePercent: num(e.target.value) } }))} className={`${inp} font-mono`} />
            </div>
            <div>
              <label className="text-[10px] text-amber-300 font-semibold">Desconto Extra Fechamento (%)</label>
              <input type="number" step="0.5" min={0} max={50} value={model.conditions.extraClosingDiscountPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, extraClosingDiscountPercent: num(e.target.value) } }))} className={`${inp} font-mono border-amber-600/60`} />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Reserva de desconto previsto</span><span className="font-mono text-slate-200">{brl(result.plannedDiscountReserve)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Comissão comercial</span><span className="font-mono text-slate-200">{brl(result.commercialCommissionAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Custo financeiro + Antecipação + Fiança</span><span className="font-mono text-slate-200">{brl(r2(result.financialCostAmount + result.anticipationAmount + result.bankInsuranceAmount))}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Preço antes do desconto extra</span><span className="font-mono text-white font-semibold">{brl(result.priceBeforeExtraDiscount)}</span></div>
            {result.extraClosingDiscountAmount > 0 && (
              <div className="flex justify-between text-amber-300"><span>Redução extra de fechamento</span><span className="font-mono">−{brl(result.extraClosingDiscountAmount)}</span></div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-slate-800 text-sm font-extrabold">
              <span className="text-white">Preço Final Negociado</span>
              <span className="font-mono text-emerald-400">{brl(result.finalSellingPrice)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* DRE & Análise de Viabilidade (Aba ANALISE) */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-cyan-400" /> Análise de Viabilidade Comercial &amp; DRE (Aba ANALISE)
            </h4>
            <p className="text-[11px] text-slate-400">
              Separação real entre Margem (Custo ÷ (1 − m)) e Refaturamento (Custo × (1 + r)).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-300">
              <span>Despesas Fixas (%)</span>
              <input type="number" step="1" value={model.conditions.fixedOverheadPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, fixedOverheadPercent: num(e.target.value) } }))} className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono" />
            </label>
            <label className="flex items-center gap-1.5 text-slate-300">
              <span>Meta Lucro (%)</span>
              <input type="number" step="1" value={model.conditions.targetProfitPercent} onChange={(e) => onChange((p) => ({ ...p, conditions: { ...p.conditions, targetProfitPercent: num(e.target.value) } }))} className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono" />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Venda Líquida</span>
            <strong className="font-mono text-white text-sm">{brl(result.netRevenueAfterTax)}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Custo Total Projeto</span>
            <strong className="font-mono text-slate-200 text-sm">{brl(result.totalProjectCost)}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Despesas Fixas ({model.conditions.fixedOverheadPercent}%)</span>
            <strong className="font-mono text-amber-300 text-sm">{brl(result.fixedOverheadAmount)}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Contrib. Mín / Máx</span>
            <strong className="font-mono text-cyan-300 text-xs">{brl(result.minContributionAmount)} / {brl(result.maxContributionAmount)}</strong>
          </div>
          <div className={`p-3 rounded-xl border ${result.estimatedNetResult >= 0 ? 'bg-emerald-950/35 border-emerald-700/50' : 'bg-rose-950/40 border-rose-700/60'}`}>
            <span className="text-[10px] text-slate-300 block">Resultado Líquido</span>
            <strong className={`font-mono text-sm ${result.estimatedNetResult >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {brl(result.estimatedNetResult)} ({result.estimatedNetResultPercent.toFixed(1)}%)
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-blue-950/35 border border-blue-700/50">
            <span className="text-[10px] text-blue-200 block">Preço Sugerido (Meta {model.conditions.targetProfitPercent}%)</span>
            <strong className="font-mono text-blue-300 text-sm">{brl(result.suggestedPriceForTargetProfit)}</strong>
            <span className="text-[10px] text-slate-400 block">Markup atual: {result.effectiveMarkupMultiplier}×</span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RiskClientTabProps {
  model: AgueroInoxBudgetModel;
  result: AgueroInoxBudgetResult;
  onChange: (updater: (prev: AgueroInoxBudgetModel) => AgueroInoxBudgetModel) => void;
  history: Array<{ date: string; action: string; userName: string; details?: string }>;
  onPrintProposal: () => void;
  onCreateNewRevision: () => void;
}

const CRITERIA_LABELS = {
  client: [
    '1 — Acesso fácil, sem exigências documentais',
    '2 — Documentação padrão e liberdade de trabalho',
    '3 — Avaliação documental, OHS e permissões de trabalho',
    '4 — Alto grau de exigências, cliente colaborativo',
    '5 — Alto grau de exigências, cliente não colaborativo',
  ],
  location: [
    '1 — Galpão Aguero Inox',
    '2 — Capitais e regiões metro. Sul/Sudeste/CO',
    '3 — Capitais e grandes cidades do interior',
    '4 — Interior distante de centros urbanos',
    '5 — Interior das regiões Norte e Nordeste',
  ],
  complexity: [
    '1 — Produto padrão',
    '2 — Segmento industrial regular',
    '3 — Equipamento específico / tubulação sanitária',
    '4 — Prazo crítico / janela reduzida',
    '5 — Restrições severas de execução e acesso',
  ],
};

export const StudioRiskClientTab: React.FC<RiskClientTabProps> = ({
  model,
  result,
  onChange,
  history,
  onPrintProposal,
  onCreateNewRevision,
}) => {
  const cat = result.categoryResult;

  // Tetra Pak grouped view derived dynamically from the exact same budget (no manual zeroed subtotals!)
  const getGroup = (id: string) => result.groups.find((g) => g.id === id);
  const tetrapakRows = [
    { label: 'Mão de Obra Principal (Pipe Rack / Tubulação / Montagem)', value: getGroup('mao_de_obra')?.sellWithTax || 0 },
    { label: 'Equipe de Suporte & Gerenciamento (Adm + Terceiros)', value: r2((getGroup('administrativo')?.sellWithTax || 0) + (getGroup('terceiros')?.sellWithTax || 0)) },
    { label: 'Equipe de Comissionamento & Start-Up', value: getGroup('comissionamento')?.sellWithTax || 0 },
    { label: 'Infraestrutura, Canteiro & Maquinário', value: r2((getGroup('canteiro')?.sellWithTax || 0) + (getGroup('maquinario')?.sellWithTax || 0) + (getGroup('mob_desmob')?.sellWithTax || 0)) },
    { label: 'Materiais Mecânicos, Elétricos & Consumíveis', value: r2((getGroup('materiais')?.sellWithTax || 0) + (getGroup('consumiveis')?.sellWithTax || 0)) },
    { label: 'Despesas de Execução (Hospedagem, Alimentação, Transporte)', value: getGroup('despesas_pessoal')?.sellWithTax || 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Classificação 1..5 com pesos 10/20/30/40/200 */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> Classificação Comercial do Projeto (Pesos: 10 / 20 / 30 / 40 / 200)
            </h4>
            <p className="text-[11px] text-slate-400">A categoria final é a de maior pontuação acumulada. Categorias 4 e 5 sinalizam aprovação da Diretoria.</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${cat.finalCategory >= 4 ? 'bg-rose-950/60 text-rose-300 border-rose-700' : 'bg-blue-950/60 text-blue-300 border-blue-700'}`}>
            Categoria {cat.finalCategory} {cat.requiresDirectorApproval ? '· Requer Diretoria' : '· Alçada Comercial'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div>
            <label className="text-[10px] text-slate-400">1. Cliente</label>
            <select value={model.categoryCriteria.clientScore} onChange={(e) => onChange((p) => ({ ...p, categoryCriteria: { ...p.categoryCriteria, clientScore: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } }))} className={inp}>
              {CRITERIA_LABELS.client.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400">2. Localidade</label>
            <select value={model.categoryCriteria.locationScore} onChange={(e) => onChange((p) => ({ ...p, categoryCriteria: { ...p.categoryCriteria, locationScore: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } }))} className={inp}>
              {CRITERIA_LABELS.location.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400">3. Complexidade</label>
            <select value={model.categoryCriteria.complexityScore} onChange={(e) => onChange((p) => ({ ...p, categoryCriteria: { ...p.categoryCriteria, complexityScore: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } }))} className={inp}>
              {CRITERIA_LABELS.complexity.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 flex items-center justify-between">
              <span>4. Valor do Projeto</span>
              <span className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={model.categoryCriteria.valueScoreAuto} onChange={(e) => onChange((p) => ({ ...p, categoryCriteria: { ...p.categoryCriteria, valueScoreAuto: e.target.checked } }))} />
                Auto
              </span>
            </label>
            <select
              disabled={model.categoryCriteria.valueScoreAuto}
              value={cat.valueScore}
              onChange={(e) => onChange((p) => ({ ...p, categoryCriteria: { ...p.categoryCriteria, manualValueScore: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } }))}
              className={`${inp} disabled:opacity-60`}
            >
              <option value={1}>1 — Até R$ 200 mil</option>
              <option value={2}>2 — Até R$ 500 mil</option>
              <option value={3}>3 — Até R$ 1 milhão</option>
              <option value={4}>4 — Até R$ 4 milhões</option>
              <option value={5}>5 — Acima de R$ 4 milhões</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <div key={n} className={`p-2 rounded-xl border ${cat.finalCategory === n ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
              <span className="text-[10px] block">Cat. {n} (peso {CATEGORY_WEIGHTS[n]})</span>
              <strong className="font-mono text-sm">{cat.scoresByCategory[n]} pts</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Matriz de Riscos & Contingências */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" /> Matriz de Riscos &amp; Contingência Conectada ao Orçamento
            </h4>
            <p className="text-[11px] text-slate-400">
              Contingência aplicada no preço: <strong className="font-mono text-white">{brl(result.contingencyAmount)}</strong> (Matriz: {brl(result.riskMatrixReserveTotal)} + Ações: {brl(result.riskActionCostTotal)}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={model.contingencyMode}
              onChange={(e) => onChange((p) => ({ ...p, contingencyMode: e.target.value as ContingencyMode }))}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              <option value="percentual">Contingência Percentual</option>
              <option value="matriz_riscos">Conectada à Matriz de Riscos</option>
              <option value="misto">Misto (maior valor + ações, s/ duplicidade)</option>
            </select>
            {model.contingencyMode !== 'matriz_riscos' && (
              <input
                type="number"
                step="0.5"
                value={model.contingencyManualPercent}
                onChange={(e) => onChange((p) => ({ ...p, contingencyManualPercent: num(e.target.value) }))}
                className="w-16 px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                title="Contingência percentual (%)"
              />
            )}
            <button
              type="button"
              onClick={() =>
                onChange((p) => ({
                  ...p,
                  risks: [
                    ...p.risks,
                    {
                      id: `rk_${Date.now()}`,
                      rootCause: 'Atraso na liberação de área / PT',
                      effect: 'Ociosidade de equipe em campo',
                      costAtRisk: 25000,
                      probability: 5,
                      impact: 6,
                      strategy: 'mitigar',
                      action: 'Alinhar cronograma prévio com cliente',
                      actionCost: 1500,
                      residualProbability: 2,
                      residualImpact: 4,
                    },
                  ],
                }))
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold cursor-pointer apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" /> Risco
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs min-w-[820px]">
            <thead>
              <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-2">Causa Raiz / Efeito</th>
                <th className="py-2 px-1 w-24">Custo Risco</th>
                <th className="py-2 px-1 w-14">Prob.</th>
                <th className="py-2 px-1 w-14">Imp.</th>
                <th className="py-2 px-1 w-24">Estratégia</th>
                <th className="py-2 px-1 w-24">Custo Ação</th>
                <th className="py-2 px-2 text-right">Score / Contingência</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {model.risks.map((rk) => {
                const c = calculateRiskEntry(rk);
                const upd = (patch: Partial<typeof rk>) =>
                  onChange((p) => ({ ...p, risks: p.risks.map((x) => (x.id === rk.id ? { ...x, ...patch } : x)) }));
                return (
                  <tr key={rk.id}>
                    <td className="py-1.5 pr-1 space-y-1">
                      <input value={rk.rootCause} onChange={(e) => upd({ rootCause: e.target.value })} placeholder="Causa raiz" className={inp} />
                      <input value={rk.action} onChange={(e) => upd({ action: e.target.value })} placeholder="Ação de tratamento" className={`${inp} text-[11px] text-slate-300`} />
                    </td>
                    <td className="py-1.5 px-1"><input type="number" value={rk.costAtRisk} onChange={(e) => upd({ costAtRisk: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1"><input type="number" min={1} max={10} value={rk.probability} onChange={(e) => upd({ probability: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1"><input type="number" min={1} max={10} value={rk.impact} onChange={(e) => upd({ impact: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-1">
                      <select value={rk.strategy} onChange={(e) => upd({ strategy: e.target.value as RiskStrategy })} className={inp}>
                        <option value="aceitar">Aceitar</option>
                        <option value="mitigar">Mitigar</option>
                        <option value="transferir">Transferir</option>
                        <option value="evitar">Evitar</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-1"><input type="number" value={rk.actionCost} onChange={(e) => upd({ actionCost: num(e.target.value) })} className={`${inp} font-mono`} /></td>
                    <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                      <div className="text-slate-300">Score {c.scoreInitial}/100</div>
                      <div className="text-amber-300 font-bold">{brl(c.totalRiskImpact)}</div>
                    </td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => onChange((p) => ({ ...p, risks: p.risks.filter((x) => x.id !== rk.id) }))} className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
              {model.risks.length === 0 && (
                <tr><td colSpan={8} className="py-4 text-center text-slate-500">Nenhum risco cadastrado. Adicione riscos ou use Contingência Percentual.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modelos de Apresentação por Cliente (Padrão / Tetra Pak / Price Breakdown) + Revisões */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-white">Apresentação Comercial por Cliente</h4>
            <div className="flex gap-1.5">
              <select
                value={model.presentationTemplate}
                onChange={(e) => onChange((p) => ({ ...p, presentationTemplate: e.target.value as ClientPresentationTemplate }))}
                className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
              >
                <option value="padrao">Padrão Aguero Inox</option>
                <option value="tetrapak">Modelo Tetra Pak (por escopo)</option>
                <option value="breakdown">Price Breakdown (Materiais × Serviços)</option>
              </select>
              <button
                type="button"
                onClick={onPrintProposal}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer apple-solid-btn"
              >
                <Printer className="w-3.5 h-3.5" /> Proposta PDF
              </button>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            {model.presentationTemplate === 'tetrapak' &&
              tetrapakRows.map((row) => (
                <div key={row.label} className="flex justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">{row.label}</span>
                  <strong className="font-mono text-white">{brl(row.value)}</strong>
                </div>
              ))}
            {model.presentationTemplate === 'breakdown' && (
              <>
                <div className="flex justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">Fornecimento de Materiais (c/ impostos)</span>
                  <strong className="font-mono text-cyan-300">{brl(result.breakdownMaterialsGross)}</strong>
                </div>
                <div className="flex justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-300">Prestação de Serviços &amp; Montagem (c/ impostos)</span>
                  <strong className="font-mono text-emerald-400">{brl(result.breakdownServicesGross)}</strong>
                </div>
              </>
            )}
            {model.presentationTemplate === 'padrao' &&
              result.groups
                .filter((g) => g.sellWithTax > 0)
                .map((g) => (
                  <div key={g.id} className="flex justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-300">{g.label}</span>
                    <strong className="font-mono text-white">{brl(g.sellWithTax)}</strong>
                  </div>
                ))}
            <div className="flex justify-between p-2.5 rounded-xl bg-emerald-950/35 border border-emerald-700/50 font-bold">
              <span className="text-emerald-200">Total da Proposta Comercial</span>
              <span className="font-mono text-emerald-300">{brl(result.finalSellingPrice)}</span>
            </div>
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white">Histórico de Revisões (Snapshot Imutável)</h4>
            <button
              type="button"
              onClick={onCreateNewRevision}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs font-semibold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" /> Gerar Nova Revisão
            </button>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1 text-xs">
            {history.length === 0 ? (
              <p className="text-slate-500 text-center py-4">Sem registros anteriores.</p>
            ) : (
              [...history].reverse().map((h, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-white flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {h.action}
                    </span>
                    <span className="text-slate-500">{new Date(h.date).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{h.userName}{h.details ? ` · ${h.details}` : ''}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
