import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { assessChecklistCompletion, createInitialChecklistAnswers } from '../services/checklistValidation';
import {
  ChecklistTemplate,
  ChecklistItemDef,
  ChecklistRun,
  ChecklistItemAnswer,
} from '../types';
import {
  CheckSquare,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  X,
  Trash2,
  FileText,
  Search,
} from 'lucide-react';

export interface ChecklistsModuleProps {
  initialSearchQuery?: string;
  initialTemplateId?: string;
}

export const ChecklistsModule: React.FC<ChecklistsModuleProps> = ({
  initialSearchQuery = '',
  initialTemplateId,
}) => {
  const { user, organization, logAudit } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [runs, setRuns] = useState<ChecklistRun[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  // Template creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateCategory, setTemplateCategory] = useState('Mecânica & Segurança');
  const [items, setItems] = useState<ChecklistItemDef[]>([
    { id: '1', title: 'Verificação visual de vazamentos de fluidos', type: 'sim_nao', required: true },
    { id: '2', title: 'Pressão manométrica indicada (bar)', type: 'numerico', required: true },
  ]);

  // Runner modal
  const [activeRunTemplate, setActiveRunTemplate] = useState<ChecklistTemplate | null>(null);
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, ChecklistItemAnswer>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (initialTemplateId && templates.length > 0) {
      const found = templates.find((t) => t.id === initialTemplateId);
      if (found) {
        startChecklistRun(found);
      }
    }
  }, [initialTemplateId, templates]);

  useEffect(() => {
    if (!organization) return;

    const qTemplates = query(collection(db, 'checklist_templates'), where('orgId', '==', organization.id));
    const unsubTemplates = onSnapshot(qTemplates, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistTemplate)));
    });

    const qRuns = query(collection(db, 'checklist_runs'), where('orgId', '==', organization.id));
    const unsubRuns = onSnapshot(qRuns, (snap) => {
      setRuns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChecklistRun)));
    });

    return () => {
      unsubTemplates();
      unsubRuns();
    };
  }, [organization]);

  const handleAddItemDef = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        title: '',
        type: 'sim_nao',
        required: true,
      },
    ]);
  };

  const handleRemoveItemDef = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !user) return;
    setIsSubmitting(true);

    try {
      const templateId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newTemplate: ChecklistTemplate = {
        id: templateId,
        orgId: organization.id,
        title: templateTitle.trim(),
        description: templateDesc.trim(),
        category: templateCategory,
        items,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'checklist_templates', templateId), newTemplate);
      await logAudit('Checklists', 'Criar Template', `Template de checklist: ${templateTitle}`, templateId);

      setShowCreateModal(false);
      setTemplateTitle('');
      setTemplateDesc('');
    } catch (err) {
      console.error('Erro ao salvar template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startChecklistRun = (tpl: ChecklistTemplate) => {
    setActiveRunTemplate(tpl);
    setCurrentAnswers(createInitialChecklistAnswers(tpl));
    setValidationMessage('');
  };

  const calculateProgress = () => {
    if (!activeRunTemplate) return 0;
    return assessChecklistCompletion(activeRunTemplate, currentAnswers).progressPercent;
  };

  const handleCompleteRun = async () => {
    if (!activeRunTemplate || !organization || !user) return;

    const assessment = assessChecklistCompletion(activeRunTemplate, currentAnswers);
    if (!assessment.canComplete) {
      const missing = assessment.missingRequired;
      setValidationMessage(
        missing.length > 0
          ? `Preencha os itens obrigatórios antes de concluir: ${missing.join('; ')}.`
          : 'Este template não possui itens para execução. Inclua ao menos um item antes de concluir.'
      );
      return;
    }

    setValidationMessage('');
    setIsSubmitting(true);

    try {
      const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newRun: ChecklistRun = {
        id: runId,
        orgId: organization.id,
        templateId: activeRunTemplate.id,
        templateTitle: activeRunTemplate.title,
        inspectorId: user.uid,
        inspectorName: user.displayName || user.email || 'Inspetor',
        progressPercent: assessment.progressPercent,
        nonConformityCount: assessment.nonConformityCount,
        hasNonConformities: assessment.nonConformityCount > 0,
        answers: currentAnswers,
        status: 'concluido',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'checklist_runs', runId), newRun);
      await logAudit(
        'Checklists',
        'Executar Checklist',
        `Checklist concluído: ${activeRunTemplate.title} | Não conformidades: ${assessment.nonConformityCount}`,
        runId
      );

      setActiveRunTemplate(null);
      setValidationMessage('');
    } catch (err) {
      console.error('Erro ao finalizar execução de checklist:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121826] p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Templates e Execução de Checklists</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Padronização de rotinas operacionais, auditoria de itens e acompanhamento de conformidade em campo.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo Template de Checklist</span>
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#121826] p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título do checklist ou categoria..."
            className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
          {templates.filter((t) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
          }).length} template(s)
        </span>
      </div>

      {/* Templates List */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Templates Disponíveis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.filter((t) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
          }).length === 0 ? (
            <div className="col-span-full bg-[#121826] border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
              Nenhum template encontrado com os critérios de busca.
            </div>
          ) : (
            templates
              .filter((t) => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
              })
              .map((tpl) => (
              <div
                key={tpl.id}
                className="bg-[#121826] border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
                    <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 font-semibold border border-blue-800/40">
                      {tpl.category}
                    </span>
                    <span>{tpl.items?.length || 0} itens</span>
                  </div>
                  <h4 className="font-bold text-white text-sm">{tpl.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tpl.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => startChecklistRun(tpl)}
                    className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Executar Checklist em Campo</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Runs Table */}
      <div className="mt-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Histórico de Preenchimento</h3>
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Inspetor</th>
                  <th className="py-3 px-4">Progresso</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-400">
                      Nenhuma execução registrada ainda.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-100">{r.templateTitle}</td>
                      <td className="py-3 px-4 text-slate-300">{r.inspectorName}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${r.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400">{r.progressPercent}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            (r.nonConformityCount ?? (r.hasNonConformities ? 1 : 0)) > 0
                              ? 'bg-red-950/70 text-red-400 border-red-800/50'
                              : 'bg-emerald-950/70 text-emerald-400 border-emerald-800/50'
                          }`}
                        >
                          {r.status === 'concluido' && (r.nonConformityCount ?? (r.hasNonConformities ? 1 : 0)) > 0
                            ? `Concluído · ${r.nonConformityCount ?? 1} NC`
                            : r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {r.completedAt ? new Date(r.completedAt).toLocaleString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Runner Modal */}
      {activeRunTemplate && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                    Executando Checklist
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">{activeRunTemplate.title}</h3>
                </div>
                <button
                  onClick={() => setActiveRunTemplate(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="my-4 p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Progresso de Preenchimento:</span>
                <span className="font-mono font-bold text-emerald-400">{calculateProgress()}%</span>
              </div>

              {/* Questions List */}
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {activeRunTemplate.items.map((it, idx) => {
                  const ans = currentAnswers[it.id];
                  return (
                    <div key={it.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                      <div className="flex items-start justify-between mb-2">
                        <label className="font-semibold text-slate-200">
                          {idx + 1}. {it.title} {it.required && <span className="text-red-400">*</span>}
                        </label>
                      </div>

                      {it.type === 'sim_nao' && (
                        <div className="flex items-center space-x-3">
                          <button
                            type="button"
                            onClick={() =>
                              setValidationMessage('');
                              setCurrentAnswers({
                                ...currentAnswers,
                                [it.id]: { ...ans, value: 'sim', conforme: true },
                              })
                            }
                            className={`px-4 py-1.5 rounded-lg font-semibold transition-all ${
                              ans?.value === 'sim'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            ✓ Conforme (Sim)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setValidationMessage('');
                              setCurrentAnswers({
                                ...currentAnswers,
                                [it.id]: { ...ans, value: 'nao', conforme: false },
                              })
                            }
                            className={`px-4 py-1.5 rounded-lg font-semibold transition-all ${
                              ans?.value === 'nao'
                                ? 'bg-red-600 text-white shadow-md'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            ✕ Não Conforme (Não)
                          </button>
                        </div>
                      )}

                      {it.type === 'numerico' && (
                        <input
                          type="number"
                          step="any"
                          value={ans?.value ?? ''}
                          onChange={(e) =>
                            setValidationMessage('');
                            setCurrentAnswers({
                              ...currentAnswers,
                              [it.id]: { ...ans, value: e.target.value },
                            })
                          }
                          placeholder="Digite o valor medido..."
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                        />
                      )}

                      {it.type === 'texto' && (
                        <textarea
                          rows={2}
                          value={ans?.value ?? ''}
                          onChange={(e) =>
                            setValidationMessage('');
                            setCurrentAnswers({
                              ...currentAnswers,
                              [it.id]: { ...ans, value: e.target.value },
                            })
                          }
                          placeholder="Descreva as constatações..."
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {validationMessage && (
              <div role="alert" className="mb-3 rounded-lg border border-amber-800/70 bg-amber-950/50 px-3 py-2 text-xs text-amber-200">
                {validationMessage}
              </div>
            )}
            <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={() => setActiveRunTemplate(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCompleteRun}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
              >
                {isSubmitting ? 'Salvando...' : 'Finalizar e Registrar Checklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Template */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Criar Template de Checklist</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Título do Checklist *</label>
                <input
                  type="text"
                  required
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  placeholder="Ex: Checklist Pré-Operacional Mecânica"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Categoria</label>
                <input
                  type="text"
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-300">Itens / Perguntas do Checklist</label>
                  <button
                    type="button"
                    onClick={handleAddItemDef}
                    className="text-blue-400 hover:text-blue-300 text-[11px] font-semibold"
                  >
                    + Adicionar Pergunta
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={it.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center space-x-2">
                      <input
                        type="text"
                        required
                        value={it.title}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].title = e.target.value;
                          setItems(updated);
                        }}
                        placeholder="Texto da pergunta/item"
                        className="flex-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px]"
                      />
                      <select
                        value={it.type}
                        onChange={(e) => {
                          const updated = [...items];
                          updated[idx].type = e.target.value as any;
                          setItems(updated);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white text-[11px]"
                      >
                        <option value="sim_nao">Sim / Não</option>
                        <option value="numerico">Numérico</option>
                        <option value="texto">Texto Livre</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveItemDef(it.id)}
                        className="p-1 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
