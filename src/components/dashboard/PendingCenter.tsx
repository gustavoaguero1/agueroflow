import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, ChevronRight, CircleCheck, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { NavSection } from '../layout/AppLayout';
import { getCertificationAlertStatus } from '../construction/FieldPersonnelManager';
import { computeCollectiveAssetCalculations } from '../../types/collectiveAssets';
import { buildPendingItems, type PendingData, type PendingSeverity } from '../../services/pendingService';

const MAX_VISIBLE = 8;
const STYLE: Record<PendingSeverity, { label: string; dot: string; Icon: typeof Info }> = {
  critico: { label: 'Crítico', dot: 'text-red-600 dark:text-red-400', Icon: AlertTriangle },
  atencao: { label: 'Atenção', dot: 'text-amber-600 dark:text-amber-400', Icon: TriangleAlert },
  info: { label: 'Acompanhar', dot: 'text-[#0071E3] dark:text-[#0A84FF]', Icon: Info },
};
// Used until the org has configured work_order_statuses.
const FALLBACK_COMPLETED = ['concluido', 'validado', 'concluida', 'encerrada'];

export function mergeCompletedStatusIds(configs: { id: string; isCompleted?: boolean }[]): string[] {
  const ids = configs.filter((c) => c.isCompleted).map((c) => c.id);
  return configs.length ? ids : FALLBACK_COMPLETED;
}

export const PendingCenter: React.FC<{ onNavigate: (section: NavSection) => void }> = ({ onNavigate }) => {
  const { organization } = useAuth();
  const [data, setData] = useState<PendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const org = organization.id;
    // One source failing (e.g. role without access) must not hide the others.
    const rows = async (coll: string, field = 'orgId') => {
      try {
        const s = await getDocs(query(collection(db, coll), where(field, '==', org)));
        return s.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      } catch (e) {
        console.warn(`Central de pendências: ${coll} indisponível`, e);
        return [] as any[];
      }
    };
    const [payables, nfes, balances, items, workers, assets, cats, movs, svcs, wos, statuses, props] = await Promise.all([
      rows('finance_payables'), rows('nfe_documents'), rows('stock_balances'), rows('items'), rows('field_workers'),
      rows('collective_assets'), rows('collective_asset_categories'), rows('collective_asset_movements'), rows('collective_asset_services'),
      rows('work_orders'), rows('work_order_statuses'), rows('commercial_proposals', 'organizationId'),
    ]);
    const itemMap = new Map<string, any>(items.map((i) => [i.id, i]));
    const catMap = new Map<string, any>(cats.map((c) => [c.id, c]));
    const active = new Map<string, any>();
    movs.forEach((m) => { if (['EM_USO', 'em_uso', 'ATRASADO', 'atrasado'].includes(m.status)) active.set(m.assetId, m); });
    setData({
      hoje: new Date().toISOString().slice(0, 10),
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
      workOrders: wos,
      completedStatusIds: mergeCompletedStatusIds(statuses),
      proposals: props,
    });
    setLoading(false);
  }, [organization]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => (data ? buildPendingItems(data) : []), [data]);
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
          className="p-2 rounded-xl text-[#6E6E73] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
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
