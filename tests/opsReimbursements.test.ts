import test from 'node:test';
import assert from 'node:assert/strict';
import { loteDaSemana, receiptToReembNota, phoneKey } from '../server/opsReimbursements';

// Semana do Inox: fecha quinta 17:00 (horário de Brasília); o lote é a data da quinta.
test('loteDaSemana: segunda vai para a quinta da mesma semana', () => {
  assert.equal(loteDaSemana('2026-11-23T12:00:00-03:00'), '2026-11-26');
});

test('loteDaSemana: quinta antes das 17h fica na própria quinta', () => {
  assert.equal(loteDaSemana('2026-11-26T16:59:00-03:00'), '2026-11-26');
});

test('loteDaSemana: quinta a partir das 17h vai para a quinta seguinte', () => {
  assert.equal(loteDaSemana('2026-11-26T17:00:00-03:00'), '2026-12-03');
});

test('loteDaSemana: usa o horário de Brasília mesmo vindo em UTC', () => {
  // 2026-11-26 19:30 UTC = 16:30 em Brasília (antes de fechar)
  assert.equal(loteDaSemana('2026-11-26T19:30:00Z'), '2026-11-26');
});

test('phoneKey compara só os últimos 11 dígitos', () => {
  assert.equal(phoneKey('+55 (11) 91234-5678'), phoneKey('11912345678'));
});

const rec = {
  id: 'r1', organizationId: 'org', employeeName: 'Ana', employeePhone: '5511912345678', receiptDate: '2026-11-20',
  establishmentName: 'Posto X', cnpj: '12.345.678/0001-99', category: 'combustivel', totalAmount: 150.5,
  receivedAt: '2026-11-23T12:00:00-03:00', fileUrl: 'https://img/1.jpg', status: 'pendente',
};

test('receiptToReembNota: telefone conhecido vira o colaborador; campos no formato do Inox', () => {
  const n = receiptToReembNota(rec as never, new Map([[phoneKey('11912345678'), 'c-ana']]));
  assert.equal(n.lote, '2026-11-26');
  assert.equal(n.colab, 'c-ana');
  assert.equal(n.dataEnvio, '2026-11-23');
  assert.equal(n.dataNota, '2026-11-20');
  assert.equal(n.valor, 150.5);
  assert.equal(n.cnpj, '12345678000199');
  assert.equal(n.emitente, 'Posto X');
  assert.equal(n.natureza, 'Combustível');
  assert.equal(n.incluir, true);
  assert.equal(n.lido, true);
  assert.equal(n.origem, 'whatsapp');
  assert.deepEqual(n.anexos, [{ nome: 'nota-r1.jpg', tipo: 'image/jpeg', url: 'https://img/1.jpg' }]);
});

test('receiptToReembNota: telefone desconhecido entra sem colaborador (para escolher depois)', () => {
  const n = receiptToReembNota(rec as never, new Map());
  assert.equal(n.colab, '');
  assert.match(String(n.descricao), /Ana/);
});

test('receiptToReembNota: alimentação fica marcada como Alimentação', () => {
  const n = receiptToReembNota({ ...rec, category: 'alimentacao' } as never, new Map());
  assert.equal(n.natureza, 'Alimentação');
});
