// Cliente da API oficial WsSelfBooking (SOAP) da Lemontech, que roda a Mar Travel.
// Documentação: https://lemontechinfo.atlassian.net/wiki/spaces/DW/pages/1725825083
// Credenciais do conector ficam só nos Secrets (LEMONTECH_WS_*); nada aqui é segredo.
import { XMLParser } from 'fast-xml-parser';

export const LEMONTECH_NS = 'http://lemontech.com.br/selfbooking/wsselfbooking/services';
export const LEMONTECH_ENDPOINTS = {
  producao: 'https://wsselfbooking.lemontech.com.br/wsselfbooking/WsSelfBookingService',
  treinamento: 'https://treinamento.lemontech.com.br/wsselfbooking/WsSelfBookingService',
} as const;
/** A API aceita no máximo 50 registros por página. */
export const MAX_REGISTROS = 50;

export interface LemontechCreds { userName: string; userPassword: string; keyClient: string }
export interface LemontechConfig { endpoint: string; creds: LemontechCreds }

type XmlValue = string | number | boolean | null | undefined | XmlObject | XmlValue[];
interface XmlObject { [key: string]: XmlValue }

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function toXml(obj: XmlObject): string {
  let out = '';
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item === undefined || item === null) continue;
      const inner = typeof item === 'object' ? toXml(item as XmlObject) : escapeXml(String(item));
      out += `<${key}>${inner}</${key}>`;
    }
  }
  return out;
}

export function buildSoapEnvelope(operation: string, body: XmlObject, creds: LemontechCreds): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${LEMONTECH_NS}">
<soapenv:Header>
<ser:userName>${escapeXml(creds.userName)}</ser:userName>
<ser:userPassword>${escapeXml(creds.userPassword)}</ser:userPassword>
<ser:keyClient>${escapeXml(creds.keyClient)}</ser:keyClient>
</soapenv:Header>
<soapenv:Body>
<ser:${operation}>${toXml(body)}</ser:${operation}>
</soapenv:Body>
</soapenv:Envelope>`;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // ids e códigos (ex.: "1040/24", "0012") ficam como texto
  trimValues: true,
});

/** Lê o Body da resposta; lança erro com a faultstring se a Lemontech devolver SOAP Fault. */
export function parseSoapBody(xml: string): any {
  const doc = parser.parse(xml);
  const body = doc?.Envelope?.Body ?? {};
  if (body.Fault) {
    const msg = body.Fault.faultstring ?? body.Fault.Reason?.Text ?? 'erro desconhecido';
    throw new Error(`Lemontech: ${msg}`);
  }
  return body;
}

const asList = <T>(v: T | T[] | undefined | ''): T[] => (v === undefined || v === '' ? [] : Array.isArray(v) ? v : [v]);

export function parsePesquisarSolicitacao(xml: string): any[] {
  const resp = parseSoapBody(xml).pesquisarSolicitacaoResponse;
  return asList(resp?.solicitacao);
}

export function readLemontechConfig(env: Record<string, string | undefined>): LemontechConfig | null {
  const userName = env.LEMONTECH_WS_USER?.trim();
  const userPassword = env.LEMONTECH_WS_PASSWORD;
  const keyClient = env.LEMONTECH_WS_KEYCLIENT?.trim();
  if (!userName || !userPassword || !keyClient) return null;
  const endpoint = env.LEMONTECH_WS_ENV === 'treinamento' ? LEMONTECH_ENDPOINTS.treinamento : LEMONTECH_ENDPOINTS.producao;
  return { endpoint, creds: { userName, userPassword, keyClient } };
}

export type PesquisarSolicitacaoParams =
  | { idSolicitacao: string }
  | {
      dataInicial: string; dataFinal: string;
      registroInicial?: number; quantidadeRegistros?: number;
      sincronizado?: boolean; exibirCancelados?: boolean;
      exibirPendentesAprovacao?: boolean; exibirAprovadas?: boolean;
      tipoSolicitacao?: string; dataAlteracaoInicial?: string; dataAlteracaoFinal?: string;
    };

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Tempo máximo de uma chamada à Lemontech (o proxy da hospedagem corta chamadas longas antes). */
export const LEMONTECH_TIMEOUT_MS = 20_000;

export function createWsSelfBookingClient(config: LemontechConfig, fetchImpl: FetchLike = fetch as any, opts: { timeoutMs?: number } = {}) {
  const timeoutMs = opts.timeoutMs ?? LEMONTECH_TIMEOUT_MS;
  async function call(operation: string, body: XmlObject): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      res = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: buildSoapEnvelope(operation, body, config.creds),
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') {
        const seg = (timeoutMs / 1000).toLocaleString('pt-BR');
        throw new Error(`A Mar Travel não respondeu em ${seg} s. Normalmente é o servidor da Lemontech só aceitando IPs liberados: peça para liberarem o IP do nosso servidor.`);
      }
      const code = e?.cause?.code || e?.code || e?.message || 'erro de rede';
      throw new Error(`Não foi possível conectar à Mar Travel (${code}).`);
    } finally {
      clearTimeout(timer);
    }
    // SOAP devolve Fault com HTTP 500: o parse transforma em erro legível.
    if (!res.ok && !/Fault/.test(text)) {
      if (res.status === 401 || res.status === 403) throw new Error(`Mar Travel recusou o acesso (HTTP ${res.status}): confira as credenciais do conector e a liberação de IP.`);
      throw new Error(`Mar Travel respondeu HTTP ${res.status}.`);
    }
    return text;
  }

  return {
    async pesquisarSolicitacao(params: PesquisarSolicitacaoParams) {
      const body: XmlObject = { ...params } as XmlObject;
      if ('quantidadeRegistros' in params && params.quantidadeRegistros !== undefined) {
        body.quantidadeRegistros = Math.min(params.quantidadeRegistros, MAX_REGISTROS);
      }
      return parsePesquisarSolicitacao(await call('pesquisarSolicitacao', body));
    },
  };
}
