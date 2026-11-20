import React, { useState, useRef, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Database,
  Search,
  Filter,
  FileText,
  Sparkles,
  UploadCloud,
  Image as ImageIcon,
  RotateCcw,
  Eye,
  Edit2,
  Trash2,
  ShieldCheck,
  Check,
} from 'lucide-react';
import {
  CommercialImportBatch,
  CommercialMaterial,
  ExtractedSupplierQuote,
  ImportItemDiff,
} from '../../types/commercial';
import {
  parseBomSpreadsheet,
  saveImportBatch,
  saveMaterial,
  downloadSampleExcelTemplate,
  downloadSampleSupplierQuotePdf,
  callParseSupplierQuotePdfApi,
  detectDuplicatesInCatalog,
  enrichSupplierQuoteWithComparison,
  isImageFileType,
  isSupportedQuoteFile,
  compareSpreadsheetWithCatalog,
  executeSpreadsheetImportWithResolution,
  revertImportBatch,
  deleteImportBatch,
} from '../../services/commercialService';
import { SupplierQuotePdfModal } from './SupplierQuotePdfModal';
import { SpreadsheetComparisonModal } from './SpreadsheetComparisonModal';
import { BatchDetailAndEditModal } from './BatchDetailAndEditModal';

interface CommercialImportsManagerProps {
  organizationId: string;
  catalog?: CommercialMaterial[];
  importBatches: CommercialImportBatch[];
  userId: string;
  userName: string;
  onRefresh: () => Promise<void>;
}

export const CommercialImportsManager: React.FC<CommercialImportsManagerProps> = ({
  organizationId,
  catalog = [],
  importBatches,
  userId,
  userName,
  onRefresh,
}) => {
  const [importType, setImportType] = useState<'CATALOGO_PRECOS' | 'BOM_PROPOSTA' | 'COTACAO_PDF'>('CATALOGO_PRECOS');
  const [file, setFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [extractedPdfQuote, setExtractedPdfQuote] = useState<ExtractedSupplierQuote | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Spreadsheet pre-import comparison modal state
  const [pendingSpreadsheetData, setPendingSpreadsheetData] = useState<{
    fileName: string;
    sourceType: 'CATALOGO_PRECOS' | 'BOM_PROPOSTA';
    diffs: ImportItemDiff[];
  } | null>(null);
  const [isSavingSpreadsheet, setIsSavingSpreadsheet] = useState(false);

  // Batch inspection & editing modal state
  const [selectedBatchForDetail, setSelectedBatchForDetail] = useState<CommercialImportBatch | null>(null);

  // Rollback confirmation modal state
  const [batchToRollback, setBatchToRollback] = useState<CommercialImportBatch | null>(null);
  const [isRevertingBatch, setIsRevertingBatch] = useState(false);

  // History search and filter state
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'todos' | 'processado' | 'revertido'>('todos');

  // Download Standard Template Excel File
  const handleDownloadExcelTemplate = () => {
    downloadSampleExcelTemplate();
  };

  // Download Sample Supplier Quote PDF File
  const handleDownloadPdfTemplate = () => {
    downloadSampleSupplierQuotePdf();
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      const isImg = isImageFileType(droppedFile.name, droppedFile.type);
      const isPdf = droppedFile.name.toLowerCase().endsWith('.pdf') || droppedFile.type === 'application/pdf';
      if (isImg) {
        setImportType('COTACAO_PDF');
        const previewUrl = URL.createObjectURL(droppedFile);
        setImagePreviewUrl(previewUrl);
      } else if (isPdf) {
        setImportType('COTACAO_PDF');
        setImagePreviewUrl(null);
      } else {
        setImagePreviewUrl(null);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      const isImg = isImageFileType(selectedFile.name, selectedFile.type);
      const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf';
      if (isImg) {
        setImportType('COTACAO_PDF');
        const previewUrl = URL.createObjectURL(selectedFile);
        setImagePreviewUrl(previewUrl);
      } else if (isPdf) {
        setImportType('COTACAO_PDF');
        setImagePreviewUrl(null);
      } else {
        setImagePreviewUrl(null);
      }
    } else {
      setImagePreviewUrl(null);
    }
  };

  // Process Catalog / Price List File or Supplier Quote PDF/Image
  const handleProcessImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage('Selecione um arquivo de cotação (.pdf, .jpg, .png) ou planilha (.xlsx, .csv).');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = isImageFileType(file.name, file.type);
    const isWord = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

    if (isPdf || isImage || isWord) {
      // Process PDF, Image (JPG, PNG), or Word (.docx) using Gemini multimodal document parsing with comparison modal
      try {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const base64 = evt.target?.result as string;
            let detectedMime = file.type;
            if (!detectedMime) {
              if (isImage) detectedMime = file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
              else if (isPdf) detectedMime = 'application/pdf';
              else if (isWord) detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }

            const rawExtracted = await callParseSupplierQuotePdfApi(base64, file.name, detectedMime || 'application/pdf', catalog);

            // Detect existing items in current catalog and calculate price variations
            const enrichedQuote = enrichSupplierQuoteWithComparison(rawExtracted, catalog);

            setExtractedPdfQuote({
              ...enrichedQuote,
              filePreviewUrl: isImage ? base64 : rawExtracted.filePreviewUrl,
              fileType: detectedMime,
            });
            setIsProcessing(false);
          } catch (err: any) {
            setErrorMessage(`Erro ao processar ${isImage ? 'imagem' : 'documento'} da cotação: ${err?.message || 'Arquivo ilegível'}`);
            setIsProcessing(false);
          }
        };
        reader.onerror = () => {
          setErrorMessage(`Erro ao carregar o arquivo no navegador.`);
          setIsProcessing(false);
        };
        reader.readAsDataURL(file);
      } catch (err: any) {
        setErrorMessage(`Falha na leitura do arquivo: ${err?.message || 'Erro inesperado'}`);
        setIsProcessing(false);
      }
      return;
    }

    // Process Spreadsheet (.xlsx, .xls, .csv) with Pre-Import Comparison against existing Catalog
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseBomSpreadsheet(buffer, file.name);

      if (parsed.rows.length === 0) {
        throw new Error('Nenhuma linha de material encontrada na planilha.');
      }

      // Run comparison engine against existing catalog to detect duplicates, new items, and price variations
      const diffs = compareSpreadsheetWithCatalog(parsed.rows, catalog);

      setPendingSpreadsheetData({
        fileName: file.name,
        sourceType: importType === 'BOM_PROPOSTA' ? 'BOM_PROPOSTA' : 'CATALOGO_PRECOS',
        diffs,
      });
    } catch (err: any) {
      setErrorMessage(`Falha na leitura da planilha: ${err.message || 'Erro inesperado ao ler planilha'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirm and Execute Spreadsheet Import after user reviewed duplicates and choices
  const handleConfirmSpreadsheetImport = async (resolvedDiffs: ImportItemDiff[]) => {
    if (!pendingSpreadsheetData) return;
    setIsSavingSpreadsheet(true);
    setErrorMessage('');
    try {
      const result = await executeSpreadsheetImportWithResolution(
        organizationId,
        resolvedDiffs,
        pendingSpreadsheetData.fileName,
        pendingSpreadsheetData.sourceType,
        userId,
        userName,
        catalog
      );

      setSuccessMessage(
        `Importação concluída com sucesso! Lote ${result.batch.batchCode}: ${result.createdCount} novos materiais inseridos, ${result.updatedCount} preços atualizados e ${result.ignoredCount} duplicados/linhas ignoradas.`
      );
      setPendingSpreadsheetData(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await onRefresh();
    } catch (err: any) {
      setErrorMessage(`Falha ao gravar importação: ${err.message || 'Erro inesperado'}`);
    } finally {
      setIsSavingSpreadsheet(false);
    }
  };

  // Delete batch and its imported materials from history table
  const handleExecuteDeleteBatch = async () => {
    if (!batchToRollback) return;
    setIsRevertingBatch(true);
    setErrorMessage('');
    try {
      const result = await deleteImportBatch(batchToRollback.id, organizationId);
      setSuccessMessage(
        `Lote ${batchToRollback.batchCode} excluído com sucesso! ${result.deletedMaterialsCount} materiais importados foram removidos do catálogo e o registro do lote foi apagado.`
      );
      setBatchToRollback(null);
      await onRefresh();
    } catch (err: any) {
      setErrorMessage(`Falha ao excluir lote: ${err.message || 'Erro inesperado'}`);
    } finally {
      setIsRevertingBatch(false);
    }
  };

  // Filtered import batches for history table
  const filteredBatches = useMemo(() => {
    return importBatches.filter((b) => {
      if (historyStatusFilter === 'processado' && (b.status === 'revertido' || b.isReverted)) return false;
      if (historyStatusFilter === 'revertido' && b.status !== 'revertido' && !b.isReverted) return false;

      if (!historySearch) return true;
      const term = historySearch.toLowerCase();
      return (
        b.batchCode.toLowerCase().includes(term) ||
        b.fileName.toLowerCase().includes(term) ||
        b.importedByName.toLowerCase().includes(term)
      );
    });
  }, [importBatches, historyStatusFilter, historySearch]);

  return (
    <div className="space-y-6">
      {/* Top Header with Dual Template Download Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Central de Importações & Carga de Lotes</span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              PDF / Imagens / Excel / CSV
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Importação com comparativo inteligente anti-duplicidade, validação de preços, histórico auditável e rollback completo de cargas.
          </p>
        </div>

        {/* Action Buttons for Downloading Templates */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadExcelTemplate}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold text-xs rounded-lg border border-emerald-800/80 transition shadow cursor-pointer"
            title="Baixar planilha padrão (.xlsx) para preenchimento de materiais e preços"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Baixar Modelo (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdfTemplate}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs rounded-lg border border-cyan-800/80 transition shadow cursor-pointer"
            title="Baixar exemplo de cotação formal em PDF pronta para anexar e testar extração"
          >
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Baixar Modelo Cotação (.pdf)</span>
          </button>
        </div>
      </div>

      {/* Upload Form Card with Drag and Drop */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-5 shadow-2xl text-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4 border-b border-slate-800 pb-2 flex items-center justify-between">
          <span>Nova Importação de Arquivo</span>
          <span className="text-[11px] text-slate-400 font-normal">Formatos aceitos: .pdf, .jpg, .jpeg, .png, .xlsx, .xls, .csv</span>
        </h3>

        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleProcessImport} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 mb-1.5 font-medium">Finalidade do Arquivo *</label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              >
                <option value="CATALOGO_PRECOS">Enriquecer Catálogo Interno de Preços (.xlsx / .csv)</option>
                <option value="COTACAO_PDF">Cotação de Fornecedor em PDF / Imagem JPG, PNG (Extração IA + Prévia)</option>
                <option value="BOM_PROPOSTA">Lista de Materiais de Proposta (BOM)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1.5 font-medium">Arquivo Anexo (.pdf, .jpg, .png, .xlsx, .csv) *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="w-full text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer bg-slate-900 border border-slate-700 rounded-lg p-1"
              />
            </div>
          </div>

          {/* Drag & Drop Visual Box */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/40'
                : 'border-slate-700/80 hover:border-cyan-500/50 bg-slate-900/40'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 overflow-hidden">
                {file ? (
                  imagePreviewUrl ? (
                    <img src={imagePreviewUrl} alt="Prévia" className="w-full h-full object-cover rounded-xl" />
                  ) : file.name.toLowerCase().endsWith('.pdf') ? (
                    <FileText className="w-6 h-6 text-cyan-400" />
                  ) : isImageFileType(file.name, file.type) ? (
                    <ImageIcon className="w-6 h-6 text-amber-400" />
                  ) : (
                    <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                  )
                ) : (
                  <UploadCloud className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div>
                {file ? (
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Arquivo selecionado: <span className="text-cyan-300 font-mono">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
                    </p>
                    {isImageFileType(file.name, file.type) && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/60">
                        <ImageIcon className="w-3 h-3 text-amber-400" /> Imagem reconhecida para extração multimodal com IA
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-300">
                    Arraste e solte sua cotação em <strong className="text-cyan-300">.PDF</strong>, Imagem <strong className="text-amber-300">.JPG / .PNG</strong> ou planilha em <strong className="text-emerald-300">.XLSX / .CSV</strong> aqui
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Toda importação exibe uma tela comparativa pré-gravação para identificar duplicidades, variações de preço e novos itens antes de atualizar o catálogo.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-400 text-[11px] space-y-1">
            <p className="font-semibold text-slate-300">Proteção Anti-Duplicidade & Rastreabilidade Integral:</p>
            <p>• <strong>Comparativo Pré-Importação:</strong> Itens com códigos ou descrições idênticas são mapeados contra o catálogo atual. Você pode decidir atualizar o preço, cadastrar como novo ou ignorar duplicados.</p>
            <p>• <strong>Histórico com Rollback:</strong> Todo lote importado registra o estado anterior dos preços e os itens criados. Qualquer carga pode ser revertida ou editada a qualquer momento.</p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-400">Modelos prontos:</span>
              <button
                type="button"
                onClick={handleDownloadExcelTemplate}
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" /> Modelo .XLSX
              </button>
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={handleDownloadPdfTemplate}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" /> Modelo .PDF
              </button>
            </div>

            <button
              type="submit"
              disabled={!file || isProcessing}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Analisando e Comparando...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>
                    {file?.name.toLowerCase().endsWith('.pdf') || isImageFileType(file?.name || '', file?.type || '')
                      ? 'Analisar e Revisar Documento'
                      : 'Comparar e Revisar Planilha'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Import Batches History Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Histórico de Lotes de Importação ({importBatches.length})</span>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Auditoria com Rollback
              </span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Visualize itens importados, altere preços diretamente ou reverta cargas completas
            </span>
          </div>

          {/* Filter Controls for History */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar lote..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select
              value={historyStatusFilter}
              onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="todos">Todos os Status</option>
              <option value="processado">Ativos (Processados)</option>
              <option value="revertido">Revertidos (Desfeitos)</option>
            </select>
          </div>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Nenhum lote encontrado com os critérios de busca.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Código do Lote</th>
                  <th className="py-2.5 px-3">Nome do Arquivo</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-center">Lidas</th>
                  <th className="py-2.5 px-3 text-center">Aceitas</th>
                  <th className="py-2.5 px-3 text-center">Duplicadas</th>
                  <th className="py-2.5 px-3">Responsável</th>
                  <th className="py-2.5 px-3">Data / Hora</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredBatches.map((b) => {
                  const isReverted = b.status === 'revertido' || b.isReverted;

                  return (
                    <tr key={b.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-3 font-bold text-cyan-300">{b.batchCode}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-200">{b.fileName}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px]">
                        {b.sourceType === 'COTACAO_FORNECEDOR'
                          ? 'Cotação (PDF/Scan)'
                          : b.sourceType === 'CATALOGO_PRECOS'
                          ? 'Catálogo de Preços'
                          : 'BOM de Proposta'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-400">{b.totalRowsRead}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{b.acceptedRows}</td>
                      <td className="py-2.5 px-3 text-center text-amber-400">{b.duplicateRows}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">{b.importedByName}</td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] font-sans">
                        {new Date(b.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        {isReverted ? (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            title={`Revertido por ${b.revertedByName || 'Administrador'}`}
                          >
                            REVERTIDO
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            PROCESSADO
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* View & Edit Items of this batch */}
                          <button
                            type="button"
                            onClick={() => setSelectedBatchForDetail(b)}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded text-[11px] font-medium transition cursor-pointer border border-slate-700"
                            title="Ver e alterar itens ou preços deste lote"
                          >
                            <Eye className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Ver/Alterar</span>
                          </button>

                          {/* Delete batch button */}
                          <button
                            type="button"
                            onClick={() => setBatchToRollback(b)}
                            className="flex items-center gap-1 px-2 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded text-[11px] font-medium transition cursor-pointer border border-rose-600/40"
                            title="Excluir este lote e todos os materiais importados por ele"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Excluir</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Batch Confirmation Modal */}
      {batchToRollback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0B132B] border-2 border-rose-600/80 rounded-xl shadow-2xl p-5 max-w-lg w-full text-slate-100 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-lg bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Excluir Lote de Importação <span className="text-cyan-300 font-mono">{batchToRollback.batchCode}</span>?
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Arquivo: <strong className="text-slate-200">{batchToRollback.fileName}</strong>
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-200/90 space-y-2">
              <p className="font-semibold text-rose-300">Ao confirmar a exclusão deste lote:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                <li>
                  <strong className="text-rose-300">Todos os materiais criados</strong> por esta importação serão permanentemente excluídos do catálogo.
                </li>
                <li>
                  <strong className="text-blue-300">Materiais que tiveram seus preços atualizados</strong> retornarão aos valores originais anteriores.
                </li>
                <li>O registro deste lote de importação será apagado do sistema.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBatchToRollback(null)}
                disabled={isRevertingBatch}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleExecuteDeleteBatch}
                disabled={isRevertingBatch}
                className="flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition shadow-lg cursor-pointer disabled:opacity-50"
              >
                {isRevertingBatch ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Excluindo Lote e Materiais...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Exclusão do Lote</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Import Comparison & Duplicate Resolution Modal for Spreadsheets */}
      {pendingSpreadsheetData && (
        <SpreadsheetComparisonModal
          fileName={pendingSpreadsheetData.fileName}
          sourceType={pendingSpreadsheetData.sourceType}
          diffs={pendingSpreadsheetData.diffs}
          isSaving={isSavingSpreadsheet}
          onConfirm={handleConfirmSpreadsheetImport}
          onClose={() => setPendingSpreadsheetData(null)}
        />
      )}

      {/* Batch Details & Material Edit Modal */}
      {selectedBatchForDetail && (
        <BatchDetailAndEditModal
          batch={selectedBatchForDetail}
          catalog={catalog}
          userId={userId}
          userName={userName}
          onClose={() => setSelectedBatchForDetail(null)}
          onRefresh={async () => {
            await onRefresh();
            // Refresh batch state if still open
            const refreshed = importBatches.find((b) => b.id === selectedBatchForDetail.id);
            if (refreshed) setSelectedBatchForDetail(refreshed);
          }}
        />
      )}

      {/* Editable Verification Modal for PDF Supplier Quote */}
      {extractedPdfQuote && (
        <SupplierQuotePdfModal
          organizationId={organizationId}
          quoteData={extractedPdfQuote}
          userName={userName}
          onClose={() => {
            setExtractedPdfQuote(null);
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          onSuccess={async () => {
            setExtractedPdfQuote(null);
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setSuccessMessage('Itens da cotação validados e incorporados com sucesso ao catálogo!');
            await onRefresh();
          }}
        />
      )}
    </div>
  );
};
