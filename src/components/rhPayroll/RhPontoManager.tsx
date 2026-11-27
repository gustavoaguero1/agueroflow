/**
 * RH › Ponto: o dia de hoje, espelho com ajustes, cadastro de quem bate ponto, estabelecimentos (CNPJ e regras),
 * aparelhos pareados e exportação do AFD. Os dados do ponto ficam só no servidor (/api/ponto).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Clock, CalendarDays, Users, Building2, Smartphone, FileDown, AlertTriangle, Loader2, X, RefreshCw } from 'lucide-react';
import type { Unit } from '../../types';
import { TIPO_LABEL, PONTO_DEFAULTS, type PontoConfig, type TipoMarcacao } from '../../ponto/config';
import {
  pontoApi, minutosParaHHmm, ALERTA_LABEL,
  type Estabelecimento, type PessoaPontoView, type Espelho, type PessoaDia, type Aparelho, type LinhaMarcacao,
} from '../../services/pontoApi';

type Aba = 'hoje' | 'espelho' | 'pessoas' | 'estabelecimentos' | 'aparelhos' | 'afd';
const ABAS: { id: Aba; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'hoje', label: 'Hoje', icon: Clock },
  { id: 'espelho', label: 'Espelho', icon: CalendarDays },
  { id: 'pessoas', label: 'Pessoas', icon: Users },
  { id: 'estabelecimentos', label: 'Estabelecimentos', icon: Building2 },
  { id: 'aparelhos', label: 'Aparelhos', icon: Smartphone },
  { id: 'afd', label: 'AFD', icon: FileDown },
];

const card = 'bg-[#121826] border border-slate-800 rounded-xl p-5';
const input = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500';
const label = 'text-[11px] font-semibold text-slate-300 block mb-1';
const btn = 'px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 disabled:opacity-50';
const btnPri = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white disabled:opacity-50';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const inicioMes = () => `${hojeISO().slice(0, 8)}01`;
const hora = (iso: string) => iso.slice(11, 16);
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const Alertas: React.FC<{ a: string[] }> = ({ a }) => (a.length ? (
  <span className="inline-flex flex-wrap gap-1">{a.map((x) => (
    <span key={x} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">{ALERTA_LABEL[x as keyof typeof ALERTA_LABEL] ?? x}</span>
  ))}</span>
) : null);

const Marc: React.FC<{ m: LinhaMarcacao }> = ({ m }) => (
  <span title={`${TIPO_LABEL[m.tipo]}${m.origem === 'ajuste' ? ` · ajuste: ${m.justificativa ?? ''}` : ''}`}
    className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${m.desconsiderada ? 'line-through text-slate-500 bg-slate-800' : m.origem === 'ajuste' ? 'bg-blue-500/15 text-blue-300' : 'bg-slate-800 text-slate-100'}`}>
    {hora(m.dataHora)}
  </span>
);

export const RhPontoManager: React.FC<{ orgId: string; units: Unit[]; canEdit: boolean; canPairTotem: boolean }> = ({ orgId, units, canEdit, canPairTotem }) => {
  const [aba, setAba] = useState<Aba>('hoje');
  const [estabs, setEstabs] = useState<Estabelecimento[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaPontoView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarBase = useCallback(async () => {
    setErro(null);
    try {
      const [e, p] = await Promise.all([pontoApi.estabelecimentos(orgId), pontoApi.pessoas(orgId)]);
      setEstabs(e); setPessoas(p);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar o ponto.'); }
  }, [orgId]);
  useEffect(() => { carregarBase(); }, [carregarBase]);

  const semEstab = estabs !== null && estabs.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 w-fit" role="tablist" aria-label="Ponto">
        {ABAS.map((t) => (
          <button key={t.id} role="tab" aria-selected={aba === t.id} onClick={() => setAba(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 ${aba === t.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      {erro && <p className="text-xs text-rose-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {erro}</p>}
      {semEstab && aba !== 'estabelecimentos' && (
        <div className={`${card} text-xs text-slate-300`}>
          Cadastre um estabelecimento para começar. É a empresa (CNPJ) em que o ponto é registrado.{' '}
          <button className="text-blue-400 underline" onClick={() => setAba('estabelecimentos')}>Cadastrar agora</button>
        </div>
      )}
      {estabs === null || pessoas === null ? (
        !erro && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : (
        <>
          {aba === 'hoje' && <Hoje orgId={orgId} />}
          {aba === 'espelho' && <EspelhoView orgId={orgId} pessoas={pessoas} canEdit={canEdit} />}
          {aba === 'pessoas' && <Pessoas orgId={orgId} pessoas={pessoas} estabs={estabs} units={units} canEdit={canEdit} onChange={carregarBase} />}
          {aba === 'estabelecimentos' && <Estabs orgId={orgId} estabs={estabs} canEdit={canEdit} onChange={carregarBase} />}
          {aba === 'aparelhos' && <Aparelhos orgId={orgId} pessoas={pessoas} units={units} canEdit={canEdit} canPairTotem={canPairTotem} />}
          {aba === 'afd' && <Afd orgId={orgId} estabs={estabs} />}
        </>
      )}
    </div>
  );
};

// ── Hoje ──
const Hoje: React.FC<{ orgId: string }> = ({ orgId }) => {
  const [data, setData] = useState(hojeISO());
  const [lista, setLista] = useState<PessoaDia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLista(null); setErro(null);
    try { setLista((await pontoApi.dia(orgId, data)).pessoas); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setLista([]); }
  }, [orgId, data]);
  useEffect(() => { load(); }, [load]);
  const semMarcacao = lista?.filter((p) => p.marcacoes.length === 0).length ?? 0;
  const comAlerta = lista?.filter((p) => p.alertas.length).length ?? 0;
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex items-end gap-2">
          <label><span className={label}>Dia</span><input type="date" className={input} value={data} onChange={(e) => setData(e.target.value)} /></label>
          <button className={btn} onClick={load} aria-label="Atualizar"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {lista && <p className="text-xs text-slate-400">{lista.length} pessoas · {semMarcacao} sem marcação · {comAlerta} com alerta</p>}
      </div>
      {erro && <p className="text-xs text-rose-300">{erro}</p>}
      {lista === null ? <p className="text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</p>
        : lista.length === 0 ? <p className="text-xs text-slate-400">Ninguém com ponto ativo. Cadastre CPF e estabelecimento na aba Pessoas.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 text-left"><tr><th className="py-2 pr-3">Pessoa</th><th className="py-2 pr-3">Marcações</th><th className="py-2 pr-3">Próxima</th><th className="py-2 pr-3">Horas</th><th className="py-2">Alertas</th></tr></thead>
                <tbody>{lista.map((p) => (
                  <tr key={p.rhId} className="border-t border-slate-800">
                    <td className="py-2 pr-3 text-slate-100">{p.nome}</td>
                    <td className="py-2 pr-3"><span className="flex flex-wrap gap-1">{p.marcacoes.length ? p.marcacoes.map((m, i) => <Marc key={i} m={m} />) : <span className="text-slate-500">—</span>}</span></td>
                    <td className="py-2 pr-3 text-slate-300">{TIPO_LABEL[p.proxima]}</td>
                    <td className="py-2 pr-3 text-slate-300">{p.incompleto ? <span className="text-amber-300">incompleto</span> : p.marcacoes.length ? minutosParaHHmm(p.horas.hn + p.horas.h50 + p.horas.h100) : '—'}</td>
                    <td className="py-2"><Alertas a={p.alertas} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
    </div>
  );
};

// ── Espelho ──
const EspelhoView: React.FC<{ orgId: string; pessoas: PessoaPontoView[]; canEdit: boolean }> = ({ orgId, pessoas, canEdit }) => {
  const ativos = pessoas.filter((p) => p.cpfMascarado && p.estabelecimentoId);
  const [rhId, setRhId] = useState(ativos[0]?.rhId ?? '');
  const [inicio, setInicio] = useState(inicioMes());
  const [fim, setFim] = useState(hojeISO());
  const [esp, setEsp] = useState<Espelho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<{ data: string; acao: 'incluir' | 'desconsiderar'; tipo: TipoMarcacao; hora: string; nsrRef?: number; justificativa: string } | null>(null);

  const load = useCallback(async () => {
    if (!rhId) return;
    setErro(null);
    try { setEsp(await pontoApi.espelho(orgId, rhId, inicio, fim)); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setEsp(null); }
  }, [orgId, rhId, inicio, fim]);
  useEffect(() => { load(); }, [load]);

  const salvarAjuste = async () => {
    if (!ajuste) return;
    try {
      await pontoApi.ajustar(orgId, ajuste.acao === 'incluir'
        ? { rhId, data: ajuste.data, acao: 'incluir', tipo: ajuste.tipo, dataHora: `${ajuste.data}T${ajuste.hora}:00-03:00`, justificativa: ajuste.justificativa }
        : { rhId, data: ajuste.data, acao: 'desconsiderar', nsrRef: ajuste.nsrRef, justificativa: ajuste.justificativa });
      setAjuste(null); load();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
  };

  if (!ativos.length) return <div className={`${card} text-xs text-slate-400`}>Ninguém com ponto ativo ainda. Cadastre CPF e estabelecimento na aba Pessoas.</div>;
  return (
    <div className={`${card} space-y-3`}>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="sm:col-span-2"><span className={label}>Pessoa</span>
          <select className={input} value={rhId} onChange={(e) => setRhId(e.target.value)}>{ativos.map((p) => <option key={p.rhId} value={p.rhId}>{p.nome}</option>)}</select></label>
        <label><span className={label}>De</span><input type="date" className={input} value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
        <label><span className={label}>Até</span><input type="date" className={input} value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      </div>
      {erro && <p className="text-xs text-rose-300">{erro}</p>}
      {esp && (
        <>
          <p className="text-xs text-slate-300">
            Normais <b className="text-white">{minutosParaHHmm(esp.totais.hn)}</b> · Extra 50% <b className="text-white">{minutosParaHHmm(esp.totais.h50)}</b> · Extra 100% <b className="text-white">{minutosParaHHmm(esp.totais.h100)}</b>
            {esp.totais.diasIncompletos ? <span className="text-amber-300"> · {esp.totais.diasIncompletos} dia(s) incompleto(s)</span> : null}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left"><tr><th className="py-2 pr-3">Dia</th><th className="py-2 pr-3">Marcações</th><th className="py-2 pr-3">Normais</th><th className="py-2 pr-3">50%</th><th className="py-2 pr-3">100%</th><th className="py-2 pr-3">Alertas</th>{canEdit && <th className="py-2" />}</tr></thead>
              <tbody>{esp.dias.map((d) => (
                <tr key={d.data} className="border-t border-slate-800 align-top">
                  <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">{dataBR(d.data)} <span className="text-slate-500">{DIAS[new Date(`${d.data}T12:00:00Z`).getUTCDay()]}</span></td>
                  <td className="py-2 pr-3"><span className="flex flex-wrap gap-1">{d.marcacoes.length ? d.marcacoes.map((m, i) => (
                    canEdit && m.origem === 'ponto' && !m.desconsiderada
                      ? <button key={i} title="Desconsiderar esta marcação" onClick={() => setAjuste({ data: d.data, acao: 'desconsiderar', tipo: m.tipo, hora: hora(m.dataHora), nsrRef: m.nsr, justificativa: '' })}><Marc m={m} /></button>
                      : <Marc key={i} m={m} />)) : <span className="text-slate-500">—</span>}</span></td>
                  <td className="py-2 pr-3">{d.horas.incompleto ? <span className="text-amber-300">incompleto</span> : minutosParaHHmm(d.horas.hn)}</td>
                  <td className="py-2 pr-3">{minutosParaHHmm(d.horas.h50)}</td>
                  <td className="py-2 pr-3">{minutosParaHHmm(d.horas.h100)}</td>
                  <td className="py-2 pr-3"><Alertas a={[...new Set(d.marcacoes.flatMap((m) => m.alertas))]} /></td>
                  {canEdit && <td className="py-2"><button className="text-blue-400 hover:text-blue-300" onClick={() => setAjuste({ data: d.data, acao: 'incluir', tipo: 'entrada', hora: '07:00', justificativa: '' })}>Incluir</button></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      {ajuste && (
        <Modal title={ajuste.acao === 'incluir' ? `Incluir marcação em ${dataBR(ajuste.data)}` : `Desconsiderar ${ajuste.hora} de ${dataBR(ajuste.data)}`} onClose={() => setAjuste(null)}>
          {ajuste.acao === 'incluir' && (
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>Tipo</span><select className={input} value={ajuste.tipo} onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value as TipoMarcacao })}>
                {(Object.keys(TIPO_LABEL) as TipoMarcacao[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select></label>
              <label><span className={label}>Horário</span><input type="time" className={input} value={ajuste.hora} onChange={(e) => setAjuste({ ...ajuste, hora: e.target.value })} /></label>
            </div>
          )}
          <label className="block"><span className={label}>Justificativa (fica registrada)</span>
            <textarea className={input} rows={3} value={ajuste.justificativa} onChange={(e) => setAjuste({ ...ajuste, justificativa: e.target.value })} placeholder="Ex.: esqueceu de bater a saída; confirmado pelo encarregado" /></label>
          <p className="text-[11px] text-slate-500">A marcação original nunca é apagada. O ajuste aparece separado no espelho.</p>
          <div className="flex justify-end gap-2"><button className={btn} onClick={() => setAjuste(null)}>Cancelar</button><button className={btnPri} disabled={ajuste.justificativa.trim().length < 5} onClick={salvarAjuste}>Salvar ajuste</button></div>
        </Modal>
      )}
    </div>
  );
};

// ── Pessoas ──
const Pessoas: React.FC<{ orgId: string; pessoas: PessoaPontoView[]; estabs: Estabelecimento[]; units: Unit[]; canEdit: boolean; onChange: () => void }> = ({ orgId, pessoas, estabs, canEdit, onChange }) => {
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState<PessoaPontoView | null>(null);
  const [form, setForm] = useState({ cpf: '', vinculo: 'CLT', batePonto: true, estabelecimentoId: '', pin: '', marcacoes: '' as '' | '2' | '4', inicio: '', fim: '' });
  const [qr, setQr] = useState<{ nome: string; code: string; expiraEm: string; img: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const lista = useMemo(() => pessoas.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())), [pessoas, busca]);

  const abrir = (p: PessoaPontoView) => {
    setMsg(null); setEdit(p);
    setForm({ cpf: '', vinculo: p.vinculo ?? 'CLT', batePonto: p.batePonto, estabelecimentoId: p.estabelecimentoId ?? (estabs.length === 1 ? estabs[0].id : ''), pin: '',
      marcacoes: p.config?.marcacoesPorDia ? (String(p.config.marcacoesPorDia) as '2' | '4') : '', inicio: p.config?.inicio ?? '', fim: p.config?.fim ?? '' });
  };
  const salvar = async () => {
    if (!edit) return;
    try {
      const config: Partial<PontoConfig> = {};
      if (form.marcacoes) config.marcacoesPorDia = Number(form.marcacoes) as 2 | 4;
      if (form.inicio) config.inicio = form.inicio;
      if (form.fim) config.fim = form.fim;
      await pontoApi.salvarPessoa(orgId, edit.rhId, { cpf: form.cpf || undefined, vinculo: form.vinculo, batePonto: form.batePonto, estabelecimentoId: form.estabelecimentoId, pin: form.pin || undefined, config });
      setEdit(null); onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  };
  const parear = async (p: PessoaPontoView) => {
    try {
      const r = await pontoApi.parearPessoal(orgId, p.rhId);
      setQr({ nome: p.nome, code: r.code, expiraEm: r.expiraEm, img: await QRCode.toDataURL(`agueroflow-ponto:${r.code}`, { margin: 1, width: 240 }) });
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  };

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <label className="w-64"><span className={label}>Buscar</span><input className={input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome" /></label>
        <p className="text-xs text-slate-400">{pessoas.filter((p) => p.cpfMascarado && p.estabelecimentoId && p.batePonto).length} de {pessoas.length} prontas para bater ponto</p>
      </div>
      {msg && <p className="text-xs text-rose-300">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left"><tr><th className="py-2 pr-3">Nome</th><th className="py-2 pr-3">CPF</th><th className="py-2 pr-3">Vínculo</th><th className="py-2 pr-3">Bate ponto</th><th className="py-2 pr-3">Celular</th><th className="py-2" /></tr></thead>
          <tbody>{lista.map((p) => (
            <tr key={p.rhId} className="border-t border-slate-800">
              <td className="py-2 pr-3 text-slate-100">{p.nome}</td>
              <td className="py-2 pr-3 font-mono text-slate-300">{p.cpfMascarado ?? <span className="text-amber-300">falta</span>}</td>
              <td className="py-2 pr-3 text-slate-300">{p.vinculo ?? '—'}</td>
              <td className="py-2 pr-3">{p.batePonto ? 'Sim' : <span className="text-slate-500">Não</span>}</td>
              <td className="py-2 pr-3 text-slate-300">{p.aparelho ? p.aparelho.nome : '—'}</td>
              <td className="py-2 text-right whitespace-nowrap space-x-3">
                {canEdit && <button className="text-blue-400 hover:text-blue-300" onClick={() => abrir(p)}>Editar</button>}
                {canEdit && p.cpfMascarado && p.estabelecimentoId && p.batePonto && <button className="text-blue-400 hover:text-blue-300" onClick={() => parear(p)}>Parear celular</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {edit && (
        <Modal title={`Ponto de ${edit.nome}`} onClose={() => setEdit(null)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2"><span className={label}>CPF {edit.cpfMascarado ? `(atual ${edit.cpfMascarado}; deixe vazio para manter)` : ''}</span><input className={input} inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /></label>
            <label><span className={label}>Vínculo</span><select className={input} value={form.vinculo} onChange={(e) => setForm({ ...form, vinculo: e.target.value })}><option>CLT</option><option>PJ</option></select></label>
            <label className="flex items-center gap-2 text-xs text-slate-200 mt-5"><input type="checkbox" checked={form.batePonto} onChange={(e) => setForm({ ...form, batePonto: e.target.checked })} /> Bate ponto</label>
            <label className="col-span-2"><span className={label}>Estabelecimento</span><select className={input} value={form.estabelecimentoId} onChange={(e) => setForm({ ...form, estabelecimentoId: e.target.value })}>
              <option value="">Escolha</option>{estabs.map((x) => <option key={x.id} value={x.id}>{x.razaoSocial} ({x.cnpj})</option>)}</select></label>
            <label><span className={label}>PIN (4 a 6 números, plano B)</span><input className={input} inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder={edit.temPin ? 'já tem; vazio mantém' : ''} /></label>
            <label><span className={label}>Marcações por dia</span><select className={input} value={form.marcacoes} onChange={(e) => setForm({ ...form, marcacoes: e.target.value as '' | '2' | '4' })}><option value="">Padrão do estabelecimento</option><option value="4">4 (com almoço)</option><option value="2">2 (almoço pré-anotado)</option></select></label>
            <label><span className={label}>Entrada própria</span><input type="time" className={input} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></label>
            <label><span className={label}>Saída própria</span><input type="time" className={input} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></label>
          </div>
          {msg && <p className="text-xs text-rose-300">{msg}</p>}
          <div className="flex justify-end gap-2"><button className={btn} onClick={() => setEdit(null)}>Cancelar</button><button className={btnPri} onClick={salvar}>Salvar</button></div>
        </Modal>
      )}
      {qr && (
        <Modal title={`Parear o celular de ${qr.nome}`} onClose={() => setQr(null)}>
          <div className="text-center space-y-2">
            <img src={qr.img} alt={`QR de pareamento, código ${qr.code}`} className="mx-auto rounded-lg bg-white p-2" />
            <p className="text-2xl font-mono tracking-[0.3em] text-white">{qr.code}</p>
            <p className="text-xs text-slate-400">No app, toque em "Parear" e leia o QR ou digite o código. Vale até {new Date(qr.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}, uma vez só.</p>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Estabelecimentos ──
const Estabs: React.FC<{ orgId: string; estabs: Estabelecimento[]; canEdit: boolean; onChange: () => void }> = ({ orgId, estabs, canEdit, onChange }) => {
  const vazio = { id: '', cnpj: '', razaoSocial: '', endereco: '', inicio: PONTO_DEFAULTS.inicio, fim: PONTO_DEFAULTS.fim, almocoMin: String(PONTO_DEFAULTS.almocoMin), dias: PONTO_DEFAULTS.dias, marcacoesPorDia: String(PONTO_DEFAULTS.marcacoesPorDia), raioM: String(PONTO_DEFAULTS.raioM), toleranciaMin: String(PONTO_DEFAULTS.toleranciaMin), feriados: '' };
  const [form, setForm] = useState<typeof vazio | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const abrir = (e?: Estabelecimento) => {
    setMsg(null);
    if (!e) { setForm({ ...vazio, id: `estab_${Date.now()}` }); return; }
    const c = { ...PONTO_DEFAULTS, ...(e.config ?? {}) };
    setForm({ id: e.id, cnpj: e.cnpj, razaoSocial: e.razaoSocial, endereco: e.endereco ?? '', inicio: c.inicio, fim: c.fim, almocoMin: String(c.almocoMin), dias: c.dias, marcacoesPorDia: String(c.marcacoesPorDia), raioM: String(c.raioM), toleranciaMin: String(c.toleranciaMin), feriados: c.feriados.join(', ') });
  };
  const salvar = async () => {
    if (!form) return;
    try {
      await pontoApi.salvarEstabelecimento(orgId, form.id, {
        cnpj: form.cnpj, razaoSocial: form.razaoSocial, endereco: form.endereco,
        config: { inicio: form.inicio, fim: form.fim, almocoMin: Number(form.almocoMin), dias: form.dias, marcacoesPorDia: Number(form.marcacoesPorDia) as 2 | 4, raioM: Number(form.raioM), toleranciaMin: Number(form.toleranciaMin), feriados: form.feriados.split(/[\s,;]+/).filter(Boolean) },
      });
      setForm(null); onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  };
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">Cada CNPJ tem sua própria numeração de marcações e seu próprio AFD.</p>
        {canEdit && <button className={btnPri} onClick={() => abrir()}>Novo estabelecimento</button>}
      </div>
      {estabs.length === 0 ? <p className="text-xs text-slate-400">Nenhum estabelecimento ainda.</p> : (
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left"><tr><th className="py-2 pr-3">Razão social</th><th className="py-2 pr-3">CNPJ</th><th className="py-2 pr-3">Jornada</th><th className="py-2" /></tr></thead>
          <tbody>{estabs.map((e) => { const c = { ...PONTO_DEFAULTS, ...(e.config ?? {}) }; return (
            <tr key={e.id} className="border-t border-slate-800">
              <td className="py-2 pr-3 text-slate-100">{e.razaoSocial}</td>
              <td className="py-2 pr-3 font-mono text-slate-300">{e.cnpj}</td>
              <td className="py-2 pr-3 text-slate-300">{c.inicio}–{c.fim}, almoço {c.almocoMin} min, {c.dias.map((d) => DIAS[d]).join(' ')}, {c.marcacoesPorDia} marcações, raio {c.raioM} m</td>
              <td className="py-2 text-right">{canEdit && <button className="text-blue-400 hover:text-blue-300" onClick={() => abrir(e)}>Editar</button>}</td>
            </tr>); })}</tbody>
        </table>
      )}
      {form && (
        <Modal title="Estabelecimento" onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2"><span className={label}>Razão social</span><input className={input} value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></label>
            <label><span className={label}>CNPJ</span><input className={input} inputMode="numeric" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></label>
            <label><span className={label}>Endereço</span><input className={input} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></label>
            <label><span className={label}>Entrada</span><input type="time" className={input} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></label>
            <label><span className={label}>Saída</span><input type="time" className={input} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></label>
            <label><span className={label}>Almoço (min)</span><input className={input} inputMode="numeric" value={form.almocoMin} onChange={(e) => setForm({ ...form, almocoMin: e.target.value })} /></label>
            <label><span className={label}>Marcações por dia</span><select className={input} value={form.marcacoesPorDia} onChange={(e) => setForm({ ...form, marcacoesPorDia: e.target.value })}><option value="4">4 (com almoço)</option><option value="2">2 (almoço pré-anotado)</option></select></label>
            <label><span className={label}>Raio da obra (m)</span><input className={input} inputMode="numeric" value={form.raioM} onChange={(e) => setForm({ ...form, raioM: e.target.value })} /></label>
            <label><span className={label}>Tolerância por dia (min)</span><input className={input} inputMode="numeric" value={form.toleranciaMin} onChange={(e) => setForm({ ...form, toleranciaMin: e.target.value })} /></label>
            <fieldset className="col-span-2"><legend className={label}>Dias de trabalho</legend>
              <div className="flex flex-wrap gap-2">{DIAS.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-xs text-slate-200"><input type="checkbox" checked={form.dias.includes(i)} onChange={(e) => setForm({ ...form, dias: e.target.checked ? [...form.dias, i].sort() : form.dias.filter((x) => x !== i) })} />{d}</label>
              ))}</div></fieldset>
            <label className="col-span-2"><span className={label}>Feriados (AAAA-MM-DD, separados por vírgula)</span><input className={input} value={form.feriados} onChange={(e) => setForm({ ...form, feriados: e.target.value })} placeholder="2026-12-25, 2027-01-01" /></label>
          </div>
          {msg && <p className="text-xs text-rose-300">{msg}</p>}
          <div className="flex justify-end gap-2"><button className={btn} onClick={() => setForm(null)}>Cancelar</button><button className={btnPri} onClick={salvar}>Salvar</button></div>
        </Modal>
      )}
    </div>
  );
};

// ── Aparelhos ──
const Aparelhos: React.FC<{ orgId: string; pessoas: PessoaPontoView[]; units: Unit[]; canEdit: boolean; canPairTotem: boolean }> = ({ orgId, pessoas, units, canEdit, canPairTotem }) => {
  const [lista, setLista] = useState<Aparelho[] | null>(null);
  const [unitId, setUnitId] = useState('');
  const [qr, setQr] = useState<{ code: string; expiraEm: string; img: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { try { setLista(await pontoApi.aparelhos(orgId)); } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); setLista([]); } }, [orgId]);
  useEffect(() => { load(); }, [load]);
  const nomePessoa = (id?: string) => pessoas.find((p) => p.rhId === id)?.nome ?? id ?? '—';
  const nomeObra = (id?: string) => units.find((u) => u.id === id)?.name ?? id ?? '—';
  const totem = async () => {
    try {
      const r = await pontoApi.parearTotem(orgId, unitId);
      setQr({ ...r, img: await QRCode.toDataURL(`agueroflow-ponto:${r.code}`, { margin: 1, width: 240 }) });
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); }
  };
  return (
    <div className={`${card} space-y-3`}>
      {canPairTotem && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="w-72"><span className={label}>Parear tablet de obra (totem)</span>
            <select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Escolha a obra</option>{units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.name}{u.geo ? '' : ' (sem local)'}</option>)}</select></label>
          <button className={btnPri} disabled={!unitId} onClick={totem}>Gerar código</button>
        </div>
      )}
      {msg && <p className="text-xs text-rose-300">{msg}</p>}
      {lista === null ? <p className="text-xs text-slate-400">Carregando…</p> : lista.length === 0 ? <p className="text-xs text-slate-400">Nenhum aparelho pareado. Pareie celulares na aba Pessoas.</p> : (
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left"><tr><th className="py-2 pr-3">Aparelho</th><th className="py-2 pr-3">Tipo</th><th className="py-2 pr-3">De quem / obra</th><th className="py-2 pr-3">Desde</th><th className="py-2" /></tr></thead>
          <tbody>{lista.map((d) => (
            <tr key={d.id} className={`border-t border-slate-800 ${d.revogadoEm ? 'opacity-50' : ''}`}>
              <td className="py-2 pr-3 text-slate-100">{d.nome}</td>
              <td className="py-2 pr-3">{d.modo === 'totem' ? 'Totem' : 'Celular'}</td>
              <td className="py-2 pr-3">{d.modo === 'totem' ? nomeObra(d.unitId) : nomePessoa(d.rhId)}</td>
              <td className="py-2 pr-3">{dataBR(d.criadoEm)}{d.revogadoEm ? ` · desativado ${dataBR(d.revogadoEm)}` : ''}</td>
              <td className="py-2 text-right">{canEdit && !d.revogadoEm && <button className="text-rose-300 hover:text-rose-200" onClick={async () => { await pontoApi.revogarAparelho(orgId, d.id); load(); }}>Desativar</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {qr && (
        <Modal title="Parear totem" onClose={() => { setQr(null); load(); }}>
          <div className="text-center space-y-2">
            <img src={qr.img} alt={`QR de pareamento, código ${qr.code}`} className="mx-auto rounded-lg bg-white p-2" />
            <p className="text-2xl font-mono tracking-[0.3em] text-white">{qr.code}</p>
            <p className="text-xs text-slate-400">No tablet, abra o app em modo totem e leia o QR. Vale 10 minutos, uma vez só.</p>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── AFD ──
const Afd: React.FC<{ orgId: string; estabs: Estabelecimento[] }> = ({ orgId, estabs }) => {
  const [estabId, setEstabId] = useState(estabs[0]?.id ?? '');
  const [inicio, setInicio] = useState(inicioMes());
  const [fim, setFim] = useState(hojeISO());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const baixar = async () => {
    setBusy(true); setMsg(null);
    try { await pontoApi.baixarAfd(orgId, estabId, inicio, fim); } catch (e) { setMsg(e instanceof Error ? e.message : 'Erro'); } finally { setBusy(false); }
  };
  return (
    <div className={`${card} space-y-3`}>
      <p className="text-xs text-slate-400">Arquivo Fonte de Dados (Portaria 671) para entregar à fiscalização. Até 31 dias por arquivo (exporte mês a mês).</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="sm:col-span-2"><span className={label}>Estabelecimento</span><select className={input} value={estabId} onChange={(e) => setEstabId(e.target.value)}>{estabs.map((x) => <option key={x.id} value={x.id}>{x.razaoSocial} ({x.cnpj})</option>)}</select></label>
        <label><span className={label}>De</span><input type="date" className={input} value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
        <label><span className={label}>Até</span><input type="date" className={input} value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      </div>
      <button className={btnPri} disabled={!estabId || busy} onClick={baixar}>{busy ? 'Gerando…' : 'Baixar AFD'}</button>
      {msg && <p className="text-xs text-rose-300">{msg}</p>}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="bg-[#121826] border border-slate-700 rounded-xl p-5 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white">{title}</h3><button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div>
      {children}
    </div>
  </div>
);
