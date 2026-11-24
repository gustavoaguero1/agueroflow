import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// O número do dono não pode ficar salvo no repositório (cada usuário conecta o próprio WhatsApp).
// Guardamos só o hash dos 9 últimos dígitos, para o teste não conter o número.
const FORBIDDEN_HASHES = new Set(['3f17169fc84b54e259d4d71767293500c43889a06c5d8aebad149f4a20e2d637']);
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/g;

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export function containsForbiddenPhone(text: string): boolean {
  for (const m of text.matchAll(PHONE_LIKE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && FORBIDDEN_HASHES.has(hash(digits.slice(-9)))) return true;
  }
  return false;
}

test('detecta o número em qualquer formato', () => {
  const parts = ['9', '1789', '7747'];
  for (const f of [`+55 11 ${parts[0]}${parts[1]}-${parts[2]}`, `5511${parts.join('')}`, `(11) ${parts[0]} ${parts[1]}-${parts[2]}`]) {
    assert.equal(containsForbiddenPhone(f), true, f);
  }
  assert.equal(containsForbiddenPhone('+55 11 91234-5678'), false);
});

test('nenhum arquivo versionado guarda o número (código, dados, docs)', () => {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = tracked.filter((f) => {
    if (!fs.existsSync(f) || /\.(pdf|png|jpe?g|gif|webp|ico|woff2?|zip)$/i.test(f)) return false;
    return containsForbiddenPhone(fs.readFileSync(f, 'utf8'));
  });
  assert.deepEqual(hits, []);
});
