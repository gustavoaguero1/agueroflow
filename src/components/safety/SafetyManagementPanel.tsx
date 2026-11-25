import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Contract, Unit } from '../../types';
import type {
  SafetyDocumentType,
  SafetyPermitControls,
  SafetyPermitEvent,
  SafetyPermitEventType,
  SafetyPermitRecord,
  SafetyPermitState,
  SafetyPermitType,
  SafetyRiskAssessment,
  SafetyRiskLevel,
} from '../../types/safety';
import {
  createSafetyPermit,
  getSafetyNextStatus,
  localSafetyDate,
  requiredSafetyControls,
  SAFETY_PERMIT_TYPES,
  safetyEventLabel,
  safetyPermitCode,
  safetyPermitStatusLabel,
  safetyPermitTypeLabel,
  transitionSafetyPermit,
  validateSafetyPermitInput,
} from '../../services/safetyManagement';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  HardHat,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';

interface SafetyManagementPanelProps {
  organizationId: string;
  units: Unit[];
  contracts: Contract[];
  currentUser: { uid: string; displayName?: string | null; email?: string | null } | null;
  currentUserName: string;
  canEdit: boolean;
  canApprove: boolean;
}

interface SafetyRiskDraft {
  id: string;
  hazard: string;
  consequence: string;
  initialRisk: SafetyRiskLevel;
  controlMeasures: string;
  residualRisk: SafetyRiskLevel;
}

const EMPTY_RISK: SafetyRiskDraft = {
  id: 'risk_1',
  hazard: '',
  consequence: '',
  initialRisk: 'alto',
  controlMeasures: '',
  residualRisk: 'medio',
};

const RISK_OPTIONS: Array<{ value: SafetyRiskLevel; label: string }> = [
  { value: 'baixo', label: 'Baixo' },
  { value: 'medio', label: 'Médio' },
  { value: 'alto', label: 'Alto' },
  { value: 'critico', label: 'Crítico' },
];

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  return 0;
}

function statusTone(status?: string): string {
  if (status === 'approved') return 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300';
  if (status === 'rejected' || status === 'cancelled') return 'border-red-800/60 bg-red-950/40 text-red-300';
  if (status === 'closed') return 'border-slate-700 bg-slate-900 text-slate-300';
  if (status === 'awaiting_approval') return 'border-amber-700/60 bg-amber-950/50 text-amber-300';
  return 'border-slate-700 bg-slate-900 text-slate-400';
}

function statusFallback(status?: string): string {
  if (status === 'draft') return 'Rascunho';
  if (status === 'awaiting_approval') return 'Aguardando aprovação';
  if (status === 'approved') return 'Aprovada';
  if (status === 'rejected') return 'Reprovada';
  if (status === 'closed') return 'Encerrada';
  if (status === 'cancelled') return 'Cancelada';
  return 'Sem estado';
}

function makeLocalDateTime(date: string, time: string): string {
  return date + 'T' + time;
}

export const SafetyManagementPanel: React.FC<SafetyManagementPanelProps> = ({
  organizationId,
  units,
  contracts,
  currentUser,
  currentUserName,
  canEdit,
  canApprove,
}) => {
  const [permits, setPermits] = useState<SafetyPermitRecord[]>([]);
  const [states, setStates] = useState<SafetyPermitState[]>([]);
  const [events, setEvents] = useState<SafetyPermitEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'todos' | SafetyDocumentType>('todos');
  const [filterStatus, setFilterStatus] = useState('todos');

  const [documentType, setDocumentType] = useState<SafetyDocumentType>('apr');
  const [permitType, setPermitType] = useState<SafetyPermitType>('trabalho_a_quente');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [contractId, setContractId] = useState('');
  const [relatedAprId, setRelatedAprId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [validFrom, setValidFrom] = useState(makeLocalDateTime(localSafetyDate(), '08:00'));
  const [validUntil, setValidUntil] = useState(makeLocalDateTime(localSafetyDate(), '17:00'));
  const [activityTitle, setActivityTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [supervisorName, setSupervisorName] = useState(currentUserName);
  const [teamText, setTeamText] = useState('');
  const [emergencyPlan, setEmergencyPlan] = useState('');
  const [risks, setRisks] = useState<SafetyRiskDraft[]>([{ ...EMPTY_RISK }]);
  const [controls, setControls] = useState<SafetyPermitControls>({
    teamBriefed: false,
    ppeInspected: false,
    areaIsolated: false,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    const permitsQuery = query(collection(db, 'safety_permits'), where('orgId', '==', organizationId));
    const statesQuery = query(collection(db, 'safety_permit_states'), where('orgId', '==', organizationId));
    const eventsQuery = query(collection(db, 'safety_permit_events'), where('orgId', '==', organizationId));

    const unsubPermits = onSnapshot(permitsQuery, (snapshot) => {
      setPermits(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SafetyPermitRecord)));
      setLoading(false);
    }, (error) => {
      console.error('Falha ao carregar APR/PT:', error);
      setFeedback('Não foi possível carregar os registros de Segurança/SMS.');
      setLoading(false);
    });
    const unsubStates = onSnapshot(statesQuery, (snapshot) => {
      setStates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SafetyPermitState)));
    }, (error) => console.error('Falha ao carregar estados de APR/PT:', error));
    const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
      setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SafetyPermitEvent)));
    }, (error) => console.error('Falha ao carregar histórico de APR/PT:', error));

    return () => {
      unsubPermits();
      unsubStates();
      unsubEvents();
    };
  }, [organizationId]);

  useEffect(() => {
    if (!unitId && units.length) setUnitId(units[0].id);
  }, [unitId, units]);

  const stateByPermit = useMemo(() => {
    const map: Record<string, SafetyPermitState> = {};
    states.forEach((state) => { map[state.permitId] = state; });
    return map;
  }, [states]);

  const eventsByPermit = useMemo(() => {
    const map: Record<string, SafetyPermitEvent[]> = {};
    events.forEach((event) => {
      if (!map[event.permitId]) map[event.permitId] = [];
      map[event.permitId].push(event);
    });
    Object.values(map).forEach((items) => items.sort((a, b) => toMillis(a.recordedAt) - toMillis(b.recordedAt)));
    return map;
  }, [events]);

  const eligibleAprs = useMemo(() => permits.filter((permit) => (
    permit.documentType === 'apr'
    && stateByPermit[permit.id]?.status === 'approved'
    && permit.unitId === unitId
    && permit.contractId === contractId
  )), [permits, stateByPermit, unitId, contractId]);

  const filteredPermits = useMemo(() => permits
    .filter((permit) => filterType === 'todos' || permit.documentType === filterType)
    .filter((permit) => filterStatus === 'todos' || stateByPermit[permit.id]?.status === filterStatus)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)), [permits, stateByPermit, filterType, filterStatus]);

  const pendingCount = permits.filter((permit) => stateByPermit[permit.id]?.status === 'awaiting_approval').length;
  const approvedCount = permits.filter((permit) => stateByPermit[permit.id]?.status === 'approved').length;
  const draftCount = permits.filter((permit) => stateByPermit[permit.id]?.status === 'draft').length;
  const expiredCount = permits.filter((permit) => (
    permit.documentType === 'pt'
    && stateByPermit[permit.id]?.status === 'approved'
    && permit.validUntil < new Date().toISOString().slice(0, 16)
  )).length;

  const selectedPermit = permits.find((permit) => permit.id === selectedPermitId) || null;
  const selectedState = selectedPermit ? stateByPermit[selectedPermit.id] : undefined;
  const selectedEvents = selectedPermit ? (eventsByPermit[selectedPermit.id] || []) : [];
  const visibleContracts = contracts.filter((contract) => (
    !contract.unitIds?.length || contract.unitIds.includes(unitId)
  ));

  const requiredControls = requiredSafetyControls(permitType);

  const closeForm = () => {
    setShowForm(false);
    setErrors([]);
    setFeedback(null);
  };

  const resetForm = () => {
    setDocumentType('apr');
    setPermitType('trabalho_a_quente');
    setUnitId(units[0]?.id || '');
    setContractId('');
    setRelatedAprId('');
    setWorkOrderId('');
    setValidFrom(makeLocalDateTime(localSafetyDate(), '08:00'));
    setValidUntil(makeLocalDateTime(localSafetyDate(), '17:00'));
    setActivityTitle('');
    setDescription('');
    setLocation('');
    setSupervisorName(currentUserName);
    setTeamText('');
    setEmergencyPlan('');
    setRisks([{ ...EMPTY_RISK, id: 'risk_' + Date.now() }]);
    setControls({ teamBriefed: false, ppeInspected: false, areaIsolated: false });
    setErrors([]);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || !canEdit) return;

    const selectedApr = eligibleAprs.find((permit) => permit.id === relatedAprId);
    const input = {
      unitId,
      contractId,
      workOrderId: workOrderId.trim() || undefined,
      relatedAprId: documentType === 'pt' ? relatedAprId : undefined,
      documentType,
      validFrom,
      validUntil,
      permitType,
      activityTitle: activityTitle.trim(),
      description: description.trim(),
      location: location.trim(),
      supervisorName: supervisorName.trim(),
      teamMembers: teamText.split(/[\n,;]/).map((name) => name.trim()).filter(Boolean),
      risks: risks.map((risk) => ({
        hazard: risk.hazard.trim(),
        consequence: risk.consequence.trim(),
        initialRisk: risk.initialRisk,
        controlMeasures: risk.controlMeasures.trim(),
        residualRisk: risk.residualRisk,
      })),
      controls,
      emergencyPlan: emergencyPlan.trim(),
    };

    const validationErrors = validateSafetyPermitInput(input);
    if (documentType === 'pt' && !selectedApr) {
      validationErrors.push('Selecione uma APR aprovada para a mesma unidade e contrato.');
    }
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      const id = await createSafetyPermit(organizationId, {
        uid: currentUser.uid,
        name: currentUserName,
      }, input);
      setSelectedPermitId(id);
      closeForm();
      resetForm();
      setFeedback(documentType === 'apr'
        ? 'APR criada como rascunho. Envie para aprovação após revisar os dados.'
        : 'Permissão de Trabalho criada como rascunho e vinculada à APR selecionada.');
    } catch (error) {
      console.error('Erro ao criar APR/PT:', error);
      setErrors([error instanceof Error ? error.message : 'Não foi possível salvar a APR/PT.']);
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (
    permit: SafetyPermitRecord,
    state: SafetyPermitState | undefined,
    eventType: SafetyPermitEventType,
  ) => {
    if (!currentUser || !state) return;
    let comment = '';
    if (['rejected', 'closed', 'cancelled', 'note_added'].includes(eventType)) {
      const prompt = eventType === 'rejected'
        ? 'Informe o motivo da reprovação:'
        : eventType === 'closed'
          ? 'Informe a observação de encerramento:'
          : eventType === 'cancelled'
            ? 'Informe o motivo do cancelamento:'
            : 'Digite a observação:';
      comment = window.prompt(prompt) || '';
      if (!comment.trim()) return;
    } else if (eventType === 'approved' && !window.confirm('Confirmar aprovação interna deste documento?')) {
      return;
    } else if (eventType === 'submitted_for_approval' && !window.confirm('Enviar este documento para aprovação?')) {
      return;
    }

    try {
      await transitionSafetyPermit(permit, state, eventType, {
        uid: currentUser.uid,
        name: currentUserName,
      }, comment);
      setFeedback('Movimentação registrada no histórico da APR/PT.');
    } catch (error) {
      console.error('Erro ao movimentar APR/PT:', error);
      setFeedback(error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.');
    }
  };

  const updateRisk = (index: number, patch: Partial<SafetyRiskDraft>) => {
    setRisks((previous) => previous.map((risk, riskIndex) => (
      riskIndex === index ? { ...risk, ...patch } : risk
    )));
  };

  const addRisk = () => {
    if (risks.length >= 10) return;
    setRisks((previous) => [...previous, { ...EMPTY_RISK, id: 'risk_' + Date.now() + '_' + previous.length }]);
  };

  const removeRisk = (index: number) => {
    if (risks.length <= 1) return;
    setRisks((previous) => previous.filter((_, riskIndex) => riskIndex !== index));
  };

  const setControl = (key: keyof SafetyPermitControls, checked: boolean) => {
    setControls((previous) => ({ ...previous, [key]: checked }));
  };

  const labelForEvent = (eventType: SafetyPermitEventType) => safetyEventLabel(eventType);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#121826] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">
            <HardHat className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-white">Segurança do Trabalho & SMS</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
              APR e Permissões de Trabalho vinculadas à unidade, contrato e atividade, com matriz de riscos, controles e aprovação interna rastreável.
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" />
            Nova APR / PT
          </button>
        )}
      </div>

      {feedback && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-500 hover:text-white" aria-label="Fechar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rascunhos</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-white">{draftCount}</p>
        </div>
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">Aguardando aprovação</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-200">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">Aprovadas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-200">{approvedCount}</p>
        </div>
        <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-300/80">PTs com validade encerrada</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-200">{expiredCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-800 bg-[#121826] p-1">
          {([
            ['todos', 'Todos'],
            ['apr', 'APR'],
            ['pt', 'Permissões de Trabalho'],
          ] as Array<[typeof filterType, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilterType(value)}
              className={'rounded-md px-3 py-1.5 text-[11px] font-semibold ' + (filterType === value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
          className="rounded-lg border border-slate-800 bg-[#121826] px-3 py-2 text-xs text-slate-300 outline-none focus:border-amber-500"
        >
          <option value="todos">Todos os estados</option>
          <option value="draft">Rascunho</option>
          <option value="awaiting_approval">Aguardando aprovação</option>
          <option value="approved">Aprovadas</option>
          <option value="rejected">Reprovadas</option>
          <option value="closed">Encerradas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <span className="ml-auto text-[11px] text-slate-500">{filteredPermits.length} registro(s)</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-[#121826] py-12 text-xs text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Carregando registros...
        </div>
      ) : filteredPermits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-[#121826] px-4 py-12 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-300">Nenhuma APR ou PT encontrada</p>
          <p className="mt-1 text-xs text-slate-500">Crie uma APR para documentar perigos e controles antes de emitir uma Permissão de Trabalho.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredPermits.map((permit) => {
            const state = stateByPermit[permit.id];
            const status = state?.status;
            const expired = permit.documentType === 'pt' && status === 'approved'
              && permit.validUntil < new Date().toISOString().slice(0, 16);
            return (
              <div key={permit.id} className="rounded-xl border border-slate-800 bg-[#121826] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-cyan-800/60 bg-cyan-950/40 px-2 py-1 text-[10px] font-bold uppercase text-cyan-300">
                      {permit.documentType.toUpperCase()}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{permit.permitCode}</span>
                  </div>
                  <span className={'rounded-full border px-2 py-1 text-[10px] font-semibold ' + (expired ? 'border-red-800 bg-red-950/50 text-red-300' : statusTone(status))}>
                    {expired ? 'Validade encerrada' : status ? safetyPermitStatusLabel(status) : statusFallback(status)}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-white">{permit.activityTitle}</h3>
                <p className="mt-1 text-xs text-slate-400">{safetyPermitTypeLabel(permit.permitType)} · {permit.location}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{new Date(permit.validFrom).toLocaleString('pt-BR')}</span>
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Até {new Date(permit.validUntil).toLocaleString('pt-BR')}</span>
                  <span className="flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5" />{permit.supervisorName}</span>
                  <span className="flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />{permit.risks.length} risco(s) mapeado(s)</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPermitId(permit.id === selectedPermitId ? null : permit.id)}
                    className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    {permit.id === selectedPermitId ? 'Ocultar detalhes' : 'Ver detalhes e histórico'}
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    {canEdit && state && ['draft', 'rejected'].includes(state.status) && (
                      <button type="button" onClick={() => void handleTransition(permit, state, 'submitted_for_approval')} className="rounded-md border border-amber-700/60 bg-amber-950/30 px-2.5 py-1.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-900/40">
                        Enviar para aprovação
                      </button>
                    )}
                    {canApprove && state?.status === 'awaiting_approval' && (
                      <>
                        <button type="button" onClick={() => void handleTransition(permit, state, 'approved')} className="rounded-md border border-emerald-700/60 bg-emerald-950/30 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-900/40">
                          Aprovar
                        </button>
                        <button type="button" onClick={() => void handleTransition(permit, state, 'rejected')} className="rounded-md border border-red-700/60 bg-red-950/30 px-2.5 py-1.5 text-[10px] font-semibold text-red-200 hover:bg-red-900/40">
                          Reprovar
                        </button>
                      </>
                    )}
                    {canApprove && state?.status === 'approved' && (
                      <button type="button" onClick={() => void handleTransition(permit, state, 'closed')} className="rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-800">
                        Encerrar
                      </button>
                    )}
                  </div>
                </div>
                {permit.id === selectedPermitId && (
                  <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
                    <div>
                      <h4 className="mb-2 text-xs font-bold text-white">Descrição da atividade</h4>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{permit.description}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-xs font-bold text-white">Equipe</h4>
                        <p className="text-xs text-slate-300">{permit.teamMembers.join(', ')}</p>
                      </div>
                      <div>
                        <h4 className="mb-2 text-xs font-bold text-white">Plano de emergência</h4>
                        <p className="whitespace-pre-wrap text-xs text-slate-300">{permit.emergencyPlan}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-bold text-white">Matriz de riscos</h4>
                      <div className="space-y-2">
                        {permit.risks.map((risk) => (
                          <div key={risk.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                            <p className="text-xs font-semibold text-slate-100">{risk.hazard}</p>
                            <p className="mt-1 text-[11px] text-slate-400">Consequência: {risk.consequence}</p>
                            <p className="mt-1 text-[11px] text-slate-400">Risco inicial: {risk.initialRisk} · residual: {risk.residualRisk}</p>
                            <p className="mt-1 text-[11px] text-slate-300">Controles: {risk.controlMeasures}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-bold text-white">Verificações registradas</h4>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {requiredSafetyControls(permit.permitType).map((control) => (
                          <span key={control.key} className="flex items-center gap-2 text-[11px] text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{control.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-bold text-white">Histórico imutável</h4>
                      <div className="space-y-2">
                        {selectedEvents.length === 0 ? (
                          <p className="text-[11px] text-slate-500">Nenhuma movimentação registrada.</p>
                        ) : selectedEvents.map((event) => (
                          <div key={event.id} className="flex items-start gap-2 text-[11px]">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400" />
                            <div>
                              <p className="font-semibold text-slate-200">{labelForEvent(event.eventType)}</p>
                              <p className="text-slate-500">{event.actorName} · {new Date(toMillis(event.recordedAt)).toLocaleString('pt-BR')}</p>
                              {event.comment && <p className="mt-0.5 whitespace-pre-wrap text-slate-400">{event.comment}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {state && canEdit && !['closed', 'cancelled'].includes(state.status) && (
                      <button type="button" onClick={() => void handleTransition(permit, state, 'note_added')} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800">
                        Adicionar observação
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-amber-900/50 bg-amber-950/15 p-3 text-[11px] leading-relaxed text-amber-100/80">
        <p className="font-semibold text-amber-200">Limites do registro digital</p>
        <p className="mt-1">
          A aprovação no AgueroFlow é um registro interno. Ela não substitui inspeção presencial, profissional legalmente habilitado, autorização do cliente, bloqueio físico de energia, medição atmosférica, plano de resgate ou procedimentos legais da empresa. A tela não bloqueia automaticamente a execução nem valida certificados/ASO; a conferência da equipe permanece sob responsabilidade do responsável de SST e da liderança da obra.
        </p>
        <p className="mt-1">
          Acidentes, quase-acidentes e condições inseguras continuam sendo registrados na Central de Ocorrências existente, sem duplicação nesta tela.
        </p>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-5">
          <div className="my-4 max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#121826] p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Novo registro de Segurança/SMS</h3>
                <p className="mt-1 text-xs text-slate-400">Preencha a análise antes de enviar o documento ao fluxo de aprovação.</p>
              </div>
              <button type="button" onClick={closeForm} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Documento *</span>
                  <select value={documentType} onChange={(event) => { setDocumentType(event.target.value as SafetyDocumentType); setRelatedAprId(''); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                    <option value="apr">APR — Análise Preliminar de Risco</option>
                    <option value="pt">PT — Permissão de Trabalho</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Tipo de atividade *</span>
                  <select value={permitType} onChange={(event) => setPermitType(event.target.value as SafetyPermitType)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                    {SAFETY_PERMIT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Unidade / obra *</span>
                  <select value={unitId} onChange={(event) => { setUnitId(event.target.value); setContractId(''); setRelatedAprId(''); }} required className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                    <option value="">Selecione</option>
                    {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Contrato *</span>
                  <select value={contractId} onChange={(event) => { setContractId(event.target.value); setRelatedAprId(''); }} required className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                    <option value="">Selecione</option>
                    {visibleContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber || contract.code || contract.title}</option>)}
                  </select>
                </label>
                {documentType === 'pt' && (
                  <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                    <span className="font-semibold">APR aprovada vinculada *</span>
                    <select value={relatedAprId} onChange={(event) => setRelatedAprId(event.target.value)} required className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
                      <option value="">Selecione uma APR aprovada da mesma unidade e contrato</option>
                      {eligibleAprs.map((apr) => <option key={apr.id} value={apr.id}>{apr.permitCode} · {apr.activityTitle}</option>)}
                    </select>
                    {eligibleAprs.length === 0 && <span className="block text-[10px] text-amber-300">Não há APR aprovada para esta combinação. Aprove uma APR antes de emitir a PT.</span>}
                  </label>
                )}
                <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                  <span className="font-semibold">Título da atividade *</span>
                  <input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} required minLength={3} maxLength={160} placeholder="Ex.: Soldagem TIG na linha de retorno" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600" />
                </label>
                <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                  <span className="font-semibold">Descrição / etapas do serviço *</span>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} required minLength={10} maxLength={2000} rows={3} placeholder="Descreva a sequência de execução, ferramentas, equipamentos e condições da área." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600" />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Local exato *</span>
                  <input value={location} onChange={(event) => setLocation(event.target.value)} required maxLength={180} placeholder="Setor, linha, equipamento ou área" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600" />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Responsável pela frente *</span>
                  <input value={supervisorName} onChange={(event) => setSupervisorName(event.target.value)} required maxLength={120} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Início da validade *</span>
                  <input type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-white" />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Fim da validade *</span>
                  <input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-white" />
                </label>
                <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                  <span className="font-semibold">Equipe envolvida * (um nome por linha, separado por vírgula ou ponto e vírgula)</span>
                  <textarea value={teamText} onChange={(event) => setTeamText(event.target.value)} rows={2} placeholder="Nome do colaborador 1&#10;Nome do colaborador 2" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600" />
                </label>
                <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                  <span className="font-semibold">Ordem de Serviço (referência opcional)</span>
                  <input value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)} maxLength={100} placeholder="Número ou identificação da OS" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600" />
                </label>
              </div>

              <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">Matriz de riscos</h4>
                    <p className="text-[11px] text-slate-500">Identifique perigo, consequência, nível inicial e risco residual após as medidas.</p>
                  </div>
                  <button type="button" onClick={addRisk} disabled={risks.length >= 10} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 disabled:opacity-40">
                    + Adicionar risco
                  </button>
                </div>
                {risks.map((risk, index) => (
                  <div key={risk.id} className="space-y-2 rounded-lg border border-slate-800 bg-[#121826] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">Perigo {index + 1}</span>
                      {risks.length > 1 && <button type="button" onClick={() => removeRisk(index)} className="text-[10px] text-red-300 hover:text-red-200">Remover</button>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-[11px] text-slate-400">
                        <span>Perigo identificado *</span>
                        <input value={risk.hazard} onChange={(event) => updateRisk(index, { hazard: event.target.value })} maxLength={180} placeholder="Ex.: Superfície quente e respingos" className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
                      </label>
                      <label className="space-y-1 text-[11px] text-slate-400">
                        <span>Consequência possível *</span>
                        <input value={risk.consequence} onChange={(event) => updateRisk(index, { consequence: event.target.value })} maxLength={300} placeholder="Ex.: Queimadura e princípio de incêndio" className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
                      </label>
                      <label className="space-y-1 text-[11px] text-slate-400">
                        <span>Risco inicial *</span>
                        <select value={risk.initialRisk} onChange={(event) => updateRisk(index, { initialRisk: event.target.value as SafetyRiskLevel })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white">
                          {RISK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-[11px] text-slate-400">
                        <span>Risco residual após controles *</span>
                        <select value={risk.residualRisk} onChange={(event) => updateRisk(index, { residualRisk: event.target.value as SafetyRiskLevel })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white">
                          {RISK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-[11px] text-slate-400 sm:col-span-2">
                        <span>Medidas de controle *</span>
                        <textarea value={risk.controlMeasures} onChange={(event) => updateRisk(index, { controlMeasures: event.target.value })} rows={2} maxLength={700} placeholder="Descreva como eliminar ou reduzir o risco." className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white" />
                      </label>
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Verificações obrigatórias</h4>
                  <p className="text-[11px] text-slate-500">Confirme cada item após a verificação real no local.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {requiredControls.map((item) => (
                    <label key={item.key} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-[#121826] p-2.5 text-[11px] text-slate-300">
                      <input type="checkbox" checked={Boolean(controls[item.key])} onChange={(event) => setControl(item.key, event.target.checked)} className="mt-0.5 accent-amber-500" />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <label className="block space-y-1 text-xs text-slate-300">
                  <span className="font-semibold">Plano de emergência / comunicação *</span>
                  <textarea value={emergencyPlan} onChange={(event) => setEmergencyPlan(event.target.value)} rows={3} maxLength={1500} placeholder="Responsáveis, meio de comunicação, resposta e recursos de emergência aplicáveis." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-600" />
                </label>
              </section>

              {errors.length > 0 && (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-200">
                  <p className="mb-1 font-bold">Revise os seguintes pontos:</p>
                  <ul className="list-disc space-y-1 pl-5">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
                <button type="button" onClick={closeForm} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" disabled={saving || !canEdit} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                  {saving ? 'Salvando...' : 'Salvar como rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
