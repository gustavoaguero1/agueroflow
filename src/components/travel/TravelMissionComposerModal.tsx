import React, { useState, useMemo } from 'react';
import {
  X,
  Truck,
  Building,
  Utensils,
  DollarSign,
  Share2,
  Navigation,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  MapPin,
  Sparkles,
  Plane,
  Bus,
  ShieldCheck,
  Plus,
  Trash2,
  HardHat,
} from 'lucide-react';
import { TravelRequest, TravelMissionPackage } from '../../types/travel';
import { TechnicianSafetyDossierModal } from './TechnicianSafetyDossierModal';

interface TravelMissionComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMission: (request: TravelRequest) => Promise<void>;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  currentOrgId?: string;
  corporateProjects?: Array<{ id: string; name: string }>;
}

export const TravelMissionComposerModal: React.FC<TravelMissionComposerModalProps> = ({
  isOpen,
  onClose,
  onSaveMission,
  currentUser,
  currentOrgId = 'org_aguero_default',
  corporateProjects = [],
}) => {
  // Mission basic data
  const [missionTitle, setMissionTitle] = useState('Montagem de Linha de Envase Inox 304');
  const [clientName, setClientName] = useState('Cervejaria Ambev - Planta Jaguariúna');
  const [plantAddress, setPlantAddress] = useState('Rodovia SP-340, km 127 - Jaguariúna, SP');
  const [workOrderNumber, setWorkOrderNumber] = useState('OS-2025-042');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Dates
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(nextWeekStr);

  // Team
  const [teamMembers, setTeamMembers] = useState<Array<{ name: string; role: string; phone?: string }>>([
    { name: 'Carlos Eduardo Silva', role: 'Soldador TIG Inox Especialista', phone: '(19) 98123-4567' },
    { name: 'Marcos Roberto Santos', role: 'Montador Mecânico Encanador', phone: '(19) 98234-5678' },
    { name: 'Rafael Henrique Lima', role: 'Eletricista de Força & Controle', phone: '(19) 98345-6789' },
    { name: 'André Luiz Souza', role: 'Encarregado / Líder de Equipe', phone: '(19) 98456-7890' },
  ]);

  // Pillar 1: Transport
  const [transportModality, setTransportModality] = useState<'van_frota' | 'aereo' | 'onibus'>('van_frota');
  const [estimatedKm, setEstimatedKm] = useState(280);
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState(6.20); // Diesel S10
  const [fuelConsumptionKmPerL, setFuelConsumptionKmPerL] = useState(9.5); // Renault Master / Van
  const [tollEstimate, setTollEstimate] = useState(88.00); // Pedágios ida e volta
  const [flightTicketPerPerson, setFlightTicketPerPerson] = useState(650.00);
  const [flightTransferEstimate, setFlightTransferEstimate] = useState(250.00);
  const [busTicketPerPerson, setBusTicketPerPerson] = useState(130.00);

  // Pillar 2: Lodging
  const [hotelName, setHotelName] = useState('Hotel Ibis / Atlantica Campinas Norte');
  const [roomType, setRoomType] = useState<'duplo_twin' | 'individual_single'>('duplo_twin');
  const [dailyRatePerRoom, setDailyRatePerRoom] = useState(210.00);
  const [breakfastIncluded, setBreakfastIncluded] = useState(true);
  const [parkingIncluded, setParkingIncluded] = useState(true);

  // Pillar 3: CLT Field Allowances
  const [cltDailyRatePerPerson, setCltDailyRatePerPerson] = useState(95.00); // Convenção Coletiva Inox
  const [contingencyFund, setContingencyFund] = useState(350.00); // Fundo reserva operacional

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedVoucher, setCopiedVoucher] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDossierOpen, setIsDossierOpen] = useState(false);

  // Calculations
  const { daysCount, nightsCount } = useMemo(() => {
    if (!startDate || !endDate) return { daysCount: 1, nightsCount: 1 };
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.max(0, end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const calculatedDays = diffDays > 0 ? diffDays : 1;
    const calculatedNights = Math.max(1, calculatedDays - 1);
    return { daysCount: calculatedDays, nightsCount: calculatedNights };
  }, [startDate, endDate]);

  const teamCount = teamMembers.length;

  const transportTotal = useMemo(() => {
    if (transportModality === 'van_frota') {
      const fuelLiters = estimatedKm / (fuelConsumptionKmPerL || 1);
      const fuelCost = fuelLiters * fuelPricePerLiter;
      return fuelCost + tollEstimate;
    }
    if (transportModality === 'aereo') {
      return (flightTicketPerPerson * 2 * teamCount) + flightTransferEstimate;
    }
    if (transportModality === 'onibus') {
      return (busTicketPerPerson * 2 * teamCount);
    }
    return 0;
  }, [
    transportModality,
    estimatedKm,
    fuelConsumptionKmPerL,
    fuelPricePerLiter,
    tollEstimate,
    flightTicketPerPerson,
    teamCount,
    flightTransferEstimate,
    busTicketPerPerson,
  ]);

  const lodgingRoomsCount = useMemo(() => {
    if (roomType === 'duplo_twin') {
      return Math.ceil(teamCount / 2);
    }
    return teamCount;
  }, [roomType, teamCount]);

  const lodgingTotal = useMemo(() => {
    return lodgingRoomsCount * nightsCount * dailyRatePerRoom;
  }, [lodgingRoomsCount, nightsCount, dailyRatePerRoom]);

  const allowancesTotal = useMemo(() => {
    return teamCount * daysCount * cltDailyRatePerPerson;
  }, [teamCount, daysCount, cltDailyRatePerPerson]);

  const allowancesWithContingency = allowancesTotal + contingencyFund;

  const totalMissionCost = transportTotal + lodgingTotal + allowancesWithContingency;

  const costPerPersonDay = useMemo(() => {
    const totalManDays = (teamCount * daysCount) || 1;
    return totalMissionCost / totalManDays;
  }, [totalMissionCost, teamCount, daysCount]);

  // Savings benchmark estimate: separate flights + individual single rooms + taxis vs van + twin
  const benchmarkSeparateCost = useMemo(() => {
    const airSeparate = 650 * 2 * teamCount + 400;
    const individualRooms = teamCount * nightsCount * 280;
    const allowances = allowancesWithContingency;
    return airSeparate + individualRooms + allowances;
  }, [teamCount, nightsCount, allowancesWithContingency]);

  const estimatedSavings = Math.max(0, benchmarkSeparateCost - totalMissionCost);

  // Generate WhatsApp formatted text
  const generateWhatsAppVoucher = () => {
    const leader = teamMembers[teamMembers.length - 1]?.name || teamMembers[0]?.name || 'Encarregado';
    return `*ROTEIRO OFICIAL DE MISSÃO DE CAMPO | AGUEROFLOW*
═══════════════════════════════════════
*Missão:* ${missionTitle}
*Cliente / Planta:* ${clientName}
*Endereço:* ${plantAddress}
*OS / Projeto:* ${workOrderNumber}

*Período:* ${startDate.split('-').reverse().join('/')} até ${endDate.split('-').reverse().join('/')} (${daysCount} dias de obra / ${nightsCount} noites)
*Líder de Equipe:* ${leader}

*EQUIPE DESIGNADA (${teamCount} TÉCNICOS):*
${teamMembers.map((m, idx) => ` ${idx + 1}. ${m.name} — *${m.role}*`).join('\n')}

*1. LOGÍSTICA & TRANSPORTE:*
• Modalidade: ${transportModality === 'van_frota' ? 'Van da Frota (Renault Master / Sprinter Inox)' : transportModality === 'aereo' ? 'Voos Comerciais' : 'Ônibus Executivo'}
• Deslocamento: ${transportModality === 'van_frota' ? `~${estimatedKm} km rodados (Combustível + Pedágio inclusos)` : 'Passagens com franquia de bagagem de ferramentas'}

*2. HOSPEDAGEM CORPORATIVA:*
• Hotel: *${hotelName}*
• Acomodação: ${lodgingRoomsCount}x Quarto(s) ${roomType === 'duplo_twin' ? 'Duplo (Twin Beds)' : 'Individual'}
• Inclusões: Café da Manhã incluso às 06h30 + Estacionamento seguro da Van

*3. DIÁRIAS & ALIMENTAÇÃO (CLT):*
• Diária Almoço/Jantar: R$ ${cltDailyRatePerPerson.toFixed(2)} / técnico / dia (Cartão Corporativo)
• Fundo de Contingência Operacional: R$ ${contingencyFund.toFixed(2)}

*ORÇAMENTO CONSOLIDADO:* R$ ${totalMissionCost.toFixed(2)} (R$ ${costPerPersonDay.toFixed(2)} / Homem-Dia)

*LINK DA ROTA:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plantAddress)}

*LEMBRETE DE SEGURANÇA:* Obrigatório uso de EPI completo (Botina com bico composite, óculos de segurança, capacete e protetor auricular tipo concha).
═══════════════════════════════════════`;
  };

  const handleCopyVoucher = () => {
    const text = generateWhatsAppVoucher();
    navigator.clipboard.writeText(text);
    setCopiedVoucher(true);
    setTimeout(() => setCopiedVoucher(false), 3000);
  };

  const handleOpenWhatsApp = () => {
    const text = generateWhatsAppVoucher();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleOpenWaze = () => {
    const url = `https://waze.com/ul?q=${encodeURIComponent(plantAddress)}`;
    window.open(url, '_blank');
  };

  const handleOpenMaps = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plantAddress)}`;
    window.open(url, '_blank');
  };

  const handleAddTeamMember = () => {
    setTeamMembers((prev) => [
      ...prev,
      { name: `Técnico ${prev.length + 1}`, role: 'Montador Mecânico / Caldeireiro' },
    ]);
  };

  const handleRemoveTeamMember = (index: number) => {
    if (teamMembers.length <= 1) return;
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTeamMember = (index: number, field: 'name' | 'role' | 'phone', value: string) => {
    setTeamMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  const handleSave = async () => {
    if (!missionTitle.trim() || !clientName.trim() || !plantAddress.trim()) {
      setErrorMessage('Preencha os campos obrigatórios da missão (Título, Cliente e Endereço).');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const missionPkg: TravelMissionPackage = {
        missionTitle,
        clientName,
        plantAddress,
        workOrderNumber,
        startDate,
        endDate,
        daysCount,
        nightsCount,
        teamCount,
        teamMembers,
        transport: {
          modality: transportModality,
          estimatedKm: transportModality === 'van_frota' ? estimatedKm : undefined,
          fuelCostPerLiter: transportModality === 'van_frota' ? fuelPricePerLiter : undefined,
          fuelConsumptionKmPerL: transportModality === 'van_frota' ? fuelConsumptionKmPerL : undefined,
          tollEstimate: transportModality === 'van_frota' ? tollEstimate : undefined,
          ticketPricePerPerson: transportModality === 'aereo' ? flightTicketPerPerson : transportModality === 'onibus' ? busTicketPerPerson : undefined,
          transferEstimate: transportModality === 'aereo' ? flightTransferEstimate : undefined,
          totalTransportCost: transportTotal,
        },
        lodging: {
          hotelName,
          roomType,
          roomsCount: lodgingRoomsCount,
          dailyRatePerRoom,
          breakfastIncluded,
          parkingIncluded,
          totalLodgingCost: lodgingTotal,
        },
        fieldAllowances: {
          cltDailyRatePerPerson,
          totalAllowanceCost: allowancesTotal,
          contingencyFund,
          totalAllowancesWithContingency: allowancesWithContingency,
        },
        summary: {
          totalMissionCost,
          costPerPersonDay,
          estimatedSavingsVsSeparate: estimatedSavings,
        },
        whatsappVoucherText: generateWhatsAppVoucher(),
      };

      const selectedProj = corporateProjects.find((p) => p.id === selectedProjectId);

      const newRequest: TravelRequest = {
        id: `mission_${Date.now()}`,
        organizationId: currentOrgId,
        requestNumber: `MISS-${Date.now().toString().slice(-5)}`,
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        requesterEmail: currentUser.email,
        travelerEmployees: teamMembers.map((m) => ({
          name: m.name,
          role: m.role,
        })),
        travelReason: `[MISSÃO CAMPO 3-EM-1] ${missionTitle} - OS: ${workOrderNumber || 'N/A'}`,
        clientOrDestinationCompany: clientName,
        workProjectId: selectedProjectId || undefined,
        workProjectName: selectedProj?.name,
        origin: 'Matriz Aguero Inox (Campinas/SP)',
        destination: `${clientName} (${plantAddress})`,
        departureDate: startDate,
        returnDate: endDate,
        budgetLimit: totalMissionCost * 1.05,
        status: 'aguardando_aprovacao',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isFieldMission: true,
        missionPackage: missionPkg,
      };

      await onSaveMission(newRequest);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar pacote da missão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#111827] border border-cyan-500/40 rounded-3xl w-full max-w-5xl my-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-cyan-950/70 via-slate-900 to-blue-950/70 border-b border-cyan-500/30 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> Combo 3 em 1
              </span>
              <span className="text-xs text-slate-400">Montagem & Manutenção Industrial de Campo</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Missão Completa de Campo (Obra / OS)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Consolidação técnica e orçamentária: Transporte de equipe + Hospedagem Twin próxima à fábrica + Diárias CLT/CCT + Voucher WhatsApp de 1-clique.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-200 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Identification & Timing */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              1. Identificação da Missão & Local da Obra
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Título da Missão *</label>
                <input
                  type="text"
                  value={missionTitle}
                  onChange={(e) => setMissionTitle(e.target.value)}
                  placeholder="Ex: Instalação de Skid Pasteurizador Inox"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Cliente / Destino *</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Cervejaria Ambev Jaguariúna"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Nº Ordem de Serviço (OS)</label>
                <input
                  type="text"
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  placeholder="Ex: OS-2025-042"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Endereço da Planta / Fábrica *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={plantAddress}
                    onChange={(e) => setPlantAddress(e.target.value)}
                    placeholder="Ex: Rodovia SP-340, km 127 - Jaguariúna, SP"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleOpenMaps}
                    title="Ver no Google Maps"
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl font-semibold flex items-center gap-1"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Maps</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenWaze}
                    title="Ver no Waze"
                    className="px-2.5 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 rounded-xl font-semibold flex items-center gap-1"
                  >
                    <span className="font-bold">Waze</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Data de Início (Saída)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Data de Término (Retorno)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="p-2.5 bg-cyan-950/30 border border-cyan-800/40 rounded-xl flex items-center justify-between text-[11px] text-cyan-200">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                Duração da Missão: <strong>{daysCount} {daysCount === 1 ? 'dia útil' : 'dias úteis'} de campo</strong>
              </span>
              <span className="font-mono bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-700/50">
                {nightsCount} {nightsCount === 1 ? 'noite de hotel' : 'noites de hotel'}
              </span>
            </div>
          </div>

          {/* Section 2: Technical Team */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                2. Equipe de Montagem & Técnicos ({teamCount} membros)
              </h3>
              <button
                type="button"
                onClick={handleAddTeamMember}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Técnico
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamMembers.map((member, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 group hover:border-slate-700 transition"
                >
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) => handleUpdateTeamMember(idx, 'name', e.target.value)}
                        placeholder="Nome do Técnico"
                        className="flex-1 bg-transparent border-b border-slate-700/60 focus:border-cyan-500 text-xs text-white font-semibold focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <input
                        type="text"
                        value={member.role}
                        onChange={(e) => handleUpdateTeamMember(idx, 'role', e.target.value)}
                        placeholder="Função (ex: Soldador TIG)"
                        className="flex-1 bg-transparent border-b border-slate-800 focus:border-cyan-500 text-[11px] text-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {teamMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTeamMember(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                      title="Remover técnico"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: 3 Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pillar 1: Transport */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-cyan-400" />
                    Pilar 1: Transporte
                  </h4>
                  <span className="font-mono text-cyan-300 font-bold">
                    R$ {transportTotal.toFixed(2)}
                  </span>
                </div>

                {/* Modality Selector */}
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTransportModality('van_frota')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold text-center transition ${
                      transportModality === 'van_frota'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Van / Frota
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportModality('aereo')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold text-center transition ${
                      transportModality === 'aereo'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Aéreo
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportModality('onibus')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold text-center transition ${
                      transportModality === 'onibus'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ônibus
                  </button>
                </div>

                {transportModality === 'van_frota' && (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Distância Total (Ida+Volta):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={estimatedKm}
                          onChange={(e) => setEstimatedKm(Number(e.target.value))}
                          className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                        />
                        <span className="text-slate-400">km</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Diesel S10 (R$/L):</span>
                      <input
                        type="number"
                        step="0.05"
                        value={fuelPricePerLiter}
                        onChange={(e) => setFuelPricePerLiter(Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Pedágios Estimados:</span>
                      <input
                        type="number"
                        value={tollEstimate}
                        onChange={(e) => setTollEstimate(Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>

                    <div className="p-2 bg-slate-950 rounded-lg text-[10px] text-slate-400 space-y-0.5">
                      <div>Consumo estimado: {(estimatedKm / fuelConsumptionKmPerL).toFixed(1)} L de Diesel</div>
                      <div className="text-emerald-400 font-semibold">Leva ferramentas pesadas & máquinas na van</div>
                    </div>
                  </div>
                )}

                {transportModality === 'aereo' && (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Tarifa Aérea p/ Técnico:</span>
                      <input
                        type="number"
                        value={flightTicketPerPerson}
                        onChange={(e) => setFlightTicketPerPerson(Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Transfer Aeroporto ➔ Planta:</span>
                      <input
                        type="number"
                        value={flightTransferEstimate}
                        onChange={(e) => setFlightTransferEstimate(Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Total para {teamCount} técnicos (Ida e Volta)
                    </span>
                  </div>
                )}

                {transportModality === 'onibus' && (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Passagem Executiva p/ Técnico:</span>
                      <input
                        type="number"
                        value={busTicketPerPerson}
                        onChange={(e) => setBusTicketPerPerson(Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Total para {teamCount} técnicos (Ida e Volta)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Pillar 2: Lodging */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-cyan-400" />
                    Pilar 2: Hospedagem
                  </h4>
                  <span className="font-mono text-cyan-300 font-bold">
                    R$ {lodgingTotal.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="space-y-1">
                    <label className="text-slate-400">Hotel Recomendado</label>
                    <input
                      type="text"
                      value={hotelName}
                      onChange={(e) => setHotelName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setRoomType('duplo_twin')}
                      className={`py-1 px-2 rounded-lg text-[10px] font-bold text-center transition ${
                        roomType === 'duplo_twin'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Duplo Twin (2 Camas)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomType('individual_single')}
                      className={`py-1 px-2 rounded-lg text-[10px] font-bold text-center transition ${
                        roomType === 'individual_single'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Single (Individual)
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Quartos Necessários:</span>
                    <strong className="text-white font-mono">{lodgingRoomsCount} quarto(s)</strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Diária Média por Quarto:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">R$</span>
                      <input
                        type="number"
                        value={dailyRatePerRoom}
                        onChange={(e) => setDailyRatePerRoom(Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center space-x-2 text-[10px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={breakfastIncluded}
                        onChange={(e) => setBreakfastIncluded(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Café da Manhã incluso (às 06h30)</span>
                    </label>

                    <label className="flex items-center space-x-2 text-[10px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parkingIncluded}
                        onChange={(e) => setParkingIncluded(e.target.checked)}
                        className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Estacionamento seguro p/ Van de Ferramentas</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Pillar 3: Field Allowances (CLT) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Utensils className="w-4 h-4 text-cyan-400" />
                    Pilar 3: Diárias CLT
                  </h4>
                  <span className="font-mono text-cyan-300 font-bold">
                    R$ {allowancesWithContingency.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Diária de Campo CLT/CCT:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">R$</span>
                      <input
                        type="number"
                        value={cltDailyRatePerPerson}
                        onChange={(e) => setCltDailyRatePerPerson(Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                      <span className="text-slate-400">/dia</span>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-950 rounded-lg text-[10px] space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Diárias Alimentação:</span>
                      <strong className="font-mono text-white">R$ {allowancesTotal.toFixed(2)}</strong>
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {teamCount} técnicos × {daysCount} dias × R$ {cltDailyRatePerPerson}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-400">Fundo Reserva Operacional:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">R$</span>
                      <input
                        type="number"
                        value={contingencyFund}
                        onChange={(e) => setContingencyFund(Number(e.target.value))}
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white text-[11px]"
                      />
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Reserva para abastecimento de apoio, pedágio extra ou pequenas compras emergenciais de fixação.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Consolidated Budget & Savings Summary */}
          <div className="bg-gradient-to-r from-cyan-950/50 via-slate-900 to-emerald-950/40 border border-cyan-500/40 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="space-y-1.5 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Pacote Fechado da Missão
                </span>
                <span className="text-xs text-slate-400">Pronto para Ordem de Serviço & Faturamento</span>
              </div>
              <h3 className="text-xl font-bold text-white">
                Custo Total Consolidado: <span className="text-emerald-400 font-mono">R$ {totalMissionCost.toFixed(2)}</span>
              </h3>
              <p className="text-xs text-slate-300">
                Média de <strong className="text-white font-mono">R$ {costPerPersonDay.toFixed(2)} / Homem-Dia</strong> • Economia estimada de <strong className="text-cyan-300 font-mono">R$ {estimatedSavings.toFixed(2)}</strong> em relação a contratações avulsas.
              </p>
            </div>

            {/* Quick Share Actions */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button
                type="button"
                onClick={() => setIsDossierOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
              >
                <HardHat className="w-4 h-4 text-emerald-400" />
                <span>Dossiê Portaria SST (NRs)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyVoucher}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                {copiedVoucher ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>Copiar Roteiro</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar no WhatsApp da Equipe</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white font-semibold text-xs rounded-xl"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/25 flex items-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Salvando Missão...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Cadastrar & Solicitar Aprovação</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SST Plant Entrance Dossier Modal */}
      <TechnicianSafetyDossierModal
        isOpen={isDossierOpen}
        onClose={() => setIsDossierOpen(false)}
        missionTitle={missionTitle}
        clientName={clientName}
        plantAddress={plantAddress}
        workOrderNumber={workOrderNumber}
        teamMembers={teamMembers}
      />
    </div>
  );
};
