import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText,
  Plus,
  Layers,
  FileSpreadsheet,
  Package,
  Settings,
  FileBarChart,
  Clock,
  AlertTriangle,
  Database,
  Building,
  MessageSquare,
} from 'lucide-react';
import {
  CommercialClient,
  CommercialMaterial,
  CommercialProposal,
  CommercialProposalItem,
  CommercialPolicy,
  CommercialImportBatch,
} from '../types/commercial';
import {
  getProposals,
  getProposalItems,
  getMaterials,
  getClients,
  getCommercialPolicy,
  getImportBatches,
  deleteProposal,
} from '../services/commercialService';
import { CommercialDashboard } from '../components/commercial/CommercialDashboard';
import { CommercialProposalWizard } from '../components/commercial/CommercialProposalWizard';
import { CommercialBomReview } from '../components/commercial/CommercialBomReview';
import { CommercialMaterialsCatalog } from '../components/commercial/CommercialMaterialsCatalog';
import { CommercialImportsManager } from '../components/commercial/CommercialImportsManager';
import { CommercialSettingsManager } from '../components/commercial/CommercialSettingsManager';
import { CommercialReportsView } from '../components/commercial/CommercialReportsView';
import { CommercialProposalDetailModal } from '../components/commercial/CommercialProposalDetailModal';
import { CostCompositionModuleView } from '../components/commercial/costComposition/CostCompositionModuleView';
import { WhatsAppBusinessHub } from '../components/commercial/WhatsAppBusinessHub';
import { CommercialFunnelBoard } from '../components/commercial/CommercialFunnelBoard';
import { Calculator } from 'lucide-react';

export type CommercialSubSection =
  | 'comercial-painel'
  | 'comercial-funil'
  | 'comercial-nova'
  | 'comercial-composicao'
  | 'comercial-revisao'
  | 'comercial-comunicacao'
  | 'comercial-importacoes'
  | 'comercial-materiais'
  | 'comercial-configuracoes'
  | 'comercial-relatorios';

interface CommercialModuleProps {
  activeSubSection?: CommercialSubSection;
  onNavigateSubSection?: (section: CommercialSubSection) => void;
}

export const CommercialModule: React.FC<CommercialModuleProps> = ({
  activeSubSection = 'comercial-painel',
  onNavigateSubSection,
}) => {
  const { user, organization, role, moduleLevel } = useAuth();
  const organizationId = organization?.id || '';
  const userId = user?.uid || '';
  const userName = user?.displayName || user?.email || 'Representante Comercial';

  const [currentTab, setCurrentTab] = useState<CommercialSubSection>(activeSubSection);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [catalog, setCatalog] = useState<CommercialMaterial[]>([]);
  const [clients, setClients] = useState<CommercialClient[]>([]);
  const [policy, setPolicy] = useState<CommercialPolicy | null>(null);
  const [importBatches, setImportBatches] = useState<CommercialImportBatch[]>([]);

  // Selected proposal for BOM review or view
  const [selectedProposal, setSelectedProposal] = useState<CommercialProposal | null>(null);
  const [selectedProposalItems, setSelectedProposalItems] = useState<CommercialProposalItem[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (activeSubSection) {
      setCurrentTab(activeSubSection);
    }
  }, [activeSubSection]);

  const setTab = (tab: CommercialSubSection) => {
    setCurrentTab(tab);
    if (onNavigateSubSection) {
      onNavigateSubSection(tab);
    }
  };

  // Load Firestore data
  const loadData = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [props, mats, clis, pol, batches] = await Promise.all([
        getProposals(organizationId),
        getMaterials(organizationId),
        getClients(organizationId),
        getCommercialPolicy(organizationId),
        getImportBatches(organizationId),
      ]);

      setProposals(props);
      setCatalog(mats);
      setClients(clis);
      setPolicy(pol);
      setImportBatches(batches);

      // If a proposal was selected, refresh its items
      if (selectedProposal) {
        const found = props.find((p) => p.id === selectedProposal.id);
        if (found) {
          setSelectedProposal(found);
          const items = await getProposalItems(found.id);
          setSelectedProposalItems(items);
        }
      } else if (props.length > 0) {
        setSelectedProposal(props[0]);
        const items = await getProposalItems(props[0].id);
        setSelectedProposalItems(items);
      }
    } catch (err) {
      console.error('Error loading commercial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [organizationId]);

  // Handle Review BOM
  const handleReviewBom = async (proposal: CommercialProposal) => {
    setSelectedProposal(proposal);
    const items = await getProposalItems(proposal.id);
    setSelectedProposalItems(items);
    setTab('comercial-revisao');
  };

  // Handle Open Detail Modal
  const handleOpenDetail = async (proposal: CommercialProposal) => {
    setSelectedProposal(proposal);
    const items = await getProposalItems(proposal.id);
    setSelectedProposalItems(items);
    setDetailModalOpen(true);
  };

  // Handle Delete Proposal
  const handleDeleteProposal = async (proposalId: string) => {
    await deleteProposal(proposalId);
    await loadData();
  };

  // Handle Wizard Success
  const handleWizardSuccess = async (newProposalId: string) => {
    await loadData();
    const props = await getProposals(organizationId);
    const created = props.find((p) => p.id === newProposalId);
    if (created) {
      setSelectedProposal(created);
      const items = await getProposalItems(created.id);
      setSelectedProposalItems(items);
    }
    setTab('comercial-revisao');
  };

  const navTabs = [
    { id: 'comercial-painel' as CommercialSubSection, label: 'Painel de Propostas', icon: FileText },
    { id: 'comercial-funil' as CommercialSubSection, label: 'Funil de Vendas', icon: Calculator },
    { id: 'comercial-nova' as CommercialSubSection, label: 'Nova Proposta', icon: Plus },
    { id: 'comercial-composicao' as CommercialSubSection, label: 'Composição de Custos', icon: Calculator },
    { id: 'comercial-revisao' as CommercialSubSection, label: 'Revisão de BOM', icon: Layers },
    { id: 'comercial-comunicacao' as CommercialSubSection, label: 'Comunicação WhatsApp', icon: MessageSquare },
    { id: 'comercial-importacoes' as CommercialSubSection, label: 'Importações', icon: FileSpreadsheet },
    { id: 'comercial-materiais' as CommercialSubSection, label: 'Materiais e Preços', icon: Package },
    { id: 'comercial-configuracoes' as CommercialSubSection, label: 'Configurações Comerciais', icon: Settings },
    { id: 'comercial-relatorios' as CommercialSubSection, label: 'Relatórios', icon: FileBarChart },
  ];

  return (
    <div className="space-y-6">
      {/* Submenu Tabs Bar */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-1.5 shadow-xl flex items-center overflow-x-auto gap-1">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-medium">Carregando módulo comercial OrçaÁgil...</p>
        </div>
      ) : (
        <>
          {currentTab === 'comercial-painel' && (
            <CommercialDashboard
              proposals={proposals}
              onNewProposal={() => setTab('comercial-nova')}
              onReviewBom={handleReviewBom}
              onOpenProposalDetail={handleOpenDetail}
              onDeleteProposal={handleDeleteProposal}
              userRole={role}
            />
          )}

          {currentTab === 'comercial-funil' && (
            <CommercialFunnelBoard proposals={proposals} user={{ uid: userId, name: userName }} onRefresh={loadData} />
          )}

          {currentTab === 'comercial-nova' && (
            <CommercialProposalWizard
              organizationId={organizationId}
              clients={clients}
              catalog={catalog}
              policy={policy}
              userId={userId}
              userName={userName}
              onSuccess={handleWizardSuccess}
              onCancel={() => setTab('comercial-painel')}
            />
          )}

          {currentTab === 'comercial-composicao' && (
            <CostCompositionModuleView
              organizationId={organizationId}
              userName={userName}
              userRole={role}
              proposals={proposals}
              catalog={catalog}
              clients={clients}
              onNavigateProposal={handleOpenDetail}
            />
          )}

          {currentTab === 'comercial-revisao' && (
            <>
              {selectedProposal ? (
                <CommercialBomReview
                  proposal={selectedProposal}
                  items={selectedProposalItems}
                  catalog={catalog}
                  organizationName={organization?.name || 'AgueroFlow Industrial'}
                  canApprove={moduleLevel('comercial-revisao') >= 3}
                  userName={userName}
                  onRefresh={loadData}
                  onNavigateBack={() => setTab('comercial-painel')}
                />
              ) : (
                <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-8 text-center text-slate-400 space-y-3">
                  <Layers className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-sm font-medium">Nenhuma proposta selecionada para revisão de BOM.</p>
                  <button
                    onClick={() => setTab('comercial-painel')}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-lg transition"
                  >
                    Ir para o Painel de Propostas
                  </button>
                </div>
              )}
            </>
          )}

          {currentTab === 'comercial-comunicacao' && (
            <WhatsAppBusinessHub
              organizationId={organizationId}
              organizationName={organization?.name || 'AgueroFlow Industrial'}
              userName={userName}
              proposals={proposals}
              clients={clients}
            />
          )}

          {currentTab === 'comercial-importacoes' && (
            <CommercialImportsManager
              organizationId={organizationId}
              catalog={catalog}
              importBatches={importBatches}
              userId={userId}
              userName={userName}
              onRefresh={loadData}
            />
          )}

          {currentTab === 'comercial-materiais' && (
            <CommercialMaterialsCatalog
              organizationId={organizationId}
              catalog={catalog}
              userName={userName}
              onRefresh={loadData}
            />
          )}

          {currentTab === 'comercial-configuracoes' && (
            <CommercialSettingsManager
              policy={policy}
              organizationId={organizationId}
              userName={userName}
              onRefresh={loadData}
            />
          )}

          {currentTab === 'comercial-relatorios' && (
            <CommercialReportsView
              proposals={proposals}
              organizationName={organization?.name || 'AgueroFlow Industrial'}
            />
          )}
        </>
      )}

      {/* Global Proposal Detail Modal */}
      {detailModalOpen && selectedProposal && (
        <CommercialProposalDetailModal
          proposal={selectedProposal}
          items={selectedProposalItems}
          organizationName={organization?.name || 'AgueroFlow Industrial'}
          userRole={role}
          onClose={() => setDetailModalOpen(false)}
        />
      )}
    </div>
  );
};
