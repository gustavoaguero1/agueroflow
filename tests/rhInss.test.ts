import test from 'node:test';
import assert from 'node:assert/strict';
import { calcInss } from '../src/services/inss.ts';

test('INSS 2026 progressivo, ao centavo', () => {
  assert.equal(calcInss(0, 2026), 0);
  // 1621,00 * 7,5% = 121,575 -> 121,58
  assert.equal(calcInss(1621, 2026), 121.58);
  // 1621*7,5% + (2902,84-1621)*9% + (3000-2902,84)*12% = 121,575 + 115,3656 + 11,6592 = 248,5998 -> 248,60
  assert.equal(calcInss(3000, 2026), 248.6);
  // teto 8475,55: 121,575 + 115,3656 + (4354,27-2902,84)*12% 174,1716 + (8475,55-4354,27)*14% 576,9792 = 988,0914 -> 988,09
  assert.equal(calcInss(8475.55, 2026), 988.09);
  // acima do teto: desconto máximo
  assert.equal(calcInss(20000, 2026), 988.09);
});

test('INSS 2025 mantido para histórico', () => {
  // 1518*7,5% + (2793,88-1518)*9% + (3000-2793,88)*12% = 113,85 + 114,8292 + 24,7344 = 253,4136 -> 253,41
  assert.equal(calcInss(3000, 2025), 253.41);
});
