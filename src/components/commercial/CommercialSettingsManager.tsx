import React, { useState } from 'react';
import {
  Settings,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { CommercialPolicy } from '../../types/commercial';
import { saveCommercialPolicy } from '../../services/commercialService';
import { useAuth } from '../../contexts/AuthContext';

interface CommercialSettingsManagerProps {
  policy: CommercialPolicy | null;
  organizationId: string;
  userName: string;
  onRefresh: () => Promise<void>;
}

export const CommercialSettingsManager: React.FC<CommercialSettingsManagerProps> = ({
  policy,
  organizationId,
  userName,
  onRefresh,
}) => {
  const { moduleLevel } = useAuth();
  const canAdminister = moduleLevel('comercial-configuracoes') >= 4;

  const [defaultMarkup, setDefaultMarkup] = useState<number>(policy?.defaultMarkupPercent || 25);
  const [minMarkup, setMinMarkup] = useState<number>(policy?.minMarkupPercent || 15);
  const [maxMarkup, setMaxMarkup] = useState<number>(policy?.maxMarkupPercent || 60);

  // Category Markups
  const [tubulacoesMarkup, setTubulacoesMarkup] = useState<number>(policy?.categoryMarkups?.['Tubulações'] || 25);
  const [valvulasMarkup, setValvulasMarkup] = useState<number>(policy?.categoryMarkups?.['Válvulas'] || 28);
  const [conexoesMarkup, setConexoesMarkup] = useState<number>(policy?.categoryMarkups?.['Conexões'] || 25);
  const [instrumentacaoMarkup, setInstrumentacaoMarkup] = useState<number>(
    policy?.categoryMarkups?.['Instrumentação'] || 35
  );
  const [fixacaoMarkup, setFixacaoMarkup] = useState<number>(policy?.categoryMarkups?.['Fixação'] || 20);

  // Quote Validity Days
  const [tubulacoesValidity, setTubulacoesValidity] = useState<number>(
    policy?.quoteValidityDaysByCategory?.['Tubulações'] || 15
  );
  const [valvulasValidity, setValvulasValidity] = useState<number>(
    policy?.quoteValidityDaysByCategory?.['Válvulas'] || 30
  );
  const [conexoesValidity, setConexoesValidity] = useState<number>(
    policy?.quoteValidityDaysByCategory?.['Conexões'] || 20
  );
  const [instrumentacaoValidity, setInstrumentacaoValidity] = useState<number>(
    policy?.quoteValidityDaysByCategory?.['Instrumentação'] || 30
  );

  // Interactive Test Calculator
  const [testCost, setTestCost] = useState<number>(100);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdminister) {
      alert('A alteração das políticas comerciais exige nível Administrar em Configurações Comerciais.');
      return;
    }

    setSaving(true);
    try {
      const updatedPolicy: CommercialPolicy = {
        id: organizationId,
        organizationId,
        defaultMarkupPercent: defaultMarkup,
        minMarkupPercent: minMarkup,
        maxMarkupPercent: maxMarkup,
        categoryMarkups: {
          Tubulações: tubulacoesMarkup,
          Válvulas: valvulasMarkup,
          Conexões: conexoesMarkup,
          Instrumentação: instrumentacaoMarkup,
          Fixação: fixacaoMarkup,
        },
        quoteValidityDaysByCategory: {
          Tubulações: tubulacoesValidity,
          Válvulas: valvulasValidity,
          Conexões: conexoesValidity,
          Instrumentação: instrumentacaoValidity,
        },
        allowedCurrencies: ['BRL', 'USD', 'EUR'],
        updatedAt: new Date().toISOString(),
        updatedBy: userName,
      };

      await saveCommercialPolicy(updatedPolicy);
      setSuccessMsg('Políticas comerciais e regras de markup atualizadas com sucesso!');
      setTimeout(() => setSuccessMsg(''), 4000);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Deterministic live test calculation
  const calculatedTestPrice = testCost * (1 + defaultMarkup / 100);
  const calculatedGrossMarginAmt = calculatedTestPrice - testCost;
  const calculatedGrossMarginPct = calculatedTestPrice > 0 ? (calculatedGrossMarginAmt / calculatedTestPrice) * 100 : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          <span>Configurações Comerciais & Diretrizes de Preço (OrçaÁgil)</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Defina as políticas de markup autorizado sobre o custo-base, limites e prazos de validade por categoria.
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Interactive Deterministic Verification Box */}
      <div className="bg-[#0B132B] border border-cyan-800/80 rounded-xl p-5 shadow-2xl text-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              Verificação da Memória de Cálculo Determinística
            </h3>
          </div>
          <span className="text-[11px] text-cyan-400 font-mono">Regra de Negócio Oficial</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          O AgueroFlow aplica cálculo determinístico com precisão monetária final em centavos:
          <strong className="text-white block mt-1">
            Preço Proposto = Custo-base × (1 + Markup ÷ 100)
          </strong>
        </p>

        {/* Live Simulator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/90 p-4 rounded-xl border border-slate-800 items-center">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Custo-Base do Item de Teste</label>
            <div className="flex items-center space-x-1 font-mono">
              <span className="text-slate-400 text-xs">R$</span>
              <input
                type="number"
                value={testCost}
                onChange={(e) => setTestCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Markup Autorizado</label>
            <p className="text-base font-bold font-mono text-cyan-400">{defaultMarkup}% sobre custo</p>
            <span className="text-[10px] text-slate-500">Configuração Global Padrão</span>
          </div>

          <div className="text-right border-l border-slate-800 pl-4">
            <span className="text-[11px] text-slate-400 block mb-0.5">Preço Proposto ao Cliente:</span>
            <p className="text-lg font-bold font-mono text-emerald-400">
              R$ {calculatedTestPrice.toFixed(2).replace('.', ',')}
            </p>
            <span className="text-[10px] text-slate-400 font-mono block">
              Margem Bruta: {calculatedGrossMarginPct.toFixed(1)}% (R$ {calculatedGrossMarginAmt.toFixed(2)})
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 italic">
          * Teste obrigatório do sistema: custo de R$ 100,00 e markup de 25% = exatamente R$ 125,00.
        </p>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 shadow-2xl space-y-6 text-slate-100">
        {/* Global Limits */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
            Limites Globais de Markup
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Markup Padrão Global (%) *</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={defaultMarkup}
                onChange={(e) => setDefaultMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Markup Mínimo Autorizado (%) *</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={minMarkup}
                onChange={(e) => setMinMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Markup Máximo Autorizado (%) *</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={maxMarkup}
                onChange={(e) => setMaxMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold"
              />
            </div>
          </div>
        </div>

        {/* Category Markups */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
            Markup por Categoria de Material
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Tubulações (%)</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={tubulacoesMarkup}
                onChange={(e) => setTubulacoesMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Válvulas (%)</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={valvulasMarkup}
                onChange={(e) => setValvulasMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Conexões (%)</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={conexoesMarkup}
                onChange={(e) => setConexoesMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Instrumentação (%)</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={instrumentacaoMarkup}
                onChange={(e) => setInstrumentacaoMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Fixação (%)</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={fixacaoMarkup}
                onChange={(e) => setFixacaoMarkup(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Validity Days */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
            Validade Máxima da Cotação por Categoria (Dias)
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Tubulações Inox</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={tubulacoesValidity}
                onChange={(e) => setTubulacoesValidity(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Válvulas & Atuadores</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={valvulasValidity}
                onChange={(e) => setValvulasValidity(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Conexões & Flanges</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={conexoesValidity}
                onChange={(e) => setConexoesValidity(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Instrumentação</label>
              <input
                type="number"
                disabled={!canAdminister}
                value={instrumentacaoValidity}
                onChange={(e) => setInstrumentacaoValidity(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {canAdminister ? (
          <div className="flex justify-end pt-3 border-t border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition shadow-lg disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{saving ? 'Gravando Políticas...' : 'Salvar Políticas Comerciais'}</span>
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-amber-400/90 italic pt-2">
            * Somente administradores da organização têm permissão para editar markups e limites globais.
          </p>
        )}
      </form>
    </div>
  );
};
