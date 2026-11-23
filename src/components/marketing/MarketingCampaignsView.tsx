import React, { useState } from 'react';
import {
  Megaphone,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Calendar,
  Layers,
  Sparkles,
  Edit,
  Trash2,
  CheckSquare,
  AlertCircle,
  Share2,
} from 'lucide-react';
import {
  MarketingCampaign,
  CampaignStatus,
  MarketingAudience,
  MarketingChannel,
  CampaignTask,
} from '../../types/marketing';
import { MarketingService } from '../../services/marketingService';
import { apiFetch } from '../../apiAuthFetch';

interface MarketingCampaignsViewProps {
  campaigns: MarketingCampaign[];
  onSaveCampaign: (campaign: MarketingCampaign) => void;
  onDeleteCampaign: (id: string) => void;
  currentOrgId: string;
}

const STATUS_LABELS: Record<CampaignStatus, { label: string; color: string }> = {
  ideia: { label: 'Ideia', color: 'bg-slate-800 text-slate-300 border-slate-700' },
  planejamento: { label: 'Planejamento', color: 'bg-amber-950/70 text-amber-300 border-amber-800/40' },
  aguardando_aprovacao: { label: 'Em Aprovação', color: 'bg-purple-950/70 text-purple-300 border-purple-800/40' },
  aprovada: { label: 'Aprovada', color: 'bg-blue-950/70 text-blue-300 border-blue-800/40' },
  em_andamento: { label: 'Em Andamento', color: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40' },
  concluida: { label: 'Concluída', color: 'bg-cyan-950/70 text-cyan-300 border-cyan-800/40' },
  cancelada: { label: 'Cancelada', color: 'bg-rose-950/70 text-rose-300 border-rose-800/40' },
};

export const MarketingCampaignsView: React.FC<MarketingCampaignsViewProps> = ({
  campaigns,
  onSaveCampaign,
  onDeleteCampaign,
  currentOrgId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // New task input state inside modal
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (scopeFilter !== 'all' && c.scope !== scopeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = c.name.toLowerCase().includes(q);
      const matchesTheme = c.theme.toLowerCase().includes(q);
      const matchesResp = c.responsibleName.toLowerCase().includes(q);
      if (!matchesName && !matchesTheme && !matchesResp) return false;
    }
    return true;
  });

  const handleOpenCreateModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const newRecord: MarketingCampaign = {
      id: `camp_${Date.now()}`,
      organizationId: currentOrgId,
      name: '',
      theme: '',
      objective: '',
      description: '',
      audience: 'interno_colaboradores',
      scope: 'interno',
      startDate: today,
      endDate: today,
      department: 'Marketing & Comunicação',
      responsibleName: 'Coordenador de Comunicação',
      estimatedBudget: 1500,
      actualBudgetSpent: 0,
      channels: ['whatsapp', 'tv_interna', 'mural_fisico'],
      status: 'planejamento',
      tasks: [
        { id: 'tk_1', title: 'Definir mensagens-chave e aprovar briefing', dueDate: today, completed: false },
        { id: 'tk_2', title: 'Produzir artes no Estúdio Criativo', dueDate: today, completed: false },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingCampaign(newRecord);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: MarketingCampaign) => {
    setEditingCampaign({ ...c });
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign || !editingCampaign.name.trim()) return;
    onSaveCampaign(editingCampaign);
    setIsModalOpen(false);
    setEditingCampaign(null);
  };

  const handleGenerateAiIdeas = async () => {
    if (!editingCampaign || !editingCampaign.theme) {
      alert('Por favor, informe ao menos o Tema da campanha para a IA gerar as ideias.');
      return;
    }

    setIsGeneratingAi(true);
    try {
      const res = await apiFetch('/api/marketing/generate-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: editingCampaign.theme,
          audience: editingCampaign.audience,
          objective: editingCampaign.objective,
          format: 'campanha',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEditingCampaign((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            name: prev.name || data.headline || `${prev.theme} 2026`,
            objective: prev.objective || data.headline,
            description: prev.description
              ? `${prev.description}\n\n[Sugestão IA]: ${data.bodyText}`
              : data.bodyText,
          };
        });
      }
    } catch (err) {
      console.error('Falha ao gerar ideias de campanha via IA:', err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !editingCampaign) return;
    const task: CampaignTask = {
      id: `tk_${Date.now()}`,
      title: newTaskTitle.trim(),
      dueDate: editingCampaign.endDate || editingCampaign.startDate,
      completed: false,
    };
    setEditingCampaign({
      ...editingCampaign,
      tasks: [...editingCampaign.tasks, task],
    });
    setNewTaskTitle('');
  };

  const handleToggleTask = (taskId: string) => {
    if (!editingCampaign) return;
    const updatedTasks = editingCampaign.tasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    setEditingCampaign({ ...editingCampaign, tasks: updatedTasks });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!editingCampaign) return;
    setEditingCampaign({
      ...editingCampaign,
      tasks: editingCampaign.tasks.filter((t) => t.id !== taskId),
    });
  };

  const handleToggleChannel = (channel: MarketingChannel) => {
    if (!editingCampaign) return;
    const current = editingCampaign.channels || [];
    const exists = current.includes(channel);
    const updated = exists ? current.filter((c) => c !== channel) : [...current, channel];
    setEditingCampaign({ ...editingCampaign, channels: updated });
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <Megaphone className="w-5 h-5 text-blue-400" />
            <span>Gestão de Campanhas Corporativas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Comunicação interna (SST, RH e Clima) e externa (Serviços industriais, LinkedIn, Obras).
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shadow-lg shadow-blue-600/30 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Campanha</span>
        </button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, tema ou responsável..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer text-xs"
          >
            <option value="all">Todos os Status</option>
            <option value="planejamento">Planejamento</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluida">Concluída</option>
            <option value="aguardando_aprovacao">Em Aprovação</option>
            <option value="cancelada">Cancelada</option>
          </select>

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer text-xs"
          >
            <option value="all">Todos os Escopos</option>
            <option value="interno">Interno (Colaboradores)</option>
            <option value="externo">Externo (Clientes/Mercado)</option>
            <option value="misto">Misto</option>
          </select>
        </div>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCampaigns.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500 text-xs">
            Nenhuma campanha localizada com os filtros selecionados.
          </div>
        ) : (
          filteredCampaigns.map((camp) => {
            const completedTasks = camp.tasks.filter((t) => t.completed).length;
            const statusConfig = STATUS_LABELS[camp.status] || STATUS_LABELS.planejamento;

            return (
              <div
                key={camp.id}
                className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${statusConfig.color}`}
                    >
                      {statusConfig.label}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {camp.startDate} · {camp.endDate}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight line-clamp-1">
                      {camp.name}
                    </h3>
                    <p className="text-xs text-blue-400 font-medium line-clamp-1 mt-0.5">{camp.theme}</p>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                    {camp.objective || camp.description}
                  </p>

                  {/* Badges metadata */}
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">
                      Escopo: {camp.scope}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Resp: {camp.responsibleName}
                    </span>
                  </div>

                  {/* Tasks progress */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Tarefas Concluídas</span>
                      <span className="font-semibold text-slate-200">
                        {completedTasks}/{camp.tasks.length}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{
                          width: `${camp.tasks.length > 0 ? (completedTasks / camp.tasks.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Budget & Channels */}
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Orçamento</span>
                      <span className="font-semibold text-emerald-400">
                        R$ {camp.estimatedBudget.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block uppercase">Canais</span>
                      <span className="text-slate-300 text-[11px]">
                        {camp.channels.slice(0, 3).map((c) => `#${c}`).join(' ')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEdit(camp)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      title="Editar campanha"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deseja excluir a campanha "${camp.name}"?`)) {
                          onDeleteCampaign(camp.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                      title="Excluir campanha"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(camp)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                  >
                    Gerenciar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Campaign Modal */}
      {isModalOpen && editingCampaign && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Megaphone className="w-5 h-5 text-blue-400" />
                <span>{editingCampaign.id ? 'Editar Campanha' : 'Nova Campanha'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nome da Campanha *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingCampaign.name}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                    placeholder="Ex: Abril Verde 2026: Segurança em Solda e Altura"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">Tema Central *</label>
                    <button
                      type="button"
                      disabled={isGeneratingAi}
                      onClick={handleGenerateAiIdeas}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isGeneratingAi ? 'Gerando com IA...' : 'Assistente IA'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={editingCampaign.theme}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, theme: e.target.value })}
                    placeholder="Ex: Prevenção de Acidentes e Uso de EPIs"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Status</label>
                  <select
                    value={editingCampaign.status}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, status: e.target.value as CampaignStatus })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="ideia">Ideia</option>
                    <option value="planejamento">Planejamento</option>
                    <option value="aguardando_aprovacao">Em Aprovação</option>
                    <option value="aprovada">Aprovada</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="concluida">Concluída</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Escopo</label>
                  <select
                    value={editingCampaign.scope}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, scope: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="interno">Interno (Colaboradores)</option>
                    <option value="externo">Externo (Clientes e Parceiros)</option>
                    <option value="misto">Misto (Interno e Externo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Público-Alvo</label>
                  <select
                    value={editingCampaign.audience}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, audience: e.target.value as MarketingAudience })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="interno_colaboradores">Colaboradores da Fábrica e Campo</option>
                    <option value="interno_lideranca">Liderança e Gerência</option>
                    <option value="externo_clientes">Clientes Industriais e Compradores</option>
                    <option value="externo_parceiros">Parceiros e Fornecedores</option>
                    <option value="misto_geral">Geral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Data Início</label>
                  <input
                    type="date"
                    value={editingCampaign.startDate}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Data Término</label>
                  <input
                    type="date"
                    value={editingCampaign.endDate}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, endDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Responsável</label>
                  <input
                    type="text"
                    value={editingCampaign.responsibleName}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, responsibleName: e.target.value })
                    }
                    placeholder="Nome do responsável"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Orçamento Estimado (R$)
                  </label>
                  <input
                    type="number"
                    value={editingCampaign.estimatedBudget}
                    onChange={(e) =>
                      setEditingCampaign({
                        ...editingCampaign,
                        estimatedBudget: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Objetivo da Campanha</label>
                <input
                  type="text"
                  value={editingCampaign.objective}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, objective: e.target.value })}
                  placeholder="Ex: Reforçar o compromisso com zero acidentes em campo nas montagens industriais"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Descrição / Planejamento
                </label>
                <textarea
                  rows={3}
                  value={editingCampaign.description}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                  placeholder="Detalhes operacionais da campanha, cronograma e instruções."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Channels checkboxes */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Canais de Divulgação</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      'whatsapp',
                      'tv_interna',
                      'mural_fisico',
                      'linkedin',
                      'instagram',
                      'email',
                      'site',
                    ] as MarketingChannel[]
                  ).map((ch) => {
                    const active = (editingCampaign.channels || []).includes(ch);
                    return (
                      <button
                        type="button"
                        key={ch}
                        onClick={() => handleToggleChannel(ch)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        #{ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tasks Checklist Section */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-300 text-xs block">
                  Plano de Ação / Tarefas da Campanha ({editingCampaign.tasks.length})
                </span>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Adicionar tarefa operacional..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTask();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
                  >
                    + Adicionar
                  </button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pt-1">
                  {editingCampaign.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                    >
                      <label className="flex items-center space-x-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={t.completed}
                          onChange={() => handleToggleTask(t.id)}
                          className="rounded border-slate-700 text-blue-600 focus:ring-0"
                        />
                        <span
                          className={`${
                            t.completed ? 'line-through text-slate-500' : 'text-slate-200'
                          }`}
                        >
                          {t.title}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id)}
                        className="text-slate-500 hover:text-rose-400 text-xs ml-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer shadow-lg shadow-blue-600/30"
                >
                  Salvar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
