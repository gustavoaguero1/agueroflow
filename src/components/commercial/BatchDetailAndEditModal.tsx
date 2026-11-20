import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Edit2,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Search,
  Check,
  Calendar,
  DollarSign,
  Building,
  Sparkles,
  Info,
} from 'lucide-react';
import { CommercialImportBatch, CommercialMaterial } from '../../types/commercial';
import { updateMaterial, deleteMaterial, deleteImportBatch } from '../../services/commercialService';

interface BatchDetailAndEditModalProps {
  batch: CommercialImportBatch;
  catalog: CommercialMaterial[];
  userId: string;
  userName: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const BatchDetailAndEditModal: React.FC<BatchDetailAndEditModalProps> = ({
  batch,
  catalog,
  userId,
  userName,
  onClose,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'created' | 'updated'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    baseCost: number;
    description: string;
    supplierName: string;
    unit: string;
    category: string;
    validityDays: number;
  }>({
    baseCost: 0,
    description: '',
    supplierName: '',
    unit: 'UN',
    category: '',
    validityDays: 30,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const formatBrl = (val: number | undefined) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Derive items belonging to this batch:
  // 1. Newly created materials
  const createdIds = new Set(batch.createdMaterialIds || []);
  const createdMaterials = catalog.filter((m) => createdIds.has(m.id));

  // 2. Updated materials snapshots
  const updatedSnapshots = batch.updatedMaterialsSnapshots || [];
  const updatedIds = new Set(updatedSnapshots.map((s) => s.materialId));
  const updatedMaterials = catalog.filter((m) => updatedIds.has(m.id));

  // Audit records snapshot (fallback if materials were modified outside or for detailed view)
  const auditSnapshots = batch.importedItemsSnapshot || [];

  // Start editing a material
  const handleStartEdit = (mat: CommercialMaterial) => {
    setEditingId(mat.id);
    setEditForm({
      baseCost: mat.baseCost || 0,
      description: mat.originalDescription || '',
      supplierName: mat.supplierName || '',
      unit: mat.unit || 'UN',
      category: mat.category || '',
      validityDays: mat.validityDays || 30,
    });
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (matId: string) => {
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await updateMaterial(matId, {
        baseCost: Number(editForm.baseCost) || 0,
        originalDescription: editForm.description,
        normalizedDescription: editForm.description.toUpperCase(),
        supplierName: editForm.supplierName,
        unit: editForm.unit.toUpperCase(),
        category: editForm.category,
        validityDays: Number(editForm.validityDays) || 30,
      });

      setSuccessMsg('Material atualizado com sucesso no catálogo!');
      setEditingId(null);
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(`Erro ao salvar: ${err.message || 'Falha inesperada'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (matId: string, desc: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o material "${desc}" do catálogo?`)) return;
    setIsSaving(true);
    try {
      await deleteMaterial(matId);
      setSuccessMsg(`Material excluído com sucesso.`);
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(`Erro ao excluir: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete batch and its imported materials
  const handleExecuteDeleteBatch = async () => {
    setIsReverting(true);
    setErrorMsg('');
    try {
      const result = await deleteImportBatch(batch.id, batch.organizationId);
      setSuccessMsg(
        `Lote excluído com sucesso! ${result.deletedMaterialsCount} materiais importados foram removidos do catálogo.`
      );
      setShowRollbackConfirm(false);
      await onRefresh();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(`Falha ao excluir lote: ${err.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  // Combined list of rows to display
  type RowDisplay = {
    id: string;
    materialId?: string;
    type: 'criado' | 'atualizado' | 'snapshot';
    code: string;
    description: string;
    unit: string;
    category?: string;
    supplier?: string;
    currentCost: number;
    previousCost?: number;
    material?: CommercialMaterial;
  };

  const allRows: RowDisplay[] = [];

  // Add created materials
  createdMaterials.forEach((m) => {
    allRows.push({
      id: `created_${m.id}`,
      materialId: m.id,
      type: 'criado',
      code: m.internalCode,
      description: m.originalDescription,
      unit: m.unit,
      category: m.category,
      supplier: m.supplierName,
      currentCost: m.baseCost,
      material: m,
    });
  });

  // Add updated materials
  updatedMaterials.forEach((m) => {
    const snap = updatedSnapshots.find((s) => s.materialId === m.id);
    allRows.push({
      id: `updated_${m.id}`,
      materialId: m.id,
      type: 'atualizado',
      code: m.internalCode,
      description: m.originalDescription,
      unit: m.unit,
      category: m.category,
      supplier: m.supplierName,
      currentCost: m.baseCost,
      previousCost: snap?.previousBaseCost,
      material: m,
    });
  });

  // If no materials matched catalog (e.g. batch before this feature or already deleted), fallback to audit snapshots
  if (allRows.length === 0 && auditSnapshots.length > 0) {
    auditSnapshots.forEach((snap, idx) => {
      allRows.push({
        id: `audit_${idx}`,
        materialId: snap.materialId,
        type: snap.actionTaken === 'criado' ? 'criado' : snap.actionTaken === 'atualizado' ? 'atualizado' : 'snapshot',
        code: snap.internalCode,
        description: snap.description,
        unit: snap.unit,
        category: snap.category,
        supplier: snap.supplierName,
        currentCost: snap.baseCost,
      });
    });
  }

  // Filter
  const filteredRows = allRows.filter((r) => {
    if (activeTab === 'created' && r.type !== 'criado') return false;
    if (activeTab === 'updated' && r.type !== 'atualizado') return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.description.toLowerCase().includes(term) ||
      r.code.toLowerCase().includes(term) ||
      (r.supplier && r.supplier.toLowerCase().includes(term))
    );
  });

  const isReverted = batch.status === 'revertido' || batch.isReverted;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl shadow-2xl flex flex-col w-full max-w-6xl max-h-[92vh] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Detalhes & Alteração de Itens do Lote <span className="text-cyan-300 font-mono">{batch.batchCode}</span>
                </h2>
                {isReverted ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    REVERTIDO
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    ATIVO NO CATÁLOGO
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Arquivo: <strong className="text-slate-200">{batch.fileName}</strong> • Importado por {batch.importedByName} em{' '}
                {new Date(batch.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowRollbackConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition cursor-pointer shadow"
              title="Excluir este lote e todos os materiais importados por ele"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir Lote e Insumos</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="m-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="m-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Delete Batch Confirmation Alert Box */}
        {showRollbackConfirm && (
          <div className="m-3 p-4 bg-rose-950/60 border-2 border-rose-600/80 rounded-xl space-y-3">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-200">
                  Excluir Permanentemente o Lote {batch.batchCode}?
                </h4>
                <p className="text-xs text-rose-300/90 mt-1">
                  Esta ação excluirá o lote e seus materiais do catálogo:
                </p>
                <ul className="list-disc list-inside text-xs text-rose-300/90 mt-1 space-y-0.5">
                  <li>
                    <strong>{batch.createdMaterialIds?.length || allRows.filter((r) => r.type === 'criado').length} materiais</strong> criados por este lote serão permanentemente excluídos do catálogo.
                  </li>
                  <li>
                    <strong>{batch.updatedMaterialsSnapshots?.length || 0} materiais</strong> que tiveram seus preços atualizados retornarão imediatamente aos valores e fornecedores anteriores.
                  </li>
                  <li>O registro deste lote será removido.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-rose-800/60">
              <button
                type="button"
                onClick={() => setShowRollbackConfirm(false)}
                disabled={isReverting}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteBatch}
                disabled={isReverting}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow-lg cursor-pointer"
              >
                {isReverting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Excluindo Lote e Materiais...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão do Lote</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Todos ({allRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('created')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'created'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
              }`}
            >
              Criados ({createdMaterials.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('updated')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'updated'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800 text-blue-400 hover:bg-slate-700'
              }`}
            >
              Preços Atualizados ({updatedMaterials.length})
            </button>
          </div>

          <div className="relative sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-auto p-4">
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Nenhum item encontrado no lote com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Origem no Lote</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Descrição</th>
                    <th className="py-2.5 px-3">Categoria</th>
                    <th className="py-2.5 px-3 text-center">Unid.</th>
                    <th className="py-2.5 px-3">Fornecedor</th>
                    <th className="py-2.5 px-3 text-right">Custo Atual (R$)</th>
                    <th className="py-2.5 px-3 text-right">Custo Anterior</th>
                    <th className="py-2.5 px-3 text-center w-28">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredRows.map((row) => {
                    const isEditing = editingId === row.materialId;

                    return (
                      <tr key={row.id} className="hover:bg-slate-900/50">
                        {/* Type badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {row.type === 'criado' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                              NOVO CRIADO
                            </span>
                          ) : row.type === 'atualizado' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                              PREÇO ATUALIZADO
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              AUDITORIA
                            </span>
                          )}
                        </td>

                        {/* Code */}
                        <td className="py-2.5 px-3 font-mono text-cyan-300 font-semibold whitespace-nowrap">
                          {row.code}
                        </td>

                        {/* Description (Editable or View) */}
                        <td className="py-2.5 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                              className="w-full bg-slate-950 border border-cyan-500 rounded px-2 py-1 text-xs text-white"
                            />
                          ) : (
                            <div className="font-medium text-white max-w-sm truncate" title={row.description}>
                              {row.description}
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-2.5 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.category}
                              onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                              className="w-28 bg-slate-950 border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white"
                            />
                          ) : (
                            <span className="text-slate-400">{row.category || '—'}</span>
                          )}
                        </td>

                        {/* Unit */}
                        <td className="py-2.5 px-3 text-center">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.unit}
                              onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))}
                              className="w-12 text-center bg-slate-950 border border-cyan-500 rounded px-1 py-0.5 text-xs text-white uppercase font-mono"
                            />
                          ) : (
                            <span className="font-mono text-slate-400">{row.unit}</span>
                          )}
                        </td>

                        {/* Supplier */}
                        <td className="py-2.5 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.supplierName}
                              onChange={(e) => setEditForm((p) => ({ ...p, supplierName: e.target.value }))}
                              className="w-32 bg-slate-950 border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white"
                            />
                          ) : (
                            <span className="text-slate-400 text-[11px]">{row.supplier || '—'}</span>
                          )}
                        </td>

                        {/* Current Cost */}
                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.baseCost}
                              onChange={(e) => setEditForm((p) => ({ ...p, baseCost: parseFloat(e.target.value) || 0 }))}
                              className="w-24 text-right bg-slate-950 border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-cyan-300 font-bold"
                            />
                          ) : (
                            <span className="font-bold text-white">{formatBrl(row.currentCost)}</span>
                          )}
                        </td>

                        {/* Previous Cost */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400 whitespace-nowrap">
                          {row.previousCost !== undefined ? formatBrl(row.previousCost) : '—'}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => row.materialId && handleSaveEdit(row.materialId)}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                title="Salvar alteração"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={handleCancelEdit}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            row.materialId && (
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => row.material && handleStartEdit(row.material)}
                                  className="p-1 rounded hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                                  title="Alterar dados ou preço deste material"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(row.materialId!, row.description)}
                                  className="p-1 rounded hover:bg-slate-800 text-rose-400 hover:text-rose-300 cursor-pointer"
                                  title="Excluir este material do catálogo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="text-slate-400 text-[11px]">
            {isReverted ? (
              <span className="text-amber-400">
                Este lote foi revertido por {batch.revertedByName || 'Administrador'} em{' '}
                {batch.revertedAt ? new Date(batch.revertedAt).toLocaleString('pt-BR') : 'Data não registrada'}.
              </span>
            ) : (
              <span>
                Você pode alterar preços e descrições dos materiais individualmente acima ou reverter o lote por completo.
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
