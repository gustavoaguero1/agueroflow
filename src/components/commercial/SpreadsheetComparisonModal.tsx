import React, { useState, useMemo } from 'react';
import {
  X,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Minus,
  Filter,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { ImportItemDiff, ImportActionDecision } from '../../types/commercial';

interface SpreadsheetComparisonModalProps {
  fileName: string;
  sourceType: 'CATALOGO_PRECOS' | 'BOM_PROPOSTA';
  diffs: ImportItemDiff[];
  isSaving: boolean;
  onConfirm: (resolvedDiffs: ImportItemDiff[]) => Promise<void>;
  onClose: () => void;
}

type FilterTab = 'all' | 'new' | 'price_update' | 'identical';

export const SpreadsheetComparisonModal: React.FC<SpreadsheetComparisonModalProps> = ({
  fileName,
  sourceType,
  diffs: initialDiffs,
  isSaving,
  onConfirm,
  onClose,
}) => {
  const [diffs, setDiffs] = useState<ImportItemDiff[]>(initialDiffs);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const formatBrl = (val: number | undefined) => {
    return (val || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  // Toggle selection for a single row
  const handleToggleSelect = (id: string) => {
    setDiffs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isSelected: !item.isSelected } : item))
    );
  };

  // Update action decision for a row
  const handleActionChange = (id: string, newAction: ImportActionDecision) => {
    setDiffs((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            action: newAction,
            isSelected: newAction !== 'IGNORAR_DUPLICADO',
          };
        }
        return item;
      })
    );
  };

  // Update cost inline
  const handleCostChange = (id: string, newCostStr: string) => {
    const parsedCost = parseFloat(newCostStr.replace(',', '.')) || 0;
    setDiffs((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const existingCost = item.existingBaseCost || 0;
          const delta = existingCost > 0 ? Math.round((parsedCost - existingCost) * 100) / 100 : 0;
          const percent = existingCost > 0 ? Math.round((delta / existingCost) * 1000) / 10 : 0;
          return {
            ...item,
            incomingCost: parsedCost,
            priceDiffAmount: delta,
            priceDiffPercent: percent,
            matchStatus:
              item.matchStatus === 'NOVO'
                ? 'NOVO'
                : Math.abs(delta) < 0.01
                ? 'IDENTICO'
                : 'ATUALIZAR_PRECO',
          };
        }
        return item;
      })
    );
  };

  // Bulk actions
  const handleSelectRecommended = () => {
    setDiffs((prev) =>
      prev.map((item) => {
        if (item.matchStatus === 'NOVO') {
          return { ...item, isSelected: true, action: 'CRIAR_NOVO' };
        }
        if (item.matchStatus === 'ATUALIZAR_PRECO') {
          return { ...item, isSelected: true, action: 'ATUALIZAR_PRECO' };
        }
        // Identical: ignore
        return { ...item, isSelected: false, action: 'IGNORAR_DUPLICADO' };
      })
    );
  };

  const handleSelectAll = () => {
    setDiffs((prev) =>
      prev.map((item) => ({
        ...item,
        isSelected: true,
        action: item.matchStatus === 'NOVO' ? 'CRIAR_NOVO' : 'ATUALIZAR_PRECO',
      }))
    );
  };

  const handleDeselectAll = () => {
    setDiffs((prev) => prev.map((item) => ({ ...item, isSelected: false, action: 'IGNORAR_DUPLICADO' })));
  };

  const handleSelectOnlyNew = () => {
    setDiffs((prev) =>
      prev.map((item) => ({
        ...item,
        isSelected: item.matchStatus === 'NOVO',
        action: item.matchStatus === 'NOVO' ? 'CRIAR_NOVO' : 'IGNORAR_DUPLICADO',
      }))
    );
  };

  const handleSelectOnlyPriceUpdates = () => {
    setDiffs((prev) =>
      prev.map((item) => ({
        ...item,
        isSelected: item.matchStatus === 'ATUALIZAR_PRECO',
        action: item.matchStatus === 'ATUALIZAR_PRECO' ? 'ATUALIZAR_PRECO' : 'IGNORAR_DUPLICADO',
      }))
    );
  };

  // Metrics
  const totalCount = diffs.length;
  const newCount = diffs.filter((d) => d.matchStatus === 'NOVO').length;
  const priceUpdateCount = diffs.filter((d) => d.matchStatus === 'ATUALIZAR_PRECO').length;
  const identicalCount = diffs.filter((d) => d.matchStatus === 'IDENTICO').length;

  const cheaperCount = diffs.filter(
    (d) => d.matchStatus === 'ATUALIZAR_PRECO' && (d.priceDiffPercent || 0) < 0
  ).length;
  const moreExpensiveCount = diffs.filter(
    (d) => d.matchStatus === 'ATUALIZAR_PRECO' && (d.priceDiffPercent || 0) > 0
  ).length;

  const selectedCount = diffs.filter((d) => d.isSelected && d.action !== 'IGNORAR_DUPLICADO').length;
  const selectedNewCount = diffs.filter((d) => d.isSelected && d.action === 'CRIAR_NOVO').length;
  const selectedUpdateCount = diffs.filter((d) => d.isSelected && d.action === 'ATUALIZAR_PRECO').length;
  const selectedIgnoredCount = diffs.filter((d) => !d.isSelected || d.action === 'IGNORAR_DUPLICADO').length;

  // Filtered rows
  const filteredDiffs = useMemo(() => {
    return diffs.filter((item) => {
      // Tab filter
      if (activeTab === 'new' && item.matchStatus !== 'NOVO') return false;
      if (activeTab === 'price_update' && item.matchStatus !== 'ATUALIZAR_PRECO') return false;
      if (activeTab === 'identical' && item.matchStatus !== 'IDENTICO') return false;

      // Text search
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.incomingDescription.toLowerCase().includes(term) ||
        (item.incomingCode && item.incomingCode.toLowerCase().includes(term)) ||
        (item.matchedInternalCode && item.matchedInternalCode.toLowerCase().includes(term)) ||
        (item.incomingSupplier && item.incomingSupplier.toLowerCase().includes(term)) ||
        (item.incomingCategory && item.incomingCategory.toLowerCase().includes(term))
      );
    });
  }, [diffs, activeTab, searchTerm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl shadow-2xl flex flex-col w-full max-w-7xl max-h-[92vh] overflow-hidden text-slate-100">
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Comparativo Pré-Importação & Prevenção de Duplicidades
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700/60">
                  {fileName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Revise os itens antes de gravar no catálogo. O sistema identificou quais itens são novos, quais já existem com preço diferente e quais são idênticos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Fechar sem salvar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Intelligence KPI Summary Cards */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>Lidas no Arquivo</span>
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg font-bold text-white font-mono">{totalCount}</div>
            <div className="text-[10px] text-slate-400">Linhas processadas</div>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/50">
            <div className="flex items-center justify-between text-emerald-400 mb-1">
              <span>Novos Insumos</span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-emerald-300 font-mono">{newCount}</div>
            <div className="text-[10px] text-emerald-400/80">Inéditos (não existem no catálogo)</div>
          </div>

          <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-800/50">
            <div className="flex items-center justify-between text-blue-400 mb-1">
              <span>Preços Atualizados</span>
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-blue-300 font-mono">{priceUpdateCount}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="text-emerald-400 font-semibold">{cheaperCount} mais baratos</span>
              <span>•</span>
              <span className="text-rose-400 font-semibold">{moreExpensiveCount} mais caros</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>Duplicados Idênticos</span>
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-lg font-bold text-slate-300 font-mono">{identicalCount}</div>
            <div className="text-[10px] text-amber-400/90 font-medium">Ignorados por padrão (sem duplicar)</div>
          </div>
        </div>

        {/* Filter Tabs & Quick Action Controls */}
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
          {/* Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Todos ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'new'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
              }`}
            >
              Novos ({newCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('price_update')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'price_update'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800 text-blue-400 hover:bg-slate-700'
              }`}
            >
              Preços Alterados ({priceUpdateCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('identical')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'identical'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Duplicados Idênticos ({identicalCount})
            </button>
          </div>

          {/* Quick Select & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar código ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="button"
              onClick={handleSelectRecommended}
              className="px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 rounded-lg font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition shadow"
              title="Marca novos insumos e atualizações de preço, ignorando duplicidades idênticas"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Seleção Recomendada</span>
            </button>

            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium text-[11px] cursor-pointer transition"
            >
              Selecionar Todos
            </button>

            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 rounded-lg font-medium text-[11px] cursor-pointer transition"
            >
              Desmarcar
            </button>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="flex-1 overflow-auto p-3 sm:p-4">
          {filteredDiffs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Nenhum item corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <span className="sr-only">Seleção</span>
                    </th>
                    <th className="py-2.5 px-3">Status / Diagnóstico</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Descrição & Categoria</th>
                    <th className="py-2.5 px-3 text-center">Unid.</th>
                    <th className="py-2.5 px-3 text-right">Preço Atual (Catálogo)</th>
                    <th className="py-2.5 px-3 text-right">Novo Preço (Planilha)</th>
                    <th className="py-2.5 px-3 text-right">Variação (%)</th>
                    <th className="py-2.5 px-3 w-48 text-center">Ação a Executar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredDiffs.map((row) => {
                    const isCheaper = (row.priceDiffPercent || 0) < 0;
                    const isMoreExpensive = (row.priceDiffPercent || 0) > 0;

                    return (
                      <tr
                        key={row.id}
                        className={`transition hover:bg-slate-900/60 ${
                          row.isSelected ? 'bg-slate-900/30' : 'opacity-60 bg-slate-950/20'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelect(row.id)}
                            className="cursor-pointer text-cyan-400 hover:text-cyan-300"
                          >
                            {row.isSelected ? (
                              <CheckSquare className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {row.matchStatus === 'NOVO' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                              <Sparkles className="w-3 h-3 text-emerald-400" />
                              NOVO INSUMO
                            </span>
                          )}

                          {row.matchStatus === 'ATUALIZAR_PRECO' && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                                isCheaper
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                  : 'bg-rose-950/60 text-rose-300 border-rose-800'
                              }`}
                            >
                              {isCheaper ? (
                                <TrendingDown className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <TrendingUp className="w-3 h-3 text-rose-400" />
                              )}
                              PREÇO ALTERADO
                            </span>
                          )}

                          {row.matchStatus === 'IDENTICO' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              <Minus className="w-3 h-3 text-slate-500" />
                              DUPLICADO IDÊNTICO
                            </span>
                          )}

                          {row.matchStatus === 'CONFLITO_CODIGO' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              CONFLITO
                            </span>
                          )}
                        </td>

                        {/* Code */}
                        <td className="py-2.5 px-3 font-mono text-cyan-300 font-semibold whitespace-nowrap">
                          <div>{row.incomingCode || row.matchedInternalCode || '—'}</div>
                          {row.incomingManufacturerCode && (
                            <div className="text-[10px] text-slate-500 font-sans">
                              Fab: {row.incomingManufacturerCode}
                            </div>
                          )}
                        </td>

                        {/* Description & Category */}
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-white max-w-md truncate" title={row.incomingDescription}>
                            {row.incomingDescription}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            {row.incomingCategory && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {row.incomingCategory}
                              </span>
                            )}
                            {row.incomingSupplier && (
                              <span className="text-slate-500">Fornec: {row.incomingSupplier}</span>
                            )}
                            {row.matchedMaterialId && (
                              <span className="text-cyan-400/90 font-mono text-[9px]">
                                (Ref: {row.matchedInternalCode})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Unit */}
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                          {row.incomingUnit}
                        </td>

                        {/* Existing Price in Catalog */}
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                          {row.matchedMaterialId ? (
                            <div>
                              <span className="font-semibold text-slate-200">
                                {formatBrl(row.existingBaseCost)}
                              </span>
                              {row.existingQuoteDate && (
                                <div className="text-[9px] text-slate-500">
                                  {row.existingQuoteDate}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 italic">Não cadastrado</span>
                          )}
                        </td>

                        {/* Incoming Price (Editable) */}
                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          <div className="inline-flex items-center justify-end">
                            <span className="text-slate-500 mr-1 text-[11px]">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.incomingCost || 0}
                              onChange={(e) => handleCostChange(row.id, e.target.value)}
                              className="w-24 text-right bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                        </td>

                        {/* Variation */}
                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          {row.matchStatus === 'NOVO' ? (
                            <span className="text-[10px] text-emerald-400 font-semibold">— Inédito</span>
                          ) : Math.abs(row.priceDiffAmount || 0) < 0.01 ? (
                            <span className="text-[10px] text-slate-500 font-semibold">0,0% (Igual)</span>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-bold text-xs flex items-center gap-0.5 ${
                                  isCheaper ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isCheaper ? (
                                  <TrendingDown className="w-3 h-3" />
                                ) : (
                                  <TrendingUp className="w-3 h-3" />
                                )}
                                {row.priceDiffPercent && row.priceDiffPercent > 0 ? '+' : ''}
                                {row.priceDiffPercent?.toFixed(1)}%
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {row.priceDiffAmount && row.priceDiffAmount > 0 ? '+' : ''}
                                {formatBrl(row.priceDiffAmount)}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Action Selector */}
                        <td className="py-2.5 px-3 text-center">
                          <select
                            value={row.action}
                            onChange={(e) => handleActionChange(row.id, e.target.value as ImportActionDecision)}
                            className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
                          >
                            {row.matchStatus === 'NOVO' ? (
                              <>
                                <option value="CRIAR_NOVO">Cadastrar como Novo</option>
                                <option value="IGNORAR_DUPLICADO">Ignorar Linha</option>
                              </>
                            ) : (
                              <>
                                <option value="ATUALIZAR_PRECO">Atualizar Preço Existente</option>
                                <option value="CRIAR_NOVO">Cadastrar Novo Item Separado</option>
                                <option value="IGNORAR_DUPLICADO">Ignorar (Manter Catálogo Atual)</option>
                              </>
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer with Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-400 text-[11px] flex flex-wrap items-center gap-2">
            <span className="text-white font-semibold">{selectedCount} itens selecionados para gravação:</span>
            <span className="text-emerald-400 font-medium">+{selectedNewCount} novos insumos</span>
            <span>•</span>
            <span className="text-blue-400 font-medium">{selectedUpdateCount} preços atualizados</span>
            <span>•</span>
            <span className="text-slate-500">{selectedIgnoredCount} ignorados</span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={isSaving || selectedCount === 0}
              onClick={() => onConfirm(diffs)}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg transition shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Gravando no Catálogo...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Importar ({selectedCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
