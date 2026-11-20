import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Trash2,
  ArrowRight,
  Layers,
  Building,
} from 'lucide-react';
import {
  PurchaseRequisition,
  PurchaseRequisitionItem,
  RequisitionUrgency,
} from '../../types/purchasing';
import { savePurchaseRequisition } from '../../services/purchasingService';

interface PurchasingRequisitionsProps {
  organizationId: string;
  requisitions: PurchaseRequisition[];
  userName: string;
  onRefresh: () => Promise<void>;
  onCreateQuotationFromRequisition: (req: PurchaseRequisition) => void;
}

export const PurchasingRequisitions: React.FC<PurchasingRequisitionsProps> = ({
  organizationId,
  requisitions,
  userName,
  onRefresh,
  onCreateQuotationFromRequisition,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('todos');
  const [urgencyFilter, setUrgencyFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState<PurchaseRequisition['department']>('Obras & Montagem');
  const [urgency, setUrgency] = useState<RequisitionUrgency>('normal');
  const [costCenter, setCostCenter] = useState('');
  const [neededByDate, setNeededByDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseRequisitionItem[]>([
    {
      id: `it_init_${Date.now()}`,
      code: '',
      description: '',
      specs: '',
      unit: 'UN',
      quantity: 1,
    },
  ]);

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `it_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        code: '',
        description: '',
        specs: '',
        unit: 'UN',
        quantity: 1,
      },
    ]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof PurchaseRequisitionItem, val: any) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: val } : it))
    );
  };

  const handleSaveRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Informe o título da requisição de compra.');
      return;
    }

    const validItems = items.filter((i) => i.description.trim().length > 0);
    if (validItems.length === 0) {
      alert('Adicione pelo menos um item com descrição válida.');
      return;
    }

    setSaving(true);
    try {
      const code = `RC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      const payload: PurchaseRequisition = {
        id: `rc_${Date.now()}`,
        organizationId,
        code,
        title: title.trim(),
        requestedBy: userName,
        requestedByName: userName,
        department,
        costCenter: costCenter.trim() || undefined,
        urgency,
        neededByDate,
        items: validItems.map((v) => ({ ...v, quantity: Number(v.quantity) || 1 })),
        status: 'pendente',
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseRequisition(payload);
      setIsModalOpen(false);
      setTitle('');
      setCostCenter('');
      setNotes('');
      setItems([
        {
          id: `it_init_${Date.now()}`,
          code: '',
          description: '',
          specs: '',
          unit: 'UN',
          quantity: 1,
        },
      ]);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Filtered List
  const filtered = requisitions.filter((r) => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm ||
      r.code.toLowerCase().includes(term) ||
      r.title.toLowerCase().includes(term) ||
      r.items.some((i) => i.description.toLowerCase().includes(term));

    const matchDept = departmentFilter === 'todos' || r.department === departmentFilter;
    const matchUrg = urgencyFilter === 'todos' || r.urgency === urgencyFilter;
    const matchStat = statusFilter === 'todos' || r.status === statusFilter;

    return matchSearch && matchDept && matchUrg && matchStat;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Requisições de Compra (RC)</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {requisitions.length} cadastradas
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Demandas geradas pelas equipes de Obra, Caldeiraria, Fábrica ou Estoque aguardando cotação comercial.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-lg transition shadow-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Requisição</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs shadow-xl">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, material ou título..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
          >
            <option value="todos">Todos Departamentos</option>
            <option value="Obras & Montagem">Obras & Montagem</option>
            <option value="Caldeiraria & Fábrica">Caldeiraria & Fábrica</option>
            <option value="Estoque & Manutenção">Estoque & Manutenção</option>
            <option value="Comercial & Propostas">Comercial & Propostas</option>
          </select>

          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
          >
            <option value="todos">Todas Urgências</option>
            <option value="urgente_parada_obra">Parada de Obra</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baixa">Baixa</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
          >
            <option value="todos">Todos Status</option>
            <option value="pendente">Pendente</option>
            <option value="em_cotacao">Em Cotação</option>
            <option value="cotada">Cotada</option>
            <option value="pedido_gerado">Pedido Gerado</option>
          </select>
        </div>
      </div>

      {/* Requisitions Grid / Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            Nenhuma requisição de compra encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Título / Finalidade</th>
                  <th className="py-2.5 px-3">Departamento</th>
                  <th className="py-2.5 px-3">Urgência</th>
                  <th className="py-2.5 px-3">Prazo Necessário</th>
                  <th className="py-2.5 px-3 text-center">Itens</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações do Comprador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40">
                    <td className="py-3 px-3 font-bold text-cyan-300">{r.code}</td>
                    <td className="py-3 px-3 font-sans text-slate-200">
                      <strong className="block text-white text-xs">{r.title}</strong>
                      <span className="text-[10px] text-slate-400">Solicitante: {r.requestedByName}</span>
                    </td>
                    <td className="py-3 px-3 font-sans text-slate-300 text-[11px]">{r.department}</td>
                    <td className="py-3 px-3 font-sans">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          r.urgency === 'urgente_parada_obra'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : r.urgency === 'alta'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {r.urgency === 'urgente_parada_obra' ? 'Parada de Obra' : r.urgency.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px] font-sans">
                      {new Date(r.neededByDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-white">{r.items.length}</td>
                    <td className="py-3 px-3 text-center font-sans">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          r.status === 'pedido_gerado'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            : r.status === 'em_cotacao'
                            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {r.status === 'pedido_gerado'
                          ? 'Pedido Emitido'
                          : r.status === 'em_cotacao'
                          ? 'Em Cotação'
                          : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-sans">
                      {r.status !== 'pedido_gerado' ? (
                        <button
                          onClick={() => onCreateQuotationFromRequisition(r)}
                          className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded border border-cyan-500/30 text-[11px] font-medium transition cursor-pointer"
                        >
                          Iniciar Cotação (RFQ)
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Concluída</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nova Requisição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0B132B] border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Nova Requisição de Compra (RC)</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRequisition} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 mb-1 font-medium">Título da Demanda *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Aquisição de tubulações inox para linha sanitária"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Departamento Solicitante *</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Obras & Montagem">Obras & Montagem</option>
                    <option value="Caldeiraria & Fábrica">Caldeiraria & Fábrica</option>
                    <option value="Estoque & Manutenção">Estoque & Manutenção</option>
                    <option value="Comercial & Propostas">Comercial & Propostas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Grau de Urgência *</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="normal">Normal (Planejada)</option>
                    <option value="alta">Alta (Cronograma Crítico)</option>
                    <option value="urgente_parada_obra">Urgente (Parada de Obra / Fábrica)</option>
                    <option value="baixa">Baixa (Reposição Futura)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Centro de Custo / Obra</label>
                  <input
                    type="text"
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    placeholder="Ex: CC-OBRA-01 ou MATRIZ"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Data Necessária no Local *</label>
                  <input
                    type="date"
                    required
                    value={neededByDate}
                    onChange={(e) => setNeededByDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Dynamic Items Table */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Itens da Requisição ({items.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-xs font-medium border border-cyan-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Linha</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {items.map((it, idx) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-12 gap-2 bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg items-center"
                    >
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={it.code || ''}
                          onChange={(e) => handleUpdateItem(it.id, 'code', e.target.value)}
                          placeholder="Código (opcional)"
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="col-span-5">
                        <input
                          type="text"
                          required
                          value={it.description}
                          onChange={(e) => handleUpdateItem(it.id, 'description', e.target.value)}
                          placeholder="Descrição do material *"
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={it.unit}
                          onChange={(e) => handleUpdateItem(it.id, 'unit', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                        >
                          <option value="UN">UN</option>
                          <option value="M">M</option>
                          <option value="KG">KG</option>
                          <option value="PC">PÇ</option>
                          <option value="BARRA">BARRA</option>
                          <option value="CJ">CJ</option>
                        </select>
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => handleUpdateItem(it.id, 'quantity', Number(e.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white text-center font-mono"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(it.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Observações para o Comprador</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instruções de entrega, normas requeridas ou fornecedor de preferência..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition disabled:opacity-50"
                >
                  {saving ? 'Registrando...' : 'Criar Requisição'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
