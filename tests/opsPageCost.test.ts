import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Executa as funções de custo da própria página de Operações (public/operacoes/index.html).
const html = readFileSync('public/operacoes/index.html', 'utf8');
const fn = (name: string) => {
  const m = html.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n(?=function |const |async function )`));
  if (!m) throw new Error(`função ${name} não encontrada`);
  return m[0];
};
const ctx: Record<string, unknown> = {
  num: (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)),
  P: () => ({ pjenc: 0.1, folgaDias: 5 }),
  encCLT: () => 0.8,
  folgaDe: () => null,
  folgaPadrao: () => null,
  folgasAno: () => 0,
};
vm.createContext(ctx);
vm.runInContext(`${fn('custoPessoa')};this.custoPessoa=custoPessoa;`, ctx);
const custoPessoa = ctx.custoPessoa as (c: object, s: object) => Record<string, number | boolean>;

test('custoPessoa soma o "Por fora" só pelo valor mensal (sem 13º, férias ou encargos)', () => {
  const sem = custoPessoa({ funcao: 'Soldador' }, { clt: 2500 });
  const com = custoPessoa({ funcao: 'Soldador' }, { clt: 2500, porFora: 800 });
  assert.equal((com.mo as number) - (sem.mo as number), 800);
  assert.equal(com.sal, 3300);
});

test('custoPessoa: quem recebe só "Por fora" não aparece como sem salário', () => {
  const r = custoPessoa({ funcao: 'Ajudante' }, { porFora: 1200 });
  assert.equal(r.semSal, false);
  assert.equal(r.mo, 1200);
});
