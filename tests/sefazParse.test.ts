import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDistResponse, parseResNFe, parseEventoResponse, distDfeRequest, sendCiencia, nfeConfigFromEnv, type SefazCfg } from '../server/nfe/sefaz.ts';
import { distResponse, resNFe, eventoResponse, testPfx } from './fixtures/sefaz.ts';

const chave = '35261111111111111111550010000012341000012345';
const full = readFileSync(new URL('./fixtures/nfe-sample.xml', import.meta.url), 'utf8');

test('parseDistResponse decodes docZip and lists schemas', () => {
  const r = parseDistResponse(distResponse({ cStat: '138', xMotivo: 'Documento localizado', ultNSU: '000000000000002', maxNSU: '000000000000005', docs: [
    { nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', xml: resNFe(chave) },
    { nsu: '000000000000002', schema: 'procNFe_v4.00.xsd', xml: full },
  ] }));
  assert.equal(r.cStat, '138'); assert.equal(r.xMotivo, 'Documento localizado');
  assert.equal(r.ultNSU, '000000000000002'); assert.equal(r.maxNSU, '000000000000005');
  assert.deepEqual(r.docs.map((d) => [d.nsu, d.schema]), [['000000000000001', 'resNFe_v1.01.xsd'], ['000000000000002', 'procNFe_v4.00.xsd']]);
  assert.equal(r.docs[1].xml, full);
});

test('parseDistResponse without documents (137)', () => {
  const r = parseDistResponse(distResponse({ cStat: '137', ultNSU: '000000000000009', maxNSU: '000000000000009' }));
  assert.deepEqual(r, { cStat: '137', xMotivo: 'x', ultNSU: '000000000000009', maxNSU: '000000000000009', docs: [] });
});

test('parseDistResponse rejects a non-DistDFe answer', () => {
  assert.throws(() => parseDistResponse('<html>erro</html>'), /Resposta inesperada da SEFAZ/);
});

test('parseResNFe maps the summary and situação', () => {
  assert.deepEqual(parseResNFe(resNFe(chave, '3')), {
    chave, emitente: { cnpj: '11111111000111', nome: 'FORNECEDOR RESUMO LTDA' }, valorTotal: 1500.5, emitidaEm: '2026-11-10T10:30:00-03:00', situacao: 'cancelada',
  });
  assert.equal(parseResNFe(resNFe(chave)).situacao, 'autorizada');
});

test('parseEventoResponse prefers the evento cStat over the lote cStat', () => {
  assert.deepEqual(parseEventoResponse(eventoResponse('135')), { cStat: '135', xMotivo: 'Evento registrado' });
});

const cfg = (transport: SefazCfg['transport']): SefazCfg => ({
  pfx: testPfx().pfx, passphrase: 'teste', cnpj: '22222222000122', uf: '35', ambiente: '2', orgId: 'org_a', transport,
  now: () => new Date('2026-11-21T13:00:00Z'),
});

test('distDfeRequest posts the SOAP 1.2 distDFeInt to the homologação endpoint', async () => {
  let seen: { url: string; body: string } | undefined;
  const r = await distDfeRequest(cfg(async (url, body) => { seen = { url, body }; return distResponse({ cStat: '137', ultNSU: '000000000000042', maxNSU: '000000000000042' }); }), '42');
  assert.equal(r.cStat, '137');
  assert.equal(seen!.url, 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx');
  assert.ok(seen!.body.includes('<soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>' +
    '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><cUFAutor>35</cUFAutor><CNPJ>22222222000122</CNPJ>' +
    '<distNSU><ultNSU>000000000000042</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body>'));
});

test('sendCiencia posts a signed envEvento to RecepcaoEvento4 (AN)', async () => {
  let seen: { url: string; body: string } | undefined;
  const r = await sendCiencia({ ...cfg(async (url, body) => { seen = { url, body }; return eventoResponse('573'); }), ambiente: '1' }, chave);
  assert.deepEqual(r, { cStat: '573', xMotivo: 'Evento registrado' });
  assert.equal(seen!.url, 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx');
  assert.match(seen!.body, /<soap12:Body><nfeDadosMsg xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe\/wsdl\/NFeRecepcaoEvento4"><envEvento xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe" versao="1\.00"><idLote>\d{1,15}<\/idLote><evento xmlns=.*<tpAmb>1<\/tpAmb>.*<\/Signature><\/evento><\/envEvento><\/nfeDadosMsg><\/soap12:Body>/);
});

test('nfeConfigFromEnv needs every variable and defaults to homologação', () => {
  const env = { NFE_CERT_PFX_BASE64: Buffer.from('x').toString('base64'), NFE_CERT_PASSWORD: 'p', NFE_CNPJ: '22.222.222/0001-22', NFE_UF: '35', NFE_ORG_ID: 'org_a' };
  const c = nfeConfigFromEnv(env)!;
  assert.equal(c.ambiente, '2'); assert.equal(c.cnpj, '22222222000122'); assert.equal(c.pfx.toString(), 'x');
  assert.equal(nfeConfigFromEnv({ ...env, NFE_ORG_ID: '' }), null);
  assert.equal(nfeConfigFromEnv({ ...env, NFE_AMBIENTE: '1' })!.ambiente, '1');
});
