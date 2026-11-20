import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  CheckCircle2,
  Database,
  Download,
  FileDown,
  FileSpreadsheet,
  History,
  MessageSquare,
  MessageSquareOff,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  WhatsAppManagedContact,
  WhatsAppOcrDashboardResponse,
  WhatsAppOcrReceiptItem,
} from '../../types/whatsappComposio';
import {
  createManualOcrReceipt,
  restoreOcrReceiptsToServer,
  toggleWhatsAppContactOcr,
  triggerWhatsAppBridgeCatchUp,
  updateOcrReceipt,
  updateOcrReceiptStatus,
} from '../../services/composioWhatsAppClient';

interface WhatsAppOcrDashboardTabProps {
  userName: string;
  dashboard: WhatsAppOcrDashboardResponse | null;
  includeHistory: boolean;
  vaultStatus?: string;
  onToggleIncludeHistory: (includeAll: boolean) => void;
  onRefresh: () => Promise<void>;
  onGoToContacts: () => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}

const OCR_CATEGORIES = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'combustivel', label: 'Combustível' },
  { value: 'hospedagem', label: 'Hospedagem' },
  { value: 'pedagio', label: 'Pedágio' },
  { value: 'transporte', label: 'Transporte / Uber' },
  { value: 'materiais_emergenciais', label: 'Materiais Emergenciais' },
  { value: 'farmacia', label: 'Farmácia / Saúde' },
  { value: 'nota_debito', label: 'Nota de Débito (ND)' },
  { value: 'outros', label: 'Outros' },
];

const categoryLabelMap: Record<string, string> = Object.fromEntries(
  OCR_CATEGORIES.map((c) => [c.value, c.label])
);

const formatBRL = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const formatReceivedAtBr = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

const formatReceiptDateBr = (dateStr?: string) => {
  if (!dateStr) return '—';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateStr;
};

interface EditFormState {
  id?: string;
  receiptDate: string;
  establishmentName: string;
  cnpj: string;
  category: string;
  totalAmount: string;
  employeeName: string;
  workOrderNumber: string;
  sourceChatJid: string;
  sourceGroupName: string;
  status: string;
  notes: string;
}

export const WhatsAppOcrDashboardTab: React.FC<WhatsAppOcrDashboardTabProps> = ({
  userName,
  dashboard,
  includeHistory,
  vaultStatus,
  onToggleIncludeHistory,
  onRefresh,
  onGoToContacts,
  onToast,
}) => {
  const [channelFilter, setChannelFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyReceiptId, setBusyReceiptId] = useState<string | null>(null);
  const [busyChannelId, setBusyChannelId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncWindow, setSyncWindow] = useState<
    'since_disconnect' | '2h' | '6h' | 'today' | '24h'
  >('since_disconnect');

  // Edit / Create Modal state
  const [modalMode, setModalMode] = useState<'edit' | 'create' | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<WhatsAppOcrReceiptItem | null>(null);
  const [formState, setFormState] = useState<EditFormState>({
    receiptDate: new Date().toISOString().slice(0, 10),
    establishmentName: '',
    cnpj: '',
    category: 'alimentacao',
    totalAmount: '',
    employeeName: '',
    workOrderNumber: '',
    sourceChatJid: '',
    sourceGroupName: '',
    status: 'pendente',
    notes: '',
  });
  const [isSavingForm, setIsSavingForm] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const enabledChannels = dashboard?.enabledChannels || [];
  const receipts = dashboard?.receipts || [];
  const allHistoricalCount = dashboard?.allHistoricalCount ?? receipts.length;
  const summary = dashboard?.summary || {
    totalCount: 0,
    totalAmount: 0,
    pendingCount: 0,
    approvedCount: 0,
    avgConfidence: 0,
    activeChannelsCount: 0,
  };
  const byCategory = dashboard?.byCategory || [];
  const byChannel = dashboard?.byChannel || [];

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts.filter((r) => {
      if (statusFilter !== 'todos' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'todos' && String(r.category || '').toLowerCase() !== categoryFilter) {
        return false;
      }
      if (channelFilter !== 'todos') {
        const key = r.sourceChatJid || r.employeePhone;
        if (key !== channelFilter) return false;
      }
      if (q) {
        const haystack = [
          r.establishmentName,
          r.employeeName,
          r.sourceGroupName,
          r.cnpj,
          r.workOrderNumber,
          r.notes,
          r.category,
          r.receiptDate,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [receipts, channelFilter, statusFilter, categoryFilter, searchQuery]);

  const filteredTotalAmount = useMemo(
    () => filteredReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0),
    [filteredReceipts]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const catchUpOptions =
        syncWindow === 'since_disconnect'
          ? { mode: 'since_disconnect' as const }
          : syncWindow === 'today'
          ? { mode: 'today' as const }
          : syncWindow === '2h'
          ? { mode: 'hours' as const, lookbackHours: 2 }
          : syncWindow === '6h'
          ? { mode: 'hours' as const, lookbackHours: 6 }
          : { mode: 'hours' as const, lookbackHours: 24 };

      const catchUpRes = await triggerWhatsAppBridgeCatchUp(catchUpOptions).catch(() => null);
      await onRefresh();
      if (catchUpRes?.success) {
        if ((catchUpRes.sweep?.newReceiptsCount || 0) > 0) {
          onToast(
            'success',
            catchUpRes.message ||
              `Varredura concluída: ${catchUpRes.sweep?.newReceiptsCount} nova(s) imagem(ns) lida(s) pelo OCR!`
          );
        } else if (catchUpRes.reconnecting) {
          onToast('success', catchUpRes.message || 'Reconectando WhatsApp e varrendo imagens pendentes...');
        } else if (catchUpRes.message) {
          onToast('success', catchUpRes.message);
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStatusChange = async (
    receiptId: string,
    nextStatus: 'aprovado' | 'rejeitado'
  ) => {
    setBusyReceiptId(receiptId);
    try {
      const res = await updateOcrReceiptStatus(receiptId, nextStatus);
      if (res.success) {
        await onRefresh();
        onToast(
          'success',
          nextStatus === 'aprovado'
            ? 'Leitura OCR aprovada com sucesso.'
            : 'Leitura OCR marcada como rejeitada.'
        );
      } else {
        onToast('error', res.error || 'Erro ao atualizar status do comprovante.');
      }
    } finally {
      setBusyReceiptId(null);
    }
  };

  const handleToggleChannelAutoReply = async (ch: WhatsAppManagedContact) => {
    setBusyChannelId(ch.id);
    try {
      const nextReply = !(ch.ocrAutoReply === true);
      const res = await toggleWhatsAppContactOcr({
        id: ch.id,
        jidOrPhone: ch.jidOrPhone,
        name: ch.name,
        isGroup: ch.isGroup,
        ocrEnabled: true,
        ocrAutoReply: nextReply,
      });
      if (res.success) {
        await onRefresh();
        onToast(
          'success',
          nextReply
            ? `Resposta de leitura OCR ativada no grupo "${ch.name}".`
            : `Modo silencioso ativado para "${ch.name}" (OCR lê sem enviar mensagem no grupo).`
        );
      } else {
        onToast('error', res.error || 'Erro ao alterar confirmação no grupo.');
      }
    } finally {
      setBusyChannelId(null);
    }
  };

  const openEditModal = (rec: WhatsAppOcrReceiptItem) => {
    setEditingReceipt(rec);
    setModalMode('edit');
    setFormState({
      id: rec.id,
      receiptDate: rec.receiptDate || new Date().toISOString().slice(0, 10),
      establishmentName: rec.establishmentName || '',
      cnpj: rec.cnpj || '',
      category: String(rec.category || 'outros').toLowerCase(),
      totalAmount: String(rec.totalAmount ?? 0),
      employeeName: rec.employeeName || '',
      workOrderNumber: rec.workOrderNumber || '',
      sourceChatJid: rec.sourceChatJid || '',
      sourceGroupName: rec.sourceGroupName || '',
      status: rec.status || 'pendente',
      notes: rec.notes || '',
    });
  };

  const openCreateModal = () => {
    setEditingReceipt(null);
    setModalMode('create');
    const firstChannel = enabledChannels[0];
    setFormState({
      receiptDate: new Date().toISOString().slice(0, 10),
      establishmentName: '',
      cnpj: '',
      category: 'nota_debito',
      totalAmount: '',
      employeeName: userName || '',
      workOrderNumber: '',
      sourceChatJid: firstChannel?.jidOrPhone || '',
      sourceGroupName: firstChannel?.name || 'Lançamento Manual',
      status: 'pendente',
      notes: '',
    });
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingReceipt(null);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(String(formState.totalAmount).replace(',', '.'));
    if (!formState.establishmentName.trim() || Number.isNaN(parsedAmount)) {
      onToast('error', 'Informe o estabelecimento/descrição e um valor numérico válido.');
      return;
    }

    setIsSavingForm(true);
    try {
      if (modalMode === 'edit' && formState.id) {
        const res = await updateOcrReceipt(formState.id, {
          receiptDate: formState.receiptDate,
          establishmentName: formState.establishmentName.trim(),
          cnpj: formState.cnpj.trim(),
          category: formState.category,
          totalAmount: parsedAmount,
          employeeName: formState.employeeName.trim(),
          workOrderNumber: formState.workOrderNumber.trim(),
          sourceGroupName: formState.sourceGroupName.trim(),
          status: formState.status,
          notes: formState.notes.trim(),
          editedBy: userName,
        });
        if (res.success) {
          await onRefresh();
          closeModal();
          onToast('success', res.message || 'Registro OCR atualizado e salvo com histórico!');
        } else {
          onToast('error', res.error || 'Erro ao salvar alteração do comprovante.');
        }
      } else if (modalMode === 'create') {
        const matchedChannel = enabledChannels.find((c) => c.jidOrPhone === formState.sourceChatJid);
        const res = await createManualOcrReceipt({
          receiptDate: formState.receiptDate,
          establishmentName: formState.establishmentName.trim(),
          cnpj: formState.cnpj.trim(),
          category: formState.category,
          totalAmount: parsedAmount,
          employeeName: formState.employeeName.trim() || userName,
          workOrderNumber: formState.workOrderNumber.trim(),
          sourceChatJid: formState.sourceChatJid || undefined,
          sourceGroupName: matchedChannel?.name || formState.sourceGroupName.trim() || 'Lançamento Manual',
          status: formState.status,
          notes: formState.notes.trim(),
          editedBy: userName,
        });
        if (res.success) {
          await onRefresh();
          closeModal();
          onToast('success', res.message || 'Lançamento salvo permanentemente no histórico OCR!');
        } else {
          onToast('error', res.error || 'Erro ao criar lançamento manual.');
        }
      }
    } finally {
      setIsSavingForm(false);
    }
  };

  // Export XLSX (2 sheets: Resumo_OCR + Comprovantes_OCR)
  const handleExportXlsx = () => {
    if (filteredReceipts.length === 0) {
      onToast('error', 'Não há comprovantes na visualização atual para exportar.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary & Breakdown
    const catTotals = new Map<string, { label: string; count: number; total: number }>();
    for (const r of filteredReceipts) {
      const cat = String(r.category || 'outros').toLowerCase();
      const prev = catTotals.get(cat) || {
        label: categoryLabelMap[cat] || cat,
        count: 0,
        total: 0,
      };
      prev.count += 1;
      prev.total += Number(r.totalAmount) || 0;
      catTotals.set(cat, prev);
    }

    const summaryRows: any[][] = [
      ['AGUEROFLOW — RELATÓRIO DASHBOARD OCR & NOTAS DE DÉBITO'],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Responsável', userName || 'Equipe'],
      ['Escopo', includeHistory ? 'Todo o Histórico OCR Salvo' : 'Canais com OCR Ativo'],
      ['Total de Registros Exportados', filteredReceipts.length],
      ['Valor Total Consolidado (R$)', Number(filteredTotalAmount.toFixed(2))],
      [],
      ['RESUMO POR CATEGORIA / DENOMINAÇÃO'],
      ['Categoria', 'Quantidade', 'Valor Total (R$)'],
      ...Array.from(catTotals.values())
        .sort((a, b) => b.total - a.total)
        .map((c) => [c.label, c.count, Number(c.total.toFixed(2))]),
      [],
      ['RESUMO POR CANAL / GRUPO'],
      ['Grupo / Contato', 'Quantidade', 'Valor Total (R$)'],
      ...byChannel.map((ch) => [ch.channelName, ch.count, Number(ch.totalAmount.toFixed(2))]),
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo_OCR');

    // Sheet 2: Itemized receipts
    const detailRows = filteredReceipts.map((r) => ({
      ID: r.id,
      'Envio WhatsApp': formatReceivedAtBr(r.receivedAt),
      'Data no Cupom': formatReceiptDateBr(r.receiptDate),
      'Grupo / Origem': r.sourceGroupName || r.employeeName || '',
      Colaborador: r.employeeName || '',
      Estabelecimento: r.establishmentName || '',
      CNPJ: r.cnpj || '',
      Categoria: categoryLabelMap[String(r.category || '').toLowerCase()] || r.category || '',
      'OS / Referência': r.workOrderNumber || '',
      'Valor (R$)': Number((Number(r.totalAmount) || 0).toFixed(2)),
      'Confiança OCR (%)': r.confidence ?? 100,
      Status: r.status,
      Observações: r.notes || '',
      'Última Edição': r.editedAt
        ? `${new Date(r.editedAt).toLocaleString('pt-BR')} (${r.editedBy || 'Usuário'})`
        : '',
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    wsDetail['!cols'] = [
      { wch: 24 },
      { wch: 12 },
      { wch: 26 },
      { wch: 22 },
      { wch: 30 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 34 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Comprovantes_OCR');

    XLSX.writeFile(wb, `AgueroFlow_Dashboard_OCR_${todayStr}.xlsx`);
    onToast('success', `Planilha Excel (.xlsx) exportada com ${filteredReceipts.length} registro(s)!`);
  };

  // Export PDF (Landscape with KPI summary + Category breakdown + Itemized table)
  const handleExportPdf = () => {
    if (filteredReceipts.length === 0) {
      onToast('error', 'Não há comprovantes na visualização atual para exportar.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header
    doc.setFillColor(11, 19, 43);
    doc.rect(0, 0, 297, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('AgueroFlow — Relatório Dashboard OCR & Comprovantes', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR')} · Responsável: ${userName || 'Equipe'} · Escopo: ${
        includeHistory ? 'Histórico Completo' : 'Canais OCR Ativos'
      }`,
      14,
      19
    );

    // KPI summary row
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Registros: ${filteredReceipts.length}   |   Total Consolidado: ${formatBRL(
        filteredTotalAmount
      )}   |   Pendentes: ${
        filteredReceipts.filter((r) => r.status === 'pendente').length
      }   |   Aprovados: ${
        filteredReceipts.filter((r) => r.status === 'aprovado' || r.status === 'reembolsado').length
      }`,
      14,
      34
    );

    // Category breakdown table
    const catTotals = new Map<string, { label: string; count: number; total: number }>();
    for (const r of filteredReceipts) {
      const cat = String(r.category || 'outros').toLowerCase();
      const prev = catTotals.get(cat) || {
        label: categoryLabelMap[cat] || cat,
        count: 0,
        total: 0,
      };
      prev.count += 1;
      prev.total += Number(r.totalAmount) || 0;
      catTotals.set(cat, prev);
    }

    autoTable(doc, {
      startY: 38,
      head: [['Categoria / Denominação', 'Qtd.', 'Total (R$)', '% do Total']],
      body: Array.from(catTotals.values())
        .sort((a, b) => b.total - a.total)
        .map((c) => [
          c.label,
          String(c.count),
          formatBRL(c.total),
          filteredTotalAmount > 0 ? `${((c.total / filteredTotalAmount) * 100).toFixed(1)}%` : '0%',
        ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [6, 182, 212], textColor: [255, 255, 255] },
      margin: { left: 14, right: 14 },
      tableWidth: 135,
    });

    const nextY = ((doc as any).lastAutoTable?.finalY || 68) + 8;

    // Detailed receipts table
    autoTable(doc, {
      startY: nextY,
      head: [
        [
          'Data',
          'Grupo / Origem',
          'Colaborador',
          'Estabelecimento',
          'Categoria',
          'OS / Ref.',
          'Valor (R$)',
          'Status',
          'Observações',
        ],
      ],
      body: filteredReceipts.map((r) => [
        r.receiptDate || '',
        r.sourceGroupName || '-',
        r.employeeName || '-',
        r.establishmentName || '-',
        categoryLabelMap[String(r.category || '').toLowerCase()] || r.category || '-',
        r.workOrderNumber || '-',
        formatBRL(r.totalAmount),
        r.status || 'pendente',
        (r.notes || '').slice(0, 60),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`AgueroFlow_Dashboard_OCR_${todayStr}.pdf`);
    onToast('success', `Relatório PDF exportado com ${filteredReceipts.length} registro(s)!`);
  };

  // JSON Backup Export (permanent local file safeguard)
  const handleDownloadJsonBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: userName,
      totalRecords: receipts.length,
      receipts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AgueroFlow_Backup_Historico_OCR_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast('success', `Backup JSON de segurança baixado (${receipts.length} registros).`);
  };

  // JSON Backup Import / Restore
  const handleImportJsonBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items: WhatsAppOcrReceiptItem[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.receipts)
        ? parsed.receipts
        : [];
      if (items.length === 0) {
        onToast('error', 'Arquivo de backup não contém registros OCR válidos.');
        return;
      }
      const res = await restoreOcrReceiptsToServer(items);
      if (res.success) {
        await onRefresh();
        onToast(
          'success',
          `Backup restaurado: ${res.restored || 0} novo(s) e ${res.updated || 0} atualizado(s). Total no histórico: ${res.total}.`
        );
      } else {
        onToast('error', res.error || 'Erro ao restaurar backup JSON.');
      }
    } catch {
      onToast('error', 'Arquivo JSON inválido.');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Active OCR Scope & Vault Protection Banner — Clean Stacked Rows */}
      <div className="bg-white dark:bg-[#0B132B] border border-black/[0.08] dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="space-y-2.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-[#166534] dark:text-emerald-400">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {includeHistory
                  ? `Todo o Histórico OCR Salvo (${allHistoricalCount} registros)`
                  : `Dashboard de Canais com OCR Ativo (${summary.activeChannelsCount})`}
              </span>
            </span>
            <span className="text-black/20 dark:text-slate-600 hidden sm:inline" aria-hidden="true">|</span>
            <span className="text-[#0071E3] dark:text-cyan-300 inline-flex items-center gap-1.5 font-medium">
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span>{vaultStatus || 'Histórico Protegido (Disco + Backup + Nuvem)'}</span>
            </span>
          </div>

          <p className="text-xs text-[#6E6E73] dark:text-slate-400 leading-relaxed max-w-4xl">
            Cada leitura OCR é gravada com proteção tripla (servidor atômico + cópia de segurança + cofre na nuvem). Enviar mensagem de confirmação no grupo é <strong className="text-[#1D1D1F] dark:text-white">opcional</strong> — clique no botão ao lado de cada canal abaixo para alternar entre modo silencioso e resposta no WhatsApp.
          </p>

          {enabledChannels.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {enabledChannels.map((ch) => {
                const repliesInGroup = ch.ocrAutoReply === true;
                return (
                  <div
                    key={ch.id}
                    className="pl-2.5 pr-1.5 py-1 bg-[#E8F8EE] dark:bg-slate-900 border border-[#166534]/20 dark:border-emerald-500/30 rounded-lg text-[11px] font-medium text-[#166534] dark:text-emerald-300 inline-flex flex-wrap items-center gap-2"
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      {ch.isGroup && <Users className="w-3 h-3 shrink-0" />}
                      <span>{ch.name}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busyChannelId === ch.id}
                      onClick={() => handleToggleChannelAutoReply(ch)}
                      title={
                        repliesInGroup
                          ? 'Clique para desativar o envio da mensagem OCR no grupo (deixar silencioso)'
                          : 'Clique para ativar o envio opcional da confirmação OCR no grupo'
                      }
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                        repliesInGroup
                          ? 'bg-[#0071E3] text-white border-[#0071E3] hover:bg-[#0077ED]'
                          : 'bg-white dark:bg-slate-800 text-[#6E6E73] dark:text-slate-300 border-black/[0.12] dark:border-slate-700 hover:text-[#1D1D1F] dark:hover:text-white'
                      }`}
                    >
                      {repliesInGroup ? (
                        <>
                          <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                          <span>Envia msg no grupo: ON</span>
                        </>
                      ) : (
                        <>
                          <MessageSquareOff className="w-2.5 h-2.5 shrink-0" />
                          <span>Só Painel (Silencioso)</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dedicated Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-black/[0.06] dark:border-slate-800">
          <button
            type="button"
            onClick={openCreateModal}
            className="px-3.5 py-2 bg-[#1E7E34] hover:bg-[#19692C] text-white apple-solid-btn text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Novo Lançamento</span>
          </button>
          <button
            type="button"
            onClick={handleExportXlsx}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.12] dark:border-emerald-500/40 text-[#166534] dark:text-emerald-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.12] dark:border-cyan-500/40 text-[#0071E3] dark:text-cyan-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 shrink-0" />
            <span>Exportar PDF</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <select
              value={syncWindow}
              onChange={(e) =>
                setSyncWindow(
                  e.target.value as 'since_disconnect' | '2h' | '6h' | 'today' | '24h'
                )
              }
              title="Período de corte para leitura de imagens pendentes do WhatsApp (evita puxar fotos antigas)"
              className="bg-white dark:bg-slate-900 border border-black/[0.14] dark:border-cyan-500/40 rounded-lg px-3 py-2 text-xs text-[#1D1D1F] dark:text-slate-200 focus:outline-none focus:border-[#0071E3]"
            >
              <option value="since_disconnect">Desde a desconexão</option>
              <option value="2h">Últimas 2 horas</option>
              <option value="6h">Últimas 6 horas</option>
              <option value="today">Somente hoje (00h)</option>
              <option value="24h">Últimas 24 horas</option>
            </select>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Sincroniza o WhatsApp e varre somente imagens dentro do período escolhido nos canais com OCR ativo"
              className="px-3.5 py-2 bg-[#0071E3] hover:bg-[#0077ED] text-white apple-solid-btn text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Sincronizando OCR...' : 'Sincronizar & Ler Pendentes'}</span>
            </button>
          </div>
        </div>

        {/* Scope switcher + Permanent Backup Tools */}
        <div className="pt-3 border-t border-black/[0.06] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-[#F2F2F7] dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-xl overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => onToggleIncludeHistory(false)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                !includeHistory
                  ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                  : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              Somente Canais OCR Ativos
            </button>
            <button
              type="button"
              onClick={() => onToggleIncludeHistory(true)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                includeHistory
                  ? 'bg-[#0071E3] text-white apple-solid-btn shadow-sm'
                  : 'text-[#424245] dark:text-slate-400 hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span>Todo o Histórico Salvo ({allHistoricalCount})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onGoToContacts}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#1D1D1F] dark:text-slate-300 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition cursor-pointer"
            >
              Canais OCR em Contatos
            </button>
            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#1D1D1F] dark:text-slate-300 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
              title="Baixar arquivo JSON de segurança com todo o histórico OCR"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Backup JSON</span>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportJsonBackup}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-[#F2F2F7] dark:hover:bg-slate-800 border border-black/[0.1] dark:border-slate-700 text-[#1D1D1F] dark:text-slate-300 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition cursor-pointer"
              title="Restaurar ou mesclar um arquivo JSON de backup sem sobrescrever registros mais recentes"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Restaurar Backup</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 block">Leituras OCR Registradas</span>
          <strong className="text-2xl font-bold text-white tabular-nums block">
            {summary.totalCount}
          </strong>
          <span className="text-[11px] text-slate-400">
            {summary.activeChannelsCount} canal(is) ativo(s) · {allHistoricalCount} no arquivo geral
          </span>
        </div>

        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 block">Valor Total Extraído</span>
          <strong className="text-2xl font-bold text-emerald-400 tabular-nums block">
            {formatBRL(summary.totalAmount)}
          </strong>
          <span className="text-[11px] text-slate-400">
            Filtro atual: {formatBRL(filteredTotalAmount)}
          </span>
        </div>

        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 block">Confiança Média IA</span>
          <strong className="text-2xl font-bold text-cyan-400 tabular-nums block">
            {summary.totalCount > 0 ? `${summary.avgConfidence}%` : '—'}
          </strong>
          <span className="text-[11px] text-slate-400">Extração multimodal + revisões</span>
        </div>

        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 block">Pendentes / Aprovados</span>
          <strong className="text-2xl font-bold text-white tabular-nums block">
            {summary.pendingCount} / {summary.approvedCount}
          </strong>
          <span className="text-[11px] text-slate-400">Conferência financeira e ND</span>
        </div>
      </div>

      {/* Charts & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Gastos Lidos por Categoria</h4>
            <span className="text-[11px] text-slate-400">Valores em R$</span>
          </div>

          {byCategory.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-500">
              Nenhuma leitura OCR registrada nesta visualização ainda.
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                    formatter={(val: any) => [formatBRL(Number(val)), 'Total Lido']}
                  />
                  <Bar dataKey="totalAmount" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-white">Leituras por Grupo / Contato</h4>

          {byChannel.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center space-y-2 text-xs text-slate-500">
              <FileSpreadsheet className="w-8 h-8 text-slate-600" />
              <p>Ative o OCR em um grupo/contato ou adicione um lançamento manual para acompanhar aqui.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {byChannel.map((ch) => (
                <div
                  key={ch.channelKey}
                  className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate flex items-center gap-1.5">
                      {ch.isGroup && <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      <span className="truncate">{ch.channelName}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      {ch.count} comprovante(s) lido(s)
                    </p>
                  </div>
                  <strong className="font-mono text-emerald-400 tabular-nums shrink-0">
                    {formatBRL(ch.totalAmount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">
            Histórico de Comprovantes & NDs ({filteredReceipts.length})
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar estabelecimento, OS, colaborador..."
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-56"
            />

            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="todos">Todos os canais</option>
              {byChannel.map((ch) => (
                <option key={ch.channelKey} value={ch.channelKey}>
                  {ch.channelName}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="todos">Todas as categorias</option>
              {OCR_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="todos">Todos os status</option>
              <option value="pendente">Pendentes</option>
              <option value="aprovado">Aprovados</option>
              <option value="reembolsado">Reembolsados</option>
              <option value="rejeitado">Rejeitados</option>
            </select>
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 space-y-3">
            <p className="font-medium text-slate-300">
              {enabledChannels.length === 0 && !includeHistory
                ? 'Nenhum grupo ou contato está com OCR ativado ainda.'
                : 'Nenhuma leitura OCR encontrada para os filtros selecionados.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {enabledChannels.length === 0 && (
                <button
                  type="button"
                  onClick={onGoToContacts}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition"
                >
                  Ativar OCR na Aba Contatos
                </button>
              )}
              {!includeHistory && allHistoricalCount > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleIncludeHistory(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition"
                >
                  Ver Todo o Histórico Salvo ({allHistoricalCount})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-900/60">
                  <th className="py-3 px-4 font-semibold">Envio WhatsApp / Cupom</th>
                  <th className="py-3 px-4 font-semibold">Origem (Grupo/Contato)</th>
                  <th className="py-3 px-4 font-semibold">Estabelecimento / OS</th>
                  <th className="py-3 px-4 font-semibold">Categoria</th>
                  <th className="py-3 px-4 font-semibold">Valor</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Conferência & Edição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/50 transition">
                    <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                      <div className="text-slate-200 font-medium">
                        {formatReceivedAtBr(r.receivedAt)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Cupom: {formatReceiptDateBr(r.receiptDate)}
                      </div>
                      {r.editedAt && (
                        <span className="text-[10px] text-cyan-400 block">Editado</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-white">{r.sourceGroupName || r.employeeName}</p>
                      <p className="text-[11px] text-slate-400">{r.employeeName}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-200 font-medium">{r.establishmentName}</p>
                      {(r.workOrderNumber || r.cnpj) && (
                        <p className="text-[11px] text-slate-400 font-mono">
                          {r.workOrderNumber ? `OS: ${r.workOrderNumber}` : ''}
                          {r.workOrderNumber && r.cnpj ? ' · ' : ''}
                          {r.cnpj || ''}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-[11px]">
                      {categoryLabelMap[String(r.category || '').toLowerCase()] || r.category}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-400 tabular-nums whitespace-nowrap">
                      {formatBRL(r.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          r.status === 'aprovado' || r.status === 'reembolsado'
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                            : r.status === 'rejeitado'
                            ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                            : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(r)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-cyan-950/50 border border-slate-700 hover:border-cyan-500/40 text-cyan-300 rounded text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                          title="Editar valores, categoria, data ou observações"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyReceiptId === r.id || r.status === 'aprovado'}
                          onClick={() => handleStatusChange(r.id, 'aprovado')}
                          className="px-2.5 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 rounded text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Aprovar</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyReceiptId === r.id || r.status === 'rejeitado'}
                          onClick={() => handleStatusChange(r.id, 'rejeitado')}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 rounded text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Rejeitar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Create OCR Receipt Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  {modalMode === 'edit'
                    ? 'Editar Registro OCR (com Histórico de Auditoria)'
                    : 'Novo Lançamento Manual no Dashboard OCR / ND'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Alterações ficam salvas permanentemente no servidor e replicadas no cofre da nuvem.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Data do Comprovante *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.receiptDate}
                    onChange={(e) => setFormState((s) => ({ ...s, receiptDate: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formState.totalAmount}
                    onChange={(e) => setFormState((s) => ({ ...s, totalAmount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Estabelecimento / Descrição do Gasto *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.establishmentName}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, establishmentName: e.target.value }))
                    }
                    placeholder="Ex: Posto Shell Rodovia / ND Obra Piracicaba"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Categoria / Denominação
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) => setFormState((s) => ({ ...s, category: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    {OCR_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState((s) => ({ ...s, status: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="reembolsado">Reembolsado</option>
                    <option value="rejeitado">Rejeitado</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Colaborador / Remetente
                  </label>
                  <input
                    type="text"
                    value={formState.employeeName}
                    onChange={(e) => setFormState((s) => ({ ...s, employeeName: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Grupo / Canal de Origem
                  </label>
                  {modalMode === 'create' && enabledChannels.length > 0 ? (
                    <select
                      value={formState.sourceChatJid}
                      onChange={(e) => {
                        const ch = enabledChannels.find((c) => c.jidOrPhone === e.target.value);
                        setFormState((s) => ({
                          ...s,
                          sourceChatJid: e.target.value,
                          sourceGroupName: ch?.name || 'Lançamento Manual',
                        }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Lançamento Manual (Sem grupo)</option>
                      {enabledChannels.map((c) => (
                        <option key={c.id} value={c.jidOrPhone}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formState.sourceGroupName}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, sourceGroupName: e.target.value }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    CNPJ (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formState.cnpj}
                    onChange={(e) => setFormState((s) => ({ ...s, cnpj: e.target.value }))}
                    placeholder="00.000.000/0001-00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    OS / Nota de Débito (Ref.)
                  </label>
                  <input
                    type="text"
                    value={formState.workOrderNumber}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, workOrderNumber: e.target.value }))
                    }
                    placeholder="Ex: OS-2025-042 ou ND-118"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Observações / Detalhes do Item
                  </label>
                  <textarea
                    rows={2}
                    value={formState.notes}
                    onChange={(e) => setFormState((s) => ({ ...s, notes: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {modalMode === 'edit' &&
                editingReceipt?.editHistory &&
                editingReceipt.editHistory.length > 0 && (
                  <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-1.5">
                    <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />
                      <span>Histórico de Alterações ({editingReceipt.editHistory.length})</span>
                    </span>
                    <div className="space-y-1 max-h-28 overflow-y-auto text-[11px] text-slate-400">
                      {editingReceipt.editHistory.map((h, i) => (
                        <div key={`${h.editedAt}_${i}`} className="border-t border-slate-800/80 pt-1">
                          <span className="text-slate-300 font-medium">{h.editedBy}</span>{' '}
                          <span className="tabular-nums">
                            ({new Date(h.editedAt).toLocaleString('pt-BR')})
                          </span>
                          : {h.summary}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {isSavingForm ? 'Salvando...' : 'Salvar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
