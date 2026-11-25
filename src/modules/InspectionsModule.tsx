import React, { useState, useEffect } from 'react';
import { QualityCommissioningPanel } from '../components/quality/QualityCommissioningPanel';
import { SafetyManagementPanel } from '../components/safety/SafetyManagementPanel';
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
  const [activeTab, setActiveTab] = useState<'inspecoes' | 'qualidade' | 'seguranca'>('inspecoes');
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
  const [result, setResult] = useState<Inspection['result']>('conforme');
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
    setIsSubmitting(true);

    try {
      const inspId = `insp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newInsp: Inspection = {
        id: inspId,
        orgId: organization.id,
        unitId: unitId || (units[0]?.id ?? 'default_unit'),
        assetId: assetId || undefined,
        orderId: orderId || undefined,
        title: title.trim(),
        inspectorId: user.uid,
        inspectorName: user.displayName || user.email || 'Inspetor Técnico',
        status: 'concluida',
        result,
        findings: findings.trim(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'inspections', inspId), newInsp);
      await logAudit('Inspeções', 'Registrar Inspeção', `Vistoria: ${title} - Resultado: ${result}`, inspId);

      setShowCreateModal(false);
      setTitle('');
      setFindings('');

      if (result === 'nao_conforme') {
        setNonConformantPrompt(newInsp);
      }
    } catch (err) {
      console.error('Erro ao salvar inspeção:', err);
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
        <button
          type="button"
          onClick={() => setActiveTab('seguranca')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${activeTab === 'seguranca' ? 'bg-amber-500 text-slate-950' : 'border border-slate-800 bg-[#121826] text-slate-400 hover:text-white'}`}
        >
          Segurança & SMS
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
      ) : activeTab === 'seguranca' ? (
        organization && (
          <SafetyManagementPanel
            organizationId={organization.id}
            units={units}
            contracts={contracts}
            currentUser={user ? { uid: user.uid, displayName: user.displayName, email: user.email } : null}
            currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Responsável de Campo'}
            canEdit={areaLevel('operacoes') >= 2}
            canApprove={(isMaster || isSupervisorOrAbove) && areaLevel('operacoes') >= 2}
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
                <th className="py-3 px-4">Constatações Técnicas</th>
                <th className="py-3 px-4">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {inspections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
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
                        {insp.result.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-sm text-slate-300 truncate" title={insp.findings}>
                      {insp.findings || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {insp.completedAt ? new Date(insp.completedAt).toLocaleString('pt-BR') : '—'}
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

              <div>
                <label className="block font-medium text-slate-300 mb-1">Resultado da Avaliação *</label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setResult('conforme')}
                    className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                      result === 'conforme'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    ✓ Conforme
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult('nao_conforme')}
                    className={`flex-1 py-2 rounded-lg font-bold transition-all ${
                      result === 'nao_conforme'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    ✕ Não Conforme
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Constatações Técnicas / Evidências *</label>
                <textarea
                  rows={3}
                  required
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder="Relatório detalhado das condições encontradas no local..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
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
      )}
        </>
      )}
    </div>
  );
};
