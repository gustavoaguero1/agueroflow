import React, { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ensureDefaultCategories } from '../services/financeService';
import type { CostCenter } from '../types';
import type { FinanceCategory } from '../types/finance';
import { NfeInbox } from '../components/finance/NfeInbox';
import { PayablesView } from '../components/finance/PayablesView';
import { CategoriesManager } from '../components/finance/CategoriesManager';
import { ReceivablesView } from '../components/finance/ReceivablesView';

export type FinanceSubSection = 'financeiro-notas' | 'financeiro-pagar' | 'financeiro-receber' | 'financeiro-plano';

export const FinanceModule: React.FC<{ currentSubSection: FinanceSubSection }> = ({ currentSubSection }) => {
  const { organization, moduleLevel } = useAuth();
  const orgId = organization?.id;
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const unsub = onSnapshot(
      query(collection(db, 'finance_categories'), where('orgId', '==', orgId)),
      (s) => setCategories(s.docs.map((d) => ({ ...(d.data() as FinanceCategory), id: d.id })).sort((a, b) => a.nome.localeCompare(b.nome))),
      (e) => setError(`Falha ao carregar o plano de contas: ${e.message}`),
    );
    getDocs(query(collection(db, 'cost_centers'), where('orgId', '==', orgId)))
      .then((s) => setCostCenters(s.docs.map((d) => ({ ...(d.data() as CostCenter), id: d.id }))))
      .catch(() => setCostCenters([]));
    return unsub;
  }, [orgId]);

  // The chart is configuration: created once, when the org has none (needed by every finance screen).
  useEffect(() => {
    if (orgId && moduleLevel('financeiro-plano') >= 2) ensureDefaultCategories(db, orgId).catch((e) => setError(`Falha ao criar o plano de contas padrão: ${e.message}`));
  }, [orgId, moduleLevel]);

  if (!orgId) return null;
  return (
    <div className="space-y-4">
      {error && <p className="text-xs rounded-lg px-3 py-2 bg-red-950/60 text-red-300 border border-red-800/50">{error}</p>}
      {currentSubSection === 'financeiro-notas' && <NfeInbox orgId={orgId} categories={categories} costCenters={costCenters} />}
      {currentSubSection === 'financeiro-pagar' && <PayablesView orgId={orgId} categories={categories} />}
      {currentSubSection === 'financeiro-receber' && <ReceivablesView orgId={orgId} />}
      {currentSubSection === 'financeiro-plano' && <CategoriesManager orgId={orgId} categories={categories} />}
    </div>
  );
};
