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
  currentOrgId = 'org_aguero_default',
  currentSubSection = 'marketing-painel',
  onNavigateSubSection,
}) => {
  const [activeTab, setActiveTab] = useState<MarketingSubSection>(currentSubSection);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(() =>
    MarketingService.listCampaigns(currentOrgId)
  );
  const [events, setEvents] = useState<CorporateEvent[]>(() =>
    MarketingService.listEvents(currentOrgId)
  );
  const [assets, setAssets] = useState<CreativeAsset[]>(() =>
    MarketingService.listAssets(currentOrgId)
  );
  const [brand, setBrand] = useState<BrandIdentityConfig>(() =>
    MarketingService.getBrandIdentity(currentOrgId)
  );
  const [radar, setRadar] = useState<RadarOpportunity[]>(() =>
    generateOpportunitiesRadar(new Date().getFullYear())
  );

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
  const handleConvertOpportunity = (opp: RadarOpportunity, type: 'campaign' | 'event') => {
    if (type === 'campaign') {
      const created = MarketingService.convertOpportunityToCampaign(opp, currentOrgId);
      setCampaigns(MarketingService.listCampaigns(currentOrgId));
      handleTabChange('marketing-campanhas');
    } else {
      const created = MarketingService.convertOpportunityToEvent(opp, currentOrgId);
      setEvents(MarketingService.listEvents(currentOrgId));
      handleTabChange('marketing-eventos');
    }
  };

  const handleSaveCampaign = (campaign: MarketingCampaign) => {
    MarketingService.saveCampaign(campaign);
    setCampaigns(MarketingService.listCampaigns(currentOrgId));
  };

  const handleDeleteCampaign = (id: string) => {
    MarketingService.deleteCampaign(id, currentOrgId);
    setCampaigns(MarketingService.listCampaigns(currentOrgId));
  };

  const handleSaveEvent = (event: CorporateEvent) => {
    MarketingService.saveEvent(event);
    setEvents(MarketingService.listEvents(currentOrgId));
  };

  const handleDeleteEvent = (id: string) => {
    MarketingService.deleteEvent(id, currentOrgId);
    setEvents(MarketingService.listEvents(currentOrgId));
  };

  const handleSaveAsset = (asset: CreativeAsset) => {
    MarketingService.saveAsset(asset);
    setAssets(MarketingService.listAssets(currentOrgId));
  };

  const handleSaveBrand = (updatedBrand: BrandIdentityConfig) => {
    MarketingService.saveBrandIdentity(updatedBrand);
    setBrand(updatedBrand);
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
