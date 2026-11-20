import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle,
  Clock,
  Factory,
  Wrench,
  Layers,
  ListChecks,
  Zap,
  Check,
  UserCheck,
} from 'lucide-react';
import {
  CalendarEventDate,
  RadarOpportunity,
} from '../../types/marketing';
import {
  getCalendarDatesForYear,
  generateOpportunitiesRadar,
  formatDateISO,
} from '../../services/marketingService';

interface MarketingCalendarViewProps {
  radar: RadarOpportunity[];
  onConvertOpportunity: (opp: RadarOpportunity, type: 'campaign' | 'event') => void;
  onSelectDateForCampaign?: (date: CalendarEventDate) => void;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const MarketingCalendarView: React.FC<MarketingCalendarViewProps> = ({
  radar: initialRadar,
  onConvertOpportunity,
  onSelectDateForCampaign,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'mensal' | 'anual' | 'radar'>('mensal');
  const [selectedDateItem, setSelectedDateItem] = useState<CalendarEventDate | null>(null);

  // Radar Interactive Controls
  const [radarCompanyProfile, setRadarCompanyProfile] = useState<'industria' | 'servicos' | 'ambos'>('industria');
  const [radarAnchorDate, setRadarAnchorDate] = useState<string>(formatDateISO(new Date()));
  const [isAiScanning, setIsAiScanning] = useState<boolean>(false);
  const [convertedNotice, setConvertedNotice] = useState<string | null>(null);

  // All calendar dates computed dynamically for selected year
  const allDates = useMemo(() => {
    return getCalendarDatesForYear(selectedYear);
  }, [selectedYear]);

  // Dynamically computed Radar opportunities based on anchor date and company profile
  const activeRadar = useMemo(() => {
    return generateOpportunitiesRadar(selectedYear, radarAnchorDate, radarCompanyProfile);
  }, [selectedYear, radarAnchorDate, radarCompanyProfile]);

  // Filtered dates for calendar view
  const filteredDates = useMemo(() => {
    return allDates.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesAwareness = item.awarenessMonth?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesAwareness) return false;
      }
      return true;
    });
  }, [allDates, categoryFilter, searchQuery]);

  // Month-specific dates
  const monthDates = useMemo(() => {
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const prefix = `${selectedYear}-${monthStr}`;
    return filteredDates.filter((d) => d.date.startsWith(prefix));
  }, [filteredDates, selectedYear, selectedMonth]);

  // Days in month calculation for the grid
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayWeekday = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 = Sunday

  // Handle re-scanning simulation with AI
  const handleTriggerAiScan = () => {
    setIsAiScanning(true);
    setTimeout(() => {
      setIsAiScanning(false);
    }, 600);
  };

  // Set quick date preset
  const handleSetDatePreset = (daysOffset: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysOffset);
    setRadarAnchorDate(formatDateISO(target));
    handleTriggerAiScan();
  };

  // Convert opportunity with visual feedback
  const handleConvertWithFeedback = (opp: RadarOpportunity, type: 'campaign' | 'event') => {
    onConvertOpportunity(opp, type);
    const label = type === 'campaign' ? 'Campanha' : 'Evento';
    setConvertedNotice(`✓ ${label} "${opp.theme}" criada com plano de ação e cronograma estruturado!`);
    setTimeout(() => setConvertedNotice(null), 4000);
  };

  // Jump from calendar date to radar
  const handleJumpToRadarFromDate = (dateStr: string) => {
    setRadarAnchorDate(dateStr);
    setActiveTab('radar');
    handleTriggerAiScan();
    setSelectedDateItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notice */}
      {convertedNotice && (
        <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-600 text-emerald-200 text-xs flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{convertedNotice}</span>
          </div>
          <button
            onClick={() => setConvertedNotice(null)}
            className="text-emerald-400 hover:text-emerald-200 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header with Year Selector & Mode Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-blue-900/30 text-blue-400 border border-blue-800/40">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Calendário Inteligente & Radar Anual
            </h2>
            <p className="text-xs text-slate-400">
              Feriados nacionais e estaduais (SP), datas móveis calculadas, meses de conscientização e calendário industrial.
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center space-x-2">
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('mensal')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                activeTab === 'mensal' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Visão Mensal
            </button>
            <button
              onClick={() => setActiveTab('anual')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                activeTab === 'anual' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Panorama Anual ({allDates.length})
            </button>
            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'radar' ? 'bg-cyan-600 text-white shadow' : 'text-cyan-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Radar IA ({activeRadar.length})</span>
            </button>
          </div>

          {/* Year Navigator */}
          <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
              title="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-white px-1">{selectedYear}</span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
              title="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar for Monthly/Annual Tabs */}
      {activeTab !== 'radar' && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar data, conscientização ou feriado..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <span className="text-slate-500 text-[11px] whitespace-nowrap">Categoria:</span>
            {[
              { id: 'all', label: 'Todas' },
              { id: 'conscientizacao', label: 'Conscientização / Saúde' },
              { id: 'setor_industrial', label: 'Indústria & Caldeiraria' },
              { id: 'feriado_nacional', label: 'Feriados Nacionais' },
              { id: 'feriado_estadual', label: 'Estaduais (SP)' },
              { id: 'empresa_interna', label: 'Empresa / Internas' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] whitespace-nowrap transition cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 font-semibold'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 1: VISÃO MENSAL */}
      {activeTab === 'mensal' && (
        <div className="space-y-4">
          {/* Month selector ribbon */}
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 text-xs">
            {MONTH_NAMES.map((name, idx) => {
              const isSelected = selectedMonth === idx;
              const countForMonth = filteredDates.filter((d) => {
                const m = parseInt(d.date.split('-')[1], 10) - 1;
                return m === idx;
              }).length;

              return (
                <button
                  key={name}
                  onClick={() => setSelectedMonth(idx)}
                  className={`p-2 rounded-lg text-center transition border cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-500 font-bold shadow'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  <span className="block text-xs truncate">{name.slice(0, 3)}</span>
                  <span className="text-[10px] opacity-70 block">{countForMonth} datas</span>
                </button>
              );
            })}
          </div>

          {/* Month Title */}
          <div className="flex items-center justify-between pt-2">
            <h3 className="text-base font-bold text-white">
              {MONTH_NAMES[selectedMonth]} de {selectedYear}
            </h3>
            <span className="text-xs text-slate-400">
              {monthDates.length} datas identificadas no mês
            </span>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 text-xs">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
              <div key={day} className="p-2 text-center text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                {day}
              </div>
            ))}

            {/* Empty slots for previous month offset */}
            {Array.from({ length: firstDayWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[90px] rounded-lg bg-slate-950/30 border border-slate-900/40 p-2 opacity-30" />
            ))}

            {/* Actual Month Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dayStr = String(dayNum).padStart(2, '0');
              const monthStr = String(selectedMonth + 1).padStart(2, '0');
              const fullDateStr = `${selectedYear}-${monthStr}-${dayStr}`;

              const dayEvents = monthDates.filter((d) => d.date === fullDateStr);
              const isToday =
                new Date().toISOString().split('T')[0] === fullDateStr;

              return (
                <div
                  key={dayNum}
                  className={`min-h-[95px] rounded-xl border p-2 flex flex-col justify-between transition ${
                    isToday
                      ? 'bg-blue-950/20 border-blue-500/60 shadow-lg shadow-blue-950/40'
                      : dayEvents.length > 0
                      ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-950/50 border-slate-900/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center'
                          : 'text-slate-400'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-mono">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 my-1 overflow-y-auto max-h-16 custom-scrollbar">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedDateItem(ev)}
                        className="text-[10px] p-1 rounded font-medium truncate cursor-pointer hover:opacity-90"
                        style={{
                          backgroundColor: `${ev.colorHex || '#3B82F6'}20`,
                          color: ev.colorHex || '#93C5FD',
                          borderLeft: `2px solid ${ev.colorHex || '#3B82F6'}`,
                        }}
                        title={ev.title}
                      >
                        {ev.title}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800/40">
                    <span>{dayEvents.length > 0 ? dayEvents[0].category.replace('_', ' ') : ''}</span>
                    <button
                      onClick={() => handleJumpToRadarFromDate(fullDateStr)}
                      className="hover:text-cyan-400 text-slate-600 transition cursor-pointer"
                      title="Explorar Radar IA a partir deste dia"
                    >
                      <Sparkles className="w-2.5 h-2.5 inline" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PANORAMA ANUAL */}
      {activeTab === 'anual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MONTH_NAMES.map((mName, mIdx) => {
            const mStr = String(mIdx + 1).padStart(2, '0');
            const datesInMonth = filteredDates.filter((d) => d.date.startsWith(`${selectedYear}-${mStr}`));

            return (
              <div
                key={mName}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <h4 className="text-sm font-bold text-white">{mName}</h4>
                    <span className="text-[11px] font-mono text-slate-400">
                      {datesInMonth.length} marcos
                    </span>
                  </div>

                  <div className="space-y-2 mt-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {datesInMonth.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3 text-center">Nenhuma data cadastrada.</p>
                    ) : (
                      datesInMonth.map((d) => (
                        <div
                          key={d.id}
                          onClick={() => setSelectedDateItem(d)}
                          className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 hover:border-slate-700 transition cursor-pointer space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-blue-400 font-semibold">
                              {d.date.split('-')[2]}/{d.date.split('-')[1]}
                            </span>
                            <span className="text-[10px] text-slate-500 capitalize">
                              {d.category.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="font-medium text-slate-200 line-clamp-1">{d.title}</p>
                          {d.awarenessMonth && (
                            <span className="text-[10px] text-pink-400 block font-medium">
                              {d.awarenessMonth}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedMonth(mIdx);
                    setActiveTab('mensal');
                  }}
                  className="w-full py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-xs font-medium transition cursor-pointer"
                >
                  Abrir Mês Completo
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: RADAR DE OPORTUNIDADES IA COM SELETOR INTERATIVO E PERFIL */}
      {activeTab === 'radar' && (
        <div className="space-y-5">
          {/* Interactive Controller Card: Profile & Date Selection */}
          <div className="p-5 rounded-2xl border border-cyan-800/50 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 space-y-4 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 rounded-lg bg-cyan-900/50 text-cyan-300 border border-cyan-700/60">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Radar de Oportunidades Proativo (IA Preditiva)
                  </h3>
                </div>
                <p className="text-xs text-slate-300">
                  Consulte oportunidades sazonais e operacionais nos próximos 30 a 60 dias ajustadas rigorosamente ao perfil da empresa.
                </p>
              </div>

              {/* Status Badge */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                  {activeRadar.length} oportunidades ativas
                </span>
                <button
                  onClick={handleTriggerAiScan}
                  disabled={isAiScanning}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${isAiScanning ? 'animate-spin' : ''}`} />
                  <span>{isAiScanning ? 'Varrendo IA...' : 'Atualizar Radar'}</span>
                </button>
              </div>
            </div>

            {/* Interactive Filters: Profile Toggle & Interactive Calendar Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800/80">
              {/* Profile Selector (Industria vs Serviços vs Ambos) */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
                  <Factory className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Perfil da Organização (Segmentação da IA):</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setRadarCompanyProfile('industria');
                      handleTriggerAiScan();
                    }}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      radarCompanyProfile === 'industria'
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Factory className="w-4 h-4 text-blue-400" />
                      {radarCompanyProfile === 'industria' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold block mt-1">Indústria</span>
                      <span className="text-[10px] text-slate-400 block line-clamp-1">Caldeiraria & Fábrica</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setRadarCompanyProfile('servicos');
                      handleTriggerAiScan();
                    }}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      radarCompanyProfile === 'servicos'
                        ? 'bg-cyan-600/20 border-cyan-500 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Wrench className="w-4 h-4 text-cyan-400" />
                      {radarCompanyProfile === 'servicos' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold block mt-1">Serviços</span>
                      <span className="text-[10px] text-slate-400 block line-clamp-1">Montagens & Paradas</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setRadarCompanyProfile('ambos');
                      handleTriggerAiScan();
                    }}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      radarCompanyProfile === 'ambos'
                        ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Layers className="w-4 h-4 text-purple-400" />
                      {radarCompanyProfile === 'ambos' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold block mt-1">Ambos</span>
                      <span className="text-[10px] text-slate-400 block line-clamp-1">Operação Integrada</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Interactive Calendar Anchor Selector */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Data Âncora da Consulta (Janela Preditiva):</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={radarAnchorDate}
                    onChange={(e) => {
                      setRadarAnchorDate(e.target.value);
                      handleTriggerAiScan();
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => handleSetDatePreset(0)}
                    className="px-2.5 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-[11px] font-medium transition cursor-pointer whitespace-nowrap"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={() => handleSetDatePreset(30)}
                    className="px-2.5 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-[11px] font-medium transition cursor-pointer whitespace-nowrap"
                  >
                    +30 dias
                  </button>
                  <button
                    onClick={() => handleSetDatePreset(60)}
                    className="px-2.5 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-[11px] font-medium transition cursor-pointer whitespace-nowrap"
                  >
                    +60 dias
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  A IA calcula datas comemorativas, feriados e demandas de manutenção fabril a partir desta referência temporal.
                </p>
              </div>
            </div>
          </div>

          {/* Radar Opportunities List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {activeRadar.map((opp) => (
              <div
                key={opp.id}
                className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-lg hover:shadow-cyan-950/20"
              >
                <div className="space-y-3">
                  {/* Top Metadata Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800/60">
                          {opp.daysAhead > 0 ? `Em ${opp.daysAhead} dias` : 'Janela Imediata'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">· {opp.dateReference}</span>
                        {opp.companyProfileTarget && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase tracking-wider font-semibold">
                            {opp.companyProfileTarget === 'industria' ? 'Indústria' : opp.companyProfileTarget === 'servicos' ? 'Serviços' : 'Geral'}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white leading-tight">{opp.theme}</h3>
                    </div>

                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold shrink-0 uppercase tracking-wider ${
                        opp.priority === 'alta'
                          ? 'bg-rose-950/90 text-rose-300 border border-rose-800/60'
                          : 'bg-amber-950/90 text-amber-300 border border-amber-800/60'
                      }`}
                    >
                      {opp.priority}
                    </span>
                  </div>

                  {/* Justification & Objective */}
                  <p className="text-xs text-slate-300 leading-relaxed">{opp.justification}</p>

                  {/* Action Summary Card */}
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2.5 text-xs">
                    <div>
                      <span className="font-semibold text-blue-400 text-[11px] block">Ação Proposta:</span>
                      <p className="text-slate-300 text-xs">{opp.proposedAction}</p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                      <span>Custo est.: <strong className="text-slate-200">{opp.estimatedCostRange || 'Sob consulta'}</strong></span>
                      <span className="capitalize">Escopo: <strong className="text-slate-200">{opp.scope}</strong></span>
                    </div>

                    {/* STRUCTURED SCHEDULE TIMELINE (CRONOGRAMA ESTRUTURADO) */}
                    {opp.structuredSchedule && opp.structuredSchedule.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-cyan-300 flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            <span>Cronograma Estruturado de Execução:</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {opp.structuredSchedule.length} marcos
                          </span>
                        </div>

                        <div className="space-y-1.5 pl-1 border-l-2 border-cyan-800/40">
                          {opp.structuredSchedule.map((step, sIdx) => (
                            <div key={sIdx} className="pl-2 relative text-[11px] space-y-0.5">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-mono text-[10px] text-cyan-400 font-bold px-1 rounded bg-cyan-950/60 border border-cyan-800/40">
                                  {step.timeOrPhase}
                                </span>
                                <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                                  <UserCheck className="w-2.5 h-2.5 text-slate-500" />
                                  <span>{step.responsible}</span>
                                </span>
                              </div>
                              <p className="text-slate-300 text-[11px] leading-snug">{step.activity}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested Materials Tags */}
                    <div className="space-y-1 pt-2 border-t border-slate-800/60">
                      <span className="text-[11px] font-semibold text-slate-400">Materiais Sugeridos:</span>
                      <div className="flex flex-wrap gap-1">
                        {opp.suggestedMaterials.map((mat, mIdx) => (
                          <span
                            key={mIdx}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50"
                          >
                            {mat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1-CLICK CONVERSION ACTION BUTTONS */}
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                      <ListChecks className="w-3 h-3" />
                      <span>Converte cronograma em plano de ação executável</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleConvertWithFeedback(opp, 'campaign')}
                      className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-md shadow-blue-950/40"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>+ Criar Campanha</span>
                    </button>
                    <button
                      onClick={() => handleConvertWithFeedback(opp, 'event')}
                      className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-md shadow-amber-950/40"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>+ Criar Evento</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date Details Modal */}
      {selectedDateItem && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 block">
                  {selectedDateItem.category.replace('_', ' ')}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">{selectedDateItem.title}</h3>
                <span className="text-xs text-slate-400 font-mono">Data: {selectedDateItem.date}</span>
              </div>
              <button
                onClick={() => setSelectedDateItem(null)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              {selectedDateItem.description}
            </p>

            {selectedDateItem.suggestedAction && (
              <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 space-y-1">
                <span className="text-[11px] font-semibold text-blue-300 block">Sugestão de Ação:</span>
                <p className="text-xs text-slate-200">{selectedDateItem.suggestedAction}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedDateItem(null)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={() => handleJumpToRadarFromDate(selectedDateItem.date)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium transition cursor-pointer flex items-center justify-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explorar no Radar IA</span>
              </button>
              {onSelectDateForCampaign && (
                <button
                  onClick={() => {
                    onSelectDateForCampaign(selectedDateItem);
                    setSelectedDateItem(null);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer"
                >
                  Criar Campanha
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
