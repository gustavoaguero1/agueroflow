import React, { useState, useEffect } from 'react';
import { QualityCommissioningPanel } from '../components/quality/QualityCommissioningPanel';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { apiFetch } from '../apiAuthFetch';
import { Inspection, Unit, Asset, WorkOrder } from '../types';
import {
  CheckSquare,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building,
  User,
  X,
  ArrowRight,
} from 'lucide-react';

export const InspectionsModule: React.FC = () => {
  const { user, organization, logAudit, contracts, areaLevel, isSupervisorOrAbove, isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState<'inspecoes' | 'qualidade'>('inspecoes');
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [findings, setFindings] = useState('');
  const [result, setResult] = useState<Inspection['result']>('pendente');
  const [inspectionToComplete, setInspectionToComplete] = useState<Inspection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Occurrence creation quick prompt if non-conformant
  const [nonConformantPrompt, setNonConformantPrompt] = useState<Inspection | null>(null);

  useEffect(() => {
    if (!organization) return;

    const q = query(collection(db, 'inspections'), where('orgId', '==', organization.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Inspection));
      setInspections(list);
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

    return () => unsub();
  }, [organization]);

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    if (!unitId || !units.some((unit) => unit.id === unitId)) {
      alert('Selecione uma unidade válida para agendar a inspeção.');
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await apiFetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: organization.id,
          unitId,
          ...(assetId ? { assetId } : {}),
          ...(orderId ? { orderId } : {}),
          title: title.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Não foi possível agendar a inspeção.');
      }

      const created = payload.inspection as Inspection;
      setInspections((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      try {
        await logAudit('Inspeções', 'Agendar Inspeção', `Inspeção agendada: ${created.title}`, created.id);
      } catch (auditError) {
        console.warn('A inspeção foi agendada, mas o registro complementar de auditoria falhou:', auditError);
      }
      setShowCreateModal(false);
      setTitle('');
      setFindings('');
      setOrderId('');
    } catch (err) {
      console.error('Erro ao agendar inspeção:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível agendar a inspeção.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const transitionInspection = async (
    inspection: Inspection,
    action: 'start' | 'submit' | 'approve' | 'reject' | 'reopen',
    payload: { comment?: string; result?: Inspection['result']; findings?: string } = {}
  ): Promise<Inspection> => {
    if (!organization || !user) throw new Error('Sessão ou empresa não disponível.');
    const response = await apiFetch(`/api/inspections/${encodeURIComponent(inspection.id)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: organization.id,
        expectedStatus: inspection.status,
        action,
        idempotencyKey: `insp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        ...payload,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok !== true || !body.inspection) {
      throw new Error(typeof body?.error === 'string' ? body.error : 'O servidor recusou a transição da inspeção.');
    }
    const updated = body.inspection as Inspection;
    setInspections((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  };

  const handleStartInspection = async (inspection: Inspection) => {
    setIsSubmitting(true);
    try {
      await transitionInspection(inspection, 'start');
      await logAudit('Inspeções', 'Iniciar Inspeção', `Inspeção iniciada: ${inspection.title}`, inspection.id);
    } catch (err) {
      console.error('Erro ao iniciar inspeção:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível iniciar a inspeção.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitInspection = async () => {
    if (!inspectionToComplete) return;
    if (result !== 'conforme' && findings.trim().length < 5) {
      alert('Descreva as constatações técnicas para um resultado não conforme ou pendente.');
      return;
    }

    setIsSubmitting(true);
    try {
      const submitted = await transitionInspection(inspectionToComplete, 'submit', {
        result,
        findings: findings.trim(),
      });
      try {
        await logAudit('Inspeções', 'Enviar para Revisão', `Inspeção enviada para revisão: ${submitted.title} | Resultado: ${submitted.result}`, submitted.id);
      } catch (auditError) {
        console.warn('A inspeção foi enviada para revisão, mas o registro complementar de auditoria falhou:', auditError);
      }
      setInspectionToComplete(null);
      setFindings('');
      setResult('pendente');
      if (submitted.result === 'nao_conforme') setNonConformantPrompt(submitted);
    } catch (err) {
      console.error('Erro ao enviar inspeção para revisão:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível enviar a inspeção para revisão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewInspection = async (inspection: Inspection, action: 'approve' | 'reject') => {
    let comment = '';
    if (action === 'reject') {
      const entered = window.prompt('Informe o motivo para devolver a inspeção ao campo:');
      if (entered === null) return;
      comment = entered.trim();
      if (comment.length < 5) {
        alert('Informe um motivo com pelo menos 5 caracteres.');
        return;
      }
    } else if (!window.confirm(`Aprovar a inspeção "${inspection.title}"?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await transitionInspection(inspection, action, { comment });
      await logAudit(
        'Inspeções',
        action === 'approve' ? 'Aprovar Inspeção' : 'Devolver Inspeção',
        `${action === 'approve' ? 'Inspeção aprovada' : 'Inspeção devolvida'}: ${updated.title}`,
        updated.id
      );
    } catch (err) {
      console.error('Erro ao revisar inspeção:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível revisar a inspeção.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenInspection = async (inspection: Inspection) => {
    const entered = window.prompt('Informe o motivo para reexecutar esta inspeção:');
    if (entered === null) return;
    const comment = entered.trim();
    if (comment.length < 5) {
      alert('Informe um motivo com pelo menos 5 caracteres.');
      return;
    }
    setIsSubmitting(true);
    try {
      await transitionInspection(inspection, 'reopen', { comment });
    } catch (err) {
      console.error('Erro ao reabrir inspeção:', err);
      alert(err instanceof Error ? err.message : 'Não foi possível reabrir a inspeção.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOccurrenceFromInspection = async (insp: Inspection) => {
    if (!organization || !user) return;
    try {
      const occId = `occ_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'occurrences', occId), {
        id: occId,
        orgId: organization.id,
        unitId: insp.unitId,
        assetId: insp.assetId || null,
        orderId: insp.orderId || null,
        inspectionId: insp.id,
        title: `Não Conformidade: ${insp.title}`,
        description: `Ocorrência gerada automaticamente a partir da inspeção técnica.\nConstatações: ${insp.findings}`,
        type: 'qualidade',
        urgency: 'alta',
        status: 'aberta',
        reportedBy: insp.inspectorName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await logAudit('Ocorrências', 'Gerar Ocorrência da Inspeção', `Ocorrência vinculada à inspeção ${insp.title}`, occId);
      setNonConformantPrompt(null);
      alert('Ocorrência registrada com sucesso na central de Ocorrências!');
    } catch (err) {
      console.error('Erro ao criar ocorrência vinculada:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('inspecoes')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${activeTab === 'inspecoes' ? 'bg-blue-600 text-white' : 'border border-slate-800 bg-[#121826] text-slate-400 hover:text-white'}`}
        >
          Inspeções & Vistorias
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('qualidade')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${activeTab === 'qualidade' ? 'bg-cyan-600 text-white' : 'border border-slate-800 bg-[#121826] text-slate-400 hover:text-white'}`}
        >
          Qualidade & Comissionamento
        </button>
      </div>
      {activeTab === 'qualidade' ? (
        organization && (
          <QualityCommissioningPanel
            organizationId={organization.id}
            units={units}
            contracts={contracts}
            currentUser={user ? { uid: user.uid, displayName: user.displayName, email: user.email } : null}
            currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Inspetor Técnico'}
            canEdit={areaLevel('operacoes') >= 2}
            canApprove={(isMaster || isSupervisorOrAbove) && areaLevel('operacoes') >= 2}
            logAudit={logAudit}
          />
        )
      ) : (
        <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Inspeções & Vistorias Técnicas</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro de auditorias visuais, conformidade técnica e abertura de plano de ação corretiva.
          </p>
        </div>

        <button
          onClick={() => {
            setUnitId(units[0]?.id || '');
            setAssetId(assets[0]?.id || '');
            setShowCreateModal(true);
          }}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Vistoria Técnica</span>
        </button>
      </div>

      {/* Non-conformant prompt banner */}
      {nonConformantPrompt && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-bold text-white">Não conformidade detectada na inspeção!</p>
              <p className="text-[11px] text-red-300">
                "{nonConformantPrompt.title}". Deseja registrar imediatamente uma ocorrência formal para ação corretiva?
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setNonConformantPrompt(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            >
              Ignorar
            </button>
            <button
              onClick={() => handleCreateOccurrenceFromInspection(nonConformantPrompt)}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-md"
            >
              Gerar Ocorrência Imediata
            </button>
          </div>
        </div>
      )}

      {/* Inspections Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Título da Vistoria</th>
                <th className="py-3 px-4">Inspetor</th>
                <th className="py-3 px-4">Resultado</th>
                <th className="py-3 px-4">Etapa</th>
                <th className="py-3 px-4">Constatações Técnicas</th>
                <th className="py-3 px-4">Data/Hora</th>
                <th className="py-3 px-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {inspections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Nenhuma inspeção técnica registrada ainda.
                  </td>
                </tr>
              ) : (
                inspections.map((insp) => (
                  <tr key={insp.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-slate-100">{insp.title}</td>
                    <td className="py-3 px-4 text-slate-300">{insp.inspectorName}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          insp.result === 'conforme'
                            ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                            : insp.result === 'nao_conforme'
                            ? 'bg-red-950/70 text-red-400 border border-red-800/50'
                            : 'bg-amber-950/70 text-amber-300 border border-amber-800/50'
                        }`}
                      >
                        {(insp.result || 'pendente').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        insp.status === 'aprovada' || insp.status === 'concluida'
                          ? 'bg-emerald-950/70 text-emerald-400'
                          : insp.status === 'reprovada'
                          ? 'bg-red-950/70 text-red-300'
                          : insp.status === 'aguardando_revisao'
                          ? 'bg-amber-950/70 text-amber-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {({
                          agendada: 'Agendada',
                          em_campo: 'Em campo',
                          aguardando_revisao: 'Aguardando revisão',
                          aprovada: 'Aprovada',
                          reprovada: 'Devolvida',
                          concluida: 'Concluída (legado)',
                        } as Record<string, string>)[insp.status] || 'Legado'}
                      </span>
                      {insp.reviewComment && <p className="mt-1 max-w-[180px] text-[10px] text-red-300" title={insp.reviewComment}>{insp.reviewComment}</p>}
                    </td>
                    <td className="py-3 px-4 max-w-sm text-slate-300 truncate" title={insp.findings}>
                      {insp.findings || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {insp.completedAt ? new Date(insp.completedAt).toLocaleString('pt-BR') : insp.startedAt ? new Date(insp.startedAt).toLocaleString('pt-BR') : new Date(insp.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 min-w-[180px]">
                        {areaLevel('operacoes') >= 2 && insp.status === 'agendada' && (
                          <button type="button" disabled={isSubmitting} onClick={() => handleStartInspection(insp)} className="rounded bg-blue-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Iniciar</button>
                        )}
                        {areaLevel('operacoes') >= 2 && insp.status === 'em_campo' && (
                          <button type="button" disabled={isSubmitting} onClick={() => { setInspectionToComplete(insp); setResult('pendente'); setFindings(''); }} className="rounded bg-cyan-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Registrar resultado</button>
                        )}
                        {(isMaster || isSupervisorOrAbove) && areaLevel('operacoes') >= 2 && insp.status === 'aguardando_revisao' && (
                          <>
                            <button type="button" disabled={isSubmitting} onClick={() => handleReviewInspection(insp, 'approve')} className="rounded bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Aprovar</button>
                            <button type="button" disabled={isSubmitting} onClick={() => handleReviewInspection(insp, 'reject')} className="rounded bg-red-800 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Devolver</button>
                          </>
                        )}
                        {areaLevel('operacoes') >= 2 && insp.status === 'reprovada' && (
                          <button type="button" disabled={isSubmitting} onClick={() => handleReopenInspection(insp)} className="rounded bg-amber-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Reexecutar</button>
                        )}
                        {['aprovada', 'reprovada', 'aguardando_revisao'].includes(insp.status) || insp.status === 'concluida'
                          ? <span className="text-[10px] text-slate-500">—</span>
                          : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Inspection */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Registrar Nova Vistoria Técnica</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInspection} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Título da Inspeção *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Auditoria Termográfica de Barramentos"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Unidade</label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Ativo / Máquina</label>
                  <select
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Geral / Sem ativo específico</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tag} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Vínculo com OS (opcional)</label>
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Nenhuma OS vinculada</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.orderNumber} - {wo.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-blue-800/50 bg-blue-950/30 p-3 text-xs text-blue-200">
                A vistoria será criada como <strong>Agendada</strong>. O inspetor iniciará a execução em campo e registrará o resultado e as constatações ao concluir, enviando o registro para revisão.
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
                  {isSubmitting ? 'Salvando...' : 'Salvar Vistoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
     
      {inspectionToComplete && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Concluir inspeção e enviar para revisão</h3>
                <p className="mt-1 text-xs text-slate-400">{inspectionToComplete.title}</p>
              </div>
              <button type="button" onClick={() => setInspectionToComplete(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-300">Resultado técnico *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setResult('conforme')} className={`rounded-lg px-2 py-2 text-xs font-bold ${result === 'conforme' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Conforme</button>
                  <button type="button" onClick={() => setResult('nao_conforme')} className={`rounded-lg px-2 py-2 text-xs font-bold ${result === 'nao_conforme' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Não conforme</button>
                  <button type="button" onClick={() => setResult('pendente')} className={`rounded-lg px-2 py-2 text-xs font-bold ${result === 'pendente' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Pendente</button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Constatações técnicas {result !== 'conforme' ? '*' : '(opcional)'}</label>
                <textarea rows={5} value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Registre medições, condições encontradas, desvios e evidências observadas." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none" />
                {result !== 'conforme' && <p className="mt-1 text-[10px] text-amber-300">Para resultado não conforme ou pendente, informe pelo menos 5 caracteres.</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setInspectionToComplete(null)} className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-slate-300">Cancelar</button>
                <button type="button" disabled={isSubmitting || (result !== 'conforme' && findings.trim().length < 5)} onClick={handleSubmitInspection} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Enviando...' : 'Enviar para revisão'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
 )}
        </>
      )}
    </div>
  );
};
