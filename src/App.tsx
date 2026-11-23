import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PublicLandingPage } from './pages/PublicLandingPage';
import { LoginPage } from './pages/LoginPage';
import { MasterCompanySelectorPage } from './pages/MasterCompanySelectorPage';
import { AppLayout, NavSection } from './components/layout/AppLayout';
import { DashboardModule } from './modules/DashboardModule';
import { WorkOrdersModule } from './modules/WorkOrdersModule';
import { LpuApprovalsModule } from './modules/LpuApprovalsModule';
import { RecurringOrdersModule } from './modules/RecurringOrdersModule';
import { ChecklistsModule } from './modules/ChecklistsModule';
import { InspectionsModule } from './modules/InspectionsModule';
import { ItemsServicesModule } from './modules/ItemsServicesModule';
import { StockModule } from './modules/StockModule';
import { OccurrencesModule } from './modules/OccurrencesModule';
import { ReportsModule } from './modules/ReportsModule';
import { SupportModule } from './modules/SupportModule';
import { AiAssistantModule } from './modules/AiAssistantModule';
import { StructureModule } from './modules/StructureModule';
import { SettingsModule } from './modules/SettingsModule';
import { ConstructionModule } from './modules/ConstructionModule';
import { CollectiveAssetsModule, CollectiveAssetsSubSection } from './modules/CollectiveAssetsModule';
import { RhPayrollModule, RhSubSection } from './modules/RhPayrollModule';
import { CommercialModule, CommercialSubSection } from './modules/CommercialModule';
import { PurchasingModule } from './modules/PurchasingModule';
import { PurchasingSubSection } from './types/purchasing';
import { FinanceModule, FinanceSubSection } from './modules/FinanceModule';
import { TravelModule } from './modules/TravelModule';
import { TravelSubSection } from './types/travel';
import { MarketingModule } from './modules/MarketingModule';
import { MarketingSubSection } from './types/marketing';
import {
  WhatsAppAutomationModule,
  WhatsAppAutomationSubSection,
} from './modules/WhatsAppAutomationModule';
import { ThemeProvider } from './contexts/ThemeContext';
import { testConnection } from './firebase';
import { GatLogo } from './components/common/GatLogo';
import { PublicOnboardingPage } from './pages/PublicOnboardingPage';
import { FirstAccessPage } from './pages/FirstAccessPage';
import { Building2, LogOut } from 'lucide-react';
import { apiFetch } from './apiAuthFetch';

function MainRouter() {
  const { user, loading, organization, role, isMaster, clearActiveOrganization, signOut } = useAuth();

  // Route state: default is 'login' (Public presentation site is kept on standby via ?site=apresentacao or /apresentacao)
  const [currentRoute, setCurrentRoute] = useState<'landing' | 'login' | 'master-panel' | 'app' | 'admissao'>('login');
  const [currentNavSection, setCurrentNavSection] = useState<NavSection>('painel');
  const [navPayload, setNavPayload] = useState<{ targetId?: string; searchQuery?: string } | undefined>(undefined);
  const [onboardingToken, setOnboardingToken] = useState<string>('');
  const firstAccessToken = new URLSearchParams(window.location.search).get('primeiro-acesso');

  // Sync route cleanly with URL and auth state
  useEffect(() => {
    testConnection();

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const tokenQuery = urlParams.get('token') || urlParams.get('admissao');
    const standbySite = urlParams.get('site') === 'apresentacao' || path === '/apresentacao';

    if (path.startsWith('/admissao') || tokenQuery) {
      const token = tokenQuery || path.replace('/admissao', '').replace(/^\/+/, '');
      setOnboardingToken(token || '');
      setCurrentRoute('admissao');
      return;
    }

    // Standby Public Presentation Page (only accessible explicitly when requested)
    if (standbySite) {
      setCurrentRoute('landing');
      return;
    }

    if (!user) {
      setCurrentRoute('login');
      return;
    }

    // Authenticated user routing:
    // - Master without selected company -> Master Selective Panel
    // - Master with selected company OR regular user -> Company ERP Workspace
    if (isMaster && !organization) {
      setCurrentRoute('master-panel');
    } else {
      setCurrentRoute('app');
    }
  }, [user, isMaster, organization]);

  // Global lightweight keep-alive heartbeat while ERP is open so Cloud Run keeps the WhatsApp ND/OCR bridge online in real time
  useEffect(() => {
    if (!user) return;
    let active = true;
    const pingKeepAlive = () => {
      if (!active) return;
      apiFetch('/api/whatsapp/bridge/keepalive', { method: 'GET', cache: 'no-store' }).catch(() => undefined);
    };
    pingKeepAlive();
    const timer = window.setInterval(pingKeepAlive, 25_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pingKeepAlive();
    };
    window.addEventListener('focus', pingKeepAlive);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', pingKeepAlive);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  const navigate = (route: 'landing' | 'login' | 'master-panel' | 'app', section?: NavSection) => {
    setCurrentRoute(route);
    if (section) setCurrentNavSection(section);

    let path = '/';
    if (route === 'landing') path = '/apresentacao';
    if (route === 'login') path = '/login';
    if (route === 'master-panel') path = '/empresas';
    if (route === 'app') path = `/app/${section || currentNavSection}`;
    window.history.pushState({}, '', path);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] flex items-center justify-center text-[#1D1D1F] dark:text-[#F5F5F7] font-sans">
        <div className="flex flex-col items-center space-y-4">
          <GatLogo size="lg" />
          <div className="w-5 h-5 border-2 border-[#0071E3] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (firstAccessToken) {
    return <FirstAccessPage token={firstAccessToken} />;
  }

  // 0. Public Employee Onboarding Page (Token de Uso Único)
  if (currentRoute === 'admissao') {
    return (
      <PublicOnboardingPage
        token={onboardingToken}
        onNavigateHome={() => navigate('login')}
      />
    );
  }

  // 1. Standby Presentation Landing Page (only via /apresentacao or ?site=apresentacao)
  if (currentRoute === 'landing') {
    return (
      <PublicLandingPage
        onNavigateLogin={() => navigate('login')}
        onRetestSecurity={() => navigate('login')}
      />
    );
  }

  // 2. Direct Entry Login Page (Default unauthenticated route)
  if (!user || currentRoute === 'login') {
    return (
      <LoginPage
        onLoginSuccess={(loggedAsMaster) => {
          if (loggedAsMaster) {
            navigate('master-panel');
          } else {
            navigate('app', 'painel');
          }
        }}
      />
    );
  }

  // 3. Master Selective Company Panel (Only for Master user)
  if (isMaster && (!organization || currentRoute === 'master-panel')) {
    return (
      <MasterCompanySelectorPage
        onOrganizationSelected={() => navigate('app', 'painel')}
      />
    );
  }

  // 4. Guard for authenticated non-master user without an assigned company
  if (!organization) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#1C1C1E] rounded-[28px] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
              Empresa não vinculada
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-1.5 leading-relaxed">
              O e-mail <strong>{user.email}</strong> ainda não está associado a nenhuma empresa ativa. Solicite o vínculo ao administrador.
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="w-full py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold inline-flex items-center justify-center space-x-2 cursor-pointer apple-solid-btn"
          >
            <LogOut className="w-4 h-4" />
            <span>Voltar ao Login</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Protected Company ERP Workspace
  return (
    <AppLayout
      currentSection={currentNavSection}
      onNavigate={(sec, payload) => {
        setCurrentNavSection(sec);
        setNavPayload(payload);
      }}
      onOpenMasterPanel={
        isMaster
          ? () => {
              clearActiveOrganization();
              navigate('master-panel');
            }
          : undefined
      }
    >
      {currentNavSection === 'painel' && <DashboardModule onNavigate={(s) => setCurrentNavSection(s)} />}
      {currentNavSection === 'ordens' && (
        <WorkOrdersModule
          initialSearchQuery={navPayload?.searchQuery}
          initialOrderId={navPayload?.targetId}
        />
      )}
      {currentNavSection === 'ordens-aprovacoes' && <LpuApprovalsModule />}
      {currentNavSection === 'ordens-recorrencias' && <RecurringOrdersModule />}
      {currentNavSection === 'checklists' && (
        <ChecklistsModule
          initialSearchQuery={navPayload?.searchQuery}
          initialTemplateId={navPayload?.targetId}
        />
      )}
      {currentNavSection === 'inspecoes' && <InspectionsModule />}
      {(currentNavSection === 'pecas-servicos' ||
        currentNavSection === 'pecas-catalogo' ||
        currentNavSection === 'servicos-catalogo' ||
        currentNavSection === 'mao-de-obra' ||
        currentNavSection === 'subcategorias-servicos') && (
        <ItemsServicesModule
          initialSearchQuery={navPayload?.searchQuery}
          initialTab={
            currentNavSection === 'pecas-catalogo'
              ? 'peca'
              : currentNavSection === 'servicos-catalogo'
              ? 'servico'
              : currentNavSection === 'mao-de-obra'
              ? 'mao_de_obra'
              : currentNavSection === 'subcategorias-servicos'
              ? 'categorias'
              : 'peca'
          }
        />
      )}
      {currentNavSection === 'estoque' && <StockModule />}
      {currentNavSection === 'ocorrencias' && (
        <OccurrencesModule
          initialSearchQuery={navPayload?.searchQuery}
          initialOccId={navPayload?.targetId}
        />
      )}
      {currentNavSection === 'relatorios' && <ReportsModule />}
      {currentNavSection === 'suporte' && <SupportModule />}
      {currentNavSection === 'ia' && (
        <AiAssistantModule onNavigate={(sec) => setCurrentNavSection(sec as NavSection)} />
      )}
      {(currentNavSection === 'estrutura' ||
        currentNavSection === 'contratos' ||
        currentNavSection === 'auditoria') && (
        <StructureModule
          initialTab={
            currentNavSection === 'contratos'
              ? 'contratos'
              : currentNavSection === 'auditoria'
              ? 'auditoria'
              : 'organizacao'
          }
        />
      )}
      {currentNavSection === 'configuracoes' && (
        <SettingsModule onNavigate={(sec) => setCurrentNavSection(sec as NavSection)} />
      )}
      {currentNavSection.startsWith('whatsapp-') && (
        <WhatsAppAutomationModule
          activeSubSection={
            currentNavSection === 'whatsapp-automacao'
              ? 'whatsapp-central'
              : (currentNavSection as WhatsAppAutomationSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
        />
      )}
      {currentNavSection === 'obras' && <ConstructionModule />}
      {currentNavSection.startsWith('bens') && (
        <CollectiveAssetsModule
          currentOrganizationId={organization?.id}
          activeSubSection={
            currentNavSection === 'bens-coletivos'
              ? 'bens-painel'
              : (currentNavSection as CollectiveAssetsSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
          userRole={role}
          userEmail={user?.email || ''}
        />
      )}
      {(currentNavSection.startsWith('rh-') || currentNavSection === 'rh-salarios') && (
        <RhPayrollModule
          activeSubSection={
            currentNavSection === 'rh-salarios'
              ? 'rh-painel'
              : (currentNavSection as RhSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
        />
      )}
      {(currentNavSection.startsWith('comercial') || currentNavSection === 'comercial') && (
        <CommercialModule
          activeSubSection={
            currentNavSection === 'comercial'
              ? 'comercial-painel'
              : (currentNavSection as CommercialSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
        />
      )}
      {(currentNavSection.startsWith('compras') || currentNavSection === 'compras') && (
        <PurchasingModule
          currentSubSection={
            currentNavSection === 'compras'
              ? 'compras-painel'
              : (currentNavSection as PurchasingSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
          currentOrgId={organization?.id || 'org_aguero_default'}
          currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Comprador Industrial'}
        />
      )}
      {currentNavSection.startsWith('financeiro') && (
        <FinanceModule
          currentSubSection={currentNavSection === 'financeiro' ? 'financeiro-notas' : (currentNavSection as FinanceSubSection)}
        />
      )}
      {(currentNavSection.startsWith('viagens') || currentNavSection === 'viagens') && (
        <TravelModule
          currentSubSection={
            currentNavSection === 'viagens'
              ? 'viagens-painel'
              : (currentNavSection as TravelSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
          currentOrgId={organization?.id || 'org_aguero_default'}
          currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Gestor de Viagens'}
        />
      )}
      {(currentNavSection.startsWith('marketing') || currentNavSection === 'marketing') && (
        <MarketingModule
          currentOrgId={organization?.id || 'org_aguero_default'}
          currentSubSection={
            currentNavSection === 'marketing'
              ? 'marketing-painel'
              : (currentNavSection as MarketingSubSection)
          }
          onNavigateSubSection={(sec) => setCurrentNavSection(sec as NavSection)}
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}
