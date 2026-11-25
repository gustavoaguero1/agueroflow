import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canShipFabricationOrder,
  computeFabricationMetrics,
  normalizeFabricationRouting,
} from '../src/services/manufacturingRules.ts';

test('normalizeFabricationRouting valida estágios e marca inspeção como ponto de parada (Hold)', () => {
  const routing = normalizeFabricationRouting([
    { stage: 'corte', description: 'Corte tubo 316L', plannedHours: 2 },
    { stage: 'inspecao', description: 'Inspeção final', plannedHours: 1 },
  ]);
  assert.equal(routing.length, 2);
  assert.equal(routing[1].isHoldPoint, true);
  assert.throws(() => normalizeFabricationRouting([{ stage: 'invalido' as any }]));
});

test('canShipFabricationOrder bloqueia expedição enquanto houver operação ou inspeção pendente', () => {
  const routing = normalizeFabricationRouting([
    { stage: 'corte', description: 'Corte', plannedHours: 2, status: 'concluida', actualHours: 2, goodQty: 10 },
    { stage: 'inspecao', description: 'Inspeção END', plannedHours: 1, status: 'pendente' },
  ]);
  const blocked = canShipFabricationOrder({ status: 'em_fabricacao', routing });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.blockers[0].includes('Inspeção END'));

  routing[1].status = 'concluida';
  const ok = canShipFabricationOrder({ status: 'liberada_expedicao', routing });
  assert.equal(ok.allowed, true);

  const metrics = computeFabricationMetrics({ routing });
  assert.equal(metrics.progressPct, 100);
  assert.equal(metrics.totalGoodQty, 10);
});
