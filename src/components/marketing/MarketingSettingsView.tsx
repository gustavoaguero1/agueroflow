import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Users,
  Bell,
  Save,
  Check,
  Building,
  Key,
} from 'lucide-react';

interface MarketingSettingsViewProps {
  currentOrgId: string;
}

export const MarketingSettingsView: React.FC<MarketingSettingsViewProps> = ({
  currentOrgId,
}) => {
  const [requireApprovalForExternal, setRequireApprovalForExternal] = useState(true);
  const [approverEmail, setApproverEmail] = useState('diretoria@agueroinox.com.br');
  const [defaultMaskClientNDA, setDefaultMaskClientNDA] = useState(true);
  const [annualMarketingBudget, setAnnualMarketingBudget] = useState('45000');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <Settings className="w-5 h-5 text-slate-400" />
            <span>Configurações do Módulo de Marketing & Comunicação</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Políticas de governança, aprovação de peças externas, sigilo contratual e limites de orçamento.
          </p>
        </div>

        {savedSuccess && (
          <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
            <Check className="w-3.5 h-3.5" />
            <span>Configurações salvas!</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs max-w-3xl">
        {/* Approvals & Governance */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span>Governança & Fluxo de Aprovação</span>
          </h3>

          <div className="space-y-3">
            <label className="flex items-start space-x-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={requireApprovalForExternal}
                onChange={(e) => setRequireApprovalForExternal(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">
                  Exigir aprovação de liderança antes da publicação externa
                </span>
                <span className="text-[11px] text-slate-400">
                  Campanhas com canais LinkedIn, Instagram ou Site permanecerão em "Aguardando Aprovação" até liberação formal.
                </span>
              </div>
            </label>

            <label className="flex items-start space-x-3 p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={defaultMaskClientNDA}
                onChange={(e) => setDefaultMaskClientNDA(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">
                  Mascarar automaticamente nomes de clientes em estudos de caso (Sigilo Industrial)
                </span>
                <span className="text-[11px] text-slate-400">
                  Garante conformidade com contratos de confidencialidade (NDA) em caldeiraria e tubulações.
                </span>
              </div>
            </label>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                E-mail do Aprovador Oficial
              </label>
              <input
                type="email"
                value={approverEmail}
                onChange={(e) => setApproverEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Annual Budget Caps */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <span>Orçamento Global de Comunicação & Eventos</span>
          </h3>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Limite Anual Previsto (R$)
            </label>
            <input
              type="number"
              value={annualMarketingBudget}
              onChange={(e) => setAnnualMarketingBudget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Alerta quando a soma de campanhas e eventos ultrapassar 80% do teto definido.
            </span>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            Salvar Configurações
          </button>
        </div>
      </form>
    </div>
  );
};
