import React, { useState } from 'react';
import { doc, collection, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  WorkOrder,
  PlannedService,
  PlannedLabor,
  PlannedPart,
  Item,
} from '../../types';
import {
  Wrench,
  Users,
  Boxes,
  Plus,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  Trash2,
  Edit2,
  Check,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import { getPlanningSummary } from './workOrderHelpers';

interface OrderPlanningTabProps {
  order: WorkOrder;
  organizationId: string;
  currentUser: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
  };
  canViewFinancials?: boolean;
  availableItems?: Item[];
  logAudit?: (module: string, action: string, details: string, refId?: string) => Promise<void>;
  onOrderUpdated?: (updated: Partial<WorkOrder>) => void;
}

export const OrderPlanningTab: React.FC<OrderPlanningTabProps> = ({
  order,
  organizationId,
  currentUser,
  canViewFinancials = true,
  availableItems = [],
  logAudit,
  onOrderUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'servicos' | 'mao_obra' | 'pecas'>('servicos');
  const [isSaving, setIsSaving] = useState(false);

  // Form modals state
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [serviceDesc, setServiceDesc] = useState('');
  const [serviceCategory, setServiceCategory] = useState<PlannedService['category']>('mecanica');
  const [serviceHours, setServiceHours] = useState('2');
  const [serviceWorker, setServiceWorker] = useState('');

  const [showAddLaborModal, setShowAddLaborModal] = useState(false);
  const [laborName, setLaborName] = useState('');
  const [laborRole, setLaborRole] = useState('Mecânico Industrial');
  const [laborHours, setLaborHours] = useState('4');
  const [laborRate, setLaborRate] = useState('85');

  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [partSku, setPartSku] = useState('');
  const [partName, setPartName] = useState('');
  const [partQtyPlanned, setPartQtyPlanned] = useState('1');
  const [partUnit, setPartUnit] = useState('UN');
  const [partUnitPrice, setPartUnitPrice] = useState('0');
  const [partStatus, setPartStatus] = useState<PlannedPart['status']>('disponivel');

  const services: PlannedService[] = order.plannedServices || [];
  const labor: PlannedLabor[] = order.plannedLabor || [];
  const parts: PlannedPart[] = order.plannedParts || [];

  const summary = getPlanningSummary(order);

  // Sync updates to Firestore
  const saveOrderPlanning = async (
    newServices?: PlannedService[],
    newLabor?: PlannedLabor[],
    newParts?: PlannedPart[],
    eventDescription?: string
  ) => {
    setIsSaving(true);
    try {
      const updatedServices = newServices !== undefined ? newServices : services;
      const updatedLabor = newLabor !== undefined ? newLabor : labor;
      const updatedParts = newParts !== undefined ? newParts : parts;

      // Recalculate totals
      const totalHours = updatedLabor.reduce((acc, l) => acc + (l.estimatedHours || 0), 0) ||
        updatedServices.reduce((acc, s) => acc + (s.estimatedHours || 0), 0);
      const laborCost = updatedLabor.reduce((acc, l) => acc + (l.totalCost || (l.estimatedHours * l.hourlyRate)), 0);
      const partsCost = updatedParts.reduce((acc, p) => acc + (p.totalCost || (p.quantityPlanned * p.unitPrice)), 0);
      const totalEstimatedCost = laborCost + partsCost;

      const updates: Partial<WorkOrder> = {
        plannedServices: updatedServices,
        plannedLabor: updatedLabor,
        plannedParts: updatedParts,
        estimatedHours: totalHours > 0 ? totalHours : order.estimatedHours,
        estimatedCost: totalEstimatedCost > 0 ? totalEstimatedCost : order.estimatedCost,
        updatedAt: new Date().toISOString(),
      };

      const orderRef = doc(db, 'work_orders', order.id);
      const eventRef = eventDescription ? doc(collection(db, 'order_events')) : null;
      await runTransaction(db, async (tx) => {
        const currentSnap = await tx.get(orderRef);
        if (!currentSnap.exists() || currentSnap.data().orgId !== organizationId) {
          throw new Error('A ordem de serviço não pertence à empresa selecionada ou não está mais disponível.');
        }
        if (currentSnap.data().updatedAt !== order.updatedAt) {
          throw new Error('A OS foi alterada por outra pessoa. Atualize os dados antes de salvar o planejamento.');
        }

        tx.update(orderRef, updates);
        if (eventRef && eventDescription) {
          tx.set(eventRef, {
            orgId: organizationId,
            orderId: order.id,
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email || 'Planejador',
            eventType: 'planejamento',
            description: eventDescription,
            timestamp: updates.updatedAt,
          });
        }
      });

      if (onOrderUpdated) {
        onOrderUpdated(updates);
      }

      if (logAudit && eventDescription) {
        await logAudit('Ordens de Serviço', 'Atualizar Planejamento', eventDescription, order.id);
      }
    } catch (err) {
      console.error('Erro ao atualizar planejamento da OS:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível salvar o planejamento da OS.');
    } finally {
      setIsSaving(false);
    }
  };

  // Service Actions
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceDesc.trim()) return;

    const newService: PlannedService = {
      id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      description: serviceDesc.trim(),
      category: serviceCategory,
      estimatedHours: parseFloat(serviceHours) || 1,
      actualHours: 0,
      status: 'planejado',
      assignedWorker: serviceWorker.trim() || undefined,
    };

    const nextList = [...services, newService];
    await saveOrderPlanning(
      nextList,
      undefined,
      undefined,
      `[Planejamento] Adicionado serviço: "${newService.description}" (${newService.estimatedHours}h)`
    );

    setServiceDesc('');
    setServiceWorker('');
    setShowAddServiceModal(false);
  };

  const handleToggleServiceStatus = async (srvId: string) => {
    const nextList = services.map((s) => {
      if (s.id !== srvId) return s;
      const nextStatus =
        s.status === 'planejado'
          ? ('em_andamento' as const)
          : s.status === 'em_andamento'
          ? ('concluido' as const)
          : ('planejado' as const);

      return {
        ...s,
        status: nextStatus,
        completedAt: nextStatus === 'concluido' ? new Date().toISOString() : undefined,
        completedBy: nextStatus === 'concluido' ? (currentUser.displayName || currentUser.email || 'Operador') : undefined,
        actualHours: nextStatus === 'concluido' && (!s.actualHours || s.actualHours === 0) ? s.estimatedHours : s.actualHours,
      };
    });

    const changedSrv = nextList.find((s) => s.id === srvId);
    await saveOrderPlanning(
      nextList,
      undefined,
      undefined,
      `[Planejamento] Serviço "${changedSrv?.description}" alterado para status "${changedSrv?.status}".`
    );
  };

  const handleDeleteService = async (srvId: string) => {
    const target = services.find((s) => s.id === srvId);
    const nextList = services.filter((s) => s.id !== srvId);
    await saveOrderPlanning(
      nextList,
      undefined,
      undefined,
      `[Planejamento] Serviço removido: "${target?.description}".`
    );
  };

  // Labor Actions
  const handleAddLabor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!laborName.trim()) return;

    const hrs = parseFloat(laborHours) || 1;
    const rate = parseFloat(laborRate) || 0;
    const newLabor: PlannedLabor = {
      id: `lab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workerName: laborName.trim(),
      role: laborRole.trim(),
      estimatedHours: hrs,
      actualHours: hrs,
      hourlyRate: rate,
      totalCost: hrs * rate,
      status: 'alocado',
    };

    const nextList = [...labor, newLabor];
    await saveOrderPlanning(
      undefined,
      nextList,
      undefined,
      `[Planejamento] Alocação de mão de obra: ${newLabor.workerName} (${newLabor.role}) - ${hrs}h`
    );

    setLaborName('');
    setShowAddLaborModal(false);
  };

  const handleDeleteLabor = async (labId: string) => {
    const target = labor.find((l) => l.id === labId);
    const nextList = labor.filter((l) => l.id !== labId);
    await saveOrderPlanning(
      undefined,
      nextList,
      undefined,
      `[Planejamento] Mão de obra desvinculada: ${target?.workerName}.`
    );
  };

  // Parts Actions
  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) return;

    const qty = parseFloat(partQtyPlanned) || 1;
    const unitPrice = parseFloat(partUnitPrice) || 0;
    const newPart: PlannedPart = {
      id: `prt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sku: partSku.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: partName.trim(),
      quantityPlanned: qty,
      quantityUsed: partStatus === 'aplicado' ? qty : 0,
      unit: partUnit,
      unitPrice,
      totalCost: qty * unitPrice,
      status: partStatus,
    };

    const nextList = [...parts, newPart];
    await saveOrderPlanning(
      undefined,
      undefined,
      nextList,
      `[Planejamento] Peça/Material adicionado: ${newPart.name} (${qty} ${newPart.unit})`
    );

    setPartSku('');
    setPartName('');
    setPartUnitPrice('0');
    setShowAddPartModal(false);
  };

  const handleTogglePartApplied = async (partId: string) => {
    const nextList = parts.map((p) => {
      if (p.id !== partId) return p;
      const isApplied = p.status === 'aplicado';
      const nextStatus: PlannedPart['status'] = isApplied ? 'disponivel' : 'aplicado';
      return {
        ...p,
        status: nextStatus,
        quantityUsed: nextStatus === 'aplicado' ? p.quantityPlanned : 0,
      };
    });

    const changed = nextList.find((p) => p.id === partId);
    await saveOrderPlanning(
      undefined,
      undefined,
      nextList,
      `[Planejamento] Status do insumo "${changed?.name}" alterado para ${changed?.status}.`
    );
  };

  const handleDeletePart = async (partId: string) => {
    const target = parts.find((p) => p.id === partId);
    const nextList = parts.filter((p) => p.id !== partId);
    await saveOrderPlanning(
      undefined,
      undefined,
      nextList,
      `[Planejamento] Material removido do plano: ${target?.name}.`
    );
  };

  return (
    <div className="space-y-4">
      {/* Consolidated Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Services Metric */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Serviços / Tarefas</span>
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-lg font-bold text-white">
              {summary.servicesDone} / {summary.servicesCount}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">concluídos</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${summary.servicesPercent}%` }}
            />
          </div>
        </div>

        {/* Labor Metric */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Mão de Obra</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-lg font-bold text-white">{summary.laborCount} téc.</span>
            <span className="text-[10px] text-slate-400">({summary.laborPlannedHours}h est.)</span>
          </div>
          <span className="text-[10px] text-emerald-400 block mt-1">
            {canViewFinancials ? `R$ ${summary.laborCost.toFixed(2)}` : 'Horas alocadas'}
          </span>
        </div>

        {/* Parts Metric */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Peças & Insumos</span>
            <Boxes className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-lg font-bold text-white">
              {summary.partsApplied} / {summary.partsCount}
            </span>
            <span className="text-[10px] text-slate-400">aplicadas</span>
          </div>
          <span className="text-[10px] text-amber-400 block mt-1">
            {canViewFinancials ? `R$ ${summary.partsCost.toFixed(2)}` : 'Insumos alocados'}
          </span>
        </div>

        {/* Overall Planning Total Cost */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Custo Total Planejado</span>
            <DollarSign className="w-4 h-4 text-purple-400" />
          </div>
          {canViewFinancials ? (
            <span className="text-lg font-bold text-purple-300">
              R$ {summary.totalPlannedCost.toFixed(2)}
            </span>
          ) : (
            <span className="text-slate-500 italic text-xs">Visível para Gestão</span>
          )}
          <span className="text-[10px] text-slate-400 block mt-1">
            Avanço físico total: <strong className="text-white">{summary.overallProgressPercent}%</strong>
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('servicos')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeSubTab === 'servicos'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Serviços ({services.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('mao_obra')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeSubTab === 'mao_obra'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Mão de Obra ({labor.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('pecas')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeSubTab === 'pecas'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Peças & Insumos ({parts.length})</span>
          </button>
        </div>

        {/* Add Button for active subtab */}
        {activeSubTab === 'servicos' && (
          <button
            type="button"
            onClick={() => setShowAddServiceModal(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Serviço</span>
          </button>
        )}
        {activeSubTab === 'mao_obra' && (
          <button
            type="button"
            onClick={() => setShowAddLaborModal(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Alocar Mão de Obra</span>
          </button>
        )}
        {activeSubTab === 'pecas' && (
          <button
            type="button"
            onClick={() => setShowAddPartModal(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Requisitar Peça</span>
          </button>
        )}
      </div>

      {/* Subtab Content: Serviços */}
      {activeSubTab === 'servicos' && (
        <div className="space-y-2">
          {services.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-slate-400">
              <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300">Nenhum serviço planejado ainda.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Estruture as etapas da manutenção (ex: Desmontagem, Calibração, Montagem, Teste).
              </p>
              <button
                type="button"
                onClick={() => setShowAddServiceModal(true)}
                className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 font-semibold text-xs inline-flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Planejar Primeiro Serviço</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {services.map((srv, idx) => {
                const isDone = srv.status === 'concluido';
                const isWorking = srv.status === 'em_andamento';

                return (
                  <div
                    key={srv.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                      isDone
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                        : isWorking
                        ? 'bg-blue-950/25 border-blue-800/40 text-slate-200'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300'
                    }`}
                  >
                    {/* Status Checkbox / Action */}
                    <button
                      type="button"
                      onClick={() => handleToggleServiceStatus(srv.id)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : isWorking
                          ? 'bg-blue-600/30 border-blue-500 text-blue-400'
                          : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                      }`}
                      title="Clique para alternar: Planejado → Em Andamento → Concluído"
                    >
                      {isDone ? <Check className="w-3.5 h-3.5" /> : <span className="font-mono text-[10px]">{idx + 1}</span>}
                    </button>

                    {/* Service Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${isDone ? 'line-through text-slate-400' : 'text-white'}`}>
                          {srv.description}
                        </span>
                        {srv.category && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            {srv.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-[10px] text-slate-400 mt-1">
                        <span>
                          Horas: <strong>{srv.estimatedHours}h previstas</strong>
                          {srv.actualHours ? ` / ${srv.actualHours}h reais` : ''}
                        </span>
                        {srv.assignedWorker && (
                          <span>
                            Executor: <strong className="text-slate-300">{srv.assignedWorker}</strong>
                          </span>
                        )}
                        {srv.completedAt && (
                          <span className="text-emerald-400">
                            Concluído em: {new Date(srv.completedAt).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Badge & Delete */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleServiceStatus(srv.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                          isDone
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : isWorking
                            ? 'bg-blue-950 text-blue-300 border border-blue-800 animate-pulse'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {isDone ? 'Concluído' : isWorking ? 'Em Andamento' : 'Planejado'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteService(srv.id)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Remover serviço"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subtab Content: Mão de Obra */}
      {activeSubTab === 'mao_obra' && (
        <div className="space-y-2">
          {labor.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-slate-400">
              <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300">Nenhum profissional ou técnico alocado.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Aloque mecânicos, soldadores, eletricistas ou prestadores para calcular custos e horas.
              </p>
              <button
                type="button"
                onClick={() => setShowAddLaborModal(true)}
                className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs inline-flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Alocar Profissional</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {labor.map((lab) => (
                <div
                  key={lab.id}
                  className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center font-bold text-xs">
                      {lab.workerName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">{lab.workerName}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-300">
                          {lab.role}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {lab.estimatedHours}h estimadas
                        {canViewFinancials ? ` • R$ ${lab.hourlyRate.toFixed(2)}/h` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    {canViewFinancials && (
                      <span className="font-mono font-bold text-emerald-400 text-xs">
                        R$ {lab.totalCost.toFixed(2)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteLabor(lab.id)}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subtab Content: Peças & Insumos */}
      {activeSubTab === 'pecas' && (
        <div className="space-y-2">
          {parts.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-slate-400">
              <Boxes className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-300">Nenhuma peça ou material vinculado.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Adicione sobressalentes, rolamentos, vedações e lubrificantes necessários.
              </p>
              <button
                type="button"
                onClick={() => setShowAddPartModal(true)}
                className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs inline-flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Requisitar Material</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {parts.map((prt) => {
                const isApplied = prt.status === 'aplicado';

                return (
                  <div
                    key={prt.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                      isApplied
                        ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => handleTogglePartApplied(prt.id)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                          isApplied
                            ? 'bg-amber-600 border-amber-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                        }`}
                        title="Marcar como aplicada no equipamento"
                      >
                        {isApplied ? <Check className="w-3.5 h-3.5" /> : <PackageCheck className="w-3.5 h-3.5" />}
                      </button>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] text-blue-400 font-bold">{prt.sku}</span>
                          <span className="font-bold text-white">{prt.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Qtd: <strong>{prt.quantityPlanned} {prt.unit}</strong>
                          {isApplied ? ' (100% aplicada)' : ' (planejada)'}
                          {canViewFinancials ? ` • R$ ${prt.unitPrice.toFixed(2)}/un` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      {canViewFinancials && (
                        <span className="font-mono font-bold text-amber-400 text-xs">
                          R$ {prt.totalCost.toFixed(2)}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleTogglePartApplied(prt.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                          isApplied
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {isApplied ? 'Aplicada' : 'Aguardando Aplicação'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePart(prt.id)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Adicionar Serviço */}
      {showAddServiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
              <Wrench className="w-4 h-4 text-blue-400" />
              <span>Planejar Novo Serviço Operacional</span>
            </h3>

            <form onSubmit={handleAddService} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Descrição do Serviço *</label>
                <input
                  type="text"
                  required
                  value={serviceDesc}
                  onChange={(e) => setServiceDesc(e.target.value)}
                  placeholder="Ex: Alinhamento a laser de eixos e checagem de folgas..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Disciplina / Categoria</label>
                  <select
                    value={serviceCategory}
                    onChange={(e) => setServiceCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="mecanica">Mecânica</option>
                    <option value="eletrica">Elétrica</option>
                    <option value="caldeiraria">Caldeiraria & Solda</option>
                    <option value="instrumentacao">Instrumentação</option>
                    <option value="lubrificacao">Lubrificação</option>
                    <option value="civil">Civil</option>
                    <option value="geral">Geral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={serviceHours}
                    onChange={(e) => setServiceHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Técnico / Responsável Designado</label>
                <input
                  type="text"
                  value={serviceWorker}
                  onChange={(e) => setServiceWorker(e.target.value)}
                  placeholder="Ex: Carlos Mecânico (ou deixe em aberto)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddServiceModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                >
                  Adicionar ao Plano
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Mão de Obra */}
      {showAddLaborModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Alocar Profissional / Mão de Obra</span>
            </h3>

            <form onSubmit={handleAddLabor} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Nome do Profissional *</label>
                <input
                  type="text"
                  required
                  value={laborName}
                  onChange={(e) => setLaborName(e.target.value)}
                  placeholder="Ex: Roberto Alves"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Especialidade / Cargo</label>
                <input
                  type="text"
                  value={laborRole}
                  onChange={(e) => setLaborRole(e.target.value)}
                  placeholder="Ex: Mecânico Industrial Especialista, Caldeireiro TIG..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Horas Estimadas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={laborHours}
                    onChange={(e) => setLaborHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {canViewFinancials ? (
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Taxa Horária (R$/h)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={laborRate}
                      onChange={(e) => setLaborRate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddLaborModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Confirmar Alocação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Peça */}
      {showAddPartModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
              <Boxes className="w-4 h-4 text-amber-400" />
              <span>Requisitar Peça ou Insumo</span>
            </h3>

            <form onSubmit={handleAddPart} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Nome da Peça / Insumo *</label>
                <input
                  type="text"
                  required
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="Ex: Rolamento Autocompensador 22216 EK..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Código / SKU</label>
                  <input
                    type="text"
                    value={partSku}
                    onChange={(e) => setPartSku(e.target.value)}
                    placeholder="Ex: ROL-22216"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Quantidade</label>
                  <div className="flex space-x-1">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={partQtyPlanned}
                      onChange={(e) => setPartQtyPlanned(e.target.value)}
                      className="w-2/3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <select
                      value={partUnit}
                      onChange={(e) => setPartUnit(e.target.value)}
                      className="w-1/3 px-2 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-[11px]"
                    >
                      <option value="UN">UN</option>
                      <option value="PC">PÇ</option>
                      <option value="KG">KG</option>
                      <option value="L">L</option>
                      <option value="M">M</option>
                      <option value="CX">CX</option>
                    </select>
                  </div>
                </div>
              </div>

              {canViewFinancials && (
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Valor Unitário Estimado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={partUnitPrice}
                    onChange={(e) => setPartUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Status do Suprimento</label>
                <select
                  value={partStatus}
                  onChange={(e) => setPartStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="disponivel">Disponível em Estoque</option>
                  <option value="em_separacao">Em Separação no Almoxarifado</option>
                  <option value="solicitado">Solicitado / Requisição Aberta</option>
                  <option value="aguardando_compra">Aguardando Compra / Cotação</option>
                  <option value="aplicado">Já Aplicado na OS</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPartModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  Adicionar Peça
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
