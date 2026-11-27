// Cliente das rotas do ponto para o RH (/api/ponto, ver server/ponto/rhRoutes.ts).
import { apiFetch } from '../apiAuthFetch';
import type { PontoConfig, TipoMarcacao } from '../ponto/config';

export type Alerta = 'fora_da_cerca' | 'sem_gps' | 'rosto' | 'relogio' | 'offline' | 'sem_biometria' | 'aparelho_revogado';
export const ALERTA_LABEL: Record<Alerta, string> = {
  fora_da_cerca: 'Fora da obra',
  sem_gps: 'Sem localização',
  rosto: 'Rosto não conferiu',
  relogio: 'Relógio do celular diferente',
  offline: 'Marcado sem internet',
  sem_biometria: 'Sem rosto (PIN ou sem identificação)',
  aparelho_revogado: 'Celular já desativado',
};

export interface Estabelecimento { id: string; orgId: string; cnpj: string; razaoSocial: string; endereco?: string; config?: Partial<PontoConfig> }
export interface PessoaPontoView {
  rhId: string; nome: string; unitId: string | null; cpfMascarado: string | null; vinculo: 'CLT' | 'PJ' | null;
  batePonto: boolean; estabelecimentoId: string | null; temPin: boolean; temRosto: boolean;
  biometriaStatus?: 'pendente' | 'cadastrada' | 'recusada';
  biometriaPoses?: number;
  biometriaAtualizadaEm?: string | null;
  lgpdAceitoEm?: string | null;
  config: Partial<PontoConfig> | null; aparelho: { id: string; nome: string; criadoEm: string } | null;
}
export interface LinhaMarcacao {
  id?: string; nsr?: number; tipo: TipoMarcacao; dataHora: string; origem: 'ponto' | 'ajuste'; desconsiderada: boolean;
  alertas: Alerta[]; unitId?: string | null; justificativa?: string;
  temFoto?: boolean; metodo?: 'rosto' | 'pin' | 'nenhum'; faceScore?: number | null; distM?: number | null;
}
export interface MarcacaoFotoDetalhe {
  id: string;
  nsr: number;
  tipo: TipoMarcacao;
  dataHora: string;
  gravadoEm: string;
  metodo: 'rosto' | 'pin' | 'nenhum';
  offline: boolean;
  face: { score: number; liveness?: number; modelo: string } | null;
  gps: { lat: number; lng: number; precisaoM?: number } | null;
  distM: number | null;
  obraNome: string | null;
  alertas: Alerta[];
  hash: string;
  fotoDataUrl: string | null;
}
export interface Horas { hn: number; h50: number; h100: number; trabalhadoMin: number; incompleto: boolean }
export interface DiaEspelho { data: string; marcacoes: LinhaMarcacao[]; horas: Horas }
export interface Espelho { pessoa: { rhId: string; nome: string; cpfMascarado: string | null }; dias: DiaEspelho[]; totais: { hn: number; h50: number; h100: number; diasIncompletos: number } }
export interface PessoaDia { rhId: string; nome: string; marcacoes: LinhaMarcacao[]; proxima: TipoMarcacao; alertas: Alerta[]; incompleto: boolean; horas: Horas }
export interface Aparelho { id: string; orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string; nome: string; criadoEm: string; revogadoEm?: string }

/** Horas decimais → "H:MM". */
export function minutosParaHHmm(h: number): string {
  const total = Math.round((Number(h) || 0) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function mascaraCpf(cpf: string): string {
  const d = String(cpf ?? '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}

async function call<T>(method: string, path: string, orgId: string, body?: Record<string, unknown>): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = method === 'GET' || method === 'DELETE' ? `/api/ponto${path}${sep}orgId=${encodeURIComponent(orgId)}` : `/api/ponto${path}`;
  const res = await apiFetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify({ orgId, ...body }) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Não foi possível concluir agora.');
  return j as T;
}

const q = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const pontoApi = {
  estabelecimentos: (orgId: string) => call<{ items: Estabelecimento[] }>('GET', '/estabelecimentos', orgId).then((r) => r.items),
  salvarEstabelecimento: (orgId: string, id: string, e: Omit<Estabelecimento, 'id' | 'orgId'>) => call('PUT', `/estabelecimentos/${encodeURIComponent(id)}`, orgId, e as Record<string, unknown>),
  pessoas: (orgId: string) => call<{ items: PessoaPontoView[] }>('GET', '/pessoas', orgId).then((r) => r.items),
  salvarPessoa: (orgId: string, rhId: string, p: Record<string, unknown>) => call('PUT', `/pessoas/${encodeURIComponent(rhId)}`, orgId, p),
  salvarRosto: (orgId: string, rhId: string, body: { descriptors?: number[][]; lgpdAceito?: boolean; recusar?: boolean; adicionar?: boolean; modelo?: string; lgpdVersao?: string }) =>
    call<{ ok: boolean; status: string; poses?: number; atualizadoEm: string }>('POST', `/pessoas/${encodeURIComponent(rhId)}/rosto`, orgId, body as Record<string, unknown>),
  removerRosto: (orgId: string, rhId: string) => call<{ ok: boolean }>('DELETE', `/pessoas/${encodeURIComponent(rhId)}/rosto`, orgId),
  fotoMarcacao: (orgId: string, marcacaoId: string) => call<MarcacaoFotoDetalhe>('GET', `/marcacoes/${encodeURIComponent(marcacaoId)}/foto`, orgId),
  parearPessoal: (orgId: string, rhId: string) => call<{ code: string; expiraEm: string; publicBaseUrl?: string | null }>('POST', '/pareamentos/pessoal', orgId, { rhId }),
  parearTotem: (orgId: string, unitId: string) => call<{ code: string; expiraEm: string; publicBaseUrl?: string | null }>('POST', '/pareamentos/totem', orgId, { unitId }),
  espelho: (orgId: string, rhId: string, inicio: string, fim: string) => call<Espelho>('GET', `/espelho?${q({ rhId, inicio, fim })}`, orgId),
  dia: (orgId: string, data: string) => call<{ data: string; pessoas: PessoaDia[] }>('GET', `/dia?${q({ data })}`, orgId),
  ajustar: (orgId: string, a: Record<string, unknown>) => call('POST', '/ajustes', orgId, a),
  aparelhos: (orgId: string) => call<{ items: Aparelho[] }>('GET', '/aparelhos', orgId).then((r) => r.items),
  revogarAparelho: (orgId: string, id: string) => call('DELETE', `/aparelhos/${encodeURIComponent(id)}`, orgId),
  async baixarAfd(orgId: string, estabId: string, inicio: string, fim: string) {
    const res = await apiFetch(`/api/ponto/afd?${q({ orgId, estabId, inicio, fim })}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Não foi possível gerar o AFD.');
    const nome = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'AFD.txt';
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
