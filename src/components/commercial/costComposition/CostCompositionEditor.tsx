import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Printer,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Wrench,
  Landmark,
  ShieldAlert,
  ChevronRight,
  BarChart3,
  Loader2,
  Send,
  Rocket,
  ShoppingCart,
  X,
} from 'lucide-react';
import type { CostComposition } from '../../../types/costComposition';
import type { CommercialMaterial, CommercialProposal } from '../../../types/commercial';
import { CostCompositionService } from '../../../services/costCompositionService';
import { saveProposal } from '../../../services/commercialService';
import { savePurchaseRequisition } from '../../../services/purchasingService';
import {
  BILLING_COMPANY_TAX_PRESETS,
  calculateAgueroInoxBudget,
  calculateBarTubeRow,
  calculateSheetRow,
  createDefaultAgueroInoxModel,
  r2,
  type AgueroInoxBudgetModel,
  type BillingCompanyId,
  type BillingPurpose,
  type DurationUnit,
} from '../../../services/agueroInoxPricingEngine';
import { StudioCostsTab, type CostSubTab } from './StudioCostsTab';
import { StudioFinanceTab, StudioRiskClientTab } from './StudioFinanceRiskTab';

interface CostCompositionEditorProps {
  composition: CostComposition;
  proposals: CommercialProposal[];
  catalog: CommercialMaterial[];
  onSave: (comp: CostComposition) => void;
  onBack: () => void;
  userId?: string;
  userName: string;
  userRole?: string;
  onProposalsChanged?: () => void | Promise<void>;
}

type StudioPillar = 'resumo' | 'custos' | 'financeiro' | 'riscos_cliente';

const brl = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const GROUP_TO_COST_TAB: Record<string, { pillar: StudioPillar; sub?: CostSubTab }> = {
  materiais: { pillar: 'custos', sub: 'materiais' },
  mao_de_obra: { pillar: 'custos', sub: 'equipes' },
  comissionamento: { pillar: 'custos', sub: 'equipes' },
  despesas_pessoal: { pillar: 'custos', sub: 'despesas' },
  consumiveis: { pillar: 'custos', sub: 'consumiveis_maq' },
  maquinario: { pillar: 'custos', sub: 'consumiveis_maq' },
  canteiro: { pillar: 'custos', sub: 'canteiro_mob_terc' },
  terceiros: { pillar: 'custos', sub: 'canteiro_mob_terc' },
  mob_desmob: { pillar: 'custos', sub: 'canteiro_mob_terc' },
  administrativo: { pillar: 'financeiro' },
};

function hydrateModel(comp: CostComposition): AgueroInoxBudgetModel {
  if (comp.agueroInoxModel) return comp.agueroInoxModel;
  const base = createDefaultAgueroInoxModel(comp.estimatedStartDate || comp.elaborationDate || new Date().toISOString().slice(0, 10));
  if (comp.executionTimeframeDays > 0) {
    base.durationQty = Math.max(1, Math.round(comp.executionTimeframeDays / 7));
    base.durationUnit = 'semanas';
    base.personnelExpenses.calendarDays = comp.executionTimeframeDays;
  }
  const legacyMat = (comp.items || [])
    .filter((i) => i.category === 'materiais')
    .reduce((s, i) => s + (Number(i.totalCost) || 0), 0);
  if (legacyMat > 0 && base.connections[0]) {
    base.connections[0].unitCost = r2(legacyMat);
  }
  return base;
}

const inp =
  'w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500';
const card = 'rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-3';

export const CostCompositionEditor: React.FC<CostCompositionEditorProps> = ({
  composition,
  proposals,
  catalog,
  onSave,
  onBack,
  userId,
  userName,
  userRole,
  onProposalsChanged,
}) => {
  const [comp, setComp] = useState<CostComposition>(composition);
  const [model, setModel] = useState<AgueroInoxBudgetModel>(() => hydrateModel(composition));
  const [pillar, setPillar] = useState<StudioPillar>('resumo');
  const [costSubTab, setCostSubTab] = useState<CostSubTab>('equipes');
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);

  const isDirectorOrAdmin = ['Super Admin', 'Admin', 'Master', 'Gerente'].includes(userRole || '');
  const result = useMemo(() => calculateAgueroInoxBudget(model), [model]);

  const updateModel = (updater: (prev: AgueroInoxBudgetModel) => AgueroInoxBudgetModel) => {
    setModel((prev) => updater(prev));
    setSaveNotice(null);
  };

  const handleSaveFirestore = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const payload: CostComposition = {
        ...comp,
        billingCompanyName: BILLING_COMPANY_TAX_PRESETS[model.taxes.company].label,
        executionTimeframeDays: result.calendarDays,
        estimatedStartDate: model.startDate,
        estimatedEndDate: result.endDate,
        agueroInoxModel: model,
        updatedBy: userName,
        updatedByName: userName,
        history: [
          ...(comp.history || []),
          {
            date: new Date().toISOString(),
            action: `Orçamento salvo (Rev ${comp.revision})`,
            userName,
            details: `Custo: ${brl(result.totalProjectCost)} · Venda: ${brl(result.finalSellingPrice)} · Resultado: ${result.estimatedNetResultPercent.toFixed(1)}%`,
          },
        ],
      };
      const saved = await CostCompositionService.saveComposition(payload);
      setComp(saved);
      onSave(saved);
      setSaveNotice('Orçamento salvo no Firestore com sucesso!');
      return saved;
    } catch (err) {
      console.error('Erro ao salvar composição:', err);
      setSaveError(
        `${err instanceof Error ? err.message : 'Erro ao gravar no Firestore.'} Nenhum salvamento local foi simulado.`,
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToProposal = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      const now = new Date().toISOString();
      const existing = proposals.find((p) => p.id === comp.proposalId);
      const grossMarginAmt = r2(result.finalSellingPrice - result.totalProjectCost);
      const grossMarginPct = result.finalSellingPrice > 0 ? r2((grossMarginAmt / result.finalSellingPrice) * 100) : 0;
      const proposalId = existing?.id || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const proposalCode = existing?.code || comp.code.replace(/^COMP-/, 'PROP-');
      const validityDate = new Date(Date.now() + (comp.proposalValidityDays || 20) * 86400000).toISOString().slice(0, 10);

      const proposalPayload: CommercialProposal = existing
        ? {
            ...existing,
            title: comp.title,
            clientName: comp.clientName,
            deliveryLocation: comp.executionLocation,
            deliveryTimeframeDays: result.calendarDays,
            paymentTerms: `${model.conditions.paymentTermCode.replace('_', '–')} DDL`,
            totalBaseCost: result.totalProjectCost,
            totalTaxCost: result.totalTaxesAmount,
            grossMarginAmount: grossMarginAmt,
            grossMarginPercent: grossMarginPct,
            proposedTotal: result.finalSellingPrice,
            history: [
              ...(existing.history || []),
              {
                date: now,
                action: `Valor sincronizado da Engenharia de Custos (${comp.code} Rev ${comp.revision})`,
                userName,
                details: `Preço: ${brl(result.finalSellingPrice)} · Materiais: ${brl(result.breakdownMaterialsGross)} · Serviços: ${brl(result.breakdownServicesGross)}`,
              },
            ],
            updatedAt: now,
          }
        : {
            id: proposalId,
            organizationId: comp.organizationId,
            code: proposalCode,
            title: comp.title,
            clientId: comp.clientId || 'cli_generic',
            clientName: comp.clientName,
            clientCnpjCpf: comp.clientCnpj || '',
            currency: 'BRL',
            issueDate: now.slice(0, 10),
            validityDate,
            deliveryLocation: comp.executionLocation,
            deliveryTimeframeDays: result.calendarDays,
            paymentTerms: `${model.conditions.paymentTermCode.replace('_', '–')} DDL`,
            warrantyTerms: '12 meses contra defeitos de fabricação e montagem',
            scopeDescription: `Orçamento gerado via Engenharia de Custos (${comp.code} Rev ${comp.revision}). Materiais: ${brl(result.breakdownMaterialsGross)} | Serviços: ${brl(result.breakdownServicesGross)}.`,
            totalItemsCount: model.sheets.length + model.barsTubes.length + model.connections.length,
            pricedItemsCount: model.sheets.length + model.barsTubes.length + model.connections.length,
            pendingItemsCount: 0,
            totalBaseCost: result.totalProjectCost,
            globalMarkupPercent: r2((result.effectiveMarkupMultiplier - 1) * 100),
            totalFreightCost: model.materialsFreightCost,
            totalTaxCost: result.totalTaxesAmount,
            grossMarginAmount: grossMarginAmt,
            grossMarginPercent: grossMarginPct,
            proposedTotal: result.finalSellingPrice,
            status: result.categoryResult.requiresDirectorApproval && !isDirectorOrAdmin ? 'aguardando_revisao' : 'aprovada',
            isPartial: false,
            createdBy: userId || userName,
            createdByName: userName,
            history: [
              {
                date: now,
                action: `Proposta gerada pela Engenharia de Custos (${comp.code})`,
                userName,
                details: `Preço final: ${brl(result.finalSellingPrice)}`,
              },
            ],
            createdAt: now,
            updatedAt: now,
          };

      await saveProposal(proposalPayload);
      const updatedComp = await CostCompositionService.saveComposition({
        ...comp,
        proposalId,
        proposalCode,
        agueroInoxModel: model,
        history: [
          ...(comp.history || []),
          {
            date: now,
            action: existing ? `Proposta ${proposalCode} atualizada no Funil` : `Proposta ${proposalCode} criada no Funil`,
            userName,
            details: `Valor sincronizado: ${brl(result.finalSellingPrice)}`,
          },
        ],
      });
      setComp(updatedComp);
      onSave(updatedComp);
      await onProposalsChanged?.();
      setSaveNotice(`Proposta ${proposalCode} sincronizada com o Painel e Funil de Vendas!`);
    } catch (err) {
      setSaveError(
        `${err instanceof Error ? err.message : 'Falha ao sincronizar proposta.'} Nenhum salvamento local foi simulado.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePurchasingRc = async () => {
    setHandoffBusy(true);
    try {
      const reqItems: Array<{ id: string; code: string; description: string; unit: string; quantity: number; notes?: string }> = [];
      model.sheets.forEach((s) => {
        const calc = calculateSheetRow(s);
        if (s.quantity > 0) {
          reqItems.push({
            id: s.id,
            code: s.alloy.toUpperCase(),
            description: `${s.description} (${s.thicknessMm}mm x ${s.widthM}m x ${s.lengthM}m — ${calc.totalWeightKg} kg)`,
            unit: 'kg',
            quantity: Math.max(1, Math.round(calc.totalWeightKg)),
            notes: `Orçamento ${comp.code}`,
          });
        }
      });
      model.barsTubes.forEach((b) => {
        const calc = calculateBarTubeRow(b);
        if (b.quantity > 0) {
          reqItems.push({
            id: b.id,
            code: b.gauge || 'TUBO',
            description: `${b.description} (${b.gauge} · ${b.lengthM}m — ${calc.totalWeightKg} kg)`,
            unit: 'kg',
            quantity: Math.max(1, Math.round(calc.totalWeightKg)),
            notes: `Orçamento ${comp.code}`,
          });
        }
      });
      model.connections.forEach((c) => {
        if (c.quantity > 0 && c.unitCost > 0) {
          reqItems.push({
            id: c.id,
            code: c.group.toUpperCase(),
            description: c.description,
            unit: c.unit || 'un',
            quantity: c.quantity,
            notes: `Custo orçado: ${brl(c.unitCost)} · ${comp.code}`,
          });
        }
      });

      if (reqItems.length === 0) {
        alert('Adicione ao menos um material (Chapa, Tubo ou Conexão) com quantidade e custo antes de enviar ao Compras.');
        return;
      }

      const now = new Date().toISOString();
      const rcCode = `RC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      await savePurchaseRequisition({
        id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        organizationId: comp.organizationId,
        code: rcCode,
        title: `Materiais Projeto ${comp.code} — ${comp.clientName}`,
        requestedBy: userId || userName,
        requestedByName: userName,
        department: 'Comercial & Propostas',
        urgency: 'normal',
        neededByDate: model.startDate || now.slice(0, 10),
        items: reqItems,
        status: 'pendente',
        notes: `Transferência direta da Engenharia de Custos (${comp.code} Rev ${comp.revision}) — orçamento de materiais ${brl(result.groups.find((g) => g.id === 'materiais')?.cost || 0)}.`,
        createdAt: now,
        updatedAt: now,
      });

      const updated = await CostCompositionService.saveComposition({
        ...comp,
        status: 'aprovada',
        approvedBy: userName,
        approvedAt: now,
        agueroInoxModel: model,
        history: [
          ...(comp.history || []),
          {
            date: now,
            action: `Requisição de Compra ${rcCode} enviada ao Compras`,
            userName,
            details: `${reqItems.length} item(ns) de materiais transferidos do orçamento.`,
          },
        ],
      });
      setComp(updated);
      onSave(updated);
      setSaveNotice(`Requisição de Compra ${rcCode} gerada com ${reqItems.length} item(ns) no módulo Compras!`);
    } catch (err) {
      setSaveError(
        `${err instanceof Error ? err.message : 'Falha ao gerar RC no Compras.'} Nenhum salvamento local foi simulado.`,
      );
    } finally {
      setHandoffBusy(false);
    }
  };

  const handlePrintOperationsHandoff = () => {
    const win = window.open('', '_blank', 'width=920,height=780');
    if (!win) {
      alert('Permita pop-ups para gerar o Termo de Passagem para Operações.');
      return;
    }
    const phasesHtml = model.phases
      .map(
        (ph) =>
          `<h4>${escapeHtml(ph.name)} (${ph.durationWeeks} sem. · ${ph.weeklyHours}h/sem)</h4><ul>` +
          ph.rows
            .map((r) => `<li><strong>${r.quantity}× ${escapeHtml(r.roleName)}</strong> — ${r.horasNormais}h normais / ${r.horasExtras50}h HE50 / ${r.horasExtras100}h HE100</li>`)
            .join('') +
          '</ul>',
      )
      .join('');
    const groupsHtml = result.groups
      .filter((g) => g.cost > 0)
      .map((g) => `<tr><td>${escapeHtml(g.label)}</td><td style="text-align:right;font-family:monospace;">${escapeHtml(brl(g.cost))}</td></tr>`)
      .join('');

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Passagem Comercial → Operações — ${escapeHtml(comp.code)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1d1d1f; margin: 28px; line-height: 1.5; font-size: 12px; }
    .top { border-bottom: 2px solid #0071e3; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f5f5f7; padding: 12px; border-radius: 10px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { padding: 8px; border-bottom: 1px solid #e5e5ea; text-align: left; }
    th { background: #f5f5f7; font-size: 10px; text-transform: uppercase; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="top">
    <div><strong style="font-size:16px;color:#0071e3;">Termo de Passagem Comercial → Operações</strong><br/>${escapeHtml(comp.code)} Rev ${comp.revision} · ${escapeHtml(comp.title)}</div>
    <div style="text-align:right;">Categoria ${result.categoryResult.finalCategory}<br/>Emitido em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</div>
  </div>
  <div class="grid">
    <div><strong>Cliente:</strong> ${escapeHtml(comp.clientName)}</div>
    <div><strong>Local:</strong> ${escapeHtml(comp.executionLocation)}</div>
    <div><strong>Prazo:</strong> ${model.durationQty} ${escapeHtml(model.durationUnit)} (${escapeHtml(model.startDate)} → ${escapeHtml(result.endDate)})</div>
    <div><strong>Equipe Total:</strong> ${result.totalHeadcount} profissionais (${result.totalLaborHours} h)</div>
    <div><strong>Transporte Previsto:</strong> ${result.transportSummary.vehiclesNeeded} veículo(s) · ${escapeHtml(brl(result.transportSummary.totalTransportCost))}</div>
    <div><strong>Teto de Custo Orçado:</strong> ${escapeHtml(brl(result.totalProjectCost))} (Venda: ${escapeHtml(brl(result.finalSellingPrice))})</div>
  </div>
  <h3>Dimensionamento de Equipe por Fase (RH &amp; Operações)</h3>
  ${phasesHtml}
  <h3>Baseline de Custos Disponíveis por Grupo</h3>
  <table><thead><tr><th>Grupo</th><th style="text-align:right;">Orçamento Disponível</th></tr></thead><tbody>${groupsHtml}</tbody></table>
  <p class="no-print" style="text-align:right;"><button onclick="window.print()" style="background:#0071e3;color:#fff;border:none;padding:9px 16px;border-radius:10px;font-weight:700;cursor:pointer;">Imprimir / Salvar PDF</button></p>
</body>
</html>`);
    win.document.close();
  };

  const handleCreateNewRevision = async () => {
    if (!window.confirm('Criar uma nova revisão preservando os valores atuais como histórico imutável?')) return;
    setSaving(true);
    setSaveError(null);
    try {
      const currentSaved = await CostCompositionService.saveComposition({
        ...comp,
        agueroInoxModel: model,
      });
      const duplicated = await CostCompositionService.duplicateComposition(currentSaved, true);
      setComp(duplicated);
      if (duplicated.agueroInoxModel) setModel(duplicated.agueroInoxModel);
      onSave(duplicated);
      setSaveNotice(`Nova Revisão ${duplicated.revision} criada com sucesso!`);
    } catch (err) {
      setSaveError(
        `${err instanceof Error ? err.message : 'Falha ao criar revisão.'} Nenhum salvamento local foi simulado.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePrintProposal = () => {
    const win = window.open('', '_blank', 'width=900,height=760');
    if (!win) {
      alert('Permita pop-ups para gerar a proposta comercial em PDF.');
      return;
    }
    const templateLabel =
      model.presentationTemplate === 'tetrapak'
        ? 'Apresentação Padrão Tetra Pak'
        : model.presentationTemplate === 'breakdown'
        ? 'Price Breakdown (Materiais × Serviços)'
        : 'Composição Comercial Padrão Aguero Inox';

    const rowsHtml =
      model.presentationTemplate === 'breakdown'
        ? `<tr><td>Fornecimento de Materiais (com impostos)</td><td style="text-align:right;font-family:monospace;">${escapeHtml(brl(result.breakdownMaterialsGross))}</td></tr>
           <tr><td>Prestação de Serviços &amp; Montagem (com impostos)</td><td style="text-align:right;font-family:monospace;">${escapeHtml(brl(result.breakdownServicesGross))}</td></tr>`
        : result.groups
            .filter((g) => g.sellWithTax > 0)
            .map(
              (g) =>
                `<tr><td>${escapeHtml(g.label)}</td><td style="text-align:right;font-family:monospace;">${escapeHtml(brl(g.sellWithTax))}</td></tr>`,
            )
            .join('');

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Proposta Comercial ${escapeHtml(comp.code)} — Rev ${comp.revision}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1d1d1f; margin: 32px; line-height: 1.5; }
    .top { display: flex; justify-content: space-between; border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px; }
    .brand { font-size: 18px; font-weight: 800; color: #0071e3; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f5f5f7; padding: 14px; border-radius: 12px; font-size: 12px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
    th, td { padding: 10px; border-bottom: 1px solid #e5e5ea; text-align: left; }
    th { background: #f5f5f7; font-size: 11px; text-transform: uppercase; color: #6e6e73; }
    .total { font-size: 18px; font-weight: 800; background: #e8f8ee; color: #166534; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">${escapeHtml(BILLING_COMPANY_TAX_PRESETS[model.taxes.company].label)}</div>
      <div style="font-size:12px;color:#6e6e73;">${escapeHtml(templateLabel)}</div>
    </div>
    <div style="text-align:right;font-size:12px;">
      <strong>${escapeHtml(comp.code)} · Rev ${comp.revision}</strong><br/>
      Emissão: ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}
    </div>
  </div>
  <h2 style="margin:0 0 12px;">${escapeHtml(comp.title)}</h2>
  <div class="meta">
    <div><strong>Cliente:</strong> ${escapeHtml(comp.clientName)}</div>
    <div><strong>Local de Execução:</strong> ${escapeHtml(comp.executionLocation)}</div>
    <div><strong>Prazo Previsto:</strong> ${model.durationQty} ${escapeHtml(model.durationUnit)} (${result.calendarDays} dias corridos)</div>
    <div><strong>Início / Fim:</strong> ${escapeHtml(model.startDate || '—')} → ${escapeHtml(result.endDate || '—')}</div>
    <div><strong>Condição Pagamento:</strong> ${escapeHtml(model.conditions.paymentTermCode.replace('_', '–'))} DDL</div>
    <div><strong>Responsável:</strong> ${escapeHtml(comp.responsibleName || userName)}</div>
  </div>
  <table>
    <thead><tr><th>Descrição do Escopo Comercial</th><th style="text-align:right;">Valor Comercial (R$)</th></tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="total"><td>VALOR TOTAL DA PROPOSTA (COM IMPOSTOS)</td><td style="text-align:right;font-family:monospace;">${escapeHtml(brl(result.finalSellingPrice))}</td></tr>
    </tbody>
  </table>
  <p style="font-size:11px;color:#6e6e73;">Price Breakdown reconciliado — Materiais: ${escapeHtml(brl(result.breakdownMaterialsGross))} · Serviços: ${escapeHtml(brl(result.breakdownServicesGross))}.</p>
  <p class="no-print" style="text-align:right;margin-top:20px;">
    <button onclick="window.print()" style="background:#0071e3;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;">Imprimir / Salvar PDF</button>
  </p>
</body>
</html>`);
    win.document.close();
  };

  // Orçado × Realizado totals
  const actualTotals = useMemo(() => {
    let budgeted = 0;
    let actual = 0;
    result.groups.forEach((g) => {
      budgeted = r2(budgeted + g.cost);
      actual = r2(actual + (Number(model.actualCostsByGroup[g.id]) || 0));
    });
    return { budgeted, actual, balance: r2(budgeted - actual) };
  }, [result.groups, model.actualCostsByGroup]);

  return (
    <div className="space-y-4">
      {/* Sticky Executive Header */}
      <div className="sticky top-0 z-20 rounded-2xl bg-[#0F172A]/95 backdrop-blur-xl border border-slate-800 p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Voltar à lista"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-400">{comp.code}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                  Rev {String(comp.revision).padStart(2, '0')}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    result.categoryResult.finalCategory >= 4
                      ? 'bg-rose-950/60 text-rose-300 border-rose-700'
                      : 'bg-blue-950/60 text-blue-300 border-blue-700'
                  }`}
                >
                  Categoria {result.categoryResult.finalCategory}
                </span>
              </div>
              <h2 className="text-base font-extrabold text-white truncate">{comp.title}</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintProposal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSyncToProposal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
              title="Criar ou atualizar proposta vinculada no Painel e Funil de Vendas"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{comp.proposalCode ? `Atualizar ${comp.proposalCode}` : 'Enviar p/ Funil'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHandoffModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 text-xs font-semibold cursor-pointer"
              title="Transferir projeto aprovado para Operações e Compras"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Operações &amp; Compras</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleCreateNewRevision()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Nova Rev.</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveFirestore()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl af-btn-primary text-xs font-bold cursor-pointer apple-solid-btn disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Salvando...' : 'Salvar'}</span>
            </button>
          </div>
        </div>

        {/* Live Executive KPI Ribbon */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Custo Total do Projeto</span>
            <strong className="font-mono text-sm sm:text-base text-white">{brl(result.totalProjectCost)}</strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Venda s/ Impostos · Impostos</span>
            <strong className="font-mono text-xs sm:text-sm text-cyan-300">
              {brl(result.totalSellWithoutTax)} · {brl(result.totalTaxesAmount)}
            </strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-blue-950/35 border border-blue-700/50">
            <span className="text-[10px] text-blue-200 block">Preço Final de Venda</span>
            <strong className="font-mono text-sm sm:text-base text-white">{brl(result.finalSellingPrice)}</strong>
          </div>
          <div
            className={`px-3 py-2 rounded-xl border ${
              result.estimatedNetResult >= 0
                ? 'bg-emerald-950/35 border-emerald-700/50'
                : 'bg-rose-950/40 border-rose-700/60'
            }`}
          >
            <span className="text-[10px] text-slate-300 block">Resultado Líquido (ANALISE)</span>
            <strong className={`font-mono text-sm sm:text-base ${result.estimatedNetResult >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {brl(result.estimatedNetResult)} ({result.estimatedNetResultPercent.toFixed(1)}%)
            </strong>
          </div>
        </div>

        {/* 4 Clean Pillars */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-1">
          {([
            ['resumo', '1. Resumo & Preço', <Layers className="w-3.5 h-3.5" key="r" />],
            ['custos', '2. Custos & Equipe', <Wrench className="w-3.5 h-3.5" key="c" />],
            ['financeiro', '3. Financeiro & Impostos', <Landmark className="w-3.5 h-3.5" key="f" />],
            ['riscos_cliente', '4. Riscos, Revisões & Cliente', <ShieldAlert className="w-3.5 h-3.5" key="k" />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPillar(id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                pillar === id
                  ? 'bg-blue-600 text-white shadow-md apple-solid-btn'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {saveError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-700 text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}
      {saveNotice && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Smart Engine Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── PILAR 1: RESUMO & PREÇO (ABA GERAL + BREAKDOWN + ORÇADO×REALIZADO) ── */}
      {pillar === 'resumo' && (
        <div className="space-y-4">
          {/* Identificação da Proposta */}
          <div className={card}>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Identificação da Proposta &amp; Prazo Estruturado</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400">Título / Projeto</label>
                <input value={comp.title} onChange={(e) => setComp((c) => ({ ...c, title: e.target.value, projectName: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Cliente</label>
                <input value={comp.clientName} onChange={(e) => setComp((c) => ({ ...c, clientName: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Local de Execução</label>
                <input value={comp.executionLocation} onChange={(e) => setComp((c) => ({ ...c, executionLocation: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Vincular Proposta do Funil</label>
                <select
                  value={comp.proposalId || ''}
                  onChange={(e) => {
                    const p = proposals.find((x) => x.id === e.target.value);
                    setComp((c) => ({ ...c, proposalId: p?.id, proposalCode: p?.code }));
                  }}
                  className={inp}
                >
                  <option value="">Sem vínculo</option>
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.clientName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-slate-400">Prazo (Qtd)</label>
                  <input
                    type="number"
                    min={1}
                    value={model.durationQty}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value) || 1);
                      updateModel((m) => ({
                        ...m,
                        durationQty: q,
                        personnelExpenses: {
                          ...m.personnelExpenses,
                          calendarDays: m.durationUnit === 'dias' ? q : m.durationUnit === 'semanas' ? q * 7 : q * 30,
                        },
                      }));
                    }}
                    className={`${inp} font-mono`}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Unidade</label>
                  <select
                    value={model.durationUnit}
                    onChange={(e) => {
                      const u = e.target.value as DurationUnit;
                      updateModel((m) => ({
                        ...m,
                        durationUnit: u,
                        personnelExpenses: {
                          ...m.personnelExpenses,
                          calendarDays: u === 'dias' ? m.durationQty : u === 'semanas' ? m.durationQty * 7 : m.durationQty * 30,
                        },
                      }));
                    }}
                    className={inp}
                  >
                    <option value="dias">Dias</option>
                    <option value="semanas">Semanas</option>
                    <option value="meses">Meses</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Início Previsto → Fim ({result.endDate || '—'})</label>
                <input type="date" value={model.startDate} onChange={(e) => updateModel((m) => ({ ...m, startDate: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Finalidade</label>
                <select value={model.taxes.purpose} onChange={(e) => updateModel((m) => ({ ...m, taxes: { ...m.taxes, purpose: e.target.value as BillingPurpose } }))} className={inp}>
                  <option value="material_servico">Material / Serviço</option>
                  <option value="servico">Serviço</option>
                  <option value="venda">Venda de Materiais</option>
                  <option value="industrializacao">Industrialização</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Empresa Faturadora</label>
                <select
                  value={model.taxes.company}
                  onChange={(e) => {
                    const company = e.target.value as BillingCompanyId;
                    const preset = BILLING_COMPANY_TAX_PRESETS[company];
                    updateModel((m) => ({
                      ...m,
                      taxes: {
                        ...m.taxes,
                        company,
                        serviceEffectiveRatePercent: preset.serviceEffectiveRatePercent,
                        materialEffectiveRatePercent: preset.materialEffectiveRatePercent,
                        industrializationEffectiveRatePercent: preset.industrializationEffectiveRatePercent,
                      },
                    }));
                  }}
                  className={inp}
                >
                  {Object.entries(BILLING_COMPANY_TAX_PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Composição do Orçamento (Clicável — abre direto o grupo!) */}
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Composição do Orçamento (clique em qualquer linha para editar)</h3>
                <p className="text-[11px] text-slate-400">
                  Contingência ({brl(result.contingencyAmount)}) + Condições Comerciais + Impostos consolidados sem divergências.
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-800/50 text-cyan-300 font-mono">
                  Materiais: {brl(result.breakdownMaterialsGross)}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 font-mono">
                  Serviços: {brl(result.breakdownServicesGross)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                    <th className="py-2 pr-2">Grupo de Despesa</th>
                    <th className="py-2 px-2 text-right">Custo Total</th>
                    <th className="py-2 px-2 text-right">Margem s/ Venda</th>
                    <th className="py-2 px-2 text-right">Venda s/ Imp.</th>
                    <th className="py-2 px-2 text-right">Venda c/ Imp.</th>
                    <th className="py-2 px-2 text-right">Part. %</th>
                    <th className="py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {result.groups.map((g) => (
                    <tr
                      key={g.id}
                      onClick={() => {
                        const target = GROUP_TO_COST_TAB[g.id];
                        if (target) {
                          setPillar(target.pillar);
                          if (target.sub) setCostSubTab(target.sub);
                        }
                      }}
                      className="hover:bg-slate-800/60 cursor-pointer transition"
                    >
                      <td className="py-2.5 pr-2 font-semibold text-slate-100">{g.label}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-200">{brl(g.cost)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-cyan-300">{g.marginPercent.toFixed(1)}%</td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-200">{brl(g.sellWithoutTax)}</td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-white">{brl(g.sellWithTax)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-400">{g.sharePercent.toFixed(1)}%</td>
                      <td className="py-2.5 text-right text-slate-500"><ChevronRight className="w-3.5 h-3.5" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controle Orçado × Realizado (Seção 11) */}
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-blue-400" /> Controle Orçado × Realizado (Acompanhamento da Obra)
                </h3>
                <p className="text-[11px] text-slate-400">Lance os valores realizados por grupo para acompanhar desvios e saldo do orçamento em tempo real.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200">
                  Orçado: {brl(actualTotals.budgeted)}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white">
                  Realizado: {brl(actualTotals.actual)}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg border font-bold ${
                    actualTotals.balance >= 0
                      ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                      : 'bg-rose-950/50 border-rose-700 text-rose-300'
                  }`}
                >
                  Saldo: {brl(actualTotals.balance)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
              {result.groups
                .filter((g) => g.cost > 0 || (model.actualCostsByGroup[g.id] || 0) > 0)
                .map((g) => {
                  const real = Number(model.actualCostsByGroup[g.id]) || 0;
                  const diffPct = g.cost > 0 && real > 0 ? ((real - g.cost) / g.cost) * 100 : 0;
                  return (
                    <div key={g.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-200 truncate" title={g.label}>{g.label.split(' ')[0]} {g.label.split(' ')[1] || ''}</span>
                        {real > 0 && (
                          <span className={`font-mono text-[10px] font-bold ${diffPct > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {diffPct > 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">Orç.: {brl(g.cost)}</p>
                      <input
                        type="number"
                        step="100"
                        placeholder="Realizado (R$)"
                        value={model.actualCostsByGroup[g.id] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : Number(e.target.value) || 0;
                          updateModel((m) => ({
                            ...m,
                            actualCostsByGroup: { ...m.actualCostsByGroup, [g.id]: v },
                          }));
                        }}
                        className={`${inp} font-mono text-[11px]`}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── PILAR 2: CUSTOS & EQUIPE ── */}
      {pillar === 'custos' && (
        <StudioCostsTab
          model={model}
          result={result}
          catalog={catalog}
          onChange={updateModel}
          activeSubTab={costSubTab}
          onSelectSubTab={setCostSubTab}
        />
      )}

      {/* ── PILAR 3: FINANCEIRO & IMPOSTOS ── */}
      {pillar === 'financeiro' && (
        <StudioFinanceTab model={model} result={result} onChange={updateModel} />
      )}

      {/* ── PILAR 4: RISCOS, REVISÕES & CLIENTE ── */}
      {pillar === 'riscos_cliente' && (
        <StudioRiskClientTab
          model={model}
          result={result}
          onChange={updateModel}
          history={comp.history || []}
          onPrintProposal={handlePrintProposal}
          onCreateNewRevision={() => void handleCreateNewRevision()}
        />
      )}

      {/* ── MODAL: TRANSFERÊNCIA COMERCIAL → OPERAÇÕES & COMPRAS (SEÇÃO 8) ── */}
      {showHandoffModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#111827] border border-slate-700 p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Rocket className="w-4 h-4 text-emerald-400" />
                Transferência do Orçamento → Operações &amp; Compras
              </h3>
              <button type="button" onClick={() => setShowHandoffModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {result.categoryResult.requiresDirectorApproval && !isDirectorOrAdmin && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-700 text-rose-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>
                  Este projeto está na <strong>Categoria {result.categoryResult.finalCategory}</strong> e exige aprovação de um Administrador/Gerente (Diretoria) para liberar a transferência oficial para Compras.
                </span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-400">Equipe dimensionada (RH / Operações)</span><strong className="text-white font-mono">{result.totalHeadcount} profissionais · {result.totalLaborHours} h</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Logística / Despesas de campo</span><strong className="text-white font-mono">{result.transportSummary.vehiclesNeeded} veículo(s) · {brl(result.groups.find((g) => g.id === 'despesas_pessoal')?.cost || 0)}</strong></div>
              <div className="flex justify-between"><span className="text-slate-400">Materiais orçados (Compras)</span><strong className="text-cyan-300 font-mono">{brl(result.groups.find((g) => g.id === 'materiais')?.cost || 0)}</strong></div>
              <div className="flex justify-between pt-1.5 border-t border-slate-800"><span className="text-slate-300 font-semibold">Baseline total disponível</span><strong className="text-emerald-400 font-mono">{brl(result.totalProjectCost)}</strong></div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={handoffBusy || (result.categoryResult.requiresDirectorApproval && !isDirectorOrAdmin)}
                onClick={() => void handleGeneratePurchasingRc()}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer apple-solid-btn disabled:opacity-40"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>{handoffBusy ? 'Gerando RC...' : '1. Gerar Requisição de Compra (RC) dos Materiais no Compras'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintOperationsHandoff}
                className="w-full py-2.5 px-4 rounded-xl af-btn-primary text-white font-bold flex items-center justify-center gap-2 cursor-pointer apple-solid-btn"
              >
                <Printer className="w-4 h-4" />
                <span>2. Emitir Termo de Passagem para Operações (PDF / Equipe &amp; Baseline)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
