import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Item, ItemType, ItemCategory, StockBalance, StockMovement } from '../types';
import {
  Wrench,
  Boxes,
  Users,
  Plus,
  Trash2,
  DollarSign,
  Tag,
  X,
  Search,
  Check,
  AlertCircle,
  HelpCircle,
  Layers,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface InitialStockLine {
  id: string;
  unitId: string;
  quantity: string;
}

interface ItemsServicesModuleProps {
  initialTab?: ItemType | 'categorias';
  initialSearchQuery?: string;
}

export const ItemsServicesModule: React.FC<ItemsServicesModuleProps> = ({
  initialTab = 'peca',
  initialSearchQuery = '',
}) => {
  const { user, organization, units, logAudit } = useAuth();
  const [activeTab, setActiveTab] = useState<ItemType | 'categorias'>(initialTab);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync tab if prop changes from sidebar navigation
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // ==================== 1. MODAL NOVA PEÇA ====================
  const [showPieceModal, setShowPieceModal] = useState(false);
  const [pieceCode, setPieceCode] = useState('');
  const [pieceName, setPieceName] = useState('');
  const [pieceDescription, setPieceDescription] = useState('');
  const [pieceManufacturer, setPieceManufacturer] = useState('');
  const [pieceBrand, setPieceBrand] = useState('');
  const [pieceModel, setPieceModel] = useState('');
  const [pieceCategory, setPieceCategory] = useState('Sem categoria');
  const [pieceUnitOfMeasure, setPieceUnitOfMeasure] = useState('UN');
  const [pieceStatus, setPieceStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [pieceMinStock, setPieceMinStock] = useState('10');
  const [pieceMaxStock, setPieceMaxStock] = useState('100');
  const [pieceAverageCost, setPieceAverageCost] = useState('25,50');
  const [initialStockLines, setInitialStockLines] = useState<InitialStockLine[]>([]);

  // ==================== 2. MODAL NOVO SERVIÇO ====================
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceUnitOfMeasure, setServiceUnitOfMeasure] = useState('Ampère · A');
  const [serviceCategory, setServiceCategory] = useState('');
  const [serviceSubcategory, setServiceSubcategory] = useState('Nenhuma');
  const [serviceBasePrice, setServiceBasePrice] = useState('0,00');
  const [serviceProposedPrice, setServiceProposedPrice] = useState('');
  const [serviceActive, setServiceActive] = useState(true);

  // ==================== 3. MODAL NOVA MÃO DE OBRA ====================
  const [showLaborModal, setShowLaborModal] = useState(false);
  const [laborCode, setLaborCode] = useState('');
  const [laborName, setLaborName] = useState('');
  const [laborDescription, setLaborDescription] = useState('');
  const [laborHourlyRate, setLaborHourlyRate] = useState('0,00');
  const [laborActive, setLaborActive] = useState(true);

  // ==================== 4. MODAL CATEGORIAS ====================
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<ItemType>('servico');
  const [newSubcatName, setNewSubcatName] = useState('');
  const [selectedCatForSubcat, setSelectedCatForSubcat] = useState<string>('');

  // Default suggested categories for services
  const defaultServiceCategories = [
    'Água de alimentação e tratamento',
    'Instalações Elétricas & Energia',
    'Mecânica & Caldeiraria',
    'HVAC / Climatização & Refrigeração',
    'Facilities, Predial & Infraestrutura',
    'Automação & Instrumentação',
  ];

  const defaultPieceCategories = [
    'Sem categoria',
    'Mecânica & Rolamentos',
    'Elétrica & Automação',
    'Pneumática & Hidráulica',
    'Fixação & Caldeiraria',
    'Consumíveis & Químicos',
    'EPIs & Segurança',
  ];

  // Load Firestore data
  useEffect(() => {
    if (!organization) return;

    const qItems = query(collection(db, 'items'), where('orgId', '==', organization.id));
    const unsubItems = onSnapshot(qItems, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Item)));
    });

    const qCat = query(collection(db, 'item_categories'), where('orgId', '==', organization.id));
    const unsubCat = onSnapshot(qCat, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ItemCategory)));
    });

    return () => {
      unsubItems();
      unsubCat();
    };
  }, [organization]);

  // Helper parser for decimal string (handles '25,50' or '25.50')
  const parseDecimal = (val: string): number => {
    if (!val) return 0;
    const clean = val.replace(/\./g, '').replace(',', '.').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  // Helper for initial stock line
  const handleAddStockLine = () => {
    const defaultUnitId = units.length > 0 ? units[0].id : '';
    setInitialStockLines((prev) => [
      ...prev,
      {
        id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        unitId: defaultUnitId,
        quantity: '0',
      },
    ]);
  };

  const handleRemoveStockLine = (id: string) => {
    setInitialStockLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateStockLine = (id: string, field: 'unitId' | 'quantity', val: string) => {
    setInitialStockLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: val } : l))
    );
  };

  // 1. Submit Nova Peça
  const handleCreatePieceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    const cleanCode = pieceCode.trim();
    const cleanName = pieceName.trim();
    const cleanUom = pieceUnitOfMeasure.trim().toUpperCase();

    if (!cleanCode || !cleanName || !cleanUom) {
      alert('Por favor, preencha os campos obrigatórios: Código, Nome e Unidade de Medida.');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemId = `item_peca_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const avgCostNum = parseDecimal(pieceAverageCost);
      const minStockNum = parseInt(pieceMinStock, 10) || 0;
      const maxStockNum = parseInt(pieceMaxStock, 10) || 0;

      const newPiece: Item = {
        id: itemId,
        orgId: organization.id,
        sku: cleanCode,
        code: cleanCode,
        name: cleanName,
        description: pieceDescription.trim(),
        type: 'peca',
        category: pieceCategory,
        unitOfMeasure: cleanUom,
        status: pieceStatus,
        active: pieceStatus === 'ACTIVE',
        referencePrice: avgCostNum,
        averageCost: avgCostNum,
        minStock: minStockNum,
        maxStock: maxStockNum,
        manufacturer: pieceManufacturer.trim() || undefined,
        brand: pieceBrand.trim() || undefined,
        model: pieceModel.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'items', itemId), newPiece);

      // Create initial stock balances for each informed unit line
      for (const line of initialStockLines) {
        const qtyNum = parseFloat(line.quantity) || 0;
        if (line.unitId && qtyNum > 0) {
          const balanceId = `${organization.id}_${line.unitId}_${itemId}`;
          const balanceDoc: StockBalance = {
            id: balanceId,
            orgId: organization.id,
            unitId: line.unitId,
            itemId: itemId,
            currentBalance: qtyNum,
            updatedAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'stock_balances', balanceId), balanceDoc);

          // Record stock movement audit entry
          const movementData: StockMovement = {
            id: `mov_init_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            orgId: organization.id,
            unitId: line.unitId,
            itemId: itemId,
            itemSku: cleanCode,
            itemName: cleanName,
            type: 'entrada',
            quantity: qtyNum,
            balanceAfter: qtyNum,
            reason: 'Saldo inicial informado no cadastro da peça',
            createdBy: user?.uid || 'sistema',
            userName: user?.displayName || user?.email || 'Administrador',
            createdAt: new Date().toISOString(),
          };
          await addDoc(collection(db, 'stock_movements'), movementData);
        }
      }

      await logAudit(
        'Peças',
        'Cadastrar Peça',
        `Nova peça cadastrada: ${cleanName} (${cleanCode}) - Categoria: ${pieceCategory}`,
        itemId
      );

      // Reset
      setShowPieceModal(false);
      setPieceCode('');
      setPieceName('');
      setPieceDescription('');
      setPieceManufacturer('');
      setPieceBrand('');
      setPieceModel('');
      setPieceCategory('Sem categoria');
      setPieceUnitOfMeasure('UN');
      setPieceStatus('ACTIVE');
      setPieceMinStock('10');
      setPieceMaxStock('100');
      setPieceAverageCost('25,50');
      setInitialStockLines([]);
    } catch (err: any) {
      console.error('Erro ao cadastrar peça:', err);
      alert('Falha ao salvar peça: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Novo Serviço
  const handleCreateServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    const cleanTitle = serviceTitle.trim();
    if (!cleanTitle) {
      alert('Por favor, informe o Título do serviço.');
      return;
    }
    if (!serviceCategory || serviceCategory === 'Escolha a categoria') {
      alert('Por favor, selecione uma Categoria para o serviço.');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemId = `item_srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const basePriceNum = parseDecimal(serviceBasePrice);
      const propPriceNum = serviceProposedPrice ? parseDecimal(serviceProposedPrice) : undefined;
      const skuGen = `SRV-${Date.now().toString().slice(-5)}`;

      const newService: Item = {
        id: itemId,
        orgId: organization.id,
        sku: skuGen,
        code: skuGen,
        name: cleanTitle,
        description: serviceDescription.trim(),
        type: 'servico',
        category: serviceCategory,
        subcategory: serviceSubcategory !== 'Nenhuma' ? serviceSubcategory : undefined,
        unitOfMeasure: serviceUnitOfMeasure,
        referencePrice: basePriceNum,
        basePrice: basePriceNum,
        proposedPrice: propPriceNum,
        active: serviceActive,
        status: serviceActive ? 'ACTIVE' : 'INACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'items', itemId), newService);
      await logAudit(
        'Serviços',
        'Cadastrar Serviço',
        `Novo serviço cadastrado: ${cleanTitle} (Categoria: ${serviceCategory})`,
        itemId
      );

      setShowServiceModal(false);
      setServiceTitle('');
      setServiceDescription('');
      setServiceCategory('');
      setServiceSubcategory('Nenhuma');
      setServiceBasePrice('0,00');
      setServiceProposedPrice('');
      setServiceActive(true);
    } catch (err: any) {
      console.error('Erro ao cadastrar serviço:', err);
      alert('Falha ao salvar serviço: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Submit Nova Mão de Obra
  const handleCreateLaborSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    const cleanCode = laborCode.trim();
    const cleanName = laborName.trim();
    if (!cleanCode || !cleanName) {
      alert('Por favor, informe o Código e o Nome da mão de obra.');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemId = `item_hoh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const hourlyNum = parseDecimal(laborHourlyRate);

      const newLabor: Item = {
        id: itemId,
        orgId: organization.id,
        sku: cleanCode,
        code: cleanCode,
        name: cleanName,
        description: laborDescription.trim(),
        type: 'mao_de_obra',
        category: 'Mão de Obra HxH',
        unitOfMeasure: 'HORA',
        referencePrice: hourlyNum,
        hourlyRate: hourlyNum,
        active: laborActive,
        status: laborActive ? 'ACTIVE' : 'INACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'items', itemId), newLabor);
      await logAudit(
        'Mão de Obra',
        'Cadastrar Mão de Obra',
        `Função HxH cadastrada: ${cleanName} (${cleanCode}) - R$ ${hourlyNum.toFixed(2)}/h`,
        itemId
      );

      setShowLaborModal(false);
      setLaborCode('');
      setLaborName('');
      setLaborDescription('');
      setLaborHourlyRate('0,00');
      setLaborActive(true);
    } catch (err: any) {
      console.error('Erro ao cadastrar mão de obra:', err);
      alert('Falha ao salvar mão de obra: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Submit Categoria / Subcategoria
  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !newCatName.trim()) return;

    setIsSubmitting(true);
    try {
      const catId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
      const newCategory: ItemCategory = {
        id: catId,
        orgId: organization.id,
        name: newCatName.trim(),
        type: newCatType,
        subcategories: newSubcatName.trim() ? [newSubcatName.trim()] : [],
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'item_categories', catId), newCategory);
      await logAudit('Categorias', 'Cadastrar Categoria', `Categoria ${newCatName} cadastrada para ${newCatType}`);

      setShowCategoryModal(false);
      setNewCatName('');
      setNewSubcatName('');
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSubcategoryToCategory = async (catId: string, subcat: string) => {
    if (!subcat.trim()) return;
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;

    const existing = cat.subcategories || [];
    if (existing.includes(subcat.trim())) return;

    try {
      const updated = [...existing, subcat.trim()];
      await setDoc(doc(db, 'item_categories', catId), {
        ...cat,
        subcategories: updated,
      });
    } catch (err) {
      console.error('Erro ao adicionar subcategoria:', err);
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o item "${itemName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'items', itemId));
      await logAudit('Catálogo', 'Excluir Item', `Item excluído: ${itemName}`, itemId);
    } catch (err) {
      console.error('Erro ao excluir item:', err);
    }
  };

  // Filter items according to search and active tab
  const filteredItems = items.filter((it) => {
    if (activeTab === 'categorias') return false;
    if (it.type !== activeTab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        (it.code && it.code.toLowerCase().includes(q)) ||
        it.category.toLowerCase().includes(q) ||
        (it.manufacturer && it.manufacturer.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Get available subcategories based on chosen service category
  const selectedCatObj = categories.find((c) => c.name === serviceCategory);
  const currentSubcategories = selectedCatObj?.subcategories || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 mb-1">
            <Wrench className="w-4 h-4" />
            <span className="text-[11px] font-bold tracking-widest uppercase">
              Catálogo Mestre • Operações & Gestão
            </span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {activeTab === 'peca'
              ? 'Catálogo de Peças & Materiais'
              : activeTab === 'servico'
              ? 'Catálogo de Serviços Especializados'
              : activeTab === 'mao_de_obra'
              ? 'Mão de Obra Homem/Hora (HxH)'
              : 'Categorias & Subcategorias'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cadastro de itens de reposição, serviços técnicos e taxas horárias de equipes para ordens de serviço.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'peca' && (
            <button
              onClick={() => {
                setPieceCode(`PEC-${Date.now().toString().slice(-4)}`);
                setPieceName('');
                setShowPieceModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova peça</span>
            </button>
          )}

          {activeTab === 'servico' && (
            <button
              onClick={() => {
                setServiceTitle('');
                setShowServiceModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo serviço</span>
            </button>
          )}

          {activeTab === 'mao_de_obra' && (
            <button
              onClick={() => {
                setLaborCode(`HOH-${Date.now().toString().slice(-4)}`);
                setLaborName('');
                setShowLaborModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova mão de obra</span>
            </button>
          )}

          {activeTab === 'categorias' && (
            <button
              onClick={() => setShowCategoryModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Categoria</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'peca' as const, label: 'Peças & Materiais', icon: Boxes },
          { id: 'servico' as const, label: 'Serviços Especializados', icon: Wrench },
          { id: 'mao_de_obra' as const, label: 'Mão de Obra (HxH)', icon: Users },
          { id: 'categorias' as const, label: 'Subcategorias & Gestão', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Listing View for Peças, Serviços, Mão de Obra */}
      {activeTab !== 'categorias' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'peca'
                    ? 'Pesquisar peças por código, nome, marca ou categoria...'
                    : activeTab === 'servico'
                    ? 'Pesquisar serviços por título, categoria ou subcategoria...'
                    : 'Pesquisar mão de obra por código ou função...'
                }
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#121826] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="text-xs text-slate-400 px-1">
              Total: <strong className="text-white">{filteredItems.length}</strong> cadastrado(s)
            </div>
          </div>

          <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">
                      {activeTab === 'peca' ? 'Nome da Peça' : activeTab === 'servico' ? 'Título do Serviço' : 'Função / Especialidade'}
                    </th>
                    <th className="py-3 px-4">Categoria</th>
                    {activeTab === 'servico' && <th className="py-3 px-4">Subcategoria</th>}
                    {activeTab === 'peca' && <th className="py-3 px-4">Marca / Modelo</th>}
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4">
                      {activeTab === 'peca' ? 'Custo Médio' : activeTab === 'servico' ? 'Preço Base' : 'Valor Hora (HxH)'}
                    </th>
                    {activeTab === 'peca' && <th className="py-3 px-4">Estoque Mín / Máx</th>}
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-slate-400">
                        Nenhum registro encontrado nesta categoria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                          {it.code || it.sku}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-white">{it.name}</p>
                          {it.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">{it.description}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-[11px]">
                            {it.category || 'Sem categoria'}
                          </span>
                        </td>
                        {activeTab === 'servico' && (
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {it.subcategory || 'Nenhuma'}
                          </td>
                        )}
                        {activeTab === 'peca' && (
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {it.brand || it.manufacturer || it.model
                              ? `${it.brand || ''} ${it.model ? `(${it.model})` : ''}`
                              : '—'}
                          </td>
                        )}
                        <td className="py-3 px-4 font-mono text-slate-400 uppercase">
                          {it.unitOfMeasure}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                          R$ {(it.referencePrice || it.hourlyRate || it.basePrice || it.averageCost || 0).toFixed(2)}
                        </td>
                        {activeTab === 'peca' && (
                          <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                            Min: {it.minStock ?? '—'} / Max: {it.maxStock ?? '—'}
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              it.active || it.status === 'ACTIVE'
                                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                                : 'bg-red-950/70 text-red-400 border border-red-800/50'
                            }`}
                          >
                            {it.active || it.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteItem(it.id, it.name)}
                            title="Excluir item"
                            className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Subcategorias & Categorias Management View */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Categorias de Serviços */}
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2 text-cyan-400">
                  <Wrench className="w-4 h-4" />
                  <h3 className="font-bold text-white text-sm">Categorias & Subcategorias de Serviços</h3>
                </div>
                <button
                  onClick={() => {
                    setNewCatType('servico');
                    setShowCategoryModal(true);
                  }}
                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold cursor-pointer"
                >
                  + Nova Categoria
                </button>
              </div>

              <div className="space-y-3">
                {/* Default or dynamic categories */}
                {defaultServiceCategories.map((defCat) => {
                  const dbCat = categories.find((c) => c.name === defCat && c.type === 'servico');
                  const subcats = dbCat?.subcategories || [
                    'Inspeção & Testes',
                    'Manutenção Corretiva',
                    'Plano Preventivo Periódico',
                  ];

                  return (
                    <div key={defCat} className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white text-xs">{defCat}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">{subcats.length} subcategorias</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {subcats.map((sc, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-slate-300 text-[10px]"
                          >
                            {sc}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Additional DB Categories */}
                {categories
                  .filter((c) => c.type === 'servico' && !defaultServiceCategories.includes(c.name))
                  .map((c) => (
                    <div key={c.id} className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white text-xs">{c.name}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">
                          {c.subcategories?.length || 0} subcategorias
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {c.subcategories?.map((sc, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-slate-300 text-[10px]"
                          >
                            {sc}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Categorias de Peças */}
            <div className="bg-[#121826] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2 text-cyan-400">
                  <Boxes className="w-4 h-4" />
                  <h3 className="font-bold text-white text-sm">Categorias de Peças</h3>
                </div>
                <button
                  onClick={() => {
                    setNewCatType('peca');
                    setShowCategoryModal(true);
                  }}
                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold cursor-pointer"
                >
                  + Nova Categoria
                </button>
              </div>

              <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-lg text-[11px] text-slate-300 leading-relaxed">
                As subcategorias em Serviços classificam serviços específicos (após escolher a categoria). No cadastro de peças, use apenas a categoria de peça. Não confunda com subcategorias do catálogo de serviços.
              </div>

              <div className="space-y-2">
                {defaultPieceCategories.map((pCat) => (
                  <div
                    key={pCat}
                    className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <span className="text-white font-medium">{pCat}</span>
                    <span className="text-[10px] text-slate-500">Padrão do Sistema</span>
                  </div>
                ))}
                {categories
                  .filter((c) => c.type === 'peca' && !defaultPieceCategories.includes(c.name))
                  .map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <span className="text-white font-medium">{c.name}</span>
                      <button
                        onClick={() => deleteDoc(doc(db, 'item_categories', c.id))}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 1: NOVA PEÇA ==================== */}
      {showPieceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Nova peça</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Valores numéricos podem ser informados como texto; siga os campos obrigatórios do formulário.
                </p>
              </div>
              <button
                onClick={() => setShowPieceModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informative Guidance Card */}
            <div className="mt-4 p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <span className="font-bold text-cyan-400 uppercase tracking-wider text-[10px] block">
                Dados da peça
              </span>
              <p className="leading-relaxed">
                code, name e unitOfMeasure obrigatórios na prática; demais opcionais. As subcategorias em Serviços classificam serviços específicos (após escolher a categoria). No cadastro de peças, use apenas a categoria de peça. Não confunda com subcategorias do catálogo de serviços.
              </p>
            </div>

            <form onSubmit={handleCreatePieceSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Código * */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Código *</label>
                  <input
                    type="text"
                    required
                    value={pieceCode}
                    onChange={(e) => setPieceCode(e.target.value)}
                    placeholder="Código de referência"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Nome * */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    value={pieceName}
                    onChange={(e) => setPieceName(e.target.value)}
                    placeholder="Nome da peça"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={pieceDescription}
                  onChange={(e) => setPieceDescription(e.target.value)}
                  placeholder="Descrição técnica da peça ou especificações de aplicação"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Fabricante */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Fabricante</label>
                  <input
                    type="text"
                    value={pieceManufacturer}
                    onChange={(e) => setPieceManufacturer(e.target.value)}
                    placeholder="Ex: SKF, WEG, Parker..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Marca */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Marca</label>
                  <input
                    type="text"
                    value={pieceBrand}
                    onChange={(e) => setPieceBrand(e.target.value)}
                    placeholder="Marca comercial"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Modelo */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Modelo</label>
                  <input
                    type="text"
                    value={pieceModel}
                    onChange={(e) => setPieceModel(e.target.value)}
                    placeholder="Modelo / Part number"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Categoria */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Categoria</label>
                  <select
                    value={pieceCategory}
                    onChange={(e) => setPieceCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  >
                    {defaultPieceCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {categories
                      .filter((c) => c.type === 'peca' && !defaultPieceCategories.includes(c.name))
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Unidade de medida * */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Unidade de medida *</label>
                  <select
                    value={pieceUnitOfMeasure}
                    onChange={(e) => setPieceUnitOfMeasure(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                  >
                    <option value="UN">UN</option>
                    <option value="PC">PC (Peça)</option>
                    <option value="CX">CX (Caixa)</option>
                    <option value="KG">KG (Quilograma)</option>
                    <option value="M">M (Metro)</option>
                    <option value="L">L (Litro)</option>
                    <option value="PAR">PAR</option>
                    <option value="JG">JG (Jogo)</option>
                    <option value="RL">RL (Rolo)</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Status</label>
                  <select
                    value={pieceStatus}
                    onChange={(e) => setPieceStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 font-semibold"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Estoque mínimo */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Estoque mínimo</label>
                  <input
                    type="text"
                    value={pieceMinStock}
                    onChange={(e) => setPieceMinStock(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Estoque máximo */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Estoque máximo</label>
                  <input
                    type="text"
                    value={pieceMaxStock}
                    onChange={(e) => setPieceMaxStock(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Custo médio unitário */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Custo médio unitário</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500 font-mono">R$</span>
                    <input
                      type="text"
                      value={pieceAverageCost}
                      onChange={(e) => setPieceAverageCost(e.target.value)}
                      placeholder="25,50"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* Estoque inicial por unidade */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-white text-xs">Estoque inicial por unidade</span>
                    <p className="text-[11px] text-slate-400">
                      Use “Adicionar linha” para informar saldo inicial por unidade (opcional).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddStockLine}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 text-[11px] font-semibold cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar linha</span>
                  </button>
                </div>

                {initialStockLines.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    {initialStockLines.map((line) => (
                      <div key={line.id} className="flex items-center space-x-2">
                        <select
                          value={line.unitId}
                          onChange={(e) => handleUpdateStockLine(line.id, 'unitId', e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-400"
                        >
                          {units.length === 0 ? (
                            <option value="">Nenhuma unidade cadastrada</option>
                          ) : (
                            units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.code})
                              </option>
                            ))
                          )}
                        </select>
                        <input
                          type="text"
                          value={line.quantity}
                          onChange={(e) => handleUpdateStockLine(line.id, 'quantity', e.target.value)}
                          placeholder="Qtd inicial"
                          className="w-28 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveStockLine(line.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botões Cadastrar / Cancelar */}
              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPieceModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: NOVO SERVIÇO ==================== */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Novo serviço</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cadastre serviços operacionais para vinculação em ordens de serviço e tabelas de preços.
                </p>
              </div>
              <button
                onClick={() => setShowServiceModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateServiceSubmit} className="mt-4 space-y-4 text-xs">
              {/* Título * */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Título *</label>
                <input
                  type="text"
                  required
                  value={serviceTitle}
                  onChange={(e) => setServiceTitle(e.target.value)}
                  placeholder="Título ou descrição resumida do serviço"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  placeholder="Escopo detalhado do serviço, critérios técnicos ou procedimentos envolvidos"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Unidade de medida * */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Unidade de medida *</label>
                  <select
                    value={serviceUnitOfMeasure}
                    onChange={(e) => setServiceUnitOfMeasure(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Ampère · A">Ampère · A</option>
                    <option value="Hora · H">Hora · H</option>
                    <option value="Serviço · SV">Serviço · SV</option>
                    <option value="Visita · VS">Visita · VS</option>
                    <option value="Metro · M">Metro · M</option>
                    <option value="Unidade · UN">Unidade · UN</option>
                    <option value="Ponto · PT">Ponto · PT</option>
                    <option value="Projeto · PRJ">Projeto · PRJ</option>
                  </select>
                </div>

                {/* Categoria * */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Categoria *</label>
                  <select
                    required
                    value={serviceCategory}
                    onChange={(e) => {
                      setServiceCategory(e.target.value);
                      setServiceSubcategory('Nenhuma');
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">Escolha a categoria</option>
                    {defaultServiceCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {categories
                      .filter((c) => c.type === 'servico' && !defaultServiceCategories.includes(c.name))
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Subcategoria */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Subcategoria</label>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Cadastre em Serviços → Subcategorias; use aqui para refinar a categoria (opcional).
                </p>
                <select
                  value={serviceSubcategory}
                  onChange={(e) => setServiceSubcategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="Nenhuma">Nenhuma</option>
                  {currentSubcategories.map((sc, i) => (
                    <option key={i} value={sc}>
                      {sc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Preço base * */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Preço base *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500 font-mono">R$</span>
                    <input
                      type="text"
                      required
                      value={serviceBasePrice}
                      onChange={(e) => setServiceBasePrice(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                {/* Preço proposto */}
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Preço proposto</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500 font-mono">R$</span>
                    <input
                      type="text"
                      value={serviceProposedPrice}
                      onChange={(e) => setServiceProposedPrice(e.target.value)}
                      placeholder="Opcional"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* Ativa */}
              <div className="pt-1 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="serviceActive"
                  checked={serviceActive}
                  onChange={(e) => setServiceActive(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="serviceActive" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Ativa
                </label>
              </div>

              {/* Botões Cancelar / Salvar */}
              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowServiceModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: NOVA MÃO DE OBRA ==================== */}
      {showLaborModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Nova mão de obra</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Taxa horária Homem/Hora (HxH) para ordens de serviço.
                </p>
              </div>
              <button
                onClick={() => setShowLaborModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLaborSubmit} className="mt-4 space-y-4 text-xs">
              {/* Código * */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Código *</label>
                <input
                  type="text"
                  required
                  value={laborCode}
                  onChange={(e) => setLaborCode(e.target.value)}
                  placeholder="Ex: HOH-001"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Nome * */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={laborName}
                  onChange={(e) => setLaborName(e.target.value)}
                  placeholder="Ex: Mecânico Sênior, Eletricista..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={laborDescription}
                  onChange={(e) => setLaborDescription(e.target.value)}
                  placeholder="Qualificação técnica ou escopo da função"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              {/* Valor hora * */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Valor hora *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-mono">R$</span>
                  <input
                    type="text"
                    required
                    value={laborHourlyRate}
                    onChange={(e) => setLaborHourlyRate(e.target.value)}
                    placeholder="0,00"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Ativa */}
              <div className="pt-1 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="laborActive"
                  checked={laborActive}
                  onChange={(e) => setLaborActive(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="laborActive" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Ativa
                </label>
              </div>

              {/* Botões Cancelar / Salvar */}
              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowLaborModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 4: CATEGORIA & SUBCATEGORIA ==================== */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-3">Nova Categoria</h3>
            <form onSubmit={handleCreateCategorySubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Tipo da Categoria *</label>
                <select
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value as ItemType)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="servico">Serviços</option>
                  <option value="peca">Peças</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Nome da Categoria *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ex: Pneumática, Tratamento Térmico..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {newCatType === 'servico' && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Primeira Subcategoria (Opcional)</label>
                  <input
                    type="text"
                    value={newSubcatName}
                    onChange={(e) => setNewSubcatName(e.target.value)}
                    placeholder="Ex: Caldeiraria Leve"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
