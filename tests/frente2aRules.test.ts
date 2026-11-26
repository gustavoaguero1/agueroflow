import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAvailableDashboardPersonas,
  resolveDefaultDashboardPersona,
} from '../src/services/dashboardPersonaRules.ts';
import { buildActionableNotifications } from '../src/services/actionableNotifications.ts';
import { evaluateSupportTicketSla } from '../src/services/supportSlaRules.ts';

test('dashboardPersonaRules seleciona personas estritamente conforme permissões reais do usuário', () => {
  const finOnly = getAvailableDashboardPersonas({
    areaLevels: { financeiro: 2, operacoes: 0, estoque: 0, rh: 0 },
    role: 'Operacional',
  });
  assert.deepEqual(finOnly, ['financeiro']);
  assert.equal(
    resolveDefaultDashboardPersona({
      areaLevels: { financeiro: 2, operacoes: 0, estoque: 0, rh: 0 },
      role: 'Operacional',
    }),
    'financeiro',
  );

  const masterList = getAvailableDashboardPersonas({
    areaLevels: {},
    role: 'Admin',
    isMaster: true,
  });
  assert.equal(masterList[0], 'gestao');
  assert.equal(masterList.includes('campo'), true);
  assert.equal(masterList.includes('financeiro'), true);
  assert.equal(resolveDefaultDashboardPersona({ areaLevels: {}, isMaster: true }), 'gestao');
});

test('buildActionableNotifications respeita isolamento por área e ordena criticidade', () => {
  const onlyCompras = buildActionableNotifications({
    areaLevels: { estoque: 2, operacoes: 0, rh: 0 },
    todayIso: '2026-11-26',
    workOrders: [{ id: 'wo1', status: 'em_execucao', scheduledEndDate: '2026-11-20' }],
    purchaseOrders: [{ id: 'po1', status: 'emitida' }],
    assets: [{ id: 'a1', calibrationDueDate: '2026-11-30' }],
  });
  assert.equal(onlyCompras.length, 1);
  assert.equal(onlyCompras[0].id, 'pending-po-approvals');

  const fullAccess = buildActionableNotifications({
    areaLevels: { operacoes: 2, estoque: 2, rh: 2 },
    todayIso: '2026-11-26',
    workOrders: [{ id: 'wo1', status: 'em_execucao', scheduledEndDate: '2026-11-20' }],
    safetyPermitStates: [{ id: 'pt1', status: 'pending_approval' }],
    assets: [{ id: 'a1', calibrationDueDate: '2026-12-05' }],
    trainingRecords: [{ id: 'tr1', expirationDate: '2026-12-10' }],
    purchaseOrders: [{ id: 'po1', status: 'emitida' }],
    bulletins: [{ id: 'bm1', status: 'submetido' }],
    supportTickets: [{ id: 'tk1', status: 'aberto' }],
  });
  assert.equal(fullAccess.length, 7);
  assert.equal(fullAccess[0].severity, 'critical');
  assert.equal(fullAccess[fullAccess.length - 1].severity, 'info');
});

test('evaluateSupportTicketSla calcula prazo por prioridade, alerta e estouro corretamente', () => {
  const ok = evaluateSupportTicketSla({
    priority: 'media',
    status: 'aberto',
    createdAt: '2026-11-26T10:00:00.000Z',
    nowIso: '2026-11-26T14:00:00.000Z',
  });
  assert.equal(ok.slaHours, 24);
  assert.equal(ok.status, 'dentro_prazo');

  const breach = evaluateSupportTicketSla({
    priority: 'critica',
    status: 'aberto',
    createdAt: '2026-11-26T08:00:00.000Z',
    nowIso: '2026-11-26T13:30:00.000Z',
  });
  assert.equal(breach.slaHours, 4);
  assert.equal(breach.status, 'estourado');

  const closed = evaluateSupportTicketSla({
    priority: 'alta',
    status: 'resolvido',
    createdAt: '2026-11-20T08:00:00.000Z',
    nowIso: '2026-11-26T13:30:00.000Z',
  });
  assert.equal(closed.status, 'encerrado');
});
