import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import {
  AlertCircle,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FlaskConical,
  History,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { db } from '../../firebase';
import type { Contract, Unit, ChecklistRun } from '../../types';
import type { EngineeringDocument } from '../../types/engineeringDocuments';
import type {
  QualityEventType,
  QualityRecord,
  QualityRecordEvent,
  QualityRecordState,
  QualityRecordType,
  QualitySeverity,
} from '../../types/quality';
import {
  getQualityNextStatus,
  getQualityRecordStatus,
  qualityInitialEvent,
  qualityInitialStatus,
  localQualityDate,
  qualityEventLabel,
  qualityRecordEventTone,
  qualityRecordTypeLabel,
  qualityStatusLabel,
  validateQualityRecordInput,
  type QualityRecordInput,
} from '../../services/qualityCommissioning';

interface QualityCommissioningPanelProps {
  organizationId: string;
  units: Unit[];
  contracts: Contract[];
  currentUser: { uid: string; displayName?: string | null; email?: string | null } | null;
  currentUserName: string;
  canEdit: boolean;
  canApprove: boolean;
  logAudit: (module: string, action: string, details: string, targetId?: string) => Promise<void>;
}

const RECORD_TYPES: QualityRecordType[] = [
  'visual_inspection',
  'weld_inspection',
  'dimensional_inspection',
  'material_receipt',
  'hydrostatic_test',
  'leak_test',
  'functional_test',
  'commissioning',
  'nonconformity',
  'punch_item',
];
const SEVERITIES: QualitySeverity[] = ['baixa', 'media', 'alta', 'critica'];
const isFinding = (type: QualityRecordType) => type === 'nonconformity' || type === 'punch_item';
const isPressureTest = (type: QualityRecordType) => type === 'hydrostatic_test' || type === 'leak_test';
const isTest = (type: QualityRecordType) => isPressureTest(type) || type === 'functional_test';

const inputClass = 'w-full rounded-lg border border-slate-700 bg-[#0B1220] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500';
const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50';

function dateMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const method = (value as { toMillis?: () => number }).toMillis;
    if (typeof method === 'function') return method();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const result = new Date(value).getTime();
    return Number.isFinite(result) ? result : 0;
  }
  return 0;
}

function formatDate(value: unknown): string {
  const millis = dateMillis(value);
  return millis ? new Date(millis).toLocaleString('pt-BR') : 'Data não disponível';
}

function latestEvent(events: QualityRecordEvent[]): QualityRecordEvent | undefined {
  return [...events].sort((a, b) => dateMillis(a.recordedAt) - dateMillis(b.recordedAt)).at(-1);
}

function eventToneClass(eventType?: QualityEventType): string {
  const tone = qualityRecordEventTone(eventType);
  if (tone === 'success') return 'border-emerald-800 bg-emerald-950/40 text-emerald-300';
  if (tone === 'danger') return 'border-rose-800 bg-rose-950/40 text-rose-300';
  if (tone === 'warning') return 'border-amber-800 bg-amber-950/40 text-amber-300';
  return 'border-slate-700 bg-slate-800/60 text-slate-300';
}

export const QualityCommissioningPanel: React.FC<QualityCommissioningPanelProps> = ({
  organizationId,
  units,
  contracts,
  currentUser,
  currentUserName,
  canEdit,
  canApprove,
  logAudit,
}) => {
  const [records, setRecords] = useState<QualityRecord[]>([]);
  const [events, setEvents] = useState<QualityRecordEvent[]>([]);
  const [states, setStates] = useState<QualityRecordState[]>([]);
  const [engineeringDocuments, setEngineeringDocuments] = useState<EngineeringDocument[]>([]);
  const [checklistRuns, setChecklistRuns] = useState<ChecklistRun[]>([]);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyRecordId, setBusyRecordId] = useState('');
  const [success, setSuccess] = useState('');

  const [recordDate, setRecordDate] = useState(localQualityDate());
  const [recordType, setRecordType] = useState<QualityRecordType>('visual_inspection');
  const [unitId, setUnitId] = useState('');
  const [contractId, setContractId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<'conforme' | 'nao_conforme' | 'pendente'>('conforme');
  const [severity, setSeverity] = useState<QualitySeverity>('media');
  const [measuredValue, setMeasuredValue] = useState('');
  const [measuredUnit, setMeasuredUnit] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [referenceStandard, setReferenceStandard] = useState('');
  const [testMedium, setTestMedium] = useState('');
  const [holdDurationMinutes, setHoldDurationMinutes] = useState('');
  const [equipmentTag, setEquipmentTag] = useState('');
  const [engineeringDocumentId, setEngineeringDocumentId] = useState('');
  const [checklistRunId, setChecklistRunId] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    setRecords([]);
    setEvents([]);
    setStates([]);
    setEngineeringDocuments([]);
    setChecklistRuns([]);
    setLoadError('');
      const stopRecords = onSnapshot(
      query(collection(db, 'quality_records'), where('orgId', '==', organizationId)),
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as QualityRecord));
        rows.sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));
        setRecords(rows);
        setLoadError('');
      },
      (error) => {
        console.error('Erro ao carregar registros de qualidade:', error);
        setLoadError('Não foi possível carregar os registros. Confira o acesso à área Operações.');
      },
    );
    const stopEvents = onSnapshot(
      query(collection(db, 'quality_record_events'), where('orgId', '==', organizationId)),
      (snapshot) => setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as QualityRecordEvent))),
      (error) => {
        console.error('Erro ao carregar histórico de qualidade:', error);
        setLoadError('Não foi possível carregar o histórico de movimentações.');
      },
    );
    const stopStates = onSnapshot(
      query(collection(db, 'quality_record_states'), where('orgId', '==', organizationId)),
      (snapshot) => setStates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as QualityRecordState))),
      (error) => {
        console.error('Erro ao carregar estados de qualidade:', error);
        setLoadError('Não foi possível carregar o estado atual do fluxo de qualidade.');
      },
    );
    const stopDocuments = onSnapshot(
      query(collection(db, 'engineering_documents'), where('orgId', '==', organizationId)),
      (snapshot) => setEngineeringDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EngineeringDocument))),
      (error) => console.error('Erro ao carregar vínculos de engenharia:', error),
    );
    const stopChecklists = onSnapshot(
      query(collection(db, 'checklist_runs'), where('orgId', '==', organizationId)),
      (snapshot) => setChecklistRuns(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChecklistRun))),
      (error) => console.error('Erro ao carregar execuções de checklist:', error),
    );
    return () => {
      stopRecords();
      stopEvents();
      stopStates();
      stopDocuments();
      stopChecklists();
    };
  }, [organizationId]);

  const eventsByRecord = useMemo(() => {
    const grouped = new Map<string, QualityRecordEvent[]>();
    for (const event of events) {
      const current = grouped.get(event.recordId) || [];
      current.push(event);
      grouped.set(event.recordId, current);
    }
    for (const [recordId, list] of grouped) {
      grouped.set(recordId, list.sort((a, b) => dateMillis(a.recordedAt) - dateMillis(b.recordedAt)));
    }
    return grouped;
  }, [events]);

  const statesByRecord = useMemo(
    () => new Map(states.map((item) => [item.recordId, item])),
    [states],
  );

  const currentStatusFor = (record: QualityRecord) =>
    statesByRecord.get(record.id)?.status
      || getQualityRecordStatus(latestEvent(eventsByRecord.get(record.id) || [])?.eventType);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return records.filter((record) => {
      if (contractFilter && record.contractId !== contractFilter) return false;
      if (!term) return true;
      return [
        record.recordCode,
        record.title,
        record.description,
        record.equipmentTag,
        record.responsibleName,
        qualityRecordTypeLabel(record.recordType),
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [records, search, contractFilter]);

  const currentStatuses = records.map((record) => ({
    record,
    latest: latestEvent(eventsByRecord.get(record.id) || []),
    status: currentStatusFor(record),
  }));
  const pendingReview = currentStatuses.filter((item) => item.status === 'review_pending').length;
  const openFindings = currentStatuses.filter((item) =>
    (isFinding(item.record.recordType) || item.record.result === 'nao_conforme' || item.status === 'rejected')
      && ['open', 'rejected', 'reopened', 'correction_pending_verification'].includes(item.status),
  ).length;
  const pendingVerification = currentStatuses.filter((item) => item.status === 'correction_pending_verification').length;
  const approvedCommissioning = currentStatuses.filter((item) =>
    item.record.recordType === 'commissioning' && item.status === 'approved',
  ).length;

  const availableDocuments = engineeringDocuments.filter((item) =>
    item.contractId === contractId && item.unitId === unitId,
  );
  const availableChecklists = checklistRuns.filter((item) => !item.unitId || item.unitId === unitId);

  const resetForm = () => {
    setRecordDate(localQualityDate());
    setRecordType('visual_inspection');
    setUnitId('');
    setContractId('');
    setTitle('');
    setDescription('');
    setResult('conforme');
    setSeverity('media');
    setMeasuredValue('');
    setMeasuredUnit('');
    setAcceptanceCriteria('');
    setReferenceStandard('');
    setTestMedium('');
    setHoldDurationMinutes('');
    setEquipmentTag('');
    setEngineeringDocumentId('');
    setChecklistRunId('');
    setResponsibleName('');
    setDueDate('');
  };

  const handleCreateRecord = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!canEdit || !currentUser) {
      alert('Seu perfil não tem permissão para registrar novos itens de qualidade.');
      return;
    }
    if (!unitId || !contractId) {
      alert('Selecione a unidade e o contrato/obra.');
      return;
    }
    const unit = units.find((item) => item.id === unitId);
    const contract = contracts.find((item) => item.id === contractId);
    if (!unit || !contract || unit.orgId !== organizationId || contract.orgId !== organizationId) {
      alert('A unidade e o contrato devem pertencer à empresa ativa.');
      return;
    }
    const input: QualityRecordInput = {
      recordDate,
      recordType,
      title,
      description,
      result: isFinding(recordType) ? 'nao_conforme' : result,
      ...((isFinding(recordType) || result === 'nao_conforme') ? { severity, responsibleName, dueDate } : {}),
      ...(measuredValue.trim() ? { measuredValue: Number(measuredValue) } : {}),
      ...(measuredUnit.trim() ? { measuredUnit: measuredUnit.trim() } : {}),
      ...(acceptanceCriteria.trim() ? { acceptanceCriteria: acceptanceCriteria.trim() } : {}),
      ...(referenceStandard.trim() ? { referenceStandard: referenceStandard.trim() } : {}),
      ...(testMedium.trim() ? { testMedium: testMedium.trim() } : {}),
      ...(holdDurationMinutes.trim() ? { holdDurationMinutes: Number(holdDurationMinutes) } : {}),
      ...(equipmentTag.trim() ? { equipmentTag: equipmentTag.trim() } : {}),
      ...(engineeringDocumentId ? { engineeringDocumentId } : {}),
      ...(checklistRunId ? { checklistRunId } : {}),
    };
    const errors = validateQualityRecordInput(input);
    if (errors.length) {
      alert(errors.join('\n'));
      return;
    }

    const selectedDocument = engineeringDocuments.find((item) => item.id === engineeringDocumentId);
    if (engineeringDocumentId && (!selectedDocument || selectedDocument.orgId !== organizationId
      || selectedDocument.contractId !== contractId || selectedDocument.unitId !== unitId)) {
      alert('O documento de engenharia vinculado não corresponde à unidade e ao contrato selecionados.');
      return;
    }
    const selectedChecklist = checklistRuns.find((item) => item.id === checklistRunId);
    if (checklistRunId && !selectedChecklist) {
      alert('A execução de checklist selecionada não está mais disponível.');
      return;
    }

    setSubmitting(true);
    setSuccess('');
    try {
      const recordRef = doc(collection(db, 'quality_records'));
      const eventRef = doc(collection(db, 'quality_record_events'));
      const actorName = currentUser.displayName?.trim() || currentUserName.trim() || currentUser.email || 'Usuário AgueroFlow';
      const recordCode = `QLD-${recordDate.slice(0, 4)}-${recordRef.id.slice(0, 8).toUpperCase()}`;
      const eventType: QualityEventType = qualityInitialEvent(recordType, input.result);
      const initialStatus = qualityInitialStatus(recordType, input.result);
      const stateRef = doc(db, 'quality_record_states', recordRef.id);
      const batch = writeBatch(db);
      batch.set(recordRef, {
        id: recordRef.id,
        orgId: organizationId,
        unitId,
        contractId,
        recordCode,
        recordDate,
        recordType,
        title: title.trim(),
        description: description.trim(),
        result: input.result,
        ...(input.severity ? { severity: input.severity } : {}),
        ...(input.measuredValue !== undefined ? { measuredValue: input.measuredValue } : {}),
        ...(input.measuredUnit ? { measuredUnit: input.measuredUnit } : {}),
        ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
        ...(input.referenceStandard ? { referenceStandard: input.referenceStandard } : {}),
        ...(input.testMedium ? { testMedium: input.testMedium } : {}),
        ...(input.holdDurationMinutes !== undefined ? { holdDurationMinutes: input.holdDurationMinutes } : {}),
        ...(input.equipmentTag ? { equipmentTag: input.equipmentTag } : {}),
        ...(selectedDocument ? { engineeringDocumentId: selectedDocument.id, engineeringDocumentCode: `${selectedDocument.documentCode} Rev. ${selectedDocument.revision}` } : {}),
        ...(selectedChecklist ? { checklistRunId: selectedChecklist.id, checklistTitle: selectedChecklist.templateTitle } : {}),
        ...(input.responsibleName ? { responsibleName: input.responsibleName.trim() } : {}),
        ...(input.dueDate ? { dueDate: input.dueDate } : {}),
        createdByUid: currentUser.uid,
        createdByName: actorName,
        createdAt: serverTimestamp(),
      });
      batch.set(eventRef, {
        orgId: organizationId,
        unitId,
        contractId,
        recordId: recordRef.id,
        eventType,
        actorUid: currentUser.uid,
        actorName,
        recordedAt: serverTimestamp(),
        comment: eventType === 'opened'
          ? 'Apontamento de qualidade aberto para tratamento.'
          : 'Registro enviado para aprovação técnica.',
      });
      batch.set(stateRef, {
        id: recordRef.id,
        orgId: organizationId,
        unitId,
        contractId,
        recordId: recordRef.id,
        status: initialStatus,
        latestEventId: eventRef.id,
        updatedByUid: currentUser.uid,
        updatedByName: actorName,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      setSuccess(`${recordCode} registrado. ${eventType === 'opened' ? 'O apontamento está aberto para correção.' : 'Aguardando aprovação técnica.'}`);
      setShowForm(false);
      resetForm();
      try {
        await logAudit('Qualidade', 'Registrar controle de qualidade', `${recordCode} · ${qualityRecordTypeLabel(recordType)} · ${title.trim()}`, recordRef.id);
      } catch (auditError) {
        console.error('Registro salvo, mas a auditoria complementar falhou:', auditError);
        setSuccess('Registro salvo. Atenção: a trilha complementar de auditoria não foi concluída.');
      }
    } catch (error) {
      console.error('Erro ao registrar controle de qualidade:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível registrar o item de qualidade.');
    } finally {
      setSubmitting(false);
    }
  };

  const recordEvent = async (record: QualityRecord, eventType: QualityEventType, comment = '') => {
    if (!currentUser) return;
    const stateRef = doc(db, 'quality_record_states', record.id);
    const actorName = currentUser.displayName?.trim() || currentUserName.trim() || currentUser.email || 'Usuário AgueroFlow';
    setBusyRecordId(record.id);
    setSuccess('');
    try {
      await runTransaction(db, async (transaction) => {
        const stateSnapshot = await transaction.get(stateRef);
        if (!stateSnapshot.exists()) throw new Error('O estado atual do registro não foi localizado. Atualize a tela e tente novamente.');
        const currentState = stateSnapshot.data() as QualityRecordState;
        const nextStatus = getQualityNextStatus(currentState.status, eventType);
        if (!nextStatus) throw new Error('Esta movimentação não é permitida a partir do estado atual do registro.');
        const eventRef = doc(collection(db, 'quality_record_events'));
        transaction.set(eventRef, {
          orgId: organizationId,
          unitId: record.unitId,
          contractId: record.contractId,
          recordId: record.id,
          previousEventId: currentState.latestEventId,
          eventType,
          actorUid: currentUser.uid,
          actorName,
          recordedAt: serverTimestamp(),
          ...(comment.trim() ? { comment: comment.trim().slice(0, 1500) } : {}),
        });
        transaction.update(stateRef, {
          status: nextStatus,
          latestEventId: eventRef.id,
          updatedByUid: currentUser.uid,
          updatedByName: actorName,
          updatedAt: serverTimestamp(),
        });
      });
      setSuccess(`${record.recordCode}: ${qualityEventLabel(eventType)}.`);
      try {
        await logAudit('Qualidade', qualityEventLabel(eventType), `${record.recordCode} · ${record.title}`, record.id);
      } catch (auditError) {
        console.error('Movimentação salva, mas a auditoria complementar falhou:', auditError);
        setSuccess('Movimentação registrada. Atenção: a trilha complementar de auditoria não foi concluída.');
      }
    } catch (error) {
      console.error('Erro ao registrar evento de qualidade:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.');
    } finally {
      setBusyRecordId('');
    }
  };
  const handleAction = async (record: QualityRecord, eventType: QualityEventType) => {
    const history = eventsByRecord.get(record.id) || [];
    const status = currentStatusFor(record);
    if (['approved', 'rejected', 'verified', 'closed', 'reopened'].includes(eventType) && !canApprove) {
      alert('A aprovação, verificação e encerramento exigem Supervisor, Gerente ou Admin com Operações nível 2.');
      return;
    }
    if (eventType === 'corrective_action_submitted' && !canEdit) return;
    if (eventType === 'approved' || eventType === 'rejected') {
      if (status !== 'review_pending') return;
      if (eventType === 'approved' && record.result === 'pendente') {
        alert('Um registro pendente/inconclusivo não pode ser aprovado. Registre o resultado definitivo após a verificação.');
        return;
      }
      if (eventType === 'approved') {
        if (window.confirm(`Confirmar aprovação de ${record.recordCode} — ${record.title}?`)) {
          await recordEvent(record, eventType);
        }
      } else {
        const comment = window.prompt('Descreva a reprovação e os ajustes necessários:')?.trim() || '';
        if (comment) await recordEvent(record, eventType, comment);
      }
      return;
    }
    if (eventType === 'corrective_action_submitted') {
      if (!['open', 'rejected', 'reopened'].includes(status)) return;
      const comment = window.prompt('Descreva a ação corretiva executada e a evidência verificada:')?.trim() || '';
      if (comment) await recordEvent(record, eventType, comment);
      return;
    }
    if (eventType === 'verified') {
      if (status !== 'correction_pending_verification') return;
      const comment = window.prompt('Informe o resultado da verificação independente:')?.trim() || '';
      if (comment) await recordEvent(record, eventType, comment);
      return;
    }
    if (eventType === 'closed') {
      if (status !== 'verified') return;
      if (window.confirm(`Encerrar o apontamento ${record.recordCode}?`)) await recordEvent(record, eventType, 'Correção verificada e apontamento encerrado.');
      return;
    }
    if (eventType === 'reopened') {
      if (status !== 'closed') return;
      const comment = window.prompt('Justifique a reabertura do apontamento:')?.trim() || '';
      if (comment) await recordEvent(record, eventType, comment);
      return;
    }
    if (eventType === 'note_added') {
      const comment = window.prompt('Escreva a observação que ficará no histórico:')?.trim() || '';
      if (comment) await recordEvent(record, eventType, comment);
    }
  };

  const getActions = (record: QualityRecord) => {
    const history = eventsByRecord.get(record.id) || [];
    const status = currentStatusFor(record);
    const finding = isFinding(record.recordType) || record.result === 'nao_conforme' || status === 'rejected';
    const actions: Array<{ type: QualityEventType; label: string }> = [];
    if (status === 'review_pending' && canApprove) {
      actions.push({ type: 'approved', label: 'Aprovar' }, { type: 'rejected', label: 'Reprovar / solicitar correção' });
    }
    if (finding && ['open', 'rejected', 'reopened'].includes(status) && canEdit) {
      actions.push({ type: 'corrective_action_submitted', label: 'Enviar ação corretiva' });
    }
    if (finding && status === 'correction_pending_verification' && canApprove) {
      actions.push({ type: 'verified', label: 'Verificar correção' });
    }
    if (finding && status === 'verified' && canApprove) {
      actions.push({ type: 'closed', label: 'Encerrar apontamento' });
    }
    if (finding && status === 'closed' && canApprove) {
      actions.push({ type: 'reopened', label: 'Reabrir apontamento' });
    }
    if (canEdit) actions.push({ type: 'note_added', label: 'Adicionar observação' });
    return actions;
  };

  return (
    <div className="space-y-5 text-slate-100">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Qualidade e comissionamento</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Inspeções industriais, testes, não conformidades, punch list e aprovação técnica com histórico rastreável.
          </p>
        </div>
        {canEdit && (
          <button type="button" className={primaryClass} onClick={() => setShowForm((value) => !value)}>
            <ClipboardCheck className="h-4 w-4" /> {showForm ? 'Fechar cadastro' : 'Novo registro de qualidade'}
          </button>
        )}
      </div>

      {success && <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-200">{success}</div>}
      {loadError && <div className="flex items-start gap-2 rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2.5 text-xs text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Aguardando aprovação</p>
          <p className="mt-1 text-2xl font-bold text-amber-200">{pendingReview}</p>
        </div>
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-300/70">Não conformidades / punch</p>
          <p className="mt-1 text-2xl font-bold text-rose-200">{openFindings}</p>
        </div>
        <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/70">Aguardando verificação</p>
          <p className="mt-1 text-2xl font-bold text-cyan-200">{pendingVerification}</p>
        </div>
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/70">Comissionamentos aprovados</p>
          <p className="mt-1 text-2xl font-bold text-emerald-200">{approvedCommissioning}</p>
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-[#121826] p-3 text-xs text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          Seu perfil possui acesso de consulta. Novos registros e ações corretivas exigem Operações nível 2; aprovações exigem Supervisor, Gerente ou Admin com Operações nível 2.
        </div>
      )}

      {showForm && canEdit && (
        <form onSubmit={handleCreateRecord} className="space-y-4 rounded-xl border border-slate-800 bg-[#121826] p-4">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Novo registro rastreável</h3>
            <span className="ml-auto rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400">Imutável após salvar</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-[11px] text-slate-400">Data do registro *
              <input className={inputClass} type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} required />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">Tipo de registro *
              <select className={inputClass} value={recordType} onChange={(e) => {
                const next = e.target.value as QualityRecordType;
                setRecordType(next);
                if (isFinding(next)) setResult('nao_conforme');
              }}>
                {RECORD_TYPES.map((type) => <option key={type} value={type}>{qualityRecordTypeLabel(type)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">Unidade / local *
              <select className={inputClass} value={unitId} onChange={(e) => { setUnitId(e.target.value); setEngineeringDocumentId(''); }}>
                <option value="">Selecione a unidade</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">Contrato / obra *
              <select className={inputClass} value={contractId} onChange={(e) => { setContractId(e.target.value); setEngineeringDocumentId(''); }}>
                <option value="">Selecione o contrato</option>
                {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber} — {contract.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400 md:col-span-2">Título *
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} placeholder="Ex.: Teste hidrostático da linha de água gelada" required />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">Identificação de equipamento / linha
              <input className={inputClass} value={equipmentTag} onChange={(e) => setEquipmentTag(e.target.value)} maxLength={80} placeholder="Ex.: LIN-015 / TK-02" />
            </label>
            {!(isFinding(recordType) || result === 'nao_conforme') ? (
              <label className="space-y-1 text-[11px] text-slate-400">Resultado *
                <select className={inputClass} value={result} onChange={(e) => setResult(e.target.value as 'conforme' | 'nao_conforme' | 'pendente')}>
                  <option value="conforme">Conforme</option>
                  <option value="nao_conforme">Não conforme</option>
                  <option value="pendente">Pendente / inconclusivo</option>
                </select>
              </label>
            ) : (
              <label className="space-y-1 text-[11px] text-slate-400">Criticidade *
                <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as QualitySeverity)}>
                  {SEVERITIES.map((item) => <option key={item} value={item}>{item.toLocaleUpperCase('pt-BR')}</option>)}
                </select>
              </label>
            )}
          </div>

          <label className="block space-y-1 text-[11px] text-slate-400">Descrição técnica / constatações *
            <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Descreva o serviço, trecho, equipamento, resultado encontrado ou desvio observado." required />
          </label>

          {isTest(recordType) && (
            <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/15 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-cyan-200"><FlaskConical className="h-4 w-4" /> Dados medidos do teste</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-[11px] text-slate-400">Valor medido *
                  <input className={inputClass} type="number" min="0" step="any" value={measuredValue} onChange={(e) => setMeasuredValue(e.target.value)} required />
                </label>
                <label className="space-y-1 text-[11px] text-slate-400">Unidade de medida *
                  <input className={inputClass} value={measuredUnit} onChange={(e) => setMeasuredUnit(e.target.value)} maxLength={20} placeholder="bar, psi, °C..." required />
                </label>
                {isPressureTest(recordType) && (
                  <>
                    <label className="space-y-1 text-[11px] text-slate-400">Fluido / meio de teste *
                      <input className={inputClass} value={testMedium} onChange={(e) => setTestMedium(e.target.value)} maxLength={80} placeholder="Água, ar, nitrogênio..." required />
                    </label>
                    <label className="space-y-1 text-[11px] text-slate-400">Tempo de observação (min) *
                      <input className={inputClass} type="number" min="1" max="1440" step="1" value={holdDurationMinutes} onChange={(e) => setHoldDurationMinutes(e.target.value)} required />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-[11px] text-slate-400">{isFinding(recordType) || result === 'nao_conforme' ? 'Critério / requisito não atendido *' : 'Critério de aceitação / verificação *'}
              <textarea className={inputClass} rows={2} value={acceptanceCriteria} onChange={(e) => setAcceptanceCriteria(e.target.value)} maxLength={500} placeholder="Informe o limite, requisito ou condição que será verificada." required />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">Norma / procedimento / especificação de referência
              <input className={inputClass} value={referenceStandard} onChange={(e) => setReferenceStandard(e.target.value)} maxLength={120} placeholder="Código e revisão do documento aplicável" />
            </label>
          </div>

          {(isFinding(recordType) || result === 'nao_conforme') && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-rose-900/50 bg-rose-950/15 p-3 md:grid-cols-3">
              <label className="space-y-1 text-[11px] text-slate-400">Responsável pela correção *
                <input className={inputClass} value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} maxLength={120} required />
              </label>
              <label className="space-y-1 text-[11px] text-slate-400">Prazo para correção *
                <input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </label>
              <label className="space-y-1 text-[11px] text-slate-400">Criticidade *
                <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as QualitySeverity)} required>
                  {SEVERITIES.map((item) => <option key={item} value={item}>{item.toLocaleUpperCase('pt-BR')}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1 text-[11px] text-slate-400">Documento técnico vinculado (opcional)
              <select className={inputClass} value={engineeringDocumentId} onChange={(e) => {
                const next = e.target.value;
                setEngineeringDocumentId(next);
                if (next) setChecklistRunId('');
              }}>
                <option value="">Sem vínculo com desenho / procedimento</option>
                {availableDocuments.map((item) => <option key={item.id} value={item.id}>{item.documentCode} Rev. {item.revision} — {item.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">Checklist executado vinculado (opcional)
              <select className={inputClass} value={checklistRunId} onChange={(e) => {
                const next = e.target.value;
                setChecklistRunId(next);
                if (next) setEngineeringDocumentId('');
              }}>
                <option value="">Sem checklist vinculado</option>
                {availableChecklists.map((item) => <option key={item.id} value={item.id}>{item.templateTitle} — {item.inspectorName}</option>)}
              </select>
            </label>
            <p className="md:col-span-2 text-[10px] text-slate-500">Vincule um documento técnico ou uma execução de checklist por registro. Selecionar um limpa automaticamente o outro.</p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:justify-end">
            <button type="button" className={actionClass} onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
            <button type="submit" className={primaryClass} disabled={submitting}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {submitting ? 'Salvando...' : isFinding(recordType) ? 'Abrir apontamento' : 'Enviar para aprovação'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3 rounded-xl border border-slate-800 bg-[#121826] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Registros de qualidade</h3>
            <span className="text-[10px] text-slate-500">{records.length} registro(s)</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input className={inputClass + ' min-w-0 pl-9 sm:w-64'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código, equipamento, título..." />
            </div>
            <select className={inputClass + ' sm:w-56'} value={contractFilter} onChange={(e) => setContractFilter(e.target.value)}>
              <option value="">Todos os contratos</option>
              {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNumber || contract.title}</option>)}
            </select>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center">
            <ClipboardCheck className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-300">Nenhum registro encontrado</p>
            <p className="mt-1 text-xs text-slate-500">Inspeções, ensaios, não conformidades e punch list aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRecords.map((record) => {
              const history = eventsByRecord.get(record.id) || [];
              const latest = latestEvent(history);
              const status = currentStatusFor(record);
              const selected = selectedRecordId === record.id;
              const actions = getActions(record);
              const unitName = units.find((item) => item.id === record.unitId)?.name || 'Unidade não localizada';
              const contractName = contracts.find((item) => item.id === record.contractId)?.title || 'Contrato não localizado';
              return (
                <div key={record.id} className="rounded-lg border border-slate-700 bg-[#0D1523]">
                  <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedRecordId(selected ? '' : record.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{record.recordCode}</span>
                        <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">{qualityRecordTypeLabel(record.recordType)}</span>
                        <span className={`rounded border px-2 py-0.5 text-[10px] ${eventToneClass(latest?.eventType)}`}>{qualityStatusLabel(status)}</span>
                        {record.severity && <span className="rounded border border-rose-900/70 bg-rose-950/30 px-2 py-0.5 text-[10px] text-rose-200">{record.severity.toLocaleUpperCase('pt-BR')}</span>}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{record.title}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{unitName} · {contractName} · {record.recordDate.split('-').reverse().join('/')}</p>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button type="button" className={actionClass} onClick={() => setSelectedRecordId(selected ? '' : record.id)}>
                        <History className="h-3.5 w-3.5" /> Histórico ({history.length})
                      </button>
                    </div>
                  </div>
                  {selected && (
                    <div className="space-y-3 border-t border-slate-800 p-3">
                      <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-400 md:grid-cols-3">
                        <p><strong className="text-slate-200">Resultado:</strong> {record.result.replace('_', ' ')}</p>
                        <p><strong className="text-slate-200">Registrado por:</strong> {record.createdByName}</p>
                        <p><strong className="text-slate-200">Criado em:</strong> {formatDate(record.createdAt)}</p>
                        {record.equipmentTag && <p><strong className="text-slate-200">Equipamento/linha:</strong> {record.equipmentTag}</p>}
                        {record.measuredValue !== undefined && <p><strong className="text-slate-200">Valor medido:</strong> {record.measuredValue} {record.measuredUnit || ''}</p>}
                        {record.testMedium && <p><strong className="text-slate-200">Meio do teste:</strong> {record.testMedium}</p>}
                        {record.holdDurationMinutes !== undefined && <p><strong className="text-slate-200">Tempo de observação:</strong> {record.holdDurationMinutes} min</p>}
                        {record.acceptanceCriteria && <p className="md:col-span-2"><strong className="text-slate-200">Critério:</strong> {record.acceptanceCriteria}</p>}
                        {record.referenceStandard && <p><strong className="text-slate-200">Referência:</strong> {record.referenceStandard}</p>}
                        {record.responsibleName && <p><strong className="text-slate-200">Responsável:</strong> {record.responsibleName}</p>}
                        {record.dueDate && <p><strong className="text-slate-200">Prazo:</strong> {record.dueDate.split('-').reverse().join('/')}</p>}
                        {record.engineeringDocumentCode && <p><strong className="text-slate-200">Documento:</strong> {record.engineeringDocumentCode}</p>}
                        {record.checklistTitle && <p><strong className="text-slate-200">Checklist:</strong> {record.checklistTitle}</p>}
                        <p className="md:col-span-3"><strong className="text-slate-200">Descrição:</strong> {record.description}</p>
                      </div>

                      {actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                          {actions.map((action) => (
                            <button key={action.type} type="button" className={actionClass} disabled={busyRecordId === record.id} onClick={() => void handleAction(record, action.type)}>
                              {busyRecordId === record.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {history.length > 0 ? (
                        <div className="space-y-2 border-t border-slate-800 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Linha do tempo</p>
                          {history.map((event) => (
                            <div key={event.id} className="flex flex-col gap-1 border-l-2 border-slate-700 pl-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold text-slate-200">{qualityEventLabel(event.eventType)}</p>
                                <p className="text-[10px] text-slate-500">{event.actorName} · {formatDate(event.recordedAt)}</p>
                                {event.comment && <p className="mt-0.5 text-[11px] text-slate-400">{event.comment}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-amber-300">Registro sem eventos de movimentação.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-3 text-[10px] leading-relaxed text-amber-100/80">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p>
          Aprovação no AgueroFlow registra a análise do responsável interno; não substitui laudo assinado, norma aplicável, certificação de inspetor, aceite do cliente ou autorização operacional. A liberação formal do equipamento/instalação permanece sob responsabilidade do profissional competente e dos procedimentos contratuais.
        </p>
      </div>
    </div>
  );
};
