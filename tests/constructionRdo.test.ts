import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRdoReportNumber,
  localDateInputValue,
  parseOptionalRdoProgress,
  prepareRdoFieldRecords,
  type RdoEquipmentDraft,
} from '../src/services/constructionRdo';

test('ignora linhas de equipe em branco sem criar profissionais', () => {
  const result = prepareRdoFieldRecords(
    [{ role: 'Soldador TIG', count: '', hours: '' }],
    [],
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.workforce, []);
  assert.equal(result.totalPersonHours, 0);
});

test('preserva quantidade e horas por profissional informadas', () => {
  const result = prepareRdoFieldRecords(
    [
      { role: 'Caldeireiro', count: '2', hours: '8.5' },
      { role: 'Soldador TIG', count: '3', hours: '7.75' },
    ],
    [],
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.workforce, [
    { role: 'Caldeireiro', count: 2, hours: 8.5 },
    { role: 'Soldador TIG', count: 3, hours: 7.75 },
  ]);
  assert.equal(result.totalPersonHours, 40.25);
});

test('exige horas quando existe profissional informado', () => {
  const result = prepareRdoFieldRecords(
    [{ role: 'Montador', count: '2', hours: '' }],
    [],
  );

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /horas por profissional/);
});

test('rejeita quantidade fracionada, negativa ou acima do limite', () => {
  for (const count of ['1.5', '-1', '501', 'abc']) {
    const result = prepareRdoFieldRecords(
      [{ role: 'Ajudante', count, hours: '8' }],
      [],
    );
    assert.equal(result.valid, false, `count=${count}`);
  }
});

test('preserva quantidade explicitamente informada como zero', () => {
  const result = prepareRdoFieldRecords(
    [
      { role: 'Caldeireiro', count: '0', hours: '' },
      { role: 'Soldador TIG', count: '', hours: '' },
    ],
    [],
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.workforce, [
    { role: 'Caldeireiro', count: 0, hours: 0 },
  ]);
});

test('não aceita horas de equipe sem quantidade de profissionais', () => {
  const result = prepareRdoFieldRecords(
    [{ role: 'Supervisor', count: '0', hours: '8' }],
    [],
  );

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /quantidade.*zero/i);
});

test('rejeita horas por profissional fora do intervalo permitido', () => {
  for (const hours of ['0', '-1', '24.1', 'abc']) {
    const result = prepareRdoFieldRecords(
      [{ role: 'Soldador', count: '1', hours }],
      [],
    );
    assert.equal(result.valid, false, `hours=${hours}`);
  }
});

test('ignora lista de equipamentos vazia', () => {
  const result = prepareRdoFieldRecords([], []);
  assert.equal(result.valid, true);
  assert.deepEqual(result.equipment, []);
});

test('preserva equipamento, quantidade e horas reais informadas', () => {
  const equipment: RdoEquipmentDraft[] = [
    { name: 'Inversora TIG Miller', quantity: '2', operationalHours: '6.5' },
    { name: 'Plataforma elevatória', quantity: '1', operationalHours: '0' },
  ];
  const result = prepareRdoFieldRecords([], equipment);

  assert.equal(result.valid, true);
  assert.deepEqual(result.equipment, [
    { name: 'Inversora TIG Miller', quantity: 2, operationalHours: 6.5 },
    { name: 'Plataforma elevatória', quantity: 1, operationalHours: 0 },
  ]);
});

test('rejeita linha de equipamento incompleta ou inválida', () => {
  const invalidRows: RdoEquipmentDraft[][] = [
    [{ name: 'Inversora', quantity: '', operationalHours: '6' }],
    [{ name: 'Inversora', quantity: '0', operationalHours: '6' }],
    [{ name: 'I', quantity: '1', operationalHours: '6' }],
    [{ name: 'Inversora', quantity: '1.5', operationalHours: '6' }],
    [{ name: 'Inversora', quantity: '1', operationalHours: '25' }],
  ];

  for (const rows of invalidRows) {
    assert.equal(prepareRdoFieldRecords([], rows).valid, false);
  }
});

test('avanço diário vazio significa não informado, e não 0%', () => {
  assert.deepEqual(parseOptionalRdoProgress(''), {});
  assert.deepEqual(parseOptionalRdoProgress('   '), {});
  assert.deepEqual(parseOptionalRdoProgress('0'), { value: 0 });
  assert.deepEqual(parseOptionalRdoProgress('37.5'), { value: 37.5 });
});

test('rejeita avanço diário fora de 0 a 100', () => {
  for (const value of ['-1', '100.1', 'abc']) {
    assert.match(parseOptionalRdoProgress(value).error || '', /entre 0% e 100%/);
  }
});

test('usa data local sem deslocamento UTC', () => {
  const date = new Date(2026, 10, 24, 23, 30);
  assert.equal(localDateInputValue(date), '2026-11-24');
});

test('gera número de RDO único a partir do id do documento', () => {
  assert.equal(
    buildRdoReportNumber('2026-11-24', 'a1b2c3d4e5f6g7h8'),
    'RDO-2026-E5F6G7H8',
  );
  assert.notEqual(
    buildRdoReportNumber('2026-11-24', 'a1b2c3d4e5f6g7h8'),
    buildRdoReportNumber('2026-11-24', 'z1b2c3d4e5f6g7h9'),
  );
  assert.throws(() => buildRdoReportNumber('2026-02-30', 'a1b2c3d4e5f6g7h8'));
});

test('total de horas-homem é calculado sem arredondar horas individuais', () => {
  const result = prepareRdoFieldRecords(
    [
      { role: 'Caldeireiro', count: '2', hours: '8.33' },
      { role: 'Soldador', count: '1', hours: '7.25' },
    ],
    [],
  );
  assert.equal(result.valid, true);
  assert.equal(result.totalPersonHours, 23.91);
});
