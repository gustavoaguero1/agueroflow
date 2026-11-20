import React, { useState } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Users,
  Building,
  DollarSign,
  AlertCircle,
  Eye,
  Check,
  X,
  FileText,
  UserCheck,
  Sparkles,
  Truck,
  Utensils,
  Share2,
  Navigation,
  Copy,
  HardHat,
} from 'lucide-react';
import { TravelRequest, TravelOffer, TravelRequestStatus } from '../../types/travel';
import { TechnicianSafetyDossierModal } from './TechnicianSafetyDossierModal';

interface TravelRequestsManagerProps {
  requests: TravelRequest[];
  onSaveRequest: (request: TravelRequest) => Promise<void>;
  onUpdateStatus: (id: string, status: TravelRequestStatus, notes?: string) => Promise<void>;
  onLaunchSearchForRequest: (request: TravelRequest) => void;
  onOpenMissionComposer?: () => void;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  corporateProjects?: Array<{ id: string; name: string }>;
  costCenters?: Array<{ id: string; name: string; code: string }>;
}

export const TravelRequestsManager: React.FC<TravelRequestsManagerProps> = ({
  requests,
  onSaveRequest,
  onUpdateStatus,
  onLaunchSearchForRequest,
  onOpenMissionComposer,
  currentUser,
  corporateProjects = [],
  costCenters = [],
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTabStatus, setActiveTabStatus] = useState<string>('todos');

  // Form State
  const [requesterName, setRequesterName] = useState(currentUser.name || '');
  const [travelerName, setTravelerName] = useState('');
  const [travelerRole, setTravelerRole] = useState('Técnico de Campo / Montador');
  const [travelReason, setTravelReason] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [origin, setOrigin] = useState('São Paulo, SP');
  const [destination, setDestination] = useState('Campinas, SP');
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnDate, setReturnDate] = useState('');
  const [workProjectId, setWorkProjectId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [budgetLimit, setBudgetLimit] = useState<number | undefined>(350);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected request modal details
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null);
  const [dossierRequest, setDossierRequest] = useState<TravelRequest | null>(null);

  const isManagerOrAdmin = ['Admin', 'Gerente', 'Supervisor'].includes(currentUser.role);

  const filtered = requests.filter((r) => {
    if (activeTabStatus !== 'todos' && r.status !== activeTabStatus) return false;
    const match = `${r.requestNumber} ${r.requesterName} ${r.travelReason} ${r.origin} ${r.destination} ${r.clientOrDestinationCompany || ''}`.toLowerCase();
    return match.includes(searchTerm.toLowerCase());
  });

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!travelReason.trim() || !origin.trim() || !destination.trim() || !departureDate) {
      setErrorMsg('Preencha os campos obrigatórios (Motivo, Origem, Destino e Data de Ida).');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedProj = corporateProjects.find((p) => p.id === workProjectId);
      const selectedCc = costCenters.find((c) => c.id === costCenterId);

      const newReq: TravelRequest = {
        id: `req_via_${Date.now()}`,
        organizationId: 'org_aguero_default',
        requestNumber: `VIAG-${Date.now().toString().slice(-5)}`,
        requesterId: currentUser.id,
        requesterName: requesterName.trim() || currentUser.name,
        requesterEmail: currentUser.email,
        travelerEmployees: [
          {
            name: travelerName.trim() || requesterName.trim(),
            role: travelerRole.trim() || 'Colaborador',
          },
        ],
        travelReason: travelReason.trim(),
        clientOrDestinationCompany: clientCompany.trim() || undefined,
        origin: origin.trim(),
        destination: destination.trim(),
        departureDate,
        returnDate: returnDate || undefined,
        workProjectId: workProjectId || undefined,
        workProjectName: selectedProj?.name,
        costCenterId: costCenterId || undefined,
        costCenterName: selectedCc?.name,
        budgetLimit: budgetLimit && budgetLimit > 0 ? Number(budgetLimit) : undefined,
        status: 'aguardando_aprovacao',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveRequest(newReq);
      setIsModalOpen(false);
      // Reset form
      setTravelReason('');
      setClientCompany('');
      setTravelerName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao gravar solicitação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: TravelRequestStatus) => {
    switch (status) {
      case 'aprovada':
        return <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">Aprovada</span>;
      case 'aguardando_aprovacao':
        return <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">Em Análise</span>;
      case 'pesquisada':
        return <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold">Passagem Cotada</span>;
      case 'rejeitada':
        return <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-semibold">Não Aprovada</span>;
      case 'concluida':
        return <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-semibold">Concluída</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-semibold">Rascunho</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-slate-100">
      {/* Header Bar */}
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-cyan-400 font-semibold mb-1">
            <Briefcase className="w-4 h-4" />
            <span>Fluxo Corporativo de Viagens</span>
          </div>
          <h2 className="text-xl font-bold text-white">Solicitações de Viagem & Deslocamentos</h2>
          <p className="text-xs text-slate-400 mt-1">
            Controle de viagens para obras, instalações industriais e visitas a clientes com teto de gastos e aprovações.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {onOpenMissionComposer && (
            <button
              type="button"
              onClick={onOpenMissionComposer}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 flex items-center space-x-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Montar Missão 3 em 1</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20 flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Solicitação</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-1 overflow-x-auto pb-1">
          {[
            { id: 'todos', label: 'Todas as Solicitações' },
            { id: 'aguardando_aprovacao', label: 'Em Análise' },
            { id: 'aprovada', label: 'Aprovadas' },
            { id: 'pesquisada', label: 'Cotadas' },
            { id: 'concluida', label: 'Concluídas' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex-shrink-0 ${
                activeTabStatus === tab.id
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-60">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID, solicitante ou cidade..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Requests List */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center bg-[#111827] border border-slate-800 rounded-2xl space-y-3">
          <Briefcase className="w-8 h-8 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">Nenhuma solicitação de viagem encontrada</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Crie uma nova solicitação corporativa ou ajuste os filtros para visualizar os registros de deslocamento da equipe.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <div
              key={req.id}
              className="bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition shadow-lg space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-cyan-400 font-bold text-xs">{req.requestNumber}</span>
                    <span className="text-slate-500">•</span>
                    <strong className="text-sm font-bold text-white">{req.origin} ➔ {req.destination}</strong>
                    <span className="text-slate-500">•</span>
                    {getStatusBadge(req.status)}
                  </div>
                  <p className="text-xs text-slate-300 font-medium">
                    Motivo: <span className="text-white">{req.travelReason}</span>
                    {req.clientOrDestinationCompany && ` • Destino: ${req.clientOrDestinationCompany}`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => onLaunchSearchForRequest(req)}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-md shadow-cyan-600/20"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Cotar Passagens</span>
                  </button>

                  {isManagerOrAdmin && req.status === 'aguardando_aprovacao' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(req.id, 'aprovada', 'Aprovado pelo gestor')}
                        title="Aprovar solicitação de viagem"
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Aprovar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(req.id, 'rejeitada', 'Reprovado por exceder diretrizes')}
                        title="Rejeitar solicitação"
                        className="px-2.5 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-rose-300 text-xs font-semibold"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Request Metadata Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Solicitante</span>
                  <strong className="text-slate-200">{req.requesterName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Viajante / Passageiro</span>
                  <strong className="text-slate-200">
                    {req.travelerEmployees?.[0]?.name || req.requesterName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Data Prevista</span>
                  <strong className="text-cyan-300 font-mono">
                    {req.departureDate.split('-').reverse().join('/')}
                    {req.returnDate && ` a ${req.returnDate.split('-').reverse().join('/')}`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Teto Orçamentário</span>
                  <strong className="text-emerald-400 font-mono">
                    {req.budgetLimit ? `R$ ${req.budgetLimit.toFixed(2).replace('.', ',')}` : 'Sem limite'}
                  </strong>
                </div>
              </div>

              {/* Field Mission 3-in-1 Package Breakdown */}
              {req.isFieldMission && req.missionPackage && (
                <div className="p-4 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-400" /> Combo 3 em 1 Integrado
                      </span>
                      <strong className="text-white text-xs">{req.missionPackage.missionTitle}</strong>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setDossierRequest(req)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                      >
                        <HardHat className="w-3 h-3 text-emerald-400" />
                        <span>Dossiê SST</span>
                      </button>

                      {req.missionPackage.whatsappVoucherText && (
                        <button
                          type="button"
                          onClick={() => {
                            if (req.missionPackage?.whatsappVoucherText) {
                              navigator.clipboard.writeText(req.missionPackage.whatsappVoucherText);
                              alert('Roteiro da missão copiado para a área de transferência!');
                            }
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>Copiar Roteiro</span>
                        </button>
                      )}

                      {req.missionPackage.whatsappVoucherText && (
                        <button
                          type="button"
                          onClick={() => {
                            if (req.missionPackage?.whatsappVoucherText) {
                              const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(req.missionPackage.whatsappVoucherText)}`;
                              window.open(url, '_blank');
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-sm"
                        >
                          <Share2 className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                    <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                          <Truck className="w-3.5 h-3.5" /> 1. Transporte
                        </span>
                        <strong className="font-mono text-white">
                          R$ {req.missionPackage.transport.totalTransportCost.toFixed(2)}
                        </strong>
                      </div>
                      <span className="text-[10px] text-slate-400 block capitalize">
                        {req.missionPackage.transport.modality.replace('_', ' ')} • {req.missionPackage.transport.estimatedKm ? `${req.missionPackage.transport.estimatedKm} km` : 'Passagens'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                          <Building className="w-3.5 h-3.5" /> 2. Hospedagem
                        </span>
                        <strong className="font-mono text-white">
                          R$ {req.missionPackage.lodging.totalLodgingCost.toFixed(2)}
                        </strong>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        {req.missionPackage.lodging.roomsCount}x quartos • {req.missionPackage.lodging.hotelName}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                          <Utensils className="w-3.5 h-3.5" /> 3. Diárias CLT
                        </span>
                        <strong className="font-mono text-white">
                          R$ {req.missionPackage.fieldAllowances.totalAllowancesWithContingency.toFixed(2)}
                        </strong>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        R$ {req.missionPackage.fieldAllowances.cltDailyRatePerPerson}/dia + R$ {req.missionPackage.fieldAllowances.contingencyFund} reserva
                      </span>
                    </div>
                  </div>

                  {/* Team Members Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Equipe ({req.missionPackage.teamCount}):</span>
                    {req.missionPackage.teamMembers.map((m, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
                        {m.name} <span className="text-slate-500">({m.role})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quotation preview if selected */}
              {req.selectedOfferSnapshot && (
                <div className="p-3 bg-slate-900/90 border border-cyan-500/30 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>
                      Passagem selecionada: <strong>{req.selectedOfferSnapshot.carrierName} ({req.selectedOfferSnapshot.serviceClass})</strong> às {req.selectedOfferSnapshot.departureTime}
                    </span>
                  </div>
                  <strong className="text-white font-mono font-bold">
                    R$ {req.selectedOfferSnapshot.totalAmount.toFixed(2).replace('.', ',')}
                  </strong>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-slate-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Nova Solicitação Corporativa de Viagem</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Solicitante</label>
                  <input
                    type="text"
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Passageiro / Viajante</label>
                  <input
                    type="text"
                    value={travelerName}
                    onChange={(e) => setTravelerName(e.target.value)}
                    placeholder="Nome do colaborador que viajará"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Motivo / Finalidade da Viagem *</label>
                <input
                  type="text"
                  required
                  value={travelReason}
                  onChange={(e) => setTravelReason(e.target.value)}
                  placeholder="Ex: Instalação e soldagem TIG de tubulações sanitárias"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Cidade de Origem *</label>
                  <input
                    type="text"
                    required
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Cidade de Destino *</label>
                  <input
                    type="text"
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Data Prevista de Ida *</label>
                  <input
                    type="date"
                    required
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Data de Retorno (opcional)</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Obra / Projeto (RDO)</label>
                  <select
                    value={workProjectId}
                    onChange={(e) => setWorkProjectId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Selecione...</option>
                    {corporateProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="obra_1">Nova Linha de Mosto Inox - Ambev</option>
                    <option value="obra_2">Montagem Tubulações 316L - Usina São Martinho</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Teto Máximo Autorizado (R$)</label>
                  <input
                    type="number"
                    value={budgetLimit || ''}
                    onChange={(e) => setBudgetLimit(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Ex: 350.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Cadastrar Solicitação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Technician Safety Dossier Modal */}
      {dossierRequest && (
        <TechnicianSafetyDossierModal
          isOpen={Boolean(dossierRequest)}
          onClose={() => setDossierRequest(null)}
          missionTitle={dossierRequest.missionPackage?.missionTitle || dossierRequest.travelReason}
          clientName={dossierRequest.clientOrDestinationCompany || dossierRequest.destination}
          plantAddress={dossierRequest.missionPackage?.plantAddress || dossierRequest.destination}
          workOrderNumber={dossierRequest.missionPackage?.workOrderNumber || dossierRequest.requestNumber}
          teamMembers={
            dossierRequest.missionPackage?.teamMembers ||
            dossierRequest.travelerEmployees.map((t) => ({ name: t.name, role: t.role || 'Técnico' }))
          }
        />
      )}
    </div>
  );
};
