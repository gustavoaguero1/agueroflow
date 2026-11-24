import test from 'node:test';
import assert from 'node:assert/strict';
import { splitWorkerPay, mergeWorkerPay } from '../src/services/fieldWorkerPay';
import { planAccessMigration } from '../src/services/fieldWorkerPay';

test('equipe de campo não guarda salário: vai para field_worker_pay', () => {
  const { worker, pay } = splitWorkerPay({
    id: 'fw1', orgId: 'o', name: 'Ana', hourlyRate: 15, baseSalary: 3300,
    salaryHistory: [{ date: 'd', previousSalary: 0, newSalary: 3300 }],
  });
  assert.equal(worker.baseSalary, 0);
  assert.equal('salaryHistory' in worker, false);
  assert.equal(worker.hourlyRate, 15); // custo de mão de obra do RDO (decisão registrada)
  assert.deepEqual(pay, { orgId: 'o', baseSalary: 3300, salaryHistory: [{ date: 'd', previousSalary: 0, newSalary: 3300 }] });
});

test('sem salário informado não cria registro de salário', () => {
  assert.equal(splitWorkerPay({ id: 'fw1', orgId: 'o', name: 'Ana', hourlyRate: 15 }).pay, null);
});

test('quem tem RH vê o salário de volta na lista; quem não tem vê zero', () => {
  const ws = [{ id: 'a', baseSalary: 0 }, { id: 'b', baseSalary: 0 }];
  const merged = mergeWorkerPay(ws, new Map([['a', { baseSalary: 4000, salaryHistory: [] }]]));
  assert.equal(merged[0].baseSalary, 4000);
  assert.equal(merged[1].baseSalary, 0);
});

test('migração: tira salário da equipe de campo e completa o diretório', () => {
  const ops = planAccessMigration({
    employees: [{ id: 'e1', orgId: 'o', name: 'Ana', role: 'R', active: true, baseSalaryCarteira: 1 } as never],
    directoryIds: new Set<string>(),
    workers: [
      { id: 'fw1', orgId: 'o', name: 'Ana', baseSalary: 3000, salaryHistory: [] },
      { id: 'fw2', orgId: 'o', name: 'Bia', baseSalary: 0 },
    ],
  });
  assert.deepEqual(ops.map((o) => `${o.kind}:${o.path}`).sort(), [
    'set:field_worker_pay/fw1', 'set:rh_directory/e1', 'strip:field_workers/fw1',
  ]);
  const dir = ops.find((o) => o.path === 'rh_directory/e1')!;
  assert.equal('baseSalaryCarteira' in (dir.data as object), false);
});

test('migração já feita não faz nada', () => {
  const ops = planAccessMigration({
    employees: [{ id: 'e1', orgId: 'o', name: 'Ana' } as never],
    directoryIds: new Set(['e1']),
    workers: [{ id: 'fw2', orgId: 'o', name: 'Bia', baseSalary: 0 }],
  });
  assert.deepEqual(ops, []);
});
