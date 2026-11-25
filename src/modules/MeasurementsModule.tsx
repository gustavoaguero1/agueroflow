import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../apiAuthFetch';
import type { Contract } from '../types';
import type { Project } from '../types/project';
import type { MeasurementBulletin, MeasurementStatus } from '../types/measurement';

const fmtBrl = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_BADGE: Record<MeasurementStatus, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-slate-800 text-slate-300 border-slate-700' },
  enviado_aprovacao: { label: 'Aguardando Aprovação', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  aprovado_parcial: { label: 'Aprovado Parcial', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' },
  glosado: { label: 'Glosado', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  devolvido: { label: 'Devolvido', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-900 text-slate-500 border-slate-800' },
};

interface DraftLine {
  itemCode: string;
  description: string;
  unit: string;
  measuredQuantity: number;
  unitPrice: number;
}

export const MeasurementsModule: React.FC = () => {
  const { organization, units, isManagerOrAbove, areaLevel } = useAuth();
  const orgId = organization?.id || '';
  const canEdit = areaLevel('operacoes') >= 2;

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [bulletins, setBulletins] = useState<MeasurementBulletin[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [contractId, setContractId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { itemCode: 'LPU-01', description: '', unit: 'UN', measuredQuantity: 1, unitPrice: 0 },
  ]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const [bmSnap, ctSnap, prjSnap] = await Promise.all([
        getDocs(query(collection(db, 'measurement_bulletins'), where('orgId', '==', orgId))),
        getDocs(query(collection(db, 'contracts'), where('orgId', '==', orgId))),
        getDocs(query(collection(db, 'projects'), where('orgId', '==', orgId))),
      ]);
      const bms = bmSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as MeasurementBulletin)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setBulletins(bms);
      setContracts(ctSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contract));
      setProjects(prjSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao carregar medições.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const totals = useMemo(() => {
    return bulletins.reduce(
      (acc, bm) => {
        if (bm.status === 'cancelado') return acc;
        acc.measured += bm.totalMeasuredAmount || 0;
        if (bm.status === 'aprovado' || bm.status === 'aprovado_parcial') {
          acc.approved += bm.totalApprovedAmount || 0;
        }
        acc.glosa += bm.totalGlosaAmount || 0;
        if (bm.status === 'enviado_aprovacao') acc.pendingApproval += 1;
        return acc;
      },
      { measured: 0, approved: 0, glosa: 0, pendingApproval: 0 },
    );
  }, [bulletins]);

  const handleOpenNew = () => {
    setTitle('');
    setContractId(contracts[0]?.id || '');
    setProjectId('');
    setUnitId(units[0]?.id || '');
    setNotes('');
    setLines([{ itemCode: 'LPU-01', description: '', unit: 'UN', measuredQuantity: 1, unitPrice: 0 }]);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleCreateBulletin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/measurements/bulletins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          title,
          contractId,
          ...(projectId ? { projectId } : {}),
          unitId,
          periodStart,
          periodEnd,
          dueDate,
          notes,
          items: lines,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'Não foi possível criar o Boletim de Medição.');
      }
      setModalOpen(false);
      setSuccessMsg(`Boletim ${payload.bulletin.code} criado em rascunho.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar boletim.');
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (bm: MeasurementBulletin, targetStatus: MeasurementStatus) => {
    let comment = '';
    if (['devolvido', 'glosado', 'cancelado'].includes(targetStatus)) {
      const promptMsg =
        targetStatus === 'glosado'
          ? 'Informe o motivo da glosa integral:'
          : targetStatus === 'devolvido'
          ? 'Informe o motivo da devolução para ajuste:'
          : 'Informe o motivo do cancelamento:';
      const entered = window.prompt(promptMsg);
      if (!entered || entered.trim().length < 3) return;
      comment = entered.trim();
    }

    setBusyId(bm.id);
    setErrorMsg('');
    try {
      const res = await apiFetch(`/api/measurements/bulletins/${encodeURIComponent(bm.id)}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, targetStatus, comment }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'Falha ao transicionar boletim.');
      }
      setSuccessMsg(
        payload.receivableCreated
          ? `Boletim ${bm.code} aprovado e título ${payload.receivableId} gerado em Contas a Receber.`
          : `Boletim ${bm.code} atualizado para "${STATUS_BADGE[targetStatus].label}".`,
      );
      setTimeout(() => setSuccessMsg(''), 5000);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar boletim.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-cyan-400" />
            <span>Medições & Boletim de Medição (BM)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Apuração contratual por período vinculada a Contratos, Projetos/Obras e geração atômica em Contas a Receber.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenNew}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Boletim (BM)</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Total Medido</span>
          <p className="text-xl font-bold font-mono text-white mt-1">{fmtBrl(totals.measured)}</p>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Aprovado / Faturável</span>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{fmtBrl(totals.approved)}</p>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Glosas Acumuladas</span>
          <p className="text-xl font-bold font-mono text-rose-400 mt-1">{fmtBrl(totals.glosa)}</p>
        </div>
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Aguardando Aprovação</span>
          <p className="text-xl font-bold font-mono text-amber-400 mt-1">{totals.pendingApproval}</p>
        </div>
      </div>

      {/* Bulletins Table */}
      <div className="bg-[#121826] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b101b] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Boletim</th>
                <th className="py-3 px-4">Contrato / Obra</th>
                <th className="py-3 px-3">Período / Venc.</th>
                <th className="py-3 px-3 text-right">Medido</th>
                <th className="py-3 px-3 text-right">Aprovado</th>
                <th className="py-3 px-3">Status / Recebível</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Carregando boletins de medição...
                  </td>
                </tr>
              ) : bulletins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Nenhum Boletim de Medição cadastrado nesta empresa.
                  </td>
                </tr>
              ) : (
                bulletins.map((bm) => {
                  const badge = STATUS_BADGE[bm.status] || STATUS_BADGE.rascunho;
                  const isBusy = busyId === bm.id;
                  return (
                    <tr key={bm.id} className="hover:bg-slate-900/40">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-cyan-300">{bm.code}</div>
                        <div className="text-slate-200 font-medium">{bm.title}</div>
                        <div className="text-[10px] text-slate-500">{bm.items?.length || 0} item(ns)</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{bm.contractTitle || bm.contractId}</div>
                        <div className="text-[11px] text-slate-400">{bm.clientName}</div>
                        {bm.projectCode && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-300">
                            {bm.projectCode}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                        <div>{bm.periodStart} → {bm.periodEnd}</div>
                        <div className="text-slate-500">Venc.: {bm.dueDate}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-200">
                        {fmtBrl(bm.totalMeasuredAmount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                        {fmtBrl(bm.totalApprovedAmount)}
                        {bm.totalGlosaAmount > 0 && (
                          <div className="text-[10px] text-rose-400 font-normal">
                            Glosa: {fmtBrl(bm.totalGlosaAmount)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {bm.receivableId && (
                          <div className="text-[10px] text-emerald-300 font-mono mt-1 flex items-center gap-1">
                            <FileCheck2 className="w-3 h-3" />
                            <span>CR: {bm.receivableId.slice(0, 22)}...</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (bm.status === 'rascunho' || bm.status === 'devolvido') && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleTransition(bm, 'enviado_aprovacao')}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              <span>Enviar</span>
                            </button>
                          )}
                          {isManagerOrAbove && bm.status === 'enviado_aprovacao' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleTransition(bm, 'aprovado')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                title="Aprovar medição e gerar Contas a Receber atomicamente"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Aprovar & CR</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleTransition(bm, 'devolvido')}
                                className="p-1.5 bg-slate-800 hover:bg-orange-900/60 text-orange-300 rounded-lg disabled:opacity-50 cursor-pointer"
                                title="Devolver para ajuste"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleTransition(bm, 'glosado')}
                                className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-rose-300 rounded-lg disabled:opacity-50 cursor-pointer"
                                title="Glosar integralmente"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-700 rounded-2xl max-w-3xl w-full p-5 space-y-4 text-xs text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Novo Boletim de Medição (BM)
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBulletin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 mb-1">Título do Boletim *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: 1ª Medição Mensal — Montagem Tubulação Inox"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Contrato *</label>
                  <select
                    required
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Selecione um contrato</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contractNumber || c.code || c.id} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Unidade *</label>
                  <select
                    required
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Selecione a unidade</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Projeto / Obra (opcional)</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Sem vínculo direto com obra</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Início *</label>
                    <input
                      type="date"
                      required
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Fim *</label>
                    <input
                      type="date"
                      required
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Venc. CR *</label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 uppercase text-[11px]">Itens Medidos (Contrato / LPU)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        { itemCode: `LPU-0${prev.length + 1}`, description: '', unit: 'UN', measuredQuantity: 1, unitPrice: 0 },
                      ])
                    }
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg font-semibold cursor-pointer"
                  >
                    + Adicionar Item
                  </button>
                </div>
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/70 p-2 rounded-lg border border-slate-800">
                    <input
                      type="text"
                      placeholder="Cód."
                      value={line.itemCode}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, itemCode: e.target.value } : l)))
                      }
                      className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 font-mono text-white"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Descrição do serviço / item LPU"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)))
                      }
                      className="col-span-4 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white"
                    />
                    <input
                      type="text"
                      required
                      placeholder="UN"
                      value={line.unit}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit: e.target.value.toUpperCase() } : l)))
                      }
                      className="col-span-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-center font-mono text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={line.measuredQuantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, measuredQuantity: Number(e.target.value) } : l)),
                        )
                      }
                      className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-right font-mono text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="Unit R$"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, unitPrice: Number(e.target.value) } : l)),
                        )
                      }
                      className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-right font-mono text-white"
                    />
                    <button
                      type="button"
                      disabled={lines.length <= 1}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 p-1.5 text-rose-400 hover:text-rose-300 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Observações (opcional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Criar Boletim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
