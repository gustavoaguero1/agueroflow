import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { FileText, RefreshCw, Upload, Inbox } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { postJson, apiFetch } from '../../apiAuthFetch';
import { brl, releaseStuckNfe, STUCK_MS } from '../../services/financeService';
import type { CostCenter } from '../../types';
import type { FinanceCategory, NfeDocument, NfeStatus } from '../../types/finance';
import { NfeClassifyModal, NfeTaxSummary } from './NfeClassifyModal';
import { PurchaseReconciliationView } from './PurchaseReconciliationView';
import { btnGhost, btnPrimary, card, fmtDate, msgErr, msgOk } from './ui';

const STATUS: Record<NfeStatus, { label: string; cls: string }> = {
  resumo: { label: 'Resumo (aguardando XML)', cls: 'bg-slate-800 text-slate-300 border-slate-700' },
  aguardando_classificacao: { label: 'Aguardando classificação', cls: 'bg-amber-950/70 text-amber-300 border-amber-800/50' },
  classificando: { label: 'Classificando…', cls: 'bg-blue-950/70 text-blue-300 border-blue-800/50' },
  classificada: { label: 'Classificada', cls: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/50' },
  erro_classificacao: { label: 'Erro na classificação', cls: 'bg-red-950/70 text-red-400 border-red-800/50' },
};
const MAX_BYTES = 1_000_000; // same limit as the server
const BATCH = 10;

type SyncStatus = { configured: boolean; lastRunAt?: string; nextRunAt?: string; lastStatus?: string; ambiente?: string; error?: string };
const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

export const NfeInbox: React.FC<{ orgId: string; categories: FinanceCategory[]; costCenters: CostCenter[] }> = ({ orgId, categories, costCenters }) => {
  const { isManagerOrAbove, isSupervisorOrAbove } = useAuth();
  const [docs, setDocs] = useState<NfeDocument[]>([]);
  const [filter, setFilter] = useState<'todas' | NfeStatus>('todas');
  const [busy, setBusy] = useState<'' | 'upload' | 'sync'>('');
  const [msgs, setMsgs] = useState<{ ok: boolean; text: string }[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [classifying, setClassifying] = useState<NfeDocument | null>(null);
  const [view, setView] = useState<'caixa' | 'conciliacao'>('caixa');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => onSnapshot(
    query(collection(db, 'nfe_documents'), where('orgId', '==', orgId)),
    (s) => setDocs(s.docs.map((d) => ({ ...(d.data() as NfeDocument), id: d.id })).sort((a, b) => (b.recebidaEm ?? '').localeCompare(a.recebidaEm ?? ''))),
    (e) => setMsgs([{ ok: false, text: `Falha ao carregar notas: ${e.message}` }]),
  ), [orgId]);

  const loadSync = () => apiFetch(`/api/nfe/sync-status?orgId=${encodeURIComponent(orgId)}`)
    .then((r) => r.json()).then(setSync).catch(() => setSync(null));
  useEffect(() => { loadSync(); }, [orgId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('upload');
    setMsgs([]);
    const out: { ok: boolean; text: string }[] = [];
    try {
      const list = [...files];
      for (const f of list.filter((x) => x.size > MAX_BYTES)) out.push({ ok: false, text: `${f.name}: arquivo maior que 1 MB.` });
      const ok = list.filter((x) => x.size <= MAX_BYTES);
      for (let i = 0; i < ok.length; i += BATCH) {
        const payload = await Promise.all(ok.slice(i, i + BATCH).map(async (f) => ({ name: f.name, content: await f.text() })));
        const r = await postJson<{ results?: { name: string; ok: boolean; created?: boolean; error?: string }[] }>('/api/nfe/import', { orgId, files: payload });
        if (!r.data.results) out.push({ ok: false, text: r.error || `Falha ao importar (HTTP ${r.status}).` });
        else out.push(...r.data.results.map((x) => ({
          ok: x.ok,
          text: x.ok ? `${x.name}: ${x.created ? 'nota importada' : 'nota já estava na caixa'}` : `${x.name}: ${x.error}`,
        })));
        setMsgs([...out]);
      }
      setMsgs(out);
    } catch (e) {
      setMsgs([...out, { ok: false, text: `Falha ao importar: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    setMsgs([]);
    try {
      const r = await postJson<{ skipped?: boolean; nextRunAt?: string; fetched?: number; full?: number; summaries?: number }>('/api/nfe/sync-now', { orgId });
      if (!r.ok) setMsgs([{ ok: false, text: r.error || `Falha na busca (HTTP ${r.status}).` }]);
      else if (r.data.skipped) setMsgs([{ ok: true, text: `A SEFAZ só pode ser consultada novamente após ${fmtDateTime(r.data.nextRunAt)}.` }]);
      else setMsgs([{ ok: true, text: `Busca concluída: ${r.data.full ?? 0} nota(s) completa(s), ${r.data.summaries ?? 0} resumo(s).` }]);
    } catch (e) {
      setMsgs([{ ok: false, text: `Falha na busca: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy('');
      loadSync();
    }
  };

  const release = (d: NfeDocument) => releaseStuckNfe(db, d.id).catch((e) => setMsgs([{ ok: false, text: `Falha ao liberar nota: ${e.message}` }]));
  const shown = filter === 'todas' ? docs : docs.filter((d) => d.status === filter);
  const count = (s: NfeStatus) => docs.filter((d) => d.status === s).length;

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2"><Inbox className="w-5 h-5 text-blue-400" />Caixa de Notas</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            NF-e emitidas para o CNPJ da empresa. Classifique cada item: estoque, consumo ou despesa.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {sync?.configured
              ? `SEFAZ (${sync.ambiente === '1' ? 'produção' : 'homologação'}): última busca ${fmtDateTime(sync.lastRunAt)}${sync.lastStatus ? ` — ${sync.lastStatus}` : ''}; próxima após ${fmtDateTime(sync.nextRunAt)}`
              : 'Busca automática na SEFAZ não configurada neste servidor — importe os XML manualmente.'}
          </p>
        </div>
        {isManagerOrAbove && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input ref={fileRef} type="file" accept=".xml" multiple className="hidden" data-testid="nfe-upload" onChange={(e) => upload(e.target.files)} />
            <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />{busy === 'upload' ? 'Importando…' : 'Importar XML'}
            </button>
            {sync?.configured && (
              <button type="button" className={btnGhost} disabled={!!busy} onClick={syncNow}>
                <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />Buscar na SEFAZ agora
              </button>
            )}
          </div>
        )}
      </div>

      {msgs.length > 0 && <div className="space-y-1">{msgs.map((m, i) => <p key={i} className={m.ok ? msgOk : msgErr}>{m.text}</p>)}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setView('caixa')} aria-pressed={view === 'caixa'} className={'px-3 py-1.5 rounded-lg text-[11px] font-semibold border ' + (view === 'caixa' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-700')}>Caixa de notas</button>
        <button type="button" onClick={() => setView('conciliacao')} aria-pressed={view === 'conciliacao'} className={'px-3 py-1.5 rounded-lg text-[11px] font-semibold border ' + (view === 'conciliacao' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-700')}>Conciliação OC × NF-e</button>
      </div>

      {view === 'conciliacao' ? <PurchaseReconciliationView orgId={orgId} invoices={docs} /> : <>
      <div className="flex flex-wrap gap-2">
        {(['todas', 'aguardando_classificacao', 'erro_classificacao', 'classificada', 'resumo'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${filter === s ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-700'}`}>
            {s === 'todas' ? `Todas (${docs.length})` : `${STATUS[s].label} (${count(s)})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className={`${card} text-center text-xs text-slate-400 py-10`}>Nenhuma nota nesta visão.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((d) => {
            const st = STATUS[d.status] ?? STATUS.resumo;
            const started = d.classificacao?.startedAt?.toMillis?.(); // server time
            const stuck = d.status === 'classificando' && started != null && Date.now() - started > STUCK_MS;
            return (
              <div key={d.id} className={`${card} space-y-2`} data-testid="nfe-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{d.emitente?.nome || 'Emitente'}</p>
                    <p className="text-[11px] text-slate-400">CNPJ {d.emitente?.cnpj} · NF-e {d.numero ?? '—'}{d.serie ? `/${d.serie}` : ''}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-[11px] text-slate-400">
                    <p>Emitida {fmtDate(d.emitidaEm)} · {d.itens?.length ?? 0} item(ns)</p>
                    <p>{d.source === 'sefaz' ? 'Recebida da SEFAZ' : 'Importada por XML'}</p>
                  </div>
                  <p className="text-base font-extrabold text-white font-mono">{brl.format(d.valorTotal ?? 0)}</p>
                </div>
                {d.status === 'aguardando_classificacao' && (
                  <p className="text-[11px] font-semibold text-amber-300">Pendente: falta informar a obra</p>
                )}
                {d.status === 'erro_classificacao' && d.erroClassificacao && <p className={msgErr}>{d.erroClassificacao}</p>}
                {d.status !== 'resumo' && (
                  <details>
                    <summary className="text-[11px] text-slate-400 cursor-pointer">Impostos e totais</summary>
                    <div className="mt-2"><NfeTaxSummary nfe={d} /></div>
                  </details>
                )}
                {isSupervisorOrAbove && (d.status === 'aguardando_classificacao' || d.status === 'erro_classificacao') && (
                  <button type="button" className={`${btnPrimary} w-full`} onClick={() => setClassifying(d)}>
                    <FileText className="w-3.5 h-3.5" />{d.status === 'erro_classificacao' ? 'Tentar novamente' : 'Informar obra'}
                  </button>
                )}
                {isManagerOrAbove && stuck && (
                  <button type="button" className={`${btnGhost} w-full`} onClick={() => release(d)}>Classificação interrompida — liberar</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {classifying && (
        <NfeClassifyModal nfe={classifying} orgId={orgId} categories={categories} costCenters={costCenters}
          onClose={() => setClassifying(null)}
          onDone={() => { setClassifying(null); setMsgs([{ ok: true, text: 'Nota classificada: contas a pagar atualizadas; entrada de materiais controlada pelo vínculo com a OC/recebimento.' }]); }} />
      )}
      </>}
    </div>
  );
};
