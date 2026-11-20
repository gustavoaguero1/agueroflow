import React, { useState } from 'react';
import { CollectiveAssetPolicy } from '../../types/collectiveAssets';
import { updateCollectiveAssetPolicy } from '../../services/collectiveAssetsService';
import { Settings, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CollectivePolicyModalProps {
  organizationId: string;
  policy: CollectiveAssetPolicy;
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

export const CollectivePolicyModal: React.FC<CollectivePolicyModalProps> = ({
  organizationId,
  policy,
  isOpen,
  onClose,
  canManage,
}) => {
  const [blockOnMissingHistory, setBlockOnMissingHistory] = useState(policy.blockCheckoutOnMissingHistory);
  const [defaultWarningDays, setDefaultWarningDays] = useState(policy.defaultWarningDaysBeforeExpiration);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    try {
      setIsSubmitting(true);
      await updateCollectiveAssetPolicy(organizationId, {
        blockOnNoHistory: blockOnMissingHistory,
        blockCheckoutOnMissingHistory: blockOnMissingHistory,
        defaultWarningDays,
        defaultWarningDaysBeforeExpiration: defaultWarningDays,
      });
      setSuccessMessage('Políticas da organização atualizadas com sucesso!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      console.error('Erro ao salvar política:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao atualizar políticas.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#121826] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-500" />
            Políticas de Retirada e Bloqueio
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="p-4 bg-[#0b101b] rounded-xl border border-slate-800 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={blockOnMissingHistory}
                  onChange={(e) => setBlockOnMissingHistory(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 mt-1"
                />
                <div>
                  <span className="text-xs text-slate-200 font-bold block">
                    Bloquear retirada se o bem estiver SEM DATA REGISTRADA de manutenção ou calibração
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-1 leading-relaxed">
                    Quando ativado, caso uma ferramenta possua periodicidade definida em sua categoria (ou específica) mas ainda não possua nenhum laudo/serviço registrado no sistema, ela não poderá ser retirada até receber o primeiro registro.
                  </span>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Antecedência padrão de alerta (dias)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                disabled={!canManage}
                value={defaultWarningDays}
                onChange={(e) => setDefaultWarningDays(parseInt(e.target.value, 10) || 30)}
                className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Usado como fallback quando a categoria não definir valor específico de antecedência.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800"
            >
              Fechar
            </button>
            {canManage && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Política'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
