import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { WorkOrder, Asset, Unit, WorkOrderType, WorkOrderPriority } from '../../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Filter,
  Columns,
  Check,
  X,
  Calendar,
  Layers,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Eye,
} from 'lucide-react';

interface OperationalExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: WorkOrder[];
  assets: Asset[];
  units: Unit[];
}

export interface ColumnDef {
  id: string;
  label: string;
  defaultSelected: boolean;
  getValue: (order: WorkOrder, assets: Asset[], units: Unit[]) => string | number;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    id: 'orderNumber',
    label: 'Nº OS',
    defaultSelected: true,
    getValue: (o) => o.orderNumber || 'OS',
  },
  {
    id: 'title',
    label: 'Título da Demanda',
    defaultSelected: true,
    getValue: (o) => o.title || '',
  },
  {
    id: 'orderType',
    label: 'Tipo',
    defaultSelected: true,
    getValue: (o) => {
      const types: Record<string, string> = {
        preventiva: 'Preventiva',
        corretiva: 'Corretiva',
        emergencial: 'Emergencial',
        solicitacao: 'Solicitação',
        inspecao: 'Inspeção',
        instalacao: 'Instalação',
        atendimento: 'Atendimento',
        outros: 'Outros',
      };
      return o.orderType ? types[o.orderType] || o.orderType : 'Geral';
    },
  },
  {
    id: 'priority',
    label: 'Prioridade',
    defaultSelected: true,
    getValue: (o) => {
      const p: Record<string, string> = {
        baixa: 'Baixa',
        media: 'Média',
        alta: 'Alta',
        critica: 'Crítica',
      };
      return p[o.priority] || o.priority;
    },
  },
  {
    id: 'status',
    label: 'Status Operacional',
    defaultSelected: true,
    getValue: (o) => {
      const s: Record<string, string> = {
        aberto: 'Aberto',
        em_execucao: 'Em Execução',
        aguardando_pecas: 'Aguardando Peças',
        concluido: 'Concluído',
        concluida: 'Concluído',
        validado: 'Validado',
        encerrada: 'Validado',
        planejada: 'Planejada',
      };
      return s[o.status] || o.status;
    },
  },
  {
    id: 'asset',
    label: 'Equipamento / Tag',
    defaultSelected: true,
    getValue: (o, assets) => {
      if (!o.assetId) return '—';
      const a = assets.find((ast) => ast.id === o.assetId);
      return a ? `${a.tag} - ${a.name}` : o.assetId;
    },
  },
  {
    id: 'unit',
    label: 'Unidade Operacional',
    defaultSelected: true,
    getValue: (o, _, units) => {
      if (!o.unitId) return 'Matriz';
      const u = units.find((unt) => unt.id === o.unitId);
      return u ? `${u.name} (${u.code})` : 'Matriz';
    },
  },
  {
    id: 'team',
    label: 'Equipe Atribuída',
    defaultSelected: true,
    getValue: (o) => o.assignedTeam || 'Sem equipe',
  },
  {
    id: 'assignedTo',
    label: 'Técnico Responsável',
    defaultSelected: true,
    getValue: (o) => o.assignedTo || 'Não atribuído',
  },
  {
    id: 'startDate',
    label: 'Previsão de Início',
    defaultSelected: true,
    getValue: (o) => o.scheduledStartDate || '—',
  },
  {
    id: 'endDate',
    label: 'Previsão de Término',
    defaultSelected: false,
    getValue: (o) => o.scheduledEndDate || '—',
  },
  {
    id: 'hours',
    label: 'Horas Planejadas',
    defaultSelected: true,
    getValue: (o) => (o.estimatedHours ? `${o.estimatedHours}h` : '0h'),
  },
  {
    id: 'cost',
    label: 'Custo Estimado (R$)',
    defaultSelected: true,
    getValue: (o) => (o.estimatedCost ? o.estimatedCost.toFixed(2) : '0.00'),
  },
  {
    id: 'isRework',
    label: 'Retrabalho',
    defaultSelected: false,
    getValue: (o) => (o.isRework ? `Sim (${o.reworkReason || 'Sem motivo'})` : 'Não'),
  },
  {
    id: 'requester',
    label: 'Solicitante',
    defaultSelected: false,
    getValue: (o) => o.requesterName || 'Solicitante',
  },
];

export const OperationalExportModal: React.FC<OperationalExportModalProps> = ({
  isOpen,
  onClose,
  orders,
  assets,
  units,
}) => {
  const { organization, user, canViewFinancials } = useAuth();

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [priorityFilter, setPriorityFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [unitFilter, setUnitFilter] = useState('todas');
  const [assetFilter, setAssetFilter] = useState('todos');
  const [onlyRework, setOnlyRework] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Columns State
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() =>
    ALL_COLUMNS.filter((c) => (c.id === 'cost' ? canViewFinancials : c.defaultSelected)).map(
      (c) => c.id
    )
  );

  const [activeTab, setActiveTab] = useState<'filtros' | 'colunas' | 'previa'>('filtros');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  // Available Columns considering permissions
  const availableColumns = useMemo(() => {
    return ALL_COLUMNS.filter((c) => (c.id === 'cost' ? canViewFinancials : true));
  }, [canViewFinancials]);

  // Filtered Orders Calculation
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Date filter
      const oDate = o.scheduledStartDate || o.createdAt.split('T')[0];
      if (startDate && oDate < startDate) return false;
      if (endDate && oDate > endDate) return false;

      // Status
      if (statusFilter !== 'todos') {
        const s = o.status;
        if (statusFilter === 'concluido' && s !== 'concluido' && s !== 'concluida') return false;
        else if (statusFilter === 'validado' && s !== 'validado' && s !== 'encerrada') return false;
        else if (statusFilter !== 'concluido' && statusFilter !== 'validado' && s !== statusFilter)
          return false;
      }

      // Priority
      if (priorityFilter !== 'todos' && o.priority !== priorityFilter) return false;

      // Type
      if (typeFilter !== 'todos' && o.orderType !== typeFilter) return false;

      // Unit
      if (unitFilter !== 'todas' && o.unitId !== unitFilter) return false;

      // Asset
      if (assetFilter !== 'todos' && o.assetId !== assetFilter) return false;

      // Rework
      if (onlyRework && !o.isRework) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchNum = o.orderNumber?.toLowerCase().includes(q);
        const matchTitle = o.title?.toLowerCase().includes(q);
        const matchTeam = o.assignedTeam?.toLowerCase().includes(q);
        const matchUser = o.assignedTo?.toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchTeam && !matchUser) return false;
      }

      return true;
    });
  }, [
    orders,
    startDate,
    endDate,
    statusFilter,
    priorityFilter,
    typeFilter,
    unitFilter,
    assetFilter,
    onlyRework,
    searchTerm,
  ]);

  // Column toggle
  const toggleColumn = (colId: string) => {
    setSelectedColumnIds((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    );
  };

  const handleSelectAllColumns = () => {
    setSelectedColumnIds(availableColumns.map((c) => c.id));
  };

  const handleResetDefaultColumns = () => {
    setSelectedColumnIds(
      availableColumns.filter((c) => (c.id === 'cost' ? canViewFinancials : c.defaultSelected)).map((c) => c.id)
    );
  };

  const handleClearColumns = () => {
    setSelectedColumnIds(['orderNumber', 'title']);
  };

  // Quick Preset Filters
  const applyPreset = (preset: 'todos' | '7dias' | '30dias' | 'mes' | 'corretivas' | 'rework') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'todos') {
      setStartDate('');
      setEndDate('');
      setStatusFilter('todos');
      setTypeFilter('todos');
      setOnlyRework(false);
    } else if (preset === '7dias') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === '30dias') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setStartDate(past.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'mes') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'corretivas') {
      setTypeFilter('corretiva');
    } else if (preset === 'rework') {
      setOnlyRework(true);
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      alert('Nenhuma ordem de serviço corresponde aos filtros selecionados.');
      return;
    }
    if (selectedColumnIds.length === 0) {
      alert('Selecione pelo menos uma coluna para exportar.');
      return;
    }

    setExporting('excel');

    try {
      const activeCols = availableColumns.filter((c) => selectedColumnIds.includes(c.id));

      // Build data rows
      const dataRows = filteredOrders.map((o) => {
        const row: Record<string, string | number> = {};
        activeCols.forEach((col) => {
          row[col.label] = col.getValue(o, assets, units);
        });
        return row;
      });

      // Create Worksheet
      const ws = XLSX.utils.json_to_sheet(dataRows);

      // Set nice column widths
      const colWidths = activeCols.map((col) => {
        const maxValLen = Math.max(
          col.label.length,
          ...dataRows.map((r) => String(r[col.label] || '').length)
        );
        return { wch: Math.min(40, Math.max(12, maxValLen + 2)) };
      });
      ws['!cols'] = colWidths;

      // Create Workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Performance_Operacional');

      // Add Metadata sheet
      const metaRows = [
        { Propriedade: 'Organização', Valor: organization?.name || 'Aguero Inox' },
        { Propriedade: 'Data de Emissão', Valor: new Date().toLocaleString('pt-BR') },
        { Propriedade: 'Emitido por', Valor: user?.displayName || user?.email || 'Usuário' },
        { Propriedade: 'Total de Demandas', Valor: filteredOrders.length },
        {
          Propriedade: 'Custo Total Estimado',
          Valor: `R$ ${filteredOrders
            .reduce((acc, o) => acc + (o.estimatedCost || 0), 0)
            .toFixed(2)}`,
        },
      ];
      const wsMeta = XLSX.utils.json_to_sheet(metaRows);
      XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadados');

      // Trigger download
      const filename = `relatorio_performance_${organization?.slug || 'agueroflow'}_${
        new Date().toISOString().split('T')[0]
      }.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Erro ao gerar Excel:', err);
      alert('Falha ao gerar arquivo Excel.');
    } finally {
      setExporting(null);
    }
  };

  // Export to PDF (.pdf)
  const handleExportPDF = () => {
    if (filteredOrders.length === 0) {
      alert('Nenhuma ordem de serviço corresponde aos filtros selecionados.');
      return;
    }
    if (selectedColumnIds.length === 0) {
      alert('Selecione pelo menos uma coluna para exportar.');
      return;
    }

    setExporting('pdf');

    try {
      const activeCols = availableColumns.filter((c) => selectedColumnIds.includes(c.id));
      const isLandscape = activeCols.length > 5;

      const doc = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      // Top Header Industrial Bar
      doc.setFillColor(18, 24, 38); // #121826
      doc.rect(0, 0, pageWidth, 26, 'F');

      // Title & Company
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(
        `${organization?.name || 'AGUERO INOX'} — Relatório de Performance Operacional`,
        14,
        12
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Emissão: ${new Date().toLocaleString('pt-BR')} • Demandas Filtradas: ${
          filteredOrders.length
        } OS • AgueroFlow Gestão`,
        14,
        19
      );

      // Executive Summary KPIs Box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(14, 30, pageWidth - 28, 14, 2, 2, 'FD');

      const totalCost = filteredOrders.reduce((acc, o) => acc + (o.estimatedCost || 0), 0);
      const concluidas = filteredOrders.filter(
        (o) => o.status === 'concluido' || o.status === 'concluida' || o.status === 'validado'
      ).length;

      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(
        `Total de OS: ${filteredOrders.length}   |   Concluídas: ${concluidas} (${
          filteredOrders.length > 0 ? Math.round((concluidas / filteredOrders.length) * 100) : 0
        }%)   |   Custo Acumulado: R$ ${totalCost.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
        })}`,
        18,
        39
      );

      // Table Data
      const head = [activeCols.map((c) => c.label)];
      const body = filteredOrders.map((o) =>
        activeCols.map((c) => String(c.getValue(o, assets, units)))
      );

      autoTable(doc, {
        head,
        body,
        startY: 48,
        margin: { left: 14, right: 14, bottom: 18 },
        styles: {
          fontSize: activeCols.length > 8 ? 7 : 8,
          cellPadding: 2,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [15, 23, 42], // slate-900
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        didDrawPage: (data) => {
          // Footer with Page Numbers
          const pageCount = doc.internal.pages.length - 1;
          const pageCurrent = data.pageNumber;
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Página ${pageCurrent} de ${pageCount} — Aguero Inox Industrial`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
          );
        },
      });

      // Save PDF
      const filename = `relatorio_performance_${organization?.slug || 'agueroflow'}_${
        new Date().toISOString().split('T')[0]
      }.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Falha ao gerar arquivo PDF.');
    } finally {
      setExporting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#121826] border border-slate-700/80 rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col text-slate-100 max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-[#0F1422]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Exportador Avançado de Performance Operacional</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  PDF & Excel
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Exporte ordens de serviço e indicadores com filtros multicritério e seleção personalizada de colunas.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between px-5 pt-3 border-b border-slate-800 bg-slate-900/60 text-xs font-semibold">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('filtros')}
              className={`pb-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
                activeTab === 'filtros'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>1. Filtros Avançados</span>
            </button>
            <button
              onClick={() => setActiveTab('colunas')}
              className={`pb-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
                activeTab === 'colunas'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>2. Colunas ({selectedColumnIds.length}/{availableColumns.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('previa')}
              className={`pb-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
                activeTab === 'previa'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3. Pré-visualização ({filteredOrders.length} OS)</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            {filteredOrders.length} registro(s) selecionado(s)
          </span>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-xs">
          {/* TAB 1: FILTROS AVANÇADOS */}
          {activeTab === 'filtros' && (
            <div className="space-y-4">
              {/* Quick Presets */}
              <div>
                <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block mb-2">
                  Atalhos de Período & Escopo:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('todos')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Todo o Histórico
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('7dias')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Últimos 7 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('30dias')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Últimos 30 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('mes')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Este Mês
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('corretivas')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Apenas Corretivas
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('rework')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold"
                  >
                    Apenas Retrabalhos
                  </button>
                </div>
              </div>

              {/* Filters Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-2">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Data Inicial</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Data Final</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Status Operacional</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="todos">Todos os Status</option>
                    <option value="aberto">Aberto</option>
                    <option value="em_execucao">Em Execução</option>
                    <option value="aguardando_pecas">Aguardando Peças</option>
                    <option value="concluido">Concluído</option>
                    <option value="validado">Validado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Tipo de Demanda</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="todos">Todos os Tipos</option>
                    <option value="preventiva">Preventiva</option>
                    <option value="corretiva">Corretiva</option>
                    <option value="emergencial">Emergencial</option>
                    <option value="solicitacao">Solicitação</option>
                    <option value="inspecao">Inspeção / Vistoria</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Prioridade</label>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="todos">Todas as Prioridades</option>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica / Urgente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Equipamento / Ativo</label>
                  <select
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="todos">Todos os Equipamentos</option>
                    {assets.map((ast) => (
                      <option key={ast.id} value={ast.id}>
                        {ast.tag} - {ast.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Unidade Operacional</label>
                  <select
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="todas">Todas as Unidades</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1 font-semibold">Busca Textual</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar por código de OS, título, equipe ou responsável..."
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="pt-2 flex items-center space-x-4 border-t border-slate-800">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyRework}
                    onChange={(e) => setOnlyRework(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span className="font-semibold text-slate-300">
                    Isolar apenas demandas classificadas como Retrabalho
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONALIZAÇÃO DE COLUNAS */}
          {activeTab === 'colunas' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <p className="text-slate-400 text-xs">
                  Marque ou desmarque as colunas que devem constar no relatório exportado (PDF / Excel):
                </p>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSelectAllColumns}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Selecionar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefaultColumns}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Padrão
                  </button>
                  <button
                    type="button"
                    onClick={handleClearColumns}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs cursor-pointer"
                  >
                    Mínimo
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {availableColumns.map((col) => {
                  const isChecked = selectedColumnIds.includes(col.id);
                  return (
                    <label
                      key={col.id}
                      onClick={() => toggleColumn(col.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-950/40 border-blue-500/80 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="font-semibold">{col.label}</span>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isChecked
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-slate-700 bg-slate-900'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PRÉ-VISUALIZAÇÃO */}
          {activeTab === 'previa' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-semibold">
                  Amostra dos dados filtrados com as {selectedColumnIds.length} colunas selecionadas:
                </span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {filteredOrders.length} ordens de serviço
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-[380px] custom-scrollbar bg-slate-900/50">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-bold sticky top-0">
                      {availableColumns
                        .filter((c) => selectedColumnIds.includes(c.id))
                        .map((c) => (
                          <th key={c.id} className="py-2.5 px-3 whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td
                          colSpan={selectedColumnIds.length || 1}
                          className="text-center py-8 text-slate-500"
                        >
                          Nenhum registro encontrado para os filtros atuais.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.slice(0, 20).map((o) => (
                        <tr key={o.id} className="hover:bg-slate-800/40">
                          {availableColumns
                            .filter((c) => selectedColumnIds.includes(c.id))
                            .map((c) => (
                              <td
                                key={c.id}
                                className="py-2 px-3 text-slate-300 whitespace-nowrap max-w-xs truncate"
                              >
                                {String(c.getValue(o, assets, units))}
                              </td>
                            ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {filteredOrders.length > 20 && (
                <p className="text-right text-[10px] text-slate-500 italic">
                  * Exibindo primeiras 20 linhas na pré-visualização. A exportação conterá todas as {filteredOrders.length} ordens.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#0E1424] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <span className="font-bold text-white">{filteredOrders.length}</span>
            <span>OS prontas para exportação</span>
            <span>•</span>
            <span className="font-bold text-white">{selectedColumnIds.length}</span>
            <span>colunas</span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold cursor-pointer text-xs"
            >
              Cancelar
            </button>

            {/* Export PDF Button */}
            <button
              type="button"
              disabled={exporting !== null || filteredOrders.length === 0}
              onClick={handleExportPDF}
              className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold cursor-pointer text-xs shadow-md disabled:opacity-50 transition-all"
            >
              <FileText className="w-4 h-4" />
              <span>{exporting === 'pdf' ? 'Gerando PDF...' : 'Exportar PDF'}</span>
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              disabled={exporting !== null || filteredOrders.length === 0}
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer text-xs shadow-md disabled:opacity-50 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{exporting === 'excel' ? 'Gerando Excel...' : 'Exportar Excel'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
