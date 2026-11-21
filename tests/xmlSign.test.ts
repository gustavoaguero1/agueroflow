import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import { signEvent } from '../server/nfe/xmlSign.ts';
import { buildCienciaEvento } from '../server/nfe/sefaz.ts';
import { testPfx } from './fixtures/sefaz.ts';

const chave = '35261111111111111111550010000012341000012345';
const evento = buildCienciaEvento({ cnpj: '22222222000122', chave, tpAmb: '2', now: new Date('2026-11-21T13:00:00Z') });

test('ciencia evento has the layout element order and Brasília dhEvento', () => {
  assert.equal(evento,
    '<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">' +
    `<infEvento Id="ID210210${chave}01"><cOrgao>91</cOrgao><tpAmb>2</tpAmb><CNPJ>22222222000122</CNPJ><chNFe>${chave}</chNFe>` +
    '<dhEvento>2026-11-21T10:00:00-03:00</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>' +
    '<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>');
});

test('ciencia evento rejects malformed chave/CNPJ', () => {
  assert.throws(() => buildCienciaEvento({ cnpj: '22222222000122', chave: '123', tpAmb: '2', now: new Date() }));
  assert.throws(() => buildCienciaEvento({ cnpj: '2222<', chave, tpAmb: '2', now: new Date() }));
});

test('signEvent produces verifiable signature', () => {
  const { pfx, certPem } = testPfx();
  const signed = signEvent(evento, pfx, 'teste');
  // Signature is the last child of evento, after infEvento (enveloped).
  assert.match(signed, /<\/infEvento><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"><SignedInfo>.*<\/Signature><\/evento>$/);
  const inf = /<infEvento[\s\S]*<\/infEvento>/.exec(signed)![0];
  const signedInfo = /<SignedInfo>[\s\S]*<\/SignedInfo>/.exec(signed)![0];
  const pick = (tag: string) => new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(signed)![1];
  assert.ok(signedInfo.includes(`<Reference URI="#ID210210${chave}01">`));
  for (const alg of ['http://www.w3.org/TR/2001/REC-xml-c14n-20010315', 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    'http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2000/09/xmldsig#sha1']) {
    assert.ok(signedInfo.includes(`Algorithm="${alg}"></`), alg);
  }
  // C14N of a subtree renders the inherited default namespace on its apex element (before other attributes).
  const c14nInf = inf.replace('<infEvento ', '<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" ');
  assert.equal(pick('DigestValue'), createHash('sha1').update(c14nInf).digest('base64'));
  const c14nSi = signedInfo.replace('<SignedInfo>', '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
  assert.ok(verify('sha1', Buffer.from(c14nSi), certPem, Buffer.from(pick('SignatureValue'), 'base64')));
  assert.equal(pick('X509Certificate'), certPem.replace(/-----[^-]+-----|\s/g, ''));
});

test('signEvent reports a wrong certificate password clearly', () => {
  assert.throws(() => signEvent(evento, testPfx().pfx, 'errada'), /Certificado A1 inválido ou senha incorreta/);
});
