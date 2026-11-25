import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Calendar,
  Megaphone,
  PartyPopper,
  Palette,
  HardHat,
  TrendingUp,
  Settings,
  Layers,
  CheckCircle,
} from 'lucide-react';
import {
  MarketingSubSection,
  MarketingCampaign,
  CorporateEvent,
  RadarOpportunity,
  CreativeAsset,
  BrandIdentityConfig,
} from '../types/marketing';
import { MarketingService, generateOpportunitiesRadar } from '../services/marketingService';
import { MarketingOverviewView } from '../components/marketing/MarketingOverviewView';
import { MarketingCalendarView } from '../components/marketing/MarketingCalendarView';
import { MarketingCampaignsView } from '../components/marketing/MarketingCampaignsView';
import { MarketingEventsView } from '../components/marketing/MarketingEventsView';
import { MarketingStudioView } from '../components/marketing/MarketingStudioView';
import { MarketingProjectContentView } from '../components/marketing/MarketingProjectContentView';
import { MarketingBrandLibraryView } from '../components/marketing/MarketingBrandLibraryView';
import { MarketingPerformanceView } from '../components/marketing/MarketingPerformanceView';
import { MarketingSettingsView } from '../components/marketing/MarketingSettingsView';

interface MarketingModuleProps {
  currentOrgId?: string;
  currentSubSection?: MarketingSubSection;
  onNavigateSubSection?: (sub: MarketingSubSection) => void;
}

export const MarketingModule: React.FC<MarketingModuleProps> = ({
  currentOrgId = '',
  currentSubSection = 'marketing-painel',
  onNavigateSubSection,
}) => {
  const [activeTab, setActiveTab] = useState<MarketingSubSection>(currentSubSection);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [events, setEvents] = useState<CorporateEvent[]>([]);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [brand, setBrand] = useState<BrandIdentityConfig>(() =>
    MarketingService.getDefaultBrandIdentity(currentOrgId)
  );
  const [radar] = useState<RadarOpportunity[]>(() =>
    generateOpportunitiesRadar(new Date().getFullYear())
  );

  useEffect(() => {
    if (!currentOrgId) return;
    let active = true;
    Promise.all([
      MarketingService.fetchCampaigns(currentOrgId),
      MarketingService.fetchEvents(currentOrgId),
      MarketingService.fetchAssets(currentOrgId),
      MarketingService.fetchBrandIdentity(currentOrgId),
    ])
      .then(([c, e, a, b]) => {
        if (!active) return;
        setCampaigns(c);
        setEvents(e);
        setAssets(a);
        setBrand(b);
      })
      .catch((err) => {
        console.error('Erro ao carregar dados de Marketing no Firestore:', err);
      });
    return () => {
      active = false;
    };
  }, [currentOrgId]);

  // Sync prop changes
  useEffect(() => {
    if (currentSubSection && currentSubSection !== activeTab) {
      setActiveTab(currentSubSection);
    }
  }, [currentSubSection]);

  const handleTabChange = (tab: MarketingSubSection) => {
    setActiveTab(tab);
    if (onNavigateSubSection) {
      onNavigateSubSection(tab);
    }
  };

  // Convert opportunity from Radar
  const handleConvertOpportunity = async (opp: RadarOpportunity, type: 'campaign' | 'event') => {
    if (!currentOrgId) return;
    if (type === 'campaign') {
      const created = await MarketingService.convertOpportunityToCampaign(opp, currentOrgId);
      setCampaigns((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      handleTabChange('marketing-campanhas');
    } else {
      const created = await MarketingService.convertOpportunityToEvent(opp, currentOrgId);
      setEvents((prev) => [created, ...prev.filter((e) => e.id !== created.id)]);
      handleTabChange('marketing-eventos');
    }
  };

  const handleSaveCampaign = async (campaign: MarketingCampaign) => {
    const saved = await MarketingService.saveCampaign({ ...campaign, organizationId: currentOrgId || campaign.organizationId });
    setCampaigns((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
  };

  const handleDeleteCampaign = async (id: string) => {
    await MarketingService.deleteCampaign(id, currentOrgId);
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSaveEvent = async (event: CorporateEvent) => {
    const saved = await MarketingService.saveEvent({ ...event, organizationId: currentOrgId || event.organizationId });
    setEvents((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
  };

  const handleDeleteEvent = async (id: string) => {
    await MarketingService.deleteEvent(id, currentOrgId);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const handleSaveAsset = async (asset: CreativeAsset) => {
    const saved = await MarketingService.saveAsset({ ...asset, organizationId: currentOrgId || asset.organizationId });
    setAssets((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);
  };

  const handleSaveBrand = async (updatedBrand: BrandIdentityConfig) => {
    const saved = await MarketingService.saveBrandIdentity({ ...updatedBrand, organizationId: currentOrgId || updatedBrand.organizationId });
    setBrand(saved);
  };

  const SUBSECTIONS = [
    { id: 'marketing-painel' as MarketingSubSection, label: 'Visão Geral', icon: Sparkles },
    { id: 'marketing-calendario' as MarketingSubSection, label: 'Calendário & Radar', icon: Calendar },
    { id: 'marketing-campanhas' as MarketingSubSection, label: 'Campanhas', icon: Megaphone },
    { id: 'marketing-eventos' as MarketingSubSection, label: 'Eventos', icon: PartyPopper },
    { id: 'marketing-estudio' as MarketingSubSection, label: 'Estúdio Criativo', icon: Palette },
    { id: 'marketing-conteudo-obras' as MarketingSubSection, label: 'Obras em Conteúdo', icon: HardHat },
    { id: 'marketing-biblioteca' as MarketingSubSection, label: 'Identidade Visual', icon: Layers },
    { id: 'marketing-desempenho' as MarketingSubSection, label: 'Desempenho & Tráfego', icon: TrendingUp },
    { id: 'marketing-configuracoes' as MarketingSubSection, label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Sub-navigation tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto pb-2 border-b border-slate-800 custom-scrollbar text-xs">
        {SUBSECTIONS.map((sub) => {
          const Icon = sub.icon;
          const isActive = activeTab === sub.id;
          return (
            <button
              key={sub.id}
              onClick={() => handleTabChange(sub.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{sub.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === 'marketing-painel' && (
        <MarketingOverviewView
          onNavigateSubSection={handleTabChange}
          campaigns={campaigns}
          events={events}
          radar={radar}
          onConvertOpportunity={handleConvertOpportunity}
        />
      )}

      {activeTab === 'marketing-calendario' && (
        <MarketingCalendarView
          radar={radar}
          onConvertOpportunity={handleConvertOpportunity}
          onSelectDateForCampaign={(d) => {
            handleTabChange('marketing-campanhas');
          }}
        />
      )}

      {activeTab === 'marketing-campanhas' && (
        <MarketingCampaignsView
          campaigns={campaigns}
          onSaveCampaign={handleSaveCampaign}
          onDeleteCampaign={handleDeleteCampaign}
          currentOrgId={currentOrgId}
        />
      )}

      {activeTab === 'marketing-eventos' && (
        <MarketingEventsView
          events={events}
          onSaveEvent={handleSaveEvent}
          onDeleteEvent={handleDeleteEvent}
          currentOrgId={currentOrgId}
        />
      )}

      {activeTab === 'marketing-estudio' && (
        <MarketingStudioView
          assets={assets}
          onSaveAsset={handleSaveAsset}
          currentOrgId={currentOrgId}
          brand={brand}
        />
      )}

      {activeTab === 'marketing-conteudo-obras' && <MarketingProjectContentView />}

      {activeTab === 'marketing-biblioteca' && (
        <MarketingBrandLibraryView brand={brand} onSaveBrand={handleSaveBrand} />
      )}

      {activeTab === 'marketing-desempenho' && <MarketingPerformanceView />}

      {activeTab === 'marketing-configuracoes' && (
        <MarketingSettingsView currentOrgId={currentOrgId} />
      )}
    </div>
  );
};
