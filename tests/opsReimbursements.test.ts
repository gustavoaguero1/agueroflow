import test from 'node:test';
import assert from 'node:assert/strict';
import { loteDaSemana, receiptToReembNota, phoneKey, mirrorReceiptsToOps } from '../server/opsReimbursements';

/** Firestore falso: guarda os docs gravados por caminho. */
function fakeDb(colabs: Record<string, Array<{ id: string; telefone?: string }>> = {}) {
  const written = new Map<string, Record<string, unknown>>();
  const images = new Map<string, { base64: string; mimeType: string }>();
  const db = {
    collection: (path: string) => ({
      get: async () => ({ docs: (colabs[path] || []).map((c) => ({ id: c.id, get: (k: string) => (c as Record<string, unknown>)[k] })) }),
    }),
    doc: (path: string) => ({ path, get: async () => ({ exists: images.has(path), data: () => images.get(path) }) }),
    batch: () => {
      const ops: Array<[string, Record<string, unknown>]> = [];
      return { set: (ref: { path: string }, data: Record<string, unknown>) => ops.push([ref.path, data]), commit: async () => ops.forEach(([p, d]) => written.set(p, d)) };
    },
  };
  return { db: db as never, written, images };
}

const base = { employeeName: 'Ana', employeePhone: '5511912345678', receiptDate: '2026-11-20', establishmentName: 'Posto', category: 'combustivel', totalAmount: 10, receivedAt: '2026-11-23T12:00:00-03:00', status: 'pendente', source: 'whatsapp_real', imageStatus: 'salva' };

test('mirror: empresa antiga/ausente vai para a empresa real (effectiveOrg), nunca é pulada', async () => {
  const { db, written } = fakeDb();
  const resolveOrg = (id?: string) => (!id || id === 'org_aguero_default' ? 'org_real' : id);
  const n = await mirrorReceiptsToOps(db, [{ ...base, id: 'r1', organizationId: 'org_aguero_default' }, { ...base, id: 'r2', organizationId: '' }] as never, { resolveOrg });
  assert.equal(n, 2);
  assert.ok(written.has('ops_orgs/org_real/reemb_notas/wa_r1'));
  assert.ok(written.has('ops_orgs/org_real/reemb_notas/wa_r2'));
});

test('mirror: a foto salva do recibo vai para o Storage e entra nos anexos', async () => {
  const { db, written, images } = fakeDb();
  images.set('receipt_images/r1', { base64: 'AAAA', mimeType: 'image/png' });
  const uploads: string[] = [];
  const uploadImage = async (path: string) => { uploads.push(path); return `https://storage/${path}`; };
  await mirrorReceiptsToOps(db, [{ ...base, id: 'r1', organizationId: 'org' }] as never, { resolveOrg: (x) => x || 'org', uploadImage });
  assert.deepEqual(uploads, ['operacoes/org/wa_r1.png']);
  const nota = written.get('ops_orgs/org/reemb_notas/wa_r1')!;
  assert.deepEqual(nota.anexos, [{ nome: 'nota-r1.png', tipo: 'image/png', url: 'https://storage/operacoes/org/wa_r1.png' }]);
});

test('mirror: recibo recém-chegado ainda sem situação da foto espera a próxima gravação', async () => {
  const { db, written } = fakeDb();
  const now = new Date('2026-11-23T15:00:30Z');
  const n = await mirrorReceiptsToOps(db, [{ ...base, id: 'r1', organizationId: 'org', imageStatus: undefined, receivedAt: '2026-11-23T15:00:00Z' }] as never, { resolveOrg: (x) => x || 'org', now });
  assert.equal(n, 0);
  assert.equal(written.size, 0);
});

test('receiptToReembNota: recibo já reembolsado ou rejeitado não entra para pagar de novo', () => {
  assert.equal(receiptToReembNota({ ...base, id: 'r1', organizationId: 'o', reimbursedAt: '2026-11-10T10:00:00Z' } as never, new Map()).incluir, false);
  assert.equal(receiptToReembNota({ ...base, id: 'r2', organizationId: 'o', status: 'rejeitado' } as never, new Map()).incluir, false);
  assert.equal(receiptToReembNota({ ...base, id: 'r3', organizationId: 'o', status: 'pendente' } as never, new Map()).incluir, true);
});

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
