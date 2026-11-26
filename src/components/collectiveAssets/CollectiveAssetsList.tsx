import React, { useState, useMemo } from 'react';
import {
  CollectiveAsset,
  CollectiveAssetCategory,
  CollectiveAssetMovement,
  CollectiveAssetService,
} from '../../types/collectiveAssets';
import { Unit } from '../../types';
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Edit2,
  Trash2,
  X,
  Upload,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  QrCode,
} from 'lucide-react';
import { QrLabelModal, type QrLabelTarget } from '../common/QrLabelModal';
import {
  validateAssetCodeUnique,
} from '../../services/collectiveAssetsService';
import { db } from '../../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

interface CollectiveAssetsListProps {
  organizationId: string;
  assets: CollectiveAsset[];
  categories: CollectiveAssetCategory[];
  movements: CollectiveAssetMovement[];
  services: CollectiveAssetService[];
  units: Unit[];
  canManage: boolean;
  onOpenAssetDetail: (asset: CollectiveAsset) => void;
  onOpenCheckout: (asset: CollectiveAsset) => void;
  onOpenReturn: (movement: CollectiveAssetMovement) => void;
  onOpenService: (asset: CollectiveAsset) => void;
}

export const CollectiveAssetsList: React.FC<CollectiveAssetsListProps> = ({
  organizationId,
  assets,
  categories,
  movements,
  services,
  units,
  canManage,
  onOpenAssetDetail,
  onOpenCheckout,
  onOpenReturn,
  onOpenService,
}) => {
  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [situationFilter, setSituationFilter] = useState('todas');
  const [alertFilter, setAlertFilter] = useState('todos');
  const [unitFilter, setUnitFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Create / Edit Modal State
  const [qrTarget, setQrTarget] = useState<QrLabelTarget | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<CollectiveAsset | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formBrandModel, setFormBrandModel] = useState('');
  const [formSerialNumber, setFormSerialNumber] = useState('');
  const [formStorageLocation, setFormStorageLocation] = useState('');
  const [formUnitId, setFormUnitId] = useState('');
  const [formCondition, setFormCondition] = useState<CollectiveAsset['condition']>('ativo');
  const [formOverrideMaint, setFormOverrideMaint] = useState('');
  const [formOverrideCalib, setFormOverrideCalib] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filtered Assets List
  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (categoryFilter !== 'todas' && a.categoryId !== categoryFilter) return false;
      if (situationFilter !== 'todas' && a.situation !== situationFilter) return false;
      if (alertFilter !== 'todos' && a.alert !== alertFilter) return false;
      if (unitFilter !== 'todas' && a.unitId && a.unitId !== unitFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = a.code.toLowerCase().includes(q);
        const matchDesc = a.description.toLowerCase().includes(q);
        const matchBrand = (a.brandModel || '').toLowerCase().includes(q);
        const matchSerial = (a.serialNumber || '').toLowerCase().includes(q);
        const matchLoc = (a.storageLocation || '').toLowerCase().includes(q);
        const matchWorker = a.currentCheckout?.workerName.toLowerCase().includes(q);
        if (!matchCode && !matchDesc && !matchBrand && !matchSerial && !matchLoc && !matchWorker) {
          return false;
        }
      }

      return true;
    });
  }, [assets, categoryFilter, situationFilter, alertFilter, unitFilter, searchQuery]);

  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage) || 1;
  const paginatedAssets = filteredAssets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingAsset(null);
    setFormCode('');
    setFormDescription('');
    setFormCategoryId(categories[0]?.id || '');
    setFormBrandModel('');
    setFormSerialNumber('');
    setFormStorageLocation('');
    setFormUnitId(units[0]?.id || '');
    setFormCondition('ativo');
    setFormOverrideMaint('');
    setFormOverrideCalib('');
    setFormNotes('');
    setFormError(null);
    setShowFormModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (a: CollectiveAsset) => {
    setEditingAsset(a);
    setFormCode(a.code);
    setFormDescription(a.description);
    setFormCategoryId(a.categoryId);
    setFormBrandModel(a.brandModel || '');
    setFormSerialNumber(a.serialNumber || '');
    setFormStorageLocation(a.storageLocation || '');
    setFormUnitId(a.unitId || '');
    setFormCondition(a.condition);
    setFormOverrideMaint(
      a.overrideMaintenanceIntervalMonths !== undefined && a.overrideMaintenanceIntervalMonths !== null
        ? a.overrideMaintenanceIntervalMonths.toString()
        : ''
    );
    setFormOverrideCalib(
      a.overrideCalibrationIntervalMonths !== undefined && a.overrideCalibrationIntervalMonths !== null
        ? a.overrideCalibrationIntervalMonths.toString()
        : ''
    );
    setFormNotes(a.notes || '');
    setFormError(null);
    setShowFormModal(true);
  };

  // Handle Save
  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanCode = formCode.trim().toUpperCase();
    if (!cleanCode) {
      setFormError('O código do bem é obrigatório.');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('A descrição do bem é obrigatória.');
      return;
    }
    if (!formCategoryId) {
      setFormError('Selecione uma categoria.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Valida unicidade de código
      const isUnique = await validateAssetCodeUnique(organizationId, cleanCode, editingAsset?.id);
      if (!isUnique) {
        setFormError(`Já existe um bem cadastrado com o código "${cleanCode}" nesta organização.`);
        setIsSubmitting(false);
        return;
      }

      const selectedCat = categories.find((c) => c.id === formCategoryId);
      const maintOverride = formOverrideMaint.trim() === '' ? null : parseInt(formOverrideMaint, 10);
      const calibOverride = formOverrideCalib.trim() === '' ? null : parseInt(formOverrideCalib, 10);

      const assetId = editingAsset?.id || `ast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      const assetPayload: CollectiveAsset = {
        id: assetId,
        orgId: organizationId,
        unitId: formUnitId || undefined,
        code: cleanCode,
        description: formDescription.trim(),
        categoryId: formCategoryId,
        categoryName: selectedCat?.name,
        brandModel: formBrandModel.trim() || undefined,
        serialNumber: formSerialNumber.trim() || undefined,
        storageLocation: formStorageLocation.trim() || undefined,
        condition: formCondition,
        overrideMaintenanceIntervalMonths: maintOverride,
        overrideCalibrationIntervalMonths: calibOverride,
        notes: formNotes.trim() || undefined,
        attachments: editingAsset?.attachments || [],
        isDemo: editingAsset?.isDemo || false,
        createdAt: editingAsset?.createdAt || now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'collective_assets', assetId), assetPayload);

      // Log de Auditoria
      const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'audit_logs', auditId), {
        id: auditId,
        orgId: organizationId,
        userId: 'Admin',
        userEmail: 'Almoxarifado',
        module: 'Bens Coletivos',
        action: editingAsset ? 'Edição de Bem' : 'Criação de Bem',
        targetId: assetId,
        details: `${editingAsset ? 'Atualizado' : 'Cadastrado'} bem ${cleanCode} (${formDescription.trim()})`,
        timestamp: now,
      });

      setShowFormModal(false);
    } catch (err: any) {
      console.error('Erro ao salvar bem:', err);
      setFormError(err?.message || 'Falha ao salvar dados do bem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inativar ou Baixar Bem (com confirmação explícita)
  const handleBaixarAsset = async (a: CollectiveAsset) => {
    if (a.situation === 'EM_USO') {
      alert(`O bem "${a.code}" está em uso por ${a.currentCheckout?.workerName}. É necessário registrar a devolução antes de efetuar a baixa.`);
      return;
    }

    const confirmMsg =
      a.condition === 'baixado'
        ? `Deseja reativar o bem "${a.code}" para condição Ativo?`
        : `Confirma a BAIXA do bem "${a.code}" (${a.description})? O bem será retirado de circulação e não poderá receber novas retiradas.`;

    if (!confirm(confirmMsg)) return;

    try {
      const newCond = a.condition === 'baixado' ? 'ativo' : 'baixado';
      await updateDoc(doc(db, 'collective_assets', a.id), {
        condition: newCond,
        updatedAt: new Date().toISOString(),
      });

      // Auditoria
      const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'audit_logs', auditId), {
        id: auditId,
        orgId: organizationId,
        userId: 'Admin',
        userEmail: 'Almoxarifado',
        module: 'Bens Coletivos',
        action: newCond === 'baixado' ? 'Baixa de Bem' : 'Reativação de Bem',
        targetId: a.id,
        details: `Condição do bem ${a.code} alterada para ${newCond.toUpperCase()}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao alterar condição:', err);
      alert('Erro ao atualizar condição do bem.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por código, descrição, marca, série ou colaborador..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="todas">Todas as Categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={situationFilter}
            onChange={(e) => {
              setSituationFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="todas">Todas as Situações</option>
            <option value="DISPONIVEL">Disponível</option>
            <option value="EM_USO">Em Uso</option>
            <option value="EM_MANUTENCAO">Em Manutenção</option>
            <option value="BLOQUEADO">Bloqueado</option>
            <option value="BAIXADO">Baixado</option>
          </select>

          <select
            value={alertFilter}
            onChange={(e) => {
              setAlertFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="todos">Todos os Alertas</option>
            <option value="VENCIDO">Vencido</option>
            <option value="A_VENCER">A Vencer</option>
            <option value="SEM_DATA">Sem Data Registrada</option>
            <option value="EM_DIA">Em Dia</option>
            <option value="NAO_APLICAVEL">Não Aplicável</option>
          </select>
        </div>

        {canManage && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Bem Coletivo</span>
          </button>
        )}
      </div>

      {/* Assets Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/70 text-slate-400 font-semibold text-[11px]">
                <th className="py-3 px-3">Código & Patrimônio</th>
                <th className="py-3 px-3">Descrição & Marca</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3">Local / Unidade</th>
                <th className="py-3 px-3">Situação</th>
                <th className="py-3 px-3">Com Quem Está</th>
                <th className="py-3 px-3">Alerta Vencimento</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Nenhum bem coletivo localizado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedAssets.map((a) => {
                  const activeMove = movements.find((m) => m.assetId === a.id && !m.returnDate);

                  return (
                    <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <strong className="font-mono text-cyan-400 block font-bold">{a.code}</strong>
                        {a.serialNumber && (
                          <span className="text-[10px] text-slate-400 font-mono">Série: {a.serialNumber}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-white font-semibold block">{a.description}</span>
                        <span className="text-[10px] text-slate-400">{a.brandModel || 'Marca não informada'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {a.categoryName || 'Sem Categoria'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        <span>{a.storageLocation || 'Almoxarifado'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            a.situation === 'DISPONIVEL'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : a.situation === 'EM_USO'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : a.situation === 'BLOQUEADO'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : a.situation === 'EM_MANUTENCAO'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {a.situation}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {a.currentCheckout ? (
                          <div>
                            <span className="text-blue-300 font-semibold block truncate max-w-[140px]">
                              {a.currentCheckout.workerName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {a.currentCheckout.workerRegistration}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">— No armário —</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            a.alert === 'VENCIDO'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : a.alert === 'A_VENCER'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : a.alert === 'SEM_DATA'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : a.alert === 'EM_DIA'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {a.alert}
                        </span>
                        {a.nextDueDate && (
                          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                            {a.nextDueDate}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() =>
                              setQrTarget({
                                entityType: 'asset',
                                entityId: a.id,
                                orgId: organizationId,
                                code: a.code,
                                title: a.description,
                                subtitle: a.storageLocation || a.brandModel || undefined,
                                metaLines: [
                                  `Situação: ${a.situation}`,
                                  ...(a.nextDueDate ? [`Próx. calibração/manut.: ${a.nextDueDate}`] : []),
                                ],
                              })
                            }
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                            title="Etiqueta QR do Bem"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onOpenAssetDetail(a)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
                            title="Ver ficha completa do bem"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canManage && a.situation === 'DISPONIVEL' && (
                            <button
                              onClick={() => onOpenCheckout(a)}
                              className="p-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 cursor-pointer"
                              title="Registrar Retirada / Saída"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManage && a.situation === 'EM_USO' && activeMove && (
                            <button
                              onClick={() => onOpenReturn(activeMove)}
                              className="p-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 cursor-pointer"
                              title="Registrar Devolução"
                            >
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManage && (
                            <button
                              onClick={() => handleOpenEdit(a)}
                              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                              title="Editar cadastro do bem"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManage && (
                            <button
                              onClick={() => handleBaixarAsset(a)}
                              className={`p-1 rounded hover:bg-slate-800 cursor-pointer ${
                                a.condition === 'baixado' ? 'text-emerald-400' : 'text-red-400'
                              }`}
                              title={a.condition === 'baixado' ? 'Reativar bem' : 'Baixar bem'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({filteredAssets.length} registros)
            </span>
            <div className="flex items-center space-x-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Criar / Editar Bem Coletivo */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl my-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Wrench className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {editingAsset ? `Editar Bem: ${editingAsset.code}` : 'Novo Bem Coletivo'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Controle individualizado por patrimônio, calibração e periodicidade.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAsset} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Código Único / TAG *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="Ex: TIG-001, TORQ-05"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500">Deve ser único dentro da organização.</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Categoria *</label>
                  <select
                    required
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">Selecione uma categoria...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Manut: {c.preventiveMaintenanceIntervalMonths || 0}m, Calib: {c.calibrationIntervalMonths || 0}m)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Descrição do Bem / Equipamento *</label>
                <input
                  type="text"
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ex: Inversora de Solda TIG 200A, Torquímetro de Estalo 1/2..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Marca / Modelo</label>
                  <input
                    type="text"
                    value={formBrandModel}
                    onChange={(e) => setFormBrandModel(e.target.value)}
                    placeholder="Ex: Miller Maxstar 210"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Patrimônio / Nº de Série</label>
                  <input
                    type="text"
                    value={formSerialNumber}
                    onChange={(e) => setFormSerialNumber(e.target.value)}
                    placeholder="Ex: SN-88219"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Local de Guarda</label>
                  <input
                    type="text"
                    value={formStorageLocation}
                    onChange={(e) => setFormStorageLocation(e.target.value)}
                    placeholder="Ex: Almoxarifado Central - Prat. A"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Unidade / Canteiro</label>
                  <select
                    value={formUnitId}
                    onChange={(e) => setFormUnitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">Matriz / Almoxarifado Geral</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Condição Informada</label>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="ativo">Ativo (Em Operação)</option>
                    <option value="em_manutencao">Em Manutenção</option>
                    <option value="baixado">Baixado (Desativado)</option>
                  </select>
                </div>
              </div>

              {/* Regras Específicas / Sobrescrição de Categoria */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block text-[11px] flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Sobrescrever Periodicidade da Categoria (Opcional)</span>
                </span>
                <p className="text-[10px] text-slate-400">
                  Deixe vazio para herdar a categoria. Digite <strong>0</strong> para desativar o controle deste bem.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Manutenção Preventiva (Meses)</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={formOverrideMaint}
                      onChange={(e) => setFormOverrideMaint(e.target.value)}
                      placeholder="Herdar da categoria"
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Calibração (Meses)</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={formOverrideCalib}
                      onChange={(e) => setFormOverrideCalib(e.target.value)}
                      placeholder="Herdar da categoria"
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Observações Gerais</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Instruções de manuseio, acessórios inclusos na maleta, etc."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : editingAsset ? 'Salvar Alterações' : 'Cadastrar Bem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <QrLabelModal target={qrTarget} onClose={() => setQrTarget(null)} />
    </div>
  );
};
