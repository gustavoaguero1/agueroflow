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

type Dialog = { kind: 'won' | 'lost'; proposal: CommercialProposal } | null;

export const CommercialFunnelBoard: React.FC<Props> = ({ proposals, user, onRefresh }) => {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [motivo, setMotivo] = useState(LOSS_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const summary = funnelSummary(proposals);
  const readyToSend = proposals.filter((p) => p.status === 'aprovada' || p.status === 'finalizada');
  const days = (p: CommercialProposal) =>
    Math.floor((Date.now() - new Date(p.statusHistory?.at(-1)?.at || p.updatedAt || p.createdAt).getTime()) / 86400000);

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

  const btn = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-4">
          <span className="text-slate-400">Previsão ponderada</span>
          <p className="text-xl font-bold font-mono text-cyan-300">{brl(summary.forecast)}</p>
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
          const cards = proposals.filter((p) => p.status === col.id);
          const s = summary.byStatus[col.id];
          return (
            <div key={col.id} className="bg-[#0B132B] border border-slate-700/80 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-200">
                <span>{col.label} ({s.count})</span>
                <span className="font-mono text-cyan-300">{brl(s.value)}</span>
              </div>
              {cards.map((p) => (
                <div key={p.id} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs space-y-1">
                  <p className="font-semibold text-white">{p.code} · {p.clientName}</p>
                  <p className="text-slate-400 truncate">{p.title}</p>
                  <p className="font-mono text-slate-200">
                    {brl(p.proposedTotal || 0)}
                    {(p.status === 'enviada' || p.status === 'negociacao') &&
                      ` · ${p.probabilidade ?? DEFAULT_PROB[p.status]}%`}
                  </p>
                  <p className="text-slate-500">{days(p)} dia(s) desde a última atualização</p>
                  {p.status === 'perdida' && p.motivoPerda && <p className="text-rose-300">{p.motivoPerda}</p>}
                  {p.status === 'ganha' && p.workOrderId && <p className="text-emerald-300">OS criada</p>}
                  {(p.status === 'enviada' || p.status === 'negociacao') && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {p.status === 'enviada' && (
                        <button disabled={busy} className={`${btn} bg-cyan-600 text-white`}
                          onClick={() => run(() => moveProposalStage(db, p, 'negociacao', user))}>
                          Mover para negociação
                        </button>
                      )}
                      <button disabled={busy} className={`${btn} bg-emerald-600 text-white`}
                        onClick={() => setDialog({ kind: 'won', proposal: p })}>Marcar ganha</button>
                      <button disabled={busy} className={`${btn} bg-rose-700 text-white`}
                        onClick={() => setDialog({ kind: 'lost', proposal: p })}>Marcar perdida</button>
                    </div>
                  )}
                </div>
              ))}
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
                  Será criada uma OS "{dialog.proposal.code} - {dialog.proposal.title}" para {dialog.proposal.clientName},
                  com o custo estimado da proposta, no primeiro status configurado.
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
