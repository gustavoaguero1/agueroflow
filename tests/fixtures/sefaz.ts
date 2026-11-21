// Test-only helpers: fake SEFAZ responses and a throwaway self-signed A1 certificate (no secrets committed).
import { gzipSync } from 'node:zlib';
import forge from 'node-forge';

export const zip = (xml: string) => gzipSync(Buffer.from(xml, 'utf8')).toString('base64');

export const resNFe = (chave: string, cSitNFe = '1') =>
  `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${chave}</chNFe><CNPJ>11111111000111</CNPJ><xNome>FORNECEDOR RESUMO LTDA</xNome><IE>123</IE><dhEmi>2026-11-10T10:30:00-03:00</dhEmi><tpNF>1</tpNF><vNF>1500.50</vNF><digVal>abc=</digVal><dhRecbto>2026-11-10T10:31:00-03:00</dhRecbto><nProt>135260000000001</nProt><cSitNFe>${cSitNFe}</cSitNFe></resNFe>`;

export function distResponse(p: { cStat: string; xMotivo?: string; ultNSU: string; maxNSU: string; docs?: { nsu: string; schema: string; xml: string }[] }) {
  const lote = p.docs?.length
    ? `<loteDistDFeInt>${p.docs.map((d) => `<docZip NSU="${d.nsu}" schema="${d.schema}">${zip(d.xml)}</docZip>`).join('')}</loteDistDFeInt>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><verAplic>1.0</verAplic><cStat>${p.cStat}</cStat><xMotivo>${p.xMotivo ?? 'x'}</xMotivo><dhResp>2026-11-21T10:00:00-03:00</dhResp><ultNSU>${p.ultNSU}</ultNSU><maxNSU>${p.maxNSU}</maxNSU>${lote}</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
}

export const eventoResponse = (cStat: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><cOrgao>91</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><cOrgao>91</cOrgao><cStat>${cStat}</cStat><xMotivo>Evento registrado</xMotivo></infEvento></retEvento></retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>`;

let memo: { pfx: Buffer; certPem: string } | undefined;
export function testPfx(passphrase = 'teste'): { pfx: Buffer; certPem: string } {
  if (memo) return memo;
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'EMPRESA TESTE SA:22222222000122' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: '3des' });
  memo = { pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'), certPem: forge.pki.certificateToPem(cert) };
  return memo;
}
