import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { NavSection } from '../layout/AppLayout';
import {
  Search,
  X,
  ClipboardList,
  Wrench,
  CheckSquare,
  AlertTriangle,
  HardHat,
  ArrowRight,
  Boxes,
  Clock,
  Sparkles,
  Command,
  CornerDownLeft,
  ChevronRight,
  Filter,
  Tag,
} from 'lucide-react';

export interface GlobalSearchResult {
  id: string;
  category: 'ordens' | 'pecas' | 'checklists' | 'ocorrencias' | 'obras';
  categoryLabel: string;
  title: string;
  subtitle: string;
  code?: string;
  badgeText?: string;
  badgeColor?: string;
  targetSection: NavSection;
  targetId: string;
  searchPayload: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (result: GlobalSearchResult) => void;
}

type CategoryFilter = 'todos' | 'ordens' | 'pecas' | 'checklists' | 'ocorrencias' | 'obras';

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
}) => {
  const { organization } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('todos');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Cached datasets for fast live search
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [rawChecklists, setRawChecklists] = useState<any[]>([]);
  const [rawOccurrences, setRawOccurrences] = useState<any[]>([]);
  const [rawConstructions, setRawConstructions] = useState<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      loadAllData();
    } else {
      setSearchTerm('');
      setSelectedIndex(0);
    }
  }, [isOpen, organization?.id]);

  // Load datasets when modal is open
  const loadAllData = async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const orgId = organization.id;

      const [ordersSnap, itemsSnap, checkSnap, occSnap, constSnap] = await Promise.all([
        getDocs(query(collection(db, 'work_orders'), where('orgId', '==', orgId), limit(150))),
        getDocs(query(collection(db, 'items'), where('orgId', '==', orgId), limit(200))),
        getDocs(query(collection(db, 'checklist_templates'), where('orgId', '==', orgId), limit(100))),
        getDocs(query(collection(db, 'occurrences'), where('orgId', '==', orgId), limit(100))),
        getDocs(query(collection(db, 'constructions'), where('orgId', '==', orgId), limit(100))),
      ]);

      setRawOrders(ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setRawItems(itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setRawChecklists(checkSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setRawOccurrences(occSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setRawConstructions(constSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Erro ao carregar dados da busca global:', err);
    } finally {
      setLoading(false);
    }
  };

  // Convert raw entities to uniform searchable results
  const allResults = useMemo<GlobalSearchResult[]>(() => {
    const list: GlobalSearchResult[] = [];

    // 1. Ordens de Serviço
    rawOrders.forEach((o) => {
      const statusLabel =
        o.status === 'em_execucao'
          ? 'Em Execução'
          : o.status === 'aguardando_pecas'
          ? 'Aguardando Peças'
          : o.status === 'concluido' || o.status === 'concluida'
          ? 'Concluído'
          : o.status === 'validado' || o.status === 'encerrada'
          ? 'Validado'
          : 'Aberto';

      const badgeColor =
        o.status === 'em_execucao'
          ? 'bg-blue-950/80 text-blue-300 border-blue-800'
          : o.status === 'aguardando_pecas'
          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
          : o.status === 'concluido' || o.status === 'concluida'
          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
          : o.status === 'validado' || o.status === 'encerrada'
          ? 'bg-purple-950/80 text-purple-300 border-purple-800'
          : 'bg-slate-800 text-slate-300 border-slate-700';

      list.push({
        id: o.id,
        category: 'ordens',
        categoryLabel: 'Ordem de Serviço',
        title: o.title || 'Sem título',
        subtitle: `${o.assignedTeam ? `Equipe: ${o.assignedTeam} • ` : ''}${o.description || 'OS operacional'}`,
        code: o.orderNumber || 'OS',
        badgeText: statusLabel,
        badgeColor,
        targetSection: 'ordens',
        targetId: o.id,
        searchPayload: `${o.orderNumber || ''} ${o.title || ''} ${o.description || ''} ${o.assignedTeam || ''} ${o.assignedTo || ''} ${statusLabel}`.toLowerCase(),
      });
    });

    // 2. Peças e Serviços
    rawItems.forEach((i) => {
      const typeLabel =
        i.type === 'peca' ? 'Peça' : i.type === 'servico' ? 'Serviço' : 'Mão de Obra';
      const targetSec: NavSection =
        i.type === 'peca'
          ? 'pecas-catalogo'
          : i.type === 'servico'
          ? 'servicos-catalogo'
          : 'mao-de-obra';

      list.push({
        id: i.id,
        category: 'pecas',
        categoryLabel: typeLabel,
        title: i.name || 'Item sem nome',
        subtitle: `${i.category ? `Cat: ${i.category} • ` : ''}${i.description || 'Item de catálogo'}`,
        code: i.code || i.sku || 'SKU',
        badgeText: typeLabel,
        badgeColor:
          i.type === 'peca'
            ? 'bg-indigo-950/80 text-indigo-300 border-indigo-800'
            : i.type === 'servico'
            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
            : 'bg-amber-950/80 text-amber-300 border-amber-800',
        targetSection: targetSec,
        targetId: i.id,
        searchPayload: `${i.code || ''} ${i.sku || ''} ${i.name || ''} ${i.category || ''} ${i.description || ''} ${typeLabel}`.toLowerCase(),
      });
    });

    // 3. Checklists
    rawChecklists.forEach((c) => {
      list.push({
        id: c.id,
        category: 'checklists',
        categoryLabel: 'Checklist',
        title: c.title || 'Checklist',
        subtitle: `${c.category ? `Categoria: ${c.category} • ` : ''}${c.items?.length || 0} itens de verificação`,
        code: 'TEMPLATE',
        badgeText: `${c.items?.length || 0} verificações`,
        badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
        targetSection: 'checklists',
        targetId: c.id,
        searchPayload: `${c.title || ''} ${c.category || ''} ${c.description || ''} checklist vistoria inspecao`.toLowerCase(),
      });
    });

    // 4. Ocorrências
    rawOccurrences.forEach((occ) => {
      list.push({
        id: occ.id,
        category: 'ocorrencias',
        categoryLabel: 'Ocorrência',
        title: occ.title || 'Ocorrência',
        subtitle: `${occ.ishikawaCategory ? `Causa: ${occ.ishikawaCategory} • ` : ''}${occ.description || 'Não conformidade'}`,
        code: occ.code || 'RNC',
        badgeText: occ.severity || 'Ocorrência',
        badgeColor: 'bg-rose-950/80 text-rose-300 border-rose-800',
        targetSection: 'ocorrencias',
        targetId: occ.id,
        searchPayload: `${occ.code || ''} ${occ.title || ''} ${occ.description || ''} ${occ.ishikawaCategory || ''} ${occ.severity || ''}`.toLowerCase(),
      });
    });

    // 5. Obras & RDO
    rawConstructions.forEach((cs) => {
      list.push({
        id: cs.id,
        category: 'obras',
        categoryLabel: 'Obra / RDO',
        title: cs.title || cs.name || 'Obra Industrial',
        subtitle: `${cs.clientName ? `Cliente: ${cs.clientName} • ` : ''}${cs.location || 'Canteiro de obras'}`,
        code: cs.code || 'OBRA',
        badgeText: cs.status || 'Ativa',
        badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-800',
        targetSection: 'obras',
        targetId: cs.id,
        searchPayload: `${cs.code || ''} ${cs.title || ''} ${cs.clientName || ''} ${cs.location || ''} rdo obra montagem`.toLowerCase(),
      });
    });

    return list;
  }, [rawOrders, rawItems, rawChecklists, rawOccurrences, rawConstructions]);

  // Filter results based on search term & category filter
  const filteredResults = useMemo(() => {
    let result = allResults;

    if (activeCategory !== 'todos') {
      result = result.filter((r) => r.category === activeCategory);
    }

    if (!searchTerm.trim()) {
      return result.slice(0, 10);
    }

    const q = searchTerm.toLowerCase().trim();
    const queryParts = q.split(' ').filter(Boolean);

    return result
      .filter((r) => queryParts.every((part) => r.searchPayload.includes(part)))
      .slice(0, 30);
  }, [allResults, activeCategory, searchTerm]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults]);

  // Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : prev));
      scrollSelectedIntoView(selectedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      scrollSelectedIntoView(selectedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const scrollSelectedIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.children;
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  };

  const handleSelect = (result: GlobalSearchResult) => {
    onSelectResult(result);
    onClose();
  };

  const getCategoryIcon = (category: GlobalSearchResult['category']) => {
    switch (category) {
      case 'ordens':
        return <ClipboardList className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'pecas':
        return <Wrench className="w-4 h-4 text-indigo-400 shrink-0" />;
      case 'checklists':
        return <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'ocorrencias':
        return <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'obras':
        return <HardHat className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <Search className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  // Quick jump actions for empty search
  const quickActions: { label: string; category: CategoryFilter; section: NavSection; icon: React.ReactNode }[] = [
    { label: 'Ver Ordens de Serviço', category: 'ordens', section: 'ordens', icon: <ClipboardList className="w-3.5 h-3.5 text-blue-400" /> },
    { label: 'Catálogo de Peças & Inox', category: 'pecas', section: 'pecas-catalogo', icon: <Wrench className="w-3.5 h-3.5 text-indigo-400" /> },
    { label: 'Templates de Checklists', category: 'checklists', section: 'checklists', icon: <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> },
    { label: 'Ocorrências & Ishikawa', category: 'ocorrencias', section: 'ocorrencias', icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> },
    { label: 'Diário de Obras (RDO)', category: 'obras', section: 'obras', icon: <HardHat className="w-3.5 h-3.5 text-amber-400" /> },
  ];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/65 backdrop-blur-md flex items-start justify-center pt-10 sm:pt-20 px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="af-glass-strong rounded-3xl max-w-2xl w-full overflow-hidden flex flex-col text-[#1D1D1F] dark:text-[#F5F5F7] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-5 py-4 border-b border-black/[0.08] dark:border-white/[0.08]">
          <Search className="w-5 h-5 text-[#0071E3] dark:text-[#409CFF] shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código de OS (ex: OS-2026), peça (ex: Flange), checklist..."
            className="flex-1 bg-transparent text-sm sm:text-base text-[#1D1D1F] dark:text-white placeholder:text-[#86868B] focus:outline-none border-none shadow-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-[#6E6E73] dark:text-[#98989D] mr-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.10] text-[10px] text-[#6E6E73] dark:text-[#AEAEB2] font-mono">
            <span>ESC</span>
          </kbd>
        </div>

        {/* Category Pills Filter */}
        <div className="flex items-center space-x-1.5 px-4 py-2.5 border-b border-black/[0.06] dark:border-white/[0.08] overflow-x-auto custom-scrollbar text-xs">
          <span className="text-[#86868B] text-[11px] font-medium mr-1 flex items-center shrink-0">
            <Filter className="w-3 h-3 mr-1" />
            Filtro:
          </span>
          <div className="af-seg rounded-xl p-0.5 inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setActiveCategory('todos')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeCategory === 'todos' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn'
              }`}
            >
              Todos ({allResults.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('ordens')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center space-x-1 cursor-pointer ${
                activeCategory === 'ordens' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn'
              }`}
            >
              <span>OS</span>
              <span className="opacity-70 text-[10px] tabular-nums">({rawOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('pecas')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center space-x-1 cursor-pointer ${
                activeCategory === 'pecas' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn'
              }`}
            >
              <span>Peças/Itens</span>
              <span className="opacity-70 text-[10px] tabular-nums">({rawItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('checklists')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center space-x-1 cursor-pointer ${
                activeCategory === 'checklists' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn'
              }`}
            >
              <span>Checklists</span>
              <span className="opacity-70 text-[10px] tabular-nums">({rawChecklists.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('ocorrencias')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center space-x-1 cursor-pointer ${
                activeCategory === 'ocorrencias' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn'
              }`}
            >
              <span>Ocorrências</span>
              <span className="opacity-70 text-[10px] tabular-nums">({rawOccurrences.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('obras')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center space-x-1 cursor-pointer ${
                activeCategory === 'obras' ? 'af-seg-btn-active font-semibold' : 'af-seg-btn'
              }`}
            >
              <span>Obras</span>
              <span className="opacity-70 text-[10px] tabular-nums">({rawConstructions.length})</span>
            </button>
          </div>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[420px] custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Sincronizando base de dados...</span>
            </div>
          ) : filteredResults.length > 0 ? (
            filteredResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.category}_${item.id}_${idx}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/80 shadow-md'
                      : 'hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                      {getCategoryIcon(item.category)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 mb-0.5">
                        {item.code && (
                          <span className="font-mono text-[11px] font-bold text-blue-400 shrink-0">
                            {item.code}
                          </span>
                        )}
                        <span className="font-semibold text-slate-200 truncate text-[13px]">
                          {item.title}
                        </span>
                        {item.badgeText && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${
                              item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {item.badgeText}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-slate-500 shrink-0">
                    <span className="hidden sm:inline text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {item.categoryLabel}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        isSelected ? 'text-blue-400 translate-x-0.5' : 'text-slate-600'
                      }`}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-10 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-300">
                  Nenhum registro encontrado para "{searchTerm}"
                </p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  Tente buscar pelo código da OS, nome da peça, modelo de checklist ou número de série.
                </p>
              </div>

              {/* Quick Suggestions */}
              <div className="pt-4 border-t border-slate-800/80 max-w-md mx-auto text-left">
                <p className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                  Atalhos Rápidos:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickActions.map((qa) => (
                    <button
                      key={qa.section}
                      type="button"
                      onClick={() => {
                        onSelectResult({
                          id: '',
                          category: qa.category === 'todos' ? 'ordens' : qa.category,
                          categoryLabel: qa.label,
                          title: qa.label,
                          subtitle: 'Ir para o módulo',
                          targetSection: qa.section,
                          targetId: '',
                          searchPayload: '',
                        });
                        onClose();
                      }}
                      className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left flex items-center space-x-2 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      {qa.icon}
                      <span className="truncate">{qa.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-[#0E1424] border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono">↓</kbd>
              <span className="ml-1">Navegar</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono">↵</kbd>
              <span className="ml-1">Abrir</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono">ESC</kbd>
              <span className="ml-1">Fechar</span>
            </span>
          </div>

          <span className="text-[10px] text-blue-400 font-mono mt-1 sm:mt-0">
            {allResults.length} registros indexados em tempo real
          </span>
        </div>
      </div>
    </div>
  );
};
