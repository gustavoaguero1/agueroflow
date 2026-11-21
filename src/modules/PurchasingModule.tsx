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

interface PurchasingModuleProps {
  currentSubSection: PurchasingSubSection;
  onNavigateSubSection: (sub: PurchasingSubSection) => void;
  currentOrgId?: string;
  currentUserName?: string;
}

export const PurchasingModule: React.FC<PurchasingModuleProps> = ({
  currentSubSection = 'compras-painel',
  onNavigateSubSection,
  currentOrgId = 'org_aguero_default',
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
      const [reqs, quotes, ords, sups, recs] = await Promise.all([
        getPurchaseRequisitions(currentOrgId),
        getPurchaseQuotations(currentOrgId),
        getPurchaseOrders(currentOrgId),
        getPurchasingSuppliers(currentOrgId),
        getMaterialReceipts(currentOrgId),
      ]);

      setRequisitions(reqs);
      setQuotations(quotes);
      setOrders(ords);
      setSuppliers(sups);
      setReceipts(recs);
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
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/20">
                <ShoppingCart size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  Compras & Suprimentos Industriais
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Módulo de Suprimentos
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Workflow completo: RCs de obra, equalização técnica 3-Bid, emissão de OC formal com PDF e controle de Corrida Metalúrgica.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition border border-slate-700/60"
              title="Atualizar dados de compras"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-cyan-400' : ''} />
            </button>
            <button
              onClick={() => setIsNewOrderModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20 transition"
            >
              <Plus size={15} /> Emitir OC
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-3 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
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
              onSeedDemo={loadAllData}
              userName={currentUserName}
            />
          )}

          {activeTab === 'compras-requisicoes' && (
            <PurchasingRequisitions
              organizationId={currentOrgId}
              requisitions={requisitions}
              userName={currentUserName}
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
            <PurchasingOrdersManager
              orders={orders}
              onRefresh={loadAllData}
              onOpenNewOrderModal={() => setIsNewOrderModalOpen(true)}
            />
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
            <SupplierIntelligence
              quotations={quotations}
              orders={orders}
              suppliers={suppliers}
              onNavigateSub={handleTabChange}
            />
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
        onOrderCreated={loadAllData}
      />
    </div>
  );
};
