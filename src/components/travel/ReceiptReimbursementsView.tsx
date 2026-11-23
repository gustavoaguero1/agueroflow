import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Upload,
  Settings,
  Plus,
  Search,
  Filter,
  Check,
  X,
  Share2,
  Trash2,
  Truck,
  Building,
  Utensils,
  Receipt,
  Download,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity,
  Terminal,
  Radio,
} from 'lucide-react';
import {
  ReimbursementReceipt,
  WhatsAppReceiptsConfig,
  ReimbursementCategory,
  ReimbursementStatus,
  WhatsAppWebhookLog,
} from '../../types/travel';
import { WhatsAppConfigModal } from './WhatsAppConfigModal';
import { apiFetch } from '../../apiAuthFetch';
import { WeeklyReimbursementSummary } from './WeeklyReimbursementSummary';

interface ReceiptReimbursementsViewProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export const ReceiptReimbursementsView: React.FC<ReceiptReimbursementsViewProps> = ({
  currentUser,
}) => {
  const [receipts, setReceipts] = useState<ReimbursementReceipt[]>([]);
  const [config, setConfig] = useState<WhatsAppReceiptsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString('pt-BR'));
  const [isLiveActive, setIsLiveActive] = useState(true);

  // Webhook Logs Modal State
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<WhatsAppWebhookLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [clearingMock, setClearingMock] = useState(false);

  // Manual OCR upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadEmployeeName, setUploadEmployeeName] = useState('');
  const [uploadEmployeePhone, setUploadEmployeePhone] = useState('');
  const [uploadWorkOrder, setUploadWorkOrder] = useState('');
  const [selectedFileBase64, setSelectedFileBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [isSyncingWhatsapp, setIsSyncingWhatsapp] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSyncWhatsAppMessages = async () => {
    setIsSyncingWhatsapp(true);
    try {
      const res = await apiFetch('/api/whatsapp/sync-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        loadData(false);
      } else {
        showToast(`⚠️ ${data.error || 'Verifique as configurações da instância'}`);
        setIsConfigModalOpen(true);
      }
    } catch (err: any) {
      showToast(`Erro na sincronização: ${err.message}`);
      setIsConfigModalOpen(true);
    } finally {
      setIsSyncingWhatsapp(false);
    }
  };

  const handleQuickTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    try {
      const res = await apiFetch('/api/whatsapp/test-sample-receipt', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.receipt) {
        setReceipts((prev) => [data.receipt, ...prev]);
        if (data.config) setConfig(data.config);
        showToast(`✅ Cupom no grupo "${data.config?.targetGroupName || 'REEMBOLSOS AGUERO INOX'}" registrado e lido via IA (R$ ${Number(data.receipt.totalAmount).toFixed(2)})!`);
      } else {
        showToast(`Erro ao testar: ${data.error || 'Falha ao processar'}`);
      }
    } catch (err: any) {
      showToast(`Erro ao disparar teste: ${err.message}`);
    } finally {
      setTestingWhatsApp(false);
    }
  };

  // Load data function (supports silent background sync)
  const loadData = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const [resReceipts, resConfig] = await Promise.all([
        apiFetch('/api/reimbursements/list').then((r) => r.json()),
        apiFetch('/api/whatsapp/config').then((r) => r.json()),
      ]);

      if (resReceipts.success && Array.isArray(resReceipts.receipts)) {
        setReceipts(resReceipts.receipts);
      }
      if (resConfig.success && resConfig.config) {
        setConfig(resConfig.config);
      }
      setLastSyncTime(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.warn('Erro ao carregar dados de reembolsos:', err);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  // Real-time automatic polling every 5 seconds
  useEffect(() => {
    loadData(true);

    const interval = setInterval(() => {
      if (isLiveActive) {
        loadData(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isLiveActive]);

  // Fetch Webhook Event Logs
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await apiFetch('/api/whatsapp/logs');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setWebhookLogs(data.logs);
      }
    } catch (err) {
      console.warn('Erro ao buscar logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleOpenLogsModal = () => {
    setIsLogsModalOpen(true);
    fetchLogs();
  };

  // Clear demo / test data
  const handleClearMockReceipts = async () => {
    if (!window.confirm('Tem certeza que deseja remover os cupons de demonstração e testes? Apenas cupons reais do WhatsApp e uploads manuais serão mantidos no painel.')) {
      return;
    }
    setClearingMock(true);
    try {
      const res = await apiFetch('/api/reimbursements/clear-mock', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Cupons de exemplo removidos com sucesso!');
        await loadData(false);
      }
    } catch (err: any) {
      showToast('Falha ao remover cupons de exemplo.');
    } finally {
      setClearingMock(false);
    }
  };

  // Delete single receipt
  const handleDeleteReceipt = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Deseja excluir este comprovante?')) return;
    try {
      const res = await apiFetch(`/api/reimbursements/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setReceipts((prev) => prev.filter((r) => r.id !== id));
        showToast('Comprovante removido com sucesso.');
      } else {
        showToast(data.error || 'Erro ao excluir comprovante.');
      }
    } catch (err) {
      showToast('Erro ao conectar com o servidor.');
    }
  };

  // Update status handler
  const handleUpdateStatus = async (id: string, status: ReimbursementStatus, notes?: string) => {
    try {
      const res = await apiFetch('/api/reimbursements/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, approvedBy: currentUser.name, notes }),
      });
      const data = await res.json();
      if (data.success) {
        setReceipts((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status, approvedBy: currentUser.name } : r))
        );
        showToast(`Status atualizado para ${status.replace('_', ' ')}!`);
      }
    } catch (err: any) {
      showToast('Erro ao atualizar status do comprovante.');
    }
  };

  // File selection for OCR
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFileBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Process OCR Upload
  const handleRunOcrUpload = async () => {
    if (!selectedFileBase64) {
      showToast('Selecione uma imagem ou PDF de cupom fiscal.');
      return;
    }

    setIsProcessingOcr(true);
    try {
      const res = await apiFetch('/api/reimbursements/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: selectedFileBase64,
          fileName: selectedFileName,
          employeeName: uploadEmployeeName,
          employeePhone: uploadEmployeePhone,
          workOrderNumber: uploadWorkOrder,
          saveRecord: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.receipt) {
        setReceipts((prev) => [data.receipt, ...prev]);
        showToast(`Cupom lido com sucesso! R$ ${data.receipt.totalAmount.toFixed(2)} (${data.receipt.establishmentName})`);
        setIsUploadModalOpen(false);
        setSelectedFileBase64(null);
        setSelectedFileName('');
      } else {
        showToast(data.error || 'Falha ao processar o cupom fiscal.');
      }
    } catch (err: any) {
      showToast('Erro de comunicação com o servidor de IA.');
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (receipts.length === 0) return;
    const headers = ['ID', 'Funcionario', 'Telefone', 'Data', 'Estabelecimento', 'CNPJ', 'Categoria', 'Valor Total (R$)', 'Forma Pagamento', 'OS', 'Status'];
    const rows = receipts.map((r) => [
      r.id,
      r.employeeName,
      r.employeePhone,
      r.receiptDate,
      `"${r.establishmentName}"`,
      r.cnpj || '',
      r.category,
      r.totalAmount.toFixed(2),
      r.paymentMethod,
      r.workOrderNumber || '',
      r.status,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reembolsos_agueroinox_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter receipts
  const filteredReceipts = receipts.filter((r) => {
    if (selectedCategory !== 'todos' && r.category !== selectedCategory) return false;
    if (selectedStatus !== 'todos' && r.status !== selectedStatus) return false;
    if (!searchTerm.trim()) return true;
    const match = `${r.employeeName} ${r.establishmentName} ${r.category} ${r.workOrderNumber || ''} ${r.cnpj || ''}`.toLowerCase();
    return match.includes(searchTerm.toLowerCase());
  });

  // KPI metrics
  const totalAmount = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const pendingCount = receipts.filter((r) => r.status === 'pendente').length;
  const approvedFundCount = receipts.filter((r) => r.status === 'abatido_fundo_missao').length;
  const approvedFundTotal = receipts
    .filter((r) => r.status === 'abatido_fundo_missao')
    .reduce((sum, r) => sum + (r.totalAmount || 0), 0);

  const getCategoryBadge = (cat: ReimbursementCategory) => {
    switch (cat) {
      case 'combustivel':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Truck className="w-3 h-3" /> Combustível
          </span>
        );
      case 'alimentacao':
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Utensils className="w-3 h-3" /> Alimentação
          </span>
        );
      case 'pedagio':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Receipt className="w-3 h-3" /> Pedágio
          </span>
        );
      case 'hospedagem':
        return (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Building className="w-3 h-3" /> Hospedagem
          </span>
        );
      case 'materiais_obra':
        return (
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold flex items-center gap-1">
            <FileText className="w-3 h-3" /> Insumos Obra
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold">
            {cat}
          </span>
        );
    }
  };

  const getStatusBadge = (status: ReimbursementStatus) => {
    switch (status) {
      case 'aprovado':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">Aprovado</span>;
      case 'pendente':
        return <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">Pendente</span>;
      case 'abatido_fundo_missao':
        return <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">Abatido Fundo Missão</span>;
      case 'reembolsado':
        return <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">Reembolsado</span>;
      case 'rejeitado':
        return <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">Rejeitado</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-slate-100">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-2xl text-emerald-200 text-xs flex items-center space-x-2 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <WeeklyReimbursementSummary />

      {/* Real-time Webhook Live Bar */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span>Webhook Ativo em Tempo Real</span>
          </div>
          <span className="text-slate-400 text-[11px]">
            Última checagem: <span className="font-mono text-slate-200">{lastSyncTime}</span> (polling 5s)
          </span>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <div className="flex items-center space-x-2 text-[11px]">
            <span className="text-emerald-400 font-bold font-mono">
              {receipts.filter((r) => r.source === 'whatsapp_real').length}
            </span>
            <span className="text-slate-400">reais via WhatsApp</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-300 font-bold font-mono">
              {receipts.filter((r) => r.source === 'manual_upload').length}
            </span>
            <span className="text-slate-400">uploads OCR</span>
            {receipts.some((r) => r.source === 'demo' || r.source === 'simulacao_teste') && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-bold font-mono">
                  {receipts.filter((r) => r.source === 'demo' || r.source === 'simulacao_teste').length}
                </span>
                <span className="text-slate-400">exemplos/testes</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 self-end md:self-auto">
          <button
            type="button"
            onClick={handleOpenLogsModal}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition"
            title="Ver histórico de requisições recebidas no Webhook"
          >
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Monitor do Webhook</span>
          </button>

          {receipts.some((r) => r.source === 'demo' || r.source === 'simulacao_teste') && (
            <button
              type="button"
              onClick={handleClearMockReceipts}
              disabled={clearingMock}
              className="px-3 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-800/60 text-xs font-semibold flex items-center space-x-1.5 transition"
              title="Remove registros de exemplo para visualizar apenas dados reais"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
              <span>{clearingMock ? 'Limpando...' : 'Limpar Exemplos'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top Banner with WhatsApp Status */}
      <div className="bg-gradient-to-r from-emerald-950/50 via-slate-900 to-cyan-950/40 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-emerald-400" /> WhatsApp Conectado
            </span>
            <span className="text-xs text-slate-400">
              {config?.provider === 'composio_whatsapp' || config?.messagingMode === '1_to_1_private' ? (
                <>
                  Canal:{' '}
                  <strong className="text-white">
                    Privado 1-para-1 (Composio{config?.composioConnectedAccountId ? ` · ${config.composioConnectedAccountId}` : ''})
                  </strong>
                </>
              ) : (
                <>
                  {config?.provider === 'baileys_web_bridge' ? 'Dispositivos Conectados · Grupo: ' : 'Grupo: '}
                  {config?.targetGroupName ? (
                    <strong className="text-white">{config.targetGroupName}</strong>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsConfigModalOpen(true)}
                      className="text-amber-400 underline font-bold hover:text-amber-300"
                    >
                      (Pendente de definição — Clique para configurar) ➔
                    </button>
                  )}
                </>
              )}
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white">
            Leitor OCR de Cupons & Prestação de Contas
          </h2>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            {config?.provider === 'composio_whatsapp' || config?.messagingMode === '1_to_1_private'
              ? 'Os técnicos enviam as fotos das notas fiscais diretamente no privado (1-para-1) para o WhatsApp Business conectado via Composio. A IA extrai CNPJ, data, valor e categoria automaticamente.'
              : 'Os técnicos enviam as fotos das notas fiscais e recibos direto no grupo do WhatsApp conectado. A inteligência artificial extrai CNPJ, data, valor e categoria automaticamente e responde no grupo.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleSyncWhatsAppMessages}
            disabled={isSyncingWhatsapp}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition"
            title="Conecta à API do WhatsApp e busca as fotos e notas fiscais enviadas no grupo de ontem até agora"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingWhatsapp ? 'animate-spin' : ''}`} />
            <span>{isSyncingWhatsapp ? 'Sincronizando...' : 'Puxar Mensagens do WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={handleQuickTestWhatsApp}
            disabled={testingWhatsApp}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-800/60 font-bold text-xs flex items-center justify-center space-x-1.5 transition"
            title="Simula o envio instantâneo de um cupom fiscal no grupo do WhatsApp com leitura OCR pela IA"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{testingWhatsApp ? 'Lendo Cupom...' : 'Simular Cupom no Grupo'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 font-bold text-xs flex items-center justify-center space-x-1.5 transition"
          >
            <Settings className="w-4 h-4 text-emerald-400" />
            <span>Configurar WhatsApp & Grupo</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-1.5"
          >
            <Upload className="w-4 h-4" />
            <span>Escanear Cupom</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
          <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Total em Cupons</span>
          <strong className="text-2xl font-bold font-mono text-white">
            R$ {totalAmount.toFixed(2).replace('.', ',')}
          </strong>
          <span className="text-[10px] text-slate-400 block">{receipts.length} comprovantes recebidos</span>
        </div>

        <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
          <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Pendentes de Análise</span>
          <strong className="text-2xl font-bold font-mono text-amber-400">
            {pendingCount}
          </strong>
          <span className="text-[10px] text-amber-400 block">Aguardando conferência do gestor</span>
        </div>

        <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
          <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Abatido do Fundo</span>
          <strong className="text-2xl font-bold font-mono text-cyan-300">
            R$ {approvedFundTotal.toFixed(2).replace('.', ',')}
          </strong>
          <span className="text-[10px] text-cyan-400 block">{approvedFundCount} despesas de missão</span>
        </div>

        <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-1">
          <span className="text-slate-400 text-[11px] block font-semibold uppercase tracking-wider">Gateway WhatsApp</span>
          <strong className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Online & Ativo
          </strong>
          <span className="text-[10px] text-slate-400 block font-mono">{config?.connectedPhoneNumber || '+55 11 91789-7747'}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pendente', label: 'Pendentes' },
              { id: 'aprovado', label: 'Aprovados' },
              { id: 'abatido_fundo_missao', label: 'Abatido da Missão' },
              { id: 'reembolsado', label: 'Reembolsados' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition flex-shrink-0 ${
                  selectedStatus === tab.id
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por funcionário, posto ou OS..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              title="Exportar Planilha CSV para Contabilidade"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs flex items-center gap-1.5 flex-shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Receipts List */}
      {filteredReceipts.length === 0 ? (
        <div className="p-10 text-center bg-[#111827] border border-slate-800 rounded-3xl space-y-3">
          <Receipt className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">Nenhum cupom fiscal encontrado</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Ajuste os filtros ou utilize o botão acima para escanear um novo cupom ou simular o envio de um funcionário pelo WhatsApp.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReceipts.map((rec) => {
            const isExpanded = expandedReceiptId === rec.id;

            return (
              <div
                key={rec.id}
                className="bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition shadow-lg space-y-3"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="font-mono text-cyan-400 font-bold text-xs">{rec.id}</span>
                      <span className="text-slate-600">•</span>
                      <strong className="text-sm font-bold text-white">{rec.establishmentName}</strong>
                      <span className="text-slate-600">•</span>
                      {getCategoryBadge(rec.category)}
                      {getStatusBadge(rec.status)}

                      {/* Source Provenance Badge */}
                      {rec.source === 'whatsapp_real' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600 flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          📱 WhatsApp Real
                        </span>
                      )}
                      {rec.source === 'manual_upload' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700 flex items-center gap-1">
                          📄 Upload Direto OCR
                        </span>
                      )}
                      {rec.source === 'simulacao_teste' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-700 flex items-center gap-1">
                          🧪 Simulação Grupo
                        </span>
                      )}
                      {(rec.source === 'demo' || !rec.source) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                          Exemplo Demo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                      <span>Técnico: <strong className="text-slate-200">{rec.employeeName}</strong></span>
                      <a
                        href={`https://wa.me/${rec.employeePhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 font-mono text-[11px] flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3" />
                        {rec.employeePhone}
                      </a>
                      {rec.workOrderNumber && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            {rec.workOrderNumber}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Value and Actions */}
                  <div className="flex items-center space-x-3 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Valor do Cupom</span>
                      <strong className="text-lg font-mono font-bold text-emerald-400">
                        R$ {rec.totalAmount.toFixed(2).replace('.', ',')}
                      </strong>
                    </div>

                    {/* Decision buttons */}
                    {rec.status === 'pendente' && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(rec.id, 'abatido_fundo_missao', 'Abatido do fundo da missão')}
                          title="Abater do Fundo de Reserva da Missão"
                          className="px-2.5 py-1.5 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-semibold"
                        >
                          Abater Fundo
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(rec.id, 'aprovado', 'Aprovado pelo gestor')}
                          title="Aprovar Reembolso"
                          className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <Check className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(rec.id, 'rejeitado', 'Comprovante não conforme')}
                          title="Rejeitar"
                          className="p-1.5 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleDeleteReceipt(rec.id, e)}
                      className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 transition"
                      title="Excluir comprovante"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedReceiptId(isExpanded ? null : rec.id)}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title={isExpanded ? 'Recolher detalhes' : 'Ver itens do cupom'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Sub-row details */}
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-3">
                    <span>Data da Emissão: <strong className="text-slate-200">{rec.receiptDate.split('-').reverse().join('/')}</strong></span>
                    {rec.cnpj && <span>CNPJ: <span className="font-mono text-slate-300">{rec.cnpj}</span></span>}
                    <span>Pagamento: <span className="capitalize text-slate-300">{rec.paymentMethod.replace('_', ' ')}</span></span>
                  </div>

                  {rec.confidence && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Confiança IA: {rec.confidence}%
                    </span>
                  )}
                </div>

                {/* Expandable items breakdown */}
                {isExpanded && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 animate-in fade-in-50 duration-150">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Itens Discriminados no Cupom Fiscal:
                    </span>
                    <div className="space-y-1 text-xs">
                      {rec.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-slate-300 py-0.5 border-b border-slate-900 last:border-0">
                          <span>
                            {item.quantity && <span className="text-cyan-400 font-mono mr-1">{item.quantity}x</span>}
                            {item.description}
                          </span>
                          <strong className="font-mono text-white">R$ {item.subtotal.toFixed(2)}</strong>
                        </div>
                      ))}
                    </div>

                    {rec.notes && (
                      <div className="text-[11px] text-slate-400 italic pt-1">
                        Nota: {rec.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Upload & Scanner Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Escanear Cupom Fiscal (OCR IA)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Técnico de Campo</label>
                <input
                  type="text"
                  value={uploadEmployeeName}
                  onChange={(e) => setUploadEmployeeName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={uploadEmployeePhone}
                    onChange={(e) => setUploadEmployeePhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Nº da OS / Obra</label>
                  <input
                    type="text"
                    value={uploadWorkOrder}
                    onChange={(e) => setUploadWorkOrder(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* File Dropzone */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-semibold text-slate-300">Foto ou PDF do Cupom</label>
                <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition bg-slate-950/60">
                  <Upload className="w-6 h-6 text-emerald-400 mb-2" />
                  <span className="text-xs font-semibold text-white">
                    {selectedFileName || 'Clique ou arraste a foto do cupom fiscal'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">Formatos aceitos: JPG, PNG, PDF</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleQuickTestWhatsApp}
                disabled={isProcessingOcr || testingWhatsApp}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold"
              >
                Simular Envio WhatsApp
              </button>

              <button
                type="button"
                onClick={handleRunOcrUpload}
                disabled={isProcessingOcr || !selectedFileBase64}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition disabled:opacity-50"
              >
                {isProcessingOcr ? 'Processando OCR...' : 'Processar & Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Configuration Modal */}
      {config && (
        <WhatsAppConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          config={config}
          onSyncSuccess={() => loadData(false)}
          onSaveConfig={async (updated) => {
            const res = await apiFetch('/api/whatsapp/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updated),
            });
            const data = await res.json();
            if (data.success) {
              setConfig(data.config);
              showToast('Configuração do WhatsApp salva com sucesso!');
              loadData(false);
            }
          }}
        />
      )}

      {/* Webhook Live Logs & Diagnostic Monitor Modal */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-cyan-950/70 border border-cyan-800 text-cyan-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Monitor de Requisições do Webhook WhatsApp</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </h3>
                  <p className="text-xs text-slate-400">
                    Auditoria em tempo real de mensagens e fotos recebidas do grupo
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={fetchLogs}
                  disabled={loadingLogs}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>Atualizar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsLogsModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Diagnostic info strip */}
            <div className="bg-slate-950/60 p-4 border-b border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">URL do Webhook</span>
                <span className="font-mono text-cyan-300 text-[11px] truncate block" title="/api/webhooks/whatsapp-receipts">
                  /api/webhooks/whatsapp-receipts
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Grupo Alvo</span>
                <span className="font-semibold text-white truncate block">
                  {config?.targetGroupName || 'REEMBOLSOS AGUERO INOX'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Eventos Registrados</span>
                <span className="font-bold font-mono text-emerald-400">
                  {webhookLogs.length} requisições gravadas
                </span>
              </div>
            </div>

            {/* Logs List Body */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {loadingLogs && webhookLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400 mx-auto mb-2" />
                  Carregando histórico do webhook...
                </div>
              ) : webhookLogs.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto" />
                  <strong className="text-sm text-slate-300 block">Nenhuma requisição recebida no Webhook ainda</strong>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Assim que seu provedor (Evolution API ou Z-API) disparar um handshake ou um técnico postar um cupom no grupo, o log detalhado aparecerá aqui instantaneamente.
                  </p>
                </div>
              ) : (
                webhookLogs.map((log) => {
                  const isSuccess = log.status === 'sucesso';
                  const isError = log.status === 'erro';
                  const isHandshake = log.event?.includes('handshake');

                  return (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider ${
                              isSuccess
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : isError
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : isHandshake
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {log.method} • {log.event?.replace('_', ' ')}
                          </span>

                          {log.senderPhone && (
                            <span className="text-xs font-mono text-slate-300">
                              {log.senderPhone} {log.senderName ? `(${log.senderName})` : ''}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] font-mono text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString('pt-BR')} • {new Date(log.timestamp).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <p className="text-xs text-slate-200">
                        {log.summary}
                      </p>

                      {log.receiptId && (
                        <div className="text-[10px] font-mono text-cyan-400">
                          ID Comprovante: {log.receiptId}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
              <span>
                Mostrando até 100 requisições armazenadas no servidor.
              </span>
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
