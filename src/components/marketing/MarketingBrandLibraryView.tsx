import React, { useState } from 'react';
import {
  Palette,
  Upload,
  Save,
  Globe,
  Share2,
  Copy,
  Check,
  FileText,
  Sliders,
  Type,
  ExternalLink,
} from 'lucide-react';
import { BrandIdentityConfig } from '../../types/marketing';
import { MarketingService } from '../../services/marketingService';

interface MarketingBrandLibraryViewProps {
  brand: BrandIdentityConfig;
  onSaveBrand: (brand: BrandIdentityConfig) => void;
}

export const MarketingBrandLibraryView: React.FC<MarketingBrandLibraryViewProps> = ({
  brand,
  onSaveBrand,
}) => {
  const [formData, setFormData] = useState<BrandIdentityConfig>({ ...brand });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveBrand(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <Palette className="w-5 h-5 text-blue-400" />
            <span>Biblioteca & Identidade Visual da Organização</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Paleta de cores institucional, logotipos oficiais, tipografia e diretrizes de tom de voz.
          </p>
        </div>

        {savedSuccess && (
          <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
            <Check className="w-3.5 h-3.5" />
            <span>Alterações salvas com sucesso!</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Colors Palette Section */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
            <span>Paleta de Cores Oficiais</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <label className="text-[11px] text-slate-400 font-semibold block">Primária (Inox)</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                />
              </div>
              <div
                className="w-full h-8 rounded-md border border-slate-700/50 shadow-inner"
                style={{ backgroundColor: formData.primaryColor }}
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <label className="text-[11px] text-slate-400 font-semibold block">Secundária (Fabril)</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                />
              </div>
              <div
                className="w-full h-8 rounded-md border border-slate-700/50 shadow-inner"
                style={{ backgroundColor: formData.secondaryColor }}
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <label className="text-[11px] text-slate-400 font-semibold block">Destaque (Cyan)</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.accentColor}
                  onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.accentColor}
                  onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                />
              </div>
              <div
                className="w-full h-8 rounded-md border border-slate-700/50 shadow-inner"
                style={{ backgroundColor: formData.accentColor }}
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <label className="text-[11px] text-slate-400 font-semibold block">Fundo Escuro</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.darkColor}
                  onChange={(e) => setFormData({ ...formData, darkColor: e.target.value })}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.darkColor}
                  onChange={(e) => setFormData({ ...formData, darkColor: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                />
              </div>
              <div
                className="w-full h-8 rounded-md border border-slate-700/50 shadow-inner"
                style={{ backgroundColor: formData.darkColor }}
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <label className="text-[11px] text-slate-400 font-semibold block">Tom Claro (Texto)</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.lightColor}
                  onChange={(e) => setFormData({ ...formData, lightColor: e.target.value })}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.lightColor}
                  onChange={(e) => setFormData({ ...formData, lightColor: e.target.value })}
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                />
              </div>
              <div
                className="w-full h-8 rounded-md border border-slate-700/50 shadow-inner"
                style={{ backgroundColor: formData.lightColor }}
              />
            </div>
          </div>
        </div>

        {/* Brand Information & Slogan */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Identidade Institucional & Nomes Oficiais
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Razão Social</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nome Fantasia / Marca</label>
              <input
                type="text"
                value={formData.tradingName}
                onChange={(e) => setFormData({ ...formData, tradingName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Slogan Oficial</label>
              <input
                type="text"
                value={formData.slogan || ''}
                onChange={(e) => setFormData({ ...formData, slogan: e.target.value })}
                placeholder="Ex: Engenharia, Tubulações e Caldeiraria em Aço Inox com Rigor Sanitário"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">
                Diretrizes de Tom de Voz & Redação
              </label>
              <textarea
                rows={3}
                value={formData.brandVoiceGuidelines}
                onChange={(e) =>
                  setFormData({ ...formData, brandVoiceGuidelines: e.target.value })
                }
                placeholder="Ex: Tom técnico, focado em precisão milimétrica, conformidade com normas sanitárias e zero acidentes..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Official Channels & Handles */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 space-y-4 shadow-lg">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Canais Digitais Oficiais
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Site Institucional</label>
              <input
                type="text"
                value={formData.websiteUrl || ''}
                onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                placeholder="https://agueroinox.com.br"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Instagram</label>
              <input
                type="text"
                value={formData.officialSocialHandles?.instagram || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    officialSocialHandles: {
                      ...formData.officialSocialHandles,
                      instagram: e.target.value,
                    },
                  })
                }
                placeholder="@agueroinox"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">LinkedIn Company</label>
              <input
                type="text"
                value={formData.officialSocialHandles?.linkedin || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    officialSocialHandles: {
                      ...formData.officialSocialHandles,
                      linkedin: e.target.value,
                    },
                  })
                }
                placeholder="company/aguero-inox"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            Salvar Identidade Visual
          </button>
        </div>
      </form>
    </div>
  );
};
