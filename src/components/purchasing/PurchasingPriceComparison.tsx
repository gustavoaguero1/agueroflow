import React, { useState, useMemo } from 'react';
import {
  Scale,
  CheckCircle2,
  Award,
  Truck,
  Calendar,
  DollarSign,
  TrendingDown,
  Building,
  Filter,
  Search,
  Plus,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Printer,
  ChevronDown,
  Layers,
  AlertCircle,
  FileCheck,
  CreditCard,
  Percent,
  Check,
  X,
  HelpCircle,
} from 'lucide-react';
import {
  PurchaseQuotationMap,
  PurchaseRequisition,
  PurchasingSupplier,
  SupplierBid,
  PurchaseOrder,
  PurchaseOrderItem,
} from '../../types/purchasing';
import {
  savePurchaseQuotation,
  savePurchaseOrder,
  updateRequisitionStatus,
} from '../../services/purchasingService';

interface PurchasingPriceComparisonProps {
  quotations: PurchaseQuotationMap[];
  requisitions: PurchaseRequisition[];
  suppliers: PurchasingSupplier[];
  currentOrgId: string;
  currentUserName: string;
  onRefresh: () => void;
  onSwitchToOrders: () => void;
}

interface ItemComparisonOption {
  key: string;
  itemId: string;
  description: string;
  specs?: string;
  unit: string;
  quantity: number;
  quotationMapId: string;
  quotationMapCode: string;
  requisitionCode?: string;
}

interface SupplierItemBidView {
  bidId: string;
  supplierId: string;
  supplierName: string;
  supplierCnpj?: string;
  contactName?: string;
  quoteNumber: string;
  quoteDate: string;
  validityDays: number;
  freightType: 'CIF' | 'FOB';
  freightCost: number;
  paymentTerms: string;
  deliveryDays: number;
  unitPrice: number;
  totalPrice: number;
  brand?: string;
  notes?: string;
  isWinner?: boolean;
}

export const PurchasingPriceComparison: React.FC<PurchasingPriceComparisonProps> = ({
  quotations,
  requisitions,
  suppliers,
  currentOrgId,
  currentUserName,
  onRefresh,
  onSwitchToOrders,
}) => {
  // 1. Build flattened selectable items across all quotations and requisitions
  const availableItems: ItemComparisonOption[] = useMemo(() => {
    const list: ItemComparisonOption[] = [];
    const seen = new Set<string>();

    // From quotations
    quotations.forEach((q) => {
      q.items.forEach((it) => {
        const key = `${q.id}_${it.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            key,
            itemId: it.id,
            description: it.description,
            specs: it.specs,
            unit: it.unit,
            quantity: it.quantity,
            quotationMapId: q.id,
            quotationMapCode: q.code,
            requisitionCode: q.requisitionCode,
          });
        }
      });
    });

    // If empty, provide baseline demonstration items
    if (list.length === 0) {
      list.push({
        key: 'default_1',
        itemId: 'it_rc_1',
        description: 'Tubo Aço Inox 304 com costura SCH 10 2" DN50 ASTM A312',
        specs: 'AISI 304, 2" SCH 10, Solda BW, Barras de 6m',
        unit: 'M',
        quantity: 60,
        quotationMapId: 'map_demo_01',
        quotationMapCode: 'MAP-2026-001',
        requisitionCode: 'RC-2026-001',
      });
    }

    return list;
  }, [quotations]);

  // Selected item key
  const [selectedItemKey, setSelectedItemKey] = useState<string>(
    availableItems[0]?.key || ''
  );
  const [searchTerm, setSearchTerm] = useState('');

  // Active selected item
  const activeItem = useMemo(() => {
    return (
      availableItems.find((it) => it.key === selectedItemKey) ||
      availableItems[0] ||
      null
    );
  }, [availableItems, selectedItemKey]);

  // Active quotation map containing this item
  const activeMap = useMemo(() => {
    if (!activeItem) return null;
    return quotations.find((q) => q.id === activeItem.quotationMapId) || null;
  }, [quotations, activeItem]);

  // Available bids for this item
  const allItemBids: SupplierItemBidView[] = useMemo(() => {
    if (!activeItem) return [];

    // If activeMap has bids, extract them
    if (activeMap && activeMap.bids.length > 0) {
      return activeMap.bids.map((b) => {
        const itPrice = b.itemsPrices.find((p) => p.itemId === activeItem.itemId);
        const unitPrice = itPrice ? itPrice.unitPrice : 0;
        const totalPrice = unitPrice * (activeItem.quantity || 1);

        return {
          bidId: b.id,
          supplierId: b.supplierId,
          supplierName: b.supplierName,
          supplierCnpj: b.supplierCnpj,
          contactName: b.contactName,
          quoteNumber: b.quoteNumber || 'COT-PADRAO',
          quoteDate: b.quoteDate || new Date().toISOString(),
          validityDays: b.validityDays || 15,
          freightType: b.freightType || 'CIF',
          freightCost: b.freightCost || 0,
          paymentTerms: b.paymentTerms || '28 DDL',
          deliveryDays: b.deliveryDays || 10,
          unitPrice,
          totalPrice,
          brand: itPrice?.brand || 'Aperam / Conforme MTR',
          notes: b.notes,
          isWinner: b.isWinner,
        };
      });
    }

    // Default demonstration bids if no bids loaded yet
    return [
      {
        bidId: 'bid_sup_1',
        supplierId: 'sup_aperam',
        supplierName: 'Aperam South America Indústria de Tubos',
        supplierCnpj: '60.872.504/0001-23',
        contactName: 'Carlos Guimarães',
        quoteNumber: 'COT-AP-2026-941',
        quoteDate: new Date().toISOString(),
        validityDays: 30,
        freightType: 'CIF',
        freightCost: 0,
        paymentTerms: '28 DDL',
        deliveryDays: 7,
        unitPrice: 85.5,
        totalPrice: 85.5 * (activeItem.quantity || 60),
        brand: 'Aperam Tubos Brasil',
        notes: 'Frete CIF incluso para o almoxarifado central. Certificado de usina incluso.',
        isWinner: true,
      },
      {
        bidId: 'bid_sup_2',
        supplierId: 'sup_granjo',
        supplierName: 'Aços Granjo Distribuidora de Inox',
        supplierCnpj: '04.112.983/0001-12',
        contactName: 'Marcos Vinicius',
        quoteNumber: 'COT-AG-8812',
        quoteDate: new Date().toISOString(),
        validityDays: 15,
        freightType: 'FOB',
        freightCost: 350,
        paymentTerms: '30 DDL',
        deliveryDays: 12,
        unitPrice: 92.0,
        totalPrice: 92.0 * (activeItem.quantity || 60),
        brand: 'Inox Tech',
        notes: 'Material a retirar em Guarulhos-SP ou FOB + frete transportadora parceira.',
        isWinner: false,
      },
      {
        bidId: 'bid_sup_3',
        supplierId: 'sup_marcegaglia',
        supplierName: 'Marcegaglia do Brasil Tubulações Industriais',
        supplierCnpj: '02.449.123/0001-44',
        contactName: 'Fabio Siqueira',
        quoteNumber: 'COT-MCG-2026-031',
        quoteDate: new Date().toISOString(),
        validityDays: 20,
        freightType: 'CIF',
        freightCost: 0,
        paymentTerms: '14/28 DDL',
        deliveryDays: 10,
        unitPrice: 88.0,
        totalPrice: 88.0 * (activeItem.quantity || 60),
        brand: 'Marcegaglia ASTM A312',
        notes: 'Barras calibradas com teste hidrostático e correntes parasitas (Eddy Current).',
        isWinner: false,
      },
    ];
  }, [activeMap, activeItem]);

  // Selected bids for side-by-side comparison (multi-select)
  const [selectedBidIds, setSelectedBidIds] = useState<string[]>([]);

  // Sync selected bids when active item changes
  React.useEffect(() => {
    if (allItemBids.length > 0) {
      setSelectedBidIds(allItemBids.map((b) => b.bidId));
    } else {
      setSelectedBidIds([]);
    }
  }, [allItemBids]);

  const toggleBidSelection = (bidId: string) => {
    setSelectedBidIds((prev) => {
      if (prev.includes(bidId)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((id) => id !== bidId);
      } else {
        return [...prev, bidId];
      }
    });
  };

  // Filtered bids to compare side-by-side
  const comparedBids = useMemo(() => {
    return allItemBids.filter((b) => selectedBidIds.includes(b.bidId));
  }, [allItemBids, selectedBidIds]);

  // Comparative metrics
  const comparisonAnalysis = useMemo(() => {
    if (comparedBids.length === 0) return null;

    const validPrices = comparedBids
      .map((b) => b.unitPrice)
      .filter((p) => p > 0);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;
    const avgPrice =
      validPrices.length > 0
        ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length
        : 0;

    const minDeliveryDays = Math.min(...comparedBids.map((b) => b.deliveryDays || 999));

    // Decision Score calculation for each bid:
    // 50% Price + 30% Delivery + 20% Commercial/Freight
    const scoredBids = comparedBids.map((b) => {
      const priceScore =
        maxPrice > minPrice
          ? 100 - ((b.unitPrice - minPrice) / (maxPrice - minPrice)) * 50
          : 100;

      const maxDelivery = Math.max(...comparedBids.map((x) => x.deliveryDays || 10));
      const deliveryScore =
        maxDelivery > minDeliveryDays
          ? 100 - ((b.deliveryDays - minDeliveryDays) / (maxDelivery - minDeliveryDays)) * 40
          : 100;

      const termsScore =
        b.freightType === 'CIF' ? 100 : 70; // Bonus for CIF freight

      const compositeScore = Math.round(
        priceScore * 0.5 + deliveryScore * 0.3 + termsScore * 0.2
      );

      return {
        ...b,
        compositeScore,
        isLowestPrice: b.unitPrice === minPrice && minPrice > 0,
        isFastestDelivery: b.deliveryDays === minDeliveryDays,
        savingsVsHighest:
          b.unitPrice > 0 && maxPrice > b.unitPrice
            ? ((maxPrice - b.unitPrice) / maxPrice) * 100
            : 0,
      };
    });

    const recommendedBid = [...scoredBids].sort((a, b) => b.compositeScore - a.compositeScore)[0];

    return {
      minPrice,
      maxPrice,
      avgPrice,
      minDeliveryDays,
      scoredBids,
      recommendedBid,
    };
  }, [comparedBids]);

  // Modal State for Quick Bid Insertion
  const [isQuickBidModalOpen, setIsQuickBidModalOpen] = useState(false);
  const [quickSupplierId, setQuickSupplierId] = useState(suppliers[0]?.id || '');
  const [quickUnitPrice, setQuickUnitPrice] = useState<number>(85.0);
  const [quickDeliveryDays, setQuickDeliveryDays] = useState<number>(7);
  const [quickPaymentTerms, setQuickPaymentTerms] = useState<string>('28 DDL');
  const [quickFreightType, setQuickFreightType] = useState<'CIF' | 'FOB'>('CIF');
  const [quickFreightCost, setQuickFreightCost] = useState<number>(0);
  const [quickBrand, setQuickBrand] = useState<string>('Aperam');
  const [quickNotes, setQuickNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Modal State for Homologation
  const [isHomologatingModalOpen, setIsHomologatingModalOpen] = useState(false);
  const [winnerBidToHomologate, setWinnerBidToHomologate] = useState<SupplierItemBidView | null>(null);
  const [homologationJustification, setHomologationJustification] = useState('');

  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Quick Bid submit
  const handleSaveQuickBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    const sup = suppliers.find((s) => s.id === quickSupplierId);
    if (!sup) {
      alert('Selecione um fornecedor cadastrado.');
      return;
    }

    setSubmitting(true);
    try {
      const targetMap = activeMap || {
        id: activeItem.quotationMapId || `map_${Date.now()}`,
        organizationId: currentOrgId,
        code: activeItem.quotationMapCode || `MAP-2026-${String(quotations.length + 1).padStart(3, '0')}`,
        title: `Tomada de Preços — ${activeItem.description}`,
        requisitionCode: activeItem.requisitionCode,
        items: [
          {
            id: activeItem.itemId,
            description: activeItem.description,
            specs: activeItem.specs,
            unit: activeItem.unit,
            quantity: activeItem.quantity,
          },
        ],
        bids: [],
        status: 'em_analise' as const,
        buyerName: currentUserName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const newBid: SupplierBid = {
        id: `bid_${Date.now()}`,
        supplierId: sup.id,
        supplierName: sup.name,
        supplierCnpj: sup.cnpj,
        contactName: sup.contactPerson,
        quoteNumber: `COT-${Date.now().toString().slice(-4)}`,
        quoteDate: new Date().toISOString(),
        validityDays: 15,
        freightType: quickFreightType,
        freightCost: quickFreightCost,
        paymentTerms: quickPaymentTerms,
        deliveryDays: quickDeliveryDays,
        itemsPrices: [
          {
            itemId: activeItem.itemId,
            unitPrice: Number(quickUnitPrice) || 0,
            totalPrice: (Number(quickUnitPrice) || 0) * (activeItem.quantity || 1),
            brand: quickBrand,
            deliveryDays: quickDeliveryDays,
            notes: quickNotes,
          },
        ],
        totalValue:
          (Number(quickUnitPrice) || 0) * (activeItem.quantity || 1) +
          (quickFreightType === 'FOB' ? quickFreightCost : 0),
        notes: quickNotes,
      };

      const updatedMap: PurchaseQuotationMap = {
        ...targetMap,
        bids: [...targetMap.bids, newBid],
        updatedAt: new Date().toISOString(),
      };

      await savePurchaseQuotation(updatedMap);
      setIsQuickBidModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Erro ao adicionar cotação rápida:', err);
      alert('Erro ao salvar proposta do fornecedor.');
    } finally {
      setSubmitting(false);
    }
  };

  // Homologate winner and auto-generate Purchase Order
  const handleHomologateAndGenerateOrder = async () => {
    if (!winnerBidToHomologate || !activeItem) return;

    setSubmitting(true);
    try {
      const orderId = `oc_${Date.now()}`;
      const orderCode = `OC-2026-${String(Math.floor(Math.random() * 900) + 100)}`;
      const totalItemValue = winnerBidToHomologate.unitPrice * (activeItem.quantity || 1);
      const grandTotal =
        totalItemValue +
        (winnerBidToHomologate.freightType === 'FOB' ? winnerBidToHomologate.freightCost : 0);

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + (winnerBidToHomologate.deliveryDays || 7));

      const newOrder: PurchaseOrder = {
        id: orderId,
        organizationId: currentOrgId,
        code: orderCode,
        requisitionCode: activeItem.requisitionCode,
        quotationMapCode: activeItem.quotationMapCode,
        linkedWorkOrderId: activeMap?.linkedWorkOrderId,
        linkedWorkOrderNumber: activeMap?.linkedWorkOrderNumber,
        linkedWorkOrderTitle: activeMap?.linkedWorkOrderTitle,
        supplierId: winnerBidToHomologate.supplierId,
        supplierName: winnerBidToHomologate.supplierName,
        supplierCnpj: winnerBidToHomologate.supplierCnpj || '00.000.000/0001-00',
        supplierContact: winnerBidToHomologate.contactName,
        buyerId: 'buyer_active',
        buyerName: currentUserName,
        emissionDate: new Date().toISOString(),
        expectedDeliveryDate: expectedDate.toISOString().split('T')[0],
        deliveryLocation: 'Almoxarifado Central Aguero Inox (Docas Industriais)',
        billingAddress: 'Aguero Inox & Montagens Industriais S/A (Matriz)',
        paymentTerms: winnerBidToHomologate.paymentTerms,
        freightType: winnerBidToHomologate.freightType,
        freightValue: winnerBidToHomologate.freightCost || 0,
        items: [
          {
            id: `oc_it_${Date.now()}_1`,
            itemNumber: 1,
            internalCode: `MP-${activeItem.itemId.slice(-6)}`,
            description: activeItem.description,
            specs: activeItem.specs,
            unit: activeItem.unit,
            quantityOrdered: activeItem.quantity,
            quantityReceived: 0,
            unitPrice: winnerBidToHomologate.unitPrice,
            totalPrice: totalItemValue,
            brand: winnerBidToHomologate.brand,
          },
        ],
        subtotal: totalItemValue,
        taxValue: 0,
        totalValue: grandTotal,
        status: 'emitida',
        notes: `Homologado via Módulo de Tomada de Preços. Vencedor: ${winnerBidToHomologate.supplierName}. Justificativa: ${homologationJustification || 'Menor preço e melhor prazo equalizado.'}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to Firebase Firestore
      await savePurchaseOrder(newOrder);

      // If tied to quotation map, update map status
      if (activeMap) {
        const updatedMap: PurchaseQuotationMap = {
          ...activeMap,
          winningSupplierId: winnerBidToHomologate.supplierId,
          winningSupplierName: winnerBidToHomologate.supplierName,
          winningJustification:
            homologationJustification || 'Vencedor homologado via Tomada de Preços lado a lado.',
          status: 'homologado',
          updatedAt: new Date().toISOString(),
        };
        await savePurchaseQuotation(updatedMap);
      }

      setIsHomologatingModalOpen(false);
      onRefresh();
      alert(`🎉 Sucesso! Ordem de Compra ${orderCode} emitida e homologada para ${winnerBidToHomologate.supplierName}.`);
      onSwitchToOrders();
    } catch (err) {
      console.error('Erro na homologação da tomada de preços:', err);
      alert('Erro ao homologar fornecedor e gerar OC.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/20">
              <Scale size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Tomada de Preços & Comparativo de Propostas
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Equalização Lado a Lado
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Selecione múltiplas cotações recebidas de diferentes fornecedores para o mesmo item e compare lado a lado menor preço, prazos e condições de pagamento.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setQuickSupplierId(suppliers[0]?.id || '');
              setQuickUnitPrice(0);
              setIsQuickBidModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20 transition cursor-pointer"
          >
            <Plus size={15} /> Inserir Cotação Rápida
          </button>
        </div>
      </div>

      {/* Item Selector & Filter Bar */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Item Selector Dropdown */}
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers size={14} className="text-cyan-400" />
              Selecione o Item para Equalização da Tomada de Preços:
            </label>
            <div className="relative">
              <select
                value={selectedItemKey}
                onChange={(e) => setSelectedItemKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-medium focus:ring-2 focus:ring-cyan-500 focus:outline-none appearance-none cursor-pointer"
              >
                {availableItems.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.description} ({opt.quantity} {opt.unit}) — Ref: {opt.quotationMapCode}
                    {opt.requisitionCode ? ` [${opt.requisitionCode}]` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Quick Item Specs Badge */}
          {activeItem && (
            <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800 text-xs text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Demanda</span>
                <span className="font-mono font-bold text-white">
                  {activeItem.quantity} {activeItem.unit}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Cotações</span>
                <span className="font-mono font-bold text-cyan-400">
                  {allItemBids.length} recebidas
                </span>
              </div>
              {activeItem.specs && (
                <>
                  <div className="h-6 w-px bg-slate-800" />
                  <div className="hidden sm:block max-w-[220px] truncate">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Especificação</span>
                    <span className="text-slate-300 text-[11px] truncate">{activeItem.specs}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Multi-Select Toggles for Suppliers */}
        {allItemBids.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <CheckCircle2 size={13} className="text-cyan-400" /> Fornecedores no Comparativo:
            </span>
            {allItemBids.map((bid) => {
              const isSelected = selectedBidIds.includes(bid.bidId);
              return (
                <button
                  key={bid.bidId}
                  onClick={() => toggleBidSelection(bid.bidId)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium border transition cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                      : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] ${
                      isSelected ? 'bg-cyan-500 text-slate-950 font-bold' : 'border border-slate-700'
                    }`}
                  >
                    {isSelected && <Check size={10} />}
                  </span>
                  <span>{bid.supplierName}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Comparative View: Side-by-Side Matrix */}
      {comparedBids.length === 0 ? (
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-12 text-center">
          <AlertCircle size={36} className="text-amber-400 mx-auto mb-3" />
          <h4 className="text-base font-bold text-white">Nenhuma cotação selecionada para comparação</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Selecione pelo menos um fornecedor no filtro acima ou insira uma nova cotação rápida para gerar a tabela comparativa.
          </p>
          <button
            onClick={() => setSelectedBidIds(allItemBids.map((b) => b.bidId))}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-xl text-xs font-semibold"
          >
            Selecionar Todos os Fornecedores
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Executive Decision Assistant Banner */}
          {comparisonAnalysis && comparisonAnalysis.recommendedBid && (
            <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/30 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 mt-0.5">
                  <Award size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Recomendação Ótima de Compra
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      Score: {comparisonAnalysis.recommendedBid.compositeScore}/100
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {comparisonAnalysis.recommendedBid.supplierName}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                    Melhor custo-benefício ponderado: menor preço de{' '}
                    <strong className="text-emerald-400">
                      {formatBrl(comparisonAnalysis.recommendedBid.unitPrice)}/{activeItem?.unit}
                    </strong>{' '}
                    ({comparisonAnalysis.recommendedBid.savingsVsHighest > 0
                      ? `${comparisonAnalysis.recommendedBid.savingsVsHighest.toFixed(1)}% mais econômico que a proposta mais alta`
                      : 'melhor oferta'}), com entrega em apenas{' '}
                    <strong className="text-cyan-300">
                      {comparisonAnalysis.recommendedBid.deliveryDays} dias
                    </strong>{' '}
                    e frete {comparisonAnalysis.recommendedBid.freightType}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-end">
                <button
                  onClick={() => {
                    setWinnerBidToHomologate(comparisonAnalysis.recommendedBid);
                    setHomologationJustification(
                      `Homologado via Tomada de Preços: Menor preço de ${formatBrl(
                        comparisonAnalysis.recommendedBid.unitPrice
                      )} e prazo de ${comparisonAnalysis.recommendedBid.deliveryDays} dias.`
                    );
                    setIsHomologatingModalOpen(true);
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <FileCheck size={16} /> Homologar & Gerar OC
                </button>
              </div>
            </div>
          )}

          {/* Side-by-Side Comparative Table */}
          <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Scale className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Matriz Comparativa Lado a Lado ({comparedBids.length} Cotações)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Item: <strong className="text-slate-200">{activeItem?.description}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                    <th className="p-3.5 font-semibold w-56 bg-slate-950 sticky left-0 z-10 border-r border-slate-800">
                      Critério de Decisão
                    </th>
                    {comparedBids.map((bid) => {
                      const isRecommended =
                        comparisonAnalysis?.recommendedBid?.bidId === bid.bidId;
                      return (
                        <th
                          key={bid.bidId}
                          className={`p-3.5 font-semibold min-w-[230px] border-r border-slate-800/80 align-top ${
                            isRecommended ? 'bg-emerald-950/25' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                                {isRecommended && (
                                  <Award size={15} className="text-emerald-400 shrink-0" />
                                )}
                                <span className="line-clamp-1">{bid.supplierName}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                Cotação: {bid.quoteNumber}
                              </span>
                            </div>
                            {isRecommended && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                                1º Escolha
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {/* Row 1: Preço Unitário (Key Feature: highlight lowest) */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="flex items-center gap-1.5 text-white">
                        <DollarSign size={15} className="text-emerald-400" />
                        <span>Preço Unitário ({activeItem?.unit})</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal">Valor líquido sem frete</span>
                    </td>
                    {comparedBids.map((bid) => {
                      const isLowest =
                        comparisonAnalysis &&
                        bid.unitPrice === comparisonAnalysis.minPrice &&
                        comparisonAnalysis.minPrice > 0;

                      return (
                        <td
                          key={bid.bidId}
                          className={`p-3.5 font-mono border-r border-slate-800/80 ${
                            isLowest ? 'bg-emerald-950/30' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-base font-extrabold ${
                                isLowest ? 'text-emerald-400' : 'text-slate-200'
                              }`}
                            >
                              {formatBrl(bid.unitPrice)}
                            </span>
                            {isLowest && (
                              <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
                                <TrendingDown size={11} /> Menor Preço
                              </span>
                            )}
                          </div>
                          {comparisonAnalysis && comparisonAnalysis.maxPrice > bid.unitPrice && (
                            <span className="text-[10px] text-emerald-400/90 block mt-1 font-sans">
                              {(
                                ((comparisonAnalysis.maxPrice - bid.unitPrice) /
                                  comparisonAnalysis.maxPrice) *
                                100
                              ).toFixed(1)}
                              % abaixo da proposta mais alta
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row 2: Preço Total do Lote */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="text-white">Total do Lote</div>
                      <span className="text-[10px] text-slate-500 font-normal">
                        Para {activeItem?.quantity} {activeItem?.unit}
                      </span>
                    </td>
                    {comparedBids.map((bid) => {
                      const lotTotal = bid.unitPrice * (activeItem?.quantity || 1);
                      return (
                        <td key={bid.bidId} className="p-3.5 font-mono border-r border-slate-800/80">
                          <span className="text-sm font-bold text-white">{formatBrl(lotTotal)}</span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row 3: Prazo de Entrega (Key Feature: highlight fastest) */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="flex items-center gap-1.5 text-white">
                        <Clock size={15} className="text-cyan-400" />
                        <span>Prazo de Entrega</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal">Dias corridos para entrega</span>
                    </td>
                    {comparedBids.map((bid) => {
                      const isFastest =
                        comparisonAnalysis &&
                        bid.deliveryDays === comparisonAnalysis.minDeliveryDays;

                      return (
                        <td
                          key={bid.bidId}
                          className={`p-3.5 border-r border-slate-800/80 ${
                            isFastest ? 'bg-cyan-950/20' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-sm font-bold ${
                                isFastest ? 'text-cyan-300' : 'text-slate-300'
                              }`}
                            >
                              {bid.deliveryDays} dias
                            </span>
                            {isFastest && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                <Clock size={11} /> Mais Rápido
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Previsão:{' '}
                            {new Date(
                              Date.now() + (bid.deliveryDays || 7) * 86400000
                            ).toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row 4: Condições de Pagamento (Key Feature: highlight best terms) */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="flex items-center gap-1.5 text-white">
                        <CreditCard size={15} className="text-purple-400" />
                        <span>Condições de Pagamento</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal">Prazo financeiro / DDL</span>
                    </td>
                    {comparedBids.map((bid) => {
                      const isExtended =
                        bid.paymentTerms.includes('30') ||
                        bid.paymentTerms.includes('60') ||
                        bid.paymentTerms.includes('28');

                      return (
                        <td key={bid.bidId} className="p-3.5 border-r border-slate-800/80">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{bid.paymentTerms}</span>
                            {isExtended && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                Fluxo Favorável
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Faturamento via boleto industrial
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row 5: Frete & Logística */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="flex items-center gap-1.5 text-white">
                        <Truck size={15} className="text-amber-400" />
                        <span>Modalidade de Frete</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal">CIF (incluso) vs FOB</span>
                    </td>
                    {comparedBids.map((bid) => {
                      const isCif = bid.freightType === 'CIF';
                      return (
                        <td key={bid.bidId} className="p-3.5 border-r border-slate-800/80">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded ${
                                isCif
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              Frete {bid.freightType}
                            </span>
                            {bid.freightCost > 0 && (
                              <span className="text-[11px] font-mono text-slate-300">
                                +{formatBrl(bid.freightCost)}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            {isCif
                              ? 'Entregue no almoxarifado sem custo extra'
                              : 'Frete FOB por conta da AgueroFlow'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row 6: Marca / Usina & Procedência */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="text-white">Marca / Fabricante</div>
                      <span className="text-[10px] text-slate-500 font-normal">Procedência do insumo</span>
                    </td>
                    {comparedBids.map((bid) => (
                      <td key={bid.bidId} className="p-3.5 border-r border-slate-800/80">
                        <span className="text-xs font-medium text-slate-200">
                          {bid.brand || 'Usina Nacional Qualificada'}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 mt-1">
                          <ShieldCheck size={12} />
                          <span>MTR / Corrida Incluso</span>
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row 7: Validade da Cotação */}
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3.5 font-semibold text-slate-300 bg-slate-950/90 sticky left-0 z-10 border-r border-slate-800">
                      <div className="text-white">Validade da Proposta</div>
                      <span className="text-[10px] text-slate-500 font-normal">Garantia de preços</span>
                    </td>
                    {comparedBids.map((bid) => (
                      <td key={bid.bidId} className="p-3.5 border-r border-slate-800/80">
                        <span className="text-xs font-medium text-slate-300">
                          {bid.validityDays} dias corridos
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Emitida em {new Date(bid.quoteDate).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Row 8: Ação de Homologação Individual */}
                  <tr className="bg-slate-950/70 border-t-2 border-slate-700">
                    <td className="p-3.5 font-bold uppercase text-[11px] text-cyan-400 bg-slate-950 sticky left-0 z-10 border-r border-slate-800">
                      Decisão de Compra
                    </td>
                    {comparedBids.map((bid) => {
                      const isRecommended =
                        comparisonAnalysis?.recommendedBid?.bidId === bid.bidId;
                      return (
                        <td
                          key={bid.bidId}
                          className={`p-3.5 border-r border-slate-800/80 ${
                            isRecommended ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          <button
                            onClick={() => {
                              setWinnerBidToHomologate(bid);
                              setHomologationJustification(
                                `Homologado via Tomada de Preços. Preço unitário: ${formatBrl(
                                  bid.unitPrice
                                )}, prazo: ${bid.deliveryDays} dias, pagamento: ${bid.paymentTerms}.`
                              );
                              setIsHomologatingModalOpen(true);
                            }}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow ${
                              isRecommended
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700'
                            }`}
                          >
                            <Award size={14} />
                            <span>Homologar Proposta</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inserir Nova Cotação Rápida */}
      {isQuickBidModalOpen && activeItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building className="text-cyan-400" size={20} />
                  Inserir Nova Cotação de Fornecedor
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Item: <strong className="text-slate-200">{activeItem.description}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsQuickBidModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveQuickBid} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Fornecedor *
                </label>
                <select
                  value={quickSupplierId}
                  onChange={(e) => setQuickSupplierId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city}/{s.state})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Preço Unitário (R$ por {activeItem.unit}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickUnitPrice}
                    onChange={(e) => setQuickUnitPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Prazo de Entrega (Dias) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quickDeliveryDays}
                    onChange={(e) => setQuickDeliveryDays(parseInt(e.target.value, 10) || 7)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Condição de Pagamento *
                  </label>
                  <select
                    value={quickPaymentTerms}
                    onChange={(e) => setQuickPaymentTerms(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="28 DDL">28 DDL (Padrão)</option>
                    <option value="30 DDL">30 DDL</option>
                    <option value="30/60 DDL">30/60 DDL</option>
                    <option value="14/28 DDL">14/28 DDL</option>
                    <option value="À Vista com 3% desc">À Vista com 3% desc</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Frete *
                  </label>
                  <select
                    value={quickFreightType}
                    onChange={(e) => setQuickFreightType(e.target.value as 'CIF' | 'FOB')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="CIF">CIF (Incluso no preço)</option>
                    <option value="FOB">FOB (A pagar separado)</option>
                  </select>
                </div>
              </div>

              {quickFreightType === 'FOB' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Valor do Frete FOB (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickFreightCost}
                    onChange={(e) => setQuickFreightCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Marca / Usina Fabricante
                </label>
                <input
                  type="text"
                  value={quickBrand}
                  onChange={(e) => setQuickBrand(e.target.value)}
                  placeholder="Ex: Aperam, Bray, Tenaris, Conforja..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Observações Técnicas / Comerciais
                </label>
                <textarea
                  rows={2}
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  placeholder="Ex: Preço especial para lote de 60 metros, barras calibradas..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsQuickBidModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus size={15} />
                  <span>{submitting ? 'Salvando...' : 'Adicionar ao Comparativo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Homologação e Emissão de Ordem de Compra */}
      {isHomologatingModalOpen && winnerBidToHomologate && activeItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Award className="text-emerald-400" size={20} />
                Confirmar Homologação & Emitir Pedido (OC)
              </h3>
              <button
                onClick={() => setIsHomologatingModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Fornecedor Vencedor:</span>
                <strong className="text-white">{winnerBidToHomologate.supplierName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Item Requisitado:</span>
                <span className="text-slate-200">{activeItem.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Quantidade & Preço:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {activeItem.quantity} {activeItem.unit} x {formatBrl(winnerBidToHomologate.unitPrice)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prazo de Entrega:</span>
                <span className="text-cyan-300 font-semibold">{winnerBidToHomologate.deliveryDays} dias</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Condições de Pagamento:</span>
                <span className="text-slate-200">{winnerBidToHomologate.paymentTerms}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-emerald-500/20">
                <span className="text-slate-300 font-bold">Total da Ordem de Compra:</span>
                <strong className="text-emerald-300 font-mono text-sm">
                  {formatBrl(
                    winnerBidToHomologate.unitPrice * (activeItem.quantity || 1) +
                      (winnerBidToHomologate.freightType === 'FOB' ? winnerBidToHomologate.freightCost : 0)
                  )}
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Justificativa da Homologação (Auditoria de Compras) *
              </label>
              <textarea
                rows={3}
                value={homologationJustification}
                onChange={(e) => setHomologationJustification(e.target.value)}
                placeholder="Ex: Menor preço unitário após equalização técnica 3-Bid, prazo condizente com a obra..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsHomologatingModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={handleHomologateAndGenerateOrder}
                disabled={submitting}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <FileCheck size={16} />
                <span>{submitting ? 'Gerando Ordem...' : 'Confirmar e Emitir OC'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
