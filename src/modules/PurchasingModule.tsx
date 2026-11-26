import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  FileText,
  Layers,
  Building2,
  PackageCheck,
  LayoutDashboard,
  RefreshCw,
  Plus,
  History,
  TrendingUp,
  Scale,
} from 'lucide-react';
import {
  PurchasingSubSection,
  PurchaseRequisition,
  PurchaseQuotationMap,
  PurchaseOrder,
  PurchasingSupplier,
  MaterialReceiptRecord,
} from '../types/purchasing';
import {
  getPurchaseRequisitions,
  getPurchaseQuotations,
  getPurchaseOrders,
  getPurchasingSuppliers,
  getMaterialReceipts,
  getWorkOrdersForPurchasing,
} from '../services/purchasingService';
import { PurchasingDashboard } from '../components/purchasing/PurchasingDashboard';
import { PurchasingRequisitions } from '../components/purchasing/PurchasingRequisitions';
import { PurchasingQuotationsMap } from '../components/purchasing/PurchasingQuotationsMap';
import { PurchasingPriceComparison } from '../components/purchasing/PurchasingPriceComparison';
import { PurchasingOrdersManager } from '../components/purchasing/PurchasingOrdersManager';
import { PurchasingSuppliersManager } from '../components/purchasing/PurchasingSuppliersManager';
import { PurchasingReceivingManager } from '../components/purchasing/PurchasingReceivingManager';
import { PurchaseHistoryTable } from '../components/purchasing/PurchaseHistoryTable';
import { SupplierIntelligence } from '../components/purchasing/SupplierIntelligence';
import { NewPurchaseOrderModal } from '../components/purchasing/NewPurchaseOrderModal';
import {
  PurchasingApprovalPanel,
  SupplierScorecardPanel,
} from '../components/purchasing/PurchasingApprovalsAndScorecardPanel';
import type { WorkOrder } from '../types';

interface PurchasingModuleProps {
  currentSubSection: PurchasingSubSection;
  onNavigateSubSection: (sub: PurchasingSubSection) => void;
  currentOrgId?: string;
  currentUserName?: string;
}

export const PurchasingModule: React.FC<PurchasingModuleProps> = ({
  currentSubSection = 'compras-painel',
  onNavigateSubSection,
  currentOrgId = '',
  currentUserName = 'Comprador Industrial',
}) => {
  const [activeTab, setActiveTab] = useState<PurchasingSubSection>(currentSubSection);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [quotations, setQuotations] = useState<PurchaseQuotationMap[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<PurchasingSupplier[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceiptRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  // Modals
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (currentSubSection && currentSubSection !== activeTab) {
      setActiveTab(currentSubSection);
    }
  }, [currentSubSection]);

  const loadAllData = useCallback(async () => {
    try {
      const [reqs, quotes, ords, sups, recs, wos] = await Promise.all([
        getPurchaseRequisitions(currentOrgId),
        getPurchaseQuotations(currentOrgId),
        getPurchaseOrders(currentOrgId),
        getPurchasingSuppliers(currentOrgId),
        getMaterialReceipts(currentOrgId),
        getWorkOrdersForPurchasing(currentOrgId),
      ]);

      setRequisitions(reqs);
      setQuotations(quotes);
      setOrders(ords);
      setSuppliers(sups);
      setReceipts(recs);
      setWorkOrders(wos);
    } catch (err) {
      console.error('Erro ao carregar dados do módulo de Compras:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentOrgId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  const handleTabChange = (tab: PurchasingSubSection) => {
    setActiveTab(tab);
    if (onNavigateSubSection) {
      onNavigateSubSection(tab);
    }
  };

  const tabs: Array<{
    id: PurchasingSubSection;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    count?: number;
  }> = [
    {
      id: 'compras-painel',
      label: 'Painel Geral',
      icon: LayoutDashboard,
    },
    {
      id: 'compras-requisicoes',
      label: 'Requisições (RC)',
      icon: FileText,
      count: requisitions.filter((r) => r.status === 'pendente' || r.status === 'em_cotacao').length,
    },
    {
      id: 'compras-cotacoes',
      label: 'Mapa 3-Bid',
      icon: Layers,
      count: quotations.filter((q) => q.status === 'aberto' || q.status === 'em_analise').length,
    },
    {
      id: 'compras-tomada-precos',
      label: 'Tomada de Preços',
      icon: Scale,
    },
    {
      id: 'compras-pedidos',
      label: 'Ordens de Compra (OC)',
      icon: ShoppingCart,
      count: orders.length,
    },
    {
      id: 'compras-historico',
      label: 'Histórico de Compras',
      icon: History,
      count: orders.length,
    },
    {
      id: 'compras-inteligencia',
      label: 'Inteligência de Fornecedores',
      icon: TrendingUp,
    },
    {
      id: 'compras-fornecedores',
      label: 'Fornecedores',
      icon: Building2,
      count: suppliers.length,
    },
    {
      id: 'compras-recebimento',
      label: 'Recebimento & Corrida',
      icon: PackageCheck,
      count: receipts.length,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Module Title & Tab Navigation */}
      <div className="af-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#409CFF]">
                <ShoppingCart size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#1D1D1F] dark:text-white tracking-tight flex flex-wrap items-center gap-2">
                  Compras &amp; Suprimentos Industriais
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] dark:text-[#409CFF]">
                    Suprimentos
                  </span>
                </h1>
                <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
                  Workflow completo: RCs de obra, equalização técnica 3-Bid, alçadas server-side, emissão de OC e Corrida Metalúrgica.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="p-2 af-btn-glass rounded-xl cursor-pointer"
              title="Atualizar dados de compras"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-[#0071E3]' : ''} />
            </button>
            <button
              onClick={() => setIsNewOrderModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 af-btn-primary rounded-xl text-xs font-semibold cursor-pointer apple-solid-btn"
            >
              <Plus size={15} /> Emitir OC
            </button>
          </div>
        </div>

        {/* Tab Strip — Apple Segmented Control */}
        <div className="mt-3 af-seg rounded-xl p-1 flex items-center gap-1 overflow-x-auto custom-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap cursor-pointer ${
                  isActive ? 'af-seg-btn-active font-semibold' : 'af-seg-btn font-medium'
                }`}
              >
                <Icon size={14} className="opacity-80" />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                      isActive
                        ? 'bg-[#0071E3]/12 text-[#0071E3] dark:text-[#409CFF]'
                        : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#6E6E73] dark:text-[#98989D]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Pane */}
      {loading ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-16 text-center">
          <RefreshCw size={28} className="animate-spin text-cyan-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">Carregando módulo de Compras & Suprimentos...</p>
        </div>
      ) : (
        <div>
          {activeTab === 'compras-painel' && (
            <PurchasingDashboard
              orders={orders}
              requisitions={requisitions}
              quotations={quotations}
              suppliers={suppliers}
              onNavigateSub={handleTabChange}
              onNewRequisition={() => handleTabChange('compras-requisicoes')}
              onNewOrder={() => setIsNewOrderModalOpen(true)}
              userName={currentUserName}
            />
          )}

          {activeTab === 'compras-requisicoes' && (
            <PurchasingRequisitions
              organizationId={currentOrgId}
              requisitions={requisitions}
              userName={currentUserName}
              workOrders={workOrders}
              onRefresh={loadAllData}
              onCreateQuotationFromRequisition={(req: PurchaseRequisition) => {
                handleTabChange('compras-cotacoes');
              }}
            />
          )}

          {activeTab === 'compras-cotacoes' && (
            <PurchasingQuotationsMap
              quotations={quotations}
              requisitions={requisitions}
              suppliers={suppliers}
              currentOrgId={currentOrgId}
              currentUserName={currentUserName}
              onRefresh={loadAllData}
              onSwitchToOrders={() => handleTabChange('compras-pedidos')}
            />
          )}

          {activeTab === 'compras-tomada-precos' && (
            <PurchasingPriceComparison
              quotations={quotations}
              requisitions={requisitions}
              suppliers={suppliers}
              currentOrgId={currentOrgId}
              currentUserName={currentUserName}
              onRefresh={loadAllData}
              onSwitchToOrders={() => handleTabChange('compras-pedidos')}
            />
          )}

          {activeTab === 'compras-pedidos' && (
            <div className="space-y-4">
              <PurchasingApprovalPanel orgId={currentOrgId} orders={orders} onRefresh={loadAllData} />
              <PurchasingOrdersManager
                orders={orders}
                onRefresh={loadAllData}
                onOpenNewOrderModal={() => setIsNewOrderModalOpen(true)}
              />
            </div>
          )}

          {activeTab === 'compras-historico' && (
            <PurchaseHistoryTable
              orders={orders}
              suppliers={suppliers}
              currentOrgId={currentOrgId}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'compras-inteligencia' && (
            <div className="space-y-4">
              <SupplierScorecardPanel suppliers={suppliers} orders={orders} receipts={receipts} />
              <SupplierIntelligence
                quotations={quotations}
                orders={orders}
                suppliers={suppliers}
                onNavigateSub={handleTabChange}
              />
            </div>
          )}

          {activeTab === 'compras-fornecedores' && (
            <PurchasingSuppliersManager
              suppliers={suppliers}
              currentOrgId={currentOrgId}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === 'compras-recebimento' && (
            <PurchasingReceivingManager
              receipts={receipts}
              orders={orders}
              currentOrgId={currentOrgId}
              currentUserName={currentUserName}
              onRefresh={loadAllData}
            />
          )}
        </div>
      )}

      {/* Direct New Order Modal */}
      <NewPurchaseOrderModal
        isOpen={isNewOrderModalOpen}
        onClose={() => setIsNewOrderModalOpen(false)}
        suppliers={suppliers}
        currentOrgId={currentOrgId}
        currentUserName={currentUserName}
        workOrders={workOrders}
        onOrderCreated={loadAllData}
      />
    </div>
  );
};
