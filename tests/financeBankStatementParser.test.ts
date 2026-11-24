import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFinanceBankStatement } from '../src/services/financeBankStatementParser.ts';

test('parses Brazilian CSV with semicolon, quoted descriptions and signed amounts', () => {
  const csv = [
    'Data;Histórico;Valor;Documento',
    '24/11/2026;"PIX TRANSFERENCIA - FORNECEDOR; NF 123";-1.234,56;E2E-123',
    '25/11/2026;Crédito recebido;2500,00;TED-44',
  ].join('\n');
  const rows = parseFinanceBankStatement('extrato.csv', csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    date: '2026-11-24', amount: 1234.56, direction: 'debit',
    description: 'PIX TRANSFERENCIA - FORNECEDOR; NF 123', reference: 'E2E-123', rowNumber: 2,
  });
  assert.equal(rows[1].direction, 'credit');
  assert.equal(rows[1].amount, 2500);
});

test('parses CSV with separate debit and credit columns', () => {
  const csv = [
    'Date,Description,Debit,Credit,Reference',
    '2026-11-24,Fornecedor A,450.75,,PIX-01',
    '2026-11-25,Cliente B,,900.00,TED-02',
  ].join('\n');
  const rows = parseFinanceBankStatement('statement.csv', csv);
  assert.equal(rows[0].direction, 'debit');
  assert.equal(rows[0].amount, 450.75);
  assert.equal(rows[1].direction, 'credit');
  assert.equal(rows[1].amount, 900);
});

test('parses OFX transactions and FITID identifiers', () => {
  const ofx = [
    '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261124120000<TRNAMT>-5400.00<FITID>FIT-001<NAME>Fornecedor A</STMTTRN>',
    '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261125120000<TRNAMT>1200.50<FITID>FIT-002<MEMO>Recebimento cliente</STMTTRN>',
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  ].join('');
  const rows = parseFinanceBankStatement('banco.ofx', ofx);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-11-24');
  assert.equal(rows[0].direction, 'debit');
  assert.equal(rows[0].externalId, 'FIT-001');
  assert.equal(rows[1].direction, 'credit');
  assert.equal(rows[1].description, 'Recebimento cliente');
});

test('rejects unknown CSV headers, invalid rows, unsupported formats and files over 10 MB', () => {
  assert.throws(() => parseFinanceBankStatement('x.csv', 'a;b;c\n1;2;3'), /Não reconheci/);
  assert.throws(() => parseFinanceBankStatement('x.csv', 'Data;Descrição;Valor\n31/02/2026;Fornecedor;-10'), /inválido/);
  assert.throws(() => parseFinanceBankStatement('x.txt', 'plain text'), /Formato não suportado/);
  assert.throws(() => parseFinanceBankStatement('x.csv', 'x'.repeat(10_000_001)), /10 MB/);
});


test('parses OFX SGML blocks without explicit closing tags', () => {
  const ofx = [
    '<OFX><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261124120000<TRNAMT>-99.90<FITID>SGML-1<NAME>Fornecedor A',
    '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261125120000<TRNAMT>120.00<FITID>SGML-2<NAME>Cliente B',
    '</BANKTRANLIST></OFX>',
  ].join('');
  const rows = parseFinanceBankStatement('sgml.ofx', ofx);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].direction, 'debit');
  assert.equal(rows[1].direction, 'credit');
});
