import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { WorkShift, OvertimeCalculationRules } from '../../types';
import {
  Clock,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Save,
  Moon,
  Sun,
  Shield,
  HelpCircle,
  Sparkles,
  Percent,
  Info,
} from 'lucide-react';

interface WorkShiftConfigModalProps {
  organizationId: string;
  onClose?: () => void;
  onRulesUpdated?: (rules: OvertimeCalculationRules) => void;
  isInline?: boolean;
}

export const DEFAULT_OVERTIME_RULES: OvertimeCalculationRules = {
  overtime50Multiplier: 1.5,
  overtime100Multiplier: 2.0,
  travelHourMultiplier: 1.0,
  nightShiftBonusPercent: 20,
  dsrPercent: 20,
  socialChargesPercent: 0,
  monthlyHoursDivisor: 220,
  standardDailyMealAllowance: 35,
  standardDailyLodgingAllowance: 120,
};

export const DEFAULT_SHIFTS: Omit<WorkShift, 'id' | 'orgId'>[] = [
  {
    name: 'Turno Comercial de Obra (07:00 às 17:00)',
    code: 'TURNO_COMERCIAL',
    startTime: '07:00',
    endTime: '17:00',
    breakMinutes: 60,
    standardDailyHours: 8.8,
    isNightShift: false,
    description: 'Jornada semanal de 44h compensada de segunda a sexta-feira.',
  },
  {
    name: 'Turno 1 — Matutino (06:00 às 14:20)',
    code: 'TURNO_1_MANHA',
    startTime: '06:00',
    endTime: '14:20',
    breakMinutes: 60,
    standardDailyHours: 7.33,
    isNightShift: false,
    description: 'Primeiro turno industrial com 6 dias semanais de 7h20.',
  },
  {
    name: 'Turno 2 — Vespertino (14:20 às 22:40)',
    code: 'TURNO_2_TARDE',
    startTime: '14:20',
    endTime: '22:40',
    breakMinutes: 60,
    standardDailyHours: 7.33,
    isNightShift: false,
    description: 'Segundo turno de caldeiraria e montagem em campo.',
  },
  {
    name: 'Turno 3 — Noturno Industrial (22:00 às 06:00)',
    code: 'TURNO_3_NOITE',
    startTime: '22:00',
    endTime: '06:00',
    breakMinutes: 60,
    standardDailyHours: 7.0,
    isNightShift: true,
    description: 'Turno noturno com incidência automática de adicional noturno de 20%.',
  },
];

export const WorkShiftConfigModal: React.FC<WorkShiftConfigModalProps> = ({
  organizationId,
  onClose,
  onRulesUpdated,
  isInline = false,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'shifts'>('rules');
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [rules, setRules] = useState<OvertimeCalculationRules>(DEFAULT_OVERTIME_RULES);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New Shift Form (Deixados limpos para digitação)
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftName, setShiftName] = useState('');
  const [shiftCode, setShiftCode] = useState('');
  const [shiftStartTime, setShiftStartTime] = useState('');
  const [shiftEndTime, setShiftEndTime] = useState('');
  const [shiftBreakMinutes, setShiftBreakMinutes] = useState('');
  const [shiftStandardHours, setShiftStandardHours] = useState('');
  const [shiftIsNight, setShiftIsNight] = useState(false);
  const [shiftDescription, setShiftDescription] = useState('');

  // Load shifts & rules from Firestore
  useEffect(() => {
    if (!organizationId) return;

    // Load Shifts
    const qShifts = query(collection(db, 'work_shifts'), where('orgId', '==', organizationId));
    const unsubShifts = onSnapshot(qShifts, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkShift));
      setShifts(list);
    });

    // Load Rules
    const rulesRef = doc(db, 'overtime_rules', organizationId);
    const unsubRules = onSnapshot(rulesRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as OvertimeCalculationRules;
        setRules(data);
        if (onRulesUpdated) onRulesUpdated(data);
      }
    });

    return () => {
      unsubShifts();
      unsubRules();
    };
  }, [organizationId]);

  // Seed default shifts
  const handleSeedDefaultShifts = async () => {
    setIsSaving(true);
    try {
      for (const s of DEFAULT_SHIFTS) {
        const id = `shift_${s.code.toLowerCase()}_${organizationId}`;
        await setDoc(doc(db, 'work_shifts', id), {
          id,
          orgId: organizationId,
          ...s,
        });
      }
    } catch (err) {
      console.error('Erro ao povoar turnos:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Save calculation rules
  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await setDoc(doc(db, 'overtime_rules', organizationId), rules);
      if (onRulesUpdated) onRulesUpdated(rules);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar regras:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Save or edit a shift
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const id = editingShiftId || `shift_${Date.now()}`;
      const shiftData: WorkShift = {
        id,
        orgId: organizationId,
        name: shiftName.trim(),
        code: shiftCode.trim().toUpperCase() || 'TURNO_CUSTOM',
        startTime: shiftStartTime,
        endTime: shiftEndTime,
        breakMinutes: Number(shiftBreakMinutes) || 60,
        standardDailyHours: Number(shiftStandardHours) || 8.0,
        isNightShift: shiftIsNight,
        description: shiftDescription.trim(),
      };

      await setDoc(doc(db, 'work_shifts', id), shiftData);
      setShowShiftForm(false);
      setEditingShiftId(null);
    } catch (err) {
      console.error('Erro ao salvar turno:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditShift = (s: WorkShift) => {
    setEditingShiftId(s.id);
    setShiftName(s.name);
    setShiftCode(s.code);
    setShiftStartTime(s.startTime);
    setShiftEndTime(s.endTime);
    setShiftBreakMinutes(s.breakMinutes.toString());
    setShiftStandardHours(s.standardDailyHours.toString());
    setShiftIsNight(!!s.isNightShift);
    setShiftDescription(s.description || '');
    setShowShiftForm(true);
  };

  const handleDeleteShift = async (id: string) => {
    if (!window.confirm('Deseja excluir este turno?')) return;
    try {
      await deleteDoc(doc(db, 'work_shifts', id));
    } catch (err) {
      console.error('Erro ao deletar turno:', err);
    }
  };

  const innerContent = (
    <div className={`bg-[#121826] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col ${isInline ? '' : 'max-w-3xl max-h-[94vh] overflow-y-auto'}`}>
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Jornadas de Trabalho, Turnos & Regras de Horas Extras</h3>
            <p className="text-xs text-slate-400">
              Parâmetros de cálculo para HE 50%, HE 100%, hora de viagem, adicional noturno e DSR da Aguero Inox.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-5 pt-2 bg-slate-950 border-b border-slate-800 gap-2 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'rules'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Percent className="w-4 h-4" />
            <span>Regras de Cálculo de Horas Extras & Adicionais</span>
          </button>

          <button
            onClick={() => setActiveTab('shifts')}
            className={`px-4 py-2.5 rounded-t-lg font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'shifts'
                ? 'border-blue-500 text-blue-400 bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Turnos de Trabalho ({shifts.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5 text-xs text-slate-200">
          {activeTab === 'rules' && (
            <form onSubmit={handleSaveRules} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-800/40 text-blue-300 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="text-white block font-semibold">Regras Consolidadas de Incidência</strong>
                  <p className="text-[11px] text-blue-200/90 leading-relaxed">
                    Estes multiplicadores são aplicados automaticamente na matriz do Diário de Obras ao apontar horas normais, extras e deslocamentos, calculando o custo exato da força de trabalho por projeto.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Divisor Mensal */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-white text-xs">Divisor Mensal de Horas</label>
                  <span className="text-[10px] text-slate-400 block">
                    Padrão CLT para jornada de 44h semanais: 220 horas (Salário Base / 220 = Valor Hora).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      value={rules.monthlyHoursDivisor}
                      onChange={(e) =>
                        setRules({ ...rules, monthlyHoursDivisor: Number(e.target.value) || 220 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-white text-xs focus:border-blue-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">horas/mês</span>
                  </div>
                </div>

                {/* HE 50% */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-amber-300 text-xs">Multiplicador Hora Extra 50%</label>
                  <span className="text-[10px] text-slate-400 block">
                    Horas além do turno em dias úteis (Padrão: 1.50 = 100% hora + 50% adicional).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="0.05"
                      value={rules.overtime50Multiplier}
                      onChange={(e) =>
                        setRules({ ...rules, overtime50Multiplier: Number(e.target.value) || 1.5 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-800/60 font-mono font-bold text-amber-300 text-xs focus:border-amber-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">x valor base (+50%)</span>
                  </div>
                </div>

                {/* HE 100% */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-red-300 text-xs">Multiplicador Hora Extra 100%</label>
                  <span className="text-[10px] text-slate-400 block">
                    Horas trabalhadas em domingos e feriados nacionais/municipais (Padrão: 2.00x).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="0.05"
                      value={rules.overtime100Multiplier}
                      onChange={(e) =>
                        setRules({ ...rules, overtime100Multiplier: Number(e.target.value) || 2.0 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-red-800/60 font-mono font-bold text-red-300 text-xs focus:border-red-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">x valor base (+100%)</span>
                  </div>
                </div>

                {/* Hora Viagem */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-blue-300 text-xs">Multiplicador Hora de Viagem</label>
                  <span className="text-[10px] text-slate-400 block">
                    Horas em deslocamento entre fábrica e canteiro de obras da contratante (Padrão: 1.00x).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="0.05"
                      value={rules.travelHourMultiplier}
                      onChange={(e) =>
                        setRules({ ...rules, travelHourMultiplier: Number(e.target.value) || 1.0 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-blue-800/60 font-mono font-bold text-blue-300 text-xs focus:border-blue-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">x valor base</span>
                  </div>
                </div>

                {/* Adicional Noturno */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-purple-300 text-xs">Adicional Noturno (%)</label>
                  <span className="text-[10px] text-slate-400 block">
                    Percentual incidente sobre horas trabalhadas entre 22h00 e 05h00 (CLT: 20%).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="1"
                      value={rules.nightShiftBonusPercent}
                      onChange={(e) =>
                        setRules({ ...rules, nightShiftBonusPercent: Number(e.target.value) || 20 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-purple-800/60 font-mono font-bold text-purple-300 text-xs focus:border-purple-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">% adicional</span>
                  </div>
                </div>

                {/* DSR sobre Horas Extras */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-emerald-300 text-xs">Reflexo DSR sobre Horas Extras (%)</label>
                  <span className="text-[10px] text-slate-400 block">
                    Descanso Semanal Remunerado incidindo sobre o total de HE do mês (Padrão estimado: 20%).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="1"
                      value={rules.dsrPercent}
                      onChange={(e) =>
                        setRules({ ...rules, dsrPercent: Number(e.target.value) || 0 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-emerald-800/60 font-mono font-bold text-emerald-300 text-xs focus:border-emerald-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">% DSR reflexo</span>
                  </div>
                </div>

                {/* Diária Alimentação */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-white text-xs">Diária Padrão de Refeição (R$)</label>
                  <span className="text-[10px] text-slate-400 block">
                    Valor sugerido na grade diária de campo quando a equipe almoça em viagem.
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="5"
                      value={rules.standardDailyMealAllowance || 35}
                      onChange={(e) =>
                        setRules({ ...rules, standardDailyMealAllowance: Number(e.target.value) || 35 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-white text-xs focus:border-blue-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">R$/dia por colaborador</span>
                  </div>
                </div>

                {/* Diária Hospedagem */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <label className="block font-bold text-white text-xs">Diária Padrão de Hospedagem (R$)</label>
                  <span className="text-[10px] text-slate-400 block">
                    Valor de hospedagem de dupla técnica em hotel/pousada local (Ex: CD Marília).
                  </span>
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="number"
                      step="10"
                      value={rules.standardDailyLodgingAllowance || 120}
                      onChange={(e) =>
                        setRules({ ...rules, standardDailyLodgingAllowance: Number(e.target.value) || 120 })
                      }
                      className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-white text-xs focus:border-blue-500"
                    />
                    <span className="text-slate-400 font-mono text-xs">R$/diária por dupla/técnico</span>
                  </div>
                </div>
              </div>

              {saveSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Regras salariais e multiplicadores de horas extras salvos com sucesso!</span>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Gravando Regras...' : 'Salvar Regras de Cálculo'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'shifts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">Turnos Cadastrados</h4>
                  <p className="text-[11px] text-slate-400">
                    Defina horários de entrada, saída, intervalo e jornada líquida diária.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  {shifts.length === 0 && (
                    <button
                      onClick={handleSeedDefaultShifts}
                      disabled={isSaving}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Carregar Turnos Padrão (Comercial, 1º, 2º e Noturno)</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setEditingShiftId(null);
                      setShiftName('');
                      setShiftCode('');
                      setShiftStartTime('07:00');
                      setShiftEndTime('17:00');
                      setShiftBreakMinutes('60');
                      setShiftStandardHours('8.8');
                      setShiftIsNight(false);
                      setShiftDescription('');
                      setShowShiftForm(true);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer shadow"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Novo Turno</span>
                  </button>
                </div>
              </div>

              {/* Shift list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shifts.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {s.isNightShift ? (
                          <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                            <Moon className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
                            <Sun className="w-4 h-4" />
                          </span>
                        )}
                        <div>
                          <strong className="text-white block font-medium">{s.name}</strong>
                          <span className="text-[10px] text-slate-400 font-mono uppercase">{s.code}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenEditShift(s)}
                          className="p-1 text-slate-400 hover:text-blue-400"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteShift(s.id)}
                          className="p-1 text-slate-400 hover:text-red-400"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                      <span className="text-slate-400">
                        Horário: <strong className="text-white font-mono">{s.startTime} às {s.endTime}</strong>
                      </span>
                      <span className="text-slate-400">
                        Intervalo: <strong className="text-white font-mono">{s.breakMinutes} min</strong>
                      </span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {s.standardDailyHours}h líquidas/dia
                      </span>
                    </div>

                    {s.description && (
                      <p className="text-[10px] text-slate-500 italic">{s.description}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Sub-form Modal to add or edit shift */}
              {showShiftForm && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 mt-4">
                  <h5 className="font-bold text-white text-xs">
                    {editingShiftId ? 'Editar Turno' : 'Cadastrar Novo Turno de Trabalho'}
                  </h5>
                  <form onSubmit={handleSaveShift} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Nome do Turno</label>
                        <input
                          type="text"
                          required
                          value={shiftName}
                          onChange={(e) => setShiftName(e.target.value)}
                          placeholder="Ex: Turno Diurno Canteiro"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Código Identificador</label>
                        <input
                          type="text"
                          required
                          value={shiftCode}
                          onChange={(e) => setShiftCode(e.target.value)}
                          placeholder="TURNO_DIURNO"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1">Entrada</label>
                        <input
                          type="time"
                          required
                          value={shiftStartTime}
                          onChange={(e) => setShiftStartTime(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Saída</label>
                        <input
                          type="time"
                          required
                          value={shiftEndTime}
                          onChange={(e) => setShiftEndTime(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Intervalo (min)</label>
                        <input
                          type="number"
                          value={shiftBreakMinutes}
                          onChange={(e) => setShiftBreakMinutes(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Jornada Líquida (h)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={shiftStandardHours}
                          onChange={(e) => setShiftStandardHours(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono font-bold text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <input
                        type="checkbox"
                        id="isNightShiftCheck"
                        checked={shiftIsNight}
                        onChange={(e) => setShiftIsNight(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <label htmlFor="isNightShiftCheck" className="text-slate-300 cursor-pointer font-medium">
                        Turno Noturno (Aplica adicional noturno automático sobre horas trabalhadas)
                      </label>
                    </div>

                    <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowShiftForm(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
                      >
                        Salvar Turno
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Footer */}
      {onClose && (
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );

  if (isInline) {
    return innerContent;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {innerContent}
    </div>
  );
};
