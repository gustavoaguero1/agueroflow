import React, { useState } from 'react';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ListTree, Plus, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { CategoryGroup, FinanceCategory } from '../../types/finance';
import { btnGhost, btnPrimary, card, input, label, msgErr } from './ui';

const GRUPOS: CategoryGroup[] = ['Custo direto', 'Custo indireto', 'Despesa administrativa', 'Impostos'];

export const CategoriesManager: React.FC<{ orgId: string; categories: FinanceCategory[] }> = ({ orgId, categories }) => {
  const { isSupervisorOrAbove, isManagerOrAbove } = useAuth();
  const [nome, setNome] = useState('');
  const [grupo, setGrupo] = useState<CategoryGroup>('Custo direto');
  const [editing, setEditing] = useState<{ id: string; nome: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState('');

  const run = (p: Promise<unknown>) => p.then(() => setError(null)).catch((e) => setError(`Falha ao salvar: ${e.message}`));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setError('Informe o nome da categoria.');
    const id = `cat_${orgId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    run(setDoc(doc(db, 'finance_categories', id), { id, orgId, nome: nome.trim(), grupo, ativo: true }).then(() => setNome('')));
  };
  const saveName = () => {
    if (!editing?.nome.trim()) return setEditing(null);
    run(updateDoc(doc(db, 'finance_categories', editing.id), { nome: editing.nome.trim() }).then(() => setEditing(null)));
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2"><ListTree className="w-5 h-5 text-blue-400" />Plano de Contas</h2>
        <p className="text-xs text-slate-400 mt-0.5">Categorias usadas na classificação das notas e nas contas a pagar.</p>
      </div>
      {error && <p className={msgErr}>{error}</p>}
      {isSupervisorOrAbove && (
        <form onSubmit={add} className={`${card} grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-2 items-end`}>
          <div><span className={label}>Nova categoria</span><input className={input} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pintura industrial" /></div>
          <div><span className={label}>Grupo</span>
            <select className={input} value={grupo} onChange={(e) => setGrupo(e.target.value as CategoryGroup)}>{GRUPOS.map((g) => <option key={g}>{g}</option>)}</select></div>
          <button type="submit" className={btnPrimary}><Plus className="w-3.5 h-3.5" />Adicionar</button>
        </form>
      )}
      {GRUPOS.map((g) => {
        const cs = categories.filter((c) => c.grupo === g);
        if (!cs.length) return null;
        return (
          <div key={g} className={`${card} space-y-2`}>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wide">{g}</p>
            {cs.map((c) => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800/60 pt-2" data-testid="category-row">
                {editing?.id === c.id ? (
                  <input className={`${input} sm:max-w-md`} autoFocus value={editing.nome} onChange={(e) => setEditing({ id: c.id, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(null); }} />
                ) : (
                  <span className={`text-xs ${c.ativo === false ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{c.nome}</span>
                )}
                {isSupervisorOrAbove && (
                  <div className="flex flex-wrap gap-2">
                    {editing?.id === c.id
                      ? <button type="button" className={btnPrimary} onClick={saveName}>Salvar</button>
                      : <button type="button" className={btnGhost} onClick={() => setEditing({ id: c.id, nome: c.nome })}>Renomear</button>}
                    <select className={`${input} w-auto`} value={c.grupo} aria-label="Grupo"
                      onChange={(e) => run(updateDoc(doc(db, 'finance_categories', c.id), { grupo: e.target.value }))}>
                      {GRUPOS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                    <button type="button" className={btnGhost} onClick={() => run(updateDoc(doc(db, 'finance_categories', c.id), { ativo: c.ativo === false }))}>
                      {c.ativo === false ? 'Reativar' : 'Desativar'}
                    </button>
                    {isManagerOrAbove && (
                      confirmDel === c.id
                        ? <button type="button" className={btnGhost} onClick={() => run(deleteDoc(doc(db, 'finance_categories', c.id)))}>Confirmar exclusão</button>
                        : <button type="button" className={btnGhost} aria-label="Excluir" title="Excluir (prefira desativar se já foi usada)"
                          onClick={() => setConfirmDel(c.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
