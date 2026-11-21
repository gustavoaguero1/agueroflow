import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, query, where, type QueryConstraint } from 'firebase/firestore';
import { AlertTriangle, ChevronRight, CircleCheck, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { db } from '../../firebase';
import type { WorkOrder } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import type { NavSection } from '../layout/AppLayout';
import { getCertificationAlertStatus } from '../construction/FieldPersonnelManager';
import { computeCollectiveAssetCalculations } from '../../types/collectiveAssets';
import { buildPendingItems, todaySaoPaulo, type PendingData, type PendingSeverity } from '../../services/pendingService';

const MAX_VISIBLE = 8;
const STYLE: Record<PendingSeverity, { label: string; dot: string; Icon: typeof Info }> = {
  critico: { label: 'Crítico', dot: 'text-red-600 dark:text-red-400', Icon: AlertTriangle },
  atencao: { label: 'Atenção', dot: 'text-amber-600 dark:text-amber-400', Icon: TriangleAlert },
  info: { label: 'Acompanhar', dot: 'text-[#0071E3] dark:text-[#0A84FF]', Icon: Info },
};
interface Props {
  onNavigate: (section: NavSection) => void;
  workOrders: WorkOrder[];
  completedStatusIds: string[];
}

export const PendingCenter: React.FC<Props> = ({ onNavigate, workOrders, completedStatusIds }) => {
  const { organization } = useAuth();
  const [data, setData] = useState<Omit<PendingData, 'workOrders' | 'completedStatusIds'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [partialPrefixes, setPartialPrefixes] = useState<string[]>([]);
  const [all, setAll] = useState(false);

  const orgRef = useRef<string | undefined>(undefined);
  orgRef.current = organization?.id;

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const org = organization.id;
    const partial = new Set<string>();
    // One source failing (e.g. role without access) must not hide the others.
    const rows = async (coll: string, field = 'orgId', extra: QueryConstraint[] = [], max?: number) => {
      try {
        const s = await getDocs(query(collection(db, coll), where(field, '==', org), ...extra, ...(max ? [limit(max)] : [])));
        if (max && s.size >= max) partial.add(coll);
        return s.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      } catch (e) {
        console.warn(`Central de pendências: ${coll} indisponível`, e);
        return [] as any[];
      }
    };
    const [payables, nfes, balances, items, workers, assets, cats, movs, svcs, props] = await Promise.all([
      rows('finance_payables', 'orgId', [where('status', '==', 'aberto')]),
      rows('nfe_documents', 'orgId', [where('status', 'in', ['aguardando_classificacao', 'erro_classificacao'])]),
      rows('stock_balances', 'orgId', [], 5000), rows('items', 'orgId', [], 5000), rows('field_workers', 'orgId', [], 500),
      rows('collective_assets', 'orgId', [], 1000), rows('collective_asset_categories', 'orgId', [], 200),
      rows('collective_asset_movements', 'orgId', [where('status', 'in', ['EM_USO', 'em_uso', 'ATRASADO', 'atrasado'])], 1000),
      rows('collective_asset_services', 'orgId', [], 3000),
      rows('commercial_proposals', 'organizationId', [where('status', 'in', ['enviada', 'negociacao'])], 500),
    ]);
    if (orgRef.current !== org) return; // org switched while loading: drop stale response
    const byColl: Record<string, string> = { stock_balances: 'stk', items: 'stk', field_workers: 'cert', collective_assets: 'asset', collective_asset_categories: 'asset', collective_asset_movements: 'asset', collective_asset_services: 'asset', commercial_proposals: 'prop' };
    setPartialPrefixes([...new Set([...partial].map((c) => byColl[c]))]);
    const itemMap = new Map<string, any>(items.map((i) => [i.id, i]));
    const catMap = new Map<string, any>(cats.map((c) => [c.id, c]));
    const active = new Map<string, any>();
    movs.forEach((m) => { if (['EM_USO', 'em_uso', 'ATRASADO', 'atrasado'].includes(m.status)) active.set(m.assetId, m); });
    setData({
      hoje: todaySaoPaulo(),
      payables,
      nfes,
      stock: balances.map((b) => {
        const it = itemMap.get(b.itemId);
        return { id: b.id, itemName: it?.name ?? b.itemId, currentBalance: b.currentBalance, minStock: it?.minStock, criticalStock: it?.criticalStock };
      }),
      certAlerts: workers.filter((w) => w.status !== 'desligado').flatMap((w) =>
        (w.nrCertifications || []).filter((c: any) => c.expirationDate).map((c: any) => ({
          id: `${w.id}_${c.id}`, workerName: w.name, nrCode: c.nrCode, daysRemaining: getCertificationAlertStatus(c).daysRemaining,
        }))),
      assets: assets.map((a) => {
        const calc = computeCollectiveAssetCalculations(a, catMap.get(a.categoryId), svcs.filter((s) => s.assetId === a.id), active.get(a.id), undefined as any);
        return { id: a.id, code: a.code, description: a.description, alert: calc.alert };
      }),
      proposals: props,
    });
    setLoading(false);
  }, [organization]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(
    () => (data ? buildPendingItems({ ...data, workOrders: workOrders as PendingData['workOrders'], completedStatusIds }).map((i) =>
      partialPrefixes.includes(i.id.split(':')[0]) ? { ...i, detalhe: `${i.detalhe} (lista parcial)` } : i) : []),
    [data, workOrders, completedStatusIds, partialPrefixes]
  );
  const counts = (s: PendingSeverity) => items.filter((i) => i.severity === s).length;
  const shown = all ? items : items.slice(0, MAX_VISIBLE);

  return (
    <section className="bg-white dark:bg-[#1C1C1E] p-4 sm:p-5 rounded-[22px] border border-black/[0.08] dark:border-white/[0.10] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">Central de Pendências</h3>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D] flex flex-wrap gap-x-3">
            {(['critico', 'atencao', 'info'] as const).map((s) => (
              <span key={s} className={counts(s) ? STYLE[s].dot : ''}>{counts(s)} {STYLE[s].label.toLowerCase()}</span>
            ))}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} aria-label="Atualizar pendências"
          className="min-w-10 min-h-10 inline-flex items-center justify-center rounded-xl text-[#6E6E73] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!loading && items.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CircleCheck className="w-4 h-4" /> Nada pendente por aqui.
        </p>
      )}

      <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
        {shown.map((i) => {
          const { Icon, dot } = STYLE[i.severity];
          return (
            <li key={i.id}>
              <button type="button" onClick={() => onNavigate(i.acao.section)}
                className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.05] rounded-lg px-1">
                <Icon className={`w-4 h-4 shrink-0 ${dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] truncate">{i.titulo}</span>
                  <span className="block text-xs text-[#6E6E73] dark:text-[#98989D] truncate">{i.detalhe}</span>
                </span>
                <span className="hidden sm:inline text-xs text-[#0071E3] dark:text-[#0A84FF] whitespace-nowrap">{i.acao.label}</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-[#6E6E73]" />
              </button>
            </li>
          );
        })}
      </ul>

      {items.length > MAX_VISIBLE && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] cursor-pointer">
          {all ? 'Mostrar menos' : `Ver todas (${items.length})`}
        </button>
      )}
    </section>
  );
};
