import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  CollectiveAssetWorker,
  CollectiveAssetMovement,
  CollectiveAsset,
} from '../../types/collectiveAssets';
import {
  createCollectiveWorker,
  updateCollectiveWorker,
  toggleWorkerStatus,
  linkCollectiveWorkerToRhDirectory,
} from '../../services/collectiveAssetsService';
import type { DirectoryEntry } from '../../services/rhDirectory';
import {
  Users,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ArrowUpRight,
  UserCheck,
  UserX,
  Phone,
  Briefcase,
  Building,
  Link2,
} from 'lucide-react';

interface CollectiveWorkersManagerProps {
  organizationId: string;
  workers: CollectiveAssetWorker[];
  movements: CollectiveAssetMovement[];
  assets: CollectiveAsset[];
  canManage: boolean;
  onRefresh?: () => void;
  onOpenAssetDetail?: (asset: CollectiveAsset) => void;
}

export const CollectiveWorkersManager: React.FC<CollectiveWorkersManagerProps> = ({
  organizationId,
  workers,
  movements,
  assets,
  canManage,
  onOpenAssetDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<CollectiveAssetWorker | null>(null);
  const [rhDirectory, setRhDirectory] = useState<DirectoryEntry[]>([]);

  // Form states
  const [formRhEmployeeId, setFormRhEmployeeId] = useState('');
  const [formRegistration, setFormRegistration] = useState('');
  const [formName, setFormName] = useState('');
  const [formSector, setFormSector] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!organizationId) {
      setRhDirectory([]);
      return;
    }
    getDocs(query(collection(db, 'rh_directory'), where('orgId', '==', organizationId)))
      .then((snap) => {
        if (!active) return;
        const rows = snap.docs
          .map((d) => ({ id: d.id, rhEmployeeId: d.id, ...d.data() } as DirectoryEntry))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setRhDirectory(rows);
      })
      .catch((err) => {
        console.warn('Falha ao carregar diretório de pessoas do RH:', err);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  // Count active checkouts in possession of each worker
  const activeCheckoutsByWorker = useMemo(() => {
    const map = new Map<string, CollectiveAssetMovement[]>();
    movements.forEach((m) => {
      const isPossessed =
        m.status === 'EM_USO' ||
        (m.status as string) === 'em_uso' ||
        m.status === 'ATRASADO' ||
        (m.status as string) === 'atrasado';
      if (isPossessed) {
        const list = map.get(m.workerId) || [];
        list.push(m);
        map.set(m.workerId, list);
      }
    });
    return map;
  }, [movements]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const isActive = w.active !== undefined ? w.active : w.isActive ?? true;
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'inactive' && isActive) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const reg = (w.registrationNumber || w.registration || '').toLowerCase();
        const dept = (w.department || w.sector || '').toLowerCase();
        return (
          w.name.toLowerCase().includes(term) ||
          reg.includes(term) ||
          dept.includes(term) ||
          (w.role && w.role.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [workers, statusFilter, searchTerm]);

  const handleOpenAdd = () => {
    setEditingWorker(null);
    setFormRhEmployeeId('');
    setFormRegistration('');
    setFormName('');
    setFormSector('');
    setFormRole('');
    setFormContactPhone('');
    setFormNotes('');
    setFormIsActive(true);
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (worker: CollectiveAssetWorker) => {
    setEditingWorker(worker);
    setFormRhEmployeeId(worker.rhEmployeeId || '');
    setFormRegistration(worker.registrationNumber || worker.registration || '');
    setFormName(worker.name);
    setFormSector(worker.department || worker.sector || '');
    setFormRole(worker.role || '');
    setFormContactPhone(worker.contactPhone || '');
    setFormNotes(worker.notes || '');
    setFormIsActive(worker.active !== undefined ? worker.active : worker.isActive ?? true);
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSelectRhDirectory = (rhId: string) => {
    setFormRhEmployeeId(rhId);
    if (!rhId) return;
    const entry = rhDirectory.find((d) => d.id === rhId);
    if (!entry) return;
    setFormName(entry.name || formName);
    if (!editingWorker) {
      setFormRegistration(entry.codigoObra || entry.registrationNumber || formRegistration);
    }
    if (entry.department) setFormSector(entry.department);
    if (entry.role) setFormRole(entry.role);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formRegistration.trim()) {
      setErrorMessage('A matrícula do colaborador é obrigatória.');
      return;
    }
    if (!formName.trim()) {
      setErrorMessage('O nome do colaborador é obrigatório.');
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedRhId = formRhEmployeeId.trim();
      if (editingWorker) {
        if (selectedRhId && selectedRhId !== (editingWorker.rhEmployeeId || '')) {
          await linkCollectiveWorkerToRhDirectory(organizationId, editingWorker.id, selectedRhId);
        }
        await updateCollectiveWorker(editingWorker.id, {
          name: formName.trim(),
          sector: formSector.trim() || undefined,
          role: formRole.trim() || undefined,
          contactPhone: formContactPhone.trim() || undefined,
          notes: formNotes.trim() || undefined,
          isActive: formIsActive,
          ...(selectedRhId ? { rhEmployeeId: selectedRhId } : { rhEmployeeId: null }),
        });
      } else {
        await createCollectiveWorker({
          organizationId,
          ...(selectedRhId ? { rhEmployeeId: selectedRhId } : {}),
          registration: formRegistration.trim(),
          name: formName.trim(),
          sector: formSector.trim() || undefined,
          role: formRole.trim() || undefined,
          contactPhone: formContactPhone.trim() || undefined,
          notes: formNotes.trim() || undefined,
          isActive: true,
        });
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error('Erro ao salvar colaborador:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao salvar colaborador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (worker: CollectiveAssetWorker) => {
    const isActive = worker.active !== undefined ? worker.active : worker.isActive ?? true;
    // If attempting to deactivate a worker with active checkouts, warn
    const activeCheckouts = activeCheckoutsByWorker.get(worker.id) || [];
    if (isActive && activeCheckouts.length > 0) {
      const confirmDeact = window.confirm(
        `Atenção: Este colaborador possui ${activeCheckouts.length} bem(ns) em sua posse no momento. Deseja realmente inativá-lo? Ele não poderá retirar novos bens, mas seu histórico será preservado.`
      );
      if (!confirmDeact) return;
    }

    try {
      await toggleWorkerStatus(worker.id, !isActive);
    } catch (err: unknown) {
      console.error('Erro ao alterar status:', err);
      alert(err instanceof Error ? err.message : 'Falha ao alterar status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            Colaboradores Cadastrados
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Cadastro de colaboradores com matrícula única habilitados para retiradas de ferramentas e bens de uso coletivo.
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            + Novo Colaborador
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[#121826] p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'active'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ativos ({workers.filter((w) => (w.active !== undefined ? w.active : w.isActive ?? true)).length})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'inactive'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Inativos ({workers.filter((w) => !(w.active !== undefined ? w.active : w.isActive ?? true)).length})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({workers.length})
          </button>
        </div>

        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome, matrícula, função..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#121826] border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Workers Table */}
      <div className="bg-[#121826] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b101b] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Matrícula</th>
                <th className="py-3 px-4">Colaborador</th>
                <th className="py-3 px-4">Setor / Função</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Bens em Posse</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum colaborador encontrado.
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((w) => {
                  const checkouts = activeCheckoutsByWorker.get(w.id) || [];

                  return (
                    <tr key={w.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">
                        {w.registrationNumber || w.registration}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200 text-xs">{w.name}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {w.rhEmployeeId ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300"
                              title="Identidade vinculada ao cadastro mestre do RH (rh_employees)"
                            >
                              <Link2 className="w-2.5 h-2.5" />
                              RH: {w.rhEmployeeId}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300">
                              Sem vínculo RH
                            </span>
                          )}
                          {w.contactPhone && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {w.contactPhone}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-300 flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                          {w.role || 'Geral'}
                        </div>
                        {(w.department || w.sector) && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building className="w-3 h-3" />
                            {w.department || w.sector}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            (w.active !== undefined ? w.active : w.isActive ?? true)
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {(w.active !== undefined ? w.active : w.isActive ?? true) ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {(w.active !== undefined ? w.active : w.isActive ?? true) ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {checkouts.length > 0 ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <ArrowUpRight className="w-3 h-3" />
                              {checkouts.length} {checkouts.length === 1 ? 'item retirado' : 'itens retirados'}
                            </span>
                            <div className="text-[10px] text-slate-400 truncate max-w-[220px]">
                              {checkouts.map((c) => c.assetCode).join(', ')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">Nenhum</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleStatus(w)}
                              title={(w.active !== undefined ? w.active : w.isActive ?? true) ? 'Inativar colaborador' : 'Ativar colaborador'}
                              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
                            >
                              {(w.active !== undefined ? w.active : w.isActive ?? true) ? (
                                <UserX className="w-4 h-4 text-slate-500 hover:text-rose-400" />
                              ) : (
                                <UserCheck className="w-4 h-4 text-emerald-400" />
                              )}
                            </button>
                            <button
                              onClick={() => handleOpenEdit(w)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                              title="Editar Colaborador"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Adicionar/Editar Colaborador */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                {editingWorker ? 'Editar Colaborador' : 'Novo Colaborador'}
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
                  Vínculo com Cadastro Mestre de RH (<span className="font-mono text-[11px] text-cyan-400">rhEmployeeId</span>)
                </label>
                <select
                  value={formRhEmployeeId}
                  onChange={(e) => handleSelectRhDirectory(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Sem vínculo explícito (cadastro legado/externo)</option>
                  {rhDirectory.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} {entry.codigoObra || entry.registrationNumber ? `(${entry.codigoObra || entry.registrationNumber})` : ''} — {entry.role || 'Sem cargo'}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  O vínculo é sempre explícito por ID do RH — nunca associado automaticamente por nome.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Matrícula Única <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingWorker}
                    placeholder="Ex: COL-1049"
                    value={formRegistration}
                    onChange={(e) => setFormRegistration(e.target.value.toUpperCase())}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 uppercase font-mono disabled:opacity-50"
                  />
                  {editingWorker && (
                    <p className="text-[10px] text-slate-500 mt-1">A matrícula não pode ser alterada.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Telefone / Contato
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: (11) 98765-4321"
                    value={formContactPhone}
                    onChange={(e) => setFormContactPhone(e.target.value)}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome Completo <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nome do colaborador"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Setor
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Montagem, Manutenção, Obras..."
                    value={formSector}
                    onChange={(e) => setFormSector(e.target.value)}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Função / Cargo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Eletricista, Encanador, Pedreiro..."
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  placeholder="Anotações internas sobre o colaborador..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-[#0b101b] border border-slate-700 text-slate-200 text-xs rounded-xl p-3 focus:outline-none focus:border-amber-500"
                />
              </div>

              {editingWorker && (
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs text-slate-200 font-semibold">Colaborador Ativo</span>
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
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Colaborador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
