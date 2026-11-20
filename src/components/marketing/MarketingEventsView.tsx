import React, { useState } from 'react';
import {
  PartyPopper,
  Plus,
  Search,
  Calendar,
  Clock,
  MapPin,
  Users,
  DollarSign,
  Edit,
  Trash2,
  CheckCircle,
  Truck,
  FileText,
  UserCheck,
} from 'lucide-react';
import {
  CorporateEvent,
  EventStatus,
  CorporateEventSupplier,
  CorporateEventParticipant,
  MarketingAudience,
} from '../../types/marketing';

interface MarketingEventsViewProps {
  events: CorporateEvent[];
  onSaveEvent: (event: CorporateEvent) => void;
  onDeleteEvent: (id: string) => void;
  currentOrgId: string;
}

const EVENT_STATUS_LABELS: Record<EventStatus, { label: string; color: string }> = {
  planejamento: { label: 'Planejamento', color: 'bg-amber-950/70 text-amber-300 border-amber-800/40' },
  confirmado: { label: 'Confirmado', color: 'bg-blue-950/70 text-blue-300 border-blue-800/40' },
  em_andamento: { label: 'Em Andamento', color: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40' },
  realizado: { label: 'Realizado', color: 'bg-cyan-950/70 text-cyan-300 border-cyan-800/40' },
  cancelado: { label: 'Cancelado', color: 'bg-rose-950/70 text-rose-300 border-rose-800/40' },
};

export const MarketingEventsView: React.FC<MarketingEventsViewProps> = ({
  events,
  onSaveEvent,
  onDeleteEvent,
  currentOrgId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingEvent, setEditingEvent] = useState<CorporateEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sub-items inside modal
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierCat, setNewSupplierCat] = useState('');
  const [newSupplierCost, setNewSupplierCost] = useState('');

  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantDept, setNewParticipantDept] = useState('');

  const filteredEvents = events.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = e.name.toLowerCase().includes(q);
      const matchesLoc = e.location.toLowerCase().includes(q);
      const matchesResp = e.responsibleName.toLowerCase().includes(q);
      if (!matchesName && !matchesLoc && !matchesResp) return false;
    }
    return true;
  });

  const handleOpenCreate = () => {
    const today = new Date().toISOString().split('T')[0];
    const newEvt: CorporateEvent = {
      id: `evt_${Date.now()}`,
      organizationId: currentOrgId,
      name: '',
      objective: '',
      description: '',
      eventDate: today,
      startTime: '09:00',
      endTime: '12:00',
      location: 'Auditório Principal Aguero Inox',
      audience: 'interno_colaboradores',
      estimatedAttendees: 40,
      responsibleName: 'Comissão de Eventos',
      estimatedBudget: 2500,
      status: 'planejamento',
      participants: [],
      suppliers: [],
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingEvent(newEvt);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (evt: CorporateEvent) => {
    setEditingEvent({ ...evt });
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editingEvent.name.trim()) return;
    onSaveEvent(editingEvent);
    setIsModalOpen(false);
    setEditingEvent(null);
  };

  const handleAddSupplier = () => {
    if (!editingEvent || !newSupplierName.trim()) return;
    const sup: CorporateEventSupplier = {
      id: `sup_${Date.now()}`,
      name: newSupplierName.trim(),
      serviceCategory: newSupplierCat.trim() || 'Serviços Gerais',
      estimatedCost: Number(newSupplierCost) || 0,
      status: 'cotacao',
    };
    setEditingEvent({
      ...editingEvent,
      suppliers: [...editingEvent.suppliers, sup],
    });
    setNewSupplierName('');
    setNewSupplierCat('');
    setNewSupplierCost('');
  };

  const handleDeleteSupplier = (id: string) => {
    if (!editingEvent) return;
    setEditingEvent({
      ...editingEvent,
      suppliers: editingEvent.suppliers.filter((s) => s.id !== id),
    });
  };

  const handleAddParticipant = () => {
    if (!editingEvent || !newParticipantName.trim()) return;
    const part: CorporateEventParticipant = {
      id: `part_${Date.now()}`,
      name: newParticipantName.trim(),
      department: newParticipantDept.trim() || 'Geral',
      confirmed: true,
      confirmedAt: new Date().toISOString(),
    };
    setEditingEvent({
      ...editingEvent,
      participants: [...editingEvent.participants, part],
    });
    setNewParticipantName('');
    setNewParticipantDept('');
  };

  const handleDeleteParticipant = (id: string) => {
    if (!editingEvent) return;
    setEditingEvent({
      ...editingEvent,
      participants: editingEvent.participants.filter((p) => p.id !== id),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            <PartyPopper className="w-5 h-5 text-amber-400" />
            <span>Gestão de Eventos Corporativos</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            SIPAT, Café com Diretoria, Alinhamento de Metas, Festividades e Confraternizações.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition shadow-lg shadow-amber-600/30 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Evento</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar evento, local ou organizador..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer text-xs"
        >
          <option value="all">Todos os Status</option>
          <option value="planejamento">Planejamento</option>
          <option value="confirmado">Confirmado</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="realizado">Realizado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Event Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvents.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500 text-xs">
            Nenhum evento localizado com os filtros selecionados.
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const statusConfig = EVENT_STATUS_LABELS[evt.status] || EVENT_STATUS_LABELS.planejamento;
            const totalSuppliersCost = evt.suppliers.reduce((acc, s) => acc + (s.estimatedCost || 0), 0);

            return (
              <div
                key={evt.id}
                className="p-5 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${statusConfig.color}`}
                    >
                      {statusConfig.label}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>{evt.eventDate}</span>
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight line-clamp-1">
                      {evt.name}
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center space-x-1 mt-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{evt.startTime} às {evt.endTime}</span>
                    </p>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                    {evt.objective || evt.description}
                  </p>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
                    <div className="flex items-center space-x-1.5 text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">{evt.location}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span className="flex items-center space-x-1">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{evt.participants.length} / {evt.estimatedAttendees} confirmados</span>
                      </span>
                      <span className="font-semibold text-emerald-400">
                        R$ {evt.estimatedBudget.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Suppliers summary */}
                  {evt.suppliers.length > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center space-x-1">
                        <Truck className="w-3 h-3 text-amber-400" />
                        <span>{evt.suppliers.length} fornecedores alocados</span>
                      </span>
                      <span>Total: R$ {totalSuppliersCost.toLocaleString('pt-BR')}</span>
                    </div>
                  )}

                  {/* Tasks & Cronograma summary */}
                  {evt.tasks && evt.tasks.length > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center space-x-1 text-cyan-400">
                        <CheckCircle className="w-3 h-3 text-cyan-400" />
                        <span>{evt.tasks.filter((t) => t.completed).length} de {evt.tasks.length} tarefas concluídas</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Cronograma ativo</span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEdit(evt)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      title="Editar evento"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deseja excluir o evento "${evt.name}"?`)) {
                          onDeleteEvent(evt.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                      title="Excluir evento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(evt)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                  >
                    Gerenciar Participantes & Custos
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Event Modal */}
      {isModalOpen && editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <PartyPopper className="w-5 h-5 text-amber-400" />
                <span>{editingEvent.id ? 'Gerenciar Evento Corporativo' : 'Novo Evento'}</span>
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
                    Nome do Evento *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingEvent.name}
                    onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                    placeholder="Ex: SIPAT 2026 — Segurança em Primeiro Lugar"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Data do Evento *</label>
                  <input
                    type="date"
                    required
                    value={editingEvent.eventDate}
                    onChange={(e) => setEditingEvent({ ...editingEvent, eventDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Status</label>
                  <select
                    value={editingEvent.status}
                    onChange={(e) =>
                      setEditingEvent({ ...editingEvent, status: e.target.value as EventStatus })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="planejamento">Planejamento</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="em_andamento">Em Andamento</option>
                    <option value="realizado">Realizado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Horário Início</label>
                  <input
                    type="time"
                    value={editingEvent.startTime}
                    onChange={(e) => setEditingEvent({ ...editingEvent, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Horário Término</label>
                  <input
                    type="time"
                    value={editingEvent.endTime}
                    onChange={(e) => setEditingEvent({ ...editingEvent, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Local / Endereço</label>
                  <input
                    type="text"
                    value={editingEvent.location}
                    onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                    placeholder="Ex: Auditório Principal Aguero Inox & Refeitório"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Estimativa de Participantes
                  </label>
                  <input
                    type="number"
                    value={editingEvent.estimatedAttendees}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        estimatedAttendees: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Orçamento Estimado (R$)
                  </label>
                  <input
                    type="number"
                    value={editingEvent.estimatedBudget}
                    onChange={(e) =>
                      setEditingEvent({
                        ...editingEvent,
                        estimatedBudget: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Objetivo do Evento</label>
                <input
                  type="text"
                  value={editingEvent.objective}
                  onChange={(e) => setEditingEvent({ ...editingEvent, objective: e.target.value })}
                  placeholder="Ex: Integração das equipes de montagem e celebração de zero acidentes"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Suppliers Section */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-300 text-xs block">
                  Fornecedores & Serviços Contratados ({editingEvent.suppliers.length})
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="Nome Fornecedor"
                    className="sm:col-span-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                  />
                  <input
                    type="text"
                    value={newSupplierCat}
                    onChange={(e) => setNewSupplierCat(e.target.value)}
                    placeholder="Serviço (ex: Buffet)"
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                  />
                  <div className="flex space-x-1">
                    <input
                      type="number"
                      value={newSupplierCost}
                      onChange={(e) => setNewSupplierCost(e.target.value)}
                      placeholder="R$"
                      className="w-20 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddSupplier}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pt-1">
                  {editingEvent.suppliers.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">{s.name}</span>
                        <span className="text-slate-400 text-[11px] ml-2">({s.serviceCategory})</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-emerald-400 font-mono">
                          R$ {s.estimatedCost.toLocaleString('pt-BR')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupplier(s.id)}
                          className="text-slate-500 hover:text-rose-400 ml-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Participants Section */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-300 text-xs block">
                  Lista de Participantes / RSVP ({editingEvent.participants.length})
                </span>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newParticipantName}
                    onChange={(e) => setNewParticipantName(e.target.value)}
                    placeholder="Nome do participante..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                  />
                  <input
                    type="text"
                    value={newParticipantDept}
                    onChange={(e) => setNewParticipantDept(e.target.value)}
                    placeholder="Setor / Cargo"
                    className="w-36 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddParticipant}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium cursor-pointer"
                  >
                    + Adicionar
                  </button>
                </div>

                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pt-1">
                  {editingEvent.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-slate-200">{p.name}</span>
                        <span className="text-slate-500 text-[11px]">· {p.department}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteParticipant(p.id)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
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
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition cursor-pointer shadow-lg shadow-amber-600/30"
                >
                  Salvar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
