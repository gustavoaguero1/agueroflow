import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { AlertTriangle, ClipboardCheck, FilePlus2, HardHat, ShieldCheck, Siren } from 'lucide-react';
import { db } from '../../firebase';
import { SafetyCompliancePanel } from './SafetyCompliancePanel';
import { evaluateEmployeeSafetyCompliance, evaluateSafetyCrewCompliance, type SafetyComplianceSnapshot } from '../../services/safetyCompliance';
import { useAuth } from '../../contexts/AuthContext';
import type { Contract, Unit } from '../../types';
import type {
  SafetyDocumentType,
  SafetyOccurrenceCategory,
  SafetyOccurrenceRecord,
  SafetyPermitControls,
  SafetyPermitEvent,
  SafetyPermitEventType,
  SafetyPermitRecord,
  SafetyPermitState,
  SafetyPermitStatus,
  SafetyPermitType,
  SafetyRiskLevel,
} from '../../types/safety';
import {
  getSafetyNextStatus,
  localSafetyDate,
  requiredSafetyControls,
  safetyEventLabel,
  safetyOccurrenceCategoryLabel,
  safetyPermitCode,
  safetyPermitStatusLabel,
  safetyPermitTypeLabel,
  validateSafetyOccurrenceInput,
  validateSafetyPermitInput,
} from '../../services/safetyManagement';

interface PermitRiskDraft {
  hazard: string;
  consequence: string;
  initialRisk: SafetyRiskLevel;
  controlMeasures: string;
  residualRisk: SafetyRiskLevel;
}

interface PermitDraftState {
  documentType: SafetyDocumentType;
  relatedAprId: string;
  permitType: SafetyPermitType;
  unitId: string;
  contractId: string;
  activityTitle: string;
  description: string;
  location: string;
  validFrom: string;
  validUntil: string;
  supervisorName: string;
  teamMembersText: string;
  teamMemberIds: string[];
  risks: PermitRiskDraft[];
  emergencyPlan: string;
  controls: SafetyPermitControls;
}

interface OccurrenceDraftState {
  unitId: string;
  incidentDate: string;
  category: SafetyOccurrenceCategory;
  title: string;
  description: string;
  immediateAction: string;
  urgency: 'baixa' | 'media' | 'alta' | 'critica';
  relatedPermitId: string;
}

const emptyPermitDraft = (unitId = '', contractId = ''): PermitDraftState => ({
  documentType: 'apr',
  relatedAprId: '',
  permitType: 'geral',
  unitId,
  contractId,
  activityTitle: '',
  description: '',
  location: '',
  validFrom: '',
  validUntil: '',
  supervisorName: '',
  teamMembersText: '',
  teamMemberIds: [],
  risks: [{ hazard: '', consequence: '', initialRisk: 'alto', controlMeasures: '', residualRisk: 'medio' }],
  emergencyPlan: '',
  controls: {
    teamBriefed: false,
    ppeInspected: false,
    areaIsolated: false,
  },
});

const emptyOccurrenceDraft = (unitId = ''): OccurrenceDraftState => ({
  unitId,
  incidentDate: localSafetyDate(),
  category: 'condicao_insegura',
  title: '',
  description: '',
  immediateAction: '',
  urgency: 'media',
  relatedPermitId: '',
});

const RISK_LEVELS: Array<{ value: SafetyRiskLevel; label: string }> = [
  { value: 'baixo', label: 'Baixo' },
  { value: 'medio', label: 'Médio' },
  { value: 'alto', label: 'Alto' },
  { value: 'critico', label: 'Crítico' },
];

const OCCURRENCE_STATUS: Record<string, string> = {
  aberta: 'Aberta',
  analise: 'Em análise',
  acao_corretiva: 'Ação corretiva',
  verificacao: 'Em verificação',
  fechada: 'Fechada',
};

const STATUS_STYLES: Record<SafetyPermitStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 border-slate-700',
  awaiting_approval: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  approved: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  rejected: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
  closed: 'bg-slate-800 text-slate-400 border-slate-700',
  cancelled: 'bg-slate-800 text-slate-500 border-slate-700',
};

function valueToDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') {
      const date = toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

function formatDateTime(value: unknown): string {
  const date = valueToDate(value);
  return date ? date.toLocaleString('pt-BR') : '—';
}

function splitNames(value: string): string[] {
  return value.split(/\r?\n|,/).map((name) => name.trim()).filter(Boolean);
}

export const SafetyManagementPanel: React.FC = () => {
  const { user, organization, units, contracts, logAudit, areaLevel, isSupervisorOrAbove, isMaster } = useAuth();
  const organizationId = organization?.id || '';
  const canEdit = areaLevel('operacoes') >= 2;
  const canApprove = (isMaster || isSupervisorOrAbove) && canEdit;

  const [permits, setPermits] = useState<SafetyPermitRecord[]>([]);
  const [states, setStates] = useState<SafetyPermitState[]>([]);
  const [permitEvents, setPermitEvents] = useState<SafetyPermitEvent[]>([]);
  const [occurrences, setOccurrences] = useState<SafetyOccurrenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'permissoes' | 'ocorrencias' | 'conformidade'>('permissoes');
  const [showPermitForm, setShowPermitForm] = useState(false);
  const [showOccurrenceForm, setShowOccurrenceForm] = useState(false);
  const [selectedPermitId, setSelectedPermitId] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [permitDraft, setPermitDraft] = useState<PermitDraftState>(() => emptyPermitDraft());
  const [occurrenceDraft, setOccurrenceDraft] = useState<OccurrenceDraftState>(() => emptyOccurrenceDraft());
  const [complianceSnapshot, setComplianceSnapshot] = useState<SafetyComplianceSnapshot>({ loading: true, employees: [], ppeCatalog: [], ppeMovements: [], trainingCatalog: [], trainingRecords: [], legacyTrainingRecords: [] });
  const onComplianceSnapshotChange = useCallback((snapshot: SafetyComplianceSnapshot) => setComplianceSnapshot(snapshot), []);
  const canManageSafetyCatalog = isMaster || isSupervisorOrAbove;

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribePermits = onSnapshot(
      query(collection(db, 'safety_permits'), where('orgId', '==', organizationId)),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SafetyPermitRecord));
        rows.sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)));
        setPermits(rows);
        setLoading(false);
      },
      (error) => {
        console.error('Falha ao carregar permissões de trabalho:', error);
        setLoading(false);
      },
    );
    const unsubscribeStates = onSnapshot(
      query(collection(db, 'safety_permit_states'), where('orgId', '==', organizationId)),
      (snapshot) => setStates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SafetyPermitState))),
    );
    const unsubscribeEvents = onSnapshot(
      query(collection(db, 'safety_permit_events'), where('orgId', '==', organizationId)),
      (snapshot) => setPermitEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SafetyPermitEvent))),
    );
    const unsubscribeOccurrences = onSnapshot(
      query(collection(db, 'occurrences'), where('orgId', '==', organizationId)),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as SafetyOccurrenceRecord))
          .filter((item) => Boolean(item.safetyCategory));
        rows.sort((a, b) => String(b.incidentDate).localeCompare(String(a.incidentDate)));
        setOccurrences(rows);
      },
    );
    return () => {
      unsubscribePermits();
      unsubscribeStates();
      unsubscribeEvents();
      unsubscribeOccurrences();
    };
  }, [organizationId]);

  const permitRows = useMemo(() => permits.map((permit) => ({
    permit,
    state: states.find((state) => state.permitId === permit.id),
  })), [permits, states]);

  const selectedPermit = permits.find((permit) => permit.id === selectedPermitId) || null;
  const selectedState = states.find((state) => state.permitId === selectedPermitId) || null;
  const selectedEvents = useMemo(() => {
    if (!selectedState || !selectedPermitId) return [];
    const eventsById = new Map(permitEvents.map((event) => [event.id, event]));
    const activeChain: SafetyPermitEvent[] = [];
    const visited = new Set<string>();
    let eventId = selectedState.latestEventId;
    while (eventId && !visited.has(eventId)) {
      visited.add(eventId);
      const event = eventsById.get(eventId);
      if (!event || event.permitId !== selectedPermitId) break;
      activeChain.unshift(event);
      eventId = event.previousEventId || '';
    }
    return activeChain;
  }, [permitEvents, selectedPermitId, selectedState]);

  const awaitingApprovalCount = states.filter((state) => state.status === 'awaiting_approval').length;
  const activePermitCount = states.filter((state) => state.status === 'approved').length;
  const openOccurrenceCount = occurrences.filter((item) => item.status !== 'fechada').length;

  const patchPermit = <K extends keyof PermitDraftState>(key: K, value: PermitDraftState[K]) => {
    setPermitDraft((current) => ({ ...current, [key]: value }));
  };

  const patchRisk = <K extends keyof PermitRiskDraft>(index: number, key: K, value: PermitRiskDraft[K]) => {
    setPermitDraft((current) => ({
      ...current,
      risks: current.risks.map((risk, itemIndex) => itemIndex === index ? { ...risk, [key]: value } : risk),
    }));
  };
  const addRisk = () => setPermitDraft((current) => current.risks.length >= 5 ? current : ({
    ...current,
    risks: [...current.risks, { hazard: '', consequence: '', initialRisk: 'alto', controlMeasures: '', residualRisk: 'medio' }],
  }));
  const removeRisk = (index: number) => setPermitDraft((current) => current.risks.length <= 1 ? current : ({
    ...current,
    risks: current.risks.filter((_, itemIndex) => itemIndex !== index),
  }));

  const patchOccurrence = <K extends keyof OccurrenceDraftState>(key: K, value: OccurrenceDraftState[K]) => {
    setOccurrenceDraft((current) => ({ ...current, [key]: value }));
  };

  const openNewPermit = () => {
    setPermitDraft(emptyPermitDraft(units[0]?.id || '', contracts[0]?.id || ''));
    setShowPermitForm(true);
  };

  const eligibleAprs = permits.filter((permit) => (
    permit.documentType === 'apr'
    && states.some((state) => state.permitId === permit.id && state.status === 'approved')
    && permit.unitId === permitDraft.unitId
    && permit.contractId === permitDraft.contractId
  ));

  const openNewOccurrence = () => {
    setOccurrenceDraft(emptyOccurrenceDraft(units[0]?.id || ''));
    setShowOccurrenceForm(true);
  };

  const handleCreatePermit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || !user || !canEdit) return;

    const isPt = permitDraft.documentType === 'pt';
    const selectedEmployees = complianceSnapshot.employees.filter((employee) => permitDraft.teamMemberIds.includes(employee.id));
    const teamMembers = isPt ? selectedEmployees.map((employee) => employee.name) : splitNames(permitDraft.teamMembersText);
    const input = {
      unitId: permitDraft.unitId,
      contractId: permitDraft.contractId,
      documentType: permitDraft.documentType,
      ...(permitDraft.documentType === 'pt' ? { relatedAprId: permitDraft.relatedAprId } : {}),
      validFrom: permitDraft.validFrom,
      validUntil: permitDraft.validUntil,
      permitType: permitDraft.permitType,
      activityTitle: permitDraft.activityTitle,
      description: permitDraft.description,
      location: permitDraft.location,
      supervisorName: permitDraft.supervisorName,
      teamMembers,
      risks: permitDraft.risks,
      controls: permitDraft.controls,
      emergencyPlan: permitDraft.emergencyPlan,
    };
    const errors = validateSafetyPermitInput(input);
    if (isPt) {
      if (selectedEmployees.length !== permitDraft.teamMemberIds.length) errors.push('Há colaboradores selecionados que não estão mais no diretório ativo do RH. Atualize a equipe.');
      const blockers = evaluateSafetyCrewCompliance(complianceSnapshot, permitDraft.teamMemberIds, permitDraft.permitType);
      if (blockers.length) errors.push('LIBERAÇÃO BLOQUEADA — pendências de segurança:\n' + blockers.map((item) => '• ' + item.employeeName + ': ' + item.message).join('\n'));
    }
    if (permitDraft.documentType === 'pt' && !eligibleAprs.some((apr) => apr.id === permitDraft.relatedAprId)) {
      errors.push('A PT deve estar vinculada a uma APR aprovada da mesma unidade e contrato.');
    }
    if (!units.some((unit: Unit) => unit.id === permitDraft.unitId)
      || !contracts.some((contract: Contract) => contract.id === permitDraft.contractId)) {
      errors.push('Selecione uma unidade e um contrato pertencentes à empresa ativa.');
    }
    if (errors.length) {
      alert(errors.join('\n'));
      return;
    }

    setSubmitting(true);
    try {
      const permitRef = doc(collection(db, 'safety_permits'));
      const permitDate = permitDraft.validFrom.slice(0, 10);
      const actorName = user.displayName || user.email || 'Responsável de campo';
      const record = {
        id: permitRef.id,
        orgId: organizationId,
        unitId: permitDraft.unitId,
        contractId: permitDraft.contractId,
        documentType: permitDraft.documentType,
        ...(permitDraft.documentType === 'pt' ? { relatedAprId: permitDraft.relatedAprId } : {}),
        permitCode: safetyPermitCode(permitDraft.documentType, permitDate, permitRef.id),
        permitDate,
        permitType: permitDraft.permitType,
        activityTitle: permitDraft.activityTitle.trim(),
        description: permitDraft.description.trim(),
        location: permitDraft.location.trim(),
        validFrom: permitDraft.validFrom,
        validUntil: permitDraft.validUntil,
        supervisorName: permitDraft.supervisorName.trim(),
        teamMembers,
        ...(isPt ? { teamMemberIds: [...permitDraft.teamMemberIds] } : {}),
        risks: permitDraft.risks.map((risk, index) => ({
          id: 'risk_' + (index + 1),
          hazard: risk.hazard.trim(),
          consequence: risk.consequence.trim(),
          initialRisk: risk.initialRisk,
          controlMeasures: risk.controlMeasures.trim(),
          residualRisk: risk.residualRisk,
        })),
        controls: permitDraft.controls,
        emergencyPlan: permitDraft.emergencyPlan.trim(),
        createdByUid: user.uid,
        createdByName: actorName,
        createdAt: serverTimestamp(),
      };

      await setDoc(permitRef, record);
      const initialEventRef = doc(collection(db, 'safety_permit_events'));
      await setDoc(initialEventRef, {
        orgId: organizationId,
        unitId: permitDraft.unitId,
        contractId: permitDraft.contractId,
        permitId: permitRef.id,
        eventType: 'created',
        actorUid: user.uid,
        actorName,
        recordedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'safety_permit_states', permitRef.id), {
        id: permitRef.id,
        orgId: organizationId,
        unitId: permitDraft.unitId,
        contractId: permitDraft.contractId,
        permitId: permitRef.id,
        status: 'draft',
        latestEventId: initialEventRef.id,
        updatedByUid: user.uid,
        updatedByName: actorName,
        updatedAt: serverTimestamp(),
      });

      setShowPermitForm(false);
      setSelectedPermitId(permitRef.id);
      setPermitDraft(emptyPermitDraft(units[0]?.id || '', contracts[0]?.id || ''));
      try {
        await logAudit('Obras', 'Registrar APR/PT', 'Permissão ' + record.permitCode + ' criada como rascunho.', permitRef.id);
      } catch (auditError) {
        console.error('APR/PT salva, mas falhou o evento de auditoria:', auditError);
        alert('A APR/PT foi salva, mas não foi possível registrar o evento de auditoria. Avise o administrador.');
      }
    } catch (error) {
      console.error('Erro ao registrar APR/PT:', error);
      alert('Não foi possível salvar a APR/PT. Verifique as permissões e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const transitionPermit = async (permit: SafetyPermitRecord, eventType: SafetyPermitEventType) => {
    if (!organizationId || !user || !canEdit) return;
    const currentState = states.find((state) => state.permitId === permit.id);
    if (!currentState) {
      alert('O estado da permissão ainda não foi sincronizado. Atualize a tela e tente novamente.');
      return;
    }
    const nextStatus = getSafetyNextStatus(currentState.status, eventType);
    if (permit.documentType === 'pt' && ['submitted_for_approval', 'approved'].includes(eventType)) {
      const blockers = evaluateSafetyCrewCompliance(complianceSnapshot, permit.teamMemberIds || [], permit.permitType);
      if (blockers.length) {
        alert('PT bloqueada por pendências de conformidade:\n' + blockers.map((item) => item.employeeName + ': ' + item.message).join('\n'));
        return;
      }
    }
    if (!nextStatus) {
      alert('Esta movimentação não é permitida para o status atual.');
      return;
    }
    if (eventType === 'approved') {
      if (!canApprove) {
        alert('Somente Supervisor, Gerente ou Admin com Operações nível 2 pode aprovar.');
        return;
      }
      if (permit.createdByUid === user.uid) {
        alert('A aprovação precisa ser feita por outro responsável, diferente de quem criou a APR/PT.');
        return;
      }
      if (new Date(permit.validUntil).getTime() <= Date.now()) {
        alert('A validade informada já terminou. Registre uma nova APR/PT com o período correto.');
        return;
      }
    }
    if (['rejected', 'closed', 'cancelled'].includes(eventType) && !canApprove) {
      alert('Esta movimentação exige Supervisor, Gerente ou Admin com Operações nível 2.');
      return;
    }
    const comment = actionComment.trim();
    if (['rejected', 'closed', 'cancelled'].includes(eventType) && comment.length < 5) {
      alert('Informe uma justificativa com pelo menos 5 caracteres para esta movimentação.');
      return;
    }

    setSubmitting(true);
    try {
      const eventRef = doc(collection(db, 'safety_permit_events'));
      const actorName = user.displayName || user.email || 'Responsável de campo';
      await setDoc(eventRef, {
        orgId: organizationId,
        unitId: permit.unitId,
        contractId: permit.contractId,
        permitId: permit.id,
        eventType,
        actorUid: user.uid,
        actorName,
        previousEventId: currentState.latestEventId,
        recordedAt: serverTimestamp(),
        ...(comment ? { comment } : {}),
      });

      const stateRef = doc(db, 'safety_permit_states', permit.id);
      await runTransaction(db, async (transaction) => {
        const freshState = await transaction.get(stateRef);
        if (!freshState.exists() || freshState.data().latestEventId !== currentState.latestEventId) {
          throw new Error('A permissão foi movimentada por outra pessoa. Atualize a tela antes de tentar novamente.');
        }
        transaction.update(stateRef, {
          status: nextStatus,
          latestEventId: eventRef.id,
          updatedByUid: user.uid,
          updatedByName: actorName,
          updatedAt: serverTimestamp(),
        });
      });

      setActionComment('');
      try {
        await logAudit('Obras', 'Movimentar APR/PT', safetyEventLabel(eventType) + ' — ' + permit.permitCode, permit.id);
      } catch (auditError) {
        console.error('Movimentação salva, mas falhou o evento de auditoria:', auditError);
        alert('A movimentação foi salva, mas não foi possível registrar o evento de auditoria. Avise o administrador.');
      }
    } catch (error) {
      console.error('Erro ao movimentar APR/PT:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar a permissão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOccurrence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || !user || !canEdit) return;
    const errors = validateSafetyOccurrenceInput({
      unitId: occurrenceDraft.unitId,
      incidentDate: occurrenceDraft.incidentDate,
      category: occurrenceDraft.category,
      title: occurrenceDraft.title,
      description: occurrenceDraft.description,
      immediateAction: occurrenceDraft.immediateAction,
      urgency: occurrenceDraft.urgency,
    });
    if (!units.some((unit: Unit) => unit.id === occurrenceDraft.unitId)) {
      errors.push('Selecione uma unidade pertencente à empresa ativa.');
    }
    if (errors.length) {
      alert(errors.join('\n'));
      return;
    }
    setSubmitting(true);
    try {
      const occurrenceRef = doc(collection(db, 'occurrences'));
      const now = new Date().toISOString();
      const reportedBy = user.displayName || user.email || 'Responsável de campo';
      const occurrence = {
        id: occurrenceRef.id,
        orgId: organizationId,
        unitId: occurrenceDraft.unitId,
        type: 'seguranca',
        safetyCategory: occurrenceDraft.category,
        incidentDate: occurrenceDraft.incidentDate,
        ...(occurrenceDraft.relatedPermitId ? { relatedPermitId: occurrenceDraft.relatedPermitId } : {}),
        title: occurrenceDraft.title.trim(),
        description: occurrenceDraft.description.trim(),
        immediateAction: occurrenceDraft.immediateAction.trim(),
        urgency: occurrenceDraft.urgency,
        status: 'aberta',
        reportedBy,
        reportedByUid: user.uid,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(occurrenceRef, occurrence);
      setShowOccurrenceForm(false);
      setOccurrenceDraft(emptyOccurrenceDraft(units[0]?.id || ''));
      try {
        await logAudit('Ocorrências', 'Registrar ocorrência SMS', occurrence.title, occurrenceRef.id);
      } catch (auditError) {
        console.error('Ocorrência salva, mas falhou o evento de auditoria:', auditError);
        alert('A ocorrência foi salva, mas não foi possível registrar o evento de auditoria. Avise o administrador.');
      }
      setActiveView('ocorrencias');
    } catch (error) {
      console.error('Erro ao registrar ocorrência SMS:', error);
      alert('Não foi possível registrar a ocorrência. Verifique as permissões e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-[#121826] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-2 text-rose-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">Segurança do Trabalho & SMS</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
                APR, Permissões de Trabalho, EPIs, treinamentos, bloqueios preventivos e ocorrências de segurança.
              </p>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openNewPermit} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500">
                <FilePlus2 className="h-4 w-4" /> Nova APR / PT
              </button>
              <button type="button" onClick={openNewOccurrence} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
                <Siren className="h-4 w-4" /> Registrar ocorrência
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Aguardando aprovação</p>
            <p className="mt-1 text-2xl font-bold text-white">{awaitingApprovalCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">Permissões aprovadas</p>
            <p className="mt-1 text-2xl font-bold text-white">{activePermitCount}</p>
          </div>
          <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300">Ocorrências SMS em aberto</p>
            <p className="mt-1 text-2xl font-bold text-white">{openOccurrenceCount}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button type="button" onClick={() => setActiveView('permissoes')} className={'rounded-lg px-4 py-2 text-xs font-semibold ' + (activeView === 'permissoes' ? 'bg-rose-600 text-white' : 'border border-slate-800 bg-[#121826] text-slate-400 hover:text-white')}>
          APR & Permissão de Trabalho ({permits.length})
        </button>
        <button type="button" onClick={() => setActiveView('ocorrencias')} className={'rounded-lg px-4 py-2 text-xs font-semibold ' + (activeView === 'ocorrencias' ? 'bg-rose-600 text-white' : 'border border-slate-800 bg-[#121826] text-slate-400 hover:text-white')}>
          Registros SMS ({occurrences.length})
        </button>
        <button type="button" onClick={() => setActiveView('conformidade')} className={'rounded-lg px-4 py-2 text-xs font-semibold ' + (activeView === 'conformidade' ? 'bg-rose-600 text-white' : 'border border-slate-800 bg-[#121826] text-slate-400 hover:text-white')}>
          EPIs & Treinamentos ({complianceSnapshot.employees.length})
        </button>
      </div>

      <div className={activeView === 'conformidade' ? 'block' : 'hidden'}>
        <SafetyCompliancePanel organizationId={organizationId} canEdit={canEdit} canManageCatalog={canEdit && canManageSafetyCatalog} userId={user?.uid || ''} actorName={user?.displayName || user?.email || 'Responsável de campo'} onSnapshotChange={onComplianceSnapshotChange} logAudit={logAudit} />
      </div>

      {activeView === 'permissoes' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#121826]">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-white">Permissões de Trabalho</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Cada APR/PT mantém seu registro original e um histórico imutável de movimentações.</p>
              </div>
              {canEdit && <button type="button" onClick={openNewPermit} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white">Nova APR/PT</button>}
            </div>
            {loading ? (
              <p className="p-6 text-center text-xs text-slate-400">Carregando permissões...</p>
            ) : permitRows.length === 0 ? (
              <div className="p-8 text-center">
                <ClipboardCheck className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-2 text-sm font-semibold text-slate-300">Nenhuma APR/PT registrada</p>
                <p className="mt-1 text-xs text-slate-500">Registre os perigos, controles e responsáveis antes de encaminhar a permissão.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {permitRows.map(({ permit, state }) => {
                  const status = state?.status || 'draft';
                  const expired = status === 'approved' && new Date(permit.validUntil).getTime() <= Date.now();
                  return (
                    <button key={permit.id} type="button" onClick={() => { setSelectedPermitId(permit.id); setActionComment(''); }} className={'block w-full px-4 py-3 text-left transition-colors hover:bg-slate-800/40 ' + (selectedPermitId === permit.id ? 'bg-slate-800/50' : '')}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold text-rose-300"><span className="rounded border border-rose-800/60 bg-rose-950/40 px-1.5 py-0.5">{(permit.documentType || 'pt').toUpperCase()}</span>{permit.permitCode}</p>
                          <p className="mt-0.5 text-xs font-bold text-white">{permit.activityTitle}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{safetyPermitTypeLabel(permit.permitType)} · {permit.location}</p>
                        </div>
                        <span className={'rounded border px-2 py-1 text-[9px] font-bold ' + (expired ? 'border-rose-800 bg-rose-950/60 text-rose-300' : STATUS_STYLES[status])}>
                          {expired ? 'Aprovada · validade encerrada' : safetyPermitStatusLabel(status)}
                        </span>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-400">{permit.validFrom.replace('T', ' ')} até {permit.validUntil.replace('T', ' ')}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
            {selectedPermit && selectedState ? (
              <div className="space-y-3">
                <div className="border-b border-slate-800 pb-3">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold text-rose-300"><span className="rounded border border-rose-800/60 bg-rose-950/40 px-1.5 py-0.5">{(selectedPermit.documentType || 'pt').toUpperCase()}</span>{selectedPermit.permitCode}</p>
                  <h3 className="mt-1 text-sm font-bold text-white">{selectedPermit.activityTitle}</h3>
                  <p className="mt-1 text-[11px] text-slate-400">{safetyPermitTypeLabel(selectedPermit.permitType)} · {selectedPermit.location}</p>
                  <span className={'mt-2 inline-flex rounded border px-2 py-1 text-[10px] font-bold ' + STATUS_STYLES[selectedState.status]}>
                    {safetyPermitStatusLabel(selectedState.status)}
                  </span>
                </div>
                {selectedPermit.documentType === 'pt' && (
                  <div className="rounded-lg border border-cyan-900/50 bg-cyan-950/20 p-3">
                    <p className="text-[10px] font-bold uppercase text-cyan-300">APR de referência</p>
                    <p className="mt-1 text-[11px] text-slate-200">
                      {permits.find((permit) => permit.id === selectedPermit.relatedAprId)?.permitCode || 'APR vinculada não localizada'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      A APR vinculada precisa permanecer aprovada para que a PT possa ser aprovada.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="block text-slate-500">Unidade</span><strong className="text-slate-200">{units.find((unit: Unit) => unit.id === selectedPermit.unitId)?.name || '—'}</strong></div>
                  <div><span className="block text-slate-500">Obra/contrato</span><strong className="text-slate-200">{contracts.find((contract: Contract) => contract.id === selectedPermit.contractId)?.name || '—'}</strong></div>
                  <div><span className="block text-slate-500">Responsável da frente</span><strong className="text-slate-200">{selectedPermit.supervisorName}</strong></div>
                  <div><span className="block text-slate-500">Equipe</span><strong className="text-slate-200">{selectedPermit.teamMembers.length} participante(s)</strong></div>
                  <div className="col-span-2"><span className="block text-slate-500">Equipe autorizada nesta APR/PT</span><strong className="text-slate-200">{selectedPermit.teamMembers.join(', ')}</strong></div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Perigo e consequência</p>
                  {selectedPermit.risks.map((risk) => (
                    <div key={risk.id} className="mt-2 text-[11px]">
                      <p className="font-semibold text-slate-200">{risk.hazard}</p>
                      <p className="mt-0.5 text-slate-400">{risk.consequence}</p>
                      <p className="mt-1 text-slate-400">Risco: {risk.initialRisk} → residual: {risk.residualRisk}</p>
                      <p className="mt-1 text-slate-300">{risk.controlMeasures}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Controles pré-início</p>
                  <div className="mt-2 space-y-1.5">
                    {requiredSafetyControls(selectedPermit.permitType).map((item) => (
                      <p key={item.key} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-300">{item.label}</span>
                        <span className={selectedPermit.controls[item.key] ? 'font-bold text-emerald-300' : 'font-bold text-rose-300'}>{selectedPermit.controls[item.key] ? 'Confirmado' : 'Pendente'}</span>
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Plano de emergência</p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-300">{selectedPermit.emergencyPlan}</p>
                </div>
                {canEdit && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <textarea value={actionComment} onChange={(event) => setActionComment(event.target.value)} rows={2} placeholder="Justificativa da reprovação, encerramento ou cancelamento (quando aplicável)" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-white placeholder:text-slate-500" />
                    <div className="flex flex-wrap gap-2">
                      {(selectedState.status === 'draft' || selectedState.status === 'rejected') && (
                        <button type="button" disabled={submitting} onClick={() => transitionPermit(selectedPermit, 'submitted_for_approval')} className="rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-bold text-slate-950 disabled:opacity-50">Enviar para aprovação</button>
                      )}
                      {selectedState.status === 'awaiting_approval' && canApprove && (
                        <>
                          <button type="button" disabled={submitting || selectedPermit.createdByUid === user?.uid} onClick={() => transitionPermit(selectedPermit, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{selectedPermit.documentType === 'apr' ? 'Aprovar APR' : 'Aprovar PT'}</button>
                          <button type="button" disabled={submitting} onClick={() => transitionPermit(selectedPermit, 'rejected')} className="rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Reprovar</button>
                        </>
                      )}
                      {selectedState.status === 'approved' && canApprove && (
                        <button type="button" disabled={submitting} onClick={() => transitionPermit(selectedPermit, 'closed')} className="rounded-lg bg-slate-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Encerrar atividade</button>
                      )}
                      {!['closed', 'cancelled'].includes(selectedState.status) && canApprove && (
                        <button type="button" disabled={submitting} onClick={() => transitionPermit(selectedPermit, 'cancelled')} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-semibold text-slate-300 disabled:opacity-50">Cancelar PT</button>
                      )}
                    </div>
                    {selectedState.status === 'awaiting_approval' && selectedPermit.createdByUid === user?.uid && (
                      <p className="text-[10px] text-amber-300">A pessoa que abriu a APR/PT não pode aprovar a própria permissão.</p>
                    )}
                  </div>
                )}
                <div className="border-t border-slate-800 pt-3">
                  <h4 className="text-[10px] font-bold uppercase text-slate-500">Histórico da permissão</h4>
                  <div className="mt-2 space-y-2">
                    {selectedEvents.map((item) => (
                      <div key={item.id} className="border-l-2 border-slate-700 pl-3">
                        <p className="text-[11px] font-semibold text-slate-200">{safetyEventLabel(item.eventType)}</p>
                        <p className="text-[10px] text-slate-500">{item.actorName} · {formatDateTime(item.recordedAt)}</p>
                        {item.comment && <p className="mt-0.5 text-[10px] text-slate-400">{item.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center text-center">
                <HardHat className="h-8 w-8 text-slate-600" />
                <p className="mt-2 text-xs font-semibold text-slate-300">Selecione uma APR/PT</p>
                <p className="mt-1 max-w-xs text-[10px] text-slate-500">Consulte perigos, controles, equipe, validade e histórico de aprovação.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeView === 'ocorrencias' ? (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#121826]">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-white">Ocorrências de Segurança e Meio Ambiente</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">Os registros são gravados na central de Ocorrências existente e continuam com o fluxo de análise e ação corretiva já disponível.</p>
            </div>
            {canEdit && <button type="button" onClick={openNewOccurrence} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white">Registrar SMS</button>}
          </div>
          {occurrences.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">Nenhum registro SMS encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Ocorrência</th><th className="px-4 py-3">Classificação</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Urgência</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {occurrences.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3"><p className="font-semibold text-white">{item.title}</p><p className="mt-0.5 max-w-md text-[10px] text-slate-500">{item.description}</p></td>
                      <td className="px-4 py-3">{safetyOccurrenceCategoryLabel(item.safetyCategory)}</td>
                      <td className="px-4 py-3">{item.incidentDate}</td>
                      <td className="px-4 py-3 uppercase">{item.urgency}</td>
                      <td className="px-4 py-3">{OCCURRENCE_STATUS[item.status] || item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500">
            Para atribuir responsável, registrar causa raiz, acompanhar eficácia ou converter em OS corretiva, utilize a central de Ocorrências.
          </div>
        </div>
      ) : null}

      {!canEdit && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[10px] text-slate-400">
          Acesso somente para consulta. Operações nível 2 pode registrar APR/PT e ocorrências; aprovações exigem Supervisor, Gerente ou Admin.
        </p>
      )}

      {showPermitForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm">
          <form onSubmit={handleCreatePermit} className="my-6 w-full max-w-4xl space-y-4 rounded-2xl border border-slate-700 bg-[#121826] p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div><h3 className="text-base font-bold text-white">Análise Preliminar de Risco / Permissão de Trabalho</h3><p className="mt-1 text-[11px] text-slate-400">Preencha os riscos e controles reais da frente antes de criar o documento.</p></div>
              <button type="button" onClick={() => setShowPermitForm(false)} className="text-slate-400 hover:text-white">Fechar</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] text-slate-400">Documento
                <select value={permitDraft.documentType} onChange={(event) => setPermitDraft((current) => ({ ...current, documentType: event.target.value as SafetyDocumentType, relatedAprId: '' }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                  <option value="apr">APR — Análise Preliminar de Risco</option>
                  <option value="pt">PT — Permissão de Trabalho</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Tipo de atividade
                <select value={permitDraft.permitType} onChange={(event) => patchPermit('permitType', event.target.value as SafetyPermitType)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                  {['trabalho_a_quente','trabalho_em_altura','espaco_confinado','eletrico','icamento','abertura_de_linha','geral'].map((value) => <option key={value} value={value}>{safetyPermitTypeLabel(value as SafetyPermitType)}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Unidade / planta
                <select value={permitDraft.unitId} onChange={(event) => setPermitDraft((current) => ({ ...current, unitId: event.target.value, relatedAprId: '' }))} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                  <option value="">Selecione</option>{units.map((unit: Unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Obra / contrato
                <select value={permitDraft.contractId} onChange={(event) => setPermitDraft((current) => ({ ...current, contractId: event.target.value, relatedAprId: '' }))} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                  <option value="">Selecione</option>{contracts.map((contract: Contract) => <option key={contract.id} value={contract.id}>{contract.name}</option>)}
                </select>
              </label>
              {permitDraft.documentType === 'pt' && (
                <label className="text-[11px] text-slate-400 sm:col-span-2">APR aprovada de referência *
                  <select value={permitDraft.relatedAprId} onChange={(event) => patchPermit('relatedAprId', event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                    <option value="">Selecione APR aprovada da mesma unidade e contrato</option>
                    {eligibleAprs.map((apr) => <option key={apr.id} value={apr.id}>{apr.permitCode} · {apr.activityTitle}</option>)}
                  </select>
                  {eligibleAprs.length === 0 && <span className="mt-1 block text-[10px] text-amber-300">Não há APR aprovada para esta unidade/contrato. Aprove uma APR antes de criar a PT.</span>}
                </label>
              )}
              <label className="text-[11px] text-slate-400">Responsável pela frente
                <input value={permitDraft.supervisorName} onChange={(event) => patchPermit('supervisorName', event.target.value)} required maxLength={120} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">Atividade / serviço
                <input value={permitDraft.activityTitle} onChange={(event) => patchPermit('activityTitle', event.target.value)} required maxLength={160} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">Descrição e etapas do serviço
                <textarea value={permitDraft.description} onChange={(event) => patchPermit('description', event.target.value)} required rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400">Local / equipamento / linha
                <input value={permitDraft.location} onChange={(event) => patchPermit('location', event.target.value)} required maxLength={180} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              {permitDraft.documentType === 'pt' ? (
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-white">Equipe vinculada ao RH *</p>
                    <span className="text-[10px] text-slate-500">{permitDraft.teamMemberIds.length} selecionado(s)</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">A PT exige colaboradores ativos do RH. A equipe não pode ser informada apenas por texto.</p>
                  {complianceSnapshot.loading ? <p className="mt-2 text-[10px] text-amber-300">Carregando cadastros de EPIs e treinamentos...</p> : (
                    <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                      {complianceSnapshot.employees.filter((employee) => employee.active && !employee.dismissalDate).map((employee) => {
                        const blockers = evaluateEmployeeSafetyCompliance(complianceSnapshot, employee.id, permitDraft.permitType);
                        const selected = permitDraft.teamMemberIds.includes(employee.id);
                        return (
                          <label key={employee.id} className="flex items-start gap-2 rounded-lg border border-slate-800 px-2.5 py-2 text-[10px] text-slate-300">
                            <input type="checkbox" checked={selected} onChange={(event) => patchPermit('teamMemberIds', event.target.checked ? [...permitDraft.teamMemberIds, employee.id] : permitDraft.teamMemberIds.filter((id) => id !== employee.id))} className="mt-0.5 accent-rose-500" />
                            <span className="min-w-0 flex-1"><span className="font-semibold text-white">{employee.name}</span><span className="ml-1 text-slate-500">{employee.role || 'Colaborador'}</span>
                              <span className={'ml-2 font-bold ' + (blockers.length ? 'text-rose-300' : 'text-emerald-300')}>{blockers.length ? blockers.length + ' pendência(s)' : 'Apto'}</span>
                              {selected && blockers.length > 0 && <span className="mt-1 block text-rose-300">{blockers.map((item) => item.message).join(' · ')}</span>}
                            </span>
                          </label>
                        );
                      })}
                      {complianceSnapshot.employees.filter((employee) => employee.active && !employee.dismissalDate).length === 0 && <p className="text-[10px] text-amber-300">Nenhum colaborador ativo encontrado no diretório do RH.</p>}
                    </div>
                  )}
                </div>
              ) : (
                <label className="text-[11px] text-slate-400">Equipe planejada (um nome por linha)
                  <textarea value={permitDraft.teamMembersText} onChange={(event) => patchPermit('teamMembersText', event.target.value)} required rows={2} placeholder="Nome do profissional 1&#10;Nome do profissional 2" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                </label>
              )}
              <label className="text-[11px] text-slate-400">Início da validade
                <input type="datetime-local" value={permitDraft.validFrom} onChange={(event) => patchPermit('validFrom', event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400">Fim da validade
                <input type="datetime-local" value={permitDraft.validUntil} onChange={(event) => patchPermit('validUntil', event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-xs font-bold text-white"><AlertTriangle className="h-4 w-4 text-amber-400" /> Análise de perigo e risco</h4>
                <button type="button" onClick={addRisk} disabled={permitDraft.risks.length >= 5} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40">Adicionar perigo ({permitDraft.risks.length}/5)</button>
              </div>
              <div className="mt-3 space-y-3">
                {permitDraft.risks.map((risk, index) => (
                  <div key={index} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[11px] font-bold text-amber-300">Perigo {index + 1}</p>
                      {permitDraft.risks.length > 1 && <button type="button" onClick={() => removeRisk(index)} className="text-[10px] text-rose-300 hover:text-rose-200">Remover</button>}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-[11px] text-slate-400">Perigo identificado
                        <input value={risk.hazard} onChange={(event) => patchRisk(index, 'hazard', event.target.value)} required maxLength={180} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                      </label>
                      <label className="text-[11px] text-slate-400">Consequência possível
                        <input value={risk.consequence} onChange={(event) => patchRisk(index, 'consequence', event.target.value)} required maxLength={300} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                      </label>
                      <label className="text-[11px] text-slate-400">Risco inicial
                        <select value={risk.initialRisk} onChange={(event) => patchRisk(index, 'initialRisk', event.target.value as SafetyRiskLevel)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">{RISK_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                      </label>
                      <label className="text-[11px] text-slate-400">Risco residual após os controles
                        <select value={risk.residualRisk} onChange={(event) => patchRisk(index, 'residualRisk', event.target.value as SafetyRiskLevel)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">{RISK_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                      </label>
                      <label className="text-[11px] text-slate-400 sm:col-span-2">Medidas de prevenção e controle
                        <textarea value={risk.controlMeasures} onChange={(event) => patchRisk(index, 'controlMeasures', event.target.value)} required rows={2} maxLength={700} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <h4 className="text-xs font-bold text-white">Checklist obrigatório de pré-início</h4>
              <p className="mt-1 text-[10px] text-slate-500">As confirmações variam conforme o tipo de trabalho selecionado.</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {requiredSafetyControls(permitDraft.permitType).map((item) => (
                  <label key={item.key} className="flex items-start gap-2 text-[11px] text-slate-300">
                    <input type="checkbox" checked={Boolean(permitDraft.controls[item.key])} onChange={(event) => patchPermit('controls', { ...permitDraft.controls, [item.key]: event.target.checked })} className="mt-0.5 accent-rose-500" />
                    {item.label}
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-[11px] text-slate-400">Plano de emergência / resposta a desvios
                <textarea value={permitDraft.emergencyPlan} onChange={(event) => patchPermit('emergencyPlan', event.target.value)} required rows={2} maxLength={1500} placeholder="Informe comunicação, responsáveis, recursos e resposta aplicável à frente." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white" />
              </label>
            </div>
            {permitDraft.documentType === 'pt' && permitDraft.teamMemberIds.length > 0 && (
              <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-3">
                <p className="text-[10px] font-bold text-rose-200">Conferência de liberação da equipe</p>
                {evaluateSafetyCrewCompliance(complianceSnapshot, permitDraft.teamMemberIds, permitDraft.permitType).length > 0
                  ? <p className="mt-1 text-[10px] text-rose-300">{evaluateSafetyCrewCompliance(complianceSnapshot, permitDraft.teamMemberIds, permitDraft.permitType).length} pendência(s). O envio para aprovação ficará bloqueado até regularização.</p>
                  : <p className="mt-1 text-[10px] text-emerald-300">Equipe aprovada na conferência atual de RH, treinamentos, EPIs e CA.</p>}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => setShowPermitForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300">Cancelar</button>
              <button type="submit" disabled={submitting || !canEdit} className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{submitting ? 'Salvando...' : 'Salvar APR/PT como rascunho'}</button>
            </div>
          </form>
        </div>
      )}

      {showOccurrenceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm">
          <form onSubmit={handleCreateOccurrence} className="my-6 w-full max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-[#121826] p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div><h3 className="text-base font-bold text-white">Registrar ocorrência SMS</h3><p className="mt-1 text-[11px] text-slate-400">Quase-acidentes, condições inseguras, atos inseguros e incidentes são integrados à central de Ocorrências.</p></div>
              <button type="button" onClick={() => setShowOccurrenceForm(false)} className="text-slate-400 hover:text-white">Fechar</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] text-slate-400">Unidade / planta
                <select value={occurrenceDraft.unitId} onChange={(event) => { patchOccurrence('unitId', event.target.value); patchOccurrence('relatedPermitId', ''); }} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="">Selecione</option>{units.map((unit: Unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
              </label>
              <label className="text-[11px] text-slate-400">Data da ocorrência
                <input type="date" value={occurrenceDraft.incidentDate} onChange={(event) => patchOccurrence('incidentDate', event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400">Classificação
                <select value={occurrenceDraft.category} onChange={(event) => patchOccurrence('category', event.target.value as SafetyOccurrenceCategory)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                  <option value="quase_acidente">Quase-acidente</option><option value="condicao_insegura">Condição insegura</option><option value="ato_inseguro">Ato inseguro</option><option value="incidente_sem_lesao">Incidente sem lesão</option><option value="acidente_com_lesao">Acidente com lesão</option><option value="incidente_ambiental">Incidente ambiental</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-400">Urgência
                <select value={occurrenceDraft.urgency} onChange={(event) => patchOccurrence('urgency', event.target.value as OccurrenceDraftState['urgency'])} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select>
              </label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">Título
                <input value={occurrenceDraft.title} onChange={(event) => patchOccurrence('title', event.target.value)} required maxLength={150} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">Descrição objetiva do fato / condição observada
                <textarea value={occurrenceDraft.description} onChange={(event) => patchOccurrence('description', event.target.value)} required rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">Ação imediata tomada (se houver)
                <textarea value={occurrenceDraft.immediateAction} onChange={(event) => patchOccurrence('immediateAction', event.target.value)} rows={2} maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
              </label>
              <label className="text-[11px] text-slate-400 sm:col-span-2">APR/PT relacionada (opcional)
                <select value={occurrenceDraft.relatedPermitId} onChange={(event) => patchOccurrence('relatedPermitId', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="">Sem vínculo</option>{permits.filter((permit) => permit.unitId === occurrenceDraft.unitId).map((permit) => <option key={permit.id} value={permit.id}>{permit.permitCode} · {permit.activityTitle}</option>)}</select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => setShowOccurrenceForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300">Cancelar</button>
              <button type="submit" disabled={submitting || !canEdit} className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{submitting ? 'Registrando...' : 'Registrar ocorrência SMS'}</button>
            </div>
          </form>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-500">
        Este recurso registra análise interna e evidências declaradas pela equipe. Não substitui autorização formal do cliente/planta, procedimento corporativo, análise de profissional legalmente habilitado, assinatura digital certificada ou obrigações legais (incluindo CAT/eSocial). Não use esta tela como única verificação de aptidão, ASO, treinamento ou liberação de trabalho.
      </p>
    </div>
  );
};
