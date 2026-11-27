import React, { useState } from 'react';
import { db } from '../../firebase';
import { CommercialProposal } from '../../types/commercial';
import {
  LOSS_REASONS,
  funnelSummary,
  markProposalLost,
  markProposalWon,
  moveProposalStage,
} from '../../services/commercialFunnelService';

interface Props {
  proposals: CommercialProposal[];
  user: { uid: string; name: string };
  onRefresh: () => void | Promise<void>;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COLUMNS = [
  { id: 'enviada', label: 'Enviadas' },
  { id: 'negociacao', label: 'Em Negociação' },
  { id: 'ganha', label: 'Ganhas' },
  { id: 'perdida', label: 'Perdidas' },
] as const;
const DEFAULT_PROB: Record<string, number> = { enviada: 30, negociacao: 60 };

function periodRange(p: string): { from?: string } | undefined {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'mes') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
  if (p === '90d') return { from: iso(new Date(now.getTime() - 90 * 86400000)) };
  if (p === 'ano') return { from: `${now.getFullYear()}-01-01` };
  return undefined;
}

type Dialog = { kind: 'won' | 'lost'; proposal: CommercialProposal } | null;

export const CommercialFunnelBoard: React.FC<Props> = ({ proposals, user, onRefresh }) => {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [motivo, setMotivo] = useState(LOSS_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [period, setPeriod] = useState<'mes' | '90d' | 'ano' | 'tudo'>('tudo');
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const summary = funnelSummary(proposals, periodRange(period));
  const readyToSend = proposals.filter((p) => p.status === 'aprovada' || p.status === 'finalizada');
  const days = (p: CommercialProposal) =>
    Math.floor((Date.now() - new Date(p.statusHistory?.at(-1)?.at || p.updatedAt || p.createdAt).getTime()) / 86400000);

  const staleActiveCount = proposals.filter(
    (p) => (p.status === 'enviada' || p.status === 'negociacao') && days(p) >= 7,
  ).length;

  const copySummary = async (p: CommercialProposal) => {
    const stageLabel = COLUMNS.find((c) => c.id === p.status)?.label || p.status;
    const text = `Proposta ${p.code} — ${p.clientName}\nEscopo: ${p.title}\nValor: ${brl(p.proposedTotal || 0)}\nEtapa: ${stageLabel} (${days(p)} dia(s) sem movimentação)`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(p.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === p.id ? null : cur)), 2000);
    } catch {
      window.prompt('Copie o resumo da proposta:', text);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setDialog(null);
      setDetail('');
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar a proposta.');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Período (ganhas/perdidas):</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white">
            <option value="mes">Mês atual</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="ano">Ano atual</option>
            <option value="tudo">Tudo</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setOnlyNeedsAttention((v) => !v)}
          className={`px-3 py-1.5 rounded-xl font-semibold border transition cursor-pointer ${
            onlyNeedsAttention
              ? 'bg-amber-600 text-white border-amber-500 apple-solid-btn'
              : staleActiveCount > 0
              ? 'bg-amber-950/50 text-amber-300 border-amber-700/60 hover:bg-amber-900/50'
              : 'bg-slate-900 text-slate-400 border-slate-700'
          }`}
        >
          {onlyNeedsAttention ? 'Mostrando apenas follow-up (≥7d)' : `Precisam de atenção (${staleActiveCount})`}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4">
          <span className="text-slate-400">Previsão ponderada</span>
          <p className="text-xl font-bold font-mono text-cyan-300 truncate">{brl(summary.forecast)}</p>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4">
          <span className="text-slate-400">Taxa de conversão</span>
          <p className="text-xl font-bold font-mono text-emerald-300">
            {summary.winRate === null ? '—' : `${Math.round(summary.winRate * 100)}%`}
          </p>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4 col-span-2 lg:col-span-1">
          <span className="text-slate-400">Motivos de perda</span>
          <p className="text-slate-200 mt-1">
            {summary.lossReasons.length
              ? summary.lossReasons.map((r) => `${r.motivo} (${r.count})`).join(' · ')
              : 'Sem perdas registradas'}
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const cards = proposals.filter((p) => {
            if (p.status !== col.id) return false;
            if (onlyNeedsAttention) {
              return (p.status === 'enviada' || p.status === 'negociacao') && days(p) >= 7;
            }
            return true;
          });
          const s = summary.byStatus[col.id];
          return (
            <div key={col.id} className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-200">
                <span>{col.label} ({cards.length}{onlyNeedsAttention && cards.length !== s.count ? `/${s.count}` : ''})</span>
                <span className="font-mono text-cyan-300 truncate">{brl(s.value)}</span>
              </div>
              {cards.map((p) => {
                const ageDays = days(p);
                const isActive = p.status === 'enviada' || p.status === 'negociacao';
                return (
                <div key={p.id} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="font-semibold text-white">{p.code} · {p.clientName}</p>
                    {isActive && ageDays >= 15 && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 text-[10px] font-bold">
                        {ageDays}d · Urgente
                      </span>
                    )}
                    {isActive && ageDays >= 7 && ageDays < 15 && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[10px] font-bold">
                        {ageDays}d · Follow-up
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 truncate">{p.title}</p>
                  <p className="font-mono text-slate-200">
                    {brl(p.proposedTotal || 0)}
                    {isActive && ` · ${p.probabilidade ?? DEFAULT_PROB[p.status]}%`}
                  </p>
                  <p className="text-slate-500">{ageDays} dia(s) desde a última atualização</p>
                  {p.status === 'perdida' && p.motivoPerda && <p className="text-rose-300">{p.motivoPerda}</p>}
                  {p.status === 'ganha' && p.workOrderId && <p className="text-emerald-300">OS criada</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {isActive && p.status === 'enviada' && (
                      <button disabled={busy} className={`${btn} bg-cyan-600 text-white apple-solid-btn`}
                        onClick={() => run(() => moveProposalStage(db, p, 'negociacao', user))}>
                        Negociação
                      </button>
                    )}
                    {isActive && (
                      <>
                        <button disabled={busy} className={`${btn} bg-emerald-600 text-white apple-solid-btn`}
                          onClick={() => setDialog({ kind: 'won', proposal: p })}>Ganha</button>
                        <button disabled={busy} className={`${btn} bg-rose-700 text-white apple-solid-btn`}
                          onClick={() => setDialog({ kind: 'lost', proposal: p })}>Perdida</button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void copySummary(p)}
                      className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200`}
                      title="Copiar resumo pronto para WhatsApp/e-mail"
                    >
                      {copiedId === p.id ? 'Copiado ✓' : 'Copiar resumo'}
                    </button>
                  </div>
                </div>
              );})}
            </div>
          );
        })}
      </div>

      {readyToSend.length > 0 && (
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-3 text-xs space-y-2">
          <p className="font-semibold text-slate-200">Propostas aprovadas, ainda fora do funil</p>
          {readyToSend.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-slate-300">
              <span>{p.code} · {p.clientName} · {brl(p.proposedTotal || 0)}</span>
              <button disabled={busy} className={`${btn} bg-cyan-600 text-white`}
                onClick={() => run(() => moveProposalStage(db, p, 'enviada', user))}>Marcar enviada</button>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#0B132B] border border-slate-700 rounded-xl p-5 w-full max-w-md space-y-3 text-xs text-slate-200">
            {dialog.kind === 'won' ? (
              <>
                <p className="text-sm font-bold text-white">Marcar {dialog.proposal.code} como ganha?</p>
                <p>
                  Serão criados/vinculados atomicamente o <strong>Contrato</strong>, o <strong>Projeto/Obra mestre</strong> com
                  <strong> orçamento-base congelado (v1)</strong> e a OS inicial &quot;{dialog.proposal.code} - {dialog.proposal.title}&quot; para {dialog.proposal.clientName},
                  vinculados à unidade da proposta.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-white">Motivo da perda de {dialog.proposal.code}</p>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white">
                  {LOSS_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Detalhes (opcional)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white" />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button className={`${btn} bg-slate-700 text-white`} onClick={() => setDialog(null)}>Cancelar</button>
              <button disabled={busy} className={`${btn} ${dialog.kind === 'won' ? 'bg-emerald-600' : 'bg-rose-700'} text-white`}
                onClick={() => run(() => dialog.kind === 'won'
                  ? markProposalWon(db, dialog.proposal, user)
                  : markProposalLost(db, dialog.proposal, motivo, user, detail))}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
