import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Tag,
  Edit2,
  Layers,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Download,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Trash2,
  Link2,
  Unlink,
} from 'lucide-react';
import type { Item } from '../../types';
import { CommercialMaterial, PriceSourceType, ExtractedSupplierQuote } from '../../types/commercial';
import {
  isQuoteValid,
  saveMaterial,
  deleteMaterial,
  callParseSupplierQuotePdfApi,
  detectDuplicatesInCatalog,
  enrichSupplierQuoteWithComparison,
  downloadSampleExcelTemplate,
  downloadSampleSupplierQuotePdf,
  isImageFileType,
  isSupportedQuoteFile,
  filterMaterialsByMultiToken,
  STANDARD_INDUSTRIAL_CATALOG,
} from '../../services/commercialService';
import {
  listMasterCatalogItems,
  suggestMasterItemMatches,
  confirmMaterialMasterLink,
  clearMaterialMasterLink,
  auditMaterialCatalogLinks,
} from '../../services/materialCatalogLinkService';
import { useAuth } from '../../contexts/AuthContext';
import { SupplierQuotePdfModal } from './SupplierQuotePdfModal';

interface CommercialMaterialsCatalogProps {
  organizationId: string;
  catalog: CommercialMaterial[];
  userName: string;
  onRefresh: () => Promise<void>;
}

export const CommercialMaterialsCatalog: React.FC<CommercialMaterialsCatalogProps> = ({
  organizationId,
  catalog,
  userName,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [sourceFilter, setSourceFilter] = useState<'todos' | 'empresa' | 'padroes'>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<CommercialMaterial | null>(null);
  const [saving, setSaving] = useState(false);
  const [absorbingId, setAbsorbingId] = useState<string | null>(null);

  // Master catalog (`items`) explicit human-review linking state
  const [masterItems, setMasterItems] = useState<Item[]>([]);
  const [linkingMaterial, setLinkingMaterial] = useState<CommercialMaterial | null>(null);
  const [masterSearchTerm, setMasterSearchTerm] = useState('');
  const [masterLinkNotes, setMasterLinkNotes] = useState('');
  const [linkingBusy, setLinkingBusy] = useState(false);
  const [linkingError, setLinkingError] = useState('');

  useEffect(() => {
    let active = true;
    if (!organizationId) {
      setMasterItems([]);
      return;
    }
    listMasterCatalogItems(organizationId)
      .then((items) => {
        if (active) setMasterItems(items);
      })
      .catch((err) => {
        console.warn('Falha ao carregar itens do catálogo mestre:', err);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  const masterLinkAudit = useMemo(
    () =>
      auditMaterialCatalogLinks({
        orgId: organizationId,
        commercialMaterials: catalog,
        masterItems,
      }),
    [organizationId, catalog, masterItems],
  );

  const linkSuggestions = useMemo(() => {
    if (!linkingMaterial) return [];
    return suggestMasterItemMatches(linkingMaterial, masterItems, 6);
  }, [linkingMaterial, masterItems]);

  const filteredMasterItems = useMemo(() => {
    const q = masterSearchTerm.trim().toLowerCase();
    const activeItems = masterItems.filter((i) => i.active && i.status !== 'INACTIVE');
    if (!q) return activeItems.slice(0, 20);
    return activeItems
      .filter((i) =>
        `${i.sku || ''} ${i.code || ''} ${i.name || ''} ${i.description || ''}`.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [masterItems, masterSearchTerm]);

  const handleOpenMasterLink = (mat: CommercialMaterial) => {
    setLinkingMaterial(mat);
    setMasterSearchTerm('');
    setMasterLinkNotes(mat.masterLinkNotes || '');
    setLinkingError('');
  };

  const handleConfirmMasterLink = async (masterItemId: string) => {
    if (!linkingMaterial) return;
    setLinkingBusy(true);
    setLinkingError('');
    try {
      await confirmMaterialMasterLink({
        orgId: organizationId,
        materialId: linkingMaterial.id,
        masterItemId,
        actorUid: user?.uid || 'unknown',
        actorName: userName || user?.displayName || 'Usuário',
        notes: masterLinkNotes.trim() || undefined,
      });
      setLinkingMaterial(null);
      setPdfSuccess('Vínculo explícito com o catálogo mestre confirmado com sucesso.');
      setTimeout(() => setPdfSuccess(''), 4000);
      await onRefresh();
    } catch (err: any) {
      setLinkingError(err?.message || 'Falha ao confirmar vínculo com o catálogo mestre.');
    } finally {
      setLinkingBusy(false);
    }
  };

  const handleClearMasterLink = async () => {
    if (!linkingMaterial) return;
    setLinkingBusy(true);
    setLinkingError('');
    try {
      await clearMaterialMasterLink({
        orgId: organizationId,
        materialId: linkingMaterial.id,
        actorUid: user?.uid || 'unknown',
        actorName: userName || user?.displayName || 'Usuário',
        reason: masterLinkNotes.trim() || undefined,
      });
      setLinkingMaterial(null);
      setPdfSuccess('Vínculo com o catálogo mestre removido.');
      setTimeout(() => setPdfSuccess(''), 4000);
      await onRefresh();
    } catch (err: any) {
      setLinkingError(err?.message || 'Falha ao desvincular material.');
    } finally {
      setLinkingBusy(false);
    }
  };

  // Form states
  const [internalCode, setInternalCode] = useState('');
  const [mfgCode, setMfgCode] = useState('');
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Tubulações');
  const [unit, setUnit] = useState('UN');
  const [baseCost, setBaseCost] = useState<number>(0);
  const [currency, setCurrency] = useState('BRL');
  const [supplierName, setSupplierName] = useState('');
  const [sourceType, setSourceType] = useState<PriceSourceType>('cotacao_confirmada');
  const [validityDays, setValidityDays] = useState<number>(30);
  const [materialGrade, setMaterialGrade] = useState('');
  const [dimension, setDimension] = useState('');
  const [scheduleClass, setScheduleClass] = useState('');
  const [connectionType, setConnectionType] = useState('');
  const [standardNorm, setStandardNorm] = useState('');

  // PDF Quote Drag & Drop and AI State
  const [isDragging, setIsDragging] = useState(false);
  const [analyzingPdf, setAnalyzingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfSuccess, setPdfSuccess] = useState('');
  const [extractedQuoteModalData, setExtractedQuoteModalData] = useState<ExtractedSupplierQuote | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleProcessPdfFile = async (file: File) => {
    if (!file) return;

    if (!isSupportedQuoteFile(file.name, file.type)) {
      setPdfError('Formato de arquivo não suportado. Por favor, envie um arquivo em Imagem (JPG, PNG), PDF, Word (.docx), Planilha (.xlsx/.csv) ou texto.');
      return;
    }

    const isImg = isImageFileType(file.name, file.type);

    setAnalyzingPdf(true);
    setPdfError('');
    setPdfSuccess('');

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = e.target?.result as string;
          let detectedMime = file.type;
          if (!detectedMime) {
            if (isImg) detectedMime = file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            else if (file.name.toLowerCase().endsWith('.pdf')) detectedMime = 'application/pdf';
            else if (file.name.toLowerCase().endsWith('.docx')) detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (file.name.toLowerCase().endsWith('.xlsx')) detectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          }

          const rawExtracted = await callParseSupplierQuotePdfApi(base64, file.name, detectedMime || 'application/pdf', catalog);

          // Enrich quote items with active comparison metrics against existing catalog
          const enrichedQuote = enrichSupplierQuoteWithComparison(rawExtracted, catalog);

          setExtractedQuoteModalData({
            ...enrichedQuote,
            filePreviewUrl: isImg ? base64 : rawExtracted.filePreviewUrl,
            fileType: detectedMime,
          });
        } catch (err: any) {
          setPdfError(err?.message || 'Falha ao analisar cotação via IA.');
        } finally {
          setAnalyzingPdf(false);
        }
      };

      reader.onerror = () => {
        setPdfError('Erro ao ler arquivo no navegador.');
        setAnalyzingPdf(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setPdfError(err?.message || 'Falha ao carregar arquivo.');
      setAnalyzingPdf(false);
    }
  };

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
      handleProcessPdfFile(droppedFile);
    }
  };

  // Combine company materials with benchmark standards
  const combinedCatalog = [
    ...catalog,
    ...STANDARD_INDUSTRIAL_CATALOG.filter(
      (s) => !catalog.some((c) => (c.internalCode || '').trim().toLowerCase() === s.internalCode.toLowerCase())
    ),
  ];

  const baseMaterials =
    sourceFilter === 'empresa'
      ? catalog
      : sourceFilter === 'padroes'
      ? STANDARD_INDUSTRIAL_CATALOG
      : combinedCatalog;

  // Distinct categories
  const categories = Array.from(new Set(baseMaterials.map((m) => m.category).filter(Boolean)));

  // Intelligent Multi-Token Search (matches any terms, e.g. "tee 304" finds all Tês and Inox 304 items)
  const filtered = filterMaterialsByMultiToken(baseMaterials, searchTerm, categoryFilter);

  const validQuotesCount = baseMaterials.filter((m) => isQuoteValid(m.quoteDate, m.validityDays)).length;
  const expiredQuotesCount = baseMaterials.length - validQuotesCount;

  const handleAbsorbBenchmark = async (mat: CommercialMaterial) => {
    setAbsorbingId(mat.id);
    try {
      const payload: CommercialMaterial = {
        ...mat,
        id: `mat_${Date.now()}`,
        organizationId,
        createdAt: new Date().toISOString(),
      };
      await saveMaterial(payload);
      await onRefresh();
      setPdfSuccess(`Insumo ${mat.internalCode} (${mat.originalDescription}) absorvido no seu catálogo com sucesso!`);
      setTimeout(() => setPdfSuccess(''), 4000);
    } catch (err: any) {
      setPdfError(`Falha ao absorver insumo: ${err.message || 'Erro inesperado'}`);
    } finally {
      setAbsorbingId(null);
    }
  };

  const handleOpenNew = () => {
    setEditingMaterial(null);
    setInternalCode(`MAT-${Date.now().toString().slice(-5)}`);
    setMfgCode('');
    setBrand('');
    setDescription('');
    setCategory('Tubulações');
    setUnit('UN');
    setBaseCost(0);
    setSupplierName('');
    setSourceType('cotacao_confirmada');
    setValidityDays(30);
    setMaterialGrade('');
    setDimension('');
    setScheduleClass('');
    setConnectionType('');
    setStandardNorm('');
    setModalOpen(true);
  };

  const handleOpenEdit = (m: CommercialMaterial) => {
    setEditingMaterial(m);
    setInternalCode(m.internalCode);
    setMfgCode(m.manufacturerCode || '');
    setBrand(m.brand || '');
    setDescription(m.originalDescription);
    setCategory(m.category || 'Geral');
    setUnit(m.unit);
    setBaseCost(m.baseCost);
    setCurrency(m.currency || 'BRL');
    setSupplierName(m.supplierName || '');
    setSourceType(m.sourceType);
    setValidityDays(m.validityDays || 30);
    setMaterialGrade(m.technicalSpecs.materialGrade || '');
    setDimension(m.technicalSpecs.dimension || '');
    setScheduleClass(m.technicalSpecs.scheduleClass || '');
    setConnectionType(m.technicalSpecs.connectionType || '');
    setStandardNorm(m.technicalSpecs.standardNorm || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internalCode.trim() || !description.trim() || baseCost <= 0) {
      alert('Preencha código, descrição e custo-base válido.');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const materialPayload: CommercialMaterial = {
        id: editingMaterial?.id || `mat_${Date.now()}`,
        organizationId,
        internalCode: internalCode.trim().toUpperCase(),
        manufacturerCode: mfgCode.trim() || undefined,
        brand: brand.trim() || undefined,
        originalDescription: description.trim(),
        normalizedDescription: description.trim().toUpperCase(),
        technicalSpecs: {
          materialGrade: materialGrade.trim() || undefined,
          dimension: dimension.trim() || undefined,
          scheduleClass: scheduleClass.trim() || undefined,
          connectionType: connectionType.trim() || undefined,
          standardNorm: standardNorm.trim() || undefined,
        },
        unit: unit.trim().toUpperCase(),
        baseCost,
        currency,
        supplierName: supplierName.trim() || undefined,
        sourceType,
        quoteDate: editingMaterial?.quoteDate || today,
        validityDays,
        category,
        importedBy: userName,
        createdAt: editingMaterial?.createdAt || new Date().toISOString(),
        ...(editingMaterial?.masterItemId
          ? {
              masterItemId: editingMaterial.masterItemId,
              masterItemSku: editingMaterial.masterItemSku,
              masterItemName: editingMaterial.masterItemName,
              masterLinkStatus: editingMaterial.masterLinkStatus,
              masterLinkConfirmedBy: editingMaterial.masterLinkConfirmedBy,
              masterLinkConfirmedAt: editingMaterial.masterLinkConfirmedAt,
              masterLinkNotes: editingMaterial.masterLinkNotes,
            }
          : {}),
      };

      await saveMaterial(materialPayload);
      setModalOpen(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleDeleteMaterial = async (matId: string, desc: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o material "${desc}" do catálogo?`)) return;
    try {
      await deleteMaterial(matId);
      await onRefresh();
    } catch (err: any) {
      alert(`Erro ao excluir material: ${err.message || 'Falha inesperada'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Catálogo Interno de Materiais & Preços</span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              {catalog.length} itens
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Base oficial de busca para cruzamento automatizado com listas de materiais (BOM).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.doc,.xlsx,.xls,.csv,.txt,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleProcessPdfFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            onClick={() => pdfInputRef.current?.click()}
            disabled={analyzingPdf}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs rounded-lg border border-cyan-800/80 transition shadow disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Comparar & Absorver Cotação (IA)</span>
          </button>

          <button
            onClick={downloadSampleSupplierQuotePdf}
            className="hidden sm:flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
            title="Baixar Modelo de Cotação em PDF"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Modelo .PDF</span>
          </button>

          <button
            onClick={downloadSampleExcelTemplate}
            className="hidden sm:flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
            title="Baixar Modelo de Planilha em Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Modelo .XLSX</span>
          </button>

          <button
            onClick={handleOpenNew}
            className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg transition shadow-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Manual</span>
          </button>
        </div>
      </div>

      {pdfSuccess && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{pdfSuccess}</span>
        </div>
      )}

      {pdfError && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{pdfError}</span>
        </div>
      )}

      {/* DRAG & DROP ZONE FOR MULTI-FORMAT SUPPLIER QUOTES */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-6 sm:p-7 transition text-center relative overflow-hidden ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/50 ring-4 ring-cyan-500/20 shadow-2xl'
            : 'border-slate-700/80 hover:border-cyan-500/50 bg-[#0B132B]/80'
        }`}
      >
        {analyzingPdf ? (
          <div className="py-4 space-y-3">
            <div className="w-10 h-10 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span>Processando Cotação & Comparando com Catálogo Existente...</span>
              </p>
              <p className="text-xs text-cyan-300 mt-1 max-w-lg mx-auto">
                Extraindo itens, marcas, códigos, ligas de inox e calculando a variação de preços em relação ao seu histórico de compras...
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-inner" title="Imagens (JPG, PNG)">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-inner" title="Documentos PDF">
                <FileText className="w-5 h-5" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shadow-inner" title="Word (.DOCX)">
                <FileText className="w-5 h-5" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-inner" title="Planilhas (.XLSX, CSV)">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                <span>Leitor Inteligente de Cotações (Imagens JPG/PNG, PDF, Word ou Excel)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Comparativo Automático
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xl mx-auto">
                Solte qualquer arquivo de orçamento recebido. A IA identifica os materiais, <strong className="text-emerald-300">compara com os preços já praticados no seu catálogo</strong>, destaca a economia e permite absorver ou atualizar a base com um clique.
              </p>
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-lg border border-cyan-800/80 transition cursor-pointer flex items-center gap-1.5"
              >
                <UploadCloud className="w-4 h-4 text-cyan-400" />
                <span>Selecionar Arquivo (Foto, PDF, Word ou Planilha)</span>
              </button>
              <span className="text-xs text-slate-500">ou arraste para este quadro</span>
            </div>

            {/* Quick Template Download Links inside Dropzone */}
            <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
              <span>Baixar modelos oficiais para teste:</span>
              <button
                type="button"
                onClick={downloadSampleSupplierQuotePdf}
                className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Download className="w-3 h-3" /> Modelo de Cotação (.PDF)
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={downloadSampleExcelTemplate}
                className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Download className="w-3 h-3" /> Modelo de Planilha (.XLSX)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl text-xs">
          <span className="text-slate-400 block mb-1">Total de Materiais Catalogados</span>
          <p className="text-xl font-bold font-mono text-white">{catalog.length}</p>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl text-xs">
          <span className="text-slate-400 block mb-1">Cotações Válidas</span>
          <p className="text-xl font-bold font-mono text-emerald-400">{validQuotesCount}</p>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl text-xs">
          <span className="text-slate-400 block mb-1">Cotações Expiradas / Para Revalidação</span>
          <p className="text-xl font-bold font-mono text-amber-400">{expiredQuotesCount}</p>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl text-xs">
          <span className="text-slate-400 block mb-1">Vinculados ao Catálogo Mestre</span>
          <p className="text-xl font-bold font-mono text-cyan-400">
            {masterLinkAudit.linkedCount}
            <span className="text-xs font-normal text-slate-400 ml-1">/ {masterLinkAudit.totalCommercialMaterials}</span>
          </p>
          {masterLinkAudit.brokenLinkCount > 0 && (
            <span className="text-[10px] text-rose-400 mt-0.5 block">
              {masterLinkAudit.brokenLinkCount} vínculo(s) quebrado(s)
            </span>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-lg">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Busca inteligente (ex: tee 304, curva 90, niple tc)..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              title="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>

        {/* Source Scope Toggle */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setSourceFilter('todos')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              sourceFilter === 'todos'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos ({combinedCatalog.length})
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('empresa')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              sourceFilter === 'empresa'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Cadastrados na Empresa ({catalog.length})
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('padroes')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              sourceFilter === 'padroes'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Padrões Inox ({STANDARD_INDUSTRIAL_CATALOG.length})
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-400">Categoria:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="todos">Todas as Categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Código Interno</th>
                <th className="py-2.5 px-3">Cód. Fabr. / Marca</th>
                <th className="py-2.5 px-3">Descrição Técnica do Material</th>
                <th className="py-2.5 px-3">Especificações</th>
                <th className="py-2.5 px-3 text-center">Unid</th>
                <th className="py-2.5 px-3 text-right">Custo-Base</th>
                <th className="py-2.5 px-3">Fornecedor / Origem</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((mat) => {
                const isValid = isQuoteValid(mat.quoteDate, mat.validityDays);
                const isBenchmarkOnly = mat.organizationId === 'default' && !catalog.some((c) => c.internalCode.trim().toLowerCase() === mat.internalCode.trim().toLowerCase());

                return (
                  <tr key={mat.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-3 font-bold text-cyan-300">
                      <span>{mat.internalCode}</span>
                      {isBenchmarkOnly ? (
                        <span className="block text-[9px] text-amber-400 font-sans font-normal mt-0.5">
                          Referência Inox
                        </span>
                      ) : mat.masterItemId ? (
                        <span
                          className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-sans font-semibold text-emerald-300"
                          title={mat.masterItemName ? `Item mestre: ${mat.masterItemName}` : 'Vinculado ao catálogo mestre'}
                        >
                          <Link2 className="w-2.5 h-2.5" />
                          <span>Mestre: {mat.masterItemSku || mat.masterItemId}</span>
                        </span>
                      ) : (
                        <span className="block text-[9px] text-slate-500 font-sans font-normal mt-0.5">
                          Sem vínculo mestre
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      <span>{mat.manufacturerCode || '-'}</span>
                      {mat.brand && <span className="block text-[10px] text-slate-500">{mat.brand}</span>}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <p className="font-medium text-slate-200">{mat.normalizedDescription}</p>
                      <span className="text-[10px] text-slate-400">{mat.category}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-[11px] text-slate-300">
                      <span>
                        {mat.technicalSpecs.materialGrade || ''} {mat.technicalSpecs.dimension || ''}{' '}
                        {mat.technicalSpecs.scheduleClass || ''}
                      </span>
                      {mat.technicalSpecs.standardNorm && (
                        <span className="block text-[10px] text-slate-500">{mat.technicalSpecs.standardNorm}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{mat.unit}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{formatBrl(mat.baseCost)}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="text-slate-200 font-medium block">{mat.supplierName || 'Interno'}</span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            isValid
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {isValid ? 'Válido' : 'Expirado'}
                        </span>
                        <span className="text-[10px] text-slate-500">{mat.quoteDate}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        {isBenchmarkOnly ? (
                          <button
                            onClick={() => handleAbsorbBenchmark(mat)}
                            disabled={absorbingId === mat.id}
                            className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold rounded transition cursor-pointer flex items-center gap-1 shadow-sm disabled:opacity-50"
                            title="Salvar e Absorver Insumo no Catálogo da Empresa"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{absorbingId === mat.id ? 'Salvando...' : 'Absorver'}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleOpenMasterLink(mat)}
                              className={`p-1 rounded transition cursor-pointer ${
                                mat.masterItemId
                                  ? 'bg-emerald-900/50 hover:bg-emerald-800/70 text-emerald-300'
                                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white'
                              }`}
                              title={
                                mat.masterItemId
                                  ? 'Gerenciar vínculo com o catálogo mestre (items)'
                                  : 'Vincular ao catálogo mestre de estoque (revisão humana)'
                              }
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(mat)}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white rounded transition cursor-pointer"
                              title="Editar Material"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteMaterial(mat.id, mat.originalDescription || mat.normalizedDescription)}
                              className="p-1 bg-slate-800 hover:bg-rose-900/60 text-rose-400 hover:text-white rounded transition cursor-pointer"
                              title="Excluir Material do Catálogo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Material Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B132B] border border-slate-700 rounded-xl max-w-2xl w-full p-5 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {editingMaterial ? 'Editar Material do Catálogo' : 'Novo Material no Catálogo Interno'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Código Interno *</label>
                  <input
                    type="text"
                    required
                    value={internalCode}
                    onChange={(e) => setInternalCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Código Fabricante</label>
                  <input
                    type="text"
                    value={mfgCode}
                    onChange={(e) => setMfgCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Marca / Fabricante</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Categoria *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  >
                    <option value="Tubulações">Tubulações</option>
                    <option value="Válvulas">Válvulas</option>
                    <option value="Conexões">Conexões</option>
                    <option value="Instrumentação">Instrumentação</option>
                    <option value="Fixação">Fixação</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Descrição Técnica Original *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Tubo de Aço Inox AISI 304 SCH 10 2 com costura"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>

              {/* Technical Specifications */}
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2">
                <span className="text-[11px] font-bold text-slate-300 block">Especificações Técnicas Detalhadas</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-0.5">Liga / Grau</label>
                    <input
                      type="text"
                      value={materialGrade}
                      onChange={(e) => setMaterialGrade(e.target.value)}
                      placeholder="Ex: AISI 304"
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-0.5">Dimensão / DN</label>
                    <input
                      type="text"
                      value={dimension}
                      onChange={(e) => setDimension(e.target.value)}
                      placeholder='Ex: 2" (DN50)'
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-0.5">Schedule / Classe</label>
                    <input
                      type="text"
                      value={scheduleClass}
                      onChange={(e) => setScheduleClass(e.target.value)}
                      placeholder="Ex: SCH 10 / 150#"
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-0.5">Conexão / Extremidade</label>
                    <input
                      type="text"
                      value={connectionType}
                      onChange={(e) => setConnectionType(e.target.value)}
                      placeholder="Ex: Solda BW / Flangeado"
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-slate-400 block mb-0.5">Norma Técnica</label>
                    <input
                      type="text"
                      value={standardNorm}
                      onChange={(e) => setStandardNorm(e.target.value)}
                      placeholder="Ex: ASTM A312 / ASME B16.5"
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Commercial & Cost Fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Unidade *</label>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Custo-Base (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={baseCost || ''}
                    onChange={(e) => setBaseCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Fonte do Preço</label>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  >
                    <option value="cotacao_confirmada">Cotação Confirmada</option>
                    <option value="compra_historica">Compra Histórica (NF-e)</option>
                    <option value="codigo_interno_exato">Tabela Interna</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Validade (dias)</label>
                  <input
                    type="number"
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Fornecedor / Origem da Cotação</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ex: Aperam / Bray / Tenaris"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Master Catalog (`items`) Human-Review Link Modal */}
      {linkingMaterial && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B132B] border border-slate-700 rounded-xl max-w-2xl w-full p-5 space-y-4 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-cyan-400" />
                  <span>Vínculo com Catálogo Mestre (Revisão Humana)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {linkingMaterial.internalCode} — {linkingMaterial.originalDescription} ({linkingMaterial.unit})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkingMaterial(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-cyan-950/40 border border-cyan-800/50 rounded-lg text-[11px] text-cyan-200">
              Sugestões assistidas por código e descrição técnica. Nenhum vínculo é aplicado automaticamente — confirme explicitamente o item correspondente do catálogo mestre (<code className="text-cyan-300">items</code>).
            </div>

            {linkingError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{linkingError}</span>
              </div>
            )}

            {linkingMaterial.masterItemId && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-700/50 rounded-lg flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block">
                    Vínculo Atual Confirmado
                  </span>
                  <span className="font-mono text-white font-semibold">
                    {linkingMaterial.masterItemSku || linkingMaterial.masterItemId}
                  </span>
                  {linkingMaterial.masterItemName && (
                    <span className="text-slate-300 ml-2">— {linkingMaterial.masterItemName}</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={linkingBusy}
                  onClick={handleClearMasterLink}
                  className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Desvincular</span>
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-300 mb-1">Observação da revisão (opcional)</label>
              <input
                type="text"
                value={masterLinkNotes}
                onChange={(e) => setMasterLinkNotes(e.target.value)}
                placeholder="Ex: Confirmado com almoxarifado / mesmo SKU ASTM A312"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>

            {/* Suggested Matches */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Sugestões Ranqueadas ({linkSuggestions.length})
              </h4>
              {linkSuggestions.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Nenhuma correspondência automática sugerida. Use a busca manual abaixo para escolher um item mestre.
                </p>
              ) : (
                <div className="space-y-2">
                  {linkSuggestions.map((sug) => (
                    <div
                      key={sug.itemId}
                      className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-300">{sug.itemSku}</span>
                          <span className="text-white font-medium">{sug.itemName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {sug.unitOfMeasure}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                            Afinidade {sug.score}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{sug.reasons.join(' • ')}</p>
                      </div>
                      <button
                        type="button"
                        disabled={linkingBusy || linkingMaterial.masterItemId === sug.itemId}
                        onClick={() => handleConfirmMasterLink(sug.itemId)}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-semibold shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        {linkingMaterial.masterItemId === sug.itemId ? 'Vinculado' : 'Confirmar Vínculo'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Search across all org master items */}
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Busca Manual no Catálogo Mestre ({masterItems.length} itens na empresa)
              </h4>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={masterSearchTerm}
                  onChange={(e) => setMasterSearchTerm(e.target.value)}
                  placeholder="Filtrar por SKU, código ou nome do item no estoque..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white"
                />
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-lg bg-slate-950/60">
                {filteredMasterItems.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500 text-center">Nenhum item ativo encontrado.</p>
                ) : (
                  filteredMasterItems.map((item) => (
                    <div
                      key={item.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-900/70"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-cyan-300 font-semibold mr-2">{item.sku}</span>
                        <span className="text-slate-200 truncate">{item.name}</span>
                        <span className="text-[10px] text-slate-500 ml-2">({item.unitOfMeasure})</span>
                      </div>
                      <button
                        type="button"
                        disabled={linkingBusy || linkingMaterial.masterItemId === item.id}
                        onClick={() => handleConfirmMasterLink(item.id)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white rounded text-[11px] font-semibold shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        {linkingMaterial.masterItemId === item.id ? 'Atual' : 'Vincular'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setLinkingMaterial(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Quote PDF Editable Preview Modal */}
      {extractedQuoteModalData && (
        <SupplierQuotePdfModal
          organizationId={organizationId}
          quoteData={extractedQuoteModalData}
          userName={userName}
          onClose={() => setExtractedQuoteModalData(null)}
          onSuccess={async () => {
            setPdfSuccess('Cotação em PDF processada e catálogo enriquecido com sucesso!');
            setTimeout(() => setPdfSuccess(''), 5000);
            await onRefresh();
          }}
        />
      )}
    </div>
  );
};
