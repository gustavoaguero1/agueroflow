import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('index.html', 'utf8');
const ops = readFileSync('public/operacoes/index.html', 'utf8');
const appCss = readFileSync('src/index.css', 'utf8');

const fontLink = (html: string) => html.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)" rel="stylesheet"/)?.[1];

test('Operações carrega a mesma fonte web do app (Plus Jakarta Sans fora do Mac)', () => {
  const appFonts = fontLink(app);
  assert.ok(appFonts, 'o app deveria carregar as fontes do Google');
  assert.equal(fontLink(ops), appFonts);
});

test('Operações usa a mesma pilha de fontes do app', () => {
  const appStack = appCss.match(/--font-sans:\s*([^;]+);/)?.[1].trim();
  const theme = ops.slice(ops.indexOf('<style id="agueroflow-theme">'));
  const opsStack = theme.match(/--display:\s*([^;]+);/)?.[1].trim();
  assert.ok(appStack);
  assert.equal(opsStack, appStack);
});

test('botão secundário de Operações segue o do app: fundo cinza, sem borda', () => {
  const theme = ops.slice(ops.indexOf('<style id="agueroflow-theme">'));
  const btn = theme.match(/\n\.btn\{([^}]+)\}/)?.[1] || '';
  assert.match(btn, /background:var\(--btn2\)/);
  assert.match(btn, /border:1px solid transparent/);
  assert.match(btn, /font-size:12px/);
});
