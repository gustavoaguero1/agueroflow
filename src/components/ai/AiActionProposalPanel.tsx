import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { db } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import type { AiActionProposal, AiActionType } from '../../services/aiActionGuard';

interface AiActionProposalPanelProps {
  orgId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ACTION_OPTIONS: Array<{ value: AiActionType; label: string; hint: string }> = [
  {
    value: 'create_work_order_draft',
    label: 'Propor Rascunho de OS',
    hint: 'Cria proposta auditada de abertura de OS para confirmação operacional.',
  },
  {
    value: 'create_purchase_requisition_draft',
    label: 'Propor Requisição de Compra (RC)',
    hint: 'Cria proposta auditada de RC para validação de Suprimentos/Estoque.',
  },
  {
    value: 'register_occurrence_draft',
    label: 'Propor Registro de Ocorrência',
    hint: 'Cria proposta auditada de registro de ocorrência operacional/SMS.',
  },
  {
    value: 'schedule_preventive_review',
    label: 'Propor Revisão Preventiva',
    hint: 'Cria proposta de revisão preventiva de ativo para confirmação técnica.',
  },
];

interface AiAuditRow {
  id: string;
  actionType: string;
  summary: string;
  confirmedByName: string;
  timestamp: string;
}

export const AiActionProposalPanel: React.FC<AiActionProposalPanelProps> = ({ orgId, isOpen, onClose }) => {
  const [actionType, setActionType] = useState<AiActionType>('create_work_order_draft');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [pendingProposal, setPendingProposal] = useState<AiActionProposal | null>(null);
  const [audits, setAudits] = useState<AiAuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAudits = async () => {
    if (!orgId) return;
    try {
      const snap = await getDocs(query(collection(db, 'ai_action_audit'), where('orgId', '==', orgId)));
      const list = snap.docs
        .map((d) => ({ ...(d.data() as AiAuditRow), id: d.id }))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
        .slice(0, 6);
      setAudits(list);
    } catch {
      setAudits([]);
    }
  };

  useEffect(() => {
    if (isOpen) void loadAudits();
  }, [isOpen, orgId]);

  if (!isOpen) return null;

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/ai-actions/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType,
          summary: summary.trim(),
          payload: { notes: details.trim() || summary.trim() },
          idempotencyKey: `${actionType}_${Date.now()}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Não foi possível propor a ação.' });
        return;
      }
      setPendingProposal(data.proposal as AiActionProposal);
      setFeedback({ type: 'ok', text: 'Proposta criada. Revise os dados abaixo e confirme explicitamente.' });
    } catch {
      setFeedback({ type: 'err', text: 'Falha de conexão ao criar proposta.' });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingProposal) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/ai-actions/${encodeURIComponent(pendingProposal.id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Confirmação negada pelo servidor (verifique sua permissão).' });
        return;
      }
      setPendingProposal(null);
      setSummary('');
      setDetails('');
      setFeedback({ type: 'ok', text: `Ação confirmada com sucesso e auditada (${data.auditId}).` });
      await loadAudits();
    } catch {
      setFeedback({ type: 'err', text: 'Falha de conexão ao confirmar ação.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="af-glass-strong rounded-3xl max-w-lg w-full p-6 space-y-4 max-h-[88vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#0071E3] dark:text-[#409CFF]">
              <Sparkles className="w-3.5 h-3.5" />
              Governança AgueroFlow IA
            </span>
            <h3 className="text-base font-semibold text-[#1D1D1F] dark:text-white mt-0.5">
              Ação Assistida com Confirmação Humana
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">
          Nenhuma ação da IA altera registros automaticamente. Etapa 1 cria a proposta; Etapa 2 revalida permissão de área/perfil no servidor e registra auditoria imutável.
        </p>

        {!pendingProposal ? (
          <form onSubmit={handlePropose} className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">
                Tipo de Ação
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as AiActionType)}
                className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#86868B] mt-1">
                {ACTION_OPTIONS.find((o) => o.value === actionType)?.hint}
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">
                Resumo objetivo da ação
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Ex.: Abrir OS preventiva para inversora TIG-01 na Planta 01"
                className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">
                Parâmetros / Observações
              </label>
              <textarea
                rows={2}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Obra, item, justificativa ou prazo..."
                className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="af-btn-glass px-3.5 py-2 rounded-xl font-medium cursor-pointer">
                Fechar
              </button>
              <button
                type="submit"
                disabled={busy || summary.trim().length < 5}
                className="af-btn-primary px-4 py-2 rounded-xl font-semibold disabled:opacity-50 cursor-pointer apple-solid-btn"
              >
                {busy ? 'Gerando...' : 'Etapa 1: Gerar Proposta'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="af-card rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#1D1D1F] dark:text-white">Proposta aguardando sua confirmação</span>
                <span className="font-mono text-[10px] text-[#0071E3] dark:text-[#409CFF]">{pendingProposal.id}</span>
              </div>
              <p className="text-[#1D1D1F] dark:text-[#F5F5F7]">{pendingProposal.summary}</p>
              <p className="text-[11px] text-[#86868B]">
                Expira em: {new Date(pendingProposal.expiresAt).toLocaleTimeString('pt-BR')}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingProposal(null)}
                className="af-btn-glass px-3.5 py-2 rounded-xl font-medium cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm()}
                className="af-btn-primary px-4 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer apple-solid-btn"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{busy ? 'Confirmando...' : 'Etapa 2: Confirmar com Auditoria'}</span>
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`px-3 py-2 rounded-xl text-xs font-medium ${
              feedback.type === 'ok'
                ? 'bg-[#E8F8EE] dark:bg-emerald-950/40 text-[#1E7E34] dark:text-emerald-300 border border-emerald-500/30'
                : 'bg-[#FFE5E7] dark:bg-red-950/40 text-[#D70015] dark:text-red-300 border border-red-500/30'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {audits.length > 0 && (
          <div className="pt-3 border-t border-black/[0.08] dark:border-white/[0.08] space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E73] dark:text-[#98989D]">
              Últimas Ações Confirmadas (Trilha Auditável)
            </h4>
            <div className="space-y-1.5">
              {audits.map((a) => (
                <div
                  key={a.id}
                  className="af-card rounded-xl px-3 py-2 text-[11px] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7] truncate">{a.summary}</div>
                    <div className="text-[#86868B]">{a.confirmedByName} · {a.timestamp?.slice(0, 16).replace('T', ' ')}</div>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#1E7E34] dark:text-[#30D158] shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
