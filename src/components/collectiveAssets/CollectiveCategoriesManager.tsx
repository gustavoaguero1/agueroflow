import React, { useState } from 'react';
import {
  CollectiveAssetCategory,
  CollectiveAsset,
} from '../../types/collectiveAssets';
import {
  createCollectiveCategory,
  updateCollectiveCategory,
  toggleCategoryStatus,
} from '../../services/collectiveAssetsService';
import {
  FolderTree,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Gauge,
  Search,
} from 'lucide-react';

interface CollectiveCategoriesManagerProps {
  organizationId: string;
  categories: CollectiveAssetCategory[];
  assets: CollectiveAsset[];
  canManage: boolean;
  onRefresh?: () => void;
}

export const CollectiveCategoriesManager: React.FC<CollectiveCategoriesManagerProps> = ({
  organizationId,
  categories,
  assets,
  canManage,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CollectiveAssetCategory | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMaintMonths, setFormMaintMonths] = useState<number | ''>(12);
  const [formCalibMonths, setFormCalibMonths] = useState<number | ''>('');
  const [formWarningDays, setFormWarningDays] = useState<number | ''>(30);
  const [formIsActive, setFormIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Assets count per category
  const assetCountByCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    assets.forEach((a) => {
      map.set(a.categoryId, (map.get(a.categoryId) || 0) + 1);
    });
    return map;
  }, [assets]);

  const filteredCategories = categories.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term));
  });

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setFormName('');
    setFormDescription('');
    setFormMaintMonths(12);
    setFormCalibMonths('');
    setFormWarningDays(30);
    setFormIsActive(true);
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: CollectiveAssetCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setFormMaintMonths(cat.preventiveMaintenancePeriodMonths || '');
    setFormCalibMonths(cat.calibrationPeriodMonths || '');
    setFormWarningDays(cat.warningDaysBeforeExpiration ?? 30);
    setFormIsActive(cat.active ?? cat.isActive ?? true);
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formName.trim()) {
      setErrorMessage('O nome da categoria é obrigatório.');
      return;
    }

    // Validation: 0 to 120
    const parseNumber = (val: number | '') => (val === '' ? 0 : Number(val));
    const maint = parseNumber(formMaintMonths);
    const calib = parseNumber(formCalibMonths);
    const warn = formWarningDays === '' ? 30 : Number(formWarningDays);

    if (maint < 0 || maint > 120) {
      setErrorMessage('A periodicidade de manutenção deve estar entre 0 e 120 meses.');
      return;
    }
    if (calib < 0 || calib > 120) {
      setErrorMessage('A periodicidade de calibração deve estar entre 0 e 120 meses.');
      return;
    }
    if (warn < 0 || warn > 120) {
      setErrorMessage('A antecedência do alerta deve estar entre 0 e 120 dias.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingCategory) {
        await updateCollectiveCategory(editingCategory.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          preventiveMaintenancePeriodMonths: maint > 0 ? maint : null,
          calibrationPeriodMonths: calib > 0 ? calib : null,
          warningDaysBeforeExpiration: warn,
          isActive: formIsActive,
        });
      } else {
        await createCollectiveCategory({
          organizationId,
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          preventiveMaintenancePeriodMonths: maint > 0 ? maint : null,
          calibrationPeriodMonths: calib > 0 ? calib : null,
          warningDaysBeforeExpiration: warn,
          isActive: true,
        });
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error('Erro ao salvar categoria:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao salvar categoria.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (cat: CollectiveAssetCategory) => {
    try {
      await toggleCategoryStatus(cat.id, !cat.isActive);
    } catch (err: unknown) {
      console.error('Erro ao alterar status:', err);
      alert(err instanceof Error ? err.message : 'Falha ao alterar status da categoria.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-indigo-400" />
            Categorias de Bens Coletivos
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configuração de periodicidades padrão de manutenção preventiva e calibração por classe de equipamento.
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-indigo-500 hover:bg-indigo-400 text-white transition shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            + Nova Categoria
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#121826] border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.map((cat) => {
          const count = assetCountByCategory.get(cat.id) || 0;
          const isActive = cat.active !== undefined ? cat.active : cat.isActive ?? true;
          const maintMonths = cat.preventiveMaintenanceIntervalMonths ?? cat.preventiveMaintenancePeriodMonths;
          const calibMonths = cat.calibrationIntervalMonths ?? cat.calibrationPeriodMonths;
          const warnDays = cat.warningDays ?? cat.warningDaysBeforeExpiration ?? 30;

            return (
              <div
                key={cat.id}
                className={`bg-[#121826] border rounded-2xl p-5 flex flex-col justify-between transition ${
                  isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {cat.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>

                  {cat.description && (
                    <p className="text-xs text-slate-400 mb-4 line-clamp-2">{cat.description}</p>
                  )}

                  <div className="space-y-2 py-3 border-y border-slate-800/60 my-3 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                        Manutenção Preventiva:
                      </span>
                      <span className="font-semibold">
                        {maintMonths ? `${maintMonths} meses` : 'Não aplicável'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                        Calibração:
                      </span>
                      <span className="font-semibold">
                        {calibMonths ? `${calibMonths} meses` : 'Não aplicável'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        Antecedência de Alerta:
                      </span>
                      <span className="font-semibold">{warnDays} dias</span>
                    </div>
                  </div>
                </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">
                  {count} {count === 1 ? 'bem vinculado' : 'bens vinculados'}
                </span>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(cat)}
                      title={cat.isActive ? 'Inativar Categoria' : 'Ativar Categoria'}
                      className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
                    >
                      {cat.isActive ? <XCircle className="w-4 h-4 text-slate-500 hover:text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </button>
                    <button
                      onClick={() => handleOpenEdit(cat)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                      title="Editar Categoria"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Adicionar/Editar Categoria */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-indigo-400" />
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria de Bens'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome da Categoria <span className="text-indigo-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ferramentas Elétricas, Instrumentos de Medição..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descrição / Observações
                </label>
                <textarea
                  rows={2}
                  placeholder="Finalidade desta classe de bens coletivos..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Periodicidade Manutenção (Meses)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    placeholder="0 = não aplicável"
                    value={formMaintMonths}
                    onChange={(e) => setFormMaintMonths(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Ex: 6 ou 12 meses. Vazio/0 = N/A.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Periodicidade Calibração (Meses)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    placeholder="0 = não aplicável"
                    value={formCalibMonths}
                    onChange={(e) => setFormCalibMonths(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Para torquímetros, níveis, etc.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Antecedência de Alerta (Dias)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={formWarningDays}
                  onChange={(e) => setFormWarningDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Padrão sugerido: 30 dias de antecedência.</p>
              </div>

              {editingCategory && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-200 font-semibold">Categoria Ativa</span>
                  </label>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
