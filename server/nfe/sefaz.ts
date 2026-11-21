import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { readPfx, signEvent } from './xmlSign.ts';

export type Transport = (url: string, soapXml: string, action: string) => Promise<string>;
export type SefazCfg = {
  pfx: Buffer; passphrase: string; cnpj: string; uf: string; ambiente: '1' | '2'; orgId: string;
  transport?: Transport; now?: () => Date; caPem?: string;
};
export type DistDoc = { nsu: string; schema: string; xml: string };
export type DistResult = { cStat: string; xMotivo: string; ultNSU: string; maxNSU: string; docs: DistDoc[] };

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';
const WSDL_DIST = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe';
const WSDL_EVT = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
const URLS = {
  dist: { '1': 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx', '2': 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx' },
  evento: { '1': 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx', '2': 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx' },
};
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Reads the NFE_* variables; null (sync disabled) when any required one is missing. */
export function nfeConfigFromEnv(env: Record<string, string | undefined> = process.env): SefazCfg | null {
  const { NFE_CERT_PFX_BASE64: pfx, NFE_CERT_PASSWORD: pass, NFE_CNPJ, NFE_UF, NFE_ORG_ID, NFE_AMBIENTE, NFE_CA_PEM } = env;
  if (!pfx || pass == null || pass === '' || !digits(NFE_CNPJ) || !digits(NFE_UF) || !NFE_ORG_ID) return null;
  return {
    pfx: Buffer.from(pfx, 'base64'), passphrase: pass, cnpj: digits(NFE_CNPJ), uf: digits(NFE_UF), orgId: NFE_ORG_ID,
    ambiente: NFE_AMBIENTE === '1' ? '1' : '2', ...(NFE_CA_PEM && { caPem: NFE_CA_PEM }),
  };
}

/** mTLS POST with the A1 certificate. Key/cert go through node-forge because OpenSSL 3 rejects legacy .pfx ciphers. */
function httpsTransport(cfg: SefazCfg): Transport {
  const { keyPem, certB64 } = readPfx(cfg.pfx, cfg.passphrase);
  const cert = `-----BEGIN CERTIFICATE-----\n${certB64.replace(/.{64}/g, '$&\n')}\n-----END CERTIFICATE-----\n`;
  // SEFAZ servers use ICP-Brasil certificates, which may be missing from Node's CA list: NFE_CA_PEM adds them.
  const agent = new https.Agent({ key: keyPem, cert, ...(cfg.caPem && { ca: [...rootCertificates, cfg.caPem] }) });
  return (url, soapXml, action) => new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST', agent, timeout: 30_000,
      headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`, 'Content-Length': Buffer.byteLength(soapXml) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if ((res.statusCode ?? 0) >= 400) reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        else resolve(body);
      });
    });
    req.on('timeout', () => req.destroy(new Error('SEFAZ não respondeu em 30 s')));
    req.on('error', reject);
    req.end(soapXml);
  });
}

const transportOf = (cfg: SefazCfg) => cfg.transport ?? httpsTransport(cfg);
const envelope = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${body}</soap12:Body></soap12:Envelope>`;

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false, processEntities: false,
  isArray: (name) => name === 'docZip' || name === 'retEvento',
});
const str = (v: unknown) => (v == null ? '' : String(v));
function parseSafe(xml: string): any {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML com DOCTYPE não é aceito');
  return parser.parse(xml);
}
function find(o: any, key: string): any {
  if (!o || typeof o !== 'object') return undefined;
  if (key in o) return o[key];
  for (const v of Object.values(o)) { const r = find(v, key); if (r !== undefined) return r; }
  return undefined;
}

export function parseDistResponse(xml: string): DistResult {
  const ret = find(parseSafe(xml), 'retDistDFeInt');
  if (!ret?.cStat) throw new Error(`Resposta inesperada da SEFAZ: ${xml.slice(0, 200)}`);
  const docs = (ret.loteDistDFeInt?.docZip ?? []).map((d: any): DistDoc => ({
    nsu: str(d['@NSU']), schema: str(d['@schema']),
    xml: gunzipSync(Buffer.from(str(d['#text']), 'base64'), { maxOutputLength: 5_000_000 }).toString('utf8'),
  }));
  return { cStat: str(ret.cStat), xMotivo: str(ret.xMotivo), ultNSU: str(ret.ultNSU), maxNSU: str(ret.maxNSU), docs };
}

const SITUACAO: Record<string, string> = { '1': 'autorizada', '2': 'denegada', '3': 'cancelada' };
/** resNFe (schema resNFe_v1.01.xsd): the summary SEFAZ sends before the Ciência da Operação. */
export function parseResNFe(xml: string) {
  const r = find(parseSafe(xml), 'resNFe');
  if (!/^\d{44}$/.test(str(r?.chNFe))) throw new Error('resNFe sem chave de acesso');
  return {
    chave: str(r.chNFe), emitente: { cnpj: str(r.CNPJ ?? r.CPF), nome: str(r.xNome) },
    valorTotal: Math.round(Number(r.vNF || 0) * 100) / 100, emitidaEm: str(r.dhEmi), situacao: SITUACAO[str(r.cSitNFe)] ?? str(r.cSitNFe),
  };
}

export async function distDfeRequest(cfg: SefazCfg, ultNSU: string): Promise<DistResult> {
  const nsu = digits(ultNSU).padStart(15, '0').slice(-15);
  const msg = `<distDFeInt xmlns="${NFE_NS}" versao="1.01"><tpAmb>${cfg.ambiente}</tpAmb><cUFAutor>${cfg.uf}</cUFAutor><CNPJ>${cfg.cnpj}</CNPJ><distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt>`;
  const soap = envelope(`<nfeDistDFeInteresse xmlns="${WSDL_DIST}"><nfeDadosMsg>${msg}</nfeDadosMsg></nfeDistDFeInteresse>`);
  return parseDistResponse(await transportOf(cfg)(URLS.dist[cfg.ambiente], soap, `${WSDL_DIST}/nfeDistDFeInteresse`));
}

/** dhEvento in Brasília time (UTC-03:00, no daylight saving since 2019): YYYY-MM-DDTHH:mm:ss-03:00. */
const brasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 19) + '-03:00';

/** Evento 210210 (Ciência da Operação), already in canonical form for signEvent (see its comment). */
export function buildCienciaEvento(p: { cnpj: string; chave: string; tpAmb: '1' | '2'; now: Date }): string {
  if (!/^\d{44}$/.test(p.chave) || !/^\d{14}$/.test(p.cnpj)) throw new Error('Chave ou CNPJ inválido para o evento');
  return `<evento xmlns="${NFE_NS}" versao="1.00"><infEvento Id="ID210210${p.chave}01">` +
    `<cOrgao>91</cOrgao><tpAmb>${p.tpAmb}</tpAmb><CNPJ>${p.cnpj}</CNPJ><chNFe>${p.chave}</chNFe>` +
    `<dhEvento>${brasilia(p.now)}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
    '<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>';
}

export function parseEventoResponse(xml: string): { cStat: string; xMotivo: string } {
  const ret = find(parseSafe(xml), 'retEnvEvento');
  if (!ret?.cStat) throw new Error(`Resposta inesperada da SEFAZ: ${xml.slice(0, 200)}`);
  const inf = ret.retEvento?.[0]?.infEvento;
  return inf?.cStat ? { cStat: str(inf.cStat), xMotivo: str(inf.xMotivo) } : { cStat: str(ret.cStat), xMotivo: str(ret.xMotivo) };
}

/** Sends Ciência da Operação to the Ambiente Nacional (cOrgao 91). cStat 135/136 = registrado, 573 = duplicado. */
export async function sendCiencia(cfg: SefazCfg, chave: string): Promise<{ cStat: string; xMotivo: string }> {
  const now = (cfg.now ?? (() => new Date()))();
  const signed = signEvent(buildCienciaEvento({ cnpj: cfg.cnpj, chave, tpAmb: cfg.ambiente, now }), cfg.pfx, cfg.passphrase);
  const env = `<envEvento xmlns="${NFE_NS}" versao="1.00"><idLote>${String(now.getTime()).slice(-15)}</idLote>${signed}</envEvento>`;
  const soap = envelope(`<nfeDadosMsg xmlns="${WSDL_EVT}">${env}</nfeDadosMsg>`);
  return parseEventoResponse(await transportOf(cfg)(URLS.evento[cfg.ambiente], soap, `${WSDL_EVT}/nfeRecepcaoEvento`));
}
