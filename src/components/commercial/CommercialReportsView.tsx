import React, { useState } from 'react';
import {
  FileBarChart,
  Download,
  Calendar,
  Filter,
  PieChart as PieIcon,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CommercialProposal } from '../../types/commercial';

interface CommercialReportsViewProps {
  proposals: CommercialProposal[];
  organizationName: string;
}

export const CommercialReportsView: React.FC<CommercialReportsViewProps> = ({
  proposals,
  organizationName,
}) => {
  const [selectedClient, setSelectedClient] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');

  const clients = Array.from(new Set(proposals.map((p) => p.clientName).filter(Boolean)));

  const filtered = proposals.filter((p) => {
    const matchClient = selectedClient === 'todos' || p.clientName === selectedClient;
    const matchStatus = selectedStatus === 'todos' || p.status === selectedStatus;
    return matchClient && matchStatus;
  });

  const totalOffered = filtered.reduce((acc, p) => acc + (p.proposedTotal || 0), 0);
  const totalApproved = filtered
    .filter((p) => p.status === 'aprovada' || p.status === 'finalizada')
    .reduce((acc, p) => acc + (p.proposedTotal || 0), 0);
  const totalItemsCount = filtered.reduce((acc, p) => acc + (p.totalItemsCount || 0), 0);
  const totalPricedCount = filtered.reduce((acc, p) => acc + (p.pricedItemsCount || 0), 0);
  const accuracyPct = totalItemsCount > 0 ? Math.round((totalPricedCount / totalItemsCount) * 100) : 100;

  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Export filtered proposals to Excel (.xlsx)
  const handleExportExcel = () => {
    const rows = filtered.map((p) => ({
      'Código Proposta': p.code,
      'Título': p.title,
      'Cliente': p.clientName,
      'CNPJ/CPF': p.clientCnpjCpf || '',
      'Data Emissão': p.issueDate,
      'Data Validade': p.validityDate,
      'Prazo Entrega (Dias)': p.deliveryTimeframeDays,
      'Condição Pagamento': p.paymentTerms,
      'Local Entrega': p.deliveryLocation,
      'Total Itens': p.totalItemsCount,
      'Itens Precificados': p.pricedItemsCount,
      'Itens Pendentes': p.pendingItemsCount,
      'Valor Total Proposto (R$)': p.proposedTotal,
      'Status': p.status.toUpperCase(),
      'Responsável Criação': p.createdByName || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio_Propostas');
    XLSX.writeFile(wb, `Relatorio_Comercial_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Código',
      'Título',
      'Cliente',
      'Data Emissão',
      'Validade',
      'Total Itens',
      'Itens Precificados',
      'Itens Pendentes',
      'Valor Proposto',
      'Status',
    ];

    const csvRows = filtered.map((p) => [
      `"${p.code}"`,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.clientName.replace(/"/g, '""')}"`,
      `"${p.issueDate}"`,
      `"${p.validityDate}"`,
      p.totalItemsCount,
      p.pricedItemsCount,
      p.pendingItemsCount,
      p.proposedTotal.toFixed(2),
      `"${p.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(';'), ...csvRows.map((e) => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Relatorio_Comercial_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-cyan-400" />
            <span>Relatórios Comerciais & Desempenho de Propostas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Consolidação gerencial de cotações, taxa de assertividade do catálogo e volume financeiro.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg border border-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg transition shadow-lg"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl shadow-lg">
          <span className="text-xs text-slate-400 block mb-1">Volume Total Cotado</span>
          <p className="text-xl font-bold font-mono text-cyan-300">{formatBrl(totalOffered)}</p>
          <span className="text-[10px] text-slate-500 mt-1 block">Propostas no período filtrado</span>
        </div>

        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl shadow-lg">
          <span className="text-xs text-slate-400 block mb-1">Volume Aprovado / Fechado</span>
          <p className="text-xl font-bold font-mono text-emerald-400">{formatBrl(totalApproved)}</p>
          <span className="text-[10px] text-slate-500 mt-1 block">Propostas com aceite formal</span>
        </div>

        <div className="bg-[#0B132B] border border-slate-700/80 p-4 rounded-xl shadow-lg">
          <span className="text-xs text-slate-400 block mb-1">Assertividade do Catálogo Interno</span>
          <p className="text-xl font-bold font-mono text-white">{accuracyPct}%</p>
          <span className="text-[10px] text-slate-500 mt-1 block">
            {totalPricedCount} itens localizados de {totalItemsCount} totais
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="text-slate-400">Cliente:</span>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="todos">Todos os Clientes</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-400">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="todos">Todos os Status</option>
            <option value="rascunho">Rascunho</option>
            <option value="parcial">Parcial</option>
            <option value="aguardando_revisao">Aguardando Revisão</option>
            <option value="aprovada">Aprovada</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Título / Projeto</th>
                <th className="py-2.5 px-3">Cliente</th>
                <th className="py-2.5 px-3 text-center">Itens (Prec/Tot)</th>
                <th className="py-2.5 px-3 text-right">Valor Proposto</th>
                <th className="py-2.5 px-3">Emissão</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-3 font-bold text-cyan-300">{p.code}</td>
                  <td className="py-2.5 px-3 font-sans text-slate-200">{p.title}</td>
                  <td className="py-2.5 px-3 font-sans text-slate-300">{p.clientName}</td>
                  <td className="py-2.5 px-3 text-center">
                    {p.pricedItemsCount} / {p.totalItemsCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-white">{formatBrl(p.proposedTotal)}</td>
                  <td className="py-2.5 px-3 text-slate-400 font-sans">{p.issueDate}</td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        p.status === 'aprovada'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : p.status === 'parcial'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {p.status.toUpperCase()}
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
