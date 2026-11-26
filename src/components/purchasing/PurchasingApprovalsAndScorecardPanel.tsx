import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Award, CheckCircle2, Plus, ShieldCheck } from 'lucide-react';
import { db } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import { useAuth } from '../../contexts/AuthContext';
import type { MaterialReceiptRecord, PurchaseOrder, PurchasingSupplier } from '../../types/purchasing';
import {
  evaluateSupplierScorecard,
  type PurchasingApprovalRule,
} from '../../services/productivityAndPurchasingRules';
import type { UserRole } from '../../types';

const fmtBrl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface PurchasingApprovalBarProps {
  orgId: string;
  orders: PurchaseOrder[];
  onRefresh: () => void;
}

export const PurchasingApprovalPanel: React.FC<PurchasingApprovalBarProps> = ({ orgId, orders, onRefresh }) => {
  const { role, isMaster } = useAuth();
  const canConfigRules = isMaster || role === 'Admin' || role === 'Gerente';
  const [rules, setRules] = useState<PurchasingApprovalRule[]>([]);
  const [approvedOrderIds, setApprovedOrderIds] = useState<Set<string>>(new Set());
  const [showNewRule, setShowNewRule] = useState(false);
  const [label, setLabel] = useState('');
  const [minAmount, setMinAmount] = useState('0');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(['Gerente', 'Admin']);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadGovernance = async () => {
    if (!orgId) return;
    const [rSnap, aSnap] = await Promise.all([
      getDocs(query(collection(db, 'purchasing_approval_rules'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'purchasing_approvals'), where('orgId', '==', orgId))).catch(() => null),
    ]);
    setRules(rSnap ? rSnap.docs.map((d) => ({ ...(d.data() as PurchasingApprovalRule), id: d.id })) : []);
    setApprovedOrderIds(
      new Set(aSnap ? aSnap.docs.map((d) => String(d.data()?.purchaseOrderId || '')) : []),
    );
  };

  useEffect(() => {
    void loadGovernance();
  }, [orgId, orders.length]);

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'cancelada' &&
          !approvedOrderIds.has(o.id) &&
          !(o as unknown as { approvedAt?: string }).approvedAt,
      ),
    [orders, approvedOrderIds],
  );

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/purchasing/approvals/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          minAmount: Number(minAmount) || 0,
          maxAmount: maxAmount.trim() ? Number(maxAmount) : null,
          requiredRoles: selectedRoles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Não foi possível salvar alçada.' });
        return;
      }
      setLabel('');
      setMinAmount('0');
      setMaxAmount('');
      setShowNewRule(false);
      setFeedback({ type: 'ok', text: `Alçada "${data.rule.label}" cadastrada.` });
      await loadGovernance();
    } finally {
      setBusy(false);
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/purchasing/approvals/orders/${encodeURIComponent(orderId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Aprovação negada pela política de alçadas.' });
        return;
      }
      setFeedback({
        type: 'ok',
        text: data.replayed
          ? 'Ordem de Compra já aprovada anteriormente.'
          : `OC aprovada sob "${data.approval?.matchedRuleLabel || 'alçada ativa'}".`,
      });
      await loadGovernance();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="af-card rounded-2xl p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0071E3] dark:text-[#409CFF]" />
            <span>Governança de Alçadas de Compra (Server-Side)</span>
          </h3>
          <p className="text-[11px] text-[#6E6E73] dark:text-[#98989D]">
            {rules.length} faixa(s) configurada(s) · {pendingOrders.length} OC(s) aguardando aprovação auditada.
          </p>
        </div>
        {canConfigRules && (
          <button
            type="button"
            onClick={() => setShowNewRule((prev) => !prev)}
            className="af-btn-glass px-3 py-1.5 rounded-xl font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showNewRule ? 'Fechar Regra' : 'Nova Alçada'}</span>
          </button>
        )}
      </div>

      {showNewRule && canConfigRules && (
        <form onSubmit={handleCreateRule} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] items-end">
          <div className="sm:col-span-4">
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] mb-1">Descrição</label>
            <input
              type="text"
              required
              minLength={3}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Alçada Diretoria (> R$ 20k)"
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#14161B] border border-black/[0.08] dark:border-white/[0.10]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] mb-1">Mín. (R$)</label>
            <input
              type="number"
              min="0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#14161B] border border-black/[0.08] dark:border-white/[0.10] font-mono tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] mb-1">Máx. (vazio = ∞)</label>
            <input
              type="number"
              min="0"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#14161B] border border-black/[0.08] dark:border-white/[0.10] font-mono tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-[#6E6E73] dark:text-[#98989D] mb-1">Perfil</label>
            <select
              value={selectedRoles[0] || 'Gerente'}
              onChange={(e) => setSelectedRoles([e.target.value as UserRole, 'Admin'])}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#14161B] border border-black/[0.08] dark:border-white/[0.10]"
            >
              <option value="Supervisor">Supervisor+</option>
              <option value="Gerente">Gerente+</option>
              <option value="Admin">Somente Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full af-btn-primary py-1.5 rounded-lg font-semibold cursor-pointer apple-solid-btn"
            >
              Salvar
            </button>
          </div>
        </form>
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

      {pendingOrders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingOrders.slice(0, 6).map((po) => (
            <div
              key={po.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.06] dark:border-white/[0.08]"
            >
              <div>
                <span className="font-mono font-semibold text-[#0071E3] dark:text-[#409CFF]">{po.code || po.id.slice(0, 8)}</span>
                <span className="mx-1.5 text-[#86868B]">·</span>
                <span className="font-mono tabular-nums font-semibold">{fmtBrl(po.totalValue || 0)}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleApproveOrder(po.id)}
                className="af-btn-primary px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer apple-solid-btn"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Aprovar Alçada</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface SupplierScorecardPanelProps {
  suppliers: PurchasingSupplier[];
  orders: PurchaseOrder[];
  receipts: MaterialReceiptRecord[];
}

export const SupplierScorecardPanel: React.FC<SupplierScorecardPanelProps> = ({
  suppliers,
  orders,
  receipts,
}) => {
  const scorecards = useMemo(() => {
    const receiptRecords = receipts.map((r) => ({
      id: r.id,
      purchaseOrderId: r.purchaseOrderId,
      receivedAt: r.receiptDate,
      items: (r.itemsReceived || []).map((it) => ({
        receivedQty: Number(it.quantityReceived) || 0,
        nonConformingQty: it.isConform === false ? Number(it.quantityReceived) || 0 : 0,
      })),
    }));
    return suppliers
      .map((s) =>
        evaluateSupplierScorecard({
          supplierId: s.id,
          supplierName: s.name,
          orders,
          receipts: receiptRecords,
        }),
      )
      .sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1));
  }, [suppliers, orders, receipts]);

  return (
    <div className="af-card rounded-2xl overflow-hidden text-xs">
      <div className="px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center gap-2">
            <Award className="w-4 h-4 text-[#0071E3] dark:text-[#409CFF]" />
            <span>Scorecard Real de Fornecedores (Prazo × Conformidade)</span>
          </h3>
          <p className="text-[11px] text-[#6E6E73] dark:text-[#98989D]">
            Calculado exclusivamente sobre OCs e recebimentos reais — sem notas artificiais quando não há histórico.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-[#F5F5F7] dark:bg-[#1C1F26] text-[10px] uppercase tracking-wider text-[#6E6E73] dark:text-[#98989D] border-b border-black/[0.06] dark:border-white/[0.08]">
            <tr>
              <th className="py-2.5 px-4">Fornecedor</th>
              <th className="py-2.5 px-3 text-right">OCs / Receb.</th>
              <th className="py-2.5 px-3 text-right">No Prazo</th>
              <th className="py-2.5 px-3 text-right">Conformidade</th>
              <th className="py-2.5 px-4 text-right">Score Real</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
            {scorecards.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#86868B]">
                  Nenhum fornecedor cadastrado.
                </td>
              </tr>
            ) : (
              scorecards.slice(0, 12).map((sc) => (
                <tr key={sc.supplierId} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">{sc.supplierName}</div>
                    <div className="text-[10px] text-[#86868B]">{sc.coverageNote}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {sc.ordersEvaluated} / {sc.receiptsEvaluated}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {sc.onTimeRatePct !== null ? `${sc.onTimeRatePct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {sc.qualityConformityPct !== null ? `${sc.qualityConformityPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                    {sc.compositeScore !== null ? (
                      <span
                        className={
                          sc.compositeScore >= 85
                            ? 'text-[#1E7E34] dark:text-[#30D158]'
                            : sc.compositeScore >= 65
                            ? 'text-[#B25000] dark:text-[#FF9F0A]'
                            : 'text-[#D70015] dark:text-[#FF453A]'
                        }
                      >
                        {sc.compositeScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[#86868B] font-normal">Sem base</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
