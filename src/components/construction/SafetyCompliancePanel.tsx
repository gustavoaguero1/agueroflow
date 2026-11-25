import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { AlertTriangle, Award, ClipboardList, PackageCheck, Plus, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { db, storage } from '../../firebase';
import { postJson } from '../../apiAuthFetch';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { SafetyPermitType } from '../../types/safety';
import {
  legacyFieldWorkerIdForEmployee,
  SAFETY_PPE_CATEGORIES,
  type SafetyComplianceSnapshot,
  type SafetyEmployee,
  type SafetyPpeCatalogItem,
  type SafetyPpeMovement,
  type SafetyTrainingCatalogItem,
  type SafetyTrainingRecord,
} from '../../services/safetyCompliance';

interface SafetyCompliancePanelProps {
  organizationId: string;
  canEdit: boolean;
  canManageCatalog: boolean;
  userId: string;
  actorName: string;
  onSnapshotChange: (snapshot: SafetyComplianceSnapshot) => void;
  logAudit?: (module: string, action: string, details: string, targetId?: string) => Promise<void>;
}

const BUILT_IN_TRAININGS = [
  { code: 'NR-35', title: 'Trabalho em Altura' },
  { code: 'NR-33', title: 'Espaço Confinado' },
  { code: 'NR-10', title: 'Segurança em Instalações Elétricas' },
];

const ACTIVITY_OPTIONS: Array<{ value: SafetyPermitType; label: string }> = [
  { value: 'trabalho_a_quente', label: 'Trabalho a quente' },
  { value: 'trabalho_em_altura', label: 'Trabalho em altura' },
  { value: 'espaco_confinado', label: 'Espaço confinado' },
  { value: 'eletrico', label: 'Serviço elétrico' },
  { value: 'icamento', label: 'Içamento de cargas' },
  { value: 'abertura_de_linha', label: 'Abertura de linha' },
  { value: 'geral', label: 'Atividade geral' },
];

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateIsExpired = (value: string) => !value || value < today();

export const SafetyCompliancePanel: React.FC<SafetyCompliancePanelProps> = ({
  organizationId, canEdit, canManageCatalog, userId, actorName, onSnapshotChange, logAudit,
}) => {
  const [employees, setEmployees] = useState<SafetyEmployee[]>([]);
  const [ppeCatalog, setPpeCatalog] = useState<SafetyPpeCatalogItem[]>([]);
  const [ppeMovements, setPpeMovements] = useState<SafetyPpeMovement[]>([]);
  const [trainingCatalog, setTrainingCatalog] = useState<SafetyTrainingCatalogItem[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<SafetyTrainingRecord[]>([]);
  const [legacyWorkers, setLegacyWorkers] = useState<Array<{
    id: string; rhEmployeeId?: string; nrCertifications?: Array<{
      nrCode: string; title: string; issueDate?: string; expirationDate?: string;
      documentUrl?: string; documentName?: string;
    }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'epis' | 'treinamentos' | 'historico'>('epis');
  const [showPpeForm, setShowPpeForm] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [replacementIssue, setReplacementIssue] = useState<SafetyPpeMovement | null>(null);
  const [replacementPpeId, setReplacementPpeId] = useState('');
  const [replacementNotes, setReplacementNotes] = useState('');
  const [replacementDate, setReplacementDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [ppeName, setPpeName] = useState('');
  const [ppeCategory, setPpeCategory] = useState<string>(SAFETY_PPE_CATEGORIES[0]);
  const [ppeCa, setPpeCa] = useState('');
  const [ppeCaExpiresAt, setPpeCaExpiresAt] = useState('');
  const [ppeActivities, setPpeActivities] = useState<SafetyPermitType[]>([]);
  const [ppeNotes, setPpeNotes] = useState('');

  const [deliveryEmployeeId, setDeliveryEmployeeId] = useState('');
  const [deliveryPpeId, setDeliveryPpeId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const [trainingCatalogCode, setTrainingCatalogCode] = useState('');
  const [trainingRecordCode, setTrainingRecordCode] = useState('');
  const [trainingCatalogTitle, setTrainingCatalogTitle] = useState('');
  const [trainingCatalogActivities, setTrainingCatalogActivities] = useState<SafetyPermitType[]>([]);
  const [trainingEmployeeId, setTrainingEmployeeId] = useState('');
  const [trainingIssueDate, setTrainingIssueDate] = useState(today());
  const [trainingExpirationDate, setTrainingExpirationDate] = useState('');
  const [trainingEntity, setTrainingEntity] = useState('');
  const [trainingCertificateNumber, setTrainingCertificateNumber] = useState('');
  const [trainingCertificateUrl, setTrainingCertificateUrl] = useState('');
  const [trainingCertificateName, setTrainingCertificateName] = useState('');
  const [trainingCertificateFile, setTrainingCertificateFile] = useState<File | null>(null);
  const [trainingNotes, setTrainingNotes] = useState('');

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const pendingSources = new Set(['rh', 'ppe', 'ppeMovements', 'trainingCatalog', 'trainingRecords', 'legacy']);
    const markLoaded = (source: string) => {
      pendingSources.delete(source);
      if (pendingSources.size === 0) setLoading(false);
    };
    const unsubscribers = [
      onSnapshot(query(collection(db, 'rh_directory'), where('orgId', '==', organizationId)), (snap) => {
        const list = snap.docs.map((item) => ({ ...item.data(), id: item.id } as SafetyEmployee));
        list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        setEmployees(list);
        markLoaded('rh');
      }, (err) => { console.error('Erro ao carregar diretório de RH para SMS:', err); markLoaded('rh'); }),
      onSnapshot(query(collection(db, 'safety_ppe_catalog'), where('orgId', '==', organizationId)), (snap) => {
        setPpeCatalog(snap.docs.map((item) => ({ ...item.data(), id: item.id } as SafetyPpeCatalogItem)));
        markLoaded('ppe');
      }, (err) => { console.error('Erro ao carregar catálogo de EPIs:', err); markLoaded('ppe'); }),
      onSnapshot(query(collection(db, 'safety_ppe_movements'), where('orgId', '==', organizationId)), (snap) => {
        setPpeMovements(snap.docs.map((item) => ({ ...item.data(), id: item.id } as SafetyPpeMovement)));
        markLoaded('ppeMovements');
      }, (err) => { console.error('Erro ao carregar histórico de EPIs:', err); markLoaded('ppeMovements'); }),
      onSnapshot(query(collection(db, 'safety_training_catalog'), where('orgId', '==', organizationId)), (snap) => {
        setTrainingCatalog(snap.docs.map((item) => ({ ...item.data(), id: item.id } as SafetyTrainingCatalogItem)));
        markLoaded('trainingCatalog');
      }, (err) => { console.error('Erro ao carregar catálogo de treinamentos:', err); markLoaded('trainingCatalog'); }),
      onSnapshot(query(collection(db, 'safety_training_records'), where('orgId', '==', organizationId)), (snap) => {
        setTrainingRecords(snap.docs.map((item) => ({ ...item.data(), id: item.id } as SafetyTrainingRecord)));
        markLoaded('trainingRecords');
      }, (err) => { console.error('Erro ao carregar certificados SMS:', err); markLoaded('trainingRecords'); }),
      onSnapshot(query(collection(db, 'field_workers'), where('orgId', '==', organizationId)), (snap) => {
        setLegacyWorkers(snap.docs.map((item) => ({ ...item.data(), id: item.id })) as typeof legacyWorkers);
        markLoaded('legacy');
      }, (err) => { console.error('Erro ao ler certificados legados de Obras:', err); markLoaded('legacy'); }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  // Employee directory is intentionally read from RH and not copied to a safety employee collection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const legacyTrainingRecords = useMemo<SafetyComplianceSnapshot['legacyTrainingRecords']>(() => {
    const rows: SafetyComplianceSnapshot['legacyTrainingRecords'] = [];
    for (const employee of employees) {
      const worker = legacyWorkers.find((item) => item.rhEmployeeId === employee.id
        || item.id === legacyFieldWorkerIdForEmployee(employee.id));
      for (const cert of worker?.nrCertifications || []) {
        rows.push({
          employeeId: employee.id, code: cert.nrCode || '', title: cert.title || cert.nrCode || 'Treinamento',
          issueDate: cert.issueDate, expirationDate: cert.expirationDate,
          documentUrl: cert.documentUrl, documentName: cert.documentName,
        });
      }
    }
    return rows;
  }, [employees, legacyWorkers]);

  const snapshot = useMemo<SafetyComplianceSnapshot>(() => ({
    loading, employees, ppeCatalog, ppeMovements, trainingCatalog, trainingRecords, legacyTrainingRecords,
  }), [loading, employees, ppeCatalog, ppeMovements, trainingCatalog, trainingRecords, legacyTrainingRecords]);

  useEffect(() => { onSnapshotChange(snapshot); }, [snapshot, onSnapshotChange]);

  const activeEmployees = employees.filter((item) => item.active && !item.dismissalDate);
  const activePpe = ppeCatalog.filter((item) => item.active);
  const activeTraining = trainingCatalog.filter((item) => item.active);
  const trainingOptions = [...BUILT_IN_TRAININGS, ...activeTraining]
    .reduce<Array<{ code: string; title: string }>>((items, item) => {
      if (!items.some((entry) => entry.code.toUpperCase() === item.code.toUpperCase())) items.push({ code: item.code, title: item.title });
      return items;
    }, []);

  const latestMovements = useMemo(() => {
    const latest = new Map<string, SafetyPpeMovement>();
    for (const item of [...ppeMovements].sort((a, b) => {
      const av = a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt
        ? (a.createdAt as { toMillis: () => number }).toMillis() : 0;
      const bv = b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt
        ? (b.createdAt as { toMillis: () => number }).toMillis() : 0;
      return av - bv || a.movementDate.localeCompare(b.movementDate);
    })) latest.set(item.employeeId + '|' + item.ppeId, item);
    return [...latest.values()];
  }, [ppeMovements]);

  const activeIssues = latestMovements.filter((item) => item.eventType === 'entregue');
  const trainingAlerts = trainingRecords.filter((item) => {
    const days = Math.ceil((new Date(item.expirationDate + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000);
    return !item.expirationDate || days <= 30;
  });
  const caAlerts = activePpe.filter((item) => dateIsExpired(item.caExpiresAt)
    || Math.ceil((new Date(item.caExpiresAt + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000) <= 30);

  const toggleActivity = (current: SafetyPermitType[], value: SafetyPermitType, setter: (next: SafetyPermitType[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const audit = async (action: string, details: string, targetId: string) => {
    if (!logAudit) return;
    try { await logAudit('Segurança & SMS', action, details, targetId); }
    catch (auditError) { console.error('Registro salvo, mas a auditoria de SMS falhou:', auditError); }
  };

  const createPpe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageCatalog || !userId || !organizationId) return;
    if (ppeName.trim().length < 2 || !ppeCa.trim() || !ppeCaExpiresAt || ppeActivities.length === 0) {
      setError('Informe nome, número e validade do CA e pelo menos uma atividade aplicável.');
      return;
    }
    setSaving(true); setError('');
    try {
      const ref = doc(collection(db, 'safety_ppe_catalog'));
      await setDoc(ref, {
        id: ref.id, orgId: organizationId, name: ppeName.trim(), category: ppeCategory,
        caNumber: ppeCa.trim(), caExpiresAt: ppeCaExpiresAt, requiredForPermitTypes: ppeActivities,
        notes: ppeNotes.trim(), active: true, createdByUid: userId,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await audit('Cadastrar EPI', ppeName.trim() + ' · CA ' + ppeCa.trim(), ref.id);
      setPpeName(''); setPpeCa(''); setPpeCaExpiresAt(''); setPpeActivities([]); setPpeNotes('');
      setShowPpeForm(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o EPI.'); }
    finally { setSaving(false); }
  };

  const toggleCatalogActive = async (kind: 'ppe' | 'training', id: string, active: boolean) => {
    if (!canManageCatalog) return;
    setSaving(true); setError('');
    try {
      const collectionName = kind === 'ppe' ? 'safety_ppe_catalog' : 'safety_training_catalog';
      await updateDoc(doc(db, collectionName, id), { active: !active, updatedAt: serverTimestamp() });
      await audit('Alterar catálogo de segurança', (kind === 'ppe' ? 'EPI ' : 'Treinamento ') + id + (!active ? ' ativado' : ' inativado'), id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar o cadastro.'); }
    finally { setSaving(false); }
  };

  const issuePpe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !userId || !organizationId) return;
    const employee = employees.find((item) => item.id === deliveryEmployeeId);
    const ppe = activePpe.find((item) => item.id === deliveryPpeId);
    if (!employee || !ppe || !employee.active || employee.dismissalDate) {
      setError('Selecione colaborador ativo do RH e um EPI ativo.');
      return;
    }
    if (!ppe.caNumber.trim() || dateIsExpired(ppe.caExpiresAt)) {
      setError('Entrega bloqueada: o EPI precisa ter CA informado e vigente.');
      return;
    }
    if (activeIssues.some((item) => item.employeeId === employee.id && item.ppeId === ppe.id)) {
      setError('Este EPI já consta como entregue ao colaborador. Registre a devolução antes de uma nova entrega.');
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await postJson('/api/safety/ppe-movements', {
        orgId: organizationId, employeeId: employee.id, ppeId: ppe.id,
        eventType: 'entregue', movementDate: deliveryDate, notes: deliveryNotes.trim(),
      });
      if (!response.ok) throw new Error(response.error || 'O servidor recusou a entrega do EPI.');
      await audit('Entregar EPI', ppe.name + ' para ' + employee.name, 'ppe_delivery');
      setShowDeliveryForm(false); setDeliveryNotes('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível registrar a entrega.'); }
    finally { setSaving(false); }
  };

  const returnPpe = async (issue: SafetyPpeMovement) => {
    if (!canEdit || !userId || !window.confirm('Confirmar a devolução de ' + issue.ppeName + ' por ' + issue.employeeName + '?')) return;
    setSaving(true); setError('');
    try {
      const response = await postJson('/api/safety/ppe-movements', {
        orgId: organizationId, employeeId: issue.employeeId, ppeId: issue.ppeId,
        eventType: 'devolvido', movementDate: today(), referenceMovementId: issue.id,
      });
      if (!response.ok) throw new Error(response.error || 'O servidor recusou a devolução do EPI.');
      await audit('Devolver EPI', issue.ppeName + ' de ' + issue.employeeName, issue.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível registrar a devolução.'); }
    finally { setSaving(false); }
  };

  const replacePpe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !userId || !replacementIssue || !organizationId) return;
    const newPpe = activePpe.find((item) => item.id === replacementPpeId);
    if (!newPpe || newPpe.id === replacementIssue.ppeId) {
      setError('Selecione um EPI ativo diferente do item atual.');
      return;
    }
    if (dateIsExpired(newPpe.caExpiresAt) || !newPpe.caNumber.trim()) {
      setError('O novo EPI não pode ser entregue com CA ausente ou vencido.');
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await postJson('/api/safety/ppe-movements/replace', {
        orgId: organizationId, employeeId: replacementIssue.employeeId,
        oldMovementId: replacementIssue.id, newPpeId: newPpe.id,
        movementDate: replacementDate, notes: replacementNotes.trim(),
      });
      if (!response.ok) throw new Error(response.error || 'O servidor recusou a substituição do EPI.');
      await audit('Substituir EPI', replacementIssue.ppeName + ' por ' + newPpe.name + ' · ' + replacementIssue.employeeName, replacementIssue.id);
      setReplacementIssue(null); setReplacementPpeId(''); setReplacementNotes('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir a substituição do EPI.'); }
    finally { setSaving(false); }
  };

  const createTrainingCatalog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageCatalog || !userId || !organizationId) return;
    if (trainingCatalogCode.trim().length < 2 || trainingCatalogTitle.trim().length < 3 || trainingCatalogActivities.length === 0) {
      setError('Informe código, título e atividades que exigem esse treinamento.');
      return;
    }
    setSaving(true); setError('');
    try {
      const ref = doc(collection(db, 'safety_training_catalog'));
      await setDoc(ref, {
        id: ref.id, orgId: organizationId, code: trainingCatalogCode.trim().toUpperCase(),
        title: trainingCatalogTitle.trim(), requiredForPermitTypes: trainingCatalogActivities,
        active: true, createdByUid: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await audit('Cadastrar requisito de treinamento', trainingCatalogCode.trim().toUpperCase() + ' · ' + trainingCatalogTitle.trim(), ref.id);
      setTrainingCatalogCode(''); setTrainingCatalogTitle(''); setTrainingCatalogActivities([]); setShowTrainingForm(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o requisito.'); }
    finally { setSaving(false); }
  };

  const createTrainingRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !userId || !organizationId) return;
    const employee = employees.find((item) => item.id === trainingEmployeeId);
    const course = trainingOptions.find((item) => item.code === trainingRecordCode);
    if (!employee || !course || !trainingIssueDate || !trainingExpirationDate
      || trainingExpirationDate < trainingIssueDate) {
      setError('Selecione o colaborador e o treinamento e informe emissão/vencimento válidos.');
      return;
    }
    if (trainingCertificateFile && (
      !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(trainingCertificateFile.type)
      || trainingCertificateFile.size <= 0 || trainingCertificateFile.size > 20 * 1024 * 1024
    )) {
      setError('Anexe um PDF ou imagem JPG/PNG/WebP de até 20 MB.');
      return;
    }
    setSaving(true); setError('');
    try {
      const ref = doc(collection(db, 'safety_training_records'));
      let certificateUrl = trainingCertificateUrl.trim();
      let certificateName = trainingCertificateName.trim();
      if (trainingCertificateFile) {
        const safeName = trainingCertificateFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileRef = storageRef(storage, 'safety-certificates/' + organizationId + '/' + employee.id + '/' + ref.id + '_' + safeName);
        const uploaded = await uploadBytes(fileRef, trainingCertificateFile, { contentType: trainingCertificateFile.type });
        certificateUrl = await getDownloadURL(uploaded.ref);
        certificateName = trainingCertificateFile.name;
      }
      await setDoc(ref, {
        id: ref.id, orgId: organizationId, employeeId: employee.id, employeeName: employee.name,
        trainingCode: course.code, title: course.title, issueDate: trainingIssueDate,
        expirationDate: trainingExpirationDate, issuingEntity: trainingEntity.trim(),
        certificateNumber: trainingCertificateNumber.trim(), certificateUrl,
        certificateName, notes: trainingNotes.trim(),
        createdByUid: userId, createdByName: actorName, recordedAt: serverTimestamp(),
      });
      await audit('Registrar certificado', course.code + ' para ' + employee.name, ref.id);
      setTrainingEmployeeId(''); setTrainingRecordCode(''); setTrainingIssueDate(today()); setTrainingExpirationDate('');
      setTrainingEntity(''); setTrainingCertificateNumber(''); setTrainingCertificateUrl('');
      setTrainingCertificateName(''); setTrainingCertificateFile(null); setTrainingNotes('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível registrar o certificado.'); }
    finally { setSaving(false); }
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500';
  const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50';
  const activityChecks = (selected: SafetyPermitType[], setter: (next: SafetyPermitType[]) => void) => (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {ACTIVITY_OPTIONS.map((activity) => (
        <label key={activity.value} className="flex items-center gap-2 text-[10px] text-slate-300">
          <input type="checkbox" checked={selected.includes(activity.value)}
            onChange={() => toggleActivity(selected, activity.value, setter)} className="accent-rose-500" />
          {activity.label}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-[#121826] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Conformidade da equipe</h3>
          <p className="mt-1 max-w-3xl text-[11px] text-slate-400">EPIs, Certificados de Aprovação, treinamentos e bloqueios por colaborador, vinculados ao diretório oficial do RH.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] text-slate-300">{activeEmployees.length} colaboradores ativos no RH</span>
          <span className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-2.5 py-1.5 text-[10px] text-rose-300">{caAlerts.length} alertas de CA</span>
          <span className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-2.5 py-1.5 text-[10px] text-amber-300">{trainingAlerts.length} certificados para atenção</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button type="button" onClick={() => setActiveTab('epis')} className={activeTab === 'epis' ? 'rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white' : buttonClass}><PackageCheck className="h-3.5 w-3.5" /> EPIs e entregas</button>
        <button type="button" onClick={() => setActiveTab('treinamentos')} className={activeTab === 'treinamentos' ? 'rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white' : buttonClass}><Award className="h-3.5 w-3.5" /> Treinamentos e NRs</button>
        <button type="button" onClick={() => setActiveTab('historico')} className={activeTab === 'historico' ? 'rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white' : buttonClass}><ClipboardList className="h-3.5 w-3.5" /> Histórico e alertas</button>
      </div>

      {error && <div className="rounded-lg border border-rose-800/70 bg-rose-950/30 p-3 text-[11px] text-rose-200">{error}</div>}
      {loading ? <p className="py-8 text-center text-xs text-slate-400">Carregando RH e registros de segurança...</p> : null}

      {!loading && activeTab === 'epis' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2">
            <div><h4 className="text-xs font-bold text-white">Catálogo de EPIs</h4><p className="text-[10px] text-slate-500">Cada item exige CA e validade informados; a atividade define a obrigatoriedade.</p></div>
            {canManageCatalog && <button type="button" onClick={() => setShowPpeForm((value) => !value)} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Cadastrar EPI</button>}
          </div>

          {showPpeForm && (
            <form onSubmit={createPpe} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 sm:grid-cols-2">
              <label className="text-[10px] text-slate-400">Nome do EPI<input value={ppeName} onChange={(e) => setPpeName(e.target.value)} required maxLength={120} className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Categoria<select value={ppeCategory} onChange={(e) => setPpeCategory(e.target.value)} className={inputClass}>{SAFETY_PPE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Número do CA<input value={ppeCa} onChange={(e) => setPpeCa(e.target.value)} required maxLength={40} className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Validade do CA<input type="date" value={ppeCaExpiresAt} onChange={(e) => setPpeCaExpiresAt(e.target.value)} required className={inputClass} /></label>
              <div className="sm:col-span-2"><p className="mb-2 text-[10px] text-slate-400">Atividades que exigem este EPI</p>{activityChecks(ppeActivities, setPpeActivities)}</div>
              <label className="text-[10px] text-slate-400 sm:col-span-2">Observações<input value={ppeNotes} onChange={(e) => setPpeNotes(e.target.value)} maxLength={500} className={inputClass} /></label>
              <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowPpeForm(false)} className={buttonClass}>Cancelar</button><button disabled={saving} className="rounded-lg bg-rose-600 px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50">Salvar EPI</button></div>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-slate-900 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">EPI / categoria</th><th className="px-3 py-2">CA</th><th className="px-3 py-2">Validade</th><th className="px-3 py-2">Obrigatório para</th><th className="px-3 py-2">Cadastro</th><th className="px-3 py-2">Ação</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {ppeCatalog.map((item) => <tr key={item.id} className="text-slate-300"><td className="px-3 py-2"><p className="font-semibold text-white">{item.name}</p><p className="text-[10px] text-slate-500">{item.category}</p></td><td className="px-3 py-2">{item.caNumber || '—'}</td><td className="px-3 py-2"><span className={dateIsExpired(item.caExpiresAt) ? 'font-bold text-rose-300' : 'text-slate-300'}>{item.caExpiresAt || 'Sem data'}</span></td><td className="px-3 py-2">{item.requiredForPermitTypes.map((type) => ACTIVITY_OPTIONS.find((o) => o.value === type)?.label || type).join(', ')}</td><td className="px-3 py-2">{item.active ? <span className="text-emerald-300">Ativo</span> : <span className="text-slate-500">Inativo</span>}</td><td className="px-3 py-2">{canManageCatalog && <button type="button" disabled={saving} onClick={() => toggleCatalogActive('ppe', item.id, item.active)} className="text-[10px] text-rose-300">{item.active ? 'Inativar' : 'Ativar'}</button>}</td></tr>)}
                {ppeCatalog.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-[11px] text-slate-500">Nenhum EPI cadastrado para esta empresa.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <div><h4 className="text-xs font-bold text-white">Entregas individuais</h4><p className="text-[10px] text-slate-500">A entrega e a devolução ficam no histórico, sem sobrescrever movimentações anteriores.</p></div>
            {canEdit && <button type="button" onClick={() => setShowDeliveryForm((value) => !value)} className={buttonClass}><Plus className="h-3.5 w-3.5" /> Registrar entrega</button>}
          </div>
          {showDeliveryForm && (
            <form onSubmit={issuePpe} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 sm:grid-cols-2">
              <label className="text-[10px] text-slate-400">Colaborador do RH<select value={deliveryEmployeeId} onChange={(e) => setDeliveryEmployeeId(e.target.value)} required className={inputClass}><option value="">Selecione</option>{activeEmployees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role || 'Colaborador'}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">EPI<select value={deliveryPpeId} onChange={(e) => setDeliveryPpeId(e.target.value)} required className={inputClass}><option value="">Selecione</option>{activePpe.map((item) => <option key={item.id} value={item.id}>{item.name} · CA {item.caNumber}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Data da entrega<input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Observação<input value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} maxLength={500} className={inputClass} /></label>
              <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowDeliveryForm(false)} className={buttonClass}>Cancelar</button><button disabled={saving} className="rounded-lg bg-rose-600 px-4 py-2 text-[10px] font-bold text-white">Confirmar entrega</button></div>
            </form>
          )}
          {replacementIssue && (
            <form onSubmit={replacePpe} className="grid grid-cols-1 gap-3 rounded-xl border border-cyan-900/60 bg-cyan-950/10 p-4 sm:grid-cols-2">
              <div className="text-[10px] text-slate-300 sm:col-span-2"><p className="font-semibold text-white">Substituir {replacementIssue.ppeName}</p><p className="mt-1 text-slate-500">{replacementIssue.employeeName} · a devolução do item atual e a entrega do novo serão gravadas juntas.</p></div>
              <label className="text-[10px] text-slate-400">Novo EPI<select value={replacementPpeId} onChange={(e) => setReplacementPpeId(e.target.value)} required className={inputClass}><option value="">Selecione</option>{activePpe.filter((item) => item.id !== replacementIssue.ppeId).map((item) => <option key={item.id} value={item.id}>{item.name} · CA {item.caNumber}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Data da substituição<input type="date" value={replacementDate} onChange={(e) => setReplacementDate(e.target.value)} required className={inputClass} /></label>
              <label className="text-[10px] text-slate-400 sm:col-span-2">Motivo / observação<input value={replacementNotes} onChange={(e) => setReplacementNotes(e.target.value)} maxLength={500} className={inputClass} placeholder="Desgaste, dano, troca de tamanho..." /></label>
              <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setReplacementIssue(null)} className={buttonClass}>Cancelar</button><button disabled={saving} className="rounded-lg bg-cyan-700 px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50">Confirmar substituição</button></div>
            </form>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-slate-900 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Colaborador</th><th className="px-3 py-2">EPI</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Ação</th></tr></thead>
              <tbody className="divide-y divide-slate-800">{activeIssues.map((item) => {
                const ca = ppeCatalog.find((entry) => entry.id === item.ppeId);
                const caExpired = !ca || dateIsExpired(ca.caExpiresAt);
                return <tr key={item.id} className="text-slate-300"><td className="px-3 py-2 font-semibold text-white">{item.employeeName}</td><td className="px-3 py-2">{item.ppeName}</td><td className="px-3 py-2">{item.movementDate}</td><td className="px-3 py-2">{caExpired ? <span className="text-rose-300">CA vencido / ausente</span> : <span className="text-emerald-300">Em uso · CA válido</span>}</td><td className="px-3 py-2">{canEdit && <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => returnPpe(item)} className="text-[10px] text-amber-300"><RotateCcw className="mr-1 inline h-3 w-3" /> Devolver</button><button type="button" disabled={saving} onClick={() => { setReplacementIssue(item); setReplacementPpeId(''); setReplacementNotes(''); }} className="text-[10px] text-cyan-300">Substituir</button></div>}</td></tr>;
              })}{activeIssues.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[11px] text-slate-500">Nenhum EPI atualmente entregue.</td></tr>}</tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && activeTab === 'treinamentos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2"><div><h4 className="text-xs font-bold text-white">Matriz de treinamentos exigidos</h4><p className="text-[10px] text-slate-500">NR-35, NR-33 e NR-10 são exigidos automaticamente nas atividades correspondentes; os requisitos adicionais são configuráveis.</p></div>
            {canManageCatalog && <button type="button" onClick={() => setShowTrainingForm((value) => !value)} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Novo requisito</button>}
          </div>
          {showTrainingForm && <form onSubmit={createTrainingCatalog} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 sm:grid-cols-2">
            <label className="text-[10px] text-slate-400">Código (NR/qualificação)<input value={trainingCatalogCode} onChange={(e) => setTrainingCatalogCode(e.target.value)} required maxLength={40} placeholder="Ex.: NR-11 / RIGGER" className={inputClass} /></label>
            <label className="text-[10px] text-slate-400">Título<input value={trainingCatalogTitle} onChange={(e) => setTrainingCatalogTitle(e.target.value)} required maxLength={140} className={inputClass} /></label>
            <div className="sm:col-span-2"><p className="mb-2 text-[10px] text-slate-400">Atividades em que será obrigatório</p>{activityChecks(trainingCatalogActivities, setTrainingCatalogActivities)}</div>
            <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowTrainingForm(false)} className={buttonClass}>Cancelar</button><button disabled={saving} className="rounded-lg bg-rose-600 px-4 py-2 text-[10px] font-bold text-white">Salvar requisito</button></div>
          </form>}

          <div className="overflow-x-auto rounded-lg border border-slate-800"><table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-900 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Treinamento / qualificação</th><th className="px-3 py-2">Obrigatório para</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Ação</th></tr></thead>
            <tbody className="divide-y divide-slate-800">{activeTraining.map((item) => <tr key={item.id} className="text-slate-300"><td className="px-3 py-2 font-bold text-amber-300">{item.code}</td><td className="px-3 py-2 text-white">{item.title}</td><td className="px-3 py-2">{item.requiredForPermitTypes.map((type) => ACTIVITY_OPTIONS.find((o) => o.value === type)?.label || type).join(', ')}</td><td className="px-3 py-2 text-emerald-300">Ativo</td><td className="px-3 py-2">{canManageCatalog && <button type="button" disabled={saving} onClick={() => toggleCatalogActive('training', item.id, item.active)} className="text-[10px] text-rose-300">Inativar</button>}</td></tr>)}
            {trainingCatalog.filter((item) => !item.active).map((item) => <tr key={item.id} className="text-slate-500"><td className="px-3 py-2 font-bold">{item.code}</td><td className="px-3 py-2">{item.title}</td><td className="px-3 py-2">{item.requiredForPermitTypes.join(', ')}</td><td className="px-3 py-2">Inativo</td><td className="px-3 py-2">{canManageCatalog && <button type="button" disabled={saving} onClick={() => toggleCatalogActive('training', item.id, item.active)} className="text-[10px] text-emerald-300">Ativar</button>}</td></tr>)}
            {trainingCatalog.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[11px] text-slate-500">Nenhum requisito adicional configurado. NR-35, NR-33 e NR-10 já são aplicados às atividades correspondentes.</td></tr>}
            </tbody></table></div>

          <div className="border-t border-slate-800 pt-4"><h4 className="text-xs font-bold text-white">Certificados individuais</h4>
            {canEdit && <form onSubmit={createTrainingRecord} className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 sm:grid-cols-2">
              <label className="text-[10px] text-slate-400">Colaborador do RH<select value={trainingEmployeeId} onChange={(e) => setTrainingEmployeeId(e.target.value)} required className={inputClass}><option value="">Selecione</option>{activeEmployees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role || 'Colaborador'}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Treinamento<select value={trainingRecordCode} onChange={(e) => setTrainingRecordCode(e.target.value)} required className={inputClass}><option value="">Selecione</option>{trainingOptions.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.title}</option>)}</select></label>
              <label className="text-[10px] text-slate-400">Data de emissão<input type="date" value={trainingIssueDate} onChange={(e) => setTrainingIssueDate(e.target.value)} required className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Data de vencimento<input type="date" value={trainingExpirationDate} onChange={(e) => setTrainingExpirationDate(e.target.value)} required className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Entidade / instrutor<input value={trainingEntity} onChange={(e) => setTrainingEntity(e.target.value)} maxLength={160} className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Número do certificado<input value={trainingCertificateNumber} onChange={(e) => setTrainingCertificateNumber(e.target.value)} maxLength={100} className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Link do certificado (PDF/arquivo)<input type="url" value={trainingCertificateUrl} onChange={(e) => setTrainingCertificateUrl(e.target.value)} maxLength={1000} placeholder="https://..." className={inputClass} /></label>
              <label className="text-[10px] text-slate-400">Nome do arquivo<input value={trainingCertificateName} onChange={(e) => setTrainingCertificateName(e.target.value)} maxLength={180} className={inputClass} /></label>
              <label className="text-[10px] text-slate-400 sm:col-span-2">Observações<input value={trainingNotes} onChange={(e) => setTrainingNotes(e.target.value)} maxLength={700} className={inputClass} /></label>
              <label className="text-[10px] text-slate-400 sm:col-span-2">Anexar certificado (PDF ou imagem, até 20 MB)
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setTrainingCertificateFile(e.target.files?.[0] || null)} className={inputClass} />
                {trainingCertificateFile && <span className="mt-1 block text-[10px] text-cyan-300">{trainingCertificateFile.name}</span>}
              </label>
              <div className="flex justify-end sm:col-span-2"><button disabled={saving || trainingOptions.length === 0} className="rounded-lg bg-rose-600 px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50">Registrar certificado</button></div>
            </form>}
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-900 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Colaborador</th><th className="px-3 py-2">NR / qualificação</th><th className="px-3 py-2">Emissão</th><th className="px-3 py-2">Validade</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Origem</th></tr></thead>
              <tbody className="divide-y divide-slate-800">{[...trainingRecords.map((item) => ({...item, sourceLabel:'SMS'})), ...legacyTrainingRecords.map((item, index) => ({id:'legacy_'+item.employeeId+'_'+index, employeeName:employees.find((e) => e.id === item.employeeId)?.name || item.employeeId, trainingCode:item.code, title:item.title, issueDate:item.issueDate || '', expirationDate:item.expirationDate || '', certificateUrl:item.documentUrl || '', certificateName:item.documentName || '', sourceLabel:'RH / Obras'}))].map((item) => <tr key={item.id} className="text-slate-300"><td className="px-3 py-2 font-semibold text-white">{item.employeeName}</td><td className="px-3 py-2"><p className="font-bold text-amber-300">{item.trainingCode}</p><p className="text-[10px] text-slate-500">{item.title}</p></td><td className="px-3 py-2">{item.issueDate || '—'}</td><td className="px-3 py-2"><span className={dateIsExpired(item.expirationDate) ? 'font-bold text-rose-300' : 'text-emerald-300'}>{item.expirationDate || 'Sem validade'}</span></td><td className="px-3 py-2">{item.certificateUrl ? <a href={item.certificateUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">{item.certificateName || 'Abrir certificado'}</a> : '—'}</td><td className="px-3 py-2 text-[10px] text-slate-500">{item.sourceLabel}</td></tr>)}
              {trainingRecords.length + legacyTrainingRecords.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-[11px] text-slate-500">Nenhum certificado registrado.</td></tr>}</tbody></table></div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'historico' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-3"><h4 className="flex items-center gap-2 text-xs font-bold text-rose-200"><ShieldAlert className="h-4 w-4" /> EPIs com CA vencido ou próximo</h4><div className="mt-2 space-y-1">{caAlerts.map((item) => <p key={item.id} className="text-[10px] text-slate-300">{item.name} · CA {item.caNumber} · validade {item.caExpiresAt || 'não informada'}</p>)}{caAlerts.length === 0 && <p className="text-[10px] text-emerald-300">Nenhum alerta de CA no catálogo.</p>}</div></div>
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3"><h4 className="flex items-center gap-2 text-xs font-bold text-amber-200"><AlertTriangle className="h-4 w-4" /> Treinamentos vencidos ou a vencer</h4><div className="mt-2 space-y-1">{trainingAlerts.map((item) => <p key={item.id} className="text-[10px] text-slate-300">{item.employeeName} · {item.trainingCode} · validade {item.expirationDate || 'não informada'}</p>)}{trainingAlerts.length === 0 && <p className="text-[10px] text-emerald-300">Nenhum certificado vencido ou com vencimento em 30 dias.</p>}</div></div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-800"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-900 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Colaborador</th><th className="px-3 py-2">EPI</th><th className="px-3 py-2">Movimentação</th><th className="px-3 py-2">Responsável</th></tr></thead><tbody className="divide-y divide-slate-800">{ppeMovements.map((item) => <tr key={item.id} className="text-slate-300"><td className="px-3 py-2">{item.movementDate}</td><td className="px-3 py-2">{item.employeeName}</td><td className="px-3 py-2">{item.ppeName}</td><td className="px-3 py-2">{item.eventType === 'entregue' ? <span className="text-emerald-300">Entregue</span> : <span className="text-amber-300">Devolvido</span>}</td><td className="px-3 py-2">{item.createdByName || '—'}</td></tr>)}{ppeMovements.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[11px] text-slate-500">Sem movimentações de EPIs.</td></tr>}</tbody></table></div>
        </div>
      )}

      {!canEdit && <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-[10px] text-slate-400">Consulta liberada. Para registrar entregas e certificados, é necessário Operações nível 2. Para alterar os catálogos de requisitos, é necessário perfil de Supervisor, Gerente ou Admin.</p>}
      <p className="border-t border-slate-800 pt-3 text-[10px] text-slate-500">Dados de treinamento legados são consultados do cadastro de Obras; novos certificados e movimentações SMS ficam em histórico próprio e imutável. A validade e a exigência devem ser conferidas pelo responsável de Segurança antes da autorização na planta.</p>
    </div>
  );
};
