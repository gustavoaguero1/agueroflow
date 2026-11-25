import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Occurrence, OccurrenceStatus, Unit, Asset, WorkOrder } from '../types';
import {
  AlertTriangle,
  Plus,
  CheckCircle2,
  Clock,
  User,
  X,
  Search,
  Wrench,
  GitBranch,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  Activity,
  FileCheck,
} from 'lucide-react';

const OCCURRENCE_STATUS_FLOW: OccurrenceStatus[] = [
  'aberta',
  'analise',
  'acao_corretiva',
  'fechada',
  'verificacao',
];

const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, { label: string; color: string }> = {
  aberta: { label: 'Aberta', color: 'bg-red-950/70 text-red-400 border border-red-800/50' },
  analise: { label: 'Em Análise', color: 'bg-amber-950/70 text-amber-300 border border-amber-800/50' },
  acao_corretiva: { label: 'Ação Corretiva', color: 'bg-blue-950/70 text-blue-300 border border-blue-800/50' },
  fechada: { label: 'Fechada', color: 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50' },
  verificacao: { label: 'Verificação / Eficácia', color: 'bg-slate-800 text-slate-300 border border-slate-700' },
};

const ISHIKAWA_CATEGORIES = [
  { id: 'metodo', label: 'Método (Procedimento operacional incorreto ou ausente)' },
  { id: 'maquina', label: 'Máquina (Falha mecânica, desgaste ou equipamento desregulado)' },
  { id: 'mao_de_obra', label: 'Mão de Obra (Erro de execução ou falta de treinamento)' },
  { id: 'material', label: 'Material (Matéria-prima fora da especificação / lote defeituoso)' },
  { id: 'medicao', label: 'Medição (Instrumento descalibrado ou leitura equivocada)' },
  { id: 'meio_ambiente', label: 'Meio Ambiente (Condições do local, poeira, temperatura ou umidade)' },
];

export interface OccurrencesModuleProps {
  initialSearchQuery?: string;
  initialOccId?: string;
}

export const OccurrencesModule: React.FC<OccurrencesModuleProps> = ({
  initialSearchQuery = '',
  initialOccId,
}) => {
  const { user, organization, logAudit } = useAuth();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  const [selectedOcc, setSelectedOcc] = useState<Occurrence | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Occurrence['type']>('qualidade');
  const [urgency, setUrgency] = useState<Occurrence['urgency']>('media');
  const [unitId, setUnitId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [deadline, setDeadline] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Matriz GUT State (Gravidade, Urgência, Tendência)
  const [gutGravidade, setGutGravidade] = useState<number>(3);
  const [gutUrgencia, setGutUrgencia] = useState<number>(3);
  const [gutTendencia, setGutTendencia] = useState<number>(3);

  // Root Cause State (Ishikawa & 5 Porquês)
  const [showRootCauseSection, setShowRootCauseSection] = useState(false);
  const [rcCategory, setRcCategory] = useState<any>('metodo');
  const [rcWhy1, setRcWhy1] = useState('');
  const [rcWhy2, setRcWhy2] = useState('');
  const [rcWhy3, setRcWhy3] = useState('');
  const [rcWhy4, setRcWhy4] = useState('');
  const [rcWhy5, setRcWhy5] = useState('');
  const [rcActionPlan, setRcActionPlan] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (initialOccId && occurrences.length > 0) {
      const found = occurrences.find((o) => o.id === initialOccId);
      if (found) {
        setSelectedOcc(found);
      }
    }
  }, [initialOccId, occurrences]);

  useEffect(() => {
    if (!organization) return;

    const qOcc = query(collection(db, 'occurrences'), where('orgId', '==', organization.id));
    const unsubOcc = onSnapshot(qOcc, (snap) => {
      setOccurrences(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Occurrence)));
    });

    getDocs(query(collection(db, 'units'), where('orgId', '==', organization.id))).then((s) =>
      setUnits(s.docs.map((d) => ({ id: d.id, ...d.data() } as Unit)))
    );
    getDocs(query(collection(db, 'assets'), where('orgId', '==', organization.id))).then((s) =>
      setAssets(s.docs.map((d) => ({ id: d.id, ...d.data() } as Asset)))
    );
    getDocs(query(collection(db, 'work_orders'), where('orgId', '==', organization.id))).then((s) =>
      setWorkOrders(s.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)))
    );

    return () => unsubOcc();
  }, [organization]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    if (!unitId || !units.some((unit) => unit.id === unitId)) {
      alert('Selecione uma unidade cadastrada para registrar a ocorrência.');
      return;
    }
    setIsSubmitting(true);

    try {
      const occId = `occ_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newOcc: Occurrence = {
        id: occId,
        orgId: organization.id,
        unitId,
        assetId: assetId || undefined,
        orderId: orderId || undefined,
        title: title.trim(),
        description: description.trim(),
        type,
        urgency,
        status: 'aberta',
        reportedBy: user.displayName || user.email || 'Relator',
        assignedTo: assignedTo.trim() || undefined,
        deadline: deadline || undefined,
        gutScore: {
          gravidade: gutGravidade,
          urgencia: gutUrgencia,
          tendencia: gutTendencia,
          total: gutGravidade * gutUrgencia * gutTendencia,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'occurrences', occId), newOcc);
      await logAudit('Ocorrências', 'Abrir Ocorrência', `Ocorrência: ${title} (GUT: ${gutGravidade * gutUrgencia * gutTendencia})`, occId);

      setShowCreateModal(false);
      setTitle('');
      setDescription('');
    } catch (err) {
      console.error('Erro ao abrir ocorrência:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert Occurrence into a Corrective Work Order
  const handleGenerateCorrectiveOrder = async (occ: Occurrence) => {
    if (!organization || !user) return;
    if (!occ.unitId || !units.some((unit) => unit.id === occ.unitId)) {
      alert('Esta ocorrência não possui uma unidade válida. Corrija o vínculo antes de gerar a OS.');
      return;
    }
    if (occ.orderId) {
      alert(`Esta ocorrência já possui a OS ${occ.linkedOrderNumber || occ.orderId} vinculada.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const woId = `wo_corretiva_${occ.id}`;
      const woNumber = `OS-${new Date().getFullYear()}/${String(workOrders.length + 101).padStart(4, '0')}`;
      const createdAt = new Date().toISOString();
      const eventId = `${woId}_created`;
      const newOrder: WorkOrder = {
        id: woId,
        orgId: organization.id,
        unitId: occ.unitId,
        ...(occ.assetId ? { assetId: occ.assetId } : {}),
        orderNumber: woNumber,
        title: `[Ação Corretiva] ${occ.title}`,
        description: `Demanda corretiva industrial gerada a partir da Ocorrência ${occ.title}.\\n\\nDesvio identificado:\\n${occ.description}`,
        orderType: 'corretiva',
        type: 'corretiva',
        priority: occ.urgency === 'critica' ? 'critica' : occ.urgency === 'alta' ? 'alta' : 'media',
        status: 'planejada',
        requesterId: user.uid,
        requesterName: user.displayName || user.email || 'Qualidade / SMS',
        assignedTo: occ.assignedTo,
        isRework: occ.type === 'qualidade',
        createdAt,
        updatedAt: createdAt,
      };

      const occurrenceRef = doc(db, 'occurrences', occ.id);
      const unitRef = doc(db, 'units', occ.unitId);
      const assetRef = occ.assetId ? doc(db, 'assets', occ.assetId) : null;
      const orderRef = doc(db, 'work_orders', woId);
      const eventRef = doc(db, 'order_events', eventId);
      const updates: Partial<Occurrence> = {
        status: 'acao_corretiva',
        orderId: woId,
        linkedOrderNumber: woNumber,
        updatedAt: createdAt,
      };

      await runTransaction(db, async (tx) => {
        const reads = [tx.get(occurrenceRef), tx.get(unitRef), tx.get(orderRef)];
        if (assetRef) reads.push(tx.get(assetRef));
        const snapshots = await Promise.all(reads);
        const currentOccurrenceSnap = snapshots[0];
        const unitSnap = snapshots[1];
        const existingOrderSnap = snapshots[2];
        const currentOccurrence = currentOccurrenceSnap.data() as Occurrence | undefined;

        if (!currentOccurrenceSnap.exists() || currentOccurrence?.orgId !== organization.id) {
          throw new Error('A ocorrência não pertence à empresa selecionada ou não está mais disponível.');
        }
        if (currentOccurrence.orderId) {
          throw new Error(`A ocorrência já está vinculada à OS ${currentOccurrence.linkedOrderNumber || currentOccurrence.orderId}.`);
        }
        if (!unitSnap.exists() || unitSnap.data()?.orgId !== organization.id) {
          throw new Error('A unidade da ocorrência não pertence à empresa selecionada.');
        }
        if (assetRef) {
          const assetSnap = snapshots[3];
          const asset = assetSnap.data();
          if (!assetSnap.exists() || asset?.orgId !== organization.id || (asset.unitId && asset.unitId !== occ.unitId)) {
            throw new Error('O ativo vinculado não pertence à mesma unidade/empresa da ocorrência.');
          }
        }
        if (existingOrderSnap.exists()) {
          throw new Error('Já existe uma OS com o identificador desta ocorrência. Atualize os dados antes de tentar novamente.');
        }

        tx.set(orderRef, newOrder);
        tx.set(eventRef, {
          id: eventId,
          orgId: organization.id,
          orderId: woId,
          userId: user.uid,
          userName: user.displayName || user.email || 'Sistema',
          eventType: 'criacao',
          description: `OS ${woNumber} criada automaticamente a partir da Ocorrência: ${occ.title}`,
          newStatus: 'planejada',
          timestamp: createdAt,
        });
        tx.update(occurrenceRef, updates);
      });

      try {
        await logAudit(
          'Ocorrências',
          'Gerar OS Corretiva',
          `OS Corretiva ${woNumber} vinculada à ocorrência ${occ.title}`,
          occ.id
        );
      } catch (auditError) {
        console.warn('A OS foi criada, mas a auditoria complementar falhou:', auditError);
      }

      if (selectedOcc && selectedOcc.id === occ.id) setSelectedOcc({ ...selectedOcc, ...updates });
      alert(`Ordem de Serviço ${woNumber} gerada com sucesso! Ela já está disponível no menu de Ordens de Serviço.`);
    } catch (err) {
      console.error('Erro ao gerar OS Corretiva:', err);
      alert(err instanceof Error ? err.message : 'Erro ao gerar OS Corretiva.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Root Cause Analysis (5 Porquês / Ishikawa)
  const handleSaveRootCause = async () => {
    if (!selectedOcc || !organization) return;
    setIsSubmitting(true);
    try {
      const rcaData = {
        ishikawaCategory: rcCategory,
        why1: rcWhy1.trim(),
        why2: rcWhy2.trim(),
        why3: rcWhy3.trim(),
        why4: rcWhy4.trim(),
        why5: rcWhy5.trim(),
        actionPlan: rcActionPlan.trim(),
        completedAt: new Date().toISOString(),
      };

      const updates: Partial<Occurrence> = {
        rootCauseAnalysis: rcaData,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, 'occurrences', selectedOcc.id), updates);
      await logAudit('Ocorrências', 'Análise Causa Raiz', `Análise de 5 Porquês salva para ${selectedOcc.title}`, selectedOcc.id);

      setSelectedOcc({ ...selectedOcc, ...updates });
      alert('Análise de Causa Raiz (Ishikawa & 5 Porquês) gravada com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar causa raiz:', err);
      alert('Erro ao salvar análise de causa raiz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (newStatus: OccurrenceStatus) => {
    if (!selectedOcc || !organization) return;
    try {
      const updates: Partial<Occurrence> = {
        status: newStatus,
        resolutionNotes: resolutionNotes || selectedOcc.resolutionNotes,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'occurrences', selectedOcc.id), updates);
      await logAudit('Ocorrências', 'Atualizar Status', `Ocorrência ${selectedOcc.title} alterada para ${newStatus}`, selectedOcc.id);

      setSelectedOcc({ ...selectedOcc, ...updates });
    } catch (err) {
      console.error('Erro ao atualizar status da ocorrência:', err);
    }
  };

  useEffect(() => {
    if (selectedOcc) {
      setResolutionNotes(selectedOcc.resolutionNotes || '');
      if (selectedOcc.rootCauseAnalysis) {
        setRcCategory(selectedOcc.rootCauseAnalysis.ishikawaCategory || 'metodo');
        setRcWhy1(selectedOcc.rootCauseAnalysis.why1 || '');
        setRcWhy2(selectedOcc.rootCauseAnalysis.why2 || '');
        setRcWhy3(selectedOcc.rootCauseAnalysis.why3 || '');
        setRcWhy4(selectedOcc.rootCauseAnalysis.why4 || '');
        setRcWhy5(selectedOcc.rootCauseAnalysis.why5 || '');
        setRcActionPlan(selectedOcc.rootCauseAnalysis.actionPlan || '');
      } else {
        setRcCategory('metodo');
        setRcWhy1('');
        setRcWhy2('');
        setRcWhy3('');
        setRcWhy4('');
        setRcWhy5('');
        setRcActionPlan('');
      }
    }
  }, [selectedOcc]);

  const filtered = occurrences.filter((occ) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return occ.title.toLowerCase().includes(q) || occ.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Ocorrências & Não Conformidades</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro de desvios, análise de causa raiz (Ishikawa/5 Porquês) e conversão direta em OS corretiva.
          </p>
        </div>

        <button
          onClick={() => {
            setUnitId('');
            setAssetId(assets[0]?.id || '');
            setShowCreateModal(true);
          }}
          disabled={units.length === 0}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Registrar Ocorrência</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por título, desvio, código de ativo..."
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#121826] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Occurrences Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Título & Desvio</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Prioridade / GUT</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">OS Vinculada</th>
                <th className="py-3 px-4">Responsável / Prazo</th>
                <th className="py-3 px-4">Relator</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Nenhuma ocorrência encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((occ) => (
                  <tr
                    key={occ.id}
                    onClick={() => setSelectedOcc(occ)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-bold text-white">{occ.title}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs">{occ.description}</p>
                    </td>
                    <td className="py-3 px-4 font-mono uppercase text-slate-300">{occ.type}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            occ.urgency === 'critica'
                              ? 'bg-red-950/70 text-red-400 border border-red-800/50'
                              : occ.urgency === 'alta'
                              ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {occ.urgency}
                        </span>
                        {occ.gutScore && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300"
                            title={`G:${occ.gutScore.gravidade} U:${occ.gutScore.urgencia} T:${occ.gutScore.tendencia}`}
                          >
                            GUT {occ.gutScore.total}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${OCCURRENCE_STATUS_LABELS[occ.status]?.color}`}>
                        {OCCURRENCE_STATUS_LABELS[occ.status]?.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {occ.linkedOrderNumber || occ.orderId ? (
                        <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/50 text-blue-300 font-mono text-[10px] font-bold">
                          {occ.linkedOrderNumber || 'OS Vinculada'}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <p>{occ.assignedTo || 'Não atribuído'}</p>
                      {occ.deadline && <p className="text-[10px] text-slate-500">Prazo: {occ.deadline}</p>}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{occ.reportedBy}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOcc(occ);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold cursor-pointer"
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details & Workflow Modal */}
      {selectedOcc && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${OCCURRENCE_STATUS_LABELS[selectedOcc.status]?.color}`}>
                    {OCCURRENCE_STATUS_LABELS[selectedOcc.status]?.label}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                    Tipo: {selectedOcc.type}
                  </span>
                  {selectedOcc.gutScore && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-950/50 border border-amber-800/50 text-amber-300">
                      Score GUT: {selectedOcc.gutScore.total} (G:{selectedOcc.gutScore.gravidade} U:{selectedOcc.gutScore.urgencia} T:{selectedOcc.gutScore.tendencia})
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white mt-1.5">{selectedOcc.title}</h3>
              </div>
              <button onClick={() => setSelectedOcc(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Corrective Order Banner */}
              {selectedOcc.orderId ? (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-300 block">
                        Ordem de Serviço Corretiva Vinculada: {selectedOcc.linkedOrderNumber || selectedOcc.orderId}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        O desvio está em fase de intervenção operacional pela equipe de manutenção.
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-emerald-900/40 text-emerald-300 text-[10px] font-bold uppercase border border-emerald-700/50">
                    OS Aberta
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-white block flex items-center space-x-1.5">
                      <Wrench className="w-4 h-4 text-blue-400" />
                      <span>Gerar Ordem de Serviço Corretiva (1-Clique)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Cria automaticamente uma OS para mobilizar a equipe técnica da Aguero Inox e solucionar a falha.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateCorrectiveOrder(selectedOcc)}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer shrink-0 text-xs"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Gerar OS Corretiva Agora</span>
                  </button>
                </div>
              )}

              {/* Description */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <h4 className="font-bold text-slate-300 mb-1">Descrição do Desvio / Problema</h4>
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedOcc.description}</p>
              </div>

              {/* Status Workflow */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <label className="block font-bold text-slate-300 mb-2">Avançar Fluxo de Resolução:</label>
                <div className="flex flex-wrap gap-2">
                  {OCCURRENCE_STATUS_FLOW.map((s) => (
                    <button
                      key={s}
                      disabled={selectedOcc.status === s}
                      onClick={() => handleUpdateStatus(s)}
                      className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
                        selectedOcc.status === s
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {OCCURRENCE_STATUS_LABELS[s]?.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Root Cause Analysis (Ishikawa & 5 Whys) Accordion */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <GitBranch className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white">Análise de Causa Raiz Industrial (Ishikawa & 5 Porquês)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRootCauseSection(!showRootCauseSection)}
                    className="text-amber-400 text-xs font-semibold underline hover:text-amber-300 cursor-pointer"
                  >
                    {showRootCauseSection ? 'Ocultar' : 'Expandir Análise'}
                  </button>
                </div>

                {showRootCauseSection && (
                  <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Categoria Principal no Diagrama de Ishikawa (Espinha de Peixe)
                      </label>
                      <select
                        value={rcCategory}
                        onChange={(e) => setRcCategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                      >
                        {ISHIKAWA_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <span className="block font-semibold text-slate-300">Método dos 5 Porquês:</span>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">1º Por quê? (Sintoma imediato)</span>
                        <input
                          type="text"
                          value={rcWhy1}
                          onChange={(e) => setRcWhy1(e.target.value)}
                          placeholder="Por que ocorreu a anomalia inicial?"
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">2º Por quê?</span>
                        <input
                          type="text"
                          value={rcWhy2}
                          onChange={(e) => setRcWhy2(e.target.value)}
                          placeholder="Por que aconteceu o item 1?"
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">3º Por quê?</span>
                        <input
                          type="text"
                          value={rcWhy3}
                          onChange={(e) => setRcWhy3(e.target.value)}
                          placeholder="Por que aconteceu o item 2?"
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">4º Por quê?</span>
                        <input
                          type="text"
                          value={rcWhy4}
                          onChange={(e) => setRcWhy4(e.target.value)}
                          placeholder="Por que aconteceu o item 3?"
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">5º Por quê? (Causa Raiz Básica)</span>
                        <input
                          type="text"
                          value={rcWhy5}
                          onChange={(e) => setRcWhy5(e.target.value)}
                          placeholder="Qual é a causa raiz fundamental do problema?"
                          className="w-full px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-semibold text-amber-300"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        Plano de Ação Preventivo / Corretivo
                      </label>
                      <textarea
                        rows={2}
                        value={rcActionPlan}
                        onChange={(e) => setRcActionPlan(e.target.value)}
                        placeholder="O que será alterado no processo, treinamento ou manutenção para eliminar a reincidência?"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveRootCause}
                        disabled={isSubmitting}
                        className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold transition-all text-xs cursor-pointer shadow-md"
                      >
                        Salvar Análise de Causa Raiz
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Resolution Notes */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Notas de Ação Corretiva / Resolução</label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Descreva as medidas tomadas para mitigar o problema..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedOcc(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(selectedOcc.status)}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md"
                >
                  Salvar Observações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal with Matriz GUT */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl my-8">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Registrar Nova Ocorrência</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Título da Ocorrência *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Vazamento de fluido no trocador de calor inox"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300 mb-1">Unidade *</label>
                <select
                  required
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>Selecione a unidade</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Tipo de Ocorrência</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="qualidade">Qualidade / Não Conformidade</option>
                    <option value="seguranca">Segurança do Trabalho</option>
                    <option value="operacional">Operacional</option>
                    <option value="falha_equipamento">Falha de Equipamento</option>
                    <option value="ambiental">Meio Ambiente</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Urgência Inicial</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
              </div>

              {/* Matriz GUT Classificação */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Classificação Matriz GUT</span>
                  <span className="font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded text-[11px]">
                    Score Total: {gutGravidade * gutUrgencia * gutTendencia}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div>
                    <label className="block text-slate-400 mb-1">Gravidade (1 a 5)</label>
                    <select
                      value={gutGravidade}
                      onChange={(e) => setGutGravidade(parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="1">1 - Sem gravidade</option>
                      <option value="2">2 - Pouco grave</option>
                      <option value="3">3 - Grave</option>
                      <option value="4">4 - Muito grave</option>
                      <option value="5">5 - Extremamente grave</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Urgência (1 a 5)</label>
                    <select
                      value={gutUrgencia}
                      onChange={(e) => setGutUrgencia(parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="1">1 - Pode esperar</option>
                      <option value="2">2 - Pouco urgente</option>
                      <option value="3">3 - Urgente</option>
                      <option value="4">4 - Muito urgente</option>
                      <option value="5">5 - Imediata</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Tendência (1 a 5)</label>
                    <select
                      value={gutTendencia}
                      onChange={(e) => setGutTendencia(parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="1">1 - Não muda</option>
                      <option value="2">2 - Piora a longo prazo</option>
                      <option value="3">3 - Piora a médio prazo</option>
                      <option value="4">4 - Piora em curto prazo</option>
                      <option value="5">5 - Piora imediata</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição Detalhada do Fato *</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o que ocorreu, local exato e riscos identificados..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Responsável pela Ação</label>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="Nome do técnico ou equipe"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Prazo Limite</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Ocorrência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
