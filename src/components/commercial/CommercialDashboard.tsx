import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Trash2,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Database,
  Building,
  Calculator,
  Target,
} from 'lucide-react';
import { CommercialProposal } from '../../types/commercial';

interface CommercialDashboardProps {
  proposals: CommercialProposal[];
  onNewProposal: () => void;
  onOpenCostStudio?: () => void;
  onReviewBom: (proposal: CommercialProposal) => void;
  onOpenProposalDetail: (proposal: CommercialProposal) => void;
  onDeleteProposal: (proposalId: string) => Promise<void>;
  userRole?: string;
  loading?: boolean;
}

export const CommercialDashboard: React.FC<CommercialDashboardProps> = ({
  proposals,
  onNewProposal,
  onOpenCostStudio,
  onReviewBom,
  onOpenProposalDetail,
  onDeleteProposal,
  userRole,
  loading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [clientFilter, setClientFilter] = useState<string>('todos');
  const [seeding, setSeeding] = useState(false);

  const canViewMargins =
    userRole === 'Super Admin' || userRole === 'Admin' || userRole === 'Gestor' || userRole === 'Gerente' || userRole === 'Revisor';

  // Distinct clients for filter
  const distinctClients = Array.from(new Set(proposals.map((p) => p.clientName).filter(Boolean)));

  // Filtered proposals
  const filteredProposals = proposals.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'todos' || p.status === statusFilter;
    const matchesClient = clientFilter === 'todos' || p.clientName === clientFilter;

    return matchesSearch && matchesStatus && matchesClient;
  });

  // Executive KPIs (Section 4.1)
  const inDraftCount = proposals.filter((p) => p.status === 'rascunho' || p.status === 'parcial' || p.status === 'aguardando_revisao').length;
  const sentOrNeg = proposals.filter((p) => p.status === 'enviada' || p.status === 'negociacao');
  const inNegotiationValue = sentOrNeg.reduce((acc, p) => acc + (p.proposedTotal || 0), 0);
  const wonProposals = proposals.filter((p) => p.status === 'ganha');
  const lostProposals = proposals.filter((p) => p.status === 'perdida');
  const closedTotal = wonProposals.length + lostProposals.length;
  const conversionRate = closedTotal > 0 ? Math.round((wonProposals.length / closedTotal) * 100) : null;

  const pricedProposals = proposals.filter((p) => (p.proposedTotal || 0) > 0);
  const avgTicket = pricedProposals.length > 0
    ? pricedProposals.reduce((acc, p) => acc + (p.proposedTotal || 0), 0) / pricedProposals.length
    : 0;
  const avgMargin = pricedProposals.length > 0
    ? pricedProposals.reduce((acc, p) => acc + (p.grossMarginPercent || 0), 0) / pricedProposals.length
    : 0;

  const closingDaysSamples = wonProposals
    .map((p) => {
      const start = new Date(p.createdAt || p.issueDate).getTime();
      const end = new Date(p.statusHistory?.find((h) => h.status === 'ganha')?.at || p.updatedAt || p.createdAt).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 86400000) : null;
    })
    .filter((d): d is number => d !== null);
  const avgClosingDays = closingDaysSamples.length > 0
    ? Math.round(closingDaysSamples.reduce((a, b) => a + b, 0) / closingDaysSamples.length)
    : null;

  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 af-card p-5 rounded-2xl">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>Gestão Comercial &amp; Propostas</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Carteira comercial, engenharia de custos, funil de negociação, margens e emissão de propostas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenCostStudio && (
            <button
              type="button"
              onClick={onOpenCostStudio}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs rounded-xl transition cursor-pointer"
            >
              <Calculator className="w-4 h-4 text-cyan-400" />
              <span>Engenharia de Custos</span>
            </button>
          )}
          <button
            onClick={onNewProposal}
            className="flex items-center space-x-1.5 px-4 py-2 af-btn-primary text-white font-semibold text-xs rounded-xl transition cursor-pointer apple-solid-btn"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Proposta</span>
          </button>
        </div>
      </div>

      {/* Executive KPI Ribbon (Section 4.1) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="af-card p-3.5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Carteira Total</span>
            <FileText className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <p className="text-xl font-extrabold font-mono text-white">{proposals.length}</p>
          <span className="text-[10px] text-slate-400">{inDraftCount} em elaboração</span>
        </div>

        <div className="af-card p-3.5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Em Negociação</span>
            <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <p className="text-base sm:text-lg font-extrabold font-mono text-cyan-300 truncate">{formatBrl(inNegotiationValue)}</p>
          <span className="text-[10px] text-slate-400">{sentOrNeg.length} proposta(s) ativa(s)</span>
        </div>

        <div className="af-card p-3.5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Conversão</span>
            <Target className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-xl font-extrabold font-mono text-emerald-400">
            {conversionRate === null ? '—' : `${conversionRate}%`}
          </p>
          <span className="text-[10px] text-slate-400">{wonProposals.length} ganhas · {lostProposals.length} perdidas</span>
        </div>

        <div className="af-card p-3.5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Ticket Médio</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <p className="text-base sm:text-lg font-extrabold font-mono text-white truncate">{formatBrl(avgTicket)}</p>
          <span className="text-[10px] text-slate-400">{pricedProposals.length} precificadas</span>
        </div>

        <div className="af-card p-3.5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Margem Média</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <p className="text-xl font-extrabold font-mono text-emerald-300">
            {canViewMargins ? `${avgMargin.toFixed(1)}%` : 'Restrito'}
          </p>
          <span className="text-[10px] text-slate-400">Margem bruta média</span>
        </div>

        <div className="af-card p-3.5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-medium">Prazo Fecham.</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <p className="text-xl font-extrabold font-mono text-amber-300">
            {avgClosingDays === null ? '—' : `${avgClosingDays}d`}
          </p>
          <span className="text-[10px] text-slate-400">Média até ganho</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs shadow-lg">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, título ou cliente..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
            >
              <option value="todos">Todos os Status</option>
              <option value="rascunho">Rascunho</option>
              <option value="parcial">Parcial</option>
              <option value="aguardando_revisao">Aguardando Revisão</option>
              <option value="aprovada">Aprovada</option>
              <option value="finalizada">Finalizada</option>
              <option value="enviada">Enviada</option>
              <option value="negociacao">Em Negociação</option>
              <option value="ganha">Ganha</option>
              <option value="perdida">Perdida</option>
            </select>
          </div>

          {distinctClients.length > 0 && (
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Cliente:</span>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white max-w-xs truncate"
              >
                <option value="todos">Todos os Clientes</option>
                {distinctClients.map((cli) => (
                  <option key={cli} value={cli}>
                    {cli}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Proposals List Table */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Propostas Comerciais ({filteredProposals.length})
          </h3>
          <span className="text-[11px] text-slate-400">Valores em moeda local da proposta</span>
        </div>

        {filteredProposals.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-3">
            <FileText className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-sm font-medium">Nenhuma proposta encontrada com os filtros selecionados.</p>
            <button
              onClick={onNewProposal}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-lg transition"
            >
              Criar Primeira Proposta
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Código / Título</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Emissão / Validade</th>
                  <th className="py-3 px-4 text-center">Itens (BOM)</th>
                  <th className="py-3 px-4 text-right">Valor Total Proposto</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredProposals.map((prop) => (
                  <tr key={prop.id} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4">
                      <span className="font-bold text-cyan-300 block">{prop.code}</span>
                      <span className="text-[11px] font-sans text-slate-300 truncate max-w-xs block">{prop.title}</span>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="font-semibold text-white block">{prop.clientName}</span>
                      <span className="text-[10px] text-slate-400">{prop.clientCnpjCpf || 'Sem CNPJ'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-[11px]">
                      <span>{prop.issueDate}</span>
                      <span className="block text-[10px] text-slate-500">Validade: {prop.validityDate}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-white">{prop.totalItemsCount}</span>
                      <span className="text-[10px] text-slate-400 block font-sans">
                        {prop.pricedItemsCount} precificados
                      </span>
                      {prop.pendingItemsCount > 0 && (
                        <span className="text-[10px] text-amber-400 font-bold block font-sans">
                          {prop.pendingItemsCount} pendentes
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-white text-sm">
                      {formatBrl(prop.proposedTotal)}
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${
                          prop.status === 'aprovada' || prop.status === 'ganha'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : prop.status === 'parcial'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : prop.status === 'finalizada'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : prop.status === 'perdida'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : prop.status === 'enviada' || prop.status === 'negociacao'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {prop.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => onReviewBom(prop)}
                          className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded font-semibold text-[11px] transition"
                          title="Revisar Lista de Materiais e Preços"
                        >
                          Revisar BOM
                        </button>
                        <button
                          onClick={() => onOpenProposalDetail(prop)}
                          className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                          title="Visualizar Proposta Comercial / Exportar PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Deseja realmente excluir a proposta ${prop.code}?`)) {
                              await onDeleteProposal(prop.id);
                            }
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Excluir Proposta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
