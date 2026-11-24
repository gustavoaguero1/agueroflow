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
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  FilePlus2,
  FileText,
  History,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { db, storage } from '../../firebase';
import type { Contract, Unit } from '../../types';
import type {
  EngineeringDocument,
  EngineeringDocumentEvent,
  EngineeringDocumentEventType,
  EngineeringDocumentKind,
} from '../../types/engineeringDocuments';
import {
  buildEngineeringDocumentGroupId,
  buildEngineeringDocumentId,
  compareEngineeringRevisions,
  engineeringDocumentDateMillis,
  engineeringDocumentStatusLabel,
  getEngineeringDocumentStatus,
  isEngineeringDocumentFileAllowed,
  normalizeEngineeringDocumentCode,
  normalizeEngineeringRevision,
} from '../../services/engineeringDocuments';

interface EngineeringDocumentsPanelProps {
  organizationId: string;
  units: Unit[];
  contracts: Contract[];
  currentUser: { uid: string; displayName?: string | null; email?: string | null } | null;
  currentUserName: string;
  canEdit: boolean;
  canApprove: boolean;
  logAudit: (module: string, action: string, details: string, targetId?: string) => Promise<void>;
}

const DOCUMENT_TYPES: Array<{ value: EngineeringDocumentKind; label: string }> = [
  { value: 'desenho', label: 'Desenho técnico' },
  { value: 'isometrico', label: 'Isométrico' },
  { value: 'pid', label: 'P&ID / Fluxograma' },
  { value: 'especificacao', label: 'Especificação técnica' },
  { value: 'mapa_solda', label: 'Mapa de solda' },
  { value: 'wps_pqr', label: 'WPS / PQR' },
  { value: 'certificado_material', label: 'Certificado de material' },
  { value: 'relatorio_ensaios', label: 'Relatório de ensaios / testes' },
  { value: 'procedimento', label: 'Procedimento de montagem' },
  { value: 'as_built', label: 'Documento As Built' },
  { value: 'outro', label: 'Outro documento técnico' },
];

const EVENT_LABELS: Record<EngineeringDocumentEventType, string> = {
  submitted_internal: 'Enviado para revisão interna',
  approved_internal: 'Aprovado internamente',
  rejected_internal: 'Ajustes solicitados na revisão interna',
  submitted_client: 'Envio ao cliente registrado',
  approved_client: 'Retorno de aprovação do cliente registrado',
  rejected_client: 'Retorno do cliente com ajustes registrados',
  marked_as_built: 'Documento marcado como As Built',
};

const inputClass = 'w-full rounded-lg border border-slate-700 bg-[#0B1220] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500';
const selectClass = inputClass;
const actionClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50';

function formatDate(value: unknown): string {
  const millis = engineeringDocumentDateMillis(value);
  return millis ? new Date(millis).toLocaleString('pt-BR') : 'Data não disponível';
}

function typeLabel(value: EngineeringDocumentKind): string {
  return DOCUMENT_TYPES.find((item) => item.value === value)?.label || 'Outro documento técnico';
}

function statusTone(eventType?: EngineeringDocumentEventType): string {
  if (eventType === 'approved_client' || eventType === 'marked_as_built') return 'border-emerald-700 bg-emerald-950/50 text-emerald-300';
  if (eventType === 'rejected_internal' || eventType === 'rejected_client') return 'border-rose-700 bg-rose-950/40 text-rose-300';
  if (eventType === 'submitted_client' || eventType === 'approved_internal') return 'border-cyan-700 bg-cyan-950/40 text-cyan-300';
  return 'border-amber-700 bg-amber-950/40 text-amber-300';
}

function latestEvent(events: EngineeringDocumentEvent[]): EngineeringDocumentEvent | undefined {
  return [...events].sort((a, b) => engineeringDocumentDateMillis(a.recordedAt) - engineeringDocumentDateMillis(b.recordedAt)).at(-1);
}

export const EngineeringDocumentsPanel: React.FC<EngineeringDocumentsPanelProps> = ({
  organizationId,
  units,
  contracts,
  currentUser,
  currentUserName,
  canEdit,
  canApprove,
  logAudit,
}) => {
  const [documents, setDocuments] = useState<EngineeringDocument[]>([]);
  const [events, setEvents] = useState<EngineeringDocumentEvent[]>([]);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [documentCode, setDocumentCode] = useState('');
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState<EngineeringDocumentKind | ''>('');
  const [revision, setRevision] = useState('');
  const [unitId, setUnitId] = useState('');
  const [contractId, setContractId] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    setDocuments([]);
    setEvents([]);
    setLoadError('');
    const docsQuery = query(collection(db, 'engineering_documents'), where('orgId', '==', organizationId));
    const eventsQuery = query(collection(db, 'engineering_document_events'), where('orgId', '==', organizationId));
    const stopDocuments = onSnapshot(
      docsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EngineeringDocument));
        rows.sort((a, b) => engineeringDocumentDateMillis(b.createdAt) - engineeringDocumentDateMillis(a.createdAt));
        setDocuments(rows);
        setLoadError('');
      },
      (error) => {
        console.error('Erro ao carregar documentos técnicos:', error);
        setLoadError('Não foi possível carregar os documentos técnicos. Confira o acesso à área Operações.');
      },
    );
    const stopEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EngineeringDocumentEvent)));
      },
      (error) => {
        console.error('Erro ao carregar histórico de documentos técnicos:', error);
        setLoadError('Não foi possível carregar o histórico de revisões e aprovações.');
      },
    );
    return () => {
      stopDocuments();
      stopEvents();
    };
  }, [organizationId]);

  const eventsByDocument = useMemo(() => {
    const grouped = new Map<string, EngineeringDocumentEvent[]>();
    for (const event of events) {
      const existing = grouped.get(event.documentId) || [];
      existing.push(event);
      grouped.set(event.documentId, existing);
    }
    for (const [key, value] of grouped) {
      grouped.set(key, value.sort((a, b) => engineeringDocumentDateMillis(a.recordedAt) - engineeringDocumentDateMillis(b.recordedAt)));
    }
    return grouped;
  }, [events]);

  const latestRevisionByGroup = useMemo(() => {
    const latest = new Map<string, EngineeringDocument>();
    for (const document of documents) {
      const current = latest.get(document.documentGroupId);
      const comparison = current ? compareEngineeringRevisions(document.revision, current.revision) : 1;
      if (!current || comparison > 0 || (comparison === 0 && engineeringDocumentDateMillis(document.createdAt) > engineeringDocumentDateMillis(current.createdAt))) {
        latest.set(document.documentGroupId, document);
      }
    }
    return new Map([...latest.entries()].map(([groupId, document]) => [groupId, document.id]));
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return documents.filter((document) => {
      const matchesContract = !contractFilter || document.contractId === contractFilter;
      const matchesText = !term || [
        document.documentCode,
        document.title,
        document.fileName,
        document.revision,
        typeLabel(document.documentType),
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
      return matchesContract && matchesText;
    });
  }, [documents, search, contractFilter]);

  const currentRevisionDocuments = documents.filter((document) => latestRevisionByGroup.get(document.documentGroupId) === document.id);
  const pendingInternal = currentRevisionDocuments.filter((document) => getEngineeringDocumentStatus(latestEvent(eventsByDocument.get(document.id) || [])?.eventType) === 'internal_review').length;
  const pendingClient = currentRevisionDocuments.filter((document) => getEngineeringDocumentStatus(latestEvent(eventsByDocument.get(document.id) || [])?.eventType) === 'client_review').length;
  const asBuiltCount = currentRevisionDocuments.filter((document) => getEngineeringDocumentStatus(latestEvent(eventsByDocument.get(document.id) || [])?.eventType) === 'as_built').length;

  const resetForm = () => {
    setDocumentCode('');
    setTitle('');
    setDocumentType('');
    setRevision('');
    setUnitId('');
    setContractId('');
    setDocumentDate('');
    setNotes('');
    setFile(null);
    const input = document.getElementById('engineering-document-file') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !currentUser) {
      alert('Seu perfil tem permissão somente para visualizar os documentos.');
      return;
    }
    if (!documentCode.trim() || !title.trim() || !documentType || !revision.trim() || !unitId || !contractId || !file) {
      alert('Preencha código, título, tipo, revisão, unidade, contrato e selecione o arquivo.');
      return;
    }
    if (!isEngineeringDocumentFileAllowed(file)) {
      alert('Arquivo não permitido. Use PDF, JPEG, PNG ou WEBP com até 20 MB.');
      return;
    }
    const selectedUnit = units.find((item) => item.id === unitId);
    const selectedContract = contracts.find((item) => item.id === contractId);
    if (!selectedUnit || !selectedContract) {
      alert('A unidade e o contrato precisam pertencer às opções disponíveis na empresa ativa.');
      return;
    }

    setIsUploading(true);
    setSuccessMessage('');
    try {
      const normalizedCode = normalizeEngineeringDocumentCode(documentCode);
      const normalizedRevision = normalizeEngineeringRevision(revision);
      const documentId = buildEngineeringDocumentId(organizationId, normalizedCode, normalizedRevision);
      const groupId = buildEngineeringDocumentGroupId(organizationId, normalizedCode);
      const existingRevisions = documents.filter((item) => item.documentGroupId === groupId);
      const highestRevision = existingRevisions.reduce<EngineeringDocument | null>((highest, item) => {
        if (!highest || compareEngineeringRevisions(item.revision, highest.revision) > 0) return item;
        return highest;
      }, null);
      if (existingRevisions.some((item) => item.id === documentId)) {
        throw new Error(`A revisão ${normalizedRevision} do documento ${normalizedCode} já está cadastrada.`);
      }
      if (highestRevision && compareEngineeringRevisions(normalizedRevision, highestRevision.revision) <= 0) {
        throw new Error(`A revisão informada (${normalizedRevision}) não é posterior à revisão atual (${highestRevision.revision}). Cadastre uma revisão superior para preservar a sequência.`);
      }

      const storageFileId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const filePath = `engineering-documents/${organizationId}/${documentId}/${storageFileId}`;
      await uploadBytes(ref(storage, filePath), file, { contentType: file.type });

      const documentRef = doc(db, 'engineering_documents', documentId);
      const eventRef = doc(collection(db, 'engineering_document_events'));
      const actorName = currentUser.displayName?.trim() || currentUserName.trim() || currentUser.email || 'Usuário AgueroFlow';
      const batch = writeBatch(db);
      batch.set(documentRef, {
        id: documentId,
        orgId: organizationId,
        unitId,
        contractId,
        documentGroupId: groupId,
        documentCode: normalizedCode,
        title: title.trim(),
        documentType,
        revision: normalizedRevision,
        filePath,
        fileName: file.name.trim().slice(0, 180),
        contentType: file.type,
        fileSize: file.size,
        ...(documentDate ? { documentDate } : {}),
        ...(notes.trim() ? { notes: notes.trim().slice(0, 1500) } : {}),
        createdByUid: currentUser.uid,
        createdByName: actorName,
        createdAt: serverTimestamp(),
      });
      batch.set(eventRef, {
        orgId: organizationId,
        unitId,
        contractId,
        documentId,
        eventType: 'submitted_internal',
        recordedByUid: currentUser.uid,
        recordedByName: actorName,
        recordedAt: serverTimestamp(),
        comment: 'Documento enviado para revisão interna.',
      });
      await batch.commit();

      setSuccessMessage(`Documento ${normalizedCode}, revisão ${normalizedRevision}, enviado para revisão interna.`);
      resetForm();
      try {
        await logAudit('Obras', 'Cadastrar documento técnico', `${normalizedCode} revisão ${normalizedRevision} vinculada ao contrato ${contractId}.`, documentId);
      } catch (auditError) {
        console.error('Documento salvo, mas a auditoria não foi registrada:', auditError);
        setSuccessMessage('Documento cadastrado. Atenção: o registro complementar de auditoria não foi concluído.');
      }
    } catch (error) {
      console.error('Erro ao cadastrar documento técnico:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível cadastrar o documento técnico.');
    } finally {
      setIsUploading(false);
    }
  };

  const recordEvent = async (
    item: EngineeringDocument,
    eventType: EngineeringDocumentEventType,
    extras: { comment?: string; clientName?: string; clientReference?: string } = {},
  ) => {
    if (!canApprove || !currentUser) {
      alert('A aprovação e o controle de fluxo exigem perfil Supervisor, Gerente ou Admin com acesso de edição em Operações.');
      return;
    }
    setActionBusyId(item.id);
    setSuccessMessage('');
    try {
      const history = eventsByDocument.get(item.id) || [];
      const previous = latestEvent(history);
      const actorName = currentUser.displayName?.trim() || currentUserName.trim() || currentUser.email || 'Usuário AgueroFlow';
      await addDoc(collection(db, 'engineering_document_events'), {
        orgId: organizationId,
        unitId: item.unitId,
        contractId: item.contractId,
        documentId: item.id,
        ...(previous ? { previousEventId: previous.id } : {}),
        eventType,
        recordedByUid: currentUser.uid,
        recordedByName: actorName,
        recordedAt: serverTimestamp(),
        ...(extras.comment ? { comment: extras.comment.trim().slice(0, 1500) } : {}),
        ...(extras.clientName ? { clientName: extras.clientName.trim().slice(0, 160) } : {}),
        ...(extras.clientReference ? { clientReference: extras.clientReference.trim().slice(0, 180) } : {}),
      });
      setSuccessMessage(EVENT_LABELS[eventType] + '.');
      try {
        await logAudit('Obras', EVENT_LABELS[eventType], `${item.documentCode} revisão ${item.revision}.`, item.id);
      } catch (auditError) {
        console.error('Movimentação salva, mas a auditoria não foi registrada:', auditError);
        setSuccessMessage('Movimentação registrada. Atenção: o registro complementar de auditoria não foi concluído.');
      }
    } catch (error) {
      console.error('Erro ao registrar movimentação do documento:', error);
      alert(error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.');
    } finally {
      setActionBusyId('');
    }
  };

  const handleWorkflowAction = async (item: EngineeringDocument, action: EngineeringDocumentEventType) => {
    const history = eventsByDocument.get(item.id) || [];
    const latest = latestEvent(history);
    const status = getEngineeringDocumentStatus(latest?.eventType);
    if (latestRevisionByGroup.get(item.documentGroupId) !== item.id) {
      alert('Esta é uma revisão anterior. O fluxo deve continuar na revisão mais recente.');
      return;
    }

    if (action === 'approved_internal') {
      if (status !== 'internal_review') return;
      if (window.confirm(`Confirmar aprovação interna do documento ${item.documentCode}, revisão ${item.revision}?`)) {
        await recordEvent(item, action);
      }
      return;
    }
    if (action === 'rejected_internal') {
      if (status !== 'internal_review') return;
      const comment = window.prompt('Informe os ajustes necessários. A justificativa é obrigatória:')?.trim() || '';
      if (comment) await recordEvent(item, action, { comment });
      return;
    }
    if (action === 'submitted_client') {
      if (status !== 'internal_approved') return;
      const clientName = window.prompt('Nome do contato/destinatário do cliente para quem o documento foi enviado:')?.trim() || '';
      if (!clientName) return;
      const reference = window.prompt('Informe a referência do envio ao cliente (e-mail, protocolo ou outro registro):')?.trim() || '';
      if (reference) await recordEvent(item, action, {
        clientName,
        clientReference: reference,
        comment: 'Envio ao cliente realizado fora do AgueroFlow e registrado para rastreabilidade.',
      });
      return;
    }
    if (action === 'approved_client' || action === 'rejected_client') {
      if (status !== 'client_review') return;
      const clientName = window.prompt('Nome do contato do cliente que retornou a análise:')?.trim() || '';
      if (!clientName) return;
      const reference = window.prompt('Referência do retorno (e-mail, protocolo, ata ou documento):')?.trim() || '';
      if (!reference) return;
      const comment = action === 'rejected_client'
        ? (window.prompt('Descreva os ajustes solicitados pelo cliente:')?.trim() || '')
        : (window.prompt('Observação do retorno do cliente (opcional):')?.trim() || '');
      if (action === 'rejected_client' && !comment) return;
      await recordEvent(item, action, { clientName, clientReference: reference, ...(comment ? { comment } : {}) });
      return;
    }
    if (action === 'marked_as_built') {
      if (status !== 'client_approved') return;
      if (window.confirm('Marcar esta revisão como documento As Built? Confira se o arquivo já representa a condição final executada.')) {
        await recordEvent(item, action, { comment: 'Condição final da obra conferida e registrada como As Built.' });
      }
    }
  };

  const downloadDocument = async (item: EngineeringDocument) => {
    try {
      const bytes = await getBytes(ref(storage, item.filePath), 20 * 1024 * 1024);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], { type: item.contentType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.fileName || `${item.documentCode}-rev-${item.revision}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      console.error('Erro ao baixar documento técnico:', error);
      alert('Não foi possível baixar o arquivo. Verifique sua permissão de leitura na área Operações.');
    }
  };

  const selectedDocument = documents.find((item) => item.id === selectedDocumentId) || null;
  const selectedHistory = selectedDocument ? eventsByDocument.get(selectedDocument.id) || [] : [];

  return (
    <div className="space-y-5 text-slate-100">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Engenharia e documentação técnica</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Controle de desenhos, isométricos, P&amp;IDs, revisões, aprovações e documentos As Built por unidade e contrato.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#121826] px-3 py-2 text-[11px] text-slate-300">
          <LockKeyhole className="h-4 w-4 text-cyan-400" />
          Arquivos privados com acesso por empresa e área
        </div>
      </div>

      {successMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {loadError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-800 bg-rose-950/30 px-3 py-2.5 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#121826] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Revisões atuais</p>
          <p className="mt-1 text-2xl font-bold text-white">{currentRevisionDocuments.length}</p>
        </div>
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/70">Revisão interna pendente</p>
          <p className="mt-1 text-2xl font-bold text-amber-200">{pendingInternal}</p>
        </div>
        <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/70">Retorno do cliente pendente</p>
          <p className="mt-1 text-2xl font-bold text-cyan-200">{pendingClient}</p>
        </div>
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/70">As Built</p>
          <p className="mt-1 text-2xl font-bold text-emerald-200">{asBuiltCount}</p>
        </div>
      </div>

      {canEdit ? (
        <form onSubmit={handleUpload} className="space-y-3 rounded-xl border border-slate-800 bg-[#121826] p-4">
          <div className="flex items-center gap-2">
            <FilePlus2 className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Cadastrar nova revisão</h3>
            <span className="ml-auto rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400">Registro imutável</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-[11px] text-slate-400">
              Código do documento *
              <input className={inputClass} value={documentCode} onChange={(e) => setDocumentCode(e.target.value)} maxLength={60} placeholder="Ex.: ISO-101" required />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400 md:col-span-2">
              Título / descrição *
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} placeholder="Ex.: Isométrico da linha de produto" required />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              Tipo de documento *
              <select className={selectClass} value={documentType} onChange={(e) => setDocumentType(e.target.value as EngineeringDocumentKind | '')} required>
                <option value="">Selecione</option>
                {DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              Revisão *
              <input className={inputClass} value={revision} onChange={(e) => setRevision(e.target.value)} maxLength={16} placeholder="Ex.: A, B, 00, 01" required />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              Unidade / local *
              <select className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="">Selecione a unidade</option>
                {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              Contrato / obra *
              <select className={selectClass} value={contractId} onChange={(e) => setContractId(e.target.value)} required>
                <option value="">Selecione o contrato</option>
                {contracts.map((item) => <option key={item.id} value={item.id}>{item.contractNumber ? `${item.contractNumber} — ${item.title}` : item.title}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              Data do documento
              <input className={inputClass} type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr_auto]">
            <label className="space-y-1 text-[11px] text-slate-400">
              Arquivo técnico (PDF ou imagem, até 20 MB) *
              <input id="engineering-document-file" className={inputClass} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
              {file && <span className="block truncate text-[10px] text-cyan-300">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              Observações
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1500} placeholder="Escopo, área, equipamento ou observação da emissão" />
            </label>
            <div className="flex items-end">
              <button type="submit" className={primaryClass} disabled={isUploading}>
                {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isUploading ? 'Enviando...' : 'Enviar para revisão'}
              </button>
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500">
            Cada revisão gera um registro novo e imutável. Arquivos CAD nativos (DWG/DXF/STEP) não são aceitos nesta primeira entrega; exporte a prancha para PDF antes de cadastrar.
          </p>
        </form>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-[#121826] p-4 text-xs text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          Seu perfil possui acesso de consulta. Cadastro e movimentações exigem Operações nível 2.
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-800 bg-[#121826] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Registro de documentos e revisões</h3>
            <span className="text-[10px] text-slate-500">{documents.length} revisão(ões)</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input className={inputClass + ' min-w-0 pl-9 sm:w-64'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código, título ou arquivo" />
            </div>
            <select className={selectClass + ' sm:w-56'} value={contractFilter} onChange={(e) => setContractFilter(e.target.value)}>
              <option value="">Todos os contratos</option>
              {contracts.map((item) => <option key={item.id} value={item.id}>{item.contractNumber || item.title}</option>)}
            </select>
          </div>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-300">Nenhum documento encontrado</p>
            <p className="mt-1 text-xs text-slate-500">Cadastre a primeira revisão ou ajuste os filtros da listagem.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocuments.map((item) => {
              const history = eventsByDocument.get(item.id) || [];
              const latest = latestEvent(history);
              const status = getEngineeringDocumentStatus(latest?.eventType);
              const isLatest = latestRevisionByGroup.get(item.documentGroupId) === item.id;
              const unitName = units.find((unit) => unit.id === item.unitId)?.name || 'Unidade não localizada';
              const contractName = contracts.find((contract) => contract.id === item.contractId)?.title || 'Contrato não localizado';
              const isSelected = selectedDocumentId === item.id;
              return (
                <div key={item.id} className="rounded-lg border border-slate-700 bg-[#0D1523]">
                  <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedDocumentId(isSelected ? '' : item.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{item.documentCode}</span>
                        <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">Rev. {item.revision}</span>
                        {!isLatest && <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">Revisão anterior</span>}
                        <span className={`rounded border px-2 py-0.5 text-[10px] ${statusTone(latest?.eventType)}`}>
                          {isLatest ? engineeringDocumentStatusLabel(status) : 'Substituído por revisão posterior'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{item.title}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{typeLabel(item.documentType)} · {unitName} · {contractName}</p>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button type="button" className={actionClass} onClick={() => void downloadDocument(item)}>
                        <Download className="h-3.5 w-3.5" /> Arquivo
                      </button>
                      <button type="button" className={actionClass} onClick={() => setSelectedDocumentId(isSelected ? '' : item.id)}>
                        <History className="h-3.5 w-3.5" /> Histórico ({history.length})
                      </button>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="space-y-3 border-t border-slate-800 p-3">
                      <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-400 md:grid-cols-3">
                        <p><strong className="text-slate-200">Arquivo:</strong> {item.fileName}</p>
                        <p><strong className="text-slate-200">Enviado por:</strong> {item.createdByName}</p>
                        <p><strong className="text-slate-200">Data de cadastro:</strong> {formatDate(item.createdAt)}</p>
                        {item.documentDate && <p><strong className="text-slate-200">Data do documento:</strong> {item.documentDate.split('-').reverse().join('/')}</p>}
                        {item.notes && <p className="md:col-span-2"><strong className="text-slate-200">Observações:</strong> {item.notes}</p>}
                      </div>

                      {isLatest && canApprove && (
                        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                          {status === 'internal_review' && (
                            <>
                              <button type="button" className={actionClass} disabled={!!actionBusyId} onClick={() => void handleWorkflowAction(item, 'approved_internal')}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Aprovar internamente
                              </button>
                              <button type="button" className={actionClass} disabled={!!actionBusyId} onClick={() => void handleWorkflowAction(item, 'rejected_internal')}>
                                <AlertCircle className="h-3.5 w-3.5 text-rose-400" /> Solicitar ajustes
                              </button>
                            </>
                          )}
                          {status === 'internal_approved' && (
                            <button type="button" className={actionClass} disabled={!!actionBusyId} onClick={() => void handleWorkflowAction(item, 'submitted_client')}>
                              Registrar envio ao cliente
                            </button>
                          )}
                          {status === 'client_review' && (
                            <>
                              <button type="button" className={actionClass} disabled={!!actionBusyId} onClick={() => void handleWorkflowAction(item, 'approved_client')}>
                                Registrar aprovação do cliente
                              </button>
                              <button type="button" className={actionClass} disabled={!!actionBusyId} onClick={() => void handleWorkflowAction(item, 'rejected_client')}>
                                Registrar ajustes do cliente
                              </button>
                            </>
                          )}
                          {status === 'client_approved' && (
                            <button type="button" className={actionClass} disabled={!!actionBusyId} onClick={() => void handleWorkflowAction(item, 'marked_as_built')}>
                              <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" /> Marcar como As Built
                            </button>
                          )}
                          {actionBusyId === item.id && <span className="self-center text-[10px] text-cyan-300">Registrando movimentação...</span>}
                        </div>
                      )}

                      {history.length > 0 ? (
                        <div className="space-y-2 border-t border-slate-800 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Histórico desta revisão</p>
                          {history.map((entry) => (
                            <div key={entry.id} className="flex flex-col gap-1 border-l-2 border-slate-700 pl-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold text-slate-200">{EVENT_LABELS[entry.eventType]}</p>
                                <p className="text-[10px] text-slate-500">{entry.recordedByName} · {formatDate(entry.recordedAt)}</p>
                                {entry.clientName && <p className="text-[10px] text-slate-400">Contato informado: {entry.clientName}</p>}
                                {entry.clientReference && <p className="text-[10px] text-slate-400">Referência: {entry.clientReference}</p>}
                                {entry.comment && <p className="mt-0.5 text-[11px] text-slate-400">{entry.comment}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-amber-300">Registro sem movimentação de fluxo localizada.</p>
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
          O controle registra ações realizadas no AgueroFlow. O envio ao cliente é apenas registrado, não dispara e-mail. A aprovação do cliente é um retorno informado e documentado por um usuário interno; não autentica o cliente nem equivale a assinatura digital certificada. A classificação As Built também depende de conferência humana do arquivo final.
        </p>
      </div>
    </div>
  );
};
