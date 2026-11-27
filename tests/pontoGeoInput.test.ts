import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeoInput } from '../src/ponto/geoInput.ts';

test('aceita vírgula, valida faixas, vazio = null', () => {
  assert.deepEqual(parseGeoInput('-23,5505', '-46,6333', '300'), { lat: -23.5505, lng: -46.6333, raioM: 300 });
  assert.deepEqual(parseGeoInput('-23.5505', '-46.6333', ''), { lat: -23.5505, lng: -46.6333 });
  assert.equal(parseGeoInput('', '', ''), null);
  assert.equal(parseGeoInput('  ', ' ', ''), null);
  assert.equal(parseGeoInput('-95', '0', ''), 'invalido');
  assert.equal(parseGeoInput('-23', '-190', ''), 'invalido');
  assert.equal(parseGeoInput('-23', '-46', '10'), 'invalido');
  assert.equal(parseGeoInput('-23', '', ''), 'invalido');
  assert.equal(parseGeoInput('abc', '-46', ''), 'invalido');
});
