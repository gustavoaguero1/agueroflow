import React, { useState } from 'react';
import {
  X,
  FileText,
  Lock,
  Eye,
  Download,
  AlertTriangle,
  Building,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CommercialProposal, CommercialProposalItem } from '../../types/commercial';

interface CommercialProposalDetailModalProps {
  proposal: CommercialProposal;
  items: CommercialProposalItem[];
  organizationName: string;
  userRole?: string;
  onClose: () => void;
  onApproveProposal?: () => Promise<void>;
}

export const CommercialProposalDetailModal: React.FC<CommercialProposalDetailModalProps> = ({
  proposal,
  items,
  organizationName,
  userRole,
  onClose,
  onApproveProposal,
}) => {
  const [activeTab, setActiveTab] = useState<'cliente' | 'interna'>('cliente');
  const [exportWarningOpen, setExportWarningOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const canViewInternalCosts =
    userRole === 'Super Admin' ||
    userRole === 'Admin' ||
    userRole === 'Revisor' ||
    userRole === 'Gestor' ||
    userRole === 'Comercial';

  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: proposal.currency || 'BRL' });
  };

  const generateClientPdf = () => {
    if (proposal.isPartial && !proposal.partialExportAuthorized && !exportWarningOpen) {
      setExportWarningOpen(true);
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header with corporate branding
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(organizationName.toUpperCase() || 'AGUEROFLOW ENGENHARIA', 14, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('PROPOSTA COMERCIAL DE FORNECIMENTO INDUSTRIAL', 14, 23);
    doc.text(`CÓDIGO: ${proposal.code} | EMISSÃO: ${proposal.issueDate} | VALIDADE: ${proposal.validityDate}`, 14, 29);

    // 2. Client & Proposal Metadata Box
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO CLIENTE & ESCOPO', 14, 45);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 48, pageWidth - 28, 30, 2, 2, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cliente: ${proposal.clientName}`, 18, 56);
    doc.text(`CNPJ/CPF: ${proposal.clientCnpjCpf || 'Não informado'}`, 18, 62);
    doc.text(`Contato: ${proposal.clientContactPerson || '-'} | E-mail: ${proposal.clientEmail || '-'}`, 18, 68);
    doc.text(`Local de Entrega: ${proposal.deliveryLocation || 'A combinar'}`, 18, 74);

    doc.text(`Prazo de Entrega: ${proposal.deliveryTimeframeDays} dias corridos`, pageWidth / 2 + 5, 56);
    doc.text(`Condição de Pagamento: ${proposal.paymentTerms || 'A combinar'}`, pageWidth / 2 + 5, 62);
    doc.text(`Garantia: ${proposal.warrantyTerms || '12 meses'}`, pageWidth / 2 + 5, 68);

    // 3. Items Table (STRICT CLIENT FACING: NO COST, NO SUPPLIER, NO MARKUP, NO MARGIN)
    const tableData = items.map((it) => {
      const isUnpriced = it.matchClassification === 'NAO_ENCONTRADO' || it.proposedUnitPrice <= 0;
      return [
        it.itemNumber.toString(),
        it.inputCode || it.matchedInternalCode || '-',
        it.inputDescription + (it.inputSpecs ? ` - ${it.inputSpecs}` : ''),
        it.inputUnit,
        it.inputQuantity.toString(),
        isUnpriced ? 'Sob Consulta' : formatBrl(it.proposedUnitPrice),
        isUnpriced ? 'Sob Consulta' : formatBrl(it.proposedTotalPrice),
      ];
    });

    autoTable(doc, {
      startY: 85,
      head: [['Item', 'Código', 'Descrição Técnica Comercial', 'Unid', 'Qtd', 'Preço Unitário', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 15, halign: 'right' },
        5: { cellWidth: 26, halign: 'right' },
        6: { cellWidth: 26, halign: 'right' },
      },
    });

    // 4. Financial Summary Box
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFillColor(241, 245, 249);
    doc.rect(pageWidth - 90, finalY, 76, 22, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(pageWidth - 90, finalY, 76, 22, 'D');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('TOTAL PROPOSTO:', pageWidth - 86, finalY + 8);
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(formatBrl(proposal.proposedTotal), pageWidth - 86, finalY + 16);

    // 5. Commercial Notes & Acceptance Block
    const notesY = finalY + 30;
    if (notesY < doc.internal.pageSize.getHeight() - 40) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text('CONDIÇÕES GERAIS:', 14, notesY);
      doc.setFont('helvetica', 'normal');
      doc.text('• Preços expressos em Reais (BRL) com tributos destacados conforme legislação vigente.', 14, notesY + 5);
      doc.text(`• Validade desta proposta até ${proposal.validityDate}. Sujeita a reajuste após o vencimento.`, 14, notesY + 9);
      doc.text('• Faturamento direto mediante aprovação de cadastro de crédito.', 14, notesY + 13);

      doc.line(14, notesY + 30, 80, notesY + 30);
      doc.text('De Acordo - Cliente', 14, notesY + 34);

      doc.line(pageWidth - 80, notesY + 30, pageWidth - 14, notesY + 30);
      doc.text('Representante Comercial', pageWidth - 80, notesY + 34);
    }

    doc.save(`${proposal.code}_Proposta_Comercial.pdf`);
    setExportWarningOpen(false);
  };

  const handleApprove = async () => {
    if (!onApproveProposal) return;
    setApproving(true);
    try {
      await onApproveProposal();
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-700/80 flex items-center justify-between bg-slate-900/90 rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-800 text-cyan-300 rounded font-bold border border-cyan-800">
                  {proposal.code}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    proposal.status === 'aprovada'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : proposal.status === 'parcial'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : proposal.status === 'finalizada'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {proposal.status.toUpperCase()}
                </span>
                {proposal.isPartial && (
                  <span className="text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Parcial ({proposal.pendingItemsCount} sem preço)
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-1">{proposal.title}</h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Switcher */}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
              <button
                onClick={() => setActiveTab('cliente')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  activeTab === 'cliente'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Proposta do Cliente</span>
              </button>
              {canViewInternalCosts && (
                <button
                  onClick={() => setActiveTab('interna')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    activeTab === 'interna'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Visão Confidencial</span>
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: PROPOSTA COMERCIAL DESTINADA AO CLIENTE */}
          {activeTab === 'cliente' && (
            <div className="space-y-6">
              {/* Client Proposal Header Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">Cliente Destinatário</span>
                    <p className="text-sm font-semibold text-white">{proposal.clientName}</p>
                    <p className="text-slate-300">CNPJ: {proposal.clientCnpjCpf || 'Não informado'}</p>
                    <p className="text-slate-400">
                      Contato: {proposal.clientContactPerson || '-'} ({proposal.clientEmail || '-'})
                    </p>
                  </div>
                  <div className="space-y-1 md:text-right">
                    <p className="text-slate-300">
                      <span className="text-slate-500">Emissão:</span> {proposal.issueDate}
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-500">Validade da Proposta:</span>{' '}
                      <strong className="text-cyan-300">{proposal.validityDate}</strong>
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-500">Prazo de Entrega:</span> {proposal.deliveryTimeframeDays} dias
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-500">Condições de Pagamento:</span> {proposal.paymentTerms}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    <span>Local de Entrega: {proposal.deliveryLocation || 'FOB Unidade Industrial'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Garantia: {proposal.warrantyTerms || '12 meses'}</span>
                  </div>
                </div>
              </div>

              {/* Items Table - Strict Client View */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Itens da Proposta Comercial ({items.length})
                  </h3>
                  <span className="text-xs text-slate-400">
                    Valores em {proposal.currency || 'BRL'} (Preço final proposto)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12">#</th>
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Descrição Técnica do Material</th>
                        <th className="py-2.5 px-3 text-center">Unid.</th>
                        <th className="py-2.5 px-3 text-right">Qtd</th>
                        <th className="py-2.5 px-3 text-right">Preço Unitário</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {items.map((it) => {
                        const isPending = it.matchClassification === 'NAO_ENCONTRADO' || it.proposedUnitPrice <= 0;
                        return (
                          <tr key={it.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">{it.itemNumber}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-cyan-400">
                              {it.inputCode || it.matchedInternalCode || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-semibold text-slate-200">{it.inputDescription}</p>
                              {it.inputSpecs && <p className="text-[11px] text-slate-400">{it.inputSpecs}</p>}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-300">{it.inputUnit}</td>
                            <td className="py-2.5 px-3 text-right font-medium text-white">{it.inputQuantity}</td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {isPending ? (
                                <span className="text-amber-400 font-medium">Sob Consulta</span>
                              ) : (
                                formatBrl(it.proposedUnitPrice)
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              {isPending ? (
                                <span className="text-amber-400 font-medium">Sob Consulta</span>
                              ) : (
                                formatBrl(it.proposedTotalPrice)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Proposal Total Bottom Bar */}
                <div className="bg-slate-900/90 p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    {proposal.isPartial ? (
                      <span className="text-amber-300 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-4 h-4" />
                        Proposta Parcial: {proposal.pendingItemsCount} item(ns) estão sob consulta de fornecedor.
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Todos os itens precificados e validados.
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 mr-3">TOTAL GERAL PROPOSTO:</span>
                    <span className="text-xl font-bold font-mono text-cyan-300">
                      {formatBrl(proposal.proposedTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VISÃO INTERNA CONFIDENCIAL COM CUSTOS, MARKUP E MARGEM */}
          {activeTab === 'interna' && canViewInternalCosts && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start space-x-3 text-amber-200 text-xs">
                <Lock className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-300 text-sm">Área Restrita — Dados Comerciais Confidenciais</h4>
                  <p className="mt-1">
                    Custos-base, fornecedores, markup e margem operacional nunca são enviados ao cliente ou impressos em
                    propostas comerciais externas.
                  </p>
                </div>
              </div>

              {/* Financial Dashboard Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 block">Custo-Base Total</span>
                  <p className="text-base font-bold font-mono text-slate-200 mt-1">
                    {formatBrl(proposal.totalBaseCost)}
                  </p>
                  <span className="text-[10px] text-slate-500">Itens precificados</span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 block">Markup Geral Autorizado</span>
                  <p className="text-base font-bold font-mono text-cyan-400 mt-1">
                    {proposal.globalMarkupPercent}%
                  </p>
                  <span className="text-[10px] text-slate-500">Sobre o custo-base</span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 block">Margem Bruta (R$)</span>
                  <p className="text-base font-bold font-mono text-emerald-400 mt-1">
                    {formatBrl(proposal.grossMarginAmount)}
                  </p>
                  <span className="text-[10px] text-slate-500">Preço - Custo</span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-slate-400 block">Margem Bruta (%)</span>
                  <p className="text-base font-bold font-mono text-emerald-300 mt-1">
                    {proposal.grossMarginPercent.toFixed(1)}%
                  </p>
                  <span className="text-[10px] text-slate-500">Sobre o preço de venda</span>
                </div>
              </div>

              {/* Detailed Breakdown Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-900 px-4 py-3 border-b border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Memória de Cálculo e Análise de Fornecedor por Item
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 text-center">#</th>
                        <th className="py-2 px-3">Item / Código</th>
                        <th className="py-2 px-3">Classificação</th>
                        <th className="py-2 px-3">Fornecedor / Fonte</th>
                        <th className="py-2 px-3 text-right">Custo Unit.</th>
                        <th className="py-2 px-3 text-right">Markup</th>
                        <th className="py-2 px-3 text-right">Preço Proposto</th>
                        <th className="py-2 px-3 text-right">Margem Unit.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {items.map((it) => {
                        const marginItem = it.proposedUnitPrice - it.baseCost;
                        return (
                          <tr key={it.id} className="hover:bg-slate-900/50">
                            <td className="py-2 px-3 text-center text-slate-500 font-sans">{it.itemNumber}</td>
                            <td className="py-2 px-3 font-sans">
                              <span className="font-semibold text-white block">{it.inputDescription}</span>
                              <span className="text-[11px] font-mono text-cyan-400">
                                {it.matchedInternalCode || it.inputCode || '-'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                  it.matchClassification === 'EXATO'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : it.matchClassification === 'COMPARAVEL'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : it.matchClassification === 'EQUIVALENTE_TECNICO'
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {it.matchClassification}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-300">
                              <p className="font-medium text-xs text-slate-200">{it.supplierName || 'Pendente'}</p>
                              <p className="text-[10px] text-slate-400">
                                {it.priceSourceType} ({it.priceSourceDate || '-'})
                              </p>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-200">{formatBrl(it.baseCost)}</td>
                            <td className="py-2 px-3 text-right text-cyan-300">{it.markupPercent}%</td>
                            <td className="py-2 px-3 text-right font-bold text-white">
                              {formatBrl(it.proposedUnitPrice)}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-400">{formatBrl(marginItem)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Export Partial Warning Confirmation Modal */}
        {exportWarningOpen && (
          <div className="p-4 bg-amber-500/20 border-t border-amber-500/40 text-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <span>
                <strong>Atenção:</strong> Esta proposta possui {proposal.pendingItemsCount} item(ns) pendente(s) de preço.
                Confirmar exportação de proposta parcial?
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setExportWarningOpen(false)}
                className="px-3 py-1.5 bg-slate-800 text-xs text-slate-300 rounded hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  proposal.partialExportAuthorized = true;
                  generateClientPdf();
                }}
                className="px-3 py-1.5 bg-amber-600 text-xs text-white font-bold rounded hover:bg-amber-500"
              >
                Sim, Exportar Parcial
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 rounded-b-xl">
          <div className="text-xs text-slate-400">
            Criado por: <span className="text-slate-300 font-medium">{proposal.createdByName || 'Comercial'}</span> em{' '}
            {proposal.createdAt.split('T')[0]}
          </div>

          <div className="flex items-center space-x-2.5">
            {proposal.status === 'aguardando_revisao' && onApproveProposal && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{approving ? 'Aprovando...' : 'Aprovar Proposta'}</span>
              </button>
            )}

            <button
              onClick={generateClientPdf}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg transition shadow-lg"
            >
              <Download className="w-4 h-4" />
              <span>Exportar PDF da Proposta Comercial</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
