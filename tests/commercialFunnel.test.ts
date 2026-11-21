import test from 'node:test';
import assert from 'node:assert/strict';
import { funnelSummary, validateLoss, LOSS_REASONS } from '../src/services/commercialFunnelService.ts';

const p = (status: string, v: number, extra: any = {}) =>
  ({ id: Math.random().toString(), status, proposedTotal: v, updatedAt: '2026-11-10T00:00:00Z', ...extra }) as any;

test('funnelSummary counts, values and weighted forecast with default probabilities', () => {
  const s = funnelSummary([
    p('enviada', 1000), p('enviada', 1000, { probabilidade: 50 }),
    p('negociacao', 2000), p('ganha', 500), p('perdida', 300, { motivoPerda: 'Preço' }),
    p('perdida', 100, { motivoPerda: 'Preço: caro' }), p('perdida', 50, { motivoPerda: 'Prazo' }),
    p('rascunho', 9999),
  ]);
  assert.deepEqual(s.byStatus.enviada, { count: 2, value: 2000 });
  assert.deepEqual(s.byStatus.negociacao, { count: 1, value: 2000 });
  assert.equal(s.forecast, 1000 * 0.3 + 1000 * 0.5 + 2000 * 0.6);
  assert.equal(s.winRate, 1 / 4);
  assert.deepEqual(s.lossReasons, [{ motivo: 'Preço', count: 2 }, { motivo: 'Prazo', count: 1 }]);
});

test('funnelSummary period filters by last update and win rate is null without closed deals', () => {
  const old = p('ganha', 1, { updatedAt: '2026-01-01T00:00:00Z' });
  const s = funnelSummary([old, p('enviada', 10)], { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(s.byStatus.ganha.count, 0);
  assert.equal(s.winRate, null);
});

test('validateLoss requires a known reason and min 3 chars', () => {
  assert.ok(LOSS_REASONS.includes('Preço'));
  assert.throws(() => validateLoss('', ''), /motivo/i);
  assert.throws(() => validateLoss('Xyz', 'abc'), /motivo/i);
  assert.equal(validateLoss('Outro', ' sem verba '), 'Outro: sem verba');
  assert.equal(validateLoss('Preço', ''), 'Preço');
});
