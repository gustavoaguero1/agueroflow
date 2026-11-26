import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { Boxes, CheckCircle2, PackageCheck, Plus, RotateCcw, ShoppingCart } from 'lucide-react';
import { db } from '../../firebase';
import { apiFetch } from '../../apiAuthFetch';
import type { Item, StockBalance, WorkOrder } from '../../types';
import type { StockReservation } from '../../services/stockReservationRules';

interface WorkOrderStockReservationsTabProps {
  order: WorkOrder;
  orgId: string;
  canEdit?: boolean;
}

export const WorkOrderStockReservationsTab: React.FC<WorkOrderStockReservationsTabProps> = ({
  order,
  orgId,
  canEdit = true,
}) => {
  const [items, setItems] = useState<Item[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [requestedQty, setRequestedQty] = useState('1');
  const [autoCreateRc, setAutoCreateRc] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!orgId || !order.id) return;
    Promise.all([
      getDocs(query(collection(db, 'items'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'stock_balances'), where('orgId', '==', orgId))).catch(() => null),
    ]).then(([itemSnap, balSnap]) => {
      if (itemSnap) setItems(itemSnap.docs.map((d) => ({ ...(d.data() as Item), id: d.id })));
      if (balSnap) setBalances(balSnap.docs.map((d) => ({ ...(d.data() as StockBalance), id: d.id })));
    });

    const qRes = query(
      collection(db, 'stock_reservations'),
      where('orgId', '==', orgId),
      where('workOrderId', '==', order.id),
    );
    return onSnapshot(qRes, (snap) => {
      const list = snap.docs
        .map((d) => ({ ...(d.data() as StockReservation), id: d.id }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setReservations(list);
    });
  }, [orgId, order.id]);

  const balanceByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of balances) {
      if (b.unitId === order.unitId) {
        map.set(b.itemId, Number(b.currentBalance) || 0);
      }
    }
    return map;
  }, [balances, order.unitId]);

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/stock-reservations/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: order.id,
          itemId: selectedItemId,
          unitId: order.unitId,
          requestedQty: Number(requestedQty),
          autoCreateRequisition: autoCreateRc,
          idempotencyKey: `${order.id}_${selectedItemId}_${Date.now()}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Não foi possível reservar o material.' });
        return;
      }
      const rcMsg = data.requisition?.code
        ? ` Falta gerou automaticamente a RC ${data.requisition.code} em Compras.`
        : '';
      setFeedback({
        type: 'ok',
        text: `Reserva registrada (${data.reservation?.reservedQty ?? 0} un. reservadas).${rcMsg}`,
      });
      setSelectedItemId('');
      setRequestedQty('1');
    } catch {
      setFeedback({ type: 'err', text: 'Falha de comunicação ao reservar estoque.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (reservationId: string, action: 'consume' | 'release') => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch(`/api/stock-reservations/${encodeURIComponent(reservationId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFeedback({ type: 'err', text: data?.error || 'Não foi possível atualizar a reserva.' });
        return;
      }
      setFeedback({
        type: 'ok',
        text:
          action === 'consume'
            ? 'Material baixado do estoque com custo médio vinculado à OS/Obra.'
            : 'Reserva liberada e devolvida ao saldo disponível da unidade.',
      });
    } catch {
      setFeedback({ type: 'err', text: 'Falha de comunicação ao atualizar reserva.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="af-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#0071E3] dark:text-[#409CFF]" />
              <span>Reserva Transacional de Material &amp; RC Automática</span>
            </h4>
            <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
              Reserva o saldo físico da unidade da OS. Se houver falta, gera automaticamente a Requisição de Compra (RC) para Suprimentos.
            </p>
          </div>
        </div>

        {canEdit && (
          <form onSubmit={handleReserve} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
            <div className="sm:col-span-6">
              <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">
                Material / Item do Catálogo
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white"
              >
                <option value="">Selecione um item...</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.sku ? `${it.sku} — ` : ''}{it.name} (Saldo unidade: {balanceByItem.get(it.id) ?? 0} {it.unitOfMeasure || 'UN'})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-[#6E6E73] dark:text-[#98989D] mb-1">Qtd.</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={requestedQty}
                onChange={(e) => setRequestedQty(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-[#F5F5F7] dark:bg-[#1C1F26] border border-black/[0.08] dark:border-white/[0.10] text-[#1D1D1F] dark:text-white font-mono tabular-nums"
              />
            </div>
            <div className="sm:col-span-4 flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[#6E6E73] dark:text-[#98989D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateRc}
                  onChange={(e) => setAutoCreateRc(e.target.checked)}
                />
                <span>Gerar RC se faltar</span>
              </label>
              <button
                type="submit"
                disabled={submitting || !selectedItemId}
                className="af-btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer apple-solid-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Reservar</span>
              </button>
            </div>
          </form>
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
      </div>

      <div className="af-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            Reservas vinculadas à OS ({reservations.length})
          </span>
        </div>
        {reservations.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#86868B]">
            Nenhuma reserva de estoque registrada para esta OS.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.06] text-xs">
            {reservations.map((r) => (
              <div key={r.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {r.itemSku ? <span className="font-mono text-[#0071E3] dark:text-[#409CFF] mr-1.5">{r.itemSku}</span> : null}
                    {r.itemName}
                  </div>
                  <div className="text-[11px] text-[#6E6E73] dark:text-[#98989D] tabular-nums">
                    Solicitado: <strong>{r.requestedQty}</strong> · Reservado: <strong>{r.reservedQty}</strong>
                    {r.shortageQty > 0 && (
                      <span className="ml-1.5 text-[#B25000] dark:text-[#FF9F0A] font-medium inline-flex items-center gap-1">
                        · <ShoppingCart className="w-3 h-3 inline" /> Falta {r.shortageQty}
                        {r.linkedRequisitionCode ? ` (${r.linkedRequisitionCode})` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                      r.status === 'ativa'
                        ? 'bg-[#EBF5FF] dark:bg-[#0A84FF]/15 text-[#0066CC] dark:text-[#409CFF]'
                        : r.status === 'consumida'
                        ? 'bg-[#E8F8EE] dark:bg-[#30D158]/15 text-[#1E7E34] dark:text-[#30D158]'
                        : 'bg-[#F5F5F7] dark:bg-[#2C2C2E] text-[#6E6E73] dark:text-[#98989D]'
                    }`}
                  >
                    {r.status}
                  </span>
                  {canEdit && r.status === 'ativa' && r.reservedQty > 0 && (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleAction(r.id, 'consume')}
                        className="af-btn-primary px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer apple-solid-btn"
                      >
                        <PackageCheck className="w-3 h-3" />
                        <span>Baixar</span>
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleAction(r.id, 'release')}
                        className="af-btn-glass px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Liberar</span>
                      </button>
                    </>
                  )}
                  {r.status === 'consumida' && <CheckCircle2 className="w-4 h-4 text-[#1E7E34] dark:text-[#30D158]" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
