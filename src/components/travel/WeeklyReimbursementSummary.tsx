import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CheckCircle2, Wallet, FileSpreadsheet, Eye, X, AlertTriangle, MapPin } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, downloadApi } from '../../apiAuthFetch';

type Nota = {
  id: string; receiptDate: string; establishmentName: string; category: string; totalAmount: number; status: string;
  obraName: string; contractId: string; obraStatus?: string; workerStatus?: string; imageStatus?: string;
};
type Funcionario = {
  nome: string; workerId?: string; totalAprovado: number; totalPendente: number; pendentes: number;
  porCategoria: Record<string, number>; porObra: Record<string, number>; notas: Nota[];
};
type Semana = {
  inicio: string; fim: string; funcionarios: Funcionario[];
  totais: { totalAprovado: number; totalPendente: number; pendentes: number; notas: number };
  avisos: { obraADefinir: number; funcionarioAIdentificar: number };
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');
const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

export const WeeklyReimbursementSummary: React.FC = () => {
  const { organization, moduleLevel } = useAuth();
  const orgId = organization?.id;
  const canManage = moduleLevel('ops-reembolso') >= 3;
  const [inicio, setInicio] = useState<string | undefined>(); // undefined = previous week (server default)
  const [semana, setSemana] = useState<Semana | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imagem, setImagem] = useState<string | null>(null);
  const [contratos, setContratos] = useState<{ id: string; nome: string }[]>([]);

  const qs = (ini?: string) => new URLSearchParams({ ...(ini ? { inicio: ini } : {}), ...(orgId ? { orgId } : {}) }).toString();

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/reembolsos/semana?${qs(inicio)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSemana(await r.json());
      setErro(null);
    } catch (e: any) {
      setErro(`Não foi possível carregar o resumo da semana (${e.message}).`);
    }
  }, [inicio, orgId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!orgId) return;
    getDocs(query(collection(db, 'contracts'), where('orgId', '==', orgId)))
      .then((s) => setContratos(s.docs.map((d) => {
        const c = d.data() as any;
        return { id: d.id, nome: c.name || c.title || c.contractNumber || d.id };
      }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
      .catch(() => setContratos([]));
  }, [orgId]);

  const acao = async (path: string, pergunta?: string) => {
    if (!semana || (pergunta && !window.confirm(pergunta))) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/reembolsos/semana/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inicio: semana.inicio, ...(orgId ? { orgId } : {}) }),
      });
      if (!r.ok) throw new Error(r.status === 403 ? 'sem permissão' : `HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      setErro(`Falha: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const definirObra = async (notaId: string, contractId: string) => {
    const c = contratos.find((x) => x.id === contractId);
    if (!c) return;
    const r = await apiFetch(`/api/reembolsos/${notaId}/obra`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: c.id, obraName: c.nome, ...(orgId ? { orgId } : {}) }),
    });
    if (r.ok) load(); else setErro(`Falha ao definir obra (HTTP ${r.status}).`);
  };

  const verNota = async (id: string) => {
    const r = await apiFetch(`/api/reembolsos/${id}/imagem`);
    if (!r.ok) { setErro('Imagem da nota não encontrada.'); return; }
    setImagem(URL.createObjectURL(await r.blob()));
  };
  const fecharImagem = () => { if (imagem) URL.revokeObjectURL(imagem); setImagem(null); };

  const temAprovado = semana?.funcionarios.some((f) => f.notas.some((n) => n.status === 'aprovado'));
  const btn = 'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border disabled:opacity-50';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Reembolsos da semana</h3>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={!semana} onClick={() => semana && setInicio(shift(semana.inicio, -7))} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" aria-label="Semana anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-slate-200 px-2">{semana ? `${br(semana.inicio)} a ${br(semana.fim)}` : '...'}</span>
          <button type="button" disabled={!semana} onClick={() => semana && setInicio(shift(semana.inicio, 7))} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" aria-label="Próxima semana">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {erro && <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300">{erro}</div>}

      {semana && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
              <div className="text-slate-400">Aprovado</div>
              <div className="text-emerald-300 font-bold text-sm">{brl(semana.totais.totalAprovado)}</div>
            </div>
            <div className="p-2 rounded-xl bg-amber-950/30 border border-amber-800/40">
              <div className="text-slate-400">Pendente ({semana.totais.pendentes})</div>
              <div className="text-amber-300 font-bold text-sm">{brl(semana.totais.totalPendente)}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700">
              <div className="text-slate-400">Notas</div>
              <div className="text-slate-100 font-bold text-sm">{semana.totais.notas}</div>
            </div>
          </div>

          {(semana.avisos.obraADefinir > 0 || semana.avisos.funcionarioAIdentificar > 0) && (
            <div className="flex flex-wrap gap-2 text-amber-300">
              {semana.avisos.obraADefinir > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{semana.avisos.obraADefinir} nota(s) com obra a definir</span>}
              {semana.avisos.funcionarioAIdentificar > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{semana.avisos.funcionarioAIdentificar} nota(s) com funcionário a identificar</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <button type="button" disabled={busy || !semana.totais.pendentes} onClick={() => acao('aprovar')} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar pendentes da semana
                </button>
                <button type="button" disabled={busy || !temAprovado} onClick={() => acao('reembolsado', `Marcar como reembolsadas todas as notas aprovadas de ${br(semana.inicio)} a ${br(semana.fim)}?`)} className={`${btn} bg-slate-800 hover:bg-slate-700 text-cyan-300 border-slate-700`}>
                  <Wallet className="w-3.5 h-3.5" /> Marcar semana como reembolsada
                </button>
              </>
            )}
            <button type="button" onClick={() => downloadApi(`/api/reembolsos/semana.xlsx?${qs(semana.inicio)}`, `reembolsos_${semana.inicio}.xlsx`).catch((e) => setErro(`Falha no Excel: ${e.message}`))} className={`${btn} bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700`}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
          </div>

          {semana.funcionarios.length === 0 && <div className="text-slate-500 py-2">Nenhuma nota recebida nesta semana.</div>}

          <div className="space-y-2">
            {semana.funcionarios.map((f) => {
              const key = f.workerId || f.nome;
              const isOpen = aberto === key;
              return (
                <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/40">
                  <button type="button" onClick={() => setAberto(isOpen ? null : key)} className="w-full p-3 flex items-center justify-between gap-2 text-left">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">{f.nome}{!f.workerId && <span className="ml-2 text-amber-400 font-normal">(a identificar)</span>}</div>
                      <div className="text-slate-400 truncate">{Object.entries(f.porObra).map(([o, v]) => `${o}: ${brl(v)}`).join(' • ')}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-emerald-300 font-bold">{brl(f.totalAprovado)}</div>
                      {f.pendentes > 0 && <div className="text-amber-300">{f.pendentes} pendente(s) · {brl(f.totalPendente)}</div>}
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(f.porCategoria).map(([c, v]) => (
                          <span key={c} className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{c.replace('_', ' ')}: {brl(v)}</span>
                        ))}
                      </div>
                      {f.notas.map((n) => (
                        <div key={n.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                          <div className="min-w-0">
                            <div className="text-slate-200 truncate">{n.establishmentName || 'Sem estabelecimento'} · <span className="font-bold">{brl(n.totalAmount)}</span></div>
                            <div className="text-slate-500">{n.receiptDate} · {n.category} · {n.status}{n.obraName && <> · <MapPin className="inline w-3 h-3" /> {n.obraName}</>}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {n.obraStatus === 'a_definir' && canManage && (
                              <select defaultValue="" onChange={(e) => definirObra(n.id, e.target.value)} className="px-2 py-1 rounded-lg bg-slate-950 border border-amber-700 text-amber-200 max-w-[12rem]" aria-label="Definir obra">
                                <option value="" disabled>Obra a definir…</option>
                                {contratos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                              </select>
                            )}
                            {n.imageStatus === 'salva' && (
                              <button type="button" onClick={() => verNota(n.id)} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" /> ver nota
                              </button>
                            )}
                            {n.imageStatus === 'grande_demais' && <span className="text-slate-500">imagem grande demais</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {imagem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={fecharImagem}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={fecharImagem} className="absolute -top-3 -right-3 p-1.5 rounded-full bg-slate-800 text-white" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
            <img src={imagem} alt="Nota fiscal" className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};
