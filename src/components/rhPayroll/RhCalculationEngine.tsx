import React, { useState } from 'react';
import {
  Calculator,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Eye,
  Edit3,
  Sliders,
  DollarSign,
  ShieldCheck,
  Calendar,
  X,
  Layers,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import {
  RhEmployee,
  RhThirteenthCalculation,
  RhDivergence,
} from '../../types/rhPayroll';
import {
  calculateEmployeeThirteenth,
  getInssBrackets,
  roundCurrency,
} from '../../services/rhPayrollService';

interface RhCalculationEngineProps {
  employees: RhEmployee[];
  calculations: RhThirteenthCalculation[];
  referenceYear: number;
  onReferenceYearChange: (year: number) => void;
  onSaveCalculation: (calc: RhThirteenthCalculation) => Promise<void>;
  onBatchSaveCalculations: (calcs: RhThirteenthCalculation[]) => Promise<void>;
  canEdit: boolean;
  canViewFinancials: boolean;
  userEmail: string;
}

export const RhCalculationEngine: React.FC<RhCalculationEngineProps> = ({
  employees,
  calculations,
  referenceYear,
  onReferenceYearChange,
  onSaveCalculation,
  onBatchSaveCalculations,
  canEdit,
  canViewFinancials,
  userEmail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'divergent' | 'approved' | 'pending'>('all');
  const [monthlyHours, setMonthlyHours] = useState<number>(220);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Modais de detalhe e ajuste
  const [viewingCalc, setViewingCalc] = useState<RhThirteenthCalculation | null>(null);
  const [adjustingCalc, setAdjustingCalc] = useState<RhThirteenthCalculation | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    if (!canViewFinancials) return 'R$ ••••••';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Recalcular todos os colaboradores ativos
  const handleRecalculateAll = async () => {
    if (!canEdit) return;
    setIsRecalculating(true);
    const runId = `run_${referenceYear}_${Date.now()}`;
    const newCalculations: RhThirteenthCalculation[] = [];

    try {
      const activeEmployees = employees.filter((e) => e.active);
      for (const emp of activeEmployees) {
        const existingCalc = calculations.find((c) => c.employeeId === emp.id);
        const calc = calculateEmployeeThirteenth({
          employee: emp,
          referenceYear,
          monthlyHours,
          importedRef: existingCalc?.importedReference,
          porForaConfirmed: existingCalc?.porForaConfirmed ?? true,
          runId,
        });
        newCalculations.push(calc);
      }

      await onBatchSaveCalculations(newCalculations);
    } catch (err: any) {
      alert('Erro ao recalcular 13º salário: ' + err.message);
    } finally {
      setIsRecalculating(false);
    }
  };

  // Alternar aprovação
  const handleToggleApproval = async (calc: RhThirteenthCalculation) => {
    if (!canEdit) return;
    const newStatus = calc.status === 'aprovado' ? 'conferido' : 'aprovado';
    const updated: RhThirteenthCalculation = {
      ...calc,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    await onSaveCalculation(updated);
  };

  // Salvar ajuste manual
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingCalc || !canEdit) return;
    setAdjustmentError(null);

    const cleanReason = adjustmentReason.trim();
    if (!cleanReason) {
      setAdjustmentError('A justificativa formal do ajuste é obrigatória para fins de auditoria.');
      return;
    }

    const parsedAmt = parseFloat(adjustmentAmount.replace(',', '.'));
    if (isNaN(parsedAmt)) {
      setAdjustmentError('Informe um valor numérico válido.');
      return;
    }

    try {
      const now = new Date().toISOString();
      const diff = roundCurrency(parsedAmt - adjustingCalc.totalThirteenthCombinedNet);

      const updated: RhThirteenthCalculation = {
        ...adjustingCalc,
        totalThirteenthCombinedNet: parsedAmt,
        status: 'ajustado',
        manualAdjustment: {
          adjustedBy: userEmail,
          adjustedAt: now,
          originalAmount: adjustingCalc.totalThirteenthCombinedNet,
          adjustedAmount: parsedAmt,
          reason: cleanReason,
        },
        notes: `Ajuste manual aplicado em ${new Date().toLocaleDateString('pt-BR')}: ${cleanReason}`,
        updatedAt: now,
      };

      await onSaveCalculation(updated);
      setAdjustingCalc(null);
    } catch (err: any) {
      setAdjustmentError(err.message || 'Erro ao aplicar ajuste manual.');
    }
  };

  // Filtragem
  const filteredCalculations = calculations.filter((c) => {
    if (statusFilter === 'divergent' && !c.hasDivergence) return false;
    if (statusFilter === 'approved' && c.status !== 'aprovado') return false;
    if (statusFilter === 'pending' && (c.status === 'aprovado' || c.hasDivergence)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.employeeName.toLowerCase().includes(q);
      const matchReg = c.registrationNumber.toLowerCase().includes(q);
      const matchCompany = c.companyName.toLowerCase().includes(q);
      return matchName || matchReg || matchCompany;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Configuration & Action Bar */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Year Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400 font-semibold">Exercício:</span>
            <select
              value={referenceYear}
              onChange={(e) => onReferenceYearChange(parseInt(e.target.value, 10))}
              className="bg-transparent text-white font-bold font-mono focus:outline-none"
            >
              <option value={2026} className="bg-slate-900 text-white">2026</option>
              <option value={2025} className="bg-slate-900 text-white">2025</option>
              <option value={2024} className="bg-slate-900 text-white">2024</option>
            </select>
          </div>

          {/* Monthly hours multiplier */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400 font-semibold">Carga:</span>
            <input
              type="number"
              value={monthlyHours}
              onChange={(e) => setMonthlyHours(parseInt(e.target.value, 10) || 220)}
              className="w-12 bg-transparent text-white font-bold font-mono text-center focus:outline-none"
              title="Horas mensais padrão para cálculo da base mensal (padrão CLT 220h)"
            />
            <span className="text-slate-500 font-mono">h/mês</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar por nome ou matrícula..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 font-semibold transition ${
                statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Todos ({calculations.length})
            </button>
            <button
              onClick={() => setStatusFilter('divergent')}
              className={`px-2.5 py-1.5 font-semibold transition ${
                statusFilter === 'divergent' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Divergentes ({calculations.filter((c) => c.hasDivergence).length})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-2.5 py-1.5 font-semibold transition ${
                statusFilter === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400'
              }`}
            >
              Aprovados ({calculations.filter((c) => c.status === 'aprovado').length})
            </button>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={handleRecalculateAll}
            disabled={isRecalculating || employees.length === 0}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50 shrink-0"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
            Recalcular Todos ({referenceYear})
          </button>
        )}
      </div>

      {/* Main Calculations Grid */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Cód. Obra</th>
                <th className="py-2.5 px-3">Funcionário</th>
                <th className="py-2.5 px-2 text-center">Avos</th>
                <th className="py-2.5 px-3 text-right">Base CLT</th>
                <th className="py-2.5 px-3 text-right">1ª Parc. CLT (50%)</th>
                <th className="py-2.5 px-3 text-right">1ª Parc. Fora</th>
                <th className="py-2.5 px-3 text-right">2ª Parc. Bruta</th>
                <th className="py-2.5 px-3 text-right">INSS Oficial</th>
                <th className="py-2.5 px-3 text-right">2ª Parc. Líq. CLT</th>
                <th className="py-2.5 px-3 text-right">2ª Parc. Fora</th>
                <th className="py-2.5 px-3 text-right text-cyan-300">Total Líquido</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans text-slate-200">
              {filteredCalculations.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-500">
                    Nenhum cálculo encontrado para os filtros selecionados. Clique em "Recalcular Todos"
                    para apurar.
                  </td>
                </tr>
              ) : (
                filteredCalculations.map((calc) => (
                  <tr
                    key={calc.id}
                    className={`hover:bg-slate-800/40 transition font-sans ${
                      calc.hasDivergence ? 'bg-amber-950/10' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono font-bold text-cyan-400">
                      {calc.codigoObra || calc.registrationNumber}
                    </td>
                    <td className="py-2 px-3 font-semibold text-white">
                      <div className="truncate max-w-[180px]">{calc.employeeName}</div>
                      <div className="text-[10px] text-slate-500">{calc.companyName}</div>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {calc.monthsWorked}/12
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">
                      {formatCurrency(calc.baseSalaryCarteira)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-400">
                      {formatCurrency(calc.firstInstallmentCarteira)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-purple-400">
                      {calc.firstInstallmentPorFora > 0
                        ? formatCurrency(calc.firstInstallmentPorFora)
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">
                      {formatCurrency(calc.secondInstallmentGrossCarteira)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-400 font-semibold">
                      {calc.inssDeductionCarteira > 0 ? (
                        <span title={`Alíquota efetiva: ${calc.inssEffectiveRate || 0}%`}>
                          -{formatCurrency(calc.inssDeductionCarteira)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-blue-300">
                      {formatCurrency(calc.secondInstallmentNetCarteira)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-purple-400">
                      {calc.secondInstallmentPorFora > 0
                        ? formatCurrency(calc.secondInstallmentPorFora)
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-extrabold text-cyan-300 bg-slate-900/50">
                      {formatCurrency(calc.totalThirteenthCombinedNet)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {calc.hasDivergence ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-full cursor-help"
                          title={`${calc.divergences?.length || 0} divergências com a planilha importada`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Divergente
                        </span>
                      ) : calc.status === 'aprovado' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Aprovado
                        </span>
                      ) : calc.status === 'ajustado' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-full">
                          Ajustado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                          Conferido
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setViewingCalc(calc)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition"
                          title="Ver memória detalhada de cálculo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => {
                                setAdjustingCalc(calc);
                                setAdjustmentAmount(String(calc.totalThirteenthCombinedNet));
                                setAdjustmentReason('');
                                setAdjustmentError(null);
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition"
                              title="Ajuste manual com justificativa formal"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleApproval(calc)}
                              className={`p-1.5 rounded transition ${
                                calc.status === 'aprovado'
                                  ? 'text-emerald-400 hover:bg-emerald-950/50'
                                  : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800'
                              }`}
                              title={calc.status === 'aprovado' ? 'Desmarcar aprovação' : 'Aprovar cálculo'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Memória Detalhada de Cálculo */}
      {viewingCalc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#121826] z-10">
              <div className="flex items-center space-x-2">
                <Calculator className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  Memória de Cálculo de 13º — {viewingCalc.employeeName}
                </h3>
              </div>
              <button
                onClick={() => setViewingCalc(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Header Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block">Matrícula:</span>
                  <span className="font-mono font-bold text-cyan-400">{viewingCalc.registrationNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Admissão:</span>
                  <span className="font-mono text-white">
                    {viewingCalc.admissionDate.split('-').reverse().join('/')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Avos de Direito:</span>
                  <span className="font-mono font-bold text-blue-400">{viewingCalc.monthsWorked}/12 avos</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Exercício:</span>
                  <span className="font-mono text-white">{viewingCalc.referenceYear}</span>
                </div>
              </div>

              {/* 1. Bases Mensais */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  1. Apuração da Base Mensal ({viewingCalc.monthlyHours}h)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Carteira (CLT Oficial):</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatCurrency(viewingCalc.baseSalaryCarteira)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Fórmula: R$ {viewingCalc.hourlyRateCarteira.toFixed(2)} × {viewingCalc.monthlyHours}h
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block">Verba Complementar (Por Fora):</span>
                    <span className="font-mono font-bold text-purple-400 text-sm">
                      {formatCurrency(viewingCalc.baseSalaryPorFora)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Fórmula: R$ {viewingCalc.hourlyRatePorFora.toFixed(2)} × {viewingCalc.monthlyHours}h
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. 1ª Parcela */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  2. 1ª Parcela (Adiantamento 50% sem desconto previdenciário)
                </h4>
                <div className="space-y-1.5 font-mono text-[11px] text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between">
                    <span>13º Salário Integral CLT ({viewingCalc.monthsWorked}/12):</span>
                    <span>{formatCurrency(viewingCalc.thirteenthFullCarteira)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-400">
                    <span>1ª Parcela Carteira (50%):</span>
                    <span>{formatCurrency(viewingCalc.firstInstallmentCarteira)}</span>
                  </div>
                  {viewingCalc.firstInstallmentPorFora > 0 && (
                    <div className="flex justify-between text-purple-300">
                      <span>1ª Parcela Por Fora (50%):</span>
                      <span>{formatCurrency(viewingCalc.firstInstallmentPorFora)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-white pt-1 border-t border-slate-800">
                    <span>Total Pago na 1ª Parcela:</span>
                    <span>{formatCurrency(viewingCalc.firstInstallmentTotal)}</span>
                  </div>
                </div>
              </div>

              {/* 3. 2ª Parcela e Tabela Progressiva do INSS */}
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  3. 2ª Parcela (Quitação e Apuração Progressiva do INSS)
                </h4>
                <div className="space-y-1.5 font-mono text-[11px] text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between">
                    <span>2ª Parcela Bruta CLT (50% restante):</span>
                    <span>{formatCurrency(viewingCalc.secondInstallmentGrossCarteira)}</span>
                  </div>
                  <div className="flex justify-between text-amber-400 font-bold">
                    <span>
                      Dedução INSS Oficial (Alíq. Efetiva: {viewingCalc.inssEffectiveRate || 0}%):
                    </span>
                    <span>-{formatCurrency(viewingCalc.inssDeductionCarteira)}</span>
                  </div>
                  {viewingCalc.otherDeductionsCarteira > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span>Outros Descontos Informados:</span>
                      <span>-{formatCurrency(viewingCalc.otherDeductionsCarteira)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-blue-300 pt-1 border-t border-slate-800">
                    <span>2ª Parcela Líquida CLT:</span>
                    <span>{formatCurrency(viewingCalc.secondInstallmentNetCarteira)}</span>
                  </div>
                  {viewingCalc.secondInstallmentPorFora > 0 && (
                    <div className="flex justify-between text-purple-300">
                      <span>2ª Parcela Por Fora:</span>
                      <span>{formatCurrency(viewingCalc.secondInstallmentPorFora)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-white pt-1 border-t border-slate-800">
                    <span>Total Líquido da 2ª Parcela:</span>
                    <span>{formatCurrency(viewingCalc.secondInstallmentTotalNet)}</span>
                  </div>
                </div>
              </div>

              {/* Tabela de Faixas Progressivas do INSS Vigente */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tabela Progressiva Oficial de INSS (EC 103/2019 — {viewingCalc.referenceYear}):
                </span>
                <div className="grid grid-cols-4 gap-2 text-[10px] font-mono text-slate-400">
                  {getInssBrackets(viewingCalc.referenceYear).map((br, i) => (
                    <div key={i} className="p-1.5 bg-slate-900 rounded">
                      Faixa {i + 1} (até R$ {br.max.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}): {(br.rate * 100).toLocaleString('pt-BR')}%
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção de Divergências */}
              {viewingCalc.divergences && viewingCalc.divergences.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-800/80 rounded-xl p-4 space-y-2">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Divergências Detectadas com a Planilha Importada:
                  </span>
                  <div className="divide-y divide-amber-900/40 text-[11px] font-mono">
                    {viewingCalc.divergences.map((div, i) => (
                      <div key={i} className="py-1.5 flex justify-between items-center text-amber-200">
                        <span>{div.label}</span>
                        <div className="space-x-3">
                          <span className="text-slate-400">Planilha: {formatCurrency(div.importedValue)}</span>
                          <span className="text-white font-bold">Calculado: {formatCurrency(div.calculatedValue)}</span>
                          <span className="text-amber-400 font-bold">
                            Diff: {div.diff > 0 ? `+${formatCurrency(div.diff)}` : formatCurrency(div.diff)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ajuste Manual (se houver) */}
              {viewingCalc.manualAdjustment && (
                <div className="bg-indigo-950/20 border border-indigo-800/80 rounded-xl p-3.5 space-y-1.5">
                  <span className="font-bold text-indigo-300 block">Histórico de Ajuste Manual:</span>
                  <p className="text-slate-300">
                    Justificativa: "{viewingCalc.manualAdjustment.reason}"
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Ajustado por {viewingCalc.manualAdjustment.adjustedBy} em{' '}
                    {new Date(viewingCalc.manualAdjustment.adjustedAt).toLocaleString('pt-BR')} (De{' '}
                    {formatCurrency(viewingCalc.manualAdjustment.originalAmount)} para{' '}
                    {formatCurrency(viewingCalc.manualAdjustment.adjustedAmount)}).
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setViewingCalc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ajuste Manual com Justificativa Obrigatória */}
      {adjustingCalc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                Ajuste Manual de 13º Salário
              </h3>
              <button
                onClick={() => setAdjustingCalc(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="p-4 space-y-3 text-xs">
              {adjustmentError && (
                <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 text-xs">
                  {adjustmentError}
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1">Colaborador:</label>
                <span className="font-bold text-white block">
                  {adjustingCalc.employeeName} (Obra {adjustingCalc.codigoObra || adjustingCalc.registrationNumber})
                </span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Valor Calculado Original:</label>
                <span className="font-mono text-emerald-400 font-bold block">
                  {formatCurrency(adjustingCalc.totalThirteenthCombinedNet)}
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Novo Valor Total Líquido (R$) *</label>
                <input
                  type="text"
                  required
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Justificativa Formal do Ajuste (Obrigatória para Auditoria) *
                </label>
                <textarea
                  required
                  rows={3}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Ex: Acordo coletivo homologado, compensação de adiantamento extrafolha ou decisão judicial."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustingCalc(null)}
                  className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg shadow-md transition"
                >
                  Confirmar e Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
