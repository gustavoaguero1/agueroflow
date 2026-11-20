import React, { useState } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Search,
  ArrowRightLeft,
  Edit3,
  Trash2,
  Download,
  ShieldAlert,
  Clock,
  Layers,
  HelpCircle,
  Eye,
  Check,
} from 'lucide-react';
import {
  CommercialProposal,
  CommercialProposalItem,
  CommercialMaterial,
} from '../../types/commercial';
import {
  calculateProposedPrice,
  roundToTwoDecimals,
  saveProposal,
  saveProposalItems,
  saveMaterial,
} from '../../services/commercialService';
import { CommercialProposalDetailModal } from './CommercialProposalDetailModal';

interface CommercialBomReviewProps {
  proposal: CommercialProposal;
  items: CommercialProposalItem[];
  catalog: CommercialMaterial[];
  organizationName: string;
  userRole?: string;
  userName: string;
  onRefresh: () => Promise<void>;
  onNavigateBack: () => void;
}

export const CommercialBomReview: React.FC<CommercialBomReviewProps> = ({
  proposal,
  items: initialItems,
  catalog,
  organizationName,
  userRole,
  userName,
  onRefresh,
  onNavigateBack,
}) => {
  const [items, setItems] = useState<CommercialProposalItem[]>(initialItems);
  const [globalMarkup, setGlobalMarkup] = useState<number>(proposal.globalMarkupPercent || 25);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Substitution Modal State
  const [substitutingItem, setSubstitutingItem] = useState<CommercialProposalItem | null>(null);
  const [selectedSubstituteId, setSelectedSubstituteId] = useState<string>('');
  const [substitutionJustification, setSubstitutionJustification] = useState('');
  const [substituteSearchTerm, setSubstituteSearchTerm] = useState('');

  // Manual Quote Modal State
  const [quotingItem, setQuotingItem] = useState<CommercialProposalItem | null>(null);
  const [manualCost, setManualCost] = useState<number>(0);
  const [manualSupplier, setManualSupplier] = useState('');
  const [manualQuoteDoc, setManualQuoteDoc] = useState('');
  const [enrichCatalog, setEnrichCatalog] = useState(true);

  const canApprove = userRole === 'Super Admin' || userRole === 'Admin' || userRole === 'Revisor';

  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: proposal.currency || 'BRL' });
  };

  // Recalculate proposal totals whenever items or markup change
  const recalculateProposalTotals = (updatedItems: CommercialProposalItem[], markup: number) => {
    const priced = updatedItems.filter((i) => i.matchClassification !== 'NAO_ENCONTRADO' && i.baseCost > 0);
    const totalBase = priced.reduce((acc, i) => acc + i.baseCost * i.inputQuantity, 0);
    const totalProposed = priced.reduce((acc, i) => acc + i.proposedTotalPrice, 0);
    const totalFreight = priced.reduce((acc, i) => acc + (i.freightComponent || 0) * i.inputQuantity, 0);
    const marginAmt = totalProposed - totalBase;
    const marginPct = totalProposed > 0 ? (marginAmt / totalProposed) * 100 : 0;
    const pendingCount = updatedItems.length - priced.length;

    return {
      totalItemsCount: updatedItems.length,
      pricedItemsCount: priced.length,
      pendingItemsCount: pendingCount,
      totalBaseCost: roundToTwoDecimals(totalBase),
      totalFreightCost: roundToTwoDecimals(totalFreight),
      proposedTotal: roundToTwoDecimals(totalProposed),
      grossMarginAmount: roundToTwoDecimals(marginAmt),
      grossMarginPercent: roundToTwoDecimals(marginPct),
      isPartial: pendingCount > 0,
      status: pendingCount > 0 ? ('parcial' as const) : proposal.status === 'aprovada' ? ('aprovada' as const) : ('aguardando_revisao' as const),
    };
  };

  // Apply Global Markup across all priced items
  const handleApplyGlobalMarkup = async () => {
    setSaving(true);
    try {
      const updated = items.map((it) => {
        if (it.baseCost > 0 && it.matchClassification !== 'NAO_ENCONTRADO') {
          const newUnit = calculateProposedPrice(it.baseCost, globalMarkup, it.freightComponent, it.taxComponent);
          return {
            ...it,
            markupPercent: globalMarkup,
            proposedUnitPrice: newUnit,
            proposedTotalPrice: roundToTwoDecimals(newUnit * it.inputQuantity),
          };
        }
        return it;
      });

      const totals = recalculateProposalTotals(updated, globalMarkup);
      const updatedProp: CommercialProposal = {
        ...proposal,
        ...totals,
        globalMarkupPercent: globalMarkup,
        history: [
          ...proposal.history,
          {
            date: new Date().toISOString(),
            action: 'Atualização de Markup Global',
            userName,
            details: `Markup alterado para ${globalMarkup}% sobre o custo-base de todos os itens.`,
          },
        ],
      };

      await saveProposal(updatedProp);
      await saveProposalItems(proposal.id, updated);
      setItems(updated);
      setSuccessMsg(`Markup de ${globalMarkup}% aplicado com sucesso a todos os itens!`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Confirm Material Substitution
  const handleConfirmSubstitution = async () => {
    if (!substitutingItem || !selectedSubstituteId) return;
    if (!substitutionJustification.trim()) {
      alert('Informe a justificativa técnica para a substituição.');
      return;
    }

    const substituteMaterial = catalog.find((m) => m.id === selectedSubstituteId);
    if (!substituteMaterial) return;

    setSaving(true);
    try {
      const newUnitPrice = calculateProposedPrice(
        substituteMaterial.baseCost,
        substitutingItem.markupPercent || globalMarkup,
        substituteMaterial.freightCost || 0,
        substituteMaterial.taxCost || 0
      );

      const updated = items.map((it) => {
        if (it.id === substitutingItem.id) {
          return {
            ...it,
            matchClassification: 'EQUIVALENTE_TECNICO' as const,
            matchedMaterialId: substituteMaterial.id,
            matchedInternalCode: substituteMaterial.internalCode,
            matchedManufacturerCode: substituteMaterial.manufacturerCode,
            matchedDescription: substituteMaterial.normalizedDescription,
            priceSourceType: 'equivalente_tecnico' as const,
            priceSourceDate: substituteMaterial.quoteDate,
            priceSourceDocument: substituteMaterial.sourceDocumentRef,
            supplierName: substituteMaterial.supplierName,
            baseCost: substituteMaterial.baseCost,
            freightComponent: substituteMaterial.freightCost || 0,
            taxComponent: substituteMaterial.taxCost || 0,
            proposedUnitPrice: newUnitPrice,
            proposedTotalPrice: roundToTwoDecimals(newUnitPrice * it.inputQuantity),
            isPending: false,
            pendingReason: undefined,
            status: 'substituido' as const,
            isSubstituted: true,
            substitutionOriginalMaterialId: substitutingItem.matchedMaterialId || 'original',
            substitutionJustification: substitutionJustification.trim(),
            substitutedBy: userName,
            substitutionApprovedBy: canApprove ? userName : undefined,
          };
        }
        return it;
      });

      const totals = recalculateProposalTotals(updated, globalMarkup);
      const updatedProp: CommercialProposal = {
        ...proposal,
        ...totals,
        history: [
          ...proposal.history,
          {
            date: new Date().toISOString(),
            action: `Substituição Técnica do Item #${substitutingItem.itemNumber}`,
            userName,
            details: `Substituído por ${substituteMaterial.internalCode} (${substituteMaterial.normalizedDescription}). Justificativa: ${substitutionJustification}`,
          },
        ],
      };

      await saveProposal(updatedProp);
      await saveProposalItems(proposal.id, updated);
      setItems(updated);
      setSubstitutingItem(null);
      setSelectedSubstituteId('');
      setSubstitutionJustification('');
      setSuccessMsg('Substituição técnica registrada e preços recalculados com sucesso.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Confirm Manual Quote for Unfound Item & Enrich Catalog
  const handleConfirmManualQuote = async () => {
    if (!quotingItem) return;
    if (manualCost <= 0) {
      alert('Informe um custo-base maior que zero.');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const newUnitPrice = calculateProposedPrice(manualCost, quotingItem.markupPercent || globalMarkup, 0, 0);

      // 1. If enrichCatalog is checked, save into catalog commercial_materials
      let newMaterialId: string | undefined;
      if (enrichCatalog) {
        newMaterialId = `mat_user_${Date.now()}`;
        const newCatMat: CommercialMaterial = {
          id: newMaterialId,
          organizationId: proposal.organizationId,
          internalCode: quotingItem.inputCode || `MAT-${Date.now().toString().slice(-5)}`,
          originalDescription: quotingItem.inputDescription,
          normalizedDescription: quotingItem.inputDescription.toUpperCase(),
          technicalSpecs: {
            notes: quotingItem.inputSpecs,
          },
          unit: quotingItem.inputUnit,
          baseCost: manualCost,
          currency: proposal.currency || 'BRL',
          supplierName: manualSupplier || 'Fornecedor Cadastrado',
          sourceType: 'cotacao_confirmada',
          quoteDate: today,
          validityDays: 30,
          category: 'Cotações Manuais',
          sourceDocumentRef: manualQuoteDoc || 'Cotação Direta',
          importedBy: userName,
          createdAt: new Date().toISOString(),
        };
        await saveMaterial(newCatMat);
      }

      // 2. Update item in proposal
      const updated = items.map((it) => {
        if (it.id === quotingItem.id) {
          return {
            ...it,
            matchClassification: 'EXATO' as const,
            matchedMaterialId: newMaterialId,
            matchedInternalCode: quotingItem.inputCode,
            matchedDescription: quotingItem.inputDescription,
            priceSourceType: 'cotacao_confirmada' as const,
            priceSourceDate: today,
            priceSourceDocument: manualQuoteDoc || 'Cotação Direta',
            supplierName: manualSupplier || 'Fornecedor Cadastrado',
            baseCost: manualCost,
            freightComponent: 0,
            taxComponent: 0,
            proposedUnitPrice: newUnitPrice,
            proposedTotalPrice: roundToTwoDecimals(newUnitPrice * it.inputQuantity),
            isPending: false,
            pendingReason: undefined,
            status: 'ok' as const,
          };
        }
        return it;
      });

      const totals = recalculateProposalTotals(updated, globalMarkup);
      const updatedProp: CommercialProposal = {
        ...proposal,
        ...totals,
        history: [
          ...proposal.history,
          {
            date: new Date().toISOString(),
            action: `Cotação Registrada para Item #${quotingItem.itemNumber}`,
            userName,
            details: `Custo-base R$ ${manualCost.toFixed(2)} informado com fornecedor ${manualSupplier}. Item precificado com sucesso.`,
          },
        ],
      };

      await saveProposal(updatedProp);
      await saveProposalItems(proposal.id, updated);
      setItems(updated);
      setQuotingItem(null);
      setManualCost(0);
      setManualSupplier('');
      setManualQuoteDoc('');
      setSuccessMsg('Cotação cadastrada e item liberado com sucesso.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Approve Proposal (Status Transition)
  const handleApproveProposal = async () => {
    if (!canApprove) {
      alert('Apenas usuários com perfil de Revisor ou Administrador podem aprovar propostas comerciais.');
      return;
    }

    setSaving(true);
    try {
      const updatedProp: CommercialProposal = {
        ...proposal,
        status: 'aprovada',
        approvedBy: userName,
        approvalDate: new Date().toISOString(),
        history: [
          ...proposal.history,
          {
            date: new Date().toISOString(),
            action: 'Aprovação Formal da Proposta',
            userName,
            details: 'Proposta revisada, markup conferido e autorizada para envio comercial ao cliente.',
          },
        ],
      };

      await saveProposal(updatedProp);
      setSuccessMsg('Proposta aprovada com sucesso! Pronta para envio ou exportação de PDF.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const filteredSubstituteCatalog = catalog.filter((m) => {
    if (!substituteSearchTerm) return true;
    const term = substituteSearchTerm.toLowerCase();
    return (
      m.internalCode.toLowerCase().includes(term) ||
      m.normalizedDescription.toLowerCase().includes(term) ||
      (m.technicalSpecs.materialGrade && m.technicalSpecs.materialGrade.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Proposal Info and Status */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 shadow-xl text-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onNavigateBack}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline"
            >
              ← Voltar ao Painel
            </button>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 text-cyan-300 rounded font-bold border border-cyan-800">
              {proposal.code}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                proposal.status === 'aprovada'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : proposal.status === 'parcial'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {proposal.status.toUpperCase()}
            </span>
            {proposal.isPartial && (
              <span className="text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Parcial ({proposal.pendingItemsCount} sem preço)
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-white mt-1">{proposal.title}</h2>
          <p className="text-xs text-slate-400">
            Cliente: <strong className="text-slate-200">{proposal.clientName}</strong> • Emissão: {proposal.issueDate} • Validade: {proposal.validityDate}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canApprove && proposal.status === 'aguardando_revisao' && (
            <button
              onClick={handleApproveProposal}
              disabled={saving}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shadow-lg disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Aprovar Proposta</span>
            </button>
          )}

          <button
            onClick={() => setIsDetailModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition shadow-lg"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Proposta & Exportar PDF</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Global Markup Controller Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <DollarSign className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-white">Markup Global da Proposta</h4>
            <p className="text-slate-400 text-[11px]">
              Fórmula: Preço = Custo-base × (1 + Markup ÷ 100). (Ex: R$ 100 c/ 25% = R$ 125)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Markup:</span>
            <input
              type="number"
              min={10}
              max={100}
              value={globalMarkup}
              onChange={(e) => setGlobalMarkup(Number(e.target.value))}
              className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center font-mono font-bold text-cyan-300"
            />
            <span className="text-slate-400">%</span>
          </div>
          <button
            onClick={handleApplyGlobalMarkup}
            disabled={saving}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-medium rounded-lg transition text-xs disabled:opacity-50"
          >
            Aplicar a Todos os Itens
          </button>
        </div>
      </div>

      {/* Interactive Items Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Itens da Lista Técnica (BOM) & Cruzamento de Preços ({items.length})
            </h3>
            <span className="text-[11px] text-slate-400">
              {proposal.pricedItemsCount} precificados • {proposal.pendingItemsCount} pendentes
            </span>
          </div>

          <div className="text-right text-xs">
            <span className="text-slate-400 mr-2">Total Proposto Atual:</span>
            <strong className="text-cyan-300 font-mono text-sm">{formatBrl(proposal.proposedTotal)}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">#</th>
                <th className="py-2.5 px-3 w-32">Código BOM</th>
                <th className="py-2.5 px-3">Descrição Original & Especificação</th>
                <th className="py-2.5 px-3 text-center">Unid</th>
                <th className="py-2.5 px-3 text-right">Qtd</th>
                <th className="py-2.5 px-3">Correspondência & Fonte</th>
                <th className="py-2.5 px-3 text-right">Custo-Base</th>
                <th className="py-2.5 px-3 text-right">Markup</th>
                <th className="py-2.5 px-3 text-right">Preço Proposto</th>
                <th className="py-2.5 px-3 text-center w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {items.map((it) => {
                const isUnpriced = it.matchClassification === 'NAO_ENCONTRADO' || it.baseCost <= 0;
                return (
                  <tr key={it.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-3 text-center text-slate-500 font-sans">{it.itemNumber}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-cyan-300">{it.inputCode || '-'}</span>
                      {it.matchedInternalCode && it.matchedInternalCode !== it.inputCode && (
                        <span className="block text-[10px] text-slate-500">Int: {it.matchedInternalCode}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <p className="font-medium text-slate-200">{it.inputDescription}</p>
                      {it.inputSpecs && <p className="text-[11px] text-slate-400">{it.inputSpecs}</p>}
                      {it.technicalDifferencesExplanation && (
                        <p className="text-[10px] text-amber-300/90 mt-0.5 italic">
                          ℹ {it.technicalDifferencesExplanation}
                        </p>
                      )}
                      {it.isSubstituted && (
                        <span className="text-[10px] text-blue-300 block font-medium">
                          ✦ Substituto Técnico: {it.substitutionJustification}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{it.inputUnit}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-white">{it.inputQuantity}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-medium inline-block mb-1 ${
                          it.matchClassification === 'EXATO'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : it.matchClassification === 'COMPARAVEL'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : it.matchClassification === 'EQUIVALENTE_TECNICO'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {it.matchClassification === 'NAO_ENCONTRADO' ? 'NÃO ENCONTRADO' : it.matchClassification}
                      </span>
                      {it.supplierName && (
                        <span className="block text-[10px] text-slate-300">{it.supplierName}</span>
                      )}
                      {it.isPriceExpired && (
                        <span className="text-[10px] text-amber-400 block font-semibold">
                          ⚠ Cotação vencida
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {isUnpriced ? <span className="text-rose-400 font-sans font-medium">Sem Custo</span> : formatBrl(it.baseCost)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-cyan-300">
                      {isUnpriced ? '-' : `${it.markupPercent}%`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">
                      {isUnpriced ? <span className="text-amber-400 font-sans font-medium">Pendente</span> : formatBrl(it.proposedTotalPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      <div className="flex items-center justify-center space-x-1">
                        {isUnpriced && (
                          <button
                            onClick={() => {
                              setQuotingItem(it);
                              setManualCost(0);
                            }}
                            className="p-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded"
                            title="Informar Cotação Manual"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSubstitutingItem(it);
                            setSelectedSubstituteId('');
                            setSubstitutionJustification('');
                          }}
                          className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                          title="Substituir por Material do Catálogo"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: SUBSTITUIÇÃO TÉCNICA DE MATERIAL COM COMPARATIVO LADO A LADO */}
      {substitutingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B132B] border border-slate-700 rounded-xl max-w-3xl w-full p-5 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Substituição Técnica de Material — Item #{substitutingItem.itemNumber}
                </h3>
              </div>
              <button
                onClick={() => setSubstitutingItem(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Original Item Card */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg text-xs space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                Item Original Solicitado na BOM:
              </span>
              <p className="text-white font-semibold">{substitutingItem.inputDescription}</p>
              <p className="text-slate-400">
                Código: {substitutingItem.inputCode || '-'} | Norma/Dimensão: {substitutingItem.inputSpecs || '-'} | Qtd: {substitutingItem.inputQuantity} {substitutingItem.inputUnit}
              </p>
            </div>

            {/* Catalog Search */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Buscar Material Substituto no Catálogo Interno:
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={substituteSearchTerm}
                  onChange={(e) => setSubstituteSearchTerm(e.target.value)}
                  placeholder="Filtrar por código, descrição ou liga (ex: AISI 304, SCH 10)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white"
                />
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800/80">
                {filteredSubstituteCatalog.map((mat) => (
                  <div
                    key={mat.id}
                    onClick={() => setSelectedSubstituteId(mat.id)}
                    className={`p-2.5 text-xs cursor-pointer transition flex items-center justify-between ${
                      selectedSubstituteId === mat.id
                        ? 'bg-cyan-950/60 border-l-4 border-cyan-400'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-bold text-cyan-300">{mat.internalCode}</span>
                      <p className="text-slate-200">{mat.normalizedDescription}</p>
                      <span className="text-[10px] text-slate-400">
                        {mat.technicalSpecs.materialGrade || ''} {mat.technicalSpecs.dimension || ''} • Fornecedor:{' '}
                        {mat.supplierName || 'Interno'}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-emerald-400 font-bold">{formatBrl(mat.baseCost)}</span>
                      <span className="text-[10px] text-slate-400 block">Custo-base</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Justification Input */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Justificativa Técnica da Substituição *
              </label>
              <textarea
                value={substitutionJustification}
                onChange={(e) => setSubstitutionJustification(e.target.value)}
                rows={2}
                placeholder="Ex: Substituto possui especificação equivalente ASTM A312 e mesma pressão de trabalho..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSubstitutingItem(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSubstitution}
                disabled={!selectedSubstituteId || !substitutionJustification.trim() || saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded disabled:opacity-50"
              >
                Confirmar Substituição Técnica
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COTAÇÃO MANUAL PARA ITEM NÃO LOCALIZADO */}
      {quotingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-slate-700 rounded-xl max-w-lg w-full p-5 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Inserir Cotação de Fornecedor
                </h3>
              </div>
              <button onClick={() => setQuotingItem(null)} className="text-slate-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <div className="text-xs bg-slate-900 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Item a ser cotado:</span>
              <strong className="text-white text-sm">{quotingItem.inputDescription}</strong>
              <p className="text-slate-400 mt-1">
                Qtd: {quotingItem.inputQuantity} {quotingItem.inputUnit}
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Custo-Base Unitário (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={manualCost || ''}
                  onChange={(e) => setManualCost(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Nome do Fornecedor / Fabricante</label>
                <input
                  type="text"
                  value={manualSupplier}
                  onChange={(e) => setManualSupplier(e.target.value)}
                  placeholder="Ex: Teadit Juntas / Bray Controls"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Nº da Cotação / Documento de Referência</label>
                <input
                  type="text"
                  value={manualQuoteDoc}
                  onChange={(e) => setManualQuoteDoc(e.target.value)}
                  placeholder="Ex: COT-2026-904"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrichCatalog}
                    onChange={(e) => setEnrichCatalog(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    Enriquecer catálogo interno para reutilização em futuros orçamentos (Evolução progressiva)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setQuotingItem(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmManualQuote}
                disabled={manualCost <= 0 || saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded disabled:opacity-50"
              >
                Salvar e Precificar Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PROPOSTA COMERCIAL DUAL-VIEW E EXPORTAÇÃO PDF */}
      {isDetailModalOpen && (
        <CommercialProposalDetailModal
          proposal={proposal}
          items={items}
          organizationName={organizationName}
          userRole={userRole}
          onClose={() => setIsDetailModalOpen(false)}
          onApproveProposal={canApprove ? handleApproveProposal : undefined}
        />
      )}
    </div>
  );
};
