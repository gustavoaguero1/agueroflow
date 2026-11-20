import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  FileText,
  AlertTriangle,
  Building2,
  Calendar,
  DollarSign,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RhThirteenthCalculation } from '../../types/rhPayroll';

interface RhDemonstrativoModalProps {
  calculations: RhThirteenthCalculation[];
  initialCalculationId?: string;
  onClose: () => void;
  canViewFinancials: boolean;
  orgName: string;
}

export const RhDemonstrativoModal: React.FC<RhDemonstrativoModalProps> = ({
  calculations,
  initialCalculationId,
  onClose,
  canViewFinancials,
  orgName,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (!initialCalculationId) return 0;
    const foundIdx = calculations.findIndex((c) => c.id === initialCalculationId);
    return foundIdx >= 0 ? foundIdx : 0;
  });

  const [parcelaMode, setParcelaMode] = useState<'integral' | 'primeira' | 'segunda'>('integral');

  const currentCalc = calculations[selectedIndex];

  if (!currentCalc) {
    return null;
  }

  const formatCurrency = (val: number) => {
    if (!canViewFinancials) return 'R$ ••••••';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const c = currentCalc;

    // Header Aviso Obrigatório
    doc.setFillColor(240, 240, 240);
    doc.rect(14, 10, 182, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(180, 0, 0);
    doc.text(
      'PRÉVIA PARA CONFERÊNCIA — NÃO SUBSTITUI HOLERITE OFICIAL OU FOLHA DE PAGAMENTO',
      105,
      17,
      { align: 'center' }
    );

    // Dados da Empresa
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(c.companyName || orgName, 14, 30);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('RECIBO DE PRÉVIA DE 13º SALÁRIO — EXERCÍCIO ' + c.referenceYear, 14, 35);
    doc.text(
      'Emissão: ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR'),
      14,
      40
    );

    // Dados do Funcionário
    doc.setDrawColor(200, 200, 200);
    doc.rect(14, 44, 182, 18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cód. Obra: ${c.codigoObra || c.registrationNumber}`, 18, 50);
    doc.text(`Colaborador: ${c.employeeName}`, 60, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Admissão: ${c.admissionDate.split('-').reverse().join('/')}`, 18, 57);
    doc.text(`Avos de Direito: ${c.monthsWorked}/12`, 60, 57);
    doc.text(`Base CLT: ${formatCurrency(c.baseSalaryCarteira)}`, 110, 57);

    // Itens da Folha
    const tableBody: any[][] = [];

    if (parcelaMode === 'integral' || parcelaMode === 'primeira') {
      tableBody.push([
        '001',
        '1ª Parcela 13º Salário (50% sem INSS)',
        '50.00%',
        formatCurrency(c.firstInstallmentCarteira),
        '-',
      ]);
      if (c.firstInstallmentPorFora > 0) {
        tableBody.push([
          '003',
          'Verba Complementar 1ª Parcela (Por Fora)',
          '50.00%',
          formatCurrency(c.firstInstallmentPorFora),
          '-',
        ]);
      }
    }

    if (parcelaMode === 'integral' || parcelaMode === 'segunda') {
      tableBody.push([
        '002',
        '2ª Parcela 13º Salário Bruto CLT',
        '50.00%',
        formatCurrency(c.secondInstallmentGrossCarteira),
        '-',
      ]);
      if (c.inssDeductionCarteira > 0) {
        tableBody.push([
          '101',
          `Desconto INSS Oficial (${c.inssEffectiveRate || 0}%)`,
          `${c.inssEffectiveRate || 0}%`,
          '-',
          formatCurrency(c.inssDeductionCarteira),
        ]);
      }
      if (c.otherDeductionsCarteira > 0) {
        tableBody.push([
          '102',
          'Outros Descontos Informados',
          '-',
          '-',
          formatCurrency(c.otherDeductionsCarteira),
        ]);
      }
      if (c.secondInstallmentPorFora > 0) {
        tableBody.push([
          '004',
          'Verba Complementar 2ª Parcela (Por Fora)',
          '50.00%',
          formatCurrency(c.secondInstallmentPorFora),
          '-',
        ]);
      }
    }

    autoTable(doc, {
      startY: 68,
      head: [['Código', 'Descrição do Evento', 'Referência', 'Vencimentos (R$)', 'Descontos (R$)']],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, font: 'helvetica' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totais
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Líquido Estimado a Receber: ${formatCurrency(c.totalThirteenthCombinedNet)}`, 14, finalY);

    // Rodapé de Assinatura e Aviso Obrigatório
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Declaro ter conferido as bases e cálculos informados neste demonstrativo prévio.', 14, finalY + 20);
    doc.line(14, finalY + 35, 110, finalY + 35);
    doc.text('Assinatura do Colaborador', 14, finalY + 40);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 0, 0);
    doc.text(
      'PRÉVIA PARA CONFERÊNCIA — NÃO SUBSTITUI HOLERITE OFICIAL OU FOLHA DE PAGAMENTO',
      105,
      finalY + 50,
      { align: 'center' }
    );

    doc.save(`demonstrativo_13_${c.registrationNumber}_${c.referenceYear}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:fixed-none">
      <div className="bg-[#121826] border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Modal Controls Header (Hidden in Print) */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#161e31] print:hidden">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-white">
              Demonstrativo de Conferência de 13º Salário
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation between employees */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs text-slate-300">
              <button
                disabled={selectedIndex <= 0}
                onClick={() => setSelectedIndex((prev) => prev - 1)}
                className="p-1 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono text-[11px]">
                {selectedIndex + 1} de {calculations.length}
              </span>
              <button
                disabled={selectedIndex >= calculations.length - 1}
                onClick={() => setSelectedIndex((prev) => prev + 1)}
                className="p-1 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Parcela filter */}
            <select
              value={parcelaMode}
              onChange={(e) => setParcelaMode(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
            >
              <option value="integral">Integral (1ª e 2ª)</option>
              <option value="primeira">Somente 1ª Parcela (50%)</option>
              <option value="segunda">Somente 2ª Parcela (Quitação)</option>
            </select>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              title="Imprimir demonstrativo"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>

            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition"
              title="Baixar em formato PDF"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Demonstrativo Card Body */}
        <div className="p-6 space-y-4 print:p-2 bg-slate-950 text-slate-100 print:bg-white print:text-black">
          {/* Mandatory Legal Warning Header */}
          <div className="p-2.5 bg-rose-950/80 border-2 border-rose-600 rounded-lg text-center print:bg-gray-100 print:border-black">
            <span className="text-xs font-extrabold text-rose-300 uppercase tracking-wider block print:text-black">
              PRÉVIA PARA CONFERÊNCIA — NÃO SUBSTITUI HOLERITE OFICIAL OU FOLHA DE PAGAMENTO
            </span>
          </div>

          {/* Company & Document Header */}
          <div className="border border-slate-800 print:border-black rounded-lg p-3 bg-slate-900/60 print:bg-transparent">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-sm font-bold text-white print:text-black">
                  {currentCalc.companyName || orgName}
                </h2>
                <p className="text-[11px] text-slate-400 print:text-gray-700">
                  DEMONSTRATIVO DE PRÉ-CÁLCULO DE 13º SALÁRIO — EXERCÍCIO {currentCalc.referenceYear}
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-400 print:text-gray-700 font-mono">
                <div>Emitido em: {new Date().toLocaleDateString('pt-BR')}</div>
                <div>Status: {currentCalc.status.toUpperCase()}</div>
              </div>
            </div>
          </div>

          {/* Employee Identification Box */}
          <div className="border border-slate-800 print:border-black rounded-lg p-3 bg-slate-900/40 print:bg-transparent grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 print:text-gray-700 block">Cód. Obra Alocada:</span>
              <span className="font-mono font-bold text-cyan-400 print:text-black">
                {currentCalc.codigoObra || currentCalc.registrationNumber}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 print:text-gray-700 block">Nome do Funcionário:</span>
              <span className="font-bold text-white print:text-black">{currentCalc.employeeName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 print:text-gray-700 block">Data de Admissão:</span>
              <span className="font-mono text-slate-200 print:text-black">
                {currentCalc.admissionDate.split('-').reverse().join('/')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 print:text-gray-700 block">Avos de Direito:</span>
              <span className="font-mono font-bold text-blue-400 print:text-black">
                {currentCalc.monthsWorked}/12 avos
              </span>
            </div>
          </div>

          {/* Events Table (Vencimentos & Descontos) */}
          <div className="border border-slate-800 print:border-black rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 print:bg-gray-200 border-b border-slate-800 print:border-black text-[10px] font-bold text-slate-300 print:text-black uppercase">
                  <th className="py-2 px-3">Cód</th>
                  <th className="py-2 px-3">Descrição do Evento</th>
                  <th className="py-2 px-3 text-center">Ref.</th>
                  <th className="py-2 px-3 text-right">Vencimentos (R$)</th>
                  <th className="py-2 px-3 text-right">Descontos (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-black text-[11px] font-mono">
                {(parcelaMode === 'integral' || parcelaMode === 'primeira') && (
                  <>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2 px-3">001</td>
                      <td className="py-2 px-3 font-sans font-semibold text-white print:text-black">
                        1ª Parcela 13º Salário (50% CLT)
                      </td>
                      <td className="py-2 px-3 text-center">50,00%</td>
                      <td className="py-2 px-3 text-right text-emerald-400 print:text-black font-bold">
                        {formatCurrency(currentCalc.firstInstallmentCarteira)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">-</td>
                    </tr>
                    {currentCalc.firstInstallmentPorFora > 0 && (
                      <tr className="hover:bg-slate-900/30">
                        <td className="py-2 px-3">003</td>
                        <td className="py-2 px-3 font-sans text-purple-300 print:text-black">
                          Verba Complementar 1ª Parcela (Por Fora)
                        </td>
                        <td className="py-2 px-3 text-center">50,00%</td>
                        <td className="py-2 px-3 text-right text-purple-400 print:text-black font-bold">
                          {formatCurrency(currentCalc.firstInstallmentPorFora)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">-</td>
                      </tr>
                    )}
                  </>
                )}

                {(parcelaMode === 'integral' || parcelaMode === 'segunda') && (
                  <>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2 px-3">002</td>
                      <td className="py-2 px-3 font-sans font-semibold text-white print:text-black">
                        2ª Parcela 13º Salário Bruto CLT
                      </td>
                      <td className="py-2 px-3 text-center">50,00%</td>
                      <td className="py-2 px-3 text-right text-emerald-400 print:text-black font-bold">
                        {formatCurrency(currentCalc.secondInstallmentGrossCarteira)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500">-</td>
                    </tr>
                    {currentCalc.inssDeductionCarteira > 0 && (
                      <tr className="hover:bg-slate-900/30">
                        <td className="py-2 px-3">101</td>
                        <td className="py-2 px-3 font-sans text-amber-300 print:text-black">
                          Dedução Previdenciária Oficial (INSS 13º)
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-amber-400 print:text-black">
                          {currentCalc.inssEffectiveRate || 0}%
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">-</td>
                        <td className="py-2 px-3 text-right text-amber-400 print:text-black font-bold">
                          {formatCurrency(currentCalc.inssDeductionCarteira)}
                        </td>
                      </tr>
                    )}
                    {currentCalc.otherDeductionsCarteira > 0 && (
                      <tr className="hover:bg-slate-900/30">
                        <td className="py-2 px-3">102</td>
                        <td className="py-2 px-3 font-sans text-amber-300 print:text-black">
                          Outros Descontos / Adiantamentos
                        </td>
                        <td className="py-2 px-3 text-center">-</td>
                        <td className="py-2 px-3 text-right text-slate-500">-</td>
                        <td className="py-2 px-3 text-right text-amber-400 print:text-black font-bold">
                          {formatCurrency(currentCalc.otherDeductionsCarteira)}
                        </td>
                      </tr>
                    )}
                    {currentCalc.secondInstallmentPorFora > 0 && (
                      <tr className="hover:bg-slate-900/30">
                        <td className="py-2 px-3">004</td>
                        <td className="py-2 px-3 font-sans text-purple-300 print:text-black">
                          Verba Complementar 2ª Parcela (Por Fora)
                        </td>
                        <td className="py-2 px-3 text-center">50,00%</td>
                        <td className="py-2 px-3 text-right text-purple-400 print:text-black font-bold">
                          {formatCurrency(currentCalc.secondInstallmentPorFora)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500">-</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Summary Footer */}
          <div className="border border-slate-800 print:border-black rounded-lg p-3 bg-slate-900/70 print:bg-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5 text-[11px] font-mono text-slate-400 print:text-gray-700">
              <div>Base Mensal CLT: {formatCurrency(currentCalc.baseSalaryCarteira)} (220h)</div>
              <div>Base Cálculo INSS: {formatCurrency(currentCalc.thirteenthFullCarteira)}</div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-gray-700 block">
                Valor Líquido a Receber:
              </span>
              <span className="text-xl font-bold font-mono text-emerald-400 print:text-black">
                {formatCurrency(currentCalc.totalThirteenthCombinedNet)}
              </span>
            </div>
          </div>

          {/* Acknowledgement / Signature Block */}
          <div className="border border-slate-800 print:border-black rounded-lg p-4 space-y-6 pt-6">
            <p className="text-[10px] text-slate-400 print:text-gray-700">
              Declaro ter recebido e conferido a memória e bases de cálculo constantes deste demonstrativo
              prévio para fins de conferência de 13º salário.
            </p>
            <div className="flex flex-col sm:flex-row items-end justify-between gap-4 pt-4">
              <div className="w-full sm:w-64 border-t border-slate-600 print:border-black text-center pt-1 text-[10px] text-slate-400 print:text-gray-700">
                Assinatura do Colaborador
              </div>
              <div className="text-[10px] text-slate-500 print:text-gray-700 font-mono">
                Data: ____/____/________
              </div>
            </div>
          </div>

          {/* Mandatory Bottom Disclaimer Banner */}
          <div className="p-2.5 bg-rose-950/80 border-2 border-rose-600 rounded-lg text-center print:bg-gray-100 print:border-black">
            <span className="text-xs font-extrabold text-rose-300 uppercase tracking-wider block print:text-black">
              PRÉVIA PARA CONFERÊNCIA — NÃO SUBSTITUI HOLERITE OFICIAL OU FOLHA DE PAGAMENTO
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
