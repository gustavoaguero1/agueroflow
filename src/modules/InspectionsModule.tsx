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
  Printer,
  Search,
  FileWarning,
} from 'lucide-react';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const InspectionsModule: React.FC = () => {
  const { user, organization, logAudit, contracts, areaLevel, isSupervisorOrAbove, isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState<'inspecoes' | 'qualidade'>('inspecoes');
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [linkedRncInspectionIds, setLinkedRncInspectionIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'todas' | 'ativas' | 'revisao' | 'nc' | 'aprovadas'>('todas');
  const [searchQuery, setSearchQuery] = useState('');

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
    getDocs(query(collection(db, 'occurrences'), where('orgId', '==', organization.id)))
      .then((s) => {
        const ids = new Set<string>();
        s.docs.forEach((d) => {
          const inspId = d.data()?.inspectionId;
          if (typeof inspId === 'string' && inspId) ids.add(inspId);
        });
        setLinkedRncInspectionIds(ids);
      })
      .catch(() => undefined);

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
    if (linkedRncInspectionIds.has(insp.id)) {
      alert('Já existe uma Ocorrência (RNC) vinculada a esta inspeção.');
      return;
    }
    try {
      const occId = `occ_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'occurrences', occId), {
        id: occId,
        orgId: organization.id,
        unitId: insp.unitId,
        assetId: insp.assetId || null,
        orderId: insp.orderId || null,
        inspectionId: insp.id,
        title: `Não Conformidade (RNC): ${insp.title}`,
        description: `Ocorrência gerada automaticamente a partir da inspeção técnica.\nConstatações: ${insp.findings || 'Não informado'}${insp.reviewComment ? `\nRevisão: ${insp.reviewComment}` : ''}`,
        type: 'qualidade',
        urgency: 'alta',
        status: 'aberta',
        reportedBy: insp.inspectorName || user.displayName || user.email || 'Inspetor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setLinkedRncInspectionIds((prev) => new Set(prev).add(insp.id));
      await logAudit('Ocorrências', 'Gerar Ocorrência da Inspeção', `Ocorrência vinculada à inspeção ${insp.title}`, occId);
      setNonConformantPrompt(null);
      alert('Ocorrência (RNC) registrada com sucesso na central de Ocorrências!');
    } catch (err) {
      console.error('Erro ao criar ocorrência vinculada:', err);
      alert('Não foi possível criar a ocorrência agora.');
    }
  };

  const handlePrintLaudo = (insp: Inspection) => {
    const unitName = units.find((u) => u.id === insp.unitId)?.name || 'Unidade não informada';
    const assetObj = assets.find((a) => a.id === insp.assetId);
    const assetLabel = assetObj ? `${assetObj.tag} — ${assetObj.name}` : 'Geral / Sem ativo específico';
    const woObj = workOrders.find((w) => w.id === insp.orderId);
    const woLabel = woObj ? `${woObj.orderNumber} — ${woObj.title}` : 'Não vinculada';
    const dateRef = insp.completedAt || insp.startedAt || insp.createdAt;
    const statusMap: Record<string, string> = {
      agendada: 'Agendada',
      em_campo: 'Em campo',
      aguardando_revisao: 'Aguardando revisão',
      aprovada: 'Aprovada',
      reprovada: 'Devolvida / Reprovada',
      concluida: 'Concluída',
    };
    const resultLabel = (insp.result || 'pendente').replace('_', ' ').toUpperCase();
    const orgName = organization?.name || 'Grupo Aguero';

    const win = window.open('', '_blank', 'width=860,height=740');
    if (!win) {
      alert('Permita pop-ups para gerar o laudo de inspeção em PDF.');
      return;
    }

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo de Inspeção — ${escapeHtml(insp.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1d1d1f; margin: 32px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0071e3; padding-bottom: 14px; margin-bottom: 20px; }
    .brand { font-size: 18px; font-weight: 800; color: #0071e3; letter-spacing: -0.02em; }
    .sub { font-size: 12px; color: #6e6e73; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: ${insp.result === 'conforme' ? '#e8f8ee; color: #166534;' : insp.result === 'nao_conforme' ? '#ffecef; color: #c41c28;' : '#fff4e5; color: #9a4400;'} }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f5f5f7; padding: 14px; border-radius: 12px; font-size: 12px; margin-bottom: 20px; }
    .label { font-size: 10px; text-transform: uppercase; color: #6e6e73; font-weight: 700; display: block; }
    .box { border: 1px solid #d2d2d7; border-radius: 12px; padding: 14px; margin-bottom: 16px; font-size: 13px; white-space: pre-wrap; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 48px; text-align: center; font-size: 12px; }
    .sig-line { border-top: 1px solid #1d1d1f; padding-top: 6px; }
    @media print { .no-print { display: none; } body { margin: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(orgName)} · Laudo de Inspeção Técnica</div>
      <div class="sub">Emitido via AgueroFlow em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
    </div>
    <span class="badge">${escapeHtml(resultLabel)}</span>
  </div>

  <h2 style="margin:0 0 12px;font-size:17px;">${escapeHtml(insp.title)}</h2>

  <div class="grid">
    <div><span class="label">Unidade / Obra</span>${escapeHtml(unitName)}</div>
    <div><span class="label">Ativo / Equipamento</span>${escapeHtml(assetLabel)}</div>
    <div><span class="label">Ordem de Serviço</span>${escapeHtml(woLabel)}</div>
    <div><span class="label">Inspetor Responsável</span>${escapeHtml(insp.inspectorName || '—')}</div>
    <div><span class="label">Etapa Atual</span>${escapeHtml(statusMap[insp.status] || insp.status)}</div>
    <div><span class="label">Data / Hora de Referência</span>${escapeHtml(dateRef ? new Date(dateRef).toLocaleString('pt-BR') : '—')}</div>
  </div>

  <div class="box">
    <span class="label" style="margin-bottom:6px;">Constatações Técnicas</span>
    ${escapeHtml(insp.findings || 'Nenhuma constatação detalhada informada.')}
  </div>

  ${insp.reviewComment ? `<div class="box"><span class="label" style="margin-bottom:6px;">Parecer da Revisão / Qualidade</span>${escapeHtml(insp.reviewComment)}</div>` : ''}

  <div class="sigs">
    <div class="sig-line"><b>${escapeHtml(insp.inspectorName || 'Inspetor Técnico')}</b><br/>Responsável pela Vistoria</div>
    <div class="sig-line"><b>Qualidade / Supervisão</b><br/>Aprovação Técnica</div>
  </div>

  <p class="no-print" style="margin-top:24px;text-align:right;">
    <button onclick="window.print()" style="background:#0071e3;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;">Imprimir / Salvar PDF</button>
  </p>
</body>
</html>`);
    win.document.close();
  };

  const inspCounts = {
    todas: inspections.length,
    ativas: inspections.filter((i) => i.status === 'agendada' || i.status === 'em_campo').length,
    revisao: inspections.filter((i) => i.status === 'aguardando_revisao').length,
    nc: inspections.filter((i) => i.result === 'nao_conforme' || i.status === 'reprovada').length,
    aprovadas: inspections.filter((i) => i.status === 'aprovada' || i.status === 'concluida').length,
  };

  const filteredInspections = inspections.filter((insp) => {
    if (statusFilter === 'ativas' && insp.status !== 'agendada' && insp.status !== 'em_campo') return false;
    if (statusFilter === 'revisao' && insp.status !== 'aguardando_revisao') return false;
    if (statusFilter === 'nc' && insp.result !== 'nao_conforme' && insp.status !== 'reprovada') return false;
    if (statusFilter === 'aprovadas' && insp.status !== 'aprovada' && insp.status !== 'concluida') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        insp.title.toLowerCase().includes(q) ||
        (insp.inspectorName || '').toLowerCase().includes(q) ||
        (insp.findings || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-1 p-1 rounded-xl af-seg">
        <button
          type="button"
          onClick={() => setActiveTab('inspecoes')}
          className={`rounded-lg px-4 py-1.5 text-xs cursor-pointer ${activeTab === 'inspecoes' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn font-medium'}`}
        >
          Inspeções &amp; Vistorias
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('qualidade')}
          className={`rounded-lg px-4 py-1.5 text-xs cursor-pointer ${activeTab === 'qualidade' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn font-medium'}`}
        >
          Qualidade &amp; Comissionamento
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 af-card p-5 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold text-[#1D1D1F] dark:text-white tracking-tight">Inspeções &amp; Vistorias Técnicas</h2>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
            Registro de auditorias visuais, conformidade técnica, laudo imprimível e abertura rápida de RNC.
          </p>
        </div>

        <button
          onClick={() => {
            setUnitId('');
            setAssetId(assets[0]?.id || '');
            setShowCreateModal(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold cursor-pointer apple-solid-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Vistoria Técnica</span>
        </button>
      </div>

      {/* Filter Pills + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {([
            ['todas', `Todas (${inspCounts.todas})`],
            ['ativas', `Em andamento (${inspCounts.ativas})`],
            ['revisao', `Aguardando revisão (${inspCounts.revisao})`],
            ['nc', `Não conformes / Devolvidas (${inspCounts.nc})`],
            ['aprovadas', `Aprovadas (${inspCounts.aprovadas})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer border ${
                statusFilter === key
                  ? key === 'nc'
                    ? 'bg-rose-600 text-white border-rose-500 apple-solid-btn'
                    : 'bg-blue-600 text-white border-blue-500 apple-solid-btn'
                  : 'bg-[#121826] border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar por título, inspetor ou constatação..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#121826] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Non-conformant prompt banner */}
      {nonConformantPrompt && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-bold text-white">Não conformidade detectada na inspeção!</p>
              <p className="text-[11px] text-red-300">
                &ldquo;{nonConformantPrompt.title}&rdquo;. Deseja registrar imediatamente uma ocorrência formal (RNC) para ação corretiva?
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setNonConformantPrompt(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              Ignorar
            </button>
            <button
              onClick={() => handleCreateOccurrenceFromInspection(nonConformantPrompt)}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-md cursor-pointer apple-solid-btn"
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
              {filteredInspections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Nenhuma inspeção técnica encontrada para o filtro atual.
                  </td>
                </tr>
              ) : (
                filteredInspections.map((insp) => {
                  const isNonConforming = insp.result === 'nao_conforme' || insp.status === 'reprovada';
                  const hasRnc = linkedRncInspectionIds.has(insp.id);
                  return (
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
                      <div className="flex flex-wrap gap-1 min-w-[210px]">
                        {areaLevel('operacoes') >= 2 && insp.status === 'agendada' && (
                          <button type="button" disabled={isSubmitting} onClick={() => handleStartInspection(insp)} className="rounded bg-blue-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50 cursor-pointer apple-solid-btn">Iniciar</button>
                        )}
                        {areaLevel('operacoes') >= 2 && insp.status === 'em_campo' && (
                          <button type="button" disabled={isSubmitting} onClick={() => { setInspectionToComplete(insp); setResult('pendente'); setFindings(''); }} className="rounded bg-cyan-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50 cursor-pointer apple-solid-btn">Registrar resultado</button>
                        )}
                        {(isMaster || isSupervisorOrAbove) && areaLevel('operacoes') >= 2 && insp.status === 'aguardando_revisao' && (
                          <>
                            <button type="button" disabled={isSubmitting} onClick={() => handleReviewInspection(insp, 'approve')} className="rounded bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50 cursor-pointer apple-solid-btn">Aprovar</button>
                            <button type="button" disabled={isSubmitting} onClick={() => handleReviewInspection(insp, 'reject')} className="rounded bg-red-800 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50 cursor-pointer apple-solid-btn">Devolver</button>
                          </>
                        )}
                        {areaLevel('operacoes') >= 2 && insp.status === 'reprovada' && (
                          <button type="button" disabled={isSubmitting} onClick={() => handleReopenInspection(insp)} className="rounded bg-amber-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50 cursor-pointer apple-solid-btn">Reexecutar</button>
                        )}
                        {isNonConforming && (
                          hasRnc ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-800/50 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              RNC aberta
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => void handleCreateOccurrenceFromInspection(insp)}
                              className="inline-flex items-center gap-1 rounded bg-rose-700 hover:bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white cursor-pointer apple-solid-btn"
                              title="Abrir Não Conformidade (RNC) na central de Ocorrências"
                            >
                              <FileWarning className="w-3 h-3" />
                              Abrir RNC
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => handlePrintLaudo(insp)}
                          className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 cursor-pointer"
                          title="Gerar laudo técnico imprimível / PDF"
                        >
                          <Printer className="w-3 h-3" />
                          Laudo
                        </button>
                      </div>
                    </td>
                  </tr>
                );})
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
                    required
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="" disabled>Selecione a unidade</option>
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
      )}
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
        </>
      )}
    </div>
  );
};
