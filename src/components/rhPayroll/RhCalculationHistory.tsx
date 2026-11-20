import React, { useState } from 'react';
import {
  History,
  Clock,
  User,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  Filter,
} from 'lucide-react';
import {
  RhCalculationBatch,
  RhImportBatch,
  RhThirteenthCalculation,
} from '../../types/rhPayroll';

interface RhCalculationHistoryProps {
  batches: RhCalculationBatch[];
  imports: RhImportBatch[];
  calculations: RhThirteenthCalculation[];
  canViewFinancials: boolean;
}

export const RhCalculationHistory: React.FC<RhCalculationHistoryProps> = ({
  batches,
  imports,
  calculations,
  canViewFinancials,
}) => {
  const [activeTab, setActiveTab] = useState<'batches' | 'imports' | 'adjustments'>('batches');

  const formatCurrency = (val: number) => {
    if (!canViewFinancials) return 'R$ ••••••';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Cálculos que receberam ajustes manuais
  const adjustedCalculations = calculations.filter((c) => c.manualAdjustment);

  return (
    <div className="space-y-4">
      {/* Top Header & Subtabs */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-950/60 text-blue-400 rounded-xl border border-blue-800/40">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Histórico de Cálculos & Trilha de Auditoria
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Registros imutáveis de apurações, importações e ajustes manuais homologados.
            </p>
          </div>
        </div>

        <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-3 py-1.5 font-semibold transition ${
              activeTab === 'batches' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
            }`}
          >
            Lotes de Cálculo ({batches.length})
          </button>
          <button
            onClick={() => setActiveTab('imports')}
            className={`px-3 py-1.5 font-semibold transition ${
              activeTab === 'imports' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
            }`}
          >
            Importações ({imports.length})
          </button>
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-3 py-1.5 font-semibold transition ${
              activeTab === 'adjustments' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
            }`}
          >
            Ajustes Manuais ({adjustedCalculations.length})
          </button>
        </div>
      </div>

      {/* 1. Lotes de Cálculo */}
      {activeTab === 'batches' && (
        <div className="space-y-3">
          {batches.length === 0 ? (
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
              Nenhuma rodada de cálculo consolidada registrada até o momento.
            </div>
          ) : (
            batches.map((batch) => (
              <div
                key={batch.id}
                className="bg-[#121826] border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-sm transition space-y-3"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{batch.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono border border-blue-800/40 font-bold">
                        Ano {batch.referenceYear}
                      </span>
                      {batch.isDemo && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 font-semibold border border-amber-800/40">
                          Demonstração
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(batch.createdAt).toLocaleString('pt-BR')}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {batch.createdByName || batch.createdBy}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      batch.status === 'aprovado'
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                        : 'bg-blue-950/70 text-blue-400 border border-blue-800/50'
                    }`}
                  >
                    {batch.status === 'aprovado' ? 'Homologado' : 'Em Conferência'}
                  </span>
                </div>

                {/* Values Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Colaboradores:</span>
                    <span className="font-bold text-white">{batch.totalEmployees} apurados</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Provisão CLT Bruta:</span>
                    <span className="font-bold text-indigo-300">{formatCurrency(batch.totalGrossCarteira)}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">INSS Retido:</span>
                    <span className="font-bold text-amber-400">-{formatCurrency(batch.totalInssDeduction)}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Verba Complementar:</span>
                    <span className="font-bold text-purple-300">{formatCurrency(batch.totalPorFora)}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans">Total Líquido Geral:</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(batch.totalCombined)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 2. Histórico de Importações */}
      {activeTab === 'imports' && (
        <div className="space-y-3">
          {imports.length === 0 ? (
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
              Nenhuma importação de planilha registrada.
            </div>
          ) : (
            imports.map((imp) => (
              <div
                key={imp.id}
                className="bg-[#121826] border border-slate-800 rounded-xl p-4 shadow-sm space-y-2 text-xs"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white">{imp.fileName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono">
                      {imp.importMode === 'with_values' ? 'Modo A: Com Valores' : 'Modo B: Cadastral'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(imp.importedAt).toLocaleString('pt-BR')} por {imp.importedByName || imp.importedBy}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="bg-slate-900/40 p-2 rounded">Total: {imp.totalRows} linhas</div>
                  <div className="bg-emerald-950/30 text-emerald-400 p-2 rounded">
                    Aceitas: {imp.validRows}
                  </div>
                  <div className="bg-rose-950/30 text-rose-400 p-2 rounded">
                    Rejeitadas: {imp.rejectedRows}
                  </div>
                  <div className="bg-amber-950/30 text-amber-400 p-2 rounded">
                    Avisos: {imp.warningsCount}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. Trilha de Ajustes Manuais */}
      {activeTab === 'adjustments' && (
        <div className="space-y-3">
          {adjustedCalculations.length === 0 ? (
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
              Nenhum ajuste manual aplicado nos cálculos vigentes.
            </div>
          ) : (
            adjustedCalculations.map((calc) => (
              <div
                key={calc.id}
                className="bg-[#121826] border border-amber-800/60 rounded-xl p-4 shadow-sm space-y-2 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-cyan-400">Obra {calc.codigoObra || calc.registrationNumber}</span>
                    <span className="font-bold text-white">{calc.employeeName}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-bold border border-amber-800/40">
                    Ajuste Registrado
                  </span>
                </div>

                {calc.manualAdjustment && (
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-1.5">
                    <p className="text-slate-300">
                      <strong className="text-white">Justificativa Formal:</strong> "{calc.manualAdjustment.reason}"
                    </p>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                      <span>Valor Original: {formatCurrency(calc.manualAdjustment.originalAmount)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                      <span className="text-emerald-400 font-bold">
                        Valor Ajustado: {formatCurrency(calc.manualAdjustment.adjustedAmount)}
                      </span>
                      <span>•</span>
                      <span>
                        Por: {calc.manualAdjustment.adjustedBy} em{' '}
                        {new Date(calc.manualAdjustment.adjustedAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
