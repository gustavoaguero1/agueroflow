import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { webcrypto } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  FACE_DIM,
  distanceToScore,
  evaluateLiveness,
  matchFace1to1,
  matchFace1toN,
  sanitizeDescriptor,
} from '../src/ponto/faceMath.ts';
import { openFaceDescriptors, sanitizePontoPhoto, sealFaceDescriptors } from '../server/ponto/bioCrypto.ts';
import { createPontoRouter } from '../server/pontoRoutes.ts';
import { memoryPontoStore } from '../server/ponto/store.ts';
import { extractPairCode } from '../src/ponto/deviceClient.ts';

function makeVec(seed: number): number[] {
  return Array.from({ length: FACE_DIM }, (_, i) => Math.round(Math.sin(seed * 13 + i * 0.37) * 0.25 * 1e5) / 1e5);
}

async function generateDeviceKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const sign = async (text: string) => {
    const buf = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(text));
    return Buffer.from(buf).toString('base64');
  };
  return { publicKeyJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, sign };
}

test('faceMath: 1:1, 1:N, score calibrado e prova de vida passiva', () => {
  const vJoao = makeVec(1);
  const vJoaoLeve = vJoao.map((x, i) => x + (i % 2 === 0 ? 0.015 : -0.015));
  const vMaria = makeVec(99);

  assert.equal(sanitizeDescriptor(vJoao)?.length, 128);
  assert.equal(sanitizeDescriptor([1, 2, 3]), null);

  const m1 = matchFace1to1(vJoaoLeve, [vJoao]);
  assert.equal(m1.matched, true);
  assert.ok(m1.score > 0.8, `score esperado > 0.8, recebido ${m1.score}`);

  const mDiff = matchFace1to1(vMaria, [vJoao]);
  assert.equal(mDiff.matched, false);
  assert.ok(mDiff.score < 0.6, `score de outra pessoa deve ser < 0.6, recebido ${mDiff.score}`);

  const id1N = matchFace1toN(vJoaoLeve, [
    { rhId: 'maria', nome: 'Maria', descriptors: [vMaria] },
    { rhId: 'joao', nome: 'João', descriptors: [vJoao] },
  ]);
  assert.equal(id1N?.rhId, 'joao');
  assert.equal(id1N?.matched, true);

  assert.ok(distanceToScore(0.4) > 0.7);
  assert.ok(distanceToScore(0.55) >= 0.6);
  assert.ok(distanceToScore(0.75) < 0.5);

  const livePass = evaluateLiveness([
    { ear: 0.31, yaw: 0.0, boxCx: 0.5, boxCy: 0.5 },
    { ear: 0.19, yaw: 0.02, boxCx: 0.505, boxCy: 0.5 },
    { ear: 0.30, yaw: 0.06, boxCx: 0.51, boxCy: 0.505 },
  ]);
  assert.equal(livePass.passed, true);
  assert.equal(livePass.blinkDetected, true);

  const liveStatic = evaluateLiveness([
    { ear: 0.30, yaw: 0.0, boxCx: 0.5, boxCy: 0.5 },
    { ear: 0.30, yaw: 0.0, boxCx: 0.5, boxCy: 0.5 },
    { ear: 0.30, yaw: 0.0, boxCx: 0.5, boxCy: 0.5 },
  ]);
  assert.equal(liveStatic.passed, false);
});

test('bioCrypto: cifra e decifra vetores com AES-256-GCM e valida selfie comprimida', () => {
  const vecs = [makeVec(1), makeVec(2)];
  const sealed = sealFaceDescriptors(vecs);
  assert.ok(sealed.iv && sealed.tag && sealed.data);
  const opened = openFaceDescriptors(sealed);
  assert.deepEqual(opened, vecs);

  const validJpeg = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-bytes').toString('base64')}`;
  assert.equal(sanitizePontoPhoto(validJpeg), validJpeg);
  assert.equal(sanitizePontoPhoto('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(sanitizePontoPhoto(`data:image/jpeg;base64,${'A'.repeat(120_000)}`), null);
});

test('extractPairCode aceita URL /ponto?pair=, prefixo legado e código puro', () => {
  assert.equal(extractPairCode('https://app.agueroflow.com/ponto?pair=abcd1234'), 'ABCD1234');
  assert.equal(extractPairCode('agueroflow-ponto:xyzw9876'), 'XYZW9876');
  assert.equal(extractPairCode('  ab-cd 1234 '), 'ABCD1234');
});

test('fluxo completo E2E: pareamento, cadastro facial LGPD, batida com selfie + revalidação facial e conferência no RH', async () => {
  const store = memoryPontoStore();
  const orgId = 'org_teste';
  const nowDate = new Date('2026-11-27T11:00:00-03:00');
  const now = () => nowDate;

  store.rh.set(orgId, [{ id: 'rh_1', name: 'Carlos Soldador', unitId: 'obra_1', active: true }]);
  store.obras.set(orgId, [{ id: 'obra_1', nome: 'Obra Laticínio', geo: { lat: -23.55, lng: -46.63, raioM: 300 } }]);
  await store.saveEstab({ id: 'est_1', orgId, cnpj: '12345678000199', razaoSocial: 'Aguero Inox Ltda' });
  await store.savePessoa({
    orgId,
    rhId: 'rh_1',
    nome: 'Carlos Soldador',
    cpf: '52998224725',
    estabelecimentoId: 'est_1',
    vinculo: 'CLT',
  });

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'rh_admin', master: true };
    (req as any).orgId = orgId;
    next();
  });
  app.use('/api/ponto', createPontoRouter({ store: () => store, now, afterRegistro: async () => undefined }));

  const srv = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/ponto`;

  try {
    // 1. RH gera código de pareamento pessoal
    const pairCodeRes = await fetch(`${base}/pareamentos/pessoal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, rhId: 'rh_1' }),
    });
    assert.equal(pairCodeRes.status, 200);
    const { code } = (await pairCodeRes.json()) as { code: string };

    // 2. Celular pareia com par de chaves ECDSA
    const dev = await generateDeviceKeys();
    const pairRes = await fetch(`${base}/device/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, publicKeyJwk: dev.publicKeyJwk, nome: 'Samsung Carlos' }),
    });
    assert.equal(pairRes.status, 200);
    const paired = (await pairRes.json()) as { deviceId: string; estabelecimento: { cnpj: string } };
    assert.equal(paired.estabelecimento.cnpj, '12345678000199');

    // 3. Celular cadastra rosto (exige aceite LGPD)
    const vCarlos = makeVec(7);
    const enrollPayloadNoLgpd = JSON.stringify({ descriptors: [vCarlos], lgpdAceito: false });
    const badEnroll = await fetch(`${base}/device/rosto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ponto-device': paired.deviceId },
      body: JSON.stringify({ payload: enrollPayloadNoLgpd, signature: await dev.sign(enrollPayloadNoLgpd) }),
    });
    assert.equal(badEnroll.status, 400);

    const enrollPayload = JSON.stringify({ descriptors: [vCarlos], lgpdAceito: true });
    const okEnroll = await fetch(`${base}/device/rosto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ponto-device': paired.deviceId },
      body: JSON.stringify({ payload: enrollPayload, signature: await dev.sign(enrollPayload) }),
    });
    assert.equal(okEnroll.status, 200);

    // 4. GET /device/me retorna biometria e obras para operar offline
    const min = Math.floor(now().getTime() / 60000);
    const meRes = await fetch(`${base}/device/me`, {
      headers: { 'x-ponto-device': paired.deviceId, 'x-ponto-sig': await dev.sign(`GET /device/me|${min}`) },
    });
    assert.equal(meRes.status, 200);
    const me = (await meRes.json()) as any;
    assert.equal(me.biometria.status, 'cadastrada');
    assert.equal(me.biometria.descriptors.length, 1);
    assert.equal(me.obras.length, 1);

    // 5. Editar dados da pessoa no RH NÃO apaga o rosto cadastrado
    const editRes = await fetch(`${base}/pessoas/rh_1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, vinculo: 'CLT', estabelecimentoId: 'est_1', pin: '1234' }),
    });
    assert.equal(editRes.status, 200);
    const pessoasRes = await fetch(`${base}/pessoas?orgId=${orgId}`);
    const pessoasJson = (await pessoasRes.json()) as { items: any[] };
    assert.equal(pessoasJson.items[0].temRosto, true);
    assert.equal(pessoasJson.items[0].biometriaStatus, 'cadastrada');

    // 6. Batida com foto comprimida e faceDescriptor de OUTRA pessoa → servidor revalida e gera alerta 'rosto' (sem bloquear!)
    const selfie = `data:image/jpeg;base64,${Buffer.from('selfie-carlos').toString('base64')}`;
    const punchPayload = JSON.stringify({
      clientId: 'mc_e2e_1',
      rhId: 'rh_1',
      tipo: 'entrada',
      dataHora: '2026-11-27T11:00:00-03:00',
      offline: false,
      gps: { lat: -23.55, lng: -46.63, precisaoM: 12 },
      face: { score: 0.99, liveness: 0.9, modelo: 'faceapi-resnet128-v1' }, // cliente tentando mentir 0.99
      faceDescriptor: makeVec(555), // vetor de outra pessoa!
      fotoDataUrl: selfie,
      relogio: { sincronizadoEm: '2026-11-27T10:59:50-03:00', decorridoMs: 10_000 },
      metodo: 'rosto',
    });
    const punchRes = await fetch(`${base}/device/marcacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ponto-device': paired.deviceId },
      body: JSON.stringify({ items: [{ payload: punchPayload, signature: await dev.sign(punchPayload) }] }),
    });
    assert.equal(punchRes.status, 200);
    const punchJson = (await punchRes.json()) as any;
    assert.equal(punchJson.results[0].ok, true);
    assert.ok(punchJson.results[0].comprovante.alertas.includes('rosto'), 'servidor deve recalcular score e sinalizar alerta rosto');

    // 7. RH consulta espelho e abre a selfie da marcação
    const espRes = await fetch(`${base}/espelho?orgId=${orgId}&rhId=rh_1&inicio=2026-11-27&fim=2026-11-27`);
    const esp = (await espRes.json()) as any;
    const marc = esp.dias[0].marcacoes[0];
    assert.equal(marc.temFoto, true);
    assert.ok(marc.id);

    const fotoRes = await fetch(`${base}/marcacoes/${encodeURIComponent(marc.id)}/foto?orgId=${orgId}`);
    assert.equal(fotoRes.status, 200);
    const foto = (await fotoRes.json()) as any;
    assert.equal(foto.fotoDataUrl, selfie);
    assert.equal(foto.obraNome, 'Obra Laticínio');

    // 8. Celular consulta próprios comprovantes
    const compRes = await fetch(`${base}/device/comprovantes`, {
      headers: { 'x-ponto-device': paired.deviceId, 'x-ponto-sig': await dev.sign(`GET /device/comprovantes|${min}`) },
    });
    assert.equal(compRes.status, 200);
    const comp = (await compRes.json()) as { items: any[] };
    assert.equal(comp.items.length, 1);
    assert.equal(comp.items[0].nsr, 1);
  } finally {
    srv.close();
  }
});
