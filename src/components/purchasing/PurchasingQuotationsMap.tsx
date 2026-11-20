import React, { useState } from 'react';
import {
  FileText,
  Plus,
  CheckCircle,
  Award,
  Truck,
  Calendar,
  DollarSign,
  TrendingDown,
  Building,
  ChevronRight,
  AlertCircle,
  Layers,
  X,
  FileCheck
} from 'lucide-react';
import {
  PurchaseQuotationMap,
  PurchaseRequisition,
  PurchasingSupplier,
  SupplierBid,
  PurchaseOrder,
  PurchaseOrderItem
} from '../../types/purchasing';
import {
  savePurchaseQuotation,
  savePurchaseOrder,
  updateRequisitionStatus
} from '../../services/purchasingService';

interface PurchasingQuotationsMapProps {
  quotations: PurchaseQuotationMap[];
  requisitions: PurchaseRequisition[];
  suppliers: PurchasingSupplier[];
  currentOrgId: string;
  currentUserName: string;
  onRefresh: () => void;
  onSwitchToOrders: () => void;
}

export const PurchasingQuotationsMap: React.FC<PurchasingQuotationsMapProps> = ({
  quotations,
  requisitions,
  suppliers,
  currentOrgId,
  currentUserName,
  onRefresh,
  onSwitchToOrders,
}) => {
  const [selectedMap, setSelectedMap] = useState<PurchaseQuotationMap | null>(
    quotations[0] || null
  );
  const [isAddingBidModalOpen, setIsAddingBidModalOpen] = useState(false);
  const [isNewMapModalOpen, setIsNewMapModalOpen] = useState(false);
  const [isHomologatingModalOpen, setIsHomologatingModalOpen] = useState(false);
  const [selectedWinnerBidId, setSelectedWinnerBidId] = useState<string>('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New Bid Form State
  const [bidSupplierId, setBidSupplierId] = useState('');
  const [bidQuoteNumber, setBidQuoteNumber] = useState('');
  const [bidFreightType, setBidFreightType] = useState<'CIF' | 'FOB'>('CIF');
  const [bidFreightCost, setBidFreightCost] = useState<number>(0);
  const [bidPaymentTerms, setBidPaymentTerms] = useState('28 DDL');
  const [bidDeliveryDays, setBidDeliveryDays] = useState(7);
  const [bidValidityDays, setBidValidityDays] = useState(15);
  const [bidItemPrices, setBidItemPrices] = useState<Record<string, number>>({});
  const [bidNotes, setBidNotes] = useState('');

  // New Map Form State
  const [newMapTitle, setNewMapTitle] = useState('');
  const [selectedRequisitionId, setSelectedRequisitionId] = useState('');

  // Find lowest price item per quotation
  const getLowestPriceFor = (itemId: string, bids: SupplierBid[]) => {
    let lowest: number | null = null;
    let supplierName = '';
    bids.forEach((bid) => {
      const itPrice = bid.itemsPrices.find((p) => p.itemId === itemId);
      if (itPrice && itPrice.unitPrice > 0) {
        if (lowest === null || itPrice.unitPrice < lowest) {
          lowest = itPrice.unitPrice;
          supplierName = bid.supplierName;
        }
      }
    });
    return { lowest, supplierName };
  };

  const handleOpenAddBid = (map: PurchaseQuotationMap) => {
    setSelectedMap(map);
    setBidSupplierId(suppliers[0]?.id || '');
    setBidQuoteNumber(`COT-${Date.now().toString().slice(-4)}`);
    setBidFreightType('CIF');
    setBidFreightCost(0);
    setBidPaymentTerms('28 DDL');
    setBidDeliveryDays(10);
    setBidValidityDays(15);
    setBidNotes('');

    // Prepopulate zero prices
    const initPrices: Record<string, number> = {};
    map.items.forEach((it) => {
      initPrices[it.id] = it.estimatedCost || 0;
    });
    setBidItemPrices(initPrices);
    setIsAddingBidModalOpen(true);
  };

  const handleSaveBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMap) return;
    const sup = suppliers.find((s) => s.id === bidSupplierId);
    if (!sup) {
      alert('Selecione um fornecedor cadastrado.');
      return;
    }

    setSubmitting(true);
    try {
      const itemsPrices = selectedMap.items.map((it) => {
        const uPrice = Number(bidItemPrices[it.id]) || 0;
        return {
          itemId: it.id,
          unitPrice: uPrice,
          totalPrice: uPrice * it.quantity,
        };
      });

      const totalItems = itemsPrices.reduce((acc, p) => acc + p.totalPrice, 0);
      const grandTotal = totalItems + (bidFreightType === 'FOB' ? bidFreightCost : 0);

      const newBid: SupplierBid = {
        id: `bid_${Date.now()}`,
        supplierId: sup.id,
        supplierName: sup.name,
        supplierCnpj: sup.cnpj,
        contactName: sup.contactPerson,
        quoteNumber: bidQuoteNumber,
        quoteDate: new Date().toISOString(),
        validityDays: bidValidityDays,
        freightType: bidFreightType,
        freightCost: bidFreightCost,
        paymentTerms: bidPaymentTerms,
        deliveryDays: bidDeliveryDays,
        itemsPrices,
        totalValue: grandTotal,
        notes: bidNotes,
      };

      const updatedMap: PurchaseQuotationMap = {
        ...selectedMap,
        bids: [...selectedMap.bids, newBid],
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseQuotation(updatedMap);
      setSelectedMap(updatedMap);
      setIsAddingBidModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar proposta do fornecedor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNewMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMapTitle.trim()) {
      alert('Informe o título do mapa de cotação.');
      return;
    }

    setSubmitting(true);
    try {
      const linkedReq = requisitions.find((r) => r.id === selectedRequisitionId);
      const mapId = `map_${Date.now()}`;
      const code = `MAP-2026-${String(quotations.length + 1).padStart(3, '0')}`;

      const newMap: PurchaseQuotationMap = {
        id: mapId,
        organizationId: currentOrgId,
        code,
        title: newMapTitle.trim(),
        requisitionId: linkedReq?.id,
        requisitionCode: linkedReq?.code,
        items: linkedReq ? [...linkedReq.items] : [
          {
            id: `item_${Date.now()}_1`,
            description: 'Tubo Aço Inox 304L SCH 10 4 pol',
            specs: 'ASTM A312 com certificado de usina',
            unit: 'BARRA 6M',
            quantity: 12,
            estimatedCost: 890,
          }
        ],
        bids: [],
        status: 'aberto',
        buyerName: currentUserName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseQuotation(newMap);
      if (linkedReq) {
        await updateRequisitionStatus(linkedReq.id, 'em_cotacao');
      }

      setIsNewMapModalOpen(false);
      setNewMapTitle('');
      setSelectedRequisitionId('');
      onRefresh();
      setSelectedMap(newMap);
    } catch (err) {
      console.error(err);
      alert('Erro ao criar mapa de cotação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHomologateWinner = async () => {
    if (!selectedMap || !selectedWinnerBidId) {
      alert('Selecione a proposta vencedora.');
      return;
    }
    const winningBid = selectedMap.bids.find((b) => b.id === selectedWinnerBidId);
    if (!winningBid) return;

    setSubmitting(true);
    try {
      // 1. Update quotation status
      const updatedBids = selectedMap.bids.map((b) => ({
        ...b,
        isWinner: b.id === selectedWinnerBidId,
      }));

      const updatedMap: PurchaseQuotationMap = {
        ...selectedMap,
        bids: updatedBids,
        winningSupplierId: winningBid.supplierId,
        winningSupplierName: winningBid.supplierName,
        winningJustification: justification || 'Melhor custo-benefício técnico e comercial atendendo prazo de obra.',
        status: 'homologado',
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseQuotation(updatedMap);

      // 2. Generate Authorized Purchase Order (OC) automatically
      const orderId = `oc_${Date.now()}`;
      const orderCode = `OC-2026-${String(Math.floor(Math.random() * 900) + 100)}`;

      const orderItems: PurchaseOrderItem[] = selectedMap.items.map((it, idx) => {
        const itemBid = winningBid.itemsPrices.find((p) => p.itemId === it.id);
        const uPrice = itemBid ? itemBid.unitPrice : 0;
        return {
          id: `oc_item_${Date.now()}_${idx}`,
          itemNumber: idx + 1,
          internalCode: it.code || `MP-${idx + 101}`,
          description: it.description,
          specs: it.specs,
          unit: it.unit,
          quantityOrdered: it.quantity,
          quantityReceived: 0,
          unitPrice: uPrice,
          totalPrice: uPrice * it.quantity,
        };
      });

      const subtotal = orderItems.reduce((acc, it) => acc + it.totalPrice, 0);
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + (winningBid.deliveryDays || 10));

      const newOrder: PurchaseOrder = {
        id: orderId,
        organizationId: currentOrgId,
        code: orderCode,
        requisitionCode: selectedMap.requisitionCode,
        quotationMapCode: selectedMap.code,
        supplierId: winningBid.supplierId,
        supplierName: winningBid.supplierName,
        supplierCnpj: winningBid.supplierCnpj || '00.000.000/0001-00',
        supplierContact: winningBid.contactName,
        buyerId: 'buyer_active',
        buyerName: currentUserName,
        emissionDate: new Date().toISOString(),
        expectedDeliveryDate: deliveryDate.toISOString().split('T')[0],
        deliveryLocation: 'Almoxarifado Central — Galpão Industrial 02 (Docas A)',
        billingAddress: 'Aguero Inox & Montagens Industriais S/A - CNPJ: 12.345.678/0001-90',
        paymentTerms: winningBid.paymentTerms,
        freightType: winningBid.freightType,
        freightValue: winningBid.freightCost || 0,
        items: orderItems,
        subtotal,
        taxValue: 0,
        totalValue: subtotal + (winningBid.freightType === 'FOB' ? winningBid.freightCost : 0),
        status: 'emitida',
        notes: `Homologado via Mapa de Cotação ${selectedMap.code}. Justificativa: ${justification || 'Melhor oferta técnica e comercial'}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseOrder(newOrder);

      // If tied to requisition, mark as 'pedido_gerado'
      if (selectedMap.requisitionId) {
        await updateRequisitionStatus(selectedMap.requisitionId, 'pedido_gerado');
      }

      setIsHomologatingModalOpen(false);
      onRefresh();
      alert(`Homologação concluída com sucesso! Ordem de Compra ${orderCode} gerada.`);
      onSwitchToOrders();
    } catch (err) {
      console.error(err);
      alert('Erro ao homologar fornecedor e gerar OC.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="text-cyan-400" size={22} />
            Mapa Comparativo de Cotações (3-Bid Matrix)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Equalização técnica e comercial de propostas, destaque automático do menor preço e geração de OC com 1 clique.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsNewMapModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium border border-slate-700 transition"
          >
            <Plus size={16} /> Novo Mapa
          </button>
        </div>
      </div>

      {/* Main Grid: Left selector, Right detail matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side: Quotation Maps List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Mapas Cadastrados ({quotations.length})
          </h3>

          {quotations.length === 0 ? (
            <div className="p-6 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-sm">
              Nenhum mapa cadastrado ainda.
            </div>
          ) : (
            quotations.map((map) => {
              const isSelected = selectedMap?.id === map.id;
              return (
                <div
                  key={map.id}
                  onClick={() => setSelectedMap(map)}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-white shadow-lg shadow-cyan-500/5'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                      {map.code}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        map.status === 'homologado'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {map.status === 'homologado' ? 'Homologado' : 'Em Cotação'}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-white mt-2 line-clamp-1">
                    {map.title}
                  </h4>

                  {map.requisitionCode && (
                    <p className="text-xs text-slate-400 mt-1">
                      Ref: <span className="font-mono text-slate-300">{map.requisitionCode}</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-3 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                    <span>{map.items.length} itens</span>
                    <span className="font-medium text-cyan-400">{map.bids.length} propostas</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Side: 3-Bid Matrix View */}
        <div className="lg:col-span-3">
          {selectedMap ? (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-6">
              {/* Map Title & Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm px-2.5 py-1 rounded bg-slate-800 text-cyan-300 font-bold border border-slate-700">
                      {selectedMap.code}
                    </span>
                    <h3 className="text-lg font-bold text-white">{selectedMap.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Responsável: <span className="text-slate-300">{selectedMap.buyerName}</span> • Criado em{' '}
                    {new Date(selectedMap.createdAt).toLocaleDateString('pt-BR')}
                    {selectedMap.requisitionCode && ` • RC: ${selectedMap.requisitionCode}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenAddBid(selectedMap)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    <Plus size={14} /> Inserir Cotação
                  </button>

                  {selectedMap.bids.length > 0 && selectedMap.status !== 'homologado' && (
                    <button
                      onClick={() => {
                        setSelectedWinnerBidId(selectedMap.bids[0]?.id || '');
                        setIsHomologatingModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
                    >
                      <Award size={14} /> Homologar Vencedor
                    </button>
                  )}
                </div>
              </div>

              {/* Status Banner if Homologated */}
              {selectedMap.status === 'homologado' && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-300">
                      Mapa Homologado — Fornecedor Vencedor: {selectedMap.winningSupplierName}
                    </h4>
                    <p className="text-xs text-emerald-200/80 mt-1">
                      {selectedMap.winningJustification}
                    </p>
                  </div>
                </div>
              )}

              {/* Matrix Table */}
              {selectedMap.bids.length === 0 ? (
                <div className="p-12 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  <AlertCircle className="mx-auto text-amber-400 mb-3" size={32} />
                  <h4 className="text-sm font-semibold text-white">Nenhuma proposta de fornecedor inserida</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Insira as cotações recebidas (mínimo recomendado: 3 propostas) para ativar a equalização automática com menor preço destacado.
                  </p>
                  <button
                    onClick={() => handleOpenAddBid(selectedMap)}
                    className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2"
                  >
                    <Plus size={14} /> Inserir Primeira Cotação
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-3 font-semibold min-w-[200px]">Item Requisitado</th>
                        <th className="p-3 font-semibold text-center w-16">Qtd</th>
                        <th className="p-3 font-semibold text-center w-16">Un</th>
                        {selectedMap.bids.map((bid) => (
                          <th
                            key={bid.id}
                            className={`p-3 font-semibold min-w-[170px] text-center border-l border-slate-800 ${
                              bid.isWinner ? 'bg-emerald-950/30 text-emerald-300' : ''
                            }`}
                          >
                            <div className="flex items-center justify-center gap-1 font-bold text-white">
                              {bid.isWinner && <Award size={14} className="text-amber-400" />}
                              <span className="truncate max-w-[140px]">{bid.supplierName}</span>
                            </div>
                            <div className="text-[10px] font-normal text-slate-400">
                              Ref: {bid.quoteNumber}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedMap.items.map((it) => {
                        const { lowest } = getLowestPriceFor(it.id, selectedMap.bids);

                        return (
                          <tr key={it.id} className="hover:bg-slate-800/40">
                            <td className="p-3">
                              <div className="font-medium text-white">{it.description}</div>
                              {it.specs && <div className="text-[11px] text-slate-400">{it.specs}</div>}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-200">
                              {it.quantity}
                            </td>
                            <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                              {it.unit}
                            </td>

                            {selectedMap.bids.map((bid) => {
                              const itPrice = bid.itemsPrices.find((p) => p.itemId === it.id);
                              const uPrice = itPrice ? itPrice.unitPrice : 0;
                              const isLowest = lowest !== null && uPrice === lowest && uPrice > 0;

                              return (
                                <td
                                  key={bid.id}
                                  className={`p-3 text-right font-mono border-l border-slate-800 ${
                                    isLowest
                                      ? 'bg-emerald-950/20 text-emerald-400 font-bold'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  <div>
                                    {uPrice.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-normal">
                                    Total:{' '}
                                    {(uPrice * it.quantity).toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </div>
                                  {isLowest && (
                                    <span className="inline-block mt-1 text-[9px] font-sans px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      Menor Preço
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Summary Rows */}
                      <tr className="bg-slate-950/80 font-semibold text-slate-300 border-t-2 border-slate-700">
                        <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-[11px] text-slate-400">
                          Condições Comerciais / Frete
                        </td>
                        {selectedMap.bids.map((bid) => (
                          <td key={bid.id} className="p-3 text-center border-l border-slate-800 text-[11px]">
                            <div className="text-slate-300">
                              <span className="font-bold text-white">{bid.freightType}</span>
                              {bid.freightCost > 0 && ` (+R$ ${bid.freightCost})`}
                            </div>
                            <div className="text-slate-400 mt-0.5">{bid.paymentTerms}</div>
                            <div className="text-slate-400 mt-0.5">Prazo: {bid.deliveryDays} dias</div>
                          </td>
                        ))}
                      </tr>

                      <tr className="bg-slate-950 font-bold text-white border-t border-slate-800">
                        <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-xs text-cyan-400">
                          VALOR TOTAL DA PROPOSTA
                        </td>
                        {selectedMap.bids.map((bid) => {
                          const allTotals = selectedMap.bids.map((b) => b.totalValue);
                          const minTotal = Math.min(...allTotals);
                          const isLowestTotal = bid.totalValue === minTotal;

                          return (
                            <td
                              key={bid.id}
                              className={`p-3 text-right font-mono text-sm border-l border-slate-800 ${
                                isLowestTotal ? 'bg-cyan-500/10 text-cyan-300 font-extrabold' : ''
                              }`}
                            >
                              {bid.totalValue.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                              {isLowestTotal && (
                                <div className="text-[10px] text-cyan-400 font-sans font-normal mt-0.5 flex items-center justify-end gap-1">
                                  <TrendingDown size={12} /> Menor Global
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center bg-slate-900/30 rounded-2xl border border-slate-800 text-slate-500">
              Selecione um mapa comparativo à esquerda para visualizar a matriz 3-Bid.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Inserir Cotação de Fornecedor */}
      {isAddingBidModalOpen && selectedMap && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building className="text-cyan-400" size={20} />
                  Inserir Cotação de Fornecedor
                </h3>
                <p className="text-xs text-slate-400">
                  Mapa: {selectedMap.code} — {selectedMap.title}
                </p>
              </div>
              <button
                onClick={() => setIsAddingBidModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBid} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fornecedor Homologado *
                  </label>
                  <select
                    value={bidSupplierId}
                    onChange={(e) => setBidSupplierId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (CNPJ: {s.cnpj})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nº Proposta / Cotação Fornecedor
                  </label>
                  <input
                    type="text"
                    value={bidQuoteNumber}
                    onChange={(e) => setBidQuoteNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                    placeholder="Ex: COT-9844/26"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tipo de Frete
                  </label>
                  <select
                    value={bidFreightType}
                    onChange={(e) => setBidFreightType(e.target.value as 'CIF' | 'FOB')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="CIF">CIF — Frete incluso pelo fornecedor</option>
                    <option value="FOB">FOB — Frete por nossa conta</option>
                  </select>
                </div>

                {bidFreightType === 'FOB' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Custo do Frete FOB (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bidFreightCost}
                      onChange={(e) => setBidFreightCost(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Condição de Pagamento
                  </label>
                  <input
                    type="text"
                    value={bidPaymentTerms}
                    onChange={(e) => setBidPaymentTerms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                    placeholder="Ex: 28 DDL, 30/60 DDL, À Vista"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Prazo de Entrega (Dias Úteis)
                  </label>
                  <input
                    type="number"
                    value={bidDeliveryDays}
                    onChange={(e) => setBidDeliveryDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                    required
                  />
                </div>
              </div>

              {/* Items Price Input */}
              <div className="border-t border-slate-800 pt-3">
                <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wider">
                  Preços Unitários por Item
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {selectedMap.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-white">{it.description}</p>
                        <p className="text-[10px] text-slate-400">
                          {it.quantity} {it.unit}
                        </p>
                      </div>
                      <div className="w-36">
                        <label className="text-[10px] text-slate-400 block mb-0.5">Preço Unit. (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={bidItemPrices[it.id] || ''}
                          onChange={(e) =>
                            setBidItemPrices({
                              ...bidItemPrices,
                              [it.id]: Number(e.target.value),
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-white"
                          required
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddingBidModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold shadow"
                >
                  {submitting ? 'Salvando...' : 'Adicionar ao Mapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Novo Mapa Comparativo */}
      {isNewMapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Criar Novo Mapa de Cotação</h3>
              <button onClick={() => setIsNewMapModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewMap} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Título do Mapa / Pacote *
                </label>
                <input
                  type="text"
                  value={newMapTitle}
                  onChange={(e) => setNewMapTitle(e.target.value)}
                  placeholder="Ex: Cotação Tubulação Inox Obra Petroquímica"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Vincular a uma Requisição de Compra (RC)
                </label>
                <select
                  value={selectedRequisitionId}
                  onChange={(e) => setSelectedRequisitionId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Nenhuma (criar lista avulsa)</option>
                  {requisitions
                    .filter((r) => r.status === 'pendente' || r.status === 'em_cotacao')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.title} ({r.items.length} itens)
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewMapModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold shadow"
                >
                  {submitting ? 'Criando...' : 'Criar Mapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Homologar Vencedor & Gerar OC */}
      {isHomologatingModalOpen && selectedMap && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Award className="text-amber-400" size={20} />
                  Homologar Proposta Vencedora
                </h3>
                <p className="text-xs text-slate-400">
                  Ao homologar, uma Ordem de Compra formal (OC) será gerada automaticamente.
                </p>
              </div>
              <button onClick={() => setIsHomologatingModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Selecione o Fornecedor Homologado *
                </label>
                <div className="space-y-2">
                  {selectedMap.bids.map((bid) => (
                    <label
                      key={bid.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        selectedWinnerBidId === bid.id
                          ? 'bg-cyan-500/10 border-cyan-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="winnerBid"
                          checked={selectedWinnerBidId === bid.id}
                          onChange={() => setSelectedWinnerBidId(bid.id)}
                          className="accent-cyan-500"
                        />
                        <div>
                          <p className="font-semibold text-sm">{bid.supplierName}</p>
                          <p className="text-[11px] text-slate-400">
                            Prazo: {bid.deliveryDays} dias • {bid.paymentTerms} • {bid.freightType}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-cyan-300">
                        {bid.totalValue.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Justificativa de Homologação (Auditoria Interna)
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Ex: Menor preço global e atendimento ao cronograma crítico de montagem..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsHomologatingModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleHomologateWinner}
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow transition"
                >
                  <FileCheck size={16} />
                  {submitting ? 'Gerando OC...' : 'Homologar & Gerar OC'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
