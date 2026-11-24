import React, { useState } from 'react';
import { ShoppingCart, Plus, Trash2, X, DollarSign, Calendar, Building, Truck } from 'lucide-react';
import { PurchaseOrder, PurchaseOrderItem, PurchasingSupplier } from '../../types/purchasing';
import { savePurchaseOrder } from '../../services/purchasingService';
import { workOrderLinkFields } from '../../services/purchasingLinks';
import type { WorkOrder } from '../../types';

interface NewPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: PurchasingSupplier[];
  currentOrgId: string;
  currentUserName: string;
  workOrders: WorkOrder[];
  onOrderCreated: () => void;
}

export const NewPurchaseOrderModal: React.FC<NewPurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  currentOrgId,
  currentUserName,
  workOrders,
  onOrderCreated,
}) => {
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [deliveryLocation, setDeliveryLocation] = useState(
    'Almoxarifado Central — Galpão Industrial 02 (Docas A)'
  );
  const [paymentTerms, setPaymentTerms] = useState('28 DDL');
  const [freightType, setFreightType] = useState<'CIF' | 'FOB'>('CIF');
  const [freightValue, setFreightValue] = useState(0);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [linkedWorkOrderId, setLinkedWorkOrderId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [items, setItems] = useState<
    Array<{
      description: string;
      specs: string;
      unit: string;
      quantity: number;
      unitPrice: number;
    }>
  >([
    {
      description: 'Tubo de Aço Inox 316L DN 50 SCH 40',
      specs: 'Sem costura, norma ASTM A312',
      unit: 'BARRA 6M',
      quantity: 10,
      unitPrice: 1250,
    },
  ]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        description: '',
        specs: '',
        unit: 'UN',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const copy = [...items];
    copy[index] = { ...copy[index], [field]: value };
    setItems(copy);
  };

  const subtotal = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
  const grandTotal = subtotal + (freightType === 'FOB' ? Number(freightValue) || 0 : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];
    if (!sup) {
      alert('Selecione um fornecedor.');
      return;
    }

    if (items.some((it) => !it.description.trim() || it.quantity <= 0 || it.unitPrice <= 0)) {
      alert('Preencha a descrição, quantidade e preço unitário válido para todos os itens.');
      return;
    }

    setSubmitting(true);
    try {
      const orderId = `oc_${Date.now()}`;
      const code = `OC-2026-${String(Math.floor(Math.random() * 900) + 100)}`;

      const orderItems: PurchaseOrderItem[] = items.map((it, idx) => ({
        id: `oc_item_${Date.now()}_${idx}`,
        itemNumber: idx + 1,
        internalCode: `MP-${idx + 101}`,
        description: it.description.trim(),
        specs: it.specs.trim() || undefined,
        unit: it.unit.toUpperCase(),
        quantityOrdered: Number(it.quantity),
        quantityReceived: 0,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.quantity) * Number(it.unitPrice),
      }));

      const newOrder: PurchaseOrder = {
        id: orderId,
        organizationId: currentOrgId,
        code,
        ...workOrderLinkFields(workOrders.find((wo) => wo.id === linkedWorkOrderId)),
        supplierId: sup.id,
        supplierName: sup.name,
        supplierCnpj: sup.cnpj,
        supplierContact: sup.contactPerson,
        supplierEmail: sup.email,
        supplierPhone: sup.phone,
        buyerId: 'buyer_active',
        buyerName: currentUserName,
        emissionDate: new Date().toISOString(),
        expectedDeliveryDate,
        deliveryLocation,
        billingAddress: 'Aguero Inox & Montagens Industriais S/A - CNPJ: 12.345.678/0001-90',
        paymentTerms,
        freightType,
        freightValue: freightType === 'FOB' ? Number(freightValue) : 0,
        items: orderItems,
        subtotal,
        taxValue: 0,
        totalValue: grandTotal,
        status: 'emitida',
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseOrder(newOrder);
      onOrderCreated();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao emitir ordem de compra.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShoppingCart className="text-cyan-400" size={20} />
              Emitir Nova Ordem de Compra Direta (OC)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Geração de pedido formal homologado com numeração automática e layout industrial.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier and Commercial Conditions */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Vincular à Ordem de Serviço (opcional)</label>
            <select value={linkedWorkOrderId} onChange={(e) => setLinkedWorkOrderId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
              <option value="">Compra direta, sem OS</option>
              {workOrders.map((wo) => <option key={wo.id} value={wo.id}>{wo.orderNumber} — {wo.title}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Fornecedor Homologado *
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                required
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.cnpj})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Previsão de Entrega *
              </label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Condições de Pagamento
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex: 28 DDL"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Frete</label>
              <select
                value={freightType}
                onChange={(e) => setFreightType(e.target.value as 'CIF' | 'FOB')}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="CIF">CIF (Incluso pelo Fornecedor)</option>
                <option value="FOB">FOB (Por conta do comprador)</option>
              </select>
            </div>

            {freightType === 'FOB' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Valor Frete FOB (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={freightValue}
                  onChange={(e) => setFreightValue(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            )}

            <div className={freightType === 'FOB' ? '' : 'md:col-span-2'}>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Local de Entrega
              </label>
              <input
                type="text"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                required
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-950 px-4 py-2 flex justify-between items-center text-xs font-bold text-slate-300 uppercase tracking-wider">
              <span>Itens da Ordem de Compra ({items.length})</span>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
              >
                <Plus size={14} /> Adicionar Linha
              </button>
            </div>

            <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs"
                >
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Descrição do material..."
                      value={it.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Especificação técnica..."
                      value={it.specs}
                      onChange={(e) => handleItemChange(idx, 'specs', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="text"
                      placeholder="UN"
                      value={it.unit}
                      onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white text-center font-mono uppercase"
                      required
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      step="any"
                      placeholder="Qtd"
                      value={it.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-white text-right font-mono"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Preço Unit"
                      value={it.unitPrice}
                      onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-right font-mono"
                      required
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      className="text-slate-500 hover:text-rose-400 disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotal & Total display */}
          <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400">
              Subtotal Itens:{' '}
              <span className="font-mono text-slate-200">
                {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
              {freightType === 'FOB' && freightValue > 0 && (
                <span>
                  {' '}
                  + Frete FOB:{' '}
                  <span className="font-mono text-slate-200">
                    {freightValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </span>
              )}
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                VALOR TOTAL DA OC
              </span>
              <span className="text-lg font-mono font-bold text-cyan-400">
                {grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-cyan-600/20"
            >
              {submitting ? 'Emitindo OC...' : 'Emitir Ordem de Compra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
