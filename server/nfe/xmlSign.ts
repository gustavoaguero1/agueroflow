import { createHash, createSign } from 'node:crypto';
import forge from 'node-forge';

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

/** Extracts the private key (PEM) and the certificate (base64 DER) from an A1 PKCS#12 (.pfx). */
export function readPfx(pfx: Buffer, passphrase: string): { keyPem: string; certB64: string } {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), passphrase); }
  catch { throw new Error('Certificado A1 inválido ou senha incorreta'); }
  const key = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0]?.key
    ?? (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])[0]?.key;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter((c) => !!c);
  if (!key || !certs.length) throw new Error('Certificado A1 sem chave privada ou certificado');
  // The signing cert is the one whose public key matches the private key (a .pfx may also carry the CA chain).
  const pub = forge.pki.setRsaPublicKey((key as forge.pki.rsa.PrivateKey).n, (key as forge.pki.rsa.PrivateKey).e);
  const cert = certs.find((c) => forge.pki.publicKeyToPem(c!.publicKey) === forge.pki.publicKeyToPem(pub)) ?? certs[0]!;
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certB64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
  };
}

/**
 * Enveloped XML-DSig (NF-e "Assinatura Digital", RSA-SHA1 + C14N 1.0) over `infEvento`, inserted as the last
 * child of `evento`.
 *
 * We do not run a general C14N engine. Instead the input must already be in canonical form, which holds for the
 * XML built by `buildCienciaEvento`: no XML declaration, no whitespace or comments between tags, attributes in
 * C14N order (namespace declarations first, then attributes by name), every element written as start+end tag
 * (never `<a/>`), double-quoted attributes, and text with no characters that C14N would escape (validated by
 * the builder: digits, fixed ASCII strings and an ISO date).
 * Under those conditions the C14N of the `infEvento` subtree is its exact substring, except that C14N renders
 * the default namespace inherited from `evento` (`xmlns="http://www.portalfiscal.inf.br/nfe"`) on the apex
 * element, before its `Id` attribute. Likewise `SignedInfo`, embedded inside `<Signature xmlns=DSIG>` without
 * its own declaration, is canonicalized with `xmlns="http://www.w3.org/2000/09/xmldsig#"` on itself.
 */
export function signEvent(xmlEvento: string, pfx: Buffer, passphrase: string): string {
  const m = /^<evento xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"[^>]*>(<infEvento Id="(ID\d{52})">[^\n]*<\/infEvento>)<\/evento>$/.exec(xmlEvento);
  if (!m || /\/>|&|xmlns/.test(m[1])) throw new Error('Evento fora do formato canônico esperado');
  const [, infEvento, id] = m;
  const { keyPem, certB64 } = readPfx(pfx, passphrase);

  const c14nInf = infEvento.replace('<infEvento ', `<infEvento xmlns="${NFE_NS}" `);
  const digest = createHash('sha1').update(c14nInf, 'utf8').digest('base64');
  const signedInfo =
    `<SignedInfo><CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${DSIG_NS}rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms><Transform Algorithm="${DSIG_NS}enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${DSIG_NS}sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const c14nSi = signedInfo.replace('<SignedInfo>', `<SignedInfo xmlns="${DSIG_NS}">`);
  const sig = createSign('RSA-SHA1').update(c14nSi, 'utf8').sign(keyPem, 'base64');
  const signature = `<Signature xmlns="${DSIG_NS}">${signedInfo}<SignatureValue>${sig}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return xmlEvento.replace(/<\/evento>$/, `${signature}</evento>`);
}
