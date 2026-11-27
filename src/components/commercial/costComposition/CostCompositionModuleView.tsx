import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  FileDown,
  Copy,
  Trash2,
  Edit,
  DollarSign,
  TrendingUp,
  Shield,
  CheckCircle,
  Clock,
  Sparkles,
  Link,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';
import {
  CostComposition,
  CostCompositionTemplate,
} from '../../../types/costComposition';
import {
  CostCompositionService,
  STANDARD_COMPOSITION_TEMPLATES,
  roundMoney,
} from '../../../services/costCompositionService';
import { CommercialProposal, CommercialMaterial, CommercialClient, CommercialPolicy } from '../../../types/commercial';
import { createDefaultAgueroInoxModel } from '../../../services/agueroInoxPricingEngine';
import { CostCompositionEditor } from './CostCompositionEditor';

interface CostCompositionModuleViewProps {
  organizationId: string;
  userId?: string;
  userName: string;
  userRole?: string;
  policy?: CommercialPolicy | null;
  proposals: CommercialProposal[];
  catalog: CommercialMaterial[];
  clients: CommercialClient[];
  onNavigateProposal?: (proposal: CommercialProposal) => void;
  onProposalsChanged?: () => void | Promise<void>;
}

export const CostCompositionModuleView: React.FC<CostCompositionModuleViewProps> = ({
  organizationId,
  userId,
  userName,
  userRole,
  policy,
  proposals,
  catalog,
  clients,
  onNavigateProposal,
  onProposalsChanged,
}) => {
  const [compositions, setCompositions] = useState<CostComposition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingComposition, setEditingComposition] = useState<CostComposition | null>(null);

  // New Composition Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newClientId, setNewClientId] = useState<string>('');
  const [newClientName, setNewClientName] = useState<string>('');
  const [newProposalId, setNewProposalId] = useState<string>('');
  const [newTemplateId, setNewTemplateId] = useState<string>('tpl_tetrapak_piperack');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newLocation, setNewLocation] = useState<string>('');

  // Load compositions
  const loadCompositions = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await CostCompositionService.listCompositions(organizationId);
      setCompositions(data);
    } catch (e) {
      console.error('Error loading compositions', e);
      setLoadError(e instanceof Error ? e.message : 'Não foi possível consultar o banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompositions();
  }, [organizationId]);

  // KPIs
  const kpis = useMemo(() => {
    const totalComps = compositions.length;
    const totalSellingAmount = compositions.reduce((acc, c) => acc + (c.priceFormation?.suggestedSellingPrice || 0), 0);
    const avgNetMargin = totalComps > 0
      ? roundMoney(compositions.reduce((acc, c) => acc + (c.priceFormation?.effectiveNetMarginPercent || 0), 0) / totalComps)
      : 0;
    const approvedCount = compositions.filter((c) => c.status === 'aprovada').length;

    return { totalComps, totalSellingAmount, avgNetMargin, approvedCount };
  }, [compositions]);

  // Filtered List
  const filteredCompositions = useMemo(() => {
    return compositions.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mCode = (c.code || '').toLowerCase().includes(q);
        const mTitle = (c.title || '').toLowerCase().includes(q);
        const mClient = (c.clientName || '').toLowerCase().includes(q);
        const mProj = (c.projectName || '').toLowerCase().includes(q);
        if (!mCode && !mTitle && !mClient && !mProj) return false;
      }
      return true;
    });
  }, [compositions, statusFilter, searchQuery]);

  // Open Create Modal
  const handleOpenNewModal = () => {
    setNewTitle('');
    setNewClientId('');
    setNewClientName('');
    setNewProposalId('');
    setNewProjectName('');
    setNewLocation('');
    setNewTemplateId('tpl_tetrapak_piperack');
    setIsNewModalOpen(true);
  };

  // Submit Create New
  const handleCreateNew = async () => {
    if (!newTitle.trim()) {
      alert('Informe o título da composição.');
      return;
    }

    const client = clients.find((c) => c.id === newClientId);
    const selectedTemplate = STANDARD_COMPOSITION_TEMPLATES.find((t) => t.id === newTemplateId) || STANDARD_COMPOSITION_TEMPLATES[0];

    const year = new Date().getFullYear();
    const randomNum = String(Math.floor(Math.random() * 900) + 100);
    const code = `COMP-${year}-${randomNum}`;

    const linkedProposal = proposals.find((p) => p.id === newProposalId);

    const defaultItems = selectedTemplate.defaultItems.map((it, idx) => ({
      ...it,
      id: `it_${Date.now()}_${idx}`,
    }));

    const newComp: CostComposition = {
      id: `comp_${Date.now()}`,
      organizationId,
      code,
      revision: 0,
      title: newTitle,
      proposalId: linkedProposal ? linkedProposal.id : undefined,
      proposalCode: linkedProposal ? linkedProposal.code : undefined,
      clientId: client ? client.id : 'cli_generic',
      clientName: client ? client.name : (newClientName || 'Cliente Industrial'),
      billingCompanyName: 'Aguero Inox & Caldeiraria Industrial Ltda',
      projectName: newProjectName || newTitle,
      executionLocation: newLocation || 'Planta Industrial do Cliente',
      projectCategory: 'montagem_industrial',
      serviceType: selectedTemplate.name,
      responsibleName: userName,
      elaborationDate: new Date().toISOString().split('T')[0],
      executionTimeframeDays: 30,
      paymentTerms: '30 / 60 dias após medição',
      proposalValidityDays: 20,
      notes: `Iniciado a partir do modelo: ${selectedTemplate.name}`,
      status: 'rascunho',
      templateId: selectedTemplate.id,
      agueroInoxModel: {
        ...createDefaultAgueroInoxModel(new Date().toISOString().split('T')[0], policy?.engineeringParams),
        presentationTemplate: selectedTemplate.id.includes('tetrapak') ? 'tetrapak' : 'padrao',
      },
      items: defaultItems,
      operationalCosts: {
        averageHourlyCostRef: 58.50,
        depreciationMonthly: 3800.00,
        energyMonthlyCost: 2400.00,
        paintingSurfaceRatePerM2: 45.00,
        maintenanceRatePercent: 3.50,
        lines: [],
        subtotal: 0,
      },
      laborRoles: [],
      commissioningMembers: [],
      personnelExpenses: [],
      thirdPartyServices: [],
      consumables: [],
      machinery: [],
      siteInfrastructure: [],
      mobDesmob: [],
      adminCosts: [],
      risks: [],
      classificationCriteria: {
        clientType: 'cliente_recorrente',
        geographicLocation: 'interior_sp',
        technicalComplexity: 'tubulacao_sanitaria_farmaceutica',
        executionRegimen: 'turno_normal_diurno',
        estimatedBudgetBracket: '100k_a_500k',
      },
      taxConfig: {
        regime: 'lucro_presumido',
        companyBillingUnit: 'Aguero Inox & Caldeiraria Industrial Ltda',
        originCity: 'Campinas - SP',
        destinationCity: 'Monte Mor - SP',
        pisPercent: 0.65,
        cofinsPercent: 3.00,
        issPercent: 5.00,
        icmsPercent: 0.00,
        csllIrpjPercent: 2.88,
        otherTaxesPercent: 0.00,
        totalTaxOnRevenuePercent: 11.53,
        applyTaxesInside: true,
      },
      financialSettings: {
        paymentTermsDays: 45,
        supplierTermsDays: 28,
        monthlyWorkingCapitalRate: 1.80,
        financialCostPercent: 1.02,
        bankGuaranteeOrBondPercent: 1.00,
        centralAdminFeePercent: 4.00,
        commercialCommissionPercent: 2.00,
        targetNetMarginPercent: 15.00,
        pricingMethod: 'bdi_divisor',
      },
      priceFormation: {
        totalDirectCosts: 0,
        totalIndirectCosts: 0,
        baseCostSubtotal: 0,
        riskContingencyAmount: 0,
        subtotalWithContingency: 0,
        financialCostAmount: 0,
        commercialCommissionAmount: 0,
        taxesTotalAmount: 0,
        netProfitAmount: 0,
        effectiveNetMarginPercent: 15,
        effectiveGrossMarginPercent: 28,
        bdiCalculatedPercent: 34,
        suggestedSellingPrice: 0,
        breakEvenPrice: 0,
      },
      scenarios: [],
      createdBy: userName,
      createdByName: userName,
      history: [
        {
          date: new Date().toISOString(),
          action: 'Criação inicial da Composição',
          userName,
          details: `Iniciado a partir do modelo ${selectedTemplate.name}`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await CostCompositionService.saveComposition(newComp);
      setCompositions((prev) => [saved, ...prev]);
      setIsNewModalOpen(false);
      setEditingComposition(saved);
    } catch (error) {
      console.error('Erro ao salvar composição no Firestore:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a composição no banco de dados. Nenhum dado foi salvo localmente.');
    }
  };

  // Duplicate
  const handleDuplicate = async (comp: CostComposition) => {
    try {
      const duplicated = await CostCompositionService.duplicateComposition(comp, true);
      setCompositions((prev) => [duplicated, ...prev]);
      setEditingComposition(duplicated);
    } catch (error) {
      console.error('Erro ao duplicar composição:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível duplicar a composição no banco de dados.');
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta composição de custos?')) return;
    try {
      await CostCompositionService.deleteComposition(id, organizationId);
      setCompositions((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Erro ao excluir composição:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível excluir a composição no banco de dados.');
    }
  };

  // If in Editor Mode
  if (editingComposition) {
    return (
      <CostCompositionEditor
        composition={editingComposition}
        proposals={proposals}
        catalog={catalog}
        userId={userId}
        userName={userName}
        userRole={userRole}
        onProposalsChanged={onProposalsChanged}
        onSave={(updated) => {
          setEditingComposition(updated);
          setCompositions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        }}
        onBack={() => {
          setEditingComposition(null);
          loadCompositions();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-xs text-red-200">
          Falha ao consultar o Firestore: {loadError}. Os dados locais e composições de demonstração não serão usados como substitutos.
          <button onClick={loadCompositions} className="ml-2 underline font-semibold">Tentar novamente</button>
        </div>
      )}
      {/* Header with Title & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0B132B] via-slate-900 to-[#0B132B] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-cyan-900/40 text-cyan-400 border border-cyan-800/60">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Composição de Custos & Formação de Preços (OrçaÁgil)
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Estruture orçamentos industriais integrando mão de obra, equipamentos, despesas de campo, materiais do OrçaÁgil, contingências, impostos e fórmula BDI auditável.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleOpenNewModal}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition shadow-lg shadow-cyan-950/40 cursor-pointer flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Composição de Custos</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 space-y-1">
          <span className="text-[11px] text-slate-400 font-medium block">Total de Composições:</span>
          <span className="text-xl font-bold text-white font-mono">{kpis.totalComps}</span>
          <span className="text-[10px] text-cyan-400 block">{kpis.approvedCount} aprovadas</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 space-y-1">
          <span className="text-[11px] text-slate-400 font-medium block">Volume Orçado em Venda:</span>
          <span className="text-xl font-bold text-cyan-300 font-mono">
            R$ {kpis.totalSellingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 block">Soma dos preços finais sugeridos</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 space-y-1">
          <span className="text-[11px] text-slate-400 font-medium block">Margem Líquida Média:</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">{kpis.avgNetMargin}%</span>
          <span className="text-[10px] text-slate-500 block">Ponderada sobre BDI divisor</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 space-y-1">
          <span className="text-[11px] text-slate-400 font-medium block">Modelos Disponíveis:</span>
          <span className="text-xl font-bold text-purple-400 font-mono">{STANDARD_COMPOSITION_TEMPLATES.length}</span>
          <span className="text-[10px] text-slate-500 block">Tetrapak, Tanques, Paradas</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, título, cliente..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer text-xs"
          >
            <option value="all">Todos os Status</option>
            <option value="rascunho">Rascunho</option>
            <option value="em_analise">Em Análise</option>
            <option value="aprovada">Aprovada</option>
            <option value="congelada">Congelada</option>
          </select>
        </div>
      </div>

      {/* Compositions Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="py-3 px-4">Código / Rev</th>
                <th className="py-3 px-4 min-w-[200px]">Título da Composição</th>
                <th className="py-3 px-4">Cliente / Projeto</th>
                <th className="py-3 px-4 text-right">Custo Direto</th>
                <th className="py-3 px-4 text-right">Preço Venda (BDI)</th>
                <th className="py-3 px-3 text-center">Margem Líq.</th>
                <th className="py-3 px-3 text-center">Risco</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Carregando composições de custos...
                  </td>
                </tr>
              ) : filteredCompositions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-500 space-y-2">
                    <Layers className="w-8 h-8 mx-auto text-slate-600" />
                    <p className="font-medium text-slate-400">Nenhuma composição encontrada.</p>
                    <p className="text-[11px]">Clique em "Nova Composição de Custos" para iniciar a partir de um modelo.</p>
                  </td>
                </tr>
              ) : (
                filteredCompositions.map((comp) => {
                  const directCost = comp.priceFormation?.totalDirectCosts || 0;
                  const sellPrice = comp.priceFormation?.suggestedSellingPrice || 0;
                  const netMargin = comp.priceFormation?.effectiveNetMarginPercent || 0;
                  const classLevel = comp.classificationResult?.classificationClass || 'CLASSE_B';

                  return (
                    <tr key={comp.id} className="hover:bg-slate-800/40 transition">
                      {/* Código e Revisão */}
                      <td className="py-3 px-4 font-mono">
                        <span className="font-bold text-cyan-400 block">{comp.code}</span>
                        <span className="text-[10px] text-slate-500">Rev {comp.revision}</span>
                      </td>

                      {/* Título */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-white block hover:text-cyan-300 transition cursor-pointer" onClick={() => setEditingComposition(comp)}>
                          {comp.title}
                        </span>
                        <span className="text-[11px] text-slate-400 block line-clamp-1">{comp.serviceType}</span>
                      </td>

                      {/* Cliente e Projeto */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-200 block">{comp.clientName}</span>
                        <span className="text-[10px] text-slate-400 block">{comp.projectName}</span>
                      </td>

                      {/* Custo Direto */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        R$ {directCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Preço de Venda BDI */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-cyan-300">
                        R$ {sellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Margem Líquida */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="text-emerald-400 font-bold">{netMargin}%</span>
                      </td>

                      {/* Risco */}
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          classLevel === 'CLASSE_A' ? 'bg-teal-950 text-teal-300 border border-teal-800' :
                          classLevel === 'CLASSE_B' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                          classLevel === 'CLASSE_C' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {classLevel}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                          comp.status === 'aprovada' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' :
                          comp.status === 'em_analise' ? 'bg-blue-950/80 text-blue-300 border border-blue-800' :
                          'bg-amber-950/80 text-amber-300 border border-amber-800'
                        }`}>
                          {comp.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setEditingComposition(comp)}
                            className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white transition cursor-pointer"
                            title="Editar Composição de Custos"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDuplicate(comp)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Duplicar como Nova Revisão (Rev + 1)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => CostCompositionService.exportCompositionToExcel(comp)}
                            className="p-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 transition cursor-pointer"
                            title="Exportar para Excel"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => CostCompositionService.exportCompositionToPdf(comp)}
                            className="p-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-300 transition cursor-pointer"
                            title="Exportar para PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(comp.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nova Composição */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-cyan-900/40 text-cyan-400">
                  <Plus className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-white">Nova Composição de Custos Industrial</h3>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Modelo Base */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Modelo de Composição Base:</label>
                <select
                  value={newTemplateId}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {STANDARD_COMPOSITION_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.category})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 block mt-1">
                  O modelo pré-carrega categorias, grupos e itens de referência inspirados na planilha modelo.
                </span>
              </div>

              {/* Título */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Título da Composição / Orçamento:</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Montagem de Pipe Rack & Tubulações Sanitárias Tetra Pak"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Cliente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Cliente Cadastrado:</label>
                  <select
                    value={newClientId}
                    onChange={(e) => {
                      setNewClientId(e.target.value);
                      const c = clients.find((x) => x.id === e.target.value);
                      if (c) setNewClientName(c.name);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
                  >
                    <option value="">Selecione um cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Ou Digite o Cliente:</label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Nome do Cliente"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              {/* Vínculo com Proposta OrçaÁgil */}
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Vincular a Proposta Comercial (Opcional):</label>
                <select
                  value={newProposalId}
                  onChange={(e) => setNewProposalId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
                >
                  <option value="">Nenhuma (Composição Independente)</option>
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.clientName} ({p.title})
                    </option>
                  ))}
                </select>
              </div>

              {/* Local de Execução */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Nome da Obra / Projeto:</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Ex: Ampliação Planta Fabril"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Local de Execução:</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Ex: Monte Mor - SP"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateNew}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
              >
                Criar Composição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
