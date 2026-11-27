import test from 'node:test';
import assert from 'node:assert/strict';
import { distanciaM, obraMaisProxima } from '../src/ponto/geo.ts';
import { isValidCpf, onlyDigitsCpf } from '../src/ponto/cpf.ts';

test('distância Praça da Sé → MASP ≈ 2,6 km', () => {
  const d = distanciaM({ lat: -23.5505, lng: -46.6333 }, { lat: -23.5614, lng: -46.6559 });
  assert.ok(d > 2400 && d < 2800, String(d));
});

test('obra mais próxima; dentro do raio da obra ou do padrão; sem GPS = null', () => {
  const obras = [
    { id: 'u1', nome: 'A', geo: { lat: -23.5505, lng: -46.6333 } },
    { id: 'u2', nome: 'B', geo: { lat: -23.5614, lng: -46.6559, raioM: 50 } },
    { id: 'u3', nome: 'sem geo', geo: null },
  ];
  assert.equal(obraMaisProxima({ lat: -23.5506, lng: -46.6334 }, obras, 300)?.unitId, 'u1');
  assert.equal(obraMaisProxima({ lat: -23.5506, lng: -46.6334 }, obras, 300)?.dentro, true);
  assert.equal(obraMaisProxima({ lat: -23.5620, lng: -46.6559 }, obras, 300)?.dentro, false);
  assert.equal(obraMaisProxima(null, obras, 300), null);
  assert.equal(obraMaisProxima({ lat: 0, lng: 0 }, [{ id: 'x', nome: 'x', geo: null }], 300), null);
});

test('CPF', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('123'), false);
  assert.equal(onlyDigitsCpf('529.982.247-25'), '52998224725');
});
