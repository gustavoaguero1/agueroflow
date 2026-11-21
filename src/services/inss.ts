// ============================================================================
// TABELA OFICIAL PROGRESSIVA DO INSS (Vigência 2025 / Portaria Interministerial)
// ============================================================================
export interface InssBracketConfig {
  min: number;
  max: number;
  rate: number;
}

export const OFFICIAL_INSS_BRACKETS_2025: InssBracketConfig[] = [
  { min: 0, max: 1518.0, rate: 0.075 },
  { min: 1518.0, max: 2793.88, rate: 0.09 },
  { min: 2793.88, max: 4190.83, rate: 0.12 },
  { min: 4190.83, max: 8157.41, rate: 0.14 },
];

export const OFFICIAL_INSS_BRACKETS_2026: InssBracketConfig[] = [
  { min: 0, max: 1621.0, rate: 0.075 },
  { min: 1621.0, max: 2902.84, rate: 0.09 },
  { min: 2902.84, max: 4354.27, rate: 0.12 },
  { min: 4354.27, max: 8475.55, rate: 0.14 },
];

export const INSS_CEILING_2025 = 8157.41;
export const INSS_CEILING_2026 = 8475.55;

/** Tabelas por ano-calendário (2025 mantida para histórico). */
export const INSS_TABLES: Record<number, InssBracketConfig[]> = {
  2025: OFFICIAL_INSS_BRACKETS_2025,
  2026: OFFICIAL_INSS_BRACKETS_2026,
};

/** Tabela do ano; anos sem tabela usam a mais recente anterior (ou a mais antiga). */
export function getInssBrackets(year: number): InssBracketConfig[] {
  const years = Object.keys(INSS_TABLES).map(Number).sort((a, b) => a - b);
  const y = [...years].reverse().find((k) => k <= year) ?? years[0];
  return INSS_TABLES[y];
}

/**
 * Cálculo progressivo oficial do INSS por faixa salarial.
 * Atende estritamente à legislação previdenciária brasileira (EC 103/2019).
 * Nunca utiliza alíquota fixa arbitrária.
 */
export function calculateProgressiveInss(grossThirteenthBase: number, year = 2026): {
  inssAmount: number;
  effectiveRate: number;
} {
  if (grossThirteenthBase <= 0) {
    return { inssAmount: 0, effectiveRate: 0 };
  }

  const brackets = getInssBrackets(year);
  const cappedBase = Math.min(grossThirteenthBase, brackets[brackets.length - 1].max);
  let totalTax = 0;

  for (const bracket of brackets) {
    if (cappedBase > bracket.min) {
      const taxableSlice = Math.min(cappedBase, bracket.max) - bracket.min;
      totalTax += taxableSlice * bracket.rate;
    }
  }

  const inssAmount = Math.round(Number(totalTax.toFixed(6)) * 100) / 100; // toFixed(6) absorve ruído de ponto flutuante (121,575 -> 121,58)
  const effectiveRate = grossThirteenthBase > 0 ? (inssAmount / grossThirteenthBase) * 100 : 0;

  return {
    inssAmount,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
  };
}

/** Desconto de INSS (R$) sobre o salário no ano informado. */
export const calcInss = (salary: number, year = 2026): number => calculateProgressiveInss(salary, year).inssAmount;

