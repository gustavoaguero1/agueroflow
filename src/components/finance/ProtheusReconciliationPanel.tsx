import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { db } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import type { FinancePayable, FinanceReceivable } from '../../types/finance';
import type { MeasurementBulletin } from '../../types/measurement';
import type { ProtheusEntityType, ProtheusSyncRecord } from '../../services/protheusSyncRules';

const fmtBrl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const ProtheusReconciliationPanel: React.FC<{ orgId: string }> = ({ orgId }) => {
  const [records, setRecords] = useState<ProtheusSyncRecord[]>([]);
  const [receivables, setReceivables] = useState<FinanceReceivable[]>([]);
  const [payables, setPayables] = useState<FinancePayable[]>([]);
  const [bulletins, setBulletins] = useState<MeasurementBulletin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [sSnap, rSnap, pSnap, bSnap] = await Promise.all([
        getDocs(query(collection(db, 'protheus_sync_records'), where('orgId', '==', orgId))).catch(() => null),
        getDocs(query(collection(db, 'finance_receivables'), where('orgId', '==', orgId))).catch(() => null),
        getDocs(query(collection(db, 'finance_payables'), where('orgId', '==', orgId))).catch(() => null),
        getDocs(query(collection(db, 'measurement_bulletins'), where('orgId', '==', orgId))).catch(() => null),
      ]);
      setRecords(
        (sSnap ? sSnap.docs.map((d) => ({ ...(d.data() as ProtheusSyncRecord), id: d.id })) : []).sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || ''),
        ),
      );
      setReceivables(rSnap ? rSnap.docs.map((d) => ({ ...(d.data() as FinanceReceivable), id: d.id })) : []);
      setPayables(pSnap ? pSnap.docs.map((d) => ({ ...(d.data() as FinancePayable), id: d.id })) : []);
      setBulletins(
        bSnap
          ? bSnap.docs
              .map((d) => ({ ...(d.data() as MeasurementBulletin), id: d.id }))
              .filter((b) => b.status === 'aprovado' || b.status === 'aprovado_parcial')
          : [],
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [orgId]);

  const handleQueueSync = async (params: {
    entityType: ProtheusEntityType;
    internalId: string;
    internalCode: string;
    internalAmount: number;
    internalStatus: string;
  }) => {
    setBusyId(params.internalId);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/protheus-sync/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Não foi possível enfileirar sincronização Protheus.' });
        return;
      }
      setFeedback({
        type: 'ok',
        text: data.replayed
          ? `Registro ${params.internalCode} já sincronizado/enfileirado (idempotente).`
          : `Registro ${params.internalCode} enfileirado para exportação ERP Protheus.`,
      });
      await loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const syncedIds = new Set(records.map((r) => `${r.entityType}:${r.internalId}`));
  const divergentCount = records.filter((r) => r.status === 'divergencia').length;

  return (
    <div className="space-y-4 text-xs">
      <div className="af-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Conector &amp; Reconciliação ERP Protheus (Idempotente)
          </h3>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
            Enfileira títulos a receber, contas a pagar e medições aprovadas sem duplicidade e destaca divergências de valor/status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="af-btn-glass px-3.5 py-2 rounded-xl font-medium inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {divergentCount > 0 && (
        <div className="p-3.5 rounded-2xl bg-[#FFE5E7] dark:bg-red-950/35 border border-red-500/30 text-[#D70015] dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-semibold">
            {divergentCount} título(s) com divergência de valor ou status entre AgueroFlow e Protheus.
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`px-3 py-2 rounded-xl font-medium ${
            feedback.type === 'ok'
              ? 'bg-[#E8F8EE] dark:bg-emerald-950/40 text-[#1E7E34] dark:text-emerald-300 border border-emerald-500/30'
              : 'bg-[#FFE5E7] dark:bg-red-950/40 text-[#D70015] dark:text-red-300 border border-red-500/30'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Quick Queue Eligible Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="af-card rounded-2xl p-4 space-y-2.5">
          <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Contas a Receber ({receivables.length})
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
            {receivables.slice(0, 8).map((r) => {
              const queued = syncedIds.has(`finance_receivable:${r.id}`);
              return (
                <div key={r.id} className="p-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.cliente?.nome || r.documento || r.id}</div>
                    <div className="font-mono tabular-nums text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                      {fmtBrl(Number(r.valor) || 0)} · {r.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={queued || busyId === r.id}
                    onClick={() =>
                      void handleQueueSync({
                        entityType: 'finance_receivable',
                        internalId: r.id,
                        internalCode: r.documento || r.id.slice(0, 10),
                        internalAmount: Number(r.valor) || 0,
                        internalStatus: String(r.status || 'aberto'),
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                      queued ? 'bg-[#E8F8EE] dark:bg-emerald-950/40 text-[#1E7E34] dark:text-emerald-300' : 'af-btn-primary cursor-pointer apple-solid-btn'
                    }`}
                  >
                    {queued ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                    <span>{queued ? 'Na fila' : 'Enviar'}</span>
                  </button>
                </div>
              );
            })}
            {receivables.length === 0 && <p className="text-[#86868B]">Nenhum título a receber.</p>}
          </div>
        </div>

        <div className="af-card rounded-2xl p-4 space-y-2.5">
          <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Contas a Pagar ({payables.length})
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
            {payables.slice(0, 8).map((p) => {
              const queued = syncedIds.has(`finance_payable:${p.id}`);
              return (
                <div key={p.id} className="p-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.fornecedor?.nome || p.documento || p.id}</div>
                    <div className="font-mono tabular-nums text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                      {fmtBrl(Number(p.valor) || 0)} · {p.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={queued || busyId === p.id}
                    onClick={() =>
                      void handleQueueSync({
                        entityType: 'finance_payable',
                        internalId: p.id,
                        internalCode: p.documento || p.id.slice(0, 10),
                        internalAmount: Number(p.valor) || 0,
                        internalStatus: String(p.status || 'aberto'),
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                      queued ? 'bg-[#E8F8EE] dark:bg-emerald-950/40 text-[#1E7E34] dark:text-emerald-300' : 'af-btn-primary cursor-pointer apple-solid-btn'
                    }`}
                  >
                    {queued ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                    <span>{queued ? 'Na fila' : 'Enviar'}</span>
                  </button>
                </div>
              );
            })}
            {payables.length === 0 && <p className="text-[#86868B]">Nenhuma conta a pagar.</p>}
          </div>
        </div>

        <div className="af-card rounded-2xl p-4 space-y-2.5">
          <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Medições Aprovadas ({bulletins.length})
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
            {bulletins.slice(0, 8).map((b) => {
              const queued = syncedIds.has(`measurement_bulletin:${b.id}`);
              const netVal = Number(b.netApprovedReceivableAmount ?? b.totalApprovedAmount) || 0;
              return (
                <div key={b.id} className="p-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.code} — {b.title}</div>
                    <div className="font-mono tabular-nums text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                      {fmtBrl(netVal)} · {b.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={queued || busyId === b.id}
                    onClick={() =>
                      void handleQueueSync({
                        entityType: 'measurement_bulletin',
                        internalId: b.id,
                        internalCode: b.code,
                        internalAmount: netVal,
                        internalStatus: b.status,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                      queued ? 'bg-[#E8F8EE] dark:bg-emerald-950/40 text-[#1E7E34] dark:text-emerald-300' : 'af-btn-primary cursor-pointer apple-solid-btn'
                    }`}
                  >
                    {queued ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                    <span>{queued ? 'Na fila' : 'Enviar'}</span>
                  </button>
                </div>
              );
            })}
            {bulletins.length === 0 && <p className="text-[#86868B]">Nenhuma medição aprovada.</p>}
          </div>
        </div>
      </div>

      {/* Sync Records Ledger */}
      <div className="af-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] font-semibold">
          Fila &amp; Reconciliação Protheus ({records.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F5F5F7] dark:bg-[#1C1F26] text-[10px] uppercase tracking-wider text-[#6E6E73] dark:text-[#98989D] border-b border-black/[0.06] dark:border-white/[0.08]">
              <tr>
                <th className="py-2.5 px-4">Entidade / Código</th>
                <th className="py-2.5 px-3 text-right">Valor Interno</th>
                <th className="py-2.5 px-3 text-right">Valor Protheus</th>
                <th className="py-2.5 px-3">ID Externo</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#86868B]">
                    Nenhum registro enviado ao conector Protheus ainda.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="py-2.5 px-4">
                      <div className="font-mono font-semibold text-[#0071E3] dark:text-[#409CFF]">{rec.internalCode}</div>
                      <div className="text-[10px] text-[#86868B]">{rec.entityType}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{fmtBrl(rec.internalAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {rec.protheusAmount !== undefined ? fmtBrl(rec.protheusAmount) : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#6E6E73] dark:text-[#98989D]">
                      {rec.protheusExternalId || 'Aguardando retorno'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          rec.status === 'sincronizado'
                            ? 'bg-[#E8F8EE] dark:bg-[#30D158]/15 text-[#1E7E34] dark:text-[#30D158]'
                            : rec.status === 'divergencia'
                            ? 'bg-[#FFE5E7] dark:bg-[#FF453A]/15 text-[#D70015] dark:text-[#FF453A]'
                            : 'bg-[#EBF5FF] dark:bg-[#0A84FF]/15 text-[#0066CC] dark:text-[#409CFF]'
                        }`}
                      >
                        {rec.status === 'pendente_exportacao' && <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] af-live-dot" />}
                        {rec.status}
                      </span>
                      {rec.divergenceDetails && (
                        <div className="text-[10px] text-[#D70015] dark:text-[#FF453A] mt-0.5">{rec.divergenceDetails}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
