/**
 * Compras feitas na Mar Travel, puxadas pela API oficial (Lemontech WsSelfBooking).
 * Mostra custo por obra (centro de custo = obra) e todas as solicitações, com o registro
 * completo da Lemontech ao abrir cada uma.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, Building2, ChevronDown, ChevronRight, Plane, Bus, Hotel, Car, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../apiAuthFetch';
import { summarizeCompras, filterCompras, STATUS_LABEL, type CompraMarTravel } from '../../services/marTravelCompras';

interface Status { configured: boolean; lastSync?: { lastSync: string; desde: string; ate: string; total: number } | null }

const card = 'bg-[#111827] border border-slate-700/80 rounded-2xl p-6 shadow-xl';
const brl = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBR = (s?: string) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');
const PERIODOS = [
  { label: 'Últimos 12 meses', dias: 365 },
  { label: 'Últimos 2 anos', dias: 730 },
  { label: 'Últimos 5 anos', dias: 1825 },
];
const statusTone: Record<string, string> = {
  CONCLUIDA: 'bg-emerald-500/15 text-emerald-300',
  CANCELADA: 'bg-rose-500/15 text-rose-300',
  PENDENTE_APROVACAO: 'bg-amber-500/15 text-amber-300',
};

export const MarTravelCompras: React.FC<{ orgId: string; canManage: boolean }> = ({ orgId, canManage }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<CompraMarTravel[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(730);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Record<string, unknown> | null>(null);

  const q = `orgId=${encodeURIComponent(orgId)}`;
  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([apiFetch(`/api/travel/lemontech/status?${q}`), apiFetch(`/api/travel/lemontech/solicitacoes?${q}`)]);
      setStatus(s.ok ? await s.json() : { configured: false });
      setItems(l.ok ? (await l.json()).items ?? [] : []);
    } catch {
      setStatus({ configured: false });
    }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true); setMsg(null);
    try {
      const desde = new Date(Date.now() - periodo * 86400000).toISOString().slice(0, 10);
      const r = await apiFetch('/api/travel/lemontech/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, desde }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || 'Não foi possível sincronizar agora.'); return; }
      setMsg(`${j.total} solicitações atualizadas.`);
      await load();
    } finally { setSyncing(false); }
  };

  const abrir = async (id: string) => {
    if (aberta === id) { setAberta(null); return; }
    setAberta(id); setDetalhe(null);
    const r = await apiFetch(`/api/travel/lemontech/solicitacoes/${encodeURIComponent(id)}?${q}`);
    setDetalhe(r.ok ? (await r.json()).raw : { erro: 'Não foi possível abrir.' });
  };

  const resumo = useMemo(() => summarizeCompras(items), [items]);
  const lista = useMemo(() => filterCompras(items, { status: filtroStatus, busca }), [items, filtroStatus, busca]);

  if (status === null) {
    return <div className={card}><p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando compras…</p></div>;
  }
  if (!status.configured) {
    return (
      <div className={`${card} space-y-1`}>
        <h3 className="text-sm font-bold text-white">Compras na Mar Travel</h3>
        <p className="text-xs text-slate-400">A integração com a API da Mar Travel ainda não está configurada no servidor (secrets LEMONTECH_WS_*).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-4`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Compras na Mar Travel</h3>
            <p className="text-xs text-slate-400">
              {status.lastSync
                ? `Atualizado em ${new Date(status.lastSync.lastSync).toLocaleString('pt-BR')} · período ${dataBR(status.lastSync.desde)} a ${dataBR(status.lastSync.ate)}`
                : 'Ainda não sincronizado.'}
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))} aria-label="Período da sincronização"
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
                {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.label}</option>)}
              </select>
              <button type="button" onClick={sync} disabled={syncing}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5">
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {syncing ? 'Puxando da Mar Travel…' : 'Sincronizar agora'}
              </button>
            </div>
          )}
        </div>
        {syncing && <p className="text-[11px] text-slate-500">A API aceita 60 consultas por minuto; períodos longos levam alguns minutos.</p>}
        {msg && <p className="text-xs text-cyan-300">{msg}</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Custo (sem canceladas)" value={brl(resumo.custoTotal)} />
          <Kpi label="Concluídas" value={String(resumo.porStatus.CONCLUIDA ?? 0)} />
          <Kpi label="Aguardando aprovação" value={String(resumo.porStatus.PENDENTE_APROVACAO ?? 0)} />
          <Kpi label="Canceladas" value={String(resumo.porStatus.CANCELADA ?? 0)} />
          <Kpi label="Sem obra ligada" value={String(resumo.semObra)} warn={resumo.semObra > 0} />
        </div>
      </div>

      {resumo.porObra.length > 0 && (
        <div className={`${card} space-y-3`}>
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-cyan-400" /> Custo por obra</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left"><tr><th className="py-2 pr-3 font-medium">Obra / centro de custo</th><th className="py-2 pr-3 font-medium text-right">Solicitações</th><th className="py-2 font-medium text-right">Custo</th></tr></thead>
              <tbody>
                {resumo.porObra.map((o) => (
                  <tr key={o.chave} className="border-t border-slate-800">
                    <td className="py-2 pr-3 text-slate-200">
                      {o.nome}
                      {o.chave.startsWith('cc:') && <span className="ml-2 text-[10px] text-amber-300">sem obra cadastrada com esse código</span>}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-300">{o.qtd}</td>
                    <td className="py-2 text-right text-white font-semibold">{brl(o.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`${card} space-y-3`}>
        <div className="flex flex-col md:flex-row gap-2 md:items-center justify-between">
          <h3 className="text-sm font-bold text-white">Solicitações ({lista.length})</h3>
          <div className="flex gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar passageiro, obra, nº…" aria-label="Buscar solicitação"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-56" />
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} aria-label="Filtrar por situação"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
              <option value="">Todas as situações</option>
              {Object.keys(resumo.porStatus).map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma solicitação ainda. {canManage ? 'Clique em "Sincronizar agora" para puxar da Mar Travel.' : 'Peça a um gerente para sincronizar.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left">
                <tr>
                  <th className="py-2 pr-3 font-medium">Nº</th><th className="py-2 pr-3 font-medium">Data</th><th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 pr-3 font-medium">Passageiros</th><th className="py-2 pr-3 font-medium">Obra</th><th className="py-2 pr-3 font-medium">Itens</th>
                  <th className="py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer" onClick={() => abrir(c.id)}>
                      <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                        <button type="button" className="flex items-center gap-1" aria-expanded={aberta === c.id}>
                          {aberta === c.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{c.id}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{dataBR(c.criadaEm)}</td>
                      <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-[11px] ${statusTone[c.status] ?? 'bg-slate-700 text-slate-200'}`}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                      <td className="py-2 pr-3 text-slate-200">{c.passageiros.map((p) => p.nome).filter(Boolean).join(', ') || '—'}</td>
                      <td className="py-2 pr-3 text-slate-300">
                        {c.unitName ?? <span className="text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{c.centroDeCusto?.nome ?? c.centroDeCusto?.codigo ?? 'sem centro de custo'}</span>}
                      </td>
                      <td className="py-2 pr-3 text-slate-300"><Itens p={c.produtos} /></td>
                      <td className={`py-2 text-right font-semibold ${c.status === 'CANCELADA' ? 'text-slate-500 line-through' : 'text-white'}`}>{brl(c.valorTotal)}</td>
                    </tr>
                    {aberta === c.id && (
                      <tr className="border-t border-slate-800/60">
                        <td colSpan={7} className="py-3">
                          {detalhe === null
                            ? <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo…</p>
                            : <pre className="text-[11px] text-slate-300 bg-slate-950 rounded-xl p-3 overflow-auto max-h-96">{JSON.stringify(detalhe, null, 2)}</pre>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
    <p className="text-[11px] text-slate-400">{label}</p>
    <p className={`text-base font-bold ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
  </div>
);

const Itens: React.FC<{ p: CompraMarTravel['produtos'] }> = ({ p }) => {
  const parts: React.ReactNode[] = [];
  if (p.aereos) parts.push(<span key="a" className="flex items-center gap-0.5"><Plane className="w-3 h-3" />{p.aereos}</span>);
  if (p.rodoviarios) parts.push(<span key="r" className="flex items-center gap-0.5"><Bus className="w-3 h-3" />{p.rodoviarios}</span>);
  if (p.hoteis) parts.push(<span key="h" className="flex items-center gap-0.5"><Hotel className="w-3 h-3" />{p.hoteis}</span>);
  if (p.carros) parts.push(<span key="c" className="flex items-center gap-0.5"><Car className="w-3 h-3" />{p.carros}</span>);
  const outros = p.outros + p.seguros + p.traslados;
  if (outros) parts.push(<span key="o">+{outros}</span>);
  return <span className="flex gap-2">{parts.length ? parts : '—'}</span>;
};
