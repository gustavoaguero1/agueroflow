import React, { useState, useEffect, useMemo } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetCategory,
  CollectiveAssetWorker,
  CollectiveAssetMovement,
  CollectiveAssetService,
  CollectiveAssetPolicy,
  computeCollectiveAssetCalculations,
} from '../types/collectiveAssets';
import {
  subscribeCollectiveCategories,
  subscribeCollectiveAssets,
  subscribeCollectiveWorkers,
  subscribeCollectiveMovements,
  subscribeCollectiveServices,
  getCollectiveAssetPolicy,
} from '../services/collectiveAssetsService';
import { CollectiveAssetsOverview } from '../components/collectiveAssets/CollectiveAssetsOverview';
import { CollectiveAssetsDashboard } from '../components/collectiveAssets/CollectiveAssetsDashboard';
import { CollectiveAssetsList } from '../components/collectiveAssets/CollectiveAssetsList';
import { CollectiveCheckoutsManager } from '../components/collectiveAssets/CollectiveCheckoutsManager';
import { CollectiveServicesManager } from '../components/collectiveAssets/CollectiveServicesManager';
import { CollectiveCategoriesManager } from '../components/collectiveAssets/CollectiveCategoriesManager';
import { CollectiveWorkersManager } from '../components/collectiveAssets/CollectiveWorkersManager';
import { CollectiveReportsManager } from '../components/collectiveAssets/CollectiveReportsManager';
import { CollectiveAssetDetailModal } from '../components/collectiveAssets/CollectiveAssetDetailModal';
import { CollectivePolicyModal } from '../components/collectiveAssets/CollectivePolicyModal';
import { CmmsReliabilityPanel } from '../components/collectiveAssets/CmmsReliabilityPanel';

import {
  Boxes,
  LayoutDashboard,
  Wrench,
  ArrowLeftRight,
  FolderTree,
  Users,
  FileSpreadsheet,
  Settings,
  Sparkles,
  BarChart3,
} from 'lucide-react';

export type CollectiveAssetsSubSection =
  | 'bens-painel'
  | 'bens-lista'
  | 'bens-movimentacoes'
  | 'bens-manutencoes'
  | 'bens-categorias'
  | 'bens-colaboradores'
  | 'bens-relatorios';

interface CollectiveAssetsModuleProps {
  currentOrganizationId?: string;
  activeSubSection?: CollectiveAssetsSubSection;
  onNavigateSubSection?: (subSection: CollectiveAssetsSubSection) => void;
  userRole?: string;
  userEmail?: string;
}

export const CollectiveAssetsModule: React.FC<CollectiveAssetsModuleProps> = ({
  currentOrganizationId = 'org-default',
  activeSubSection = 'bens-painel',
  onNavigateSubSection,
  userRole = 'admin',
  userEmail = 'gustavo@agueroinox.com.br',
}) => {
  const organizationId = currentOrganizationId || 'org-default';

  // Sub-navigation state (internal fallback if not controlled)
  const [internalSubSection, setInternalSubSection] = useState<CollectiveAssetsSubSection>(activeSubSection);

  useEffect(() => {
    if (activeSubSection) {
      setInternalSubSection(activeSubSection);
    }
  }, [activeSubSection]);

  const handleSubNavigate = (tab: CollectiveAssetsSubSection) => {
    setInternalSubSection(tab);
    onNavigateSubSection?.(tab);
  };

  // Permissions based on system rules
  const normalizedRole = (userRole || 'admin').toLowerCase();
  const canManage = ['super_admin', 'admin', 'master', 'gerente', 'planejador'].includes(normalizedRole);
  const canOperate = canManage || ['operador', 'almoxarife'].includes(normalizedRole);

  // Real-time Firestore state
  const [categories, setCategories] = useState<CollectiveAssetCategory[]>([]);
  const [assets, setAssets] = useState<CollectiveAsset[]>([]);
  const [workers, setWorkers] = useState<CollectiveAssetWorker[]>([]);
  const [movements, setMovements] = useState<CollectiveAssetMovement[]>([]);
  const [services, setServices] = useState<CollectiveAssetService[]>([]);
  const [policy, setPolicy] = useState<CollectiveAssetPolicy>({
    orgId: organizationId,
    organizationId,
    blockOnNoHistory: false,
    blockCheckoutOnMissingHistory: false,
    defaultWarningDays: 30,
    defaultWarningDaysBeforeExpiration: 30,
    updatedAt: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);

  // Modals & Display toggles
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState<CollectiveAsset | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [maintenanceSubTab, setMaintenanceSubTab] = useState<'servicos' | 'cmms'>('servicos');

  // Subscriptions
  useEffect(() => {
    setLoading(true);

    getCollectiveAssetPolicy(organizationId)
      .then((pol: CollectiveAssetPolicy) => setPolicy(pol))
      .catch((err: unknown) => console.error('Erro ao obter política:', err));

    const unsubCategories = subscribeCollectiveCategories(organizationId, (cats: CollectiveAssetCategory[]) => {
      setCategories(cats);
    });

    const unsubAssets = subscribeCollectiveAssets(organizationId, (items: CollectiveAsset[]) => {
      setAssets(items);
      setLoading(false);
    });

    const unsubWorkers = subscribeCollectiveWorkers(organizationId, (wks: CollectiveAssetWorker[]) => {
      setWorkers(wks);
    });

    const unsubMovements = subscribeCollectiveMovements(organizationId, (movs: CollectiveAssetMovement[]) => {
      setMovements(movs);
    });

    const unsubServices = subscribeCollectiveServices(organizationId, (srvs: CollectiveAssetService[]) => {
      setServices(srvs);
    });

    return () => {
      unsubCategories();
      unsubAssets();
      unsubWorkers();
      unsubMovements();
      unsubServices();
    };
  }, [organizationId]);

  // Compute enriched assets with dynamic calculations (EDATE, daysRemaining, situation, alerts)
  const enrichedAssets = useMemo(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    // Group services by asset
    const servicesByAsset = new Map<string, CollectiveAssetService[]>();
    services.forEach((s) => {
      const list = servicesByAsset.get(s.assetId) || [];
      list.push(s);
      servicesByAsset.set(s.assetId, list);
    });

    // Group active movements by asset
    const activeMovementByAsset = new Map<string, CollectiveAssetMovement>();
    movements.forEach((m) => {
      const isEmUso = m.status === 'EM_USO' || (m.status as string) === 'em_uso';
      const isAtrasado = m.status === 'ATRASADO' || (m.status as string) === 'atrasado';
      if (isEmUso || isAtrasado) {
        activeMovementByAsset.set(m.assetId, m);
      }
    });

    return assets.map((asset) => {
      const cat = categoryMap.get(asset.categoryId);
      const assetServices = servicesByAsset.get(asset.id) || [];
      const activeMov = activeMovementByAsset.get(asset.id);
      return computeCollectiveAssetCalculations(asset, cat, assetServices, activeMov, policy);
    });
  }, [assets, categories, services, movements, policy]);

  // Map for sub-components expecting Map<string, CollectiveAsset>
  const calculatedAssetsMap = useMemo(() => {
    const map = new Map<string, CollectiveAsset>();
    enrichedAssets.forEach((a) => map.set(a.id, a));
    return map;
  }, [enrichedAssets]);

  // Keep selectedAssetForDetail refreshed with calculations
  const currentDetailedAsset = useMemo(() => {
    if (!selectedAssetForDetail) return null;
    return enrichedAssets.find((a) => a.id === selectedAssetForDetail.id) || selectedAssetForDetail;
  }, [enrichedAssets, selectedAssetForDetail]);

  return (
    <div className="space-y-6">
      {/* Module Title & Context Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Bens Coletivos</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Almoxarifado Individualizado
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Gestão individualizada de ferramentas, máquinas e instrumentos com rastreabilidade, controle de posse e calibração periódica.
              </p>
            </div>
          </div>
        </div>

        {/* Global Policy, Overview Toggle & Demo Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverview(!showOverview)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              showOverview
                ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
            }`}
            title="Alternar exibição do painel gráfico de visão geral"
          >
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>{showOverview ? 'Ocultar Gráficos' : 'Visão Geral Gráfica'}</span>
          </button>

          {canManage && (
            <button
              onClick={() => setIsPolicyModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Configurar Políticas de Bloqueio e Vencimento"
            >
              <Settings className="w-4 h-4 text-amber-500" />
              Políticas de Bloqueio
            </button>
          )}
        </div>
      </div>

      {/* Overview Executive Dashboard Component with Simple Charts */}
      {showOverview && (
        <CollectiveAssetsOverview
          assets={enrichedAssets}
          categories={categories}
          movements={movements}
          services={services}
          onNavigateTab={handleSubNavigate}
          canOperate={canOperate}
          canManage={canManage}
        />
      )}

      {/* Internal Sub Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => handleSubNavigate('bens-painel')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-painel'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Painel de Bens Coletivos
        </button>

        <button
          onClick={() => handleSubNavigate('bens-lista')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-lista'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Bens ({assets.length})
        </button>

        <button
          onClick={() => handleSubNavigate('bens-movimentacoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-movimentacoes'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Retiradas e Devoluções
        </button>

        <button
          onClick={() => handleSubNavigate('bens-manutencoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-manutencoes'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Manutenção e Calibração
        </button>

        <button
          onClick={() => handleSubNavigate('bens-categorias')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-categorias'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          Categorias ({categories.length})
        </button>

        <button
          onClick={() => handleSubNavigate('bens-colaboradores')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-colaboradores'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Colaboradores ({workers.length})
        </button>

        <button
          onClick={() => handleSubNavigate('bens-relatorios')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            internalSubSection === 'bens-relatorios'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-[#121826] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Relatórios
        </button>
      </div>

      {/* Sub Section Content */}
      <div className="pt-2">
        {internalSubSection === 'bens-painel' && (
          <CollectiveAssetsDashboard
            assets={enrichedAssets}
            categories={categories}
            movements={movements}
            services={services}
            policy={policy}
            onOpenAssetDetail={(asset: CollectiveAsset) => setSelectedAssetForDetail(asset)}
            onOpenPolicyModal={() => setIsPolicyModalOpen(true)}
            onNavigateToTab={(tabId: string) => handleSubNavigate(tabId as CollectiveAssetsSubSection)}
          />
        )}

        {internalSubSection === 'bens-lista' && (
          <CollectiveAssetsList
            organizationId={organizationId}
            assets={enrichedAssets}
            categories={categories}
            movements={movements}
            services={services}
            units={[]}
            canManage={canManage}
            onOpenAssetDetail={(asset: CollectiveAsset) => setSelectedAssetForDetail(asset)}
            onOpenCheckout={(asset: CollectiveAsset) => {
              setSelectedAssetForDetail(null);
              handleSubNavigate('bens-movimentacoes');
            }}
            onOpenReturn={(movement: CollectiveAssetMovement) => {
              setSelectedAssetForDetail(null);
              handleSubNavigate('bens-movimentacoes');
            }}
            onOpenService={(asset: CollectiveAsset) => {
              setSelectedAssetForDetail(null);
              handleSubNavigate('bens-manutencoes');
            }}
          />
        )}

        {internalSubSection === 'bens-movimentacoes' && (
          <CollectiveCheckoutsManager
            organizationId={organizationId}
            assets={enrichedAssets}
            categories={categories}
            workers={workers}
            movements={movements}
            calculatedAssetsMap={calculatedAssetsMap}
            canOperate={canOperate}
            canManage={canManage}
            userEmail={userEmail}
            onOpenAssetDetail={(asset: CollectiveAsset) => setSelectedAssetForDetail(asset)}
          />
        )}

        {internalSubSection === 'bens-manutencoes' && (
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl af-seg">
              <button
                type="button"
                onClick={() => setMaintenanceSubTab('servicos')}
                className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer ${
                  maintenanceSubTab === 'servicos'
                    ? 'af-seg-btn-active font-semibold'
                    : 'af-seg-btn font-medium'
                }`}
              >
                Serviços &amp; Calibração
              </button>
              <button
                type="button"
                onClick={() => setMaintenanceSubTab('cmms')}
                className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer ${
                  maintenanceSubTab === 'cmms'
                    ? 'af-seg-btn-active font-semibold'
                    : 'af-seg-btn font-medium'
                }`}
              >
                CMMS, Preventivas &amp; Confiabilidade (MTBF/MTTR)
              </button>
            </div>
            {maintenanceSubTab === 'servicos' ? (
              <CollectiveServicesManager
                organizationId={organizationId}
                assets={enrichedAssets}
                categories={categories}
                services={services}
                calculatedAssetsMap={calculatedAssetsMap}
                canManage={canManage}
                canOperate={canOperate}
                userEmail={userEmail}
                onOpenAssetDetail={(asset: CollectiveAsset) => setSelectedAssetForDetail(asset)}
              />
            ) : (
              <CmmsReliabilityPanel />
            )}
          </div>
        )}

        {internalSubSection === 'bens-categorias' && (
          <CollectiveCategoriesManager
            organizationId={organizationId}
            categories={categories}
            assets={enrichedAssets}
            canManage={canManage}
          />
        )}

        {internalSubSection === 'bens-colaboradores' && (
          <CollectiveWorkersManager
            organizationId={organizationId}
            workers={workers}
            movements={movements}
            assets={enrichedAssets}
            canManage={canManage}
            onOpenAssetDetail={(asset: CollectiveAsset) => setSelectedAssetForDetail(asset)}
          />
        )}

        {internalSubSection === 'bens-relatorios' && (
          <CollectiveReportsManager
            organizationId={organizationId}
            assets={enrichedAssets}
            categories={categories}
            workers={workers}
            movements={movements}
            services={services}
            calculatedAssetsMap={calculatedAssetsMap}
            canManage={canManage}
          />
        )}
      </div>

      {/* Asset Full Detail Modal */}
      {currentDetailedAsset && (
        <CollectiveAssetDetailModal
          isOpen={true}
          onClose={() => setSelectedAssetForDetail(null)}
          asset={currentDetailedAsset}
          category={categories.find((c) => c.id === currentDetailedAsset.categoryId)}
          movements={movements.filter((m) => m.assetId === currentDetailedAsset.id)}
          services={services.filter((s) => s.assetId === currentDetailedAsset.id)}
          canManage={canManage}
          onOpenCheckout={(asset) => {
            setSelectedAssetForDetail(null);
            handleSubNavigate('bens-movimentacoes');
          }}
          onOpenReturn={(movement) => {
            setSelectedAssetForDetail(null);
            handleSubNavigate('bens-movimentacoes');
          }}
          onOpenService={(asset) => {
            setSelectedAssetForDetail(null);
            handleSubNavigate('bens-manutencoes');
          }}
        />
      )}

      {/* Organization Policy Modal */}
      <CollectivePolicyModal
        organizationId={organizationId}
        policy={policy}
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        canManage={canManage}
      />
    </div>
  );
};
