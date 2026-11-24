import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// "Saiu da empresa" (moverParaIndicacoes) dentro do AgueroFlow: o desligamento é no RH.
const html = readFileSync(process.env.OPS_HTML || 'public/operacoes/index.html', 'utf8');
const src = html.match(/async function moverParaIndicacoes\([^)]*\)\{[\s\S]*?\n(?=function )/)![0];

function run(status: string) {
  const writes: string[] = [];
  const toasts: string[] = [];
  const went: string[] = [];
  const ctx: Record<string, unknown> = {
    S: { colab: [{ id: 'c-ana', nome: 'Ana', status, obraAtual: 'o1' }], me: { isG: false }, sal: {}, obras: [], view: { b: { saida: {} } } },
    db: {
      doc: (p: string) => ({
        set: async () => { writes.push(`set ${p}`); },
        update: async (d: object) => { writes.push(`update ${p} ${JSON.stringify(d)}`); },
        delete: async () => { writes.push(`delete ${p}`); },
      }),
    },
    save: async (fn: () => Promise<unknown>) => { await fn(); return true; },
    toast: (m: string) => toasts.push(m),
    render: () => {},
    num: (v: unknown) => (v == null || v === '' ? null : Number(v)),
    brl: String, hojeISO: () => '2026-11-23',
    clean: (o: object) => o,
    opsVaiPara: (s: string, aviso: string) => { went.push(s); toasts.push(aviso); return true; },
  };
  ctx.window = { parent: {} };
  vm.createContext(ctx);
  vm.runInContext(`${src};this.f=moverParaIndicacoes;`, ctx);
  return { go: () => (ctx.f as Function)('c-ana', 'mudou de cidade', { disabled: false }), writes, toasts, went };
}

test('ainda ativo no RH: leva ao RH e não grava nada (nem diz que deu certo)', async () => {
  const r = run('Ativo');
  await r.go();
  assert.deepEqual(r.went, ['rh-funcionarios']);
  assert.deepEqual(r.writes, []);
  assert.ok(!r.toasts.some((t) => t.includes('foi para Indicações')));
});

test('já desligado no RH: registra a indicação e só tira da obra (não tenta excluir)', async () => {
  const r = run('Desligado');
  await r.go();
  assert.deepEqual(r.went, []);
  assert.equal(r.writes[0], 'set indicacoes/ex-ana');
  assert.equal(r.writes[1], 'update colaboradores/c-ana {"obraAtual":""}');
  assert.equal(r.writes.length, 2);
});
