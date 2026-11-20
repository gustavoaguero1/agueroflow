import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderStatusConfig,
  WorkOrderPriority,
  WorkOrderType,
  OrderEvent,
  Unit,
  CostCenter,
  Asset,
  Team,
  Contract,
  Item,
  StockBalance,
  StockMovement,
} from '../types';
import {
  Plus,
  Search,
  Filter,
  Kanban,
  List,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  User,
  ArrowRight,
  X,
  FileText,
  Activity,
  Layers,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Printer,
  Camera,
  Upload,
  Trash2,
  Boxes,
  FileCheck,
  PenTool,
  Check,
  ExternalLink,
  ShieldCheck,
  Download,
  Sliders,
  ChevronUp,
  ChevronDown,
  Edit2,
  GripVertical,
  Settings2,
  Tag,
  Sparkles,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { GatLogo } from '../components/common/GatLogo';
import { getActiveTimeInfo, getPlanningSummary } from '../components/workOrders/workOrderHelpers';
import { OrderOverviewTab } from '../components/workOrders/OrderOverviewTab';
import { OrderDiscussionTab } from '../components/workOrders/OrderDiscussionTab';
import { OrderPlanningTab } from '../components/workOrders/OrderPlanningTab';
import { OrderTimelineTab } from '../components/workOrders/OrderTimelineTab';
import { OrderQuickPreview } from '../components/workOrders/OrderQuickPreview';
import { OrderExecutionHubTab } from '../components/workOrders/OrderExecutionHubTab';
import { OrderTechnicalReportModal } from '../components/workOrders/OrderTechnicalReportModal';

export const DEFAULT_WORK_ORDER_STATUSES: WorkOrderStatusConfig[] = [
  {
    id: 'aberto',
    orgId: '',
    name: 'Aberto',
    description: 'Demanda aberta, aguardando triagem ou início do atendimento operacional',
    color: 'slate',
    badgeBg: 'bg-slate-800/90',
    badgeText: 'text-slate-200',
    badgeBorder: 'border-slate-700',
    order: 1,
    isInitial: true,
    isCompleted: false,
    isSystem: true,
  },
  {
    id: 'em_aprovacao',
    orgId: '',
    name: 'Em Aprovação',
    description: 'Aguardando aprovação de reservas de peças, custos ou liberação de execução',
    color: 'orange',
    badgeBg: 'bg-orange-950/70',
    badgeText: 'text-orange-300',
    badgeBorder: 'border-orange-800/40',
    order: 2,
    isInitial: false,
    isCompleted: false,
    isSystem: true,
  },
  {
    id: 'em_execucao',
    orgId: '',
    name: 'Em Execução',
    description: 'Serviço em andamento ativo com técnicos ou caldeiraria em campo',
    color: 'blue',
    badgeBg: 'bg-blue-950/70',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-800/40',
    order: 3,
    isInitial: false,
    isCompleted: false,
    isSystem: true,
  },
  {
    id: 'aguardando_pecas',
    orgId: '',
    name: 'Aguardando Peças',
    description: 'Pausada aguardando requisição, compra ou entrega de insumos e sobressalentes',
    color: 'amber',
    badgeBg: 'bg-amber-950/70',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-800/40',
    order: 3,
    isInitial: false,
    isCompleted: false,
    requiresNotes: true,
    isSystem: true,
  },
  {
    id: 'concluido',
    orgId: '',
    name: 'Concluído',
    description: 'Atividades e reparos físicos finalizados pela equipe executora',
    color: 'emerald',
    badgeBg: 'bg-emerald-950/70',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-800/40',
    order: 4,
    isInitial: false,
    isCompleted: true,
    isSystem: true,
  },
  {
    id: 'validado',
    orgId: '',
    name: 'Validado',
    description: 'Validado, auditado e aprovado com sucesso pelo cliente ou supervisão técnica',
    color: 'purple',
    badgeBg: 'bg-purple-950/70',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-800/40',
    order: 5,
    isInitial: false,
    isCompleted: true,
    isSystem: true,
  },
];

export const STATUS_COLOR_THEMES: Record<
  string,
  { label: string; badgeBg: string; badgeText: string; badgeBorder: string; dotColor: string }
> = {
  slate: {
    label: 'Cinza / Neutro',
    badgeBg: 'bg-slate-800/90',
    badgeText: 'text-slate-200',
    badgeBorder: 'border-slate-700',
    dotColor: 'bg-slate-400',
  },
  blue: {
    label: 'Azul Operacional',
    badgeBg: 'bg-blue-950/70',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-800/40',
    dotColor: 'bg-blue-400',
  },
  indigo: {
    label: 'Índigo / Técnico',
    badgeBg: 'bg-indigo-950/70',
    badgeText: 'text-indigo-300',
    badgeBorder: 'border-indigo-800/40',
    dotColor: 'bg-indigo-400',
  },
  cyan: {
    label: 'Ciano / Em Teste',
    badgeBg: 'bg-cyan-950/70',
    badgeText: 'text-cyan-300',
    badgeBorder: 'border-cyan-800/40',
    dotColor: 'bg-cyan-400',
  },
  amber: {
    label: 'Âmbar / Atenção',
    badgeBg: 'bg-amber-950/70',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-800/40',
    dotColor: 'bg-amber-400',
  },
  orange: {
    label: 'Laranja / Pausado',
    badgeBg: 'bg-orange-950/70',
    badgeText: 'text-orange-300',
    badgeBorder: 'border-orange-800/40',
    dotColor: 'bg-orange-400',
  },
  emerald: {
    label: 'Verde / Concluído',
    badgeBg: 'bg-emerald-950/70',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-800/40',
    dotColor: 'bg-emerald-400',
  },
  purple: {
    label: 'Roxo / Validado',
    badgeBg: 'bg-purple-950/70',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-800/40',
    dotColor: 'bg-purple-400',
  },
  rose: {
    label: 'Vermelho / Crítico',
    badgeBg: 'bg-rose-950/70',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-800/40',
    dotColor: 'bg-rose-400',
  },
};

export const resolveStatusKey = (
  rawStatus: string | undefined,
  list: WorkOrderStatusConfig[]
): string => {
  if (!rawStatus) return list[0]?.id || 'aberto';
  const direct = list.find(
    (s) => s.id === rawStatus || s.name.toLowerCase() === rawStatus.toLowerCase()
  );
  if (direct) return direct.id;

  // Legacy mappings for backward compatibility
  const lower = rawStatus.toLowerCase();
  if (lower === 'rascunho' || lower === 'planejada' || lower === 'agendada' || lower === 'planejado') {
    return list.find((s) => s.isInitial)?.id || list[0]?.id || 'aberto';
  }
  if (lower === 'em aprovação' || lower === 'em aprovacao' || lower === 'em_aprovacao') {
    return list.find((s) => s.id === 'em_aprovacao')?.id || 'em_aprovacao';
  }
  if (lower === 'pausada') {
    return list.find((s) => s.id === 'aguardando_pecas')?.id || list[2]?.id || 'aguardando_pecas';
  }
  if (lower === 'concluida') {
    return list.find((s) => s.id === 'concluido')?.id || 'concluido';
  }
  if (lower === 'encerrada') {
    return list.find((s) => s.id === 'validado')?.id || 'validado';
  }
  return rawStatus;
};

export const getStatusConfig = (
  rawStatus: string | undefined,
  list: WorkOrderStatusConfig[]
): WorkOrderStatusConfig => {
  const key = resolveStatusKey(rawStatus, list);
  const found = list.find((s) => s.id === key);
  if (found) return found;

  const fallbackTheme = STATUS_COLOR_THEMES.slate;
  return {
    id: key,
    orgId: '',
    name: rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).replace(/_/g, ' ') : 'Desconhecido',
    color: 'slate',
    badgeBg: fallbackTheme.badgeBg,
    badgeText: fallbackTheme.badgeText,
    badgeBorder: fallbackTheme.badgeBorder,
    order: 99,
  };
};

export const getStatusBadgeStyle = (
  rawStatus: string | undefined,
  list: WorkOrderStatusConfig[]
): string => {
  const cfg = getStatusConfig(rawStatus, list);
  return `${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder || 'border border-slate-700'}`;
};

const PRIORITY_LABELS: Record<WorkOrderPriority, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'text-slate-400 bg-slate-800' },
  media: { label: 'Média', color: 'text-blue-400 bg-blue-950/50' },
  alta: { label: 'Alta', color: 'text-amber-400 bg-amber-950/50' },
  critica: { label: 'Crítica', color: 'text-red-400 bg-red-950/50 border border-red-800/40' },
};

const TYPE_LABELS: Record<WorkOrderType, string> = {
  preventiva: 'Preventiva',
  corretiva: 'Corretiva',
  emergencial: 'Emergencial',
  solicitacao: 'Solicitação',
  instalacao: 'Instalação',
  atendimento: 'Atendimento',
  inspecao: 'Inspeção / Vistoria',
  outros: 'Outros Serviços',
};

const PAGE_SIZE = 12;

export interface WorkOrdersModuleProps {
  initialSearchQuery?: string;
  initialOrderId?: string;
}

export const WorkOrdersModule: React.FC<WorkOrdersModuleProps> = ({
  initialSearchQuery = '',
  initialOrderId,
}) => {
  const {
    user,
    organization,
    role,
    canViewFinancials,
    selectedUnitId: globalUnitId,
    selectedContractId: globalContractId,
    units,
    contracts,
    logAudit,
  } = useAuth();

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stockItems, setStockItems] = useState<Item[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todas');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [unitFilter, setUnitFilter] = useState<string>('todas');
  const [contractFilter, setContractFilter] = useState<string>('todos');
  const [teamFilter, setTeamFilter] = useState<string>('todas');
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [onlyRework, setOnlyRework] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  // Configurable Statuses State (Ex: Aberto, Em Execução, Aguardando Peças, Concluído, Validado)
  const [statuses, setStatuses] = useState<WorkOrderStatusConfig[]>(DEFAULT_WORK_ORDER_STATUSES);
  const [showStatusConfigModal, setShowStatusConfigModal] = useState(false);
  const [showStatusFormModal, setShowStatusFormModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<WorkOrderStatusConfig | null>(null);
  const [statusFormId, setStatusFormId] = useState('');
  const [statusFormName, setStatusFormName] = useState('');
  const [statusFormDescription, setStatusFormDescription] = useState('');
  const [statusFormColor, setStatusFormColor] = useState('blue');
  const [statusFormOrder, setStatusFormOrder] = useState<number>(1);
  const [statusFormIsInitial, setStatusFormIsInitial] = useState(false);
  const [statusFormIsCompleted, setStatusFormIsCompleted] = useState(false);
  const [statusFormRequiresNotes, setStatusFormRequiresNotes] = useState(false);
  const [statusChangeNote, setStatusChangeNote] = useState('');
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'overview' | 'execution' | 'discussion' | 'planning' | 'timeline'>('overview');
  const [showReportModal, setShowReportModal] = useState(false);
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);

  const toggleRowExpand = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOrderIds((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const handleOpenOrderOnTab = (
    order: WorkOrder,
    tab: 'overview' | 'execution' | 'discussion' | 'planning' | 'timeline' = 'overview'
  ) => {
    setSelectedOrder(order);
    setActiveModalTab(tab);
  };

  // Form State
  const [formNumber, setFormNumber] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<WorkOrderType>('solicitacao');
  const [formPriority, setFormPriority] = useState<WorkOrderPriority>('media');
  const [formStatus, setFormStatus] = useState<string>('aberto');
  const [formUnitId, setFormUnitId] = useState('');
  const [formContractId, setFormContractId] = useState('');
  const [formCostCenterId, setFormCostCenterId] = useState('');
  const [formAssetId, setFormAssetId] = useState('');
  const [formAssignedTeam, setFormAssignedTeam] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formSpecificService, setFormSpecificService] = useState('');
  const [formChecklistTemplate, setFormChecklistTemplate] = useState('');
  const [formScheduledStart, setFormScheduledStart] = useState('');
  const [formScheduledEnd, setFormScheduledEnd] = useState('');
  const [formEstimatedHours, setFormEstimatedHours] = useState('4');
  const [formEstimatedCost, setFormEstimatedCost] = useState('0');
  const [formIsRework, setFormIsRework] = useState(false);
  const [formReworkReason, setFormReworkReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync with global header filters
  useEffect(() => {
    if (globalUnitId) setUnitFilter(globalUnitId);
  }, [globalUnitId]);

  useEffect(() => {
    if (globalContractId) setContractFilter(globalContractId);
  }, [globalContractId]);

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (initialOrderId && orders.length > 0) {
      const found = orders.find((o) => o.id === initialOrderId);
      if (found) {
        setSelectedOrder(found);
      }
    }
  }, [initialOrderId, orders]);

  // Load configured statuses for the current organization in Firestore
  useEffect(() => {
    if (!organization) return;

    const qStatuses = query(
      collection(db, 'work_order_statuses'),
      where('orgId', '==', organization.id)
    );

    const unsubStatuses = onSnapshot(qStatuses, async (snap) => {
      if (snap.empty) {
        // Auto-seed the 5 standard statuses requested (Aberto, Em Execução, Aguardando Peças, Concluído, Validado)
        const initialList = DEFAULT_WORK_ORDER_STATUSES.map((s) => ({
          ...s,
          orgId: organization.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        setStatuses(initialList);
        for (const st of initialList) {
          try {
            await setDoc(doc(db, 'work_order_statuses', `${organization.id}_${st.id}`), st);
          } catch (e) {
            console.warn('Erro ao semear status inicial:', e);
          }
        }
      } else {
        const list = snap.docs.map(
          (d) =>
            ({
              id: d.data().id || d.id.replace(`${organization.id}_`, ''),
              ...d.data(),
            } as WorkOrderStatusConfig)
        );
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setStatuses(list);
      }
    });

    return () => unsubStatuses();
  }, [organization]);

  useEffect(() => {
    if (!organization) return;

    const qOrders = query(collection(db, 'work_orders'), where('orgId', '==', organization.id));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
      setOrders(list);
    });

    getDocs(query(collection(db, 'cost_centers'), where('orgId', '==', organization.id))).then((s) =>
      setCostCenters(s.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenter)))
    );
    getDocs(query(collection(db, 'assets'), where('orgId', '==', organization.id))).then((s) =>
      setAssets(s.docs.map((d) => ({ id: d.id, ...d.data() } as Asset)))
    );
    getDocs(query(collection(db, 'teams'), where('orgId', '==', organization.id))).then((s) =>
      setTeams(s.docs.map((d) => ({ id: d.id, ...d.data() } as Team)))
    );
    getDocs(query(collection(db, 'items'), where('orgId', '==', organization.id))).then((s) =>
      setStockItems(s.docs.map((d) => ({ id: d.id, ...d.data() } as Item)))
    ).catch(() => {});

    return () => unsubOrders();
  }, [organization]);

  // Load events when an order is opened
  useEffect(() => {
    if (!selectedOrder || !organization) {
      setOrderEvents([]);
      return;
    }

    const qEvents = query(
      collection(db, 'order_events'),
      where('orgId', '==', organization.id),
      where('orderId', '==', selectedOrder.id)
    );
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderEvent));
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setOrderEvents(list);
    });

    return () => unsubEvents();
  }, [selectedOrder, organization]);

  const handleOpenCreate = () => {
    const nextNum = `OS-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;
    setFormNumber(nextNum);
    setFormTitle('');
    setFormDescription('');
    setFormType('solicitacao');
    setFormPriority('media');
    const initialSt = statuses.find((s) => s.isInitial)?.id || statuses[0]?.id || 'aberto';
    setFormStatus(initialSt);
    setFormUnitId(units[0]?.id || '');
    setFormContractId(contracts[0]?.id || '');
    setFormCostCenterId(costCenters[0]?.id || '');
    setFormAssetId(assets[0]?.id || '');
    setFormAssignedTeam(teams[0]?.name || '');
    setFormAssignedTo('');
    setFormSpecificService('');
    setFormChecklistTemplate('');
    setFormScheduledStart(new Date().toISOString().split('T')[0]);
    setFormScheduledEnd('');
    setFormEstimatedHours('4');
    setFormEstimatedCost('0');
    setFormIsRework(false);
    setFormReworkReason('');
    setFormNotes('');
    setShowCreateModal(true);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setIsSubmitting(true);

    try {
      const orderId = `os_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const targetStatus = formStatus || statuses.find((s) => s.isInitial)?.id || 'aberto';
      const statusCfg = getStatusConfig(targetStatus, statuses);

      const newOrder: WorkOrder = {
        id: orderId,
        orgId: organization.id,
        unitId: formUnitId || (units[0]?.id ?? 'default_unit'),
        contractId: formContractId || undefined,
        costCenterId: formCostCenterId || undefined,
        assetId: formAssetId || undefined,
        orderNumber: formNumber.trim(),
        title: formTitle.trim(),
        description: formDescription.trim(),
        orderType: formType,
        priority: formPriority,
        status: targetStatus,
        requesterId: user.uid,
        requesterName: user.displayName || user.email || 'Solicitante',
        assignedTeam: formAssignedTeam || undefined,
        assignedTo: formAssignedTo.trim() || undefined,
        scheduledStartDate: formScheduledStart || undefined,
        scheduledEndDate: formScheduledEnd || undefined,
        estimatedHours: parseFloat(formEstimatedHours) || 0,
        estimatedCost: canViewFinancials ? parseFloat(formEstimatedCost) || 0 : 0,
        isRework: formIsRework,
        reworkReason: formIsRework ? formReworkReason.trim() : undefined,
        notes: formNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'work_orders', orderId), newOrder);

      // Record creation event in timeline
      await addDoc(collection(db, 'order_events'), {
        orgId: organization.id,
        orderId,
        userId: user.uid,
        userName: user.displayName || user.email || 'Usuário',
        eventType: 'criacao',
        description: `Demanda / OS ${newOrder.orderNumber} cadastrada no estado "${statusCfg.name}".`,
        newStatus: targetStatus,
        timestamp: new Date().toISOString(),
      });

      await logAudit(
        'Ordens de Serviço',
        'Criar OS',
        `Criação da OS ${newOrder.orderNumber} - ${newOrder.title} no status "${statusCfg.name}"`,
        orderId
      );

      setShowCreateModal(false);
    } catch (err) {
      console.error('Erro ao criar OS:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carregar Cenário Real ilustrado pelo usuário: ORD-20260924-0002
  const handleLoadRealScenario = async () => {
    if (!organization || !user) return;
    setIsSubmitting(true);
    try {
      const orderId = `os_ord_20260924_0002_${organization.id}`;
      const realOrder: WorkOrder = {
        id: orderId,
        orgId: organization.id,
        unitId: units[0]?.id || 'cd_marilia_bmdv',
        orderNumber: 'ORD-20260924-0002',
        title: '13150805 MANUTENÇÃO RALOS DA REEMBALAGEM',
        description: 'Manutenção ralos da reembalagem na planta CD Marília (BMDV). Bloqueio ativo por reserva de peças.',
        orderType: 'corretiva',
        priority: 'media',
        status: 'em_aprovacao',
        requesterId: user.uid,
        requesterName: 'Derek Liria',
        assignedTo: 'Gilfran — gilfran.bispo',
        assignedTeam: 'CD Marília (BMDV)',
        scheduledStartDate: '2026-09-13',
        scheduledEndDate: '2026-09-13',
        estimatedHours: 36,
        estimatedCost: canViewFinancials ? 3850 : 0,
        isRework: false,
        notes: 'Checklist vinculado: Check-list de Corretiva — versão 1 publicada. LPU: Não criar, pois LPU corresponde ao planejamento.',
        messageCount: 2,
        pendingQuestionCount: 1,
        lastDiscussionAt: '2026-09-24T16:15:00.000Z',
        plannedServices: [
          {
            id: 'srv_real_1',
            description: 'Hospedagem de dupla técnica',
            category: 'civil',
            estimatedHours: 0,
            actualHours: 0,
            status: 'planejado',
          },
          {
            id: 'srv_real_2',
            description: 'Valor mínimo de atendimento com deslocamento',
            category: 'mecanica',
            estimatedHours: 0,
            actualHours: 0,
            status: 'planejado',
          },
        ],
        plannedLabor: [
          {
            id: 'lab_real_1',
            workerName: 'Gilfran Bispo & Auxiliar',
            role: 'Serralheiro',
            estimatedHours: 18,
            actualHours: 0,
            hourlyRate: 85,
            totalCost: 1530,
            status: 'alocado',
          },
          {
            id: 'lab_real_2',
            workerName: 'Soldador Especialista',
            role: 'Soldador',
            estimatedHours: 18,
            actualHours: 0,
            hourlyRate: 95,
            totalCost: 1710,
            status: 'alocado',
          },
        ],
        plannedParts: [
          {
            id: 'prt_real_1',
            sku: 'MGR',
            name: 'Material geral de reparo — CD Marília (BMDV)',
            quantityPlanned: 12,
            quantityUsed: 0,
            unit: 'UN',
            unitPrice: 50,
            totalCost: 600,
            status: 'solicitado',
          },
        ],
        createdAt: '2026-09-24T14:48:12.000Z',
        updatedAt: '2026-09-24T15:58:19.000Z',
      };

      await setDoc(doc(db, 'work_orders', orderId), realOrder);

      // Create conversation messages
      await setDoc(doc(db, 'order_messages', `msg_real_1_${orderId}`), {
        id: `msg_real_1_${orderId}`,
        orgId: organization.id,
        orderId,
        senderId: 'gilfran_bispo',
        senderName: 'Gilfran (Responsável Técnico)',
        senderRole: 'Responsavel',
        messageType: 'pergunta',
        content: 'Olá supervisão, cheguei no CD Marília para iniciar os ralos da reembalagem. A ordem acusa atraso pois estava prevista para 13/09, e há reserva de 12 un. de MGR bloqueando o início no sistema, além da validação de GPS. Como proceder?',
        createdAt: '2026-09-24T16:05:00.000Z',
        resolved: false,
      });

      await setDoc(doc(db, 'order_messages', `msg_real_2_${orderId}`), {
        id: `msg_real_2_${orderId}`,
        orgId: organization.id,
        orderId,
        senderId: user.uid,
        senderName: 'Derek Liria (Gestor / Superior)',
        senderRole: 'Superior',
        messageType: 'resposta',
        replyToMessageId: `msg_real_1_${orderId}`,
        replyToSnippet: 'A ordem acusa atraso... reserva de 12 un. de MGR bloqueando...',
        content: 'Gilfran, a ordem foi enviada para aprovação e a reserva de 12 unidades de MGR foi incluída às 15:58. O gestor da planta está validando o orçamento de 36h de mão de obra (Serralheiro + Soldador) e os insumos. Não inicie antes da aprovação da reserva para não gerar inconsistência de LPU/estoque. Ative o GPS no navegador para quando liberar.',
        createdAt: '2026-09-24T16:15:00.000Z',
        resolved: false,
      });

      // Populate all 12 timeline events from the user's brief
      const realEvents = [
        { time: '2026-09-24T14:48:12.000Z', type: 'criacao', desc: 'Criação da ordem — Status inicial: Planejado.' },
        { time: '2026-09-24T14:48:45.000Z', type: 'planejamento', desc: 'Alteração do orçamento — Composição de serviços: 1 linha. Mão de obra: 0 linhas.' },
        { time: '2026-09-24T14:48:55.000Z', type: 'planejamento', desc: 'Alteração do orçamento — Composição de serviços: 2 linhas. Mão de obra: 0 linhas.' },
        { time: '2026-09-24T14:49:22.000Z', type: 'planejamento', desc: 'Alteração do orçamento — Composição de serviços: 2 linhas. Mão de obra: 1 linha.' },
        { time: '2026-09-24T14:49:29.000Z', type: 'planejamento', desc: 'Alteração do orçamento — Composição de serviços: 2 linhas. Mão de obra: 2 linhas.' },
        { time: '2026-09-24T14:50:20.000Z', type: 'pecas', desc: 'Inclusão de reserva — Material MGR — quantidade 1, unidade BMDV.' },
        { time: '2026-09-24T14:51:11.000Z', type: 'pecas', desc: 'Cancelamento de reserva — Reserva de MGR cancelada.' },
        { time: '2026-09-24T14:56:46.000Z', type: 'pecas', desc: 'Inclusão de reserva — Material MGR — quantidade 1, unidade BMDV.' },
        { time: '2026-09-24T14:56:59.000Z', type: 'pecas', desc: 'Cancelamento de reserva — Reserva de MGR cancelada.' },
        { time: '2026-09-24T15:57:21.000Z', type: 'status_change', desc: 'Envio para aprovação — Status alterado de Planejado para Em aprovação.' },
        { time: '2026-09-24T15:57:21.000Z', type: 'planejamento', desc: 'Alteração do orçamento — Registro do envio da ordem para aprovação do gestor.' },
        { time: '2026-09-24T15:58:19.000Z', type: 'pecas', desc: 'Inclusão de reserva — Material MGR — quantidade 12, unidade BMDV (Bloqueante).' },
      ];

      for (let i = 0; i < realEvents.length; i++) {
        const ev = realEvents[i];
        await setDoc(doc(db, 'order_events', `evt_real_${i}_${orderId}`), {
          id: `evt_real_${i}_${orderId}`,
          orgId: organization.id,
          orderId,
          userId: user.uid,
          userName: 'Derek Liria',
          eventType: ev.type,
          description: ev.desc,
          timestamp: ev.time,
        });
      }

      await logAudit(
        'Ordens de Serviço',
        'Cenário Real',
        'Carregamento da OS ORD-20260924-0002 com serviços, mão de obra, reservas de peças e linha do tempo histórica',
        orderId
      );

      setSelectedOrder(realOrder);
      setActiveModalTab('overview');
    } catch (err) {
      console.error('Erro ao carregar cenário real:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status transitions
  const handleUpdateOrderStatus = async (
    order: WorkOrder,
    targetStatusId: string,
    transitionNotes?: string
  ) => {
    if (!organization || !user) return;
    const currentKey = resolveStatusKey(order.status, statuses);
    if (currentKey === targetStatusId) return;

    const currentCfg = getStatusConfig(order.status, statuses);
    const targetCfg = getStatusConfig(targetStatusId, statuses);

    try {
      const orderRef = doc(db, 'work_orders', order.id);
      const updates: Partial<WorkOrder> = {
        status: targetStatusId,
        updatedAt: new Date().toISOString(),
      };

      const today = new Date().toISOString().split('T')[0];
      if (targetStatusId === 'em_execucao' && !order.actualStartDate) {
        updates.actualStartDate = today;
      }
      if (targetCfg.isCompleted && !order.actualEndDate) {
        updates.actualEndDate = today;
      }

      await updateDoc(orderRef, updates);

      const eventDesc = transitionNotes?.trim()
        ? `Transição de estado: ${currentCfg.name} → ${targetCfg.name}. Motivo/Apontamento: ${transitionNotes.trim()}`
        : `Transição de estado operacional: ${currentCfg.name} → ${targetCfg.name}`;

      await addDoc(collection(db, 'order_events'), {
        orgId: organization.id,
        orderId: order.id,
        userId: user.uid,
        userName: user.displayName || user.email || 'Operador',
        eventType: 'mudanca_status',
        description: eventDesc,
        previousStatus: order.status,
        newStatus: targetStatusId,
        timestamp: new Date().toISOString(),
      });

      await logAudit(
        'Ordens de Serviço',
        'Transição de Status',
        `OS ${order.orderNumber} alterada de "${currentCfg.name}" para "${targetCfg.name}"`,
        order.id
      );

      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder({ ...selectedOrder, ...updates });
        setStatusChangeNote('');
      }
    } catch (err) {
      console.error('Erro ao atualizar status da OS:', err);
    }
  };

  const handleUpdateOrderStatusById = (orderId: string, targetStatusId: string, notes?: string) => {
    const target = orders.find((o) => o.id === orderId);
    if (target) {
      handleUpdateOrderStatus(target, targetStatusId, notes);
    }
  };

  // Status configuration management (CRUD)
  const handleOpenAddStatus = () => {
    setEditingStatus(null);
    setStatusFormId('');
    setStatusFormName('');
    setStatusFormDescription('');
    setStatusFormColor('blue');
    setStatusFormOrder(statuses.length + 1);
    setStatusFormIsInitial(false);
    setStatusFormIsCompleted(false);
    setStatusFormRequiresNotes(false);
    setShowStatusFormModal(true);
  };

  const handleOpenEditStatus = (st: WorkOrderStatusConfig) => {
    setEditingStatus(st);
    setStatusFormId(st.id);
    setStatusFormName(st.name);
    setStatusFormDescription(st.description || '');
    setStatusFormColor(st.color || 'blue');
    setStatusFormOrder(st.order ?? statuses.length + 1);
    setStatusFormIsInitial(!!st.isInitial);
    setStatusFormIsCompleted(!!st.isCompleted);
    setStatusFormRequiresNotes(!!st.requiresNotes);
    setShowStatusFormModal(true);
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !statusFormName.trim()) return;

    const slug = statusFormId.trim()
      ? statusFormId.trim()
      : statusFormName
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '_');

    const theme = STATUS_COLOR_THEMES[statusFormColor] || STATUS_COLOR_THEMES.blue;

    const newConfig: WorkOrderStatusConfig = {
      id: slug,
      orgId: organization.id,
      name: statusFormName.trim(),
      description: statusFormDescription.trim(),
      color: statusFormColor,
      badgeBg: theme.badgeBg,
      badgeText: theme.badgeText,
      badgeBorder: theme.badgeBorder,
      order: statusFormOrder,
      isInitial: statusFormIsInitial,
      isCompleted: statusFormIsCompleted,
      requiresNotes: statusFormRequiresNotes,
      updatedAt: new Date().toISOString(),
    };

    try {
      const docId = `${organization.id}_${slug}`;
      await setDoc(doc(db, 'work_order_statuses', docId), newConfig);

      // If marked initial, unset other initials
      if (statusFormIsInitial) {
        for (const st of statuses) {
          if (st.id !== slug && st.isInitial) {
            await updateDoc(doc(db, 'work_order_statuses', `${organization.id}_${st.id}`), {
              isInitial: false,
            });
          }
        }
      }

      await logAudit(
        'Configurações',
        'Estado de OS',
        `Estado operacional "${newConfig.name}" salvo/atualizado na organização`,
        slug
      );

      setShowStatusFormModal(false);
    } catch (err) {
      console.error('Erro ao salvar estado:', err);
      alert('Erro ao salvar estado. Verifique permissões.');
    }
  };

  const handleReorderStatus = async (statusId: string, direction: 'up' | 'down') => {
    if (!organization) return;
    const index = statuses.findIndex((s) => s.id === statusId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === statuses.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentItem = statuses[index];
    const targetItem = statuses[targetIndex];

    const currentOrder = currentItem.order;
    const targetOrder = targetItem.order;

    try {
      await updateDoc(doc(db, 'work_order_statuses', `${organization.id}_${currentItem.id}`), {
        order: targetOrder,
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'work_order_statuses', `${organization.id}_${targetItem.id}`), {
        order: currentOrder,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao reordenar estados:', err);
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    if (!organization) return;
    if (statuses.length <= 2) {
      alert('A organização deve ter pelo menos 2 estados configurados para o fluxo operacional.');
      return;
    }

    const inUseCount = orders.filter((o) => resolveStatusKey(o.status, statuses) === statusId).length;
    const confirmMsg =
      inUseCount > 0
        ? `Atenção: existem ${inUseCount} ordem(ns) de serviço neste estado. Ao excluir, elas serão migradas para o estado inicial. Confirmar exclusão?`
        : 'Tem certeza que deseja excluir este estado operacional?';

    if (!confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'work_order_statuses', `${organization.id}_${statusId}`));

      // If orders had this status, reassign them to initial status
      if (inUseCount > 0) {
        const fallback = statuses.find((s) => s.id !== statusId && s.isInitial)?.id || statuses[0]?.id;
        if (fallback) {
          const ordersToUpdate = orders.filter((o) => resolveStatusKey(o.status, statuses) === statusId);
          for (const ord of ordersToUpdate) {
            await updateDoc(doc(db, 'work_orders', ord.id), {
              status: fallback,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      await logAudit(
        'Configurações',
        'Excluir Estado',
        `Estado "${statusId}" removido do fluxo de OS`,
        statusId
      );
    } catch (err) {
      console.error('Erro ao excluir estado:', err);
      alert('Erro ao excluir estado.');
    }
  };

  const handleResetDefaultStatuses = async () => {
    if (!organization) return;
    if (
      !confirm(
        'Deseja restaurar o fluxo padrão com os 5 estados clássicos (Aberto, Em Execução, Aguardando Peças, Concluído, Validado)?'
      )
    )
      return;

    try {
      for (const st of DEFAULT_WORK_ORDER_STATUSES) {
        const cfg = {
          ...st,
          orgId: organization.id,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'work_order_statuses', `${organization.id}_${st.id}`), cfg);
      }
      await logAudit(
        'Configurações',
        'Restaurar Estados',
        'Fluxo de estados da OS restaurado para os 5 padrões operacionais'
      );
    } catch (err) {
      console.error('Erro ao restaurar padrões:', err);
    }
  };

  // Filtered orders
  const todayStr = new Date().toISOString().split('T')[0];
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'todos' && o.status !== statusFilter) return false;
      if (priorityFilter !== 'todas' && o.priority !== priorityFilter) return false;
      if (typeFilter !== 'todos' && o.orderType !== typeFilter) return false;
      if (unitFilter !== 'todas' && o.unitId !== unitFilter) return false;
      if (contractFilter !== 'todos' && o.contractId !== contractFilter) return false;
      if (teamFilter !== 'todas' && o.assignedTeam !== teamFilter) return false;
      if (onlyRework && !o.isRework) return false;
      if (onlyDelayed) {
        if (!o.scheduledEndDate) return false;
        if (o.status === 'concluida' || o.status === 'encerrada') return false;
        if (o.scheduledEndDate >= todayStr) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = o.orderNumber?.toLowerCase().includes(q);
        const matchTitle = o.title?.toLowerCase().includes(q);
        const matchDesc = o.description?.toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchDesc) return false;
      }
      return true;
    });
  }, [orders, statusFilter, priorityFilter, typeFilter, unitFilter, contractFilter, teamFilter, onlyRework, onlyDelayed, searchQuery, todayStr]);

  // Quick Status Counters based on current filters and configured statuses
  const statusCounters = useMemo(() => {
    const counts: Record<string, number> = {
      todos: filteredOrders.length,
    };
    statuses.forEach((st) => {
      counts[st.id] = filteredOrders.filter(
        (o) => resolveStatusKey(o.status, statuses) === st.id
      ).length;
    });
    return counts;
  }, [filteredOrders, statuses]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Ordens de Serviço & Demandas</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestão operacional adaptável, controle de execução e rastreabilidade total.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs font-semibold flex items-center space-x-1 cursor-pointer ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded text-xs font-semibold flex items-center space-x-1 cursor-pointer ${
                viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
          </div>

          {/* Configurar Estados button */}
          <button
            onClick={() => setShowStatusConfigModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 shadow-sm transition-all cursor-pointer"
            title="Personalizar estados do fluxo operacional (Ex: Aberto, Em Aprovação, Em Execução, Aguardando Peças, Concluído, Validado)"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Configurar Estados</span>
          </button>

          {/* Carregar Exemplo Real */}
          <button
            onClick={handleLoadRealScenario}
            disabled={isSubmitting}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 text-xs font-semibold border border-amber-500/30 shadow-sm transition-all cursor-pointer"
            title="Carregar exemplo completo: ORD-20260924-0002 com Planejamento, Diálogo de Execução e Linha do Tempo"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Exemplo Real (ORD-20260924)</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova OS</span>
          </button>
        </div>
      </div>

      {/* Quick Status Pill Counters */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs custom-scrollbar">
        <button
          onClick={() => setStatusFilter('todos')}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 whitespace-nowrap transition-all cursor-pointer ${
            statusFilter === 'todos'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-[#121826] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <span>Todos</span>
          <span className="px-1.5 py-0.2 rounded bg-black/30 text-[10px] font-mono">{statusCounters.todos}</span>
        </button>

        {statuses.map((st) => {
          const isSelected = statusFilter === st.id;
          const count = statusCounters[st.id] || 0;
          return (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1.5 whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white font-bold shadow-md'
                  : 'bg-[#121826] text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/80'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  STATUS_COLOR_THEMES[st.color]?.dotColor || 'bg-blue-400'
                }`}
              />
              <span>{st.name}</span>
              <span className="px-1.5 py-0.2 rounded bg-black/30 text-[10px] font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#121826] p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código, título ou trecho da demanda..."
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto text-xs">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="todos">Todos os Tipos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas as Prioridades</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>

            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas Unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="todas">Todas Equipes</option>
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Checkbox Quick Toggles */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1 border-t border-slate-800">
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyDelayed}
              onChange={(e) => setOnlyDelayed(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-red-600 focus:ring-0"
            />
            <span className={onlyDelayed ? 'text-red-400 font-semibold' : ''}>Apenas Demandas Atrasadas</span>
          </label>

          <label className="flex items-center space-x-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyRework}
              onChange={(e) => setOnlyRework(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
            />
            <span className={onlyRework ? 'text-amber-400 font-semibold' : ''}>Apenas Retrabalhos</span>
          </label>

          <span className="ml-auto text-[11px] text-slate-500 font-medium">
            Total filtrado: {filteredOrders.length} demandas
          </span>
        </div>
      </div>

      {/* View: Table Mode */}
      {viewMode === 'table' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                  <th className="py-3 px-3 w-8 text-center" title="Expandir visão rápida"></th>
                  <th className="py-3 px-3">Código & Ativo</th>
                  <th className="py-3 px-3">Demanda & Descrição</th>
                  <th className="py-3 px-3">Tempo Ativo & SLA</th>
                  <th className="py-3 px-3">Planejamento</th>
                  <th className="py-3 px-3">Diálogo / Execução</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Prioridade</th>
                  <th className="py-3 px-3">Equipe / Solicitante</th>
                  <th className="py-3 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-slate-400">
                      Nenhuma ordem de serviço localizada com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((o) => {
                    const isDelayed =
                      o.scheduledEndDate &&
                      o.scheduledEndDate < todayStr &&
                      o.status !== 'concluida' &&
                      o.status !== 'encerrada';

                    const activeTime = getActiveTimeInfo(o);
                    const planning = getPlanningSummary(o);
                    const asset = assets.find((a) => a.id === o.assetId);
                    const isExpanded = !!expandedOrderIds[o.id];

                    return (
                      <React.Fragment key={o.id}>
                        <tr
                          onClick={() => handleOpenOrderOnTab(o, 'overview')}
                          className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                        >
                          {/* Accordion Toggle */}
                          <td className="py-3 px-2 text-center" onClick={(e) => toggleRowExpand(o.id, e)}>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title={isExpanded ? 'Recolher detalhes rápidos' : 'Expandir visão rápida'}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>

                          {/* Order Number & Asset */}
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold text-blue-400 block">{o.orderNumber}</span>
                            {asset ? (
                              <span
                                className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-900 border border-slate-700 text-slate-300 max-w-[120px] truncate"
                                title={`${asset.tag} - ${asset.name}`}
                              >
                                {asset.tag}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">Sem ativo</span>
                            )}
                          </td>

                          {/* Title & Description */}
                          <td className="py-3 px-3 max-w-xs">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-slate-100 truncate">{o.title}</span>
                              {o.isRework && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800 font-bold shrink-0">
                                  Retrabalho
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">{o.description}</p>
                          </td>

                          {/* Tempo Ativo & SLA */}
                          <td className="py-3 px-3">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrderOnTab(o, 'overview');
                              }}
                              className="inline-block cursor-pointer hover:opacity-90"
                              title={`Tempo decorrido: ${activeTime.durationText}`}
                            >
                              <div className="flex items-center space-x-1.5 font-mono font-bold text-white text-xs">
                                <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                                <span>{activeTime.durationText}</span>
                              </div>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border inline-block mt-0.5 ${activeTime.slaBadgeColor}`}
                              >
                                {activeTime.slaLabel}
                              </span>
                            </div>
                          </td>

                          {/* Planejamento & Progresso */}
                          <td className="py-3 px-3">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrderOnTab(o, 'planning');
                              }}
                              className="cursor-pointer hover:opacity-90 group/plan min-w-[110px]"
                              title="Clique para abrir planejamento completo"
                            >
                              <div className="flex items-center justify-between text-[10px] mb-1">
                                <span className="text-slate-400 group-hover/plan:text-blue-300 transition-colors">
                                  Avanço
                                </span>
                                <span className="text-white font-bold">{planning.overallProgressPercent}%</span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden mb-1">
                                <div
                                  className="bg-blue-500 h-1 rounded-full transition-all"
                                  style={{ width: `${planning.overallProgressPercent}%` }}
                                />
                              </div>
                              <div className="flex items-center space-x-1 text-[9px]">
                                <span className="px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-blue-300 font-mono">
                                  🔧 {planning.servicesDone}/{planning.servicesCount}
                                </span>
                                <span className="px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-amber-300 font-mono">
                                  📦 {planning.partsApplied}/{planning.partsCount}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Diálogo / Execução (Chat) */}
                          <td className="py-3 px-3">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrderOnTab(o, 'discussion');
                              }}
                              className="cursor-pointer hover:opacity-90 inline-flex flex-col items-start"
                              title="Clique para abrir canal de comunicação com superior"
                            >
                              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-200 text-[10px] font-semibold hover:border-blue-500/50 transition-colors">
                                <MessageSquare className="w-3 h-3 text-blue-400" />
                                <span>{o.messageCount || 0} msgs</span>
                              </div>
                              {(o.pendingQuestionCount || 0) > 0 ? (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse mt-0.5">
                                  ❓ Dúvida aberta
                                </span>
                              ) : o.messageCount ? (
                                <span className="text-[8px] text-emerald-400 font-semibold mt-0.5">
                                  ✓ Alinhado
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3">
                            <div
                              className="relative inline-block"
                              onClick={(e) => e.stopPropagation()}
                              title="Clique para transitar de estado imediatamente"
                            >
                              <select
                                value={resolveStatusKey(o.status, statuses)}
                                onChange={(e) => handleUpdateOrderStatus(o, e.target.value)}
                                className={`px-2.5 py-1 rounded text-[10px] font-semibold border cursor-pointer appearance-none pr-5 transition-all outline-none ${getStatusBadgeStyle(
                                  o.status,
                                  statuses
                                )}`}
                              >
                                {statuses.map((st) => (
                                  <option
                                    key={st.id}
                                    value={st.id}
                                    className="bg-slate-900 text-white font-sans text-xs"
                                  >
                                    {st.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </td>

                          {/* Prioridade */}
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                PRIORITY_LABELS[o.priority]?.color
                              }`}
                            >
                              {PRIORITY_LABELS[o.priority]?.label}
                            </span>
                          </td>

                          {/* Equipe / Solicitante */}
                          <td className="py-3 px-3">
                            <p className="text-slate-200">{o.assignedTeam || 'Sem equipe'}</p>
                            <p className="text-[10px] text-slate-400">{o.requesterName}</p>
                          </td>

                          {/* Ação */}
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrderOnTab(o, 'overview');
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Ver Detalhes
                            </button>
                          </td>
                        </tr>

                        {/* Accordion Row */}
                        {isExpanded && (
                          <tr className="bg-slate-950/80">
                            <td colSpan={10} className="p-0">
                              <OrderQuickPreview
                                order={o}
                                asset={asset}
                                onOpenModalTab={handleOpenOrderOnTab}
                                canViewFinancials={canViewFinancials}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>
                Página {currentPage} de {totalPages} ({filteredOrders.length} demandas)
              </span>
              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View: Kanban Mode */}
      {viewMode === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4 min-w-full custom-scrollbar">
          {statuses.map((st, colIdx) => {
            const columnOrders = filteredOrders.filter(
              (o) => resolveStatusKey(o.status, statuses) === st.id
            );
            const isDragOver = dragOverColumnId === st.id;

            return (
              <div
                key={st.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverColumnId !== st.id) setDragOverColumnId(st.id);
                }}
                onDragLeave={() => {
                  if (dragOverColumnId === st.id) setDragOverColumnId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverColumnId(null);
                  const droppedId = e.dataTransfer.getData('text/plain');
                  if (droppedId) {
                    handleUpdateOrderStatusById(droppedId, st.id);
                  }
                }}
                className={`bg-[#121826] border rounded-xl p-3 flex flex-col min-w-[270px] flex-1 max-w-[340px] shrink-0 transition-all ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-950/20 shadow-lg ring-1 ring-blue-500'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        STATUS_COLOR_THEMES[st.color]?.dotColor || 'bg-blue-400'
                      }`}
                    />
                    <span
                      className="text-xs font-bold text-slate-200 uppercase tracking-tight truncate"
                      title={st.description || st.name}
                    >
                      {st.name}
                    </span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold shrink-0">
                    {columnOrders.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto max-h-[600px] custom-scrollbar pr-0.5">
                  {columnOrders.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-[11px] border border-dashed border-slate-800/80 rounded-lg">
                      Arraste ou mova OSs para cá
                    </div>
                  ) : (
                    columnOrders.map((o) => {
                      const activeTime = getActiveTimeInfo(o);
                      const planning = getPlanningSummary(o);

                      return (
                        <div
                          key={o.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', o.id);
                          }}
                          onClick={() => handleOpenOrderOnTab(o, 'overview')}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/60 cursor-grab active:cursor-grabbing transition-all space-y-1.5 text-xs group hover:shadow-md"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold text-blue-400">
                              {o.orderNumber}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                PRIORITY_LABELS[o.priority]?.color
                              }`}
                            >
                              {o.priority}
                            </span>
                          </div>

                          <p className="font-semibold text-slate-100 text-[11px] line-clamp-2 leading-snug">
                            {o.title}
                          </p>

                          {/* Tempo Ativo & SLA Badge in card */}
                          <div className="flex items-center justify-between text-[10px] pt-0.5">
                            <span className="font-mono font-bold text-slate-200 flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-blue-400" />
                              <span>{activeTime.durationText}</span>
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[8px] font-semibold border ${activeTime.slaBadgeColor}`}
                            >
                              {activeTime.slaLabel}
                            </span>
                          </div>

                          {/* Planning & Discussion chips */}
                          <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-800/60">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrderOnTab(o, 'planning');
                              }}
                              className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-blue-300 font-mono cursor-pointer"
                              title="Ver planejamento"
                            >
                              🔧 {planning.servicesDone}/{planning.servicesCount} • 📦 {planning.partsApplied}/{planning.partsCount}
                            </span>

                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOrderOnTab(o, 'discussion');
                              }}
                              className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold cursor-pointer flex items-center space-x-1"
                              title="Abrir diálogo operacional"
                            >
                              <MessageSquare className="w-2.5 h-2.5 text-blue-400" />
                              <span>{o.messageCount || 0}</span>
                              {(o.pendingQuestionCount || 0) > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                            <span className="truncate max-w-[120px]">
                              {o.assignedTeam || 'Sem equipe'}
                            </span>
                            {o.isRework && (
                              <span className="text-amber-400 font-bold shrink-0">Retrabalho</span>
                            )}
                          </div>

                        {/* Quick Status Shift Bar */}
                        <div
                          className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[10px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center space-x-1">
                            {colIdx > 0 && (
                              <button
                                type="button"
                                title={`Mover para ${statuses[colIdx - 1]?.name}`}
                                onClick={() =>
                                  handleUpdateOrderStatus(o, statuses[colIdx - 1].id)
                                }
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                            {colIdx < statuses.length - 1 && (
                              <button
                                type="button"
                                title={`Avançar para ${statuses[colIdx + 1]?.name}`}
                                onClick={() =>
                                  handleUpdateOrderStatus(o, statuses[colIdx + 1].id)
                                }
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <select
                            value={st.id}
                            onChange={(e) => handleUpdateOrderStatus(o, e.target.value)}
                            className="bg-slate-800 border border-slate-700 text-[9px] text-slate-300 rounded px-1.5 py-0.5 cursor-pointer outline-none"
                            title="Mover diretamente para qualquer estado"
                          >
                            <option disabled value={st.id}>
                              Mover para...
                            </option>
                            {statuses.map((targetSt) => (
                              <option key={targetSt.id} value={targetSt.id}>
                                {targetSt.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Work Order */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Criar Nova Ordem de Serviço</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Identificador / Número *</label>
                  <input
                    type="text"
                    required
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Estado Inicial *</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    {statuses.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} {st.isInitial ? '(Padrão)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Tipo de Demanda *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as WorkOrderType)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Prioridade *</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as WorkOrderPriority)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica / Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Título da Demanda / OS *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Revisão Periódica dos Sistemas de Climatização"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição Detalhada *</label>
                <textarea
                  rows={3}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descreva as tarefas e procedimentos a serem executados..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Rework Option */}
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsRework}
                    onChange={(e) => setFormIsRework(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span className="font-semibold text-slate-200">Demanda classificada como Retrabalho</span>
                </label>
                {formIsRework && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Motivo do Retrabalho *</label>
                    <input
                      type="text"
                      required={formIsRework}
                      value={formReworkReason}
                      onChange={(e) => setFormReworkReason(e.target.value)}
                      placeholder="Ex: Falha recorrente em vedação ou ajuste de montagem anterior"
                      className="w-full px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Unidade</label>
                  <select
                    value={formUnitId}
                    onChange={(e) => setFormUnitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Contrato</label>
                  <select
                    value={formContractId}
                    onChange={(e) => setFormContractId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Nenhum contrato vinculado</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Ativo / Equipamento</label>
                  <select
                    value={formAssetId}
                    onChange={(e) => setFormAssetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Geral / Sem ativo específico</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tag} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Centro de Custo</label>
                  <select
                    value={formCostCenterId}
                    onChange={(e) => setFormCostCenterId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Geral / Sem centro de custo</option>
                    {costCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} - {cc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Serviço Específico</label>
                  <input
                    type="text"
                    value={formSpecificService}
                    onChange={(e) => setFormSpecificService(e.target.value)}
                    placeholder="Ex: Calibração técnica de sensores"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Equipe Responsável</label>
                  <select
                    value={formAssignedTeam}
                    onChange={(e) => setFormAssignedTeam(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Não atribuído</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Responsável Individual</label>
                  <input
                    type="text"
                    value={formAssignedTo}
                    onChange={(e) => setFormAssignedTo(e.target.value)}
                    placeholder="Ex: Roberto Silva"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Checklist Modelo</label>
                  <input
                    type="text"
                    value={formChecklistTemplate}
                    onChange={(e) => setFormChecklistTemplate(e.target.value)}
                    placeholder="Ex: Vistoria Elétrica Padrão"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Previsão de Início</label>
                  <input
                    type="date"
                    value={formScheduledStart}
                    onChange={(e) => setFormScheduledStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Horas Previstas</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formEstimatedHours}
                    onChange={(e) => setFormEstimatedHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {canViewFinancials && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Custo Estimado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formEstimatedCost}
                    onChange={(e) => setFormEstimatedCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-300 mb-1">Observações Operacionais</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Informações adicionais de segurança, ferramentas necessárias..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Ordem de Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Order Comprehensive Details & Operations Hub */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[94vh] overflow-hidden p-0 shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between gap-3 shrink-0">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-base font-extrabold text-blue-400">
                    {selectedOrder.orderNumber}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusBadgeStyle(
                      selectedOrder.status,
                      statuses
                    )}`}
                  >
                    {getStatusConfig(selectedOrder.status, statuses).name}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      PRIORITY_LABELS[selectedOrder.priority]?.color
                    }`}
                  >
                    {selectedOrder.priority}
                  </span>
                  {selectedOrder.orderType && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                      {TYPE_LABELS[selectedOrder.orderType]}
                    </span>
                  )}
                  {selectedOrder.isRework && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                      RETRABALHO
                    </span>
                  )}
                  {/* Active Time Highlight in Header */}
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-800/50 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>Tempo Ativo: {getActiveTimeInfo(selectedOrder).durationText}</span>
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">{selectedOrder.title}</h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tab Navigation Bar */}
            <div className="flex items-center px-4 sm:px-5 pt-2 bg-slate-950 border-b border-slate-800 overflow-x-auto custom-scrollbar gap-1 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setActiveModalTab('overview')}
                className={`px-3 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
                  activeModalTab === 'overview'
                    ? 'border-blue-500 text-blue-400 bg-slate-900/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Visão Geral & Tempo Ativo</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('execution')}
                className={`px-3 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer relative ${
                  activeModalTab === 'execution'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Execução & Campo</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-slate-800 text-emerald-300 border border-slate-700">
                  {selectedOrder.executionChecklist ? `${selectedOrder.executionChecklist.filter(c => c.status === 'concluido').length}/6` : '0/6'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('discussion')}
                className={`px-3 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer relative ${
                  activeModalTab === 'discussion'
                    ? 'border-blue-500 text-blue-400 bg-slate-900/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Diálogo & Conversa</span>
                {(selectedOrder.pendingQuestionCount || 0) > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-black animate-pulse">
                    {selectedOrder.pendingQuestionCount} dúvida
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-800 text-slate-300">
                    {selectedOrder.messageCount || 0}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('planning')}
                className={`px-3 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
                  activeModalTab === 'planning'
                    ? 'border-blue-500 text-blue-400 bg-slate-900/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Planejamento (Serviços, Mão de Obra, Peças)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {getPlanningSummary(selectedOrder).overallProgressPercent}%
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('timeline')}
                className={`px-3 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
                  activeModalTab === 'timeline'
                    ? 'border-blue-500 text-blue-400 bg-slate-900/60 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Linha do Tempo ({orderEvents.length})</span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {activeModalTab === 'overview' && (
                <OrderOverviewTab
                  order={selectedOrder}
                  statuses={statuses}
                  statusChangeNote={statusChangeNote}
                  setStatusChangeNote={setStatusChangeNote}
                  onUpdateStatus={handleUpdateOrderStatus}
                  onOpenStatusConfig={() => setShowStatusConfigModal(true)}
                  canViewFinancials={canViewFinancials}
                  onNavigateTab={(tab) => setActiveModalTab(tab)}
                  asset={assets.find((a) => a.id === selectedOrder.assetId)}
                />
              )}

              {activeModalTab === 'execution' && organization && user && (
                <OrderExecutionHubTab
                  order={selectedOrder}
                  organizationId={organization.id}
                  currentUser={user}
                  onOrderUpdated={(upd) =>
                    setSelectedOrder((prev) => (prev ? { ...prev, ...upd } : null))
                  }
                  onOpenReportModal={() => setShowReportModal(true)}
                  canApprove={true}
                />
              )}

              {activeModalTab === 'discussion' && organization && user && (
                <OrderDiscussionTab
                  order={selectedOrder}
                  organizationId={organization.id}
                  currentUser={user}
                  currentUserRole={role}
                  logAudit={logAudit}
                  onOrderUpdated={(upd) =>
                    setSelectedOrder((prev) => (prev ? { ...prev, ...upd } : null))
                  }
                />
              )}

              {activeModalTab === 'planning' && organization && user && (
                <OrderPlanningTab
                  order={selectedOrder}
                  organizationId={organization.id}
                  currentUser={user}
                  canViewFinancials={canViewFinancials}
                  availableItems={stockItems}
                  logAudit={logAudit}
                  onOrderUpdated={(upd) =>
                    setSelectedOrder((prev) => (prev ? { ...prev, ...upd } : null))
                  }
                />
              )}

              {activeModalTab === 'timeline' && (
                <OrderTimelineTab
                  events={orderEvents}
                  statuses={statuses}
                  orderCreatedAt={selectedOrder.createdAt}
                />
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                OS criada em {new Date(selectedOrder.createdAt).toLocaleDateString('pt-BR')} por{' '}
                <strong className="text-slate-400">{selectedOrder.requesterName}</strong>
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold cursor-pointer transition-colors"
                  title="Emitir ordem de serviço formatada para impressão ou PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Emitir Relatório de OS (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Relatório Técnico de OS (Impressão / PDF) */}
      {showReportModal && selectedOrder && (
        <OrderTechnicalReportModal
          order={selectedOrder}
          asset={assets.find((a) => a.id === selectedOrder.assetId)}
          statuses={statuses}
          onClose={() => setShowReportModal(false)}
          canViewFinancials={canViewFinancials}
        />
      )}

      {/* Modal: Status Configuration & Pipeline Management */}
      {showStatusConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-5 h-5 text-blue-400" />
                    <h3 className="text-base font-bold text-white">
                      Configuração de Estados Operacionais da OS
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Personalize as etapas operacionais da sua organização (Ex: Aberto, Em Execução, Aguardando Peças, Concluído, Validado). A esteira Kanban, filtros e transições se adaptam dinamicamente.
                  </p>
                </div>
                <button
                  onClick={() => setShowStatusConfigModal(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80">
                <button
                  type="button"
                  onClick={handleOpenAddStatus}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Novo Estado</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetDefaultStatuses}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                  title="Restaurar Aberto, Em Execução, Aguardando Peças, Concluído, Validado"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restaurar Padrão Operacional</span>
                </button>
              </div>

              {/* Statuses List */}
              <div className="mt-4 space-y-2.5">
                {statuses.map((st, idx) => {
                  const theme = STATUS_COLOR_THEMES[st.color] || STATUS_COLOR_THEMES.blue;
                  const inUse = orders.filter((o) => resolveStatusKey(o.status, statuses) === st.id).length;

                  return (
                    <div
                      key={st.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        {/* Reorder Buttons */}
                        <div className="flex flex-col space-y-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleReorderStatus(st.id, 'up')}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Subir posição na esteira"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === statuses.length - 1}
                            onClick={() => handleReorderStatus(st.id, 'down')}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                            title="Descer posição na esteira"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Order pill */}
                        <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>

                        {/* Status Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder || 'border border-slate-700'}`}>
                              {st.name}
                            </span>
                            {st.isInitial && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                                Estado Inicial
                              </span>
                            )}
                            {st.isCompleted && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                Conclusão
                              </span>
                            )}
                            {st.requiresNotes && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                                Exige Apontamento
                              </span>
                            )}
                          </div>
                          {st.description && (
                            <p className="text-[11px] text-slate-400 truncate max-w-md">
                              {st.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right metadata & actions */}
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <span className="px-2 py-1 rounded bg-slate-950 text-[10px] text-slate-400 border border-slate-800 font-mono">
                          {inUse} OS(s) ativa(s)
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenEditStatus(st)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold cursor-pointer flex items-center space-x-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar</span>
                        </button>

                        <button
                          type="button"
                          disabled={statuses.length <= 2}
                          onClick={() => handleDeleteStatus(st.id)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 disabled:opacity-30 cursor-pointer"
                          title="Excluir este estado"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStatusConfigModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Concluir & Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add or Edit Status */}
      {showStatusFormModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white flex items-center space-x-1.5">
                <Tag className="w-4 h-4 text-blue-400" />
                <span>{editingStatus ? 'Editar Estado Operacional' : 'Novo Estado Operacional'}</span>
              </h4>
              <button
                onClick={() => setShowStatusFormModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStatus} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Nome do Estado * (Ex: Aguardando Peças, Concluído, Validado)
                </label>
                <input
                  type="text"
                  required
                  value={statusFormName}
                  onChange={(e) => setStatusFormName(e.target.value)}
                  placeholder="Ex: Aguardando Liberação de Área"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Descrição Operacional
                </label>
                <textarea
                  rows={2}
                  value={statusFormDescription}
                  onChange={(e) => setStatusFormDescription(e.target.value)}
                  placeholder="Descreva quando as ordens de serviço devem estar nesta etapa..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block font-medium text-slate-300 mb-2">
                  Cor / Identidade Visual
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(STATUS_COLOR_THEMES).map(([colorKey, theme]) => {
                    const isSelected = statusFormColor === colorKey;
                    return (
                      <button
                        type="button"
                        key={colorKey}
                        onClick={() => setStatusFormColor(colorKey)}
                        className={`p-2 rounded-lg border text-left flex items-center space-x-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500'
                            : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full ${theme.dotColor}`} />
                        <span className="text-[11px] text-slate-300 truncate">{theme.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Preview */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Pré-visualização do Badge:</span>
                <span
                  className={`px-3 py-1 rounded text-xs font-semibold ${
                    STATUS_COLOR_THEMES[statusFormColor]?.badgeBg || 'bg-slate-800'
                  } ${
                    STATUS_COLOR_THEMES[statusFormColor]?.badgeText || 'text-slate-200'
                  } ${STATUS_COLOR_THEMES[statusFormColor]?.badgeBorder || 'border border-slate-700'}`}
                >
                  {statusFormName.trim() || 'Exemplo de Estado'}
                </span>
              </div>

              {/* Configuration Toggles */}
              <div className="space-y-2.5 pt-1 border-t border-slate-800">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statusFormIsInitial}
                    onChange={(e) => setStatusFormIsInitial(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    Definir como <strong>Estado Inicial</strong> (aplicado automaticamente em novas OSs)
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statusFormIsCompleted}
                    onChange={(e) => setStatusFormIsCompleted(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    Marcar como <strong>Estado Final / Concluído</strong> (registra data real de término)
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statusFormRequiresNotes}
                    onChange={(e) => setStatusFormRequiresNotes(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    Exigir <strong>apontamento / justificativa</strong> ao transitar para este estado
                  </span>
                </label>
              </div>

              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStatusFormModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md cursor-pointer"
                >
                  Salvar Estado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
