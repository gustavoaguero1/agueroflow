import React, { useState } from 'react';
import {
  FileBarChart,
  Download,
  Filter,
  DollarSign,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Building,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { RhEmployee, RhThirteenthCalculation } from '../../types/rhPayroll';
import { Unit, Contract } from '../../types';

interface RhReportsManagerProps {
  calculations: RhThirteenthCalculation[];
  employees: RhEmployee[];
  units: Unit[];
  contracts: Contract[];
  referenceYear: number;
  canViewFinancials: boolean;
  orgName: string;
}

export const RhReportsManager: React.FC<RhReportsManagerProps> = ({
  calculations,
  employees,
  units,
  contracts,
  referenceYear,
  canViewFinancials,
  orgName,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [selectedContract, setSelectedContract] = useState<string>('all');

  const filteredCalculations = calculations.filter((c) => {
    if (selectedStatus === 'approved' && c.status !== 'aprovado') return false;
    if (selectedStatus === 'divergent' && !c.hasDivergence) return false;
    if (selectedStatus === 'pending' && (c.status === 'aprovado' || c.hasDivergence)) return false;
    if (selectedUnit !== 'all' && c.unitId !== selectedUnit) return false;
    if (selectedContract !== 'all' && c.contractId !== selectedContract) return false;
    return true;
  });

  const formatCurrency = (val: number) => {
    if (!canViewFinancials) return 'R$ ••••••';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Totais do relatório filtrado
  const totalEmployees = filteredCalculations.length;
  const totalGrossCarteira = filteredCalculations.reduce(
    (sum, c) => sum + c.thirteenthFullCarteira,
    0
  );
  const total1aParcela = filteredCalculations.reduce((sum, c) => sum + c.firstInstallmentTotal, 0);
  const totalInss = filteredCalculations.reduce((sum, c) => sum + c.inssDeductionCarteira, 0);
  const total2aParcelaNet = filteredCalculations.reduce(
    (sum, c) => sum + c.secondInstallmentTotalNet,
    0
  );
  const totalPorFora = filteredCalculations.reduce(
    (sum, c) => sum + c.firstInstallmentPorFora + c.secondInstallmentPorFora,
    0
  );
  const totalCombinedNet = filteredCalculations.reduce(
    (sum, c) => sum + c.totalThirteenthCombinedNet,
    0
  );

  // Exportar para Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredCalculations.length === 0) {
      alert('Não há registros para exportação com os filtros aplicados.');
      return;
    }

    const rows = filteredCalculations.map((c) => ({
      'Cód. Obra': c.codigoObra || c.registrationNumber,
      Funcionário: c.employeeName,
      Empresa: c.companyName,
      Admissão: c.admissionDate,
      Avos: c.monthsWorked,
      'Base Mensal CLT': c.baseSalaryCarteira,
      'Base Mensal Por Fora': c.baseSalaryPorFora,
      '13º Integral CLT': c.thirteenthFullCarteira,
      '1ª Parc. CLT': c.firstInstallmentCarteira,
      '1ª Parc. Por Fora': c.firstInstallmentPorFora,
      'Total 1ª Parcela': c.firstInstallmentTotal,
      '2ª Parc. Bruta CLT': c.secondInstallmentGrossCarteira,
      'INSS Oficial': c.inssDeductionCarteira,
      'Outros Descontos': c.otherDeductionsCarteira,
      '2ª Parc. Líq. CLT': c.secondInstallmentNetCarteira,
      '2ª Parc. Por Fora': c.secondInstallmentPorFora,
      'Total 2ª Parcela Líquida': c.secondInstallmentTotalNet,
      'Total Líquido Geral': c.totalThirteenthCombinedNet,
      Status: c.status,
      Divergente: c.hasDivergence ? 'SIM' : 'NÃO',
      'Aviso Legal': 'PRÉVIA PARA CONFERÊNCIA — NÃO CONSTITUI FOLHA DE PAGAMENTO',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `13o_Salario_${referenceYear}`);
    XLSX.writeFile(wb, `relatorio_13_salario_${referenceYear}_${orgName.toLowerCase().replace(/\s+/g, '_')}.xlsx`);
  };

  // Exportar para CSV
  const handleExportCSV = () => {
    if (filteredCalculations.length === 0) {
      alert('Não há registros para exportação com os filtros aplicados.');
      return;
    }

    const headers = [
      'Cod_Obra',
      'Funcionario',
      'Empresa',
      'Admissao',
      'Avos',
      'Base_CLT',
      'Base_Por_Fora',
      'Total_1a_Parcela',
      'INSS_Oficial',
      'Total_2a_Parcela_Liquida',
      'Total_Geral_Liquido',
      'Status',
    ];

    const csvRows = filteredCalculations.map((c) => [
      `"${c.codigoObra || c.registrationNumber}"`,
      `"${c.employeeName.replace(/"/g, '""')}"`,
      `"${c.companyName}"`,
      `"${c.admissionDate}"`,
      c.monthsWorked,
      c.baseSalaryCarteira.toFixed(2),
      c.baseSalaryPorFora.toFixed(2),
      c.firstInstallmentTotal.toFixed(2),
      c.inssDeductionCarteira.toFixed(2),
      c.secondInstallmentTotalNet.toFixed(2),
      c.totalThirteenthCombinedNet.toFixed(2),
      `"${c.status}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...csvRows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_13_salario_${referenceYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos os Status</option>
            <option value="approved">Aprovados</option>
            <option value="pending">Conferidos / Em Aberto</option>
            <option value="divergent">Divergentes com Planilha</option>
          </select>

          {/* Unit Filter */}
          {units.length > 0 && (
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Todas as Unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}

          {/* Contract Filter */}
          {contracts.length > 0 && (
            <select
              value={selectedContract}
              onChange={(e) => setSelectedContract(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Todos os Contratos</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block">Registros Selecionados:</span>
          <span className="text-2xl font-bold text-white mt-1 block">{totalEmployees}</span>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block">Total 1ª Parcela (50%):</span>
          <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
            {formatCurrency(total1aParcela)}
          </span>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block">Retenção Previdenciária (INSS):</span>
          <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
            {formatCurrency(totalInss)}
          </span>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 block">Total Geral Líquido:</span>
          <span className="text-xl font-bold font-mono text-cyan-400 mt-1 block">
            {formatCurrency(totalCombinedNet)}
          </span>
        </div>
      </div>

      {/* Report Data Table Preview */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 text-xs font-bold text-white flex items-center justify-between">
          <span>Relatório Consolidado de Provisão do 13º Salário {referenceYear}</span>
          <span className="text-[11px] text-slate-400 font-normal">
            Exibindo {filteredCalculations.length} colaboradores
          </span>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0">
                <th className="py-2.5 px-3">Cód. Obra</th>
                <th className="py-2.5 px-3">Funcionário</th>
                <th className="py-2.5 px-2 text-center">Avos</th>
                <th className="py-2.5 px-3 text-right">Base CLT</th>
                <th className="py-2.5 px-3 text-right">1ª Parcela</th>
                <th className="py-2.5 px-3 text-right">INSS</th>
                <th className="py-2.5 px-3 text-right">2ª Parcela Líq.</th>
                <th className="py-2.5 px-3 text-right text-cyan-300">Total Líquido</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans text-slate-200">
              {filteredCalculations.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2 px-3 font-mono font-bold text-cyan-400">
                    {c.codigoObra || c.registrationNumber}
                  </td>
                  <td className="py-2 px-3 font-semibold text-white">{c.employeeName}</td>
                  <td className="py-2 px-2 text-center font-mono">{c.monthsWorked}/12</td>
                  <td className="py-2 px-3 text-right font-mono">
                    {formatCurrency(c.baseSalaryCarteira)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-400 font-semibold">
                    {formatCurrency(c.firstInstallmentTotal)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-amber-400">
                    {c.inssDeductionCarteira > 0 ? `-${formatCurrency(c.inssDeductionCarteira)}` : '-'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-blue-300 font-semibold">
                    {formatCurrency(c.secondInstallmentTotalNet)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-cyan-300">
                    {formatCurrency(c.totalThirteenthCombinedNet)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-semibold uppercase">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
