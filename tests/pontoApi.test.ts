import test from 'node:test';
import assert from 'node:assert/strict';
import { minutosParaHHmm, mascaraCpf, ALERTA_LABEL } from '../src/services/pontoApi.ts';

test('minutosParaHHmm (horas decimais → H:MM)', () => {
  assert.equal(minutosParaHHmm(1.5), '1:30');
  assert.equal(minutosParaHHmm(0), '0:00');
  assert.equal(minutosParaHHmm(9), '9:00');
  assert.equal(minutosParaHHmm(8.75), '8:45');
  assert.equal(minutosParaHHmm(0.33), '0:20');
});

test('mascaraCpf', () => {
  assert.equal(mascaraCpf('52998224725'), '***.982.247-**');
  assert.equal(mascaraCpf('123'), '');
});

test('todo alerta tem texto em português', () => {
  for (const k of ['fora_da_cerca', 'sem_gps', 'rosto', 'relogio', 'offline']) assert.ok(ALERTA_LABEL[k as keyof typeof ALERTA_LABEL]);
});
