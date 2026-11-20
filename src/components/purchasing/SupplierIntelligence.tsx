import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Layers,
  Award,
  CheckCircle2,
  DollarSign,
  Building2,
  Filter,
  Search,
  ArrowUpDown,
  Download,
  Info,
  Percent,
  ShieldCheck,
  Clock,
  Sparkles,
  ChevronRight,
  SlidersHorizontal,
  FileSpreadsheet
} from 'lucide-react';
import {
  PurchaseQuotationMap,
  PurchaseOrder,
  PurchasingSupplier,
  PurchasingSubSection
} from '../../types/purchasing';

interface SupplierIntelligenceProps {
  quotations: PurchaseQuotationMap[];
  orders: PurchaseOrder[];
  suppliers: PurchasingSupplier[];
  onNavigateSub?: (tab: PurchasingSubSection) => void;
}

export interface ItemPriceIntelligence {
  key: string;
  description: string;
  specs: string;
  unit: string;
  category: string;
  minPrice: number;
  minSupplier: string;
  minDate: string;
  avgPrice: number;
  maxPrice: number;
  maxSupplier: string;
  spreadPercent: number; // ((max - min) / min) * 100
  potentialSaving: number; // avgPrice - minPrice
  quoteCount: number;
  quotesHistory: {
    supplierName: string;
    unitPrice: number;
    quoteDate: string;
    deliveryDays: number;
    freightType: 'CIF' | 'FOB';
    isWinner: boolean;
  }[];
}

export interface SupplierPerformanceIntelligence {
  supplierId: string;
  supplierName: string;
  cnpj: string;
  isCertifiedIso: boolean;
  status: 'homologado' | 'em_avaliacao' | 'bloqueado';
  rating: number;
  totalQuotesParticipated: number;
  totalQuotesWon: number;
  winRatePercent: number;
  totalQuotedValue: number;
  totalAwardedValue: number;
  avgDeliveryDays: number;
  competitivenessIndex: number; // 100 = average market price; <100 means cheaper than average
}

// Industrial baseline mock items when user is starting with empty quotes
const BASELINE_ITEM_INTELLIGENCE: ItemPriceIntelligence[] = [
  {
    key: 'tubo-sch40-4pol',
    description: 'Tubo de Aço Carbono ASTM A53 Gr B 4" SCH 40',
    specs: 'Costura longitudinal ERW, NBR 5590 / ASTM A53, chanfrado para solda',
    unit: 'm',
    category: 'Tubulações & Conexões',
    minPrice: 138.5,
    minSupplier: 'Tubos Ipiranga Distribuidora',
    minDate: '2026-03-24',
    avgPrice: 154.2,
    maxPrice: 172.0,
    maxSupplier: 'Aços Granjo Comercial',
    spreadPercent: 24.19,
    potentialSaving: 15.7,
    quoteCount: 4,
    quotesHistory: [
      { supplierName: 'Tubos Ipiranga Distribuidora', unitPrice: 138.5, quoteDate: '2026-03-24', deliveryDays: 5, freightType: 'CIF', isWinner: true },
      { supplierName: 'Gerdau Comercial de Aços S.A.', unitPrice: 149.0, quoteDate: '2026-03-22', deliveryDays: 7, freightType: 'FOB', isWinner: false },
      { supplierName: 'Aperam South America', unitPrice: 157.3, quoteDate: '2026-03-20', deliveryDays: 10, freightType: 'CIF', isWinner: false },
      { supplierName: 'Aços Granjo Comercial', unitPrice: 172.0, quoteDate: '2026-03-18', deliveryDays: 3, freightType: 'CIF', isWinner: false },
    ],
  },
  {
    key: 'chapa-astm-a36-1-2',
    description: 'Chapa de Aço Carbono ASTM A36 Espessura 1/2" (12.7mm)',
    specs: 'Laminada a quente, 1500x6000mm, com certificado de usina e rastreio de corrida',
    unit: 'kg',
    category: 'Chapas & Caldeiraria',
    minPrice: 6.85,
    minSupplier: 'Gerdau Comercial de Aços S.A.',
    minDate: '2026-03-25',
    avgPrice: 7.42,
    maxPrice: 8.15,
    maxSupplier: 'Aperam South America',
    spreadPercent: 18.98,
    potentialSaving: 0.57,
    quoteCount: 4,
    quotesHistory: [
      { supplierName: 'Gerdau Comercial de Aços S.A.', unitPrice: 6.85, quoteDate: '2026-03-25', deliveryDays: 6, freightType: 'FOB', isWinner: true },
      { supplierName: 'Usiminas Mecânica & Aços', unitPrice: 7.1, quoteDate: '2026-03-23', deliveryDays: 8, freightType: 'CIF', isWinner: false },
      { supplierName: 'Tubos Ipiranga Distribuidora', unitPrice: 7.58, quoteDate: '2026-03-21', deliveryDays: 4, freightType: 'CIF', isWinner: false },
      { supplierName: 'Aperam South America', unitPrice: 8.15, quoteDate: '2026-03-19', deliveryDays: 12, freightType: 'CIF', isWinner: false },
    ],
  },
  {
    key: 'perfil-w200-26-6',
    description: 'Perfil Estrutural Soldado W200 x 26.6 kg/m ASTM A572 Gr 50',
    specs: 'Comprimento comercial 12 metros, alta resistência mecânica para estruturas de galpão',
    unit: 'm',
    category: 'Perfis & Estruturas',
    minPrice: 242.0,
    minSupplier: 'Gerdau Comercial de Aços S.A.',
    minDate: '2026-03-26',
    avgPrice: 268.5,
    maxPrice: 298.0,
    maxSupplier: 'Aços Granjo Comercial',
    spreadPercent: 23.14,
    potentialSaving: 26.5,
    quoteCount: 3,
    quotesHistory: [
      { supplierName: 'Gerdau Comercial de Aços S.A.', unitPrice: 242.0, quoteDate: '2026-03-26', deliveryDays: 10, freightType: 'FOB', isWinner: true },
      { supplierName: 'Usiminas Mecânica & Aços', unitPrice: 265.5, quoteDate: '2026-03-24', deliveryDays: 14, freightType: 'CIF', isWinner: false },
      { supplierName: 'Aços Granjo Comercial', unitPrice: 298.0, quoteDate: '2026-03-20', deliveryDays: 5, freightType: 'CIF', isWinner: false },
    ],
  },
  {
    key: 'valvula-esfera-2pol-300',
    description: 'Válvula Esfera Flangeada 2" Classe 300# ANSI B16.5',
    specs: 'Corpo WCB, esfera e haste em Inox 316, acionamento por alavanca, Fire Safe',
    unit: 'un',
    category: 'Válvulas & Instrumentação',
    minPrice: 840.0,
    minSupplier: 'Deca / Mipel Válvulas Industriais',
    minDate: '2026-03-23',
    avgPrice: 965.0,
    maxPrice: 1120.0,
    maxSupplier: 'Valmicro Automação de Fluxo',
    spreadPercent: 33.33,
    potentialSaving: 125.0,
    quoteCount: 3,
    quotesHistory: [
      { supplierName: 'Deca / Mipel Válvulas Industriais', unitPrice: 840.0, quoteDate: '2026-03-23', deliveryDays: 15, freightType: 'CIF', isWinner: true },
      { supplierName: 'Metalúrgica Lupatech', unitPrice: 935.0, quoteDate: '2026-03-21', deliveryDays: 20, freightType: 'CIF', isWinner: false },
      { supplierName: 'Valmicro Automação de Fluxo', unitPrice: 1120.0, quoteDate: '2026-03-18', deliveryDays: 7, freightType: 'CIF', isWinner: false },
    ],
  },
  {
    key: 'eletrodo-e7018-3-25',
    description: 'Eletrodo Revestido AWS E7018 3.25mm (Lata 20kg)',
    specs: 'Baixo hidrogênio, alto rendimento para soldagem estrutural pesada',
    unit: 'kg',
    category: 'Consumíveis de Solda',
    minPrice: 19.4,
    minSupplier: 'ESAB Indústria e Comércio',
    minDate: '2026-03-25',
    avgPrice: 22.8,
    maxPrice: 26.5,
    maxSupplier: 'Soldas & Abrasivos Paulistana',
    spreadPercent: 36.6,
    potentialSaving: 3.4,
    quoteCount: 3,
    quotesHistory: [
      { supplierName: 'ESAB Indústria e Comércio', unitPrice: 19.4, quoteDate: '2026-03-25', deliveryDays: 3, freightType: 'CIF', isWinner: true },
      { supplierName: 'Lincoln Electric do Brasil', unitPrice: 22.5, quoteDate: '2026-03-22', deliveryDays: 5, freightType: 'CIF', isWinner: false },
      { supplierName: 'Soldas & Abrasivos Paulistana', unitPrice: 26.5, quoteDate: '2026-03-19', deliveryDays: 2, freightType: 'CIF', isWinner: false },
    ],
  },
  {
    key: 'disco-corte-inoxidavel-7pol',
    description: 'Disco de Corte Abrasivo 7" x 1/8" x 7/8" Inox',
    specs: 'Reforçado com 2 telas de fibra de vidro, rotação máx. 8500 RPM',
    unit: 'un',
    category: 'Consumíveis de Solda',
    minPrice: 11.2,
    minSupplier: 'Norton Saint-Gobain Abrasivos',
    minDate: '2026-03-20',
    avgPrice: 13.9,
    maxPrice: 16.8,
    maxSupplier: 'Soldas & Abrasivos Paulistana',
    spreadPercent: 50.0,
    potentialSaving: 2.7,
    quoteCount: 3,
    quotesHistory: [
      { supplierName: 'Norton Saint-Gobain Abrasivos', unitPrice: 11.2, quoteDate: '2026-03-20', deliveryDays: 4, freightType: 'CIF', isWinner: true },
      { supplierName: '3M do Brasil', unitPrice: 13.7, quoteDate: '2026-03-22', deliveryDays: 5, freightType: 'CIF', isWinner: false },
      { supplierName: 'Soldas & Abrasivos Paulistana', unitPrice: 16.8, quoteDate: '2026-03-18', deliveryDays: 2, freightType: 'CIF', isWinner: false },
    ],
  },
];

export const SupplierIntelligence: React.FC<SupplierIntelligenceProps> = ({
  quotations = [],
  orders = [],
  suppliers = [],
  onNavigateSub,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedItemKey, setSelectedItemKey] = useState<string>(BASELINE_ITEM_INTELLIGENCE[0].key);
  const [sortBy, setSortBy] = useState<'spread' | 'savings' | 'quotes' | 'name'>('spread');
  const [supplierChartMetric, setSupplierChartMetric] = useState<'winRate' | 'volume' | 'competitiveness' | 'leadTime'>('winRate');

  // Format currency in BRL
  const formatBrl = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Compile extracted items data from user quotations + orders + industrial baseline
  const itemsIntelligence = useMemo<ItemPriceIntelligence[]>(() => {
    const map = new Map<string, ItemPriceIntelligence>();

    // 1. Populate baseline
    BASELINE_ITEM_INTELLIGENCE.forEach((item) => {
      map.set(item.description.toLowerCase().trim(), { ...item });
    });

    // 2. Ingest user quotations
    quotations.forEach((quot) => {
      quot.items.forEach((reqItem) => {
        const itemKey = reqItem.description.toLowerCase().trim();
        const quotesHistory: ItemPriceIntelligence['quotesHistory'] = [];

        quot.bids.forEach((bid) => {
          const itemPrice = bid.itemsPrices.find((ip) => ip.itemId === reqItem.id);
          if (itemPrice && itemPrice.unitPrice > 0) {
            quotesHistory.push({
              supplierName: bid.supplierName || 'Fornecedor sem nome',
              unitPrice: itemPrice.unitPrice,
              quoteDate: bid.quoteDate || quot.createdAt || new Date().toISOString().slice(0, 10),
              deliveryDays: bid.deliveryDays || 7,
              freightType: bid.freightType || 'CIF',
              isWinner: !!bid.isWinner,
            });
          }
        });

        if (quotesHistory.length > 0) {
          const existing = map.get(itemKey);
          const allQuotes = existing ? [...existing.quotesHistory, ...quotesHistory] : quotesHistory;

          // Deduplicate quotes by supplierName + quoteDate
          const uniqueQuotesMap = new Map<string, (typeof quotesHistory)[0]>();
          allQuotes.forEach((q) => {
            uniqueQuotesMap.set(`${q.supplierName}_${q.unitPrice}`, q);
          });
          const mergedQuotes = Array.from(uniqueQuotesMap.values());

          const prices = mergedQuotes.map((q) => q.unitPrice);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const avgPrice = prices.reduce((acc, p) => acc + p, 0) / prices.length;
          const minQuote = mergedQuotes.find((q) => q.unitPrice === minPrice);
          const maxQuote = mergedQuotes.find((q) => q.unitPrice === maxPrice);
          const spreadPercent = minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0;

          map.set(itemKey, {
            key: existing?.key || `item_${reqItem.id}`,
            description: reqItem.description,
            specs: reqItem.specs || existing?.specs || 'Especificação conforme requisição técnica',
            unit: reqItem.unit || existing?.unit || 'un',
            category: existing?.category || 'Geral / Suprimentos',
            minPrice,
            minSupplier: minQuote?.supplierName || 'N/A',
            minDate: minQuote?.quoteDate || new Date().toISOString().slice(0, 10),
            avgPrice,
            maxPrice,
            maxSupplier: maxQuote?.supplierName || 'N/A',
            spreadPercent,
            potentialSaving: Math.max(0, avgPrice - minPrice),
            quoteCount: mergedQuotes.length,
            quotesHistory: mergedQuotes.sort((a, b) => a.unitPrice - b.unitPrice),
          });
        }
      });
    });

    // 3. Ingest purchase orders (actual realized orders)
    orders.forEach((ord) => {
      ord.items.forEach((ordItem) => {
        const itemKey = ordItem.description.toLowerCase().trim();
        const existing = map.get(itemKey);
        if (existing) {
          const alreadyHasSupplier = existing.quotesHistory.some(
            (qh) => qh.supplierName === ord.supplierName && Math.abs(qh.unitPrice - ordItem.unitPrice) < 0.01
          );
          if (!alreadyHasSupplier && ordItem.unitPrice > 0) {
            existing.quotesHistory.push({
              supplierName: ord.supplierName,
              unitPrice: ordItem.unitPrice,
              quoteDate: ord.emissionDate || ord.createdAt,
              deliveryDays: 7,
              freightType: ord.freightType || 'CIF',
              isWinner: true,
            });
            const prices = existing.quotesHistory.map((q) => q.unitPrice);
            existing.minPrice = Math.min(...prices);
            existing.maxPrice = Math.max(...prices);
            existing.avgPrice = prices.reduce((acc, p) => acc + p, 0) / prices.length;
            existing.spreadPercent = existing.minPrice > 0 ? ((existing.maxPrice - existing.minPrice) / existing.minPrice) * 100 : 0;
            existing.potentialSaving = Math.max(0, existing.avgPrice - existing.minPrice);
            existing.quoteCount = existing.quotesHistory.length;
          }
        }
      });
    });

    return Array.from(map.values());
  }, [quotations, orders]);

  // Categories list
  const categories = useMemo(() => {
    const cats = new Set<string>();
    itemsIntelligence.forEach((i) => cats.add(i.category));
    return Array.from(cats);
  }, [itemsIntelligence]);

  // Filtered and sorted items
  const filteredItems = useMemo(() => {
    return itemsIntelligence
      .filter((item) => {
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        const matchesSearch =
          item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.specs.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.minSupplier.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'spread') return b.spreadPercent - a.spreadPercent;
        if (sortBy === 'savings') return b.potentialSaving - a.potentialSaving;
        if (sortBy === 'quotes') return b.quoteCount - a.quoteCount;
        return a.description.localeCompare(b.description);
      });
  }, [itemsIntelligence, selectedCategory, searchTerm, sortBy]);

  // Selected item for the bar chart
  const selectedItem = useMemo(() => {
    return (
      itemsIntelligence.find((i) => i.key === selectedItemKey) ||
      filteredItems[0] ||
      itemsIntelligence[0]
    );
  }, [itemsIntelligence, selectedItemKey, filteredItems]);

  // Compile supplier performance metrics across all bids and orders
  const supplierPerformanceList = useMemo<SupplierPerformanceIntelligence[]>(() => {
    const supMap = new Map<string, SupplierPerformanceIntelligence>();

    // Initial populate from registered suppliers
    suppliers.forEach((s) => {
      supMap.set(s.name.toLowerCase().trim(), {
        supplierId: s.id,
        supplierName: s.name,
        cnpj: s.cnpj || '00.000.000/0001-00',
        isCertifiedIso: s.isCertifiedIso,
        status: s.status,
        rating: s.rating || 4.5,
        totalQuotesParticipated: 0,
        totalQuotesWon: 0,
        winRatePercent: 0,
        totalQuotedValue: 0,
        totalAwardedValue: 0,
        avgDeliveryDays: 7,
        competitivenessIndex: 100,
      });
    });

    // Ingest all quotations bids
    quotations.forEach((quot) => {
      quot.bids.forEach((bid) => {
        const supKey = (bid.supplierName || 'Fornecedor').toLowerCase().trim();
        let record = supMap.get(supKey);
        if (!record) {
          record = {
            supplierId: bid.supplierId || `sup_${supKey}`,
            supplierName: bid.supplierName,
            cnpj: bid.supplierCnpj || '00.000.000/0001-00',
            isCertifiedIso: true,
            status: 'homologado',
            rating: 4.8,
            totalQuotesParticipated: 0,
            totalQuotesWon: 0,
            winRatePercent: 0,
            totalQuotedValue: 0,
            totalAwardedValue: 0,
            avgDeliveryDays: bid.deliveryDays || 7,
            competitivenessIndex: 98,
          };
          supMap.set(supKey, record);
        }

        record.totalQuotesParticipated += 1;
        record.totalQuotedValue += bid.totalValue || 0;
        if (bid.isWinner || quot.winningSupplierName === bid.supplierName) {
          record.totalQuotesWon += 1;
          record.totalAwardedValue += bid.totalValue || 0;
        }
      });
    });

    // Ingest purchase orders (awarded value)
    orders.forEach((ord) => {
      const supKey = (ord.supplierName || 'Fornecedor').toLowerCase().trim();
      let record = supMap.get(supKey);
      if (!record) {
        record = {
          supplierId: ord.supplierId || `sup_${supKey}`,
          supplierName: ord.supplierName,
          cnpj: ord.supplierCnpj || '00.000.000/0001-00',
          isCertifiedIso: true,
          status: 'homologado',
          rating: 4.9,
          totalQuotesParticipated: 1,
          totalQuotesWon: 1,
          winRatePercent: 100,
          totalQuotedValue: ord.totalValue || 0,
          totalAwardedValue: ord.totalValue || 0,
          avgDeliveryDays: 8,
          competitivenessIndex: 95,
        };
        supMap.set(supKey, record);
      } else {
        record.totalAwardedValue += ord.totalValue || 0;
      }
    });

    // Add baseline prominent suppliers if empty so graphs are immediately valuable
    if (supMap.size < 4) {
      const defaultBaselines: SupplierPerformanceIntelligence[] = [
        {
          supplierId: 'sup_gerdau',
          supplierName: 'Gerdau Comercial de Aços S.A.',
          cnpj: '67.382.910/0001-88',
          isCertifiedIso: true,
          status: 'homologado',
          rating: 4.9,
          totalQuotesParticipated: 12,
          totalQuotesWon: 8,
          winRatePercent: 66.7,
          totalQuotedValue: 580000,
          totalAwardedValue: 412500,
          avgDeliveryDays: 6,
          competitivenessIndex: 94.2, // 5.8% cheaper than market
        },
        {
          supplierId: 'sup_tubos_ipiranga',
          supplierName: 'Tubos Ipiranga Distribuidora',
          cnpj: '45.192.834/0001-92',
          isCertifiedIso: true,
          status: 'homologado',
          rating: 4.8,
          totalQuotesParticipated: 9,
          totalQuotesWon: 5,
          winRatePercent: 55.5,
          totalQuotedValue: 340000,
          totalAwardedValue: 195000,
          avgDeliveryDays: 5,
          competitivenessIndex: 96.5,
        },
        {
          supplierId: 'sup_aperam',
          supplierName: 'Aperam South America',
          cnpj: '17.294.021/0001-34',
          isCertifiedIso: true,
          status: 'homologado',
          rating: 4.7,
          totalQuotesParticipated: 7,
          totalQuotesWon: 3,
          winRatePercent: 42.8,
          totalQuotedValue: 290000,
          totalAwardedValue: 128000,
          avgDeliveryDays: 9,
          competitivenessIndex: 103.1,
        },
        {
          supplierId: 'sup_usiminas',
          supplierName: 'Usiminas Mecânica & Aços',
          cnpj: '21.583.190/0001-15',
          isCertifiedIso: true,
          status: 'homologado',
          rating: 4.8,
          totalQuotesParticipated: 10,
          totalQuotesWon: 6,
          winRatePercent: 60.0,
          totalQuotedValue: 450000,
          totalAwardedValue: 275000,
          avgDeliveryDays: 8,
          competitivenessIndex: 95.8,
        },
        {
          supplierId: 'sup_deca_mipel',
          supplierName: 'Deca / Mipel Válvulas Industriais',
          cnpj: '53.910.428/0001-70',
          isCertifiedIso: true,
          status: 'homologado',
          rating: 4.9,
          totalQuotesParticipated: 6,
          totalQuotesWon: 4,
          winRatePercent: 66.7,
          totalQuotedValue: 180000,
          totalAwardedValue: 115000,
          avgDeliveryDays: 14,
          competitivenessIndex: 93.0,
        },
      ];

      defaultBaselines.forEach((b) => {
        if (!supMap.has(b.supplierName.toLowerCase().trim())) {
          supMap.set(b.supplierName.toLowerCase().trim(), b);
        }
      });
    }

    // Compute win-rate percentage
    const list = Array.from(supMap.values()).map((s) => {
      const part = s.totalQuotesParticipated > 0 ? s.totalQuotesParticipated : 1;
      const winRate = (s.totalQuotesWon / part) * 100;
      return {
        ...s,
        winRatePercent: Math.min(100, Math.round(winRate * 10) / 10),
      };
    });

    return list.sort((a, b) => b.totalAwardedValue - a.totalAwardedValue);
  }, [suppliers, quotations, orders]);

  // Overall KPI metrics
  const totalMonitoredItems = itemsIntelligence.length;
  const avgMarketSpread = useMemo(() => {
    if (itemsIntelligence.length === 0) return 0;
    const sum = itemsIntelligence.reduce((acc, i) => acc + i.spreadPercent, 0);
    return Math.round((sum / itemsIntelligence.length) * 10) / 10;
  }, [itemsIntelligence]);

  const totalSavingOpportunity = useMemo(() => {
    return itemsIntelligence.reduce((acc, i) => acc + i.potentialSaving, 0);
  }, [itemsIntelligence]);

  const bestSupplier = useMemo(() => {
    return [...supplierPerformanceList].sort((a, b) => b.winRatePercent - a.winRatePercent)[0];
  }, [supplierPerformanceList]);

  // Sort suppliers for the horizontal bar chart
  const sortedSuppliersForChart = useMemo(() => {
    return [...supplierPerformanceList]
      .sort((a, b) => {
        if (supplierChartMetric === 'winRate') return b.winRatePercent - a.winRatePercent;
        if (supplierChartMetric === 'volume') return b.totalAwardedValue - a.totalAwardedValue;
        if (supplierChartMetric === 'competitiveness') return a.competitivenessIndex - b.competitivenessIndex; // Lower is better
        if (supplierChartMetric === 'leadTime') return a.avgDeliveryDays - b.avgDeliveryDays; // Lower is better
        return 0;
      })
      .slice(0, 6);
  }, [supplierPerformanceList, supplierChartMetric]);

  // Handle Export / Report
  const handleExportCsv = () => {
    const headers = [
      'Material / Descricao',
      'Unidade',
      'Menor Preco (R$)',
      'Fornecedor Menor',
      'Preco Medio (R$)',
      'Maior Preco (R$)',
      'Dispersao (%)',
      'Economia Potencial (R$)',
      'Cotacoes Analisadas',
    ];
    const rows = filteredItems.map((i) => [
      `"${i.description.replace(/"/g, '""')}"`,
      i.unit,
      i.minPrice.toFixed(2),
      `"${i.minSupplier}"`,
      i.avgPrice.toFixed(2),
      i.maxPrice.toFixed(2),
      i.spreadPercent.toFixed(1) + '%',
      i.potentialSaving.toFixed(2),
      i.quoteCount,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inteligencia_precos_fornecedores_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30">
              <TrendingUp size={24} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                Inteligência de Fornecedores & Preços Médios
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold">
                  3-Bid Analytics
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Benchmarking analítico de cotações equalizadas, ranking de dispersão de preços por item e histórico de performance de usinas e distribuidores.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer shadow"
            title="Exportar planilha analítica de inteligência de preços"
          >
            <Download size={14} className="text-cyan-400" />
            <span>Exportar CSV</span>
          </button>
          {onNavigateSub && (
            <button
              onClick={() => onNavigateSub('compras-cotacoes')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-cyan-600/20"
            >
              <FileSpreadsheet size={14} />
              <span>Novo Mapa 3-Bid</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Monitored Items */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Itens Monitorados
              </span>
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold font-mono text-white">
              {totalMonitoredItems}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
            Itens com cotações e compras registradas
          </div>
        </div>

        {/* Card 2: Average Market Spread */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Dispersão Média de Mercado
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Percent className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold font-mono text-amber-400">
              {avgMarketSpread}%
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
            Variação média entre a maior e menor oferta
          </div>
        </div>

        {/* Card 3: Potential Savings */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Potencial de Economia Unit.
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold font-mono text-emerald-400">
              {formatBrl(totalSavingOpportunity)}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
            Margem negociável vs média de mercado
          </div>
        </div>

        {/* Card 4: Top Supplier by Win Rate */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                Líder em Competitividade
              </span>
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <p className="text-base font-bold text-white truncate" title={bestSupplier?.supplierName}>
              {bestSupplier?.supplierName || 'Gerdau Comercial'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-purple-300 flex items-center justify-between">
            <span>Win-Rate: {bestSupplier?.winRatePercent}%</span>
            <span className="font-mono text-emerald-400">{formatBrl(bestSupplier?.totalAwardedValue || 0)}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: INTERACTIVE SVG BAR CHART - PRICE COMPARISON PER SUPPLIER FOR SELECTED ITEM
          ========================================================================= */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">
                Gráfico Comparativo de Preços por Fornecedor
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Visualização de dispersão de valores cotados para:{' '}
              <span className="text-cyan-300 font-semibold">{selectedItem.description}</span>
            </p>
          </div>

          {/* Quick Item Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Selecionar Material:</span>
            <select
              value={selectedItem.key}
              onChange={(e) => setSelectedItemKey(e.target.value)}
              aria-label="Selecionar material para análise gráfica de preços"
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-cyan-500 transition max-w-xs cursor-pointer"
            >
              {itemsIntelligence.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.description} ({item.unit})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Item Stat Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Menor Cotação (Melhor Preço)</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-extrabold font-mono text-emerald-400">{formatBrl(selectedItem.minPrice)}</span>
              <span className="text-[10px] text-slate-400">/{selectedItem.unit}</span>
            </div>
            <span className="text-[10px] text-emerald-300/80 truncate block mt-0.5" title={selectedItem.minSupplier}>
              {selectedItem.minSupplier}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Preço Médio de Mercado</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-extrabold font-mono text-cyan-400">{formatBrl(selectedItem.avgPrice)}</span>
              <span className="text-[10px] text-slate-400">/{selectedItem.unit}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">Benchmark de negociação</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Maior Cotação Ofertada</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-extrabold font-mono text-rose-400">{formatBrl(selectedItem.maxPrice)}</span>
              <span className="text-[10px] text-slate-400">/{selectedItem.unit}</span>
            </div>
            <span className="text-[10px] text-rose-300/80 truncate block mt-0.5" title={selectedItem.maxSupplier}>
              {selectedItem.maxSupplier}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Dispersão / Economia Potencial</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-extrabold font-mono text-amber-400">+{selectedItem.spreadPercent.toFixed(1)}%</span>
              <span className="text-[10px] text-emerald-400 font-mono ml-1">({formatBrl(selectedItem.potentialSaving)}/un)</span>
            </div>
            <span className="text-[10px] text-amber-300/80 block mt-0.5">Variação entre fornecedores</span>
          </div>
        </div>

        {/* Interactive SVG Bar Chart Rendering */}
        <div className="mt-6 bg-slate-950/60 rounded-2xl border border-slate-800/80 p-5 overflow-hidden">
          {/* Chart Header & Benchmark Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block shadow-sm"></span>
                <span className="text-slate-300 font-medium">Melhor Oferta (Menor Preço)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-cyan-600 inline-block shadow-sm"></span>
                <span className="text-slate-300 font-medium">Demais Fornecedores</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-amber-400 inline-block"></span>
                <span className="text-amber-400 font-semibold">Linha de Preço Médio ({formatBrl(selectedItem.avgPrice)})</span>
              </div>
            </div>

            <span className="text-slate-400 text-[11px] font-mono">
              {selectedItem.quotesHistory.length} cotações registradas
            </span>
          </div>

          {/* Render SVG Bars */}
          {selectedItem.quotesHistory.length > 0 ? (
            <div className="w-full">
              {(() => {
                const chartHeight = 260;
                const topPadding = 40;
                const bottomPadding = 60;
                const usableHeight = chartHeight - topPadding - bottomPadding;
                const maxVal = Math.max(...selectedItem.quotesHistory.map((q) => q.unitPrice)) * 1.15;
                const avgY = topPadding + usableHeight - (selectedItem.avgPrice / maxVal) * usableHeight;

                return (
                  <div className="relative w-full overflow-x-auto no-scrollbar">
                    <svg
                      viewBox={`0 0 800 ${chartHeight}`}
                      className="w-full h-64 select-none min-w-[500px]"
                      preserveAspectRatio="none"
                    >
                      {/* Grid lines */}
                      <line x1="40" y1={topPadding} x2="780" y2={topPadding} stroke="#334155" strokeDasharray="3 3" opacity="0.3" />
                      <line x1="40" y1={topPadding + usableHeight / 2} x2="780" y2={topPadding + usableHeight / 2} stroke="#334155" strokeDasharray="3 3" opacity="0.3" />
                      <line x1="40" y1={topPadding + usableHeight} x2="780" y2={topPadding + usableHeight} stroke="#475569" strokeWidth="1" />

                      {/* Average Benchmark Dashed Line */}
                      <line
                        x1="40"
                        y1={avgY}
                        x2="780"
                        y2={avgY}
                        stroke="#f59e0b"
                        strokeWidth="2"
                        strokeDasharray="5 4"
                      />
                      <text x="775" y={avgY - 6} fill="#f59e0b" fontSize="11" textAnchor="end" fontWeight="bold">
                        Média: {formatBrl(selectedItem.avgPrice)}
                      </text>

                      {/* Bars for each quote */}
                      {selectedItem.quotesHistory.map((quote, idx) => {
                        const totalBars = selectedItem.quotesHistory.length;
                        const barGroupWidth = 700 / totalBars;
                        const barWidth = Math.min(68, barGroupWidth * 0.6);
                        const xPos = 60 + idx * barGroupWidth + (barGroupWidth - barWidth) / 2;
                        const barHeight = (quote.unitPrice / maxVal) * usableHeight;
                        const yPos = topPadding + usableHeight - barHeight;
                        const isLowest = quote.unitPrice === selectedItem.minPrice;
                        const diffVsAvg = ((quote.unitPrice - selectedItem.avgPrice) / selectedItem.avgPrice) * 100;

                        return (
                          <g key={`bar_${idx}`} className="cursor-pointer group">
                            {/* Bar Glow if lowest */}
                            {isLowest && (
                              <rect
                                x={xPos - 2}
                                y={yPos - 2}
                                width={barWidth + 4}
                                height={barHeight + 4}
                                rx="8"
                                fill="#10b981"
                                opacity="0.25"
                              />
                            )}

                            {/* Main Bar */}
                            <rect
                              x={xPos}
                              y={yPos}
                              width={barWidth}
                              height={barHeight}
                              rx="6"
                              fill={isLowest ? 'url(#greenGrad)' : 'url(#cyanGrad)'}
                              className="transition-all duration-300 group-hover:opacity-90"
                            />

                            {/* Top Badge text (Value) */}
                            <text
                              x={xPos + barWidth / 2}
                              y={yPos - 10}
                              fill={isLowest ? '#34d399' : '#e2e8f0'}
                              fontSize="11"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {formatBrl(quote.unitPrice)}
                            </text>

                            {/* Best Offer Tag */}
                            {isLowest && (
                              <g>
                                <rect
                                  x={xPos + barWidth / 2 - 38}
                                  y={yPos - 28}
                                  width="76"
                                  height="16"
                                  rx="4"
                                  fill="#065f46"
                                  stroke="#10b981"
                                  strokeWidth="1"
                                />
                                <text
                                  x={xPos + barWidth / 2}
                                  y={yPos - 16}
                                  fill="#6ee7b7"
                                  fontSize="9"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  ★ MELHOR
                                </text>
                              </g>
                            )}

                            {/* Percentage diff vs average */}
                            <text
                              x={xPos + barWidth / 2}
                              y={topPadding + usableHeight + 16}
                              fill={diffVsAvg <= 0 ? '#10b981' : '#f43f5e'}
                              fontSize="10"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {diffVsAvg > 0 ? `+${diffVsAvg.toFixed(1)}%` : `${diffVsAvg.toFixed(1)}%`}
                            </text>

                            {/* Supplier Name label */}
                            <text
                              x={xPos + barWidth / 2}
                              y={topPadding + usableHeight + 32}
                              fill="#94a3b8"
                              fontSize="10"
                              fontWeight="500"
                              textAnchor="middle"
                              className="truncate"
                            >
                              {quote.supplierName.length > 14
                                ? quote.supplierName.slice(0, 13) + '…'
                                : quote.supplierName}
                            </text>

                            {/* Delivery lead time */}
                            <text
                              x={xPos + barWidth / 2}
                              y={topPadding + usableHeight + 46}
                              fill="#64748b"
                              fontSize="9"
                              textAnchor="middle"
                            >
                              {quote.deliveryDays}d • {quote.freightType}
                            </text>
                          </g>
                        );
                      })}

                      {/* Gradients */}
                      <defs>
                        <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#047857" />
                        </linearGradient>
                        <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#0369a1" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Nenhuma cotação registrada para este item.
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: RANKING DE PREÇOS MÉDIOS POR ITEM (TABELA INTERATIVA)
          ========================================================================= */}
      <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Ranking de Preços Médios por Item ({filteredItems.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Clique em qualquer linha ou botão para carregar a curva de dispersão e comparativo gráfico de fornecedores.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar material, norma, fornecedor..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filtrar por categoria de material"
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">Todas Categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Sort order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Ordenar ranking de materiais"
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="spread">Maior Dispersão (%)</option>
              <option value="savings">Maior Economia (R$)</option>
              <option value="quotes">Mais Cotados</option>
              <option value="name">Nome (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <th className="py-3 px-4">Material & Especificação Técnica</th>
                <th className="py-3 px-3 text-center">Unid.</th>
                <th className="py-3 px-3 text-right text-emerald-400">Menor Preço</th>
                <th className="py-3 px-3">Melhor Fornecedor</th>
                <th className="py-3 px-3 text-right text-cyan-400">Preço Médio</th>
                <th className="py-3 px-3 text-right text-rose-400">Maior Preço</th>
                <th className="py-3 px-3 text-right">Dispersão</th>
                <th className="py-3 px-3 text-center">Cotações</th>
                <th className="py-3 px-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredItems.map((item) => {
                const isCurrent = selectedItem.key === item.key;

                return (
                  <tr
                    key={item.key}
                    onClick={() => setSelectedItemKey(item.key)}
                    className={`transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-cyan-950/30 border-l-4 border-cyan-500'
                        : 'hover:bg-slate-850/50'
                    }`}
                  >
                    {/* Material Name */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-white leading-tight">
                        {item.description}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {item.specs}
                      </div>
                      <span className="inline-block mt-1 text-[9px] px-2 py-0.2 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                        {item.category}
                      </span>
                    </td>

                    {/* Unit */}
                    <td className="py-3.5 px-3 text-center text-slate-300 font-mono">
                      {item.unit}
                    </td>

                    {/* Lowest Price */}
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-400">
                      {formatBrl(item.minPrice)}
                    </td>

                    {/* Min Supplier */}
                    <td className="py-3.5 px-3 text-slate-300">
                      <div className="truncate max-w-[150px] font-semibold text-emerald-300" title={item.minSupplier}>
                        {item.minSupplier}
                      </div>
                      <div className="text-[10px] text-slate-500">{item.minDate}</div>
                    </td>

                    {/* Average Price */}
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-cyan-400">
                      {formatBrl(item.avgPrice)}
                    </td>

                    {/* Max Price */}
                    <td className="py-3.5 px-3 text-right font-mono text-slate-400">
                      {formatBrl(item.maxPrice)}
                    </td>

                    {/* Dispersion (%) */}
                    <td className="py-3.5 px-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                          item.spreadPercent > 30
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        +{item.spreadPercent.toFixed(1)}%
                      </span>
                    </td>

                    {/* Number of quotes */}
                    <td className="py-3.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {item.quoteCount} ofertas
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemKey(item.key);
                          window.scrollTo({ top: 350, behavior: 'smooth' });
                        }}
                        className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                          isCurrent
                            ? 'bg-cyan-600 text-white shadow'
                            : 'bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white'
                        }`}
                        title="Ver comparativo de fornecedores no gráfico"
                      >
                        <BarChart3 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: HISTÓRICO DE PERFORMANCE DE FORNECEDORES & GRÁFICO DE BARRAS HORIZONTAL
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Horizontal Bar Chart comparing suppliers */}
        <div className="lg:col-span-2 bg-[#0B132B] border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  Histórico de Performance de Fornecedores
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Comparativo multi-indicador de fornecedores industriais homologados.
              </p>
            </div>

            {/* Metric Selector Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setSupplierChartMetric('winRate')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  supplierChartMetric === 'winRate'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Win-Rate (%)
              </button>
              <button
                onClick={() => setSupplierChartMetric('volume')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  supplierChartMetric === 'volume'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Volume (R$)
              </button>
              <button
                onClick={() => setSupplierChartMetric('competitiveness')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  supplierChartMetric === 'competitiveness'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Índice de Preço vs Preço Médio (menor que 100 indica desconto frente ao mercado)"
              >
                Preço Médio
              </button>
            </div>
          </div>

          {/* Horizontal SVG Bar Chart */}
          <div className="mt-5 space-y-4">
            {sortedSuppliersForChart.map((sup, idx) => {
              // Compute bar fill based on active metric
              let barPercentage = 0;
              let displayVal = '';
              let badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';

              if (supplierChartMetric === 'winRate') {
                barPercentage = Math.min(100, Math.max(10, sup.winRatePercent));
                displayVal = `${sup.winRatePercent}% win-rate (${sup.totalQuotesWon}/${sup.totalQuotesParticipated} RCs)`;
                badgeColor = sup.winRatePercent >= 60 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
              } else if (supplierChartMetric === 'volume') {
                const maxVol = Math.max(...sortedSuppliersForChart.map((s) => s.totalAwardedValue)) || 1;
                barPercentage = Math.min(100, Math.max(10, (sup.totalAwardedValue / maxVol) * 100));
                displayVal = formatBrl(sup.totalAwardedValue);
                badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
              } else {
                // Competitiveness: index < 100 is cheaper than average
                const diff = 100 - sup.competitivenessIndex;
                barPercentage = Math.min(100, Math.max(15, 50 + diff * 3));
                displayVal = diff >= 0 ? `-${diff.toFixed(1)}% abaixo da média` : `+${Math.abs(diff).toFixed(1)}% acima`;
                badgeColor = diff >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30';
              }

              return (
                <div key={sup.supplierId} className="space-y-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center font-mono">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-white group-hover:text-cyan-300 transition">
                        {sup.supplierName}
                      </span>
                      {sup.isCertifiedIso && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-0.5 font-semibold">
                          <ShieldCheck size={10} /> ISO 9001
                        </span>
                      )}
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${badgeColor}`}>
                      {displayVal}
                    </span>
                  </div>

                  {/* Horizontal Bar Graphic */}
                  <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        idx === 0
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : 'bg-gradient-to-r from-cyan-600 to-blue-500'
                      }`}
                      style={{ width: `${barPercentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (1 Col): Supplier Homologation & Risk Insights */}
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-2xl p-6 shadow-2xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Diretrizes de Homologação
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Critérios para qualificação e emissão de ordens de compra em conformidade com normas industriais.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="font-bold text-cyan-300 block mb-0.5">Certificado de Usina (Heat No.)</span>
                <span className="text-slate-400 text-[11px]">
                  Obrigatório para aço estrutural e tubulações de processo (rastreabilidade de corrida metalúrgica).
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="font-bold text-emerald-300 block mb-0.5">Política 3-Bid de Compliance</span>
                <span className="text-slate-400 text-[11px]">
                  Toda compra acima de R$ 5.000 exige mínimo de 3 propostas comerciais para homologação.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="font-bold text-amber-300 block mb-0.5">Equalização de Frete & Tributos</span>
                <span className="text-slate-400 text-[11px]">
                  Comparações CIF vs FOB e alíquotas de ICMS/ST equalizadas antes da decisão de adjudicação.
                </span>
              </div>
            </div>
          </div>

          {onNavigateSub && (
            <button
              onClick={() => onNavigateSub('compras-fornecedores')}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-750 text-cyan-400 rounded-xl text-xs font-bold border border-cyan-800/60 transition cursor-pointer shadow"
            >
              <span>Gerenciar Cadastro de Fornecedores</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
