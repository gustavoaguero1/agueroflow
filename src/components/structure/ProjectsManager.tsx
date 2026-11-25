import React, { useMemo, useState } from 'react';
import {
  FolderKanban,
  Plus,
  Search,
  Edit2,
  X,
  AlertCircle,
  Building,
  FileText,
  Layers,
  Calendar,
} from 'lucide-react';
import type { Contract, CostCenter, Unit } from '../../types';
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from '../../types/project';
import { createProject, updateProject } from '../../services/projectService';

interface ProjectsManagerProps {
  orgId: string;
  userUid: string;
  userName: string;
  projects: Project[];
  units: Unit[];
  contracts: Contract[];
  costCenters: CostCenter[];
  canManage: boolean;
  onAudit?: (action: string, details: string, targetId?: string) => Promise<void>;
}

const STATUS_LABELS: Record<ProjectStatus, { label: string; style: string }> = {
  planejamento: { label: 'Planejamento', style: 'bg-slate-800 text-slate-300 border-slate-700' },
  mobilizacao: { label: 'Mobilização', style: 'bg-indigo-950 text-indigo-300 border-indigo-800' },
  em_execucao: { label: 'Em Execução', style: 'bg-blue-950 text-blue-300 border-blue-800' },
  paralisado: { label: 'Paralisado', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  concluido: { label: 'Concluído', style: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  encerrado: { label: 'Encerrado', style: 'bg-slate-900 text-slate-400 border-slate-700' },
  cancelado: { label: 'Cancelado', style: 'bg-rose-950 text-rose-300 border-rose-800' },
};

export const ProjectsManager: React.FC<ProjectsManagerProps> = ({
  orgId,
  userUid,
  userName,
  projects,
  units,
  contracts,
  costCenters,
  canManage,
  onAudit,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planejamento');
  const [unitId, setUnitId] = useState('');
  const [contractId, setContractId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [clientName, setClientName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const contractMap = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);
  const costCenterMap = useMemo(() => new Map(costCenters.map((cc) => [cc.id, cc])), [costCenters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.clientName || '').toLowerCase().includes(q) ||
        (contractMap.get(p.contractId)?.title || '').toLowerCase().includes(q) ||
        (unitMap.get(p.unitId)?.name || '').toLowerCase().includes(q)
      );
    });
  }, [projects, search, statusFilter, contractMap, unitMap]);

  const openCreate = () => {
    setEditing(null);
    setCode('');
    setName('');
    setDescription('');
    setStatus('planejamento');
    setUnitId('');
    setContractId('');
    setCostCenterId('');
    setClientName('');
    setManagerName('');
    setPlannedStartDate('');
    setPlannedEndDate('');
    setError(null);
    setIsModalOpen(true);
  };

  const openEdit = (proj: Project) => {
    setEditing(proj);
    setCode(proj.code);
    setName(proj.name);
    setDescription(proj.description || '');
    setStatus(proj.status);
    setUnitId(proj.unitId);
    setContractId(proj.contractId);
    setCostCenterId(proj.costCenterId || '');
    setClientName(proj.clientName || '');
    setManagerName(proj.managerName || '');
    setPlannedStartDate(proj.plannedStartDate || '');
    setPlannedEndDate(proj.plannedEndDate || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        await updateProject(editing.id, {
          code,
          name,
          description,
          status,
          unitId,
          contractId,
          costCenterId: costCenterId || null,
          clientName,
          managerName,
          plannedStartDate,
          plannedEndDate,
        });
        await onAudit?.('Atualizar Projeto/Obra', `Projeto ${code} — ${name} atualizado.`, editing.id);
      } else {
        const created = await createProject({
          orgId,
          code,
          name,
          description,
          status,
          unitId,
          contractId,
          costCenterId: costCenterId || undefined,
          clientName: clientName || undefined,
          managerName: managerName || undefined,
          plannedStartDate: plannedStartDate || undefined,
          plannedEndDate: plannedEndDate || undefined,
          createdByUid: userUid,
          createdByName: userName,
        });
        await onAudit?.('Criar Projeto/Obra', `Projeto ${created.code} — ${created.name} criado.`, created.id);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o projeto/obra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-blue-400" />
            <span>Cadastro Mestre de Projetos / Obras</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Entidade central de execução conectada a Contrato, Unidade/Planta e Centro de Custo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código, obra, cliente..."
              className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos os Status</option>
            {PROJECT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st].label}
              </option>
            ))}
          </select>

          {canManage && (
            <button
              onClick={openCreate}
              disabled={units.length === 0 || contracts.length === 0}
              title={
                units.length === 0 || contracts.length === 0
                  ? 'Cadastre ao menos uma Unidade e um Contrato antes de criar um Projeto/Obra.'
                  : 'Novo Projeto/Obra'
              }
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Projeto/Obra</span>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-10 text-center space-y-2">
          <FolderKanban className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">Nenhum projeto/obra encontrado</p>
          <p className="text-xs text-slate-500">
            Cadastre projetos vinculados a contratos e unidades reais para unificar OS, RDO, compras e resultado financeiro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((proj) => {
            const unit = unitMap.get(proj.unitId);
            const contract = contractMap.get(proj.contractId);
            const costCenter = proj.costCenterId ? costCenterMap.get(proj.costCenterId) : undefined;
            const st = STATUS_LABELS[proj.status] || STATUS_LABELS.planejamento;
            return (
              <div
                key={proj.id}
                className="bg-[#121826] border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-blue-400">{proj.code}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.style}`}>
                        {st.label}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mt-1">{proj.name}</h4>
                    {proj.clientName && (
                      <p className="text-xs text-slate-400 mt-0.5">Cliente: {proj.clientName}</p>
                    )}
                  </div>
                  {canManage && (
                    <button
                      onClick={() => openEdit(proj)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                      title="Editar Projeto/Obra"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Building className="w-3 h-3" /> Unidade
                    </span>
                    <span className="text-slate-200 font-medium block truncate mt-0.5">
                      {unit ? `${unit.code} - ${unit.name}` : proj.unitId}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                    <span className="text-slate-500 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Contrato
                    </span>
                    <span className="text-slate-200 font-medium block truncate mt-0.5">
                      {contract ? contract.title : proj.contractId}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Centro de Custo
                    </span>
                    <span className="text-slate-200 font-medium block truncate mt-0.5">
                      {costCenter ? `${costCenter.code} - ${costCenter.name}` : proj.costCenterId || 'Não vinculado'}
                    </span>
                  </div>
                </div>

                {(proj.plannedStartDate || proj.plannedEndDate || proj.managerName) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {proj.plannedStartDate || '—'} até {proj.plannedEndDate || '—'}
                    </span>
                    {proj.managerName && <span>Responsável: {proj.managerName}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {editing ? `Editar Projeto/Obra (${editing.code})` : 'Novo Projeto / Obra'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Código *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ex: OBRA-2026-001"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Nome do Projeto / Obra *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Montagem de Tubulação Inox — Planta Norte"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Unidade / Planta *</label>
                  <select
                    required
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">Selecione...</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} - {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Contrato *</label>
                  <select
                    required
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">Selecione...</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contractNumber || c.code} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Centro de Custo</label>
                  <select
                    value={costCenterId}
                    onChange={(e) => setCostCenterId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">Opcional</option>
                    {costCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} - {cc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    {PROJECT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Cliente</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Razão social do cliente"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Responsável Técnico</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="Nome do engenheiro / gestor"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Início Previsto</label>
                  <input
                    type="date"
                    value={plannedStartDate}
                    onChange={(e) => setPlannedStartDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Término Previsto</label>
                  <input
                    type="date"
                    value={plannedEndDate}
                    onChange={(e) => setPlannedEndDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Escopo / Observações</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Resumo do escopo técnico e premissas da obra"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Criar Projeto/Obra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
