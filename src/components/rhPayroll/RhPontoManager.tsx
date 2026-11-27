/**
 * RH › Ponto: o dia de hoje, espelho com ajustes e conferência de selfie, cadastro de pessoas e rosto (LGPD),
 * estabelecimentos (CNPJ e regras), aparelhos pareados (QR com URL direta /ponto?pair=...) e exportação do AFD.
 * Os dados do ponto ficam só no servidor (/api/ponto).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Clock,
  CalendarDays,
  Users,
  Building2,
  Smartphone,
  FileDown,
  AlertTriangle,
  Loader2,
  X,
  RefreshCw,
  Camera,
  ScanFace,
  Copy,
  Check,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { Unit } from '../../types';
import { TIPO_LABEL, PONTO_DEFAULTS, type PontoConfig, type TipoMarcacao } from '../../ponto/config';
import {
  pontoApi,
  minutosParaHHmm,
  ALERTA_LABEL,
  type Estabelecimento,
  type PessoaPontoView,
  type Espelho,
  type PessoaDia,
  type Aparelho,
  type LinhaMarcacao,
  type MarcacaoFotoDetalhe,
} from '../../services/pontoApi';
import { FaceEnrollModal } from '../ponto/FaceEnrollModal';

type Aba = 'hoje' | 'espelho' | 'pessoas' | 'estabelecimentos' | 'aparelhos' | 'afd';
const ABAS: { id: Aba; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'hoje', label: 'Hoje', icon: Clock },
  { id: 'espelho', label: 'Espelho', icon: CalendarDays },
  { id: 'pessoas', label: 'Pessoas & Rosto', icon: Users },
  { id: 'estabelecimentos', label: 'Estabelecimentos', icon: Building2 },
  { id: 'aparelhos', label: 'Aparelhos & Totens', icon: Smartphone },
  { id: 'afd', label: 'AFD', icon: FileDown },
];

const card = 'af-card rounded-2xl p-5';
const input = 'w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500';
const label = 'text-[11px] font-semibold text-slate-300 block mb-1';
const btn = 'px-3 py-2 rounded-xl af-btn-glass text-xs font-medium disabled:opacity-50 cursor-pointer';
const btnPri = 'px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold disabled:opacity-50 cursor-pointer apple-solid-btn';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const hojeISO = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const inicioMes = () => `${hojeISO().slice(0, 8)}01`;
const hora = (iso: string) => iso.slice(11, 16);
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const PUBLIC_BASE_STORAGE_KEY = 'agueroflow_ponto_public_base_url';

function getInitialPublicBase(serverPublicBase?: string | null): string {
  if (serverPublicBase) return serverPublicBase.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(PUBLIC_BASE_STORAGE_KEY)?.trim().replace(/\/+$/, '');
    if (saved && /^https?:\/\//i.test(saved)) return saved;
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

function isPrivatePreviewHost(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname;
    return host === 'localhost' || host === '127.0.0.1' || /^ais-dev-/i.test(host);
  } catch {
    return false;
  }
}

function buildPairingUrl(code: string, baseUrl?: string | null): string {
  const base = (baseUrl || getInitialPublicBase()).replace(/\/+$/, '');
  return `${base}/?ponto=1&pair=${encodeURIComponent(code)}`;
}

const Alertas: React.FC<{ a: string[] }> = ({ a }) =>
  a.length ? (
    <span className="inline-flex flex-wrap gap-1">
      {a.map((x) => (
        <span key={x} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">
          {ALERTA_LABEL[x as keyof typeof ALERTA_LABEL] ?? x}
        </span>
      ))}
    </span>
  ) : null;

const Marc: React.FC<{ m: LinhaMarcacao }> = ({ m }) => (
  <span
    title={`${TIPO_LABEL[m.tipo]}${m.origem === 'ajuste' ? ` · ajuste: ${m.justificativa ?? ''}` : ''}${m.temFoto ? ' · clique para ver selfie e detalhes' : ''}`}
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[11px] ${
      m.desconsiderada
        ? 'line-through text-slate-500 bg-slate-800'
        : m.origem === 'ajuste'
        ? 'bg-blue-500/15 text-blue-300'
        : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
    }`}
  >
    {hora(m.dataHora)}
    {m.temFoto && <Camera className="w-3 h-3 text-cyan-400" />}
  </span>
);

export const RhPontoManager: React.FC<{ orgId: string; units: Unit[]; canEdit: boolean; canPairTotem: boolean }> = ({
  orgId,
  units,
  canEdit,
  canPairTotem,
}) => {
  const [aba, setAba] = useState<Aba>('hoje');
  const [estabs, setEstabs] = useState<Estabelecimento[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaPontoView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarBase = useCallback(async () => {
    setErro(null);
    try {
      const [e, p] = await Promise.all([pontoApi.estabelecimentos(orgId), pontoApi.pessoas(orgId)]);
      setEstabs(e);
      setPessoas(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o ponto.');
    }
  }, [orgId]);
  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  const semEstab = estabs !== null && estabs.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="af-seg rounded-xl p-1 flex items-center gap-1 overflow-x-auto custom-scrollbar"
          role="tablist"
          aria-label="Ponto"
        >
          {ABAS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={aba === t.id}
              onClick={() => setAba(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                aba === t.id ? 'af-seg-btn-active font-semibold' : 'af-seg-btn font-medium'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <a
          href="/?ponto=1"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl af-btn-glass text-xs font-medium"
          title="Abrir a tela do Coletor de Ponto (PWA para celular e totem)"
        >
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>Abrir Coletor de Ponto</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </a>
      </div>

      {erro && (
        <p className="text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {erro}
        </p>
      )}
      {semEstab && aba !== 'estabelecimentos' && (
        <div className={`${card} text-xs text-slate-300`}>
          Cadastre um estabelecimento para começar. É a empresa (CNPJ) em que o ponto é registrado.{' '}
          <button className="text-blue-400 underline cursor-pointer" onClick={() => setAba('estabelecimentos')}>
            Cadastrar agora
          </button>
        </div>
      )}
      {estabs === null || pessoas === null ? (
        !erro && (
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </p>
        )
      ) : (
        <>
          {aba === 'hoje' && <Hoje orgId={orgId} />}
          {aba === 'espelho' && <EspelhoView orgId={orgId} pessoas={pessoas} canEdit={canEdit} />}
          {aba === 'pessoas' && (
            <Pessoas
              orgId={orgId}
              pessoas={pessoas}
              estabs={estabs}
              units={units}
              canEdit={canEdit}
              onChange={carregarBase}
            />
          )}
          {aba === 'estabelecimentos' && (
            <Estabs orgId={orgId} estabs={estabs} canEdit={canEdit} onChange={carregarBase} />
          )}
          {aba === 'aparelhos' && (
            <Aparelhos
              orgId={orgId}
              pessoas={pessoas}
              units={units}
              canEdit={canEdit}
              canPairTotem={canPairTotem}
            />
          )}
          {aba === 'afd' && <Afd orgId={orgId} estabs={estabs} />}
        </>
      )}
    </div>
  );
};

// ── Modal de Conferência da Marcação (Selfie + GPS + Score Facial + NSR) ──
const MarcacaoFotoModal: React.FC<{
  orgId: string;
  marcacaoId: string;
  pessoaNome: string;
  canDesconsiderar?: boolean;
  onDesconsiderar?: (nsr: number, dataISO: string, horaStr: string, tipo: TipoMarcacao) => void;
  onClose: () => void;
}> = ({ orgId, marcacaoId, pessoaNome, canDesconsiderar, onDesconsiderar, onClose }) => {
  const [detalhe, setDetalhe] = useState<MarcacaoFotoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    pontoApi
      .fotoMarcacao(orgId, marcacaoId)
      .then((d) => {
        if (active) setDetalhe(d);
      })
      .catch((e) => {
        if (active) setErro(e instanceof Error ? e.message : 'Erro ao carregar marcação.');
      });
    return () => {
      active = false;
    };
  }, [orgId, marcacaoId]);

  return (
    <Modal title={`Conferência de Marcação · ${pessoaNome}`} onClose={onClose}>
      {erro && <p className="text-xs text-rose-300">{erro}</p>}
      {!detalhe && !erro && (
        <p className="text-xs text-slate-400 flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando evidências da marcação…
        </p>
      )}
      {detalhe && (
        <div className="space-y-3 text-xs">
          {detalhe.fotoDataUrl ? (
            <div className="rounded-xl overflow-hidden border border-slate-700 bg-black flex justify-center">
              <img
                src={detalhe.fotoDataUrl}
                alt={`Selfie da marcação NSR ${detalhe.nsr}`}
                className="max-h-64 object-contain"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-slate-400">
              Sem selfie anexada nesta marcação (registrada via {detalhe.metodo === 'pin' ? 'PIN' : detalhe.metodo}).
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 bg-slate-900/70 rounded-xl p-3 border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 block">Tipo / Horário</span>
              <b className="text-white">
                {TIPO_LABEL[detalhe.tipo]} · {dataBR(detalhe.dataHora)} às {detalhe.dataHora.slice(11, 19)}
              </b>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">NSR / Origem</span>
              <b className="text-white font-mono">
                #{detalhe.nsr} · {detalhe.offline ? 'Offline (sincronizado)' : 'Online'}
              </b>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Reconhecimento</span>
              <b className="text-white">
                {detalhe.metodo === 'rosto' && detalhe.face
                  ? `Facial (${Math.round(detalhe.face.score * 100)}%)${detalhe.face.liveness ? ` · Vida ${Math.round(detalhe.face.liveness * 100)}%` : ''}`
                  : detalhe.metodo === 'pin'
                  ? 'PIN (sem biometria)'
                  : 'Sem biometria'}
              </b>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">Local / GPS</span>
              <b className="text-white inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 text-cyan-400" />
                {detalhe.obraNome
                  ? `${detalhe.obraNome}${detalhe.distM !== null ? ` (${detalhe.distM} m)` : ''}`
                  : detalhe.distM !== null
                  ? `Fora da cerca (${detalhe.distM} m)`
                  : 'Sem GPS'}
              </b>
            </div>
          </div>

          {detalhe.alertas.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 block">Alertas para revisão</span>
              <Alertas a={detalhe.alertas} />
            </div>
          )}

          <div className="text-[10px] text-slate-500 font-mono break-all">
            Hash SHA-256: {detalhe.hash}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {canDesconsiderar && onDesconsiderar && (
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-xs font-semibold cursor-pointer"
                onClick={() => {
                  onDesconsiderar(detalhe.nsr, detalhe.dataHora.slice(0, 10), hora(detalhe.dataHora), detalhe.tipo);
                  onClose();
                }}
              >
                Desconsiderar marcação
              </button>
            )}
            <button type="button" className={btn} onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ── Hoje ──
const Hoje: React.FC<{ orgId: string }> = ({ orgId }) => {
  const [data, setData] = useState(hojeISO());
  const [lista, setLista] = useState<PessoaDia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fotoView, setFotoView] = useState<{ id: string; nome: string } | null>(null);

  const load = useCallback(async () => {
    setLista(null);
    setErro(null);
    try {
      setLista((await pontoApi.dia(orgId, data)).pessoas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
      setLista([]);
    }
  }, [orgId, data]);
  useEffect(() => {
    load();
  }, [load]);

  const semMarcacao = lista?.filter((p) => p.marcacoes.length === 0).length ?? 0;
  const comAlerta = lista?.filter((p) => p.alertas.length).length ?? 0;
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex items-end gap-2">
          <label>
            <span className={label}>Dia</span>
            <input type="date" className={input} value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <button className={btn} onClick={load} aria-label="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {lista && (
          <p className="text-xs text-slate-400">
            {lista.length} pessoas · {semMarcacao} sem marcação · {comAlerta} com alerta
          </p>
        )}
      </div>
      {erro && <p className="text-xs text-rose-300">{erro}</p>}
      {lista === null ? (
        <p className="text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…
        </p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-slate-400">
          Ninguém com ponto ativo. Cadastre CPF e estabelecimento na aba Pessoas & Rosto.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="py-2 pr-3">Pessoa</th>
                <th className="py-2 pr-3">Marcações (clique para ver selfie)</th>
                <th className="py-2 pr-3">Próxima</th>
                <th className="py-2 pr-3">Horas</th>
                <th className="py-2">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.rhId} className="border-t border-slate-800">
                  <td className="py-2 pr-3 text-slate-100">{p.nome}</td>
                  <td className="py-2 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {p.marcacoes.length ? (
                        p.marcacoes.map((m, i) =>
                          m.origem === 'ponto' && m.id ? (
                            <button
                              key={i}
                              type="button"
                              className="cursor-pointer"
                              onClick={() => setFotoView({ id: m.id!, nome: p.nome })}
                            >
                              <Marc m={m} />
                            </button>
                          ) : (
                            <Marc key={i} m={m} />
                          ),
                        )
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{TIPO_LABEL[p.proxima]}</td>
                  <td className="py-2 pr-3 text-slate-300">
                    {p.incompleto ? (
                      <span className="text-amber-300">incompleto</span>
                    ) : p.marcacoes.length ? (
                      minutosParaHHmm(p.horas.hn + p.horas.h50 + p.horas.h100)
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2">
                    <Alertas a={p.alertas} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fotoView && (
        <MarcacaoFotoModal
          orgId={orgId}
          marcacaoId={fotoView.id}
          pessoaNome={fotoView.nome}
          onClose={() => setFotoView(null)}
        />
      )}
    </div>
  );
};

// ── Espelho ──
const EspelhoView: React.FC<{ orgId: string; pessoas: PessoaPontoView[]; canEdit: boolean }> = ({
  orgId,
  pessoas,
  canEdit,
}) => {
  const ativos = pessoas.filter((p) => p.cpfMascarado && p.estabelecimentoId);
  const [rhId, setRhId] = useState(ativos[0]?.rhId ?? '');
  const [inicio, setInicio] = useState(inicioMes());
  const [fim, setFim] = useState(hojeISO());
  const [esp, setEsp] = useState<Espelho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<{ id: string; desconsiderada: boolean } | null>(null);
  const [ajuste, setAjuste] = useState<{
    data: string;
    acao: 'incluir' | 'desconsiderar';
    tipo: TipoMarcacao;
    hora: string;
    nsrRef?: number;
    justificativa: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!rhId) return;
    setErro(null);
    try {
      setEsp(await pontoApi.espelho(orgId, rhId, inicio, fim));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
      setEsp(null);
    }
  }, [orgId, rhId, inicio, fim]);
  useEffect(() => {
    load();
  }, [load]);

  const salvarAjuste = async () => {
    if (!ajuste) return;
    try {
      await pontoApi.ajustar(
        orgId,
        ajuste.acao === 'incluir'
          ? {
              rhId,
              data: ajuste.data,
              acao: 'incluir',
              tipo: ajuste.tipo,
              dataHora: `${ajuste.data}T${ajuste.hora}:00-03:00`,
              justificativa: ajuste.justificativa,
            }
          : { rhId, data: ajuste.data, acao: 'desconsiderar', nsrRef: ajuste.nsrRef, justificativa: ajuste.justificativa },
      );
      setAjuste(null);
      load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  };

  if (!ativos.length) {
    return (
      <div className={`${card} text-xs text-slate-400`}>
        Ninguém com ponto ativo ainda. Cadastre CPF e estabelecimento na aba Pessoas & Rosto.
      </div>
    );
  }
  return (
    <div className={`${card} space-y-3`}>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="sm:col-span-2">
          <span className={label}>Pessoa</span>
          <select className={input} value={rhId} onChange={(e) => setRhId(e.target.value)}>
            {ativos.map((p) => (
              <option key={p.rhId} value={p.rhId}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>De</span>
          <input type="date" className={input} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label>
          <span className={label}>Até</span>
          <input type="date" className={input} value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
      </div>
      {erro && <p className="text-xs text-rose-300">{erro}</p>}
      {esp && (
        <>
          <p className="text-xs text-slate-300">
            Normais <b className="text-white">{minutosParaHHmm(esp.totais.hn)}</b> · Extra 50%{' '}
            <b className="text-white">{minutosParaHHmm(esp.totais.h50)}</b> · Extra 100%{' '}
            <b className="text-white">{minutosParaHHmm(esp.totais.h100)}</b>
            {esp.totais.diasIncompletos ? (
              <span className="text-amber-300"> · {esp.totais.diasIncompletos} dia(s) incompleto(s)</span>
            ) : null}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left">
                <tr>
                  <th className="py-2 pr-3">Dia</th>
                  <th className="py-2 pr-3">Marcações (clique para ver selfie / ajustar)</th>
                  <th className="py-2 pr-3">Normais</th>
                  <th className="py-2 pr-3">50%</th>
                  <th className="py-2 pr-3">100%</th>
                  <th className="py-2 pr-3">Alertas</th>
                  {canEdit && <th className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {esp.dias.map((d) => (
                  <tr key={d.data} className="border-t border-slate-800 align-top">
                    <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                      {dataBR(d.data)}{' '}
                      <span className="text-slate-500">{DIAS[new Date(`${d.data}T12:00:00Z`).getUTCDay()]}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex flex-wrap gap-1">
                        {d.marcacoes.length ? (
                          d.marcacoes.map((m, i) =>
                            m.origem === 'ponto' && m.id ? (
                              <button
                                key={i}
                                type="button"
                                className="cursor-pointer"
                                title="Ver selfie, GPS, score facial ou desconsiderar"
                                onClick={() => setFotoModal({ id: m.id!, desconsiderada: m.desconsiderada })}
                              >
                                <Marc m={m} />
                              </button>
                            ) : (
                              <Marc key={i} m={m} />
                            ),
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {d.horas.incompleto ? <span className="text-amber-300">incompleto</span> : minutosParaHHmm(d.horas.hn)}
                    </td>
                    <td className="py-2 pr-3">{minutosParaHHmm(d.horas.h50)}</td>
                    <td className="py-2 pr-3">{minutosParaHHmm(d.horas.h100)}</td>
                    <td className="py-2 pr-3">
                      <Alertas a={[...new Set(d.marcacoes.flatMap((m) => m.alertas))]} />
                    </td>
                    {canEdit && (
                      <td className="py-2">
                        <button
                          className="text-blue-400 hover:text-blue-300 cursor-pointer"
                          onClick={() =>
                            setAjuste({ data: d.data, acao: 'incluir', tipo: 'entrada', hora: '07:00', justificativa: '' })
                          }
                        >
                          Incluir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {fotoModal && esp && (
        <MarcacaoFotoModal
          orgId={orgId}
          marcacaoId={fotoModal.id}
          pessoaNome={esp.pessoa.nome}
          canDesconsiderar={canEdit && !fotoModal.desconsiderada}
          onDesconsiderar={(nsr, dataISO, horaStr, tipo) =>
            setAjuste({ data: dataISO, acao: 'desconsiderar', tipo, hora: horaStr, nsrRef: nsr, justificativa: '' })
          }
          onClose={() => setFotoModal(null)}
        />
      )}

      {ajuste && (
        <Modal
          title={
            ajuste.acao === 'incluir'
              ? `Incluir marcação em ${dataBR(ajuste.data)}`
              : `Desconsiderar ${ajuste.hora} de ${dataBR(ajuste.data)}`
          }
          onClose={() => setAjuste(null)}
        >
          {ajuste.acao === 'incluir' && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={label}>Tipo</span>
                <select
                  className={input}
                  value={ajuste.tipo}
                  onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value as TipoMarcacao })}
                >
                  {(Object.keys(TIPO_LABEL) as TipoMarcacao[]).map((t) => (
                    <option key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Horário</span>
                <input
                  type="time"
                  className={input}
                  value={ajuste.hora}
                  onChange={(e) => setAjuste({ ...ajuste, hora: e.target.value })}
                />
              </label>
            </div>
          )}
          <label className="block">
            <span className={label}>Justificativa (fica registrada)</span>
            <textarea
              className={input}
              rows={3}
              value={ajuste.justificativa}
              onChange={(e) => setAjuste({ ...ajuste, justificativa: e.target.value })}
              placeholder="Ex.: esqueceu de bater a saída; confirmado pelo encarregado"
            />
          </label>
          <p className="text-[11px] text-slate-500">
            A marcação original nunca é apagada. O ajuste aparece separado no espelho.
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setAjuste(null)}>
              Cancelar
            </button>
            <button className={btnPri} disabled={ajuste.justificativa.trim().length < 5} onClick={salvarAjuste}>
              Salvar ajuste
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Modal de QR de Pareamento Didático (URL real na raiz /?ponto=1&pair=... + passo a passo + copiar link) ──
const PairingQrModal: React.FC<{
  title: string;
  modo: 'pessoal' | 'totem';
  code: string;
  initialBaseUrl: string;
  expiraEm: string;
  onClose: () => void;
}> = ({ title, modo, code, initialBaseUrl, expiraEm, onClose }) => {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [qrImg, setQrImg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => buildPairingUrl(code, baseUrl), [code, baseUrl]);
  const isPrivateHost = useMemo(() => isPrivatePreviewHost(url), [url]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { margin: 1, width: 240 })
      .then((img) => {
        if (active) setQrImg(img);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [url]);

  const handleBaseChange = (val: string) => {
    setBaseUrl(val);
    const cleaned = val.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(cleaned) && !isPrivatePreviewHost(cleaned)) {
      window.localStorage.setItem(PUBLIC_BASE_STORAGE_KEY, cleaned);
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignora
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {isPrivateHost && (
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs space-y-2">
            <p className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Atenção: você está no link de preview privado (só abre neste notebook)</span>
            </p>
            <p className="text-[11px] text-slate-700 dark:text-slate-300">
              Para o celular não dar <b>Page not found</b>, cole abaixo o endereço publicado do AgueroFlow (ex.: <code className="font-mono">https://...run.app</code>) — o QR Code atualiza na hora e fica salvo.
            </p>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => handleBaseChange(e.target.value)}
              placeholder="https://seu-agueroflow.run.app"
              className={input}
            />
          </div>
        )}

        <div className="text-center space-y-2">
          {qrImg ? (
            <img src={qrImg} alt={`QR de pareamento, código ${code}`} className="mx-auto rounded-2xl bg-white p-3 shadow-lg border border-slate-200" />
          ) : (
            <div className="w-60 h-60 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          )}
          <p className="text-2xl font-mono font-bold tracking-[0.28em] text-slate-900 dark:text-white">{code}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 break-all px-2">{url}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Válido uma única vez até{' '}
            <b className="text-slate-800 dark:text-slate-200">
              {new Date(expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </b>
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={copiarLink} className={`${btnPri} inline-flex items-center gap-1.5`}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link copiado!' : 'Copiar link (enviar no WhatsApp)'}</span>
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn} inline-flex items-center gap-1.5`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir link</span>
          </a>
        </div>

        <div className="rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3.5 text-[11px] text-slate-700 dark:text-slate-300 space-y-1.5">
          <p className="font-bold text-blue-600 dark:text-cyan-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Como parear e começar a bater ponto:</span>
          </p>
          {modo === 'pessoal' ? (
            <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-400">
              <li>
                Aponte a <b className="text-slate-900 dark:text-slate-200">câmera normal do celular</b> do funcionário para o QR Code acima (ou envie o link pelo WhatsApp).
              </li>
              <li>
                O navegador abre o <b className="text-slate-900 dark:text-slate-200">AgueroFlow Ponto</b> já com o código preenchido — basta tocar em <b className="text-slate-900 dark:text-slate-200">Confirmar pareamento</b>.
              </li>
              <li>
                Em seguida, o colaborador aceita o termo LGPD e faz o <b className="text-slate-900 dark:text-slate-200">cadastro rápido do rosto</b> (ou o RH pode cadastrar agora mesmo pelo botão <i>Cadastrar rosto</i>).
              </li>
              <li>
                Toque em <b className="text-slate-900 dark:text-slate-200">Instalar / Adicionar à Tela Inicial</b> para bater ponto em 1 toque, mesmo <b className="text-slate-900 dark:text-slate-200">sem internet na obra</b>.
              </li>
            </ol>
          ) : (
            <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-400">
              <li>
                No tablet da obra, aponte a câmera para o QR Code (ou abra o link copiado acima).
              </li>
              <li>
                Toque em <b className="text-slate-900 dark:text-slate-200">Confirmar pareamento</b> — o tablet baixa os vetores faciais criptografados da equipe para operar offline.
              </li>
              <li>
                Adicione à Tela Inicial do tablet. Cada colaborador só toca em <b className="text-slate-900 dark:text-slate-200">Bater Ponto</b> e olha para a câmera (reconhecimento automático 1:N, sem digitar nada).
              </li>
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
};

// ── Pessoas & Cadastro Facial ──
const Pessoas: React.FC<{
  orgId: string;
  pessoas: PessoaPontoView[];
  estabs: Estabelecimento[];
  units: Unit[];
  canEdit: boolean;
  onChange: () => void;
}> = ({ orgId, pessoas, estabs, canEdit, onChange }) => {
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState<PessoaPontoView | null>(null);
  const [enrollPerson, setEnrollPerson] = useState<PessoaPontoView | null>(null);
  const [form, setForm] = useState({
    cpf: '',
    vinculo: 'CLT',
    batePonto: true,
    estabelecimentoId: '',
    pin: '',
    marcacoes: '' as '' | '2' | '4',
    inicio: '',
    fim: '',
  });
  const [qr, setQr] = useState<{ nome: string; code: string; initialBaseUrl: string; expiraEm: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const lista = useMemo(() => pessoas.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())), [pessoas, busca]);

  const abrir = (p: PessoaPontoView) => {
    setMsg(null);
    setEdit(p);
    setForm({
      cpf: '',
      vinculo: p.vinculo ?? 'CLT',
      batePonto: p.batePonto,
      estabelecimentoId: p.estabelecimentoId ?? (estabs.length === 1 ? estabs[0].id : ''),
      pin: '',
      marcacoes: p.config?.marcacoesPorDia ? (String(p.config.marcacoesPorDia) as '2' | '4') : '',
      inicio: p.config?.inicio ?? '',
      fim: p.config?.fim ?? '',
    });
  };
  const salvar = async () => {
    if (!edit) return;
    try {
      const config: Partial<PontoConfig> = {};
      if (form.marcacoes) config.marcacoesPorDia = Number(form.marcacoes) as 2 | 4;
      if (form.inicio) config.inicio = form.inicio;
      if (form.fim) config.fim = form.fim;
      await pontoApi.salvarPessoa(orgId, edit.rhId, {
        cpf: form.cpf || undefined,
        vinculo: form.vinculo,
        batePonto: form.batePonto,
        estabelecimentoId: form.estabelecimentoId,
        pin: form.pin || undefined,
        config,
      });
      setEdit(null);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };
  const parear = async (p: PessoaPontoView) => {
    setMsg(null);
    try {
      const r = await pontoApi.parearPessoal(orgId, p.rhId);
      setQr({
        nome: p.nome,
        code: r.code,
        initialBaseUrl: getInitialPublicBase(r.publicBaseUrl),
        expiraEm: r.expiraEm,
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };

  const removerRosto = async (p: PessoaPontoView) => {
    if (!window.confirm(`Remover o cadastro facial de ${p.nome}? (Revogação LGPD)`)) return;
    try {
      await pontoApi.removerRosto(orgId, p.rhId);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao remover biometria.');
    }
  };

  const prontas = pessoas.filter((p) => p.cpfMascarado && p.estabelecimentoId && p.batePonto).length;
  const comRosto = pessoas.filter((p) => p.temRosto).length;

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <label className="w-64">
          <span className={label}>Buscar</span>
          <input className={input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome" />
        </label>
        <p className="text-xs text-slate-400">
          <b className="text-slate-200">{prontas}</b> de {pessoas.length} prontas ·{' '}
          <b className="text-emerald-300">{comRosto}</b> com rosto cadastrado
        </p>
      </div>
      {msg && <p className="text-xs text-rose-300">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">CPF</th>
              <th className="py-2 pr-3">Vínculo</th>
              <th className="py-2 pr-3">Biometria Facial</th>
              <th className="py-2 pr-3">Celular</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const pronto = Boolean(p.cpfMascarado && p.estabelecimentoId && p.batePonto);
              return (
                <tr key={p.rhId} className="border-t border-slate-800">
                  <td className="py-2 pr-3 text-slate-100">
                    {p.nome}
                    {!p.batePonto && <span className="ml-1.5 text-[10px] text-slate-500">(não bate ponto)</span>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-slate-300">
                    {p.cpfMascarado ?? <span className="text-amber-300">falta</span>}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{p.vinculo ?? '—'}</td>
                  <td className="py-2 pr-3">
                    {p.temRosto ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">
                        <ScanFace className="w-3 h-3" />
                        Cadastrado ({p.biometriaPoses || 3} poses)
                      </span>
                    ) : p.biometriaStatus === 'recusada' ? (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                        Sem biometria (PIN)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px]">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{p.aparelho ? p.aparelho.nome : '—'}</td>
                  <td className="py-2 text-right whitespace-nowrap space-x-3">
                    {canEdit && (
                      <button className="text-blue-400 hover:text-blue-300 cursor-pointer" onClick={() => abrir(p)}>
                        Editar
                      </button>
                    )}
                    {canEdit && pronto && (
                      <button
                        className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        onClick={() => setEnrollPerson(p)}
                      >
                        {p.temRosto ? 'Recadastrar rosto' : 'Cadastrar rosto'}
                      </button>
                    )}
                    {canEdit && p.temRosto && (
                      <button
                        className="text-slate-500 hover:text-rose-300 cursor-pointer"
                        title="Remover biometria facial (LGPD)"
                        onClick={() => void removerRosto(p)}
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    )}
                    {canEdit && pronto && (
                      <button className="text-blue-400 hover:text-blue-300 cursor-pointer" onClick={() => parear(p)}>
                        Parear celular
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={`Ponto de ${edit.nome}`} onClose={() => setEdit(null)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className={label}>
                CPF {edit.cpfMascarado ? `(atual ${edit.cpfMascarado}; deixe vazio para manter)` : ''}
              </span>
              <input
                className={input}
                inputMode="numeric"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                placeholder="000.000.000-00"
              />
            </label>
            <label>
              <span className={label}>Vínculo</span>
              <select className={input} value={form.vinculo} onChange={(e) => setForm({ ...form, vinculo: e.target.value })}>
                <option>CLT</option>
                <option>PJ</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200 mt-5">
              <input
                type="checkbox"
                checked={form.batePonto}
                onChange={(e) => setForm({ ...form, batePonto: e.target.checked })}
              />{' '}
              Bate ponto
            </label>
            <label className="col-span-2">
              <span className={label}>Estabelecimento</span>
              <select
                className={input}
                value={form.estabelecimentoId}
                onChange={(e) => setForm({ ...form, estabelecimentoId: e.target.value })}
              >
                <option value="">Escolha</option>
                {estabs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.razaoSocial} ({x.cnpj})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>PIN (4 a 6 números, plano B)</span>
              <input
                className={input}
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
                placeholder={edit.temPin ? 'já tem; vazio mantém' : ''}
              />
            </label>
            <label>
              <span className={label}>Marcações por dia</span>
              <select
                className={input}
                value={form.marcacoes}
                onChange={(e) => setForm({ ...form, marcacoes: e.target.value as '' | '2' | '4' })}
              >
                <option value="">Padrão do estabelecimento</option>
                <option value="4">4 (com almoço)</option>
                <option value="2">2 (almoço pré-anotado)</option>
              </select>
            </label>
            <label>
              <span className={label}>Entrada própria</span>
              <input type="time" className={input} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </label>
            <label>
              <span className={label}>Saída própria</span>
              <input type="time" className={input} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
            </label>
          </div>
          {msg && <p className="text-xs text-rose-300">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setEdit(null)}>
              Cancelar
            </button>
            <button className={btnPri} onClick={salvar}>
              Salvar
            </button>
          </div>
        </Modal>
      )}

      {qr && (
        <PairingQrModal
          title={`Parear celular de ${qr.nome}`}
          modo="pessoal"
          code={qr.code}
          initialBaseUrl={qr.initialBaseUrl}
          expiraEm={qr.expiraEm}
          onClose={() => {
            setQr(null);
            onChange();
          }}
        />
      )}

      {enrollPerson && (
        <FaceEnrollModal
          personName={enrollPerson.nome}
          context="rh"
          openInNewTabUrl={`/?ponto-rosto=1&orgId=${encodeURIComponent(orgId)}&rhId=${encodeURIComponent(enrollPerson.rhId)}&nome=${encodeURIComponent(enrollPerson.nome)}`}
          onSaveFace={async (payload) => {
            await pontoApi.salvarRosto(orgId, enrollPerson.rhId, payload);
            onChange();
          }}
          onDeclineBiometrics={async (payload) => {
            await pontoApi.salvarRosto(orgId, enrollPerson.rhId, payload);
            onChange();
          }}
          onClose={() => setEnrollPerson(null)}
        />
      )}
    </div>
  );
};

// ── Estabelecimentos ──
const Estabs: React.FC<{ orgId: string; estabs: Estabelecimento[]; canEdit: boolean; onChange: () => void }> = ({
  orgId,
  estabs,
  canEdit,
  onChange,
}) => {
  const vazio = {
    id: '',
    cnpj: '',
    razaoSocial: '',
    endereco: '',
    inicio: PONTO_DEFAULTS.inicio,
    fim: PONTO_DEFAULTS.fim,
    almocoMin: String(PONTO_DEFAULTS.almocoMin),
    dias: PONTO_DEFAULTS.dias,
    marcacoesPorDia: String(PONTO_DEFAULTS.marcacoesPorDia),
    raioM: String(PONTO_DEFAULTS.raioM),
    toleranciaMin: String(PONTO_DEFAULTS.toleranciaMin),
    feriados: '',
  };
  const [form, setForm] = useState<typeof vazio | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const abrir = (e?: Estabelecimento) => {
    setMsg(null);
    if (!e) {
      setForm({ ...vazio, id: `estab_${Date.now()}` });
      return;
    }
    const c = { ...PONTO_DEFAULTS, ...(e.config ?? {}) };
    setForm({
      id: e.id,
      cnpj: e.cnpj,
      razaoSocial: e.razaoSocial,
      endereco: e.endereco ?? '',
      inicio: c.inicio,
      fim: c.fim,
      almocoMin: String(c.almocoMin),
      dias: c.dias,
      marcacoesPorDia: String(c.marcacoesPorDia),
      raioM: String(c.raioM),
      toleranciaMin: String(c.toleranciaMin),
      feriados: c.feriados.join(', '),
    });
  };
  const salvar = async () => {
    if (!form) return;
    try {
      await pontoApi.salvarEstabelecimento(orgId, form.id, {
        cnpj: form.cnpj,
        razaoSocial: form.razaoSocial,
        endereco: form.endereco,
        config: {
          inicio: form.inicio,
          fim: form.fim,
          almocoMin: Number(form.almocoMin),
          dias: form.dias,
          marcacoesPorDia: Number(form.marcacoesPorDia) as 2 | 4,
          raioM: Number(form.raioM),
          toleranciaMin: Number(form.toleranciaMin),
          feriados: form.feriados.split(/[\s,;]+/).filter(Boolean),
        },
      });
      setForm(null);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex justify-between items-center gap-2">
        <p className="text-xs text-slate-400">Cada CNPJ tem sua própria numeração de marcações (NSR) e seu próprio AFD.</p>
        {canEdit && (
          <button className={btnPri} onClick={() => abrir()}>
            Novo estabelecimento
          </button>
        )}
      </div>
      {estabs.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum estabelecimento ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="py-2 pr-3">Razão social</th>
                <th className="py-2 pr-3">CNPJ</th>
                <th className="py-2 pr-3">Jornada</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {estabs.map((e) => {
                const c = { ...PONTO_DEFAULTS, ...(e.config ?? {}) };
                return (
                  <tr key={e.id} className="border-t border-slate-800">
                    <td className="py-2 pr-3 text-slate-100">{e.razaoSocial}</td>
                    <td className="py-2 pr-3 font-mono text-slate-300">{e.cnpj}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {c.inicio}–{c.fim}, almoço {c.almocoMin} min, {c.dias.map((d) => DIAS[d]).join(' ')},{' '}
                      {c.marcacoesPorDia} marcações, raio {c.raioM} m
                    </td>
                    <td className="py-2 text-right">
                      {canEdit && (
                        <button className="text-blue-400 hover:text-blue-300 cursor-pointer" onClick={() => abrir(e)}>
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <Modal title="Estabelecimento" onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className={label}>Razão social</span>
              <input className={input} value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} />
            </label>
            <label>
              <span className={label}>CNPJ</span>
              <input
                className={input}
                inputMode="numeric"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </label>
            <label>
              <span className={label}>Endereço</span>
              <input className={input} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </label>
            <label>
              <span className={label}>Entrada</span>
              <input type="time" className={input} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </label>
            <label>
              <span className={label}>Saída</span>
              <input type="time" className={input} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
            </label>
            <label>
              <span className={label}>Almoço (min)</span>
              <input className={input} inputMode="numeric" value={form.almocoMin} onChange={(e) => setForm({ ...form, almocoMin: e.target.value })} />
            </label>
            <label>
              <span className={label}>Marcações por dia</span>
              <select className={input} value={form.marcacoesPorDia} onChange={(e) => setForm({ ...form, marcacoesPorDia: e.target.value })}>
                <option value="4">4 (com almoço)</option>
                <option value="2">2 (almoço pré-anotado)</option>
              </select>
            </label>
            <label>
              <span className={label}>Raio da obra (m)</span>
              <input className={input} inputMode="numeric" value={form.raioM} onChange={(e) => setForm({ ...form, raioM: e.target.value })} />
            </label>
            <label>
              <span className={label}>Tolerância por dia (min)</span>
              <input className={input} inputMode="numeric" value={form.toleranciaMin} onChange={(e) => setForm({ ...form, toleranciaMin: e.target.value })} />
            </label>
            <fieldset className="col-span-2">
              <legend className={label}>Dias de trabalho</legend>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={form.dias.includes(i)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dias: e.target.checked ? [...form.dias, i].sort() : form.dias.filter((x) => x !== i),
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="col-span-2">
              <span className={label}>Feriados (AAAA-MM-DD, separados por vírgula)</span>
              <input
                className={input}
                value={form.feriados}
                onChange={(e) => setForm({ ...form, feriados: e.target.value })}
                placeholder="2026-12-25, 2027-01-01"
              />
            </label>
          </div>
          {msg && <p className="text-xs text-rose-300">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className={btnPri} onClick={salvar}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Aparelhos & Totens ──
const Aparelhos: React.FC<{
  orgId: string;
  pessoas: PessoaPontoView[];
  units: Unit[];
  canEdit: boolean;
  canPairTotem: boolean;
}> = ({ orgId, pessoas, units, canEdit, canPairTotem }) => {
  const [lista, setLista] = useState<Aparelho[] | null>(null);
  const [unitId, setUnitId] = useState('');
  const [qr, setQr] = useState<{ code: string; initialBaseUrl: string; expiraEm: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLista(await pontoApi.aparelhos(orgId));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
      setLista([]);
    }
  }, [orgId]);
  useEffect(() => {
    load();
  }, [load]);
  const nomePessoa = (id?: string) => pessoas.find((p) => p.rhId === id)?.nome ?? id ?? '—';
  const nomeObra = (id?: string) => units.find((u) => u.id === id)?.name ?? id ?? '—';
  const totem = async () => {
    setMsg(null);
    try {
      const r = await pontoApi.parearTotem(orgId, unitId);
      setQr({ code: r.code, expiraEm: r.expiraEm, initialBaseUrl: getInitialPublicBase(r.publicBaseUrl) });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };
  return (
    <div className={`${card} space-y-3`}>
      {canPairTotem && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="w-72">
            <span className={label}>Parear tablet de obra (totem)</span>
            <select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Escolha a obra</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                  {u.geo ? '' : ' (sem local)'}
                </option>
              ))}
            </select>
          </label>
          <button className={btnPri} disabled={!unitId} onClick={totem}>
            Gerar QR do Totem
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-rose-300">{msg}</p>}
      {lista === null ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum aparelho pareado. Pareie celulares na aba Pessoas & Rosto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="py-2 pr-3">Aparelho</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">De quem / obra</th>
                <th className="py-2 pr-3">Desde</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id} className={`border-t border-slate-800 ${d.revogadoEm ? 'opacity-50' : ''}`}>
                  <td className="py-2 pr-3 text-slate-100">{d.nome}</td>
                  <td className="py-2 pr-3">{d.modo === 'totem' ? 'Totem' : 'Celular'}</td>
                  <td className="py-2 pr-3">{d.modo === 'totem' ? nomeObra(d.unitId) : nomePessoa(d.rhId)}</td>
                  <td className="py-2 pr-3">
                    {dataBR(d.criadoEm)}
                    {d.revogadoEm ? ` · desativado ${dataBR(d.revogadoEm)}` : ''}
                  </td>
                  <td className="py-2 text-right">
                    {canEdit && !d.revogadoEm && (
                      <button
                        className="text-rose-300 hover:text-rose-200 cursor-pointer"
                        onClick={async () => {
                          await pontoApi.revogarAparelho(orgId, d.id);
                          load();
                        }}
                      >
                        Desativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {qr && (
        <PairingQrModal
          title="Parear tablet-totem da obra"
          modo="totem"
          code={qr.code}
          initialBaseUrl={qr.initialBaseUrl}
          expiraEm={qr.expiraEm}
          onClose={() => {
            setQr(null);
            load();
          }}
        />
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
    setBusy(true);
    setMsg(null);
    try {
      await pontoApi.baixarAfd(orgId, estabId, inicio, fim);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`${card} space-y-3`}>
      <p className="text-xs text-slate-400">
        Arquivo Fonte de Dados (Portaria 671) para entregar à fiscalização. Até 31 dias por arquivo (exporte mês a mês).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="sm:col-span-2">
          <span className={label}>Estabelecimento</span>
          <select className={input} value={estabId} onChange={(e) => setEstabId(e.target.value)}>
            {estabs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.razaoSocial} ({x.cnpj})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>De</span>
          <input type="date" className={input} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label>
          <span className={label}>Até</span>
          <input type="date" className={input} value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
      </div>
      <button className={btnPri} disabled={!estabId || busy} onClick={baixar}>
        {busy ? 'Gerando…' : 'Baixar AFD'}
      </button>
      {msg && <p className="text-xs text-rose-300">{msg}</p>}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div className="af-glass-modal rounded-2xl p-5 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
