import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Layers,
  Calendar,
  Building2,
  DollarSign,
  ShieldAlert,
  ArrowRight,
  Info,
  Image as ImageIcon,
  Eye,
  EyeOff,
  TrendingDown,
  TrendingUp,
  Minus,
  Download,
  Filter,
  CheckSquare,
  Square,
  FileSpreadsheet,
  FileCheck2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ExtractedSupplierQuote,
  ExtractedQuoteItem,
  CommercialMaterial,
  PriceComparisonStatus,
} from '../../types/commercial';
import {
  saveExtractedQuoteToCatalog,
  isImageFileType,
  isWordFileType,
  isExcelFileType,
} from '../../services/commercialService';

interface SupplierQuotePdfModalProps {
  organizationId: string;
  quoteData: ExtractedSupplierQuote;
  userName: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

type FilterTab = 'all' | 'cheaper' | 'more_expensive' | 'new' | 'warnings';

export const SupplierQuotePdfModal: React.FC<SupplierQuotePdfModalProps> = ({
  organizationId,
  quoteData: initialQuoteData,
  userName,
  onClose,
  onSuccess,
}) => {
  const fileName = initialQuoteData.fileName || '';
  const fileType = initialQuoteData.fileType || '';
  const isImage = isImageFileType(fileName, fileType);
  const isDoc = isWordFileType(fileName, fileType);
  const isSpreadsheet = isExcelFileType(fileName, fileType);

  const [showImagePreview, setShowImagePreview] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const [quoteHeader, setQuoteHeader] = useState({
    supplierName: initialQuoteData.supplierName || '',
    quoteDate: initialQuoteData.quoteDate || new Date().toISOString().split('T')[0],
    validityDays: initialQuoteData.validityDays || 30,
    quoteNumber: initialQuoteData.quoteNumber || '',
    currency: initialQuoteData.currency || 'BRL',
    notes: initialQuoteData.notes || '',
    fileName: initialQuoteData.fileName,
  });

  const [items, setItems] = useState<ExtractedQuoteItem[]>(initialQuoteData.items || []);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set((initialQuoteData.items || []).map((i) => i.id))
  );

  useEffect(() => {
    if (initialQuoteData.items && initialQuoteData.items.length > 0) {
      setItems(initialQuoteData.items);
      setSelectedItemIds(new Set(initialQuoteData.items.map((i) => i.id)));
    }
  }, [initialQuoteData]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Currency Formatter
  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: quoteHeader.currency || 'BRL',
    });
  };

  // Header field updates
  const handleHeaderChange = (field: string, val: any) => {
    setQuoteHeader((prev) => ({ ...prev, [field]: val }));
  };

  // Toggle item selection
  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedItemIds(new Set(items.map((i) => i.id)));
  };

  const handleDeselectAll = () => {
    setSelectedItemIds(new Set());
  };

  const handleSelectOnlyCheaper = () => {
    const cheaperIds = items
      .filter((i) => i.comparisonStatus === 'cheaper')
      .map((i) => i.id);
    setSelectedItemIds(new Set(cheaperIds));
  };

  // Update item field and recalculate comparison dynamically
  const handleItemChange = (id: string, field: keyof ExtractedQuoteItem, val: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: val };
          if (field === 'unitPrice' || field === 'quantity') {
            const up = field === 'unitPrice' ? Number(val) || 0 : item.unitPrice;
            const q = field === 'quantity' ? Number(val) || 1 : item.quantity;
            updated.totalPrice = Math.round((up * q + Number.EPSILON) * 100) / 100;

            // Recalculate price variation against catalog if existingBaseCost is known
            if (updated.existingBaseCost && updated.existingBaseCost > 0) {
              const delta = Math.round((up - updated.existingBaseCost) * 100) / 100;
              const percent = Math.round(((up - updated.existingBaseCost) / updated.existingBaseCost) * 1000) / 10;
              updated.priceVariationDelta = delta;
              updated.priceVariationPercent = percent;

              if (percent <= -1.0) {
                updated.comparisonStatus = 'cheaper';
                updated.totalPotentialSaving = Math.round((updated.existingBaseCost - up) * q * 100) / 100;
              } else if (percent >= 1.0) {
                updated.comparisonStatus = 'more_expensive';
                updated.totalPotentialSaving = 0;
              } else {
                updated.comparisonStatus = 'identical';
                updated.totalPotentialSaving = 0;
              }
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Remove an item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Add a manual item
  const handleAddBlankItem = () => {
    const newItem: ExtractedQuoteItem = {
      id: `manual_${Date.now()}`,
      internalCode: `MAT-${Date.now().toString().slice(-5)}`,
      description: isImage
        ? 'Material Identificado na Imagem'
        : isDoc
        ? 'Material Identificado no Word'
        : 'Material Identificado no Documento',
      unit: 'UN',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      category: 'Tubulações',
      comparisonStatus: 'new',
      flags: ['Preço unitário a preencher'],
    };
    setItems((prev) => [newItem, ...prev]);
    setSelectedItemIds((prev) => new Set(prev).add(newItem.id));
  };

  // Filtered Items for Display
  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case 'cheaper':
        return items.filter((i) => i.comparisonStatus === 'cheaper');
      case 'more_expensive':
        return items.filter((i) => i.comparisonStatus === 'more_expensive');
      case 'new':
        return items.filter((i) => i.comparisonStatus === 'new' || !i.isDuplicate);
      case 'warnings':
        return items.filter((i) => i.flags && i.flags.length > 0);
      case 'all':
      default:
        return items;
    }
  }, [items, activeTab]);

  // Comparative Intelligence Statistics
  const stats = useMemo(() => {
    let cheaperCount = 0;
    let expensiveCount = 0;
    let identicalCount = 0;
    let newCount = 0;
    let warningCount = 0;
    let totalPotentialSavings = 0;
    let totalQuotedMatched = 0;
    let totalBaselineMatched = 0;
    let totalQuotedAll = 0;

    items.forEach((it) => {
      const q = it.quantity || 1;
      const up = it.unitPrice || 0;
      totalQuotedAll += up * q;

      if (it.flags && it.flags.length > 0) warningCount++;

      if (it.isDuplicate && it.existingBaseCost !== undefined) {
        const baseCost = it.existingBaseCost || 0;
        totalQuotedMatched += up * q;
        totalBaselineMatched += baseCost * q;

        if (it.comparisonStatus === 'cheaper') {
          cheaperCount++;
          totalPotentialSavings += (it.totalPotentialSaving || (baseCost - up) * q);
        } else if (it.comparisonStatus === 'more_expensive') {
          expensiveCount++;
        } else {
          identicalCount++;
        }
      } else {
        newCount++;
      }
    });

    const netDelta = Math.round((totalQuotedMatched - totalBaselineMatched) * 100) / 100;
    const netPercent =
      totalBaselineMatched > 0
        ? Math.round((netDelta / totalBaselineMatched) * 1000) / 10
        : 0;

    return {
      cheaperCount,
      expensiveCount,
      identicalCount,
      newCount,
      warningCount,
      totalPotentialSavings: Math.max(0, Math.round(totalPotentialSavings * 100) / 100),
      netDelta,
      netPercent,
      totalQuotedAll: Math.round(totalQuotedAll * 100) / 100,
    };
  }, [items]);

  // Action: Save / Absorb into internal catalog
  const handleConfirmImport = async (onlyCheaper: boolean = false) => {
    let itemsToSave = items.filter((i) => selectedItemIds.has(i.id));

    if (onlyCheaper) {
      itemsToSave = itemsToSave.filter((i) => i.comparisonStatus === 'cheaper' || i.comparisonStatus === 'new');
    }

    if (itemsToSave.length === 0) {
      setErrorMsg('Selecione pelo menos um material para absorver no catálogo.');
      return;
    }

    if (!quoteHeader.supplierName.trim()) {
      setErrorMsg('Informe o nome da empresa fornecedora da cotação.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const fullQuote: ExtractedSupplierQuote = {
        ...quoteHeader,
        items: itemsToSave,
      };

      const result = await saveExtractedQuoteToCatalog(
        organizationId,
        fullQuote,
        itemsToSave,
        userName
      );

      setSuccessMsg(`Sucesso! ${result.updatedCount} preços atualizados e ${result.savedCount} novos itens absorvidos no catálogo.`);
      await onSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(`Erro ao salvar itens no catálogo: ${err?.message || 'Falha de comunicação com o banco'}`);
    } finally {
      setSaving(false);
    }
  };

  // Action: Export Executive Comparison PDF
  const handleExportComparisonPdf = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('pt-BR');

      // Title & Header
      doc.setFillColor(11, 19, 43); // #0B132B
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('AGUERO INOX • RELATÓRIO COMPARATIVO DE PREÇOS', 14, 12);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(56, 189, 248); // Cyan
      doc.text(`Fornecedor Cotado: ${quoteHeader.supplierName.toUpperCase()}`, 14, 18);
      doc.setTextColor(203, 213, 225);
      doc.text(`Arquivo: ${quoteHeader.fileName} | Data: ${quoteHeader.quoteDate || today} | Emissão: ${today}`, 14, 24);

      // Summary KPIs Box
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO EXECUTIVO DO COMPARATIVO', 14, 36);

      autoTable(doc, {
        startY: 40,
        theme: 'grid',
        head: [['Total de Itens', 'Itens com Economia', 'Itens com Aumento', 'Itens Inéditos', 'Economia Potencial Total']],
        body: [[
          `${items.length} itens`,
          `${stats.cheaperCount} itens`,
          `${stats.expensiveCount} itens`,
          `${stats.newCount} novos`,
          formatBrl(stats.totalPotentialSavings),
        ]],
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, fontStyle: 'bold', textColor: [15, 23, 42] },
        styles: { halign: 'center' },
      });

      // Side-by-Side Comparison Table
      const currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 60;
      doc.text('DETALHAMENTO ITEM A ITEM (CATÁLOGO ATUAL VS NOVO PREÇO)', 14, currentY);

      const tableRows = items.map((it) => {
        const currentPriceStr = it.existingBaseCost ? formatBrl(it.existingBaseCost) : 'Sem Registro';
        const newPriceStr = formatBrl(it.unitPrice);
        const variationStr = it.priceVariationPercent !== undefined
          ? `${it.priceVariationPercent > 0 ? '+' : ''}${it.priceVariationPercent.toFixed(1)}%`
          : 'Novo';
        const savingStr = it.comparisonStatus === 'cheaper' && it.totalPotentialSaving
          ? `+${formatBrl(it.totalPotentialSaving)}`
          : '-';
        const statusLabel =
          it.comparisonStatus === 'cheaper'
            ? 'ECONOMIA'
            : it.comparisonStatus === 'more_expensive'
            ? 'AUMENTO'
            : it.comparisonStatus === 'identical'
            ? 'ESTÁVEL'
            : 'NOVO ITEM';

        return [
          it.internalCode || 'S/ CÓD',
          it.description.slice(0, 40),
          `${it.quantity} ${it.unit}`,
          currentPriceStr,
          newPriceStr,
          variationStr,
          savingStr,
          statusLabel,
        ];
      });

      autoTable(doc, {
        startY: currentY + 4,
        head: [['Código', 'Descrição Técnica', 'Qtd', 'Preço Atual Catálogo', 'Novo Preço Cotado', 'Variação %', 'Economia Gerada', 'Status']],
        body: tableRows,
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        styles: { cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 22, fontStyle: 'bold' },
          1: { cellWidth: 50 },
          2: { cellWidth: 15, halign: 'center' },
          3: { cellWidth: 26, halign: 'right' },
          4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 20, halign: 'right', textColor: [16, 185, 129] },
          7: { cellWidth: 20, halign: 'center' },
        },
      });

      doc.save(`Comparativo_Precos_${quoteHeader.supplierName.replace(/\s+/g, '_')}_${quoteHeader.quoteDate}.pdf`);
    } catch (pdfErr) {
      console.error('Erro ao gerar PDF de comparativo:', pdfErr);
      setErrorMsg('Falha ao gerar relatório PDF comparativo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#0B132B] border border-cyan-800/80 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 rounded-xl text-cyan-400">
              {isImage ? (
                <ImageIcon className="w-5 h-5 text-amber-400" />
              ) : isDoc ? (
                <FileText className="w-5 h-5 text-blue-400" />
              ) : isSpreadsheet ? (
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-mono text-[11px] px-2 py-0.5 rounded font-bold border ${
                    isImage
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                      : isDoc
                      ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                      : isSpreadsheet
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  }`}
                >
                  IA MULTIMODAL •{' '}
                  {isImage
                    ? 'IMAGEM (JPG / PNG)'
                    : isDoc
                    ? 'DOCUMENTO WORD (DOCX)'
                    : isSpreadsheet
                    ? 'PLANILHA (XLSX / CSV)'
                    : 'DOCUMENTO (PDF)'}
                </span>
                <span className="text-[11px] text-slate-400 font-sans truncate max-w-xs sm:max-w-md">
                  Arquivo: <strong className="text-white">{quoteHeader.fileName}</strong>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-0.5 flex items-center gap-2">
                <span>Inteligência de Preços: Comparativo com Catálogo & Absorção</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportComparisonPdf}
              className="hidden sm:flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              title="Exportar Relatório Comparativo em PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* KPI CARDS: COMPARATIVE PRICE INTELLIGENCE */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Economia Potencial Total */}
            <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30 p-3.5 rounded-xl">
              <div className="flex items-center justify-between text-emerald-400 text-xs mb-1">
                <span className="font-semibold flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> Economia Potencial
                </span>
                <span className="text-[10px] bg-emerald-900/60 px-1.5 py-0.5 rounded font-mono">
                  {stats.cheaperCount} itens
                </span>
              </div>
              <p className="text-xl font-bold font-mono text-emerald-300">
                {formatBrl(stats.totalPotentialSavings)}
              </p>
              <p className="text-[10px] text-emerald-400/80 mt-1">
                Redução imediata comprando os itens mais baratos
              </p>
            </div>

            {/* Mais Baratos */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center justify-between text-emerald-400 text-xs mb-1">
                <span className="font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Mais Baratos
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {stats.cheaperCount} de {items.length}
                </span>
              </div>
              <p className="text-xl font-bold font-mono text-white">
                {stats.cheaperCount} <span className="text-xs font-normal text-slate-400">itens</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Abaixo do valor vigente no catálogo</p>
            </div>

            {/* Mais Caros */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center justify-between text-rose-400 text-xs mb-1">
                <span className="font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span> Mais Caros
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {stats.expensiveCount} itens
                </span>
              </div>
              <p className="text-xl font-bold font-mono text-white">
                {stats.expensiveCount} <span className="text-xs font-normal text-slate-400">itens</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Preço superior ao custo cadastrado</p>
            </div>

            {/* Itens Novos / Inéditos */}
            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
              <div className="flex items-center justify-between text-cyan-400 text-xs mb-1">
                <span className="font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Novos Insumos
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {stats.newCount} inéditos
                </span>
              </div>
              <p className="text-xl font-bold font-mono text-white">
                {stats.newCount} <span className="text-xs font-normal text-slate-400">itens</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Prontos para enriquecer a base</p>
            </div>
          </div>

          {/* Photo / Scan Preview Box if source is an image */}
          {initialQuoteData.filePreviewUrl && (
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-3.5 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2 text-xs font-semibold text-amber-300">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <span>Foto / Scan Original do Orçamento ({quoteHeader.fileName})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImagePreview(!showImagePreview)}
                  className="flex items-center space-x-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  {showImagePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showImagePreview ? 'Ocultar Foto' : 'Exibir Foto Original'}</span>
                </button>
              </div>

              {showImagePreview && (
                <div className="mt-2 p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex flex-col items-center">
                  <img
                    src={initialQuoteData.filePreviewUrl}
                    alt="Scan da Cotação"
                    className="max-h-60 sm:max-h-72 w-auto rounded object-contain border border-slate-800 shadow-xl"
                  />
                  <p className="text-[11px] text-slate-400 mt-2">
                    A IA transcreveu os dados da imagem acima e cruzou os valores com os preços já cadastrados no catálogo da Aguero Inox.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quote Header Metadata Box (Editable) */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Dados Comerciais do Orçamento Extraído</span>
              <span className="text-[10px] text-slate-500 font-normal">Edite caso haja divergência no documento</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Empresa Fornecedora *</label>
                <input
                  type="text"
                  required
                  value={quoteHeader.supplierName}
                  onChange={(e) => handleHeaderChange('supplierName', e.target.value)}
                  placeholder="Ex: Aperam / Bray / Inox Tubos"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Data da Cotação *</label>
                <input
                  type="date"
                  value={quoteHeader.quoteDate}
                  onChange={(e) => handleHeaderChange('quoteDate', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nº Cotação / Proposta</label>
                <input
                  type="text"
                  value={quoteHeader.quoteNumber}
                  onChange={(e) => handleHeaderChange('quoteNumber', e.target.value)}
                  placeholder="Ex: COT-2026-941"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Validade (Dias)</label>
                  <input
                    type="number"
                    min={1}
                    value={quoteHeader.validityDays}
                    onChange={(e) => handleHeaderChange('validityDays', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Moeda</label>
                  <select
                    value={quoteHeader.currency}
                    onChange={(e) => handleHeaderChange('currency', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
                  >
                    <option value="BRL">BRL (R$)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Condições Comerciais / Notas Identificadas</label>
              <input
                type="text"
                value={quoteHeader.notes}
                onChange={(e) => handleHeaderChange('notes', e.target.value)}
                placeholder="Ex: Frete CIF São Paulo, faturamento 28 dias DDL após faturamento"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* FILTER TABS & QUICK SELECTION TOOLS */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Todos ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cheaper')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'cheaper'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Mais Baratos / Economia ({stats.cheaperCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('more_expensive')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'more_expensive'
                    ? 'bg-rose-500 text-slate-950 font-bold'
                    : 'bg-rose-950/40 text-rose-300 border border-rose-500/30 hover:bg-rose-900/50'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Mais Caros / Alerta ({stats.expensiveCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'new'
                    ? 'bg-cyan-600 text-white font-bold'
                    : 'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/50'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novos no Catálogo ({stats.newCount})</span>
              </button>
              {stats.warningCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('warnings')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'warnings'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-amber-950/40 text-amber-300 border border-amber-500/30 hover:bg-amber-900/50'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Alertas ({stats.warningCount})</span>
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectOnlyCheaper}
                className="px-2.5 py-1 text-[11px] bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 rounded border border-emerald-700/60 transition cursor-pointer"
              >
                Selecionar Apenas Menores Preços
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
              >
                Nenhum
              </button>
              <button
                type="button"
                onClick={handleAddBlankItem}
                className="flex items-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-lg border border-cyan-800/60 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Linha</span>
              </button>
            </div>
          </div>

          {/* EDITABLE COMPARISON TABLE */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
            <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Matriz Comparativa de Preços ({selectedItemIds.size} de {items.length} selecionados para absorção)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Verde: Economia | Vermelho: Aumento | Azul: Inédito
              </span>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/95 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">Sel.</th>
                    <th className="py-2.5 px-3 w-28">Código</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Descrição Técnica do Insumo</th>
                    <th className="py-2.5 px-3 text-center w-14">Unid</th>
                    <th className="py-2.5 px-3 text-right w-16">Qtd</th>
                    <th className="py-2.5 px-3 text-right w-28">Preço Catálogo</th>
                    <th className="py-2.5 px-3 text-right w-28">Novo Cotado</th>
                    <th className="py-2.5 px-3 text-center w-32">Variação / Delta</th>
                    <th className="py-2.5 px-3 text-right w-24">Total Cotado</th>
                    <th className="py-2.5 px-3 text-center w-10">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredItems.map((it) => {
                    const isSelected = selectedItemIds.has(it.id);
                    const hasFlags = it.flags && it.flags.length > 0;
                    const hasExisting = it.isDuplicate && it.existingBaseCost !== undefined;

                    return (
                      <tr
                        key={it.id}
                        className={`transition ${
                          isSelected ? 'hover:bg-slate-900/60' : 'opacity-40 bg-slate-950/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(it.id)}
                            className="rounded bg-slate-800 border-slate-700 text-cyan-500 cursor-pointer"
                          />
                        </td>

                        {/* Internal Code */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={it.internalCode || ''}
                            onChange={(e) => handleItemChange(it.id, 'internalCode', e.target.value.toUpperCase())}
                            placeholder="S/ Cód"
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-cyan-300 font-bold text-xs px-1 py-0.5 outline-none font-mono"
                          />
                          {it.manufacturerCode && (
                            <span className="text-[10px] text-slate-500 block truncate">
                              Fab: {it.manufacturerCode}
                            </span>
                          )}
                        </td>

                        {/* Description & Technical Specs */}
                        <td className="py-2.5 px-3 font-sans">
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => handleItemChange(it.id, 'description', e.target.value)}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-slate-100 font-semibold text-xs px-1 py-0.5 outline-none font-sans"
                          />
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {it.materialGrade && (
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1 rounded">
                                {it.materialGrade}
                              </span>
                            )}
                            {it.dimension && (
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1 rounded">
                                {it.dimension}
                              </span>
                            )}
                            {it.scheduleClass && (
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1 rounded">
                                {it.scheduleClass}
                              </span>
                            )}
                            {it.standardNorm && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-1 rounded">
                                {it.standardNorm}
                              </span>
                            )}
                          </div>
                          {hasFlags && (
                            <div className="mt-1 space-y-0.5">
                              {it.flags?.map((flag, fIdx) => {
                                const hasSymbol = flag.startsWith('🟢') || flag.startsWith('🟡') || flag.startsWith('🔴') || flag.startsWith('⚪') || flag.startsWith('⚠️') || flag.startsWith('⚠');
                                const isGreen = flag.includes('🟢') || flag.includes('Economia') || flag.includes('referenciado');
                                const isRed = flag.includes('🔴') || flag.includes('superior');
                                const isSky = flag.includes('⚪') || flag.includes('inédito');
                                return (
                                  <span
                                    key={fIdx}
                                    className={`text-[10px] block font-medium font-sans flex items-center gap-1 ${
                                      isGreen
                                        ? 'text-emerald-400'
                                        : isRed
                                        ? 'text-rose-400'
                                        : isSky
                                        ? 'text-sky-300'
                                        : 'text-amber-300'
                                    }`}
                                  >
                                    {!hasSymbol && <span>⚠</span>}
                                    <span>{flag}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Unit */}
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="text"
                            value={it.unit}
                            onChange={(e) => handleItemChange(it.id, 'unit', e.target.value.toUpperCase())}
                            className="w-10 text-center bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-slate-300 text-xs outline-none font-mono"
                          />
                        </td>

                        {/* Quantity */}
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => handleItemChange(it.id, 'quantity', Number(e.target.value))}
                            className="w-14 text-right bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-400 text-white font-bold text-xs outline-none font-mono"
                          />
                        </td>

                        {/* Preço Atual no Catálogo */}
                        <td className="py-2.5 px-3 text-right">
                          {hasExisting ? (
                            <div>
                              <span className="font-bold text-slate-300">
                                {formatBrl(it.existingBaseCost || 0)}
                              </span>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[120px] ml-auto">
                                {it.existingSupplier || 'Atual'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">Inédito</span>
                          )}
                        </td>

                        {/* Novo Preço Cotado */}
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.unitPrice || ''}
                            onChange={(e) => handleItemChange(it.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-20 text-right bg-slate-800/80 border border-slate-700 rounded px-1.5 py-0.5 focus:border-cyan-400 text-white font-bold text-xs outline-none font-mono"
                          />
                        </td>

                        {/* Variação % & Status Badge */}
                        <td className="py-2.5 px-3 text-center font-sans">
                          {hasExisting ? (
                            it.comparisonStatus === 'cheaper' ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                  <TrendingDown className="w-3 h-3" />
                                  <span>{it.priceVariationPercent}%</span>
                                </span>
                                <span className="text-[9px] text-emerald-400 mt-0.5 font-mono">
                                  {formatBrl(it.priceVariationDelta || 0)}/un
                                </span>
                              </div>
                            ) : it.comparisonStatus === 'more_expensive' ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                                  <TrendingUp className="w-3 h-3" />
                                  <span>+{it.priceVariationPercent}%</span>
                                </span>
                                <span className="text-[9px] text-rose-400 mt-0.5 font-mono">
                                  +{formatBrl(it.priceVariationDelta || 0)}/un
                                </span>
                              </div>
                            ) : it.flags?.some((f) => f.includes('referenciado') || f.includes('catálogo')) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[10px] font-semibold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>No Catálogo</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                                <Minus className="w-3 h-3" />
                                <span>Estável (0%)</span>
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-[10px] font-medium">
                              Novo Insumo
                            </span>
                          )}
                        </td>

                        {/* Total Cotado */}
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {formatBrl(it.totalPrice || 0)}
                        </td>

                        {/* Ação */}
                        <td className="py-2.5 px-3 text-center font-sans">
                          <button
                            onClick={() => handleRemoveItem(it.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                            title="Remover linha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Info className="w-6 h-6 text-cyan-400" />
                          <p className="text-xs font-medium text-slate-300">
                            Nenhum item exibido nesta visualização.
                          </p>
                          <p className="text-[11px] text-slate-500 max-w-md">
                            {items.length === 0
                              ? 'Não foram detectados itens automaticamente. Clique em "+ Nova Linha" no canto superior direito para adicionar itens manualmente.'
                              : 'Nenhum item corresponde ao filtro atual. Selecione a aba "Todos" para visualizar a lista completa.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer with Two Distinct Paths: Decision Export vs Catalog Absorption */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Origem:</span>
            <span className="text-slate-300 font-mono">
              {quoteHeader.fileName} ({quoteHeader.quoteNumber || 'Sem código'})
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition cursor-pointer"
            >
              Fechar Sem Salvar
            </button>

            <button
              type="button"
              onClick={handleExportComparisonPdf}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-lg border border-cyan-800/80 transition cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Exportar Comparativo (PDF)</span>
            </button>

            {stats.cheaperCount > 0 && (
              <button
                type="button"
                onClick={() => handleConfirmImport(true)}
                disabled={saving}
                className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition shadow disabled:opacity-50 cursor-pointer"
                title="Absorve apenas os materiais onde este fornecedor é mais barato e itens novos"
              >
                <TrendingDown className="w-4 h-4" />
                <span>
                  {saving ? 'Gravando...' : `Absorver Somente com Economia (${stats.cheaperCount + stats.newCount})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleConfirmImport(false)}
              disabled={saving || selectedItemIds.size === 0}
              className="flex items-center space-x-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition shadow-lg disabled:opacity-50 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>
                {saving
                  ? 'Registrando no Banco Interno...'
                  : `Absorver Preços no Catálogo (${selectedItemIds.size} Itens)`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
