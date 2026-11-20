import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, FileText, CalendarClock, Sparkles } from 'lucide-react';
import { WhatsAppBusinessHub } from '../components/commercial/WhatsAppBusinessHub';
import { WhatsAppNdAutomationPanel } from '../components/ai/WhatsAppNdAutomationPanel';
import { WhatsAppScheduledCommandsPanel } from '../components/ai/WhatsAppScheduledCommandsPanel';

export type WhatsAppAutomationSubSection =
  | 'whatsapp-central'
  | 'whatsapp-nds'
  | 'whatsapp-comandos';

interface WhatsAppAutomationModuleProps {
  activeSubSection?: WhatsAppAutomationSubSection;
  onNavigateSubSection?: (sub: WhatsAppAutomationSubSection) => void;
}

export const WhatsAppAutomationModule: React.FC<WhatsAppAutomationModuleProps> = ({
  activeSubSection = 'whatsapp-central',
  onNavigateSubSection,
}) => {
  const { user, organization, logAudit } = useAuth();
  const [currentTab, setCurrentTab] = useState<WhatsAppAutomationSubSection>(activeSubSection);

  useEffect(() => {
    setCurrentTab(activeSubSection);
  }, [activeSubSection]);

  const handleTabChange = (next: WhatsAppAutomationSubSection) => {
    setCurrentTab(next);
    onNavigateSubSection?.(next);
  };

  const organizationId = organization?.id || 'org_aguero_default';
  const organizationName = organization?.name || 'Aguero Inox';
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Gestor AgueroFlow';

  return (
    <div className="space-y-5">
      {/* Unified Module Top Header & Sub-Navigation */}
      <div className="bg-white dark:bg-[#121826] border border-black/[0.08] dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-[#EBF5FF] dark:bg-blue-500/15 border border-[#0071E3]/20 dark:border-blue-500/30 flex items-center justify-center text-[#0071E3] dark:text-blue-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-[15px] font-semibold text-[#1D1D1F] dark:text-white tracking-tight leading-snug">
              Automação WhatsApp, OCR &amp; Notas de Débito
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-slate-400 leading-relaxed">
              Central conectada de Dispositivos WhatsApp Web, Leitor OCR de Comprovantes, Emissão Automática de NDs + Outlook e Comandos Programados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F2F2F7] dark:bg-slate-950/90 border border-black/[0.06] dark:border-slate-800 rounded-xl overflow-x-auto custom-scrollbar shrink-0 max-w-full">
          <button
            type="button"
            onClick={() => handleTabChange('whatsapp-central')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
              currentTab === 'whatsapp-central'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Central WhatsApp &amp; OCR</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('whatsapp-nds')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
              currentTab === 'whatsapp-nds'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>Automação NDs &amp; Outlook</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('whatsapp-comandos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
              currentTab === 'whatsapp-comandos'
                ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <span>Comandos Programados</span>
          </button>
        </div>
      </div>

      {/* Active Sub-Module Content */}
      {currentTab === 'whatsapp-central' && (
        <WhatsAppBusinessHub
          organizationId={organizationId}
          organizationName={organizationName}
          userName={userName}
          proposals={[]}
          clients={[]}
        />
      )}

      {currentTab === 'whatsapp-nds' && (
        <div className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-[#F5F5F7] dark:bg-[#0B0C10] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <WhatsAppNdAutomationPanel organizationId={organizationId} onLogAudit={logAudit} />
        </div>
      )}

      {currentTab === 'whatsapp-comandos' && (
        <div className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-white dark:bg-[#0B0C10] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)] min-h-[70vh] flex flex-col">
          <WhatsAppScheduledCommandsPanel organizationId={organizationId} onLogAudit={logAudit} />
        </div>
      )}
    </div>
  );
};
