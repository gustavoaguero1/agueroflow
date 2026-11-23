import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CommercialClient,
  CommercialMaterial,
  CommercialProposal,
  CommercialProposalItem,
  CommercialPolicy,
  CommercialImportBatch,
  CommercialItemMatchClassification,
  PriceSourceType,
  ExtractedSupplierQuote,
  ExtractedQuoteItem,
  ImportItemDiff,
  ImportActionDecision,
  MaterialPreviousSnapshot,
  ImportedItemAuditRecord,
} from '../types/commercial';
import { apiFetch } from '../apiAuthFetch';

// Helper to remove undefined fields for Firestore
function cleanFirestoreData<T extends Record<string, any>>(data: T): Partial<T> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = cleanFirestoreData(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as Partial<T>;
}

// Deterministic Currency & Markup Calculation
// Mandatory test: Cost R$ 100.00 with 25% markup = R$ 125.00
export function roundToTwoDecimals(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calculateProposedPrice(
  baseCost: number,
  markupPercent: number,
  freightComponent: number = 0,
  taxComponent: number = 0
): number {
  if (baseCost <= 0 || markupPercent < 0) return 0;
  // Preço proposto = custo-base × (1 + markup ÷ 100) + frete + impostos
  const markedUp = baseCost * (1 + markupPercent / 100);
  const total = markedUp + freightComponent + taxComponent;
  return roundToTwoDecimals(total);
}

// Check if material quote is still valid based on its quoteDate and validityDays
export function isQuoteValid(quoteDateStr: string, validityDays: number): boolean {
  if (!quoteDateStr) return false;
  try {
    const qDate = new Date(quoteDateStr);
    const now = new Date();
    const diffTime = now.getTime() - qDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= validityDays;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// STRICT INTERNAL DATABASE MATCHING ENGINE
// Order:
// 1. Exact internal code
// 2. Exact manufacturer code with compatible brand/specs
// 3. Precise industrial domain matcher (União, Curva, Tê, Niple, Tubo, etc.)
// 4. Confirmed valid internal quote
// 5. Exact historical purchase
// 6. Comparable item with strictly identical product category/type
// 7. Not found — requires quote
// -------------------------------------------------------------

function extractProductFamily(text: string): string {
  const t = (text || '').toLowerCase();
  if (t.includes('uniao') || t.includes('união') || t.includes('sms')) return 'uniao';
  if (t.includes('curva') || t.includes('cotovelo') || t.includes('elbow')) return 'curva';
  if (t.includes('te ') || t.includes('tê') || t.includes('treto') || t.includes('treducao') || t.includes('tredução') || t.includes('tee')) return 'te';
  if (t.includes('niple') || t.includes('nipple') || t.includes('tri-clamp') || t.includes('triclamp') || t.includes('tc')) return 'niple';
  if (t.includes('tubo') || t.includes('tubulacao') || t.includes('pipe') || t.includes('tubulação')) return 'tubo';
  if (t.includes('valvula') || t.includes('válvula') || t.includes('valve') || t.includes('borboleta') || t.includes('esfera')) return 'valvula';
  if (t.includes('flange') || t.includes('weld neck') || t.includes('wn')) return 'flange';
  return 'outro';
}

export function matchBomItemAgainstCatalog(
  inputCode: string | undefined,
  inputManufacturerCode: string | undefined,
  inputBrand: string | undefined,
  inputDescription: string,
  inputSpecs: string | undefined,
  inputUnit: string,
  catalog: CommercialMaterial[],
  defaultMarkupPercent: number = 25
): {
  classification: CommercialItemMatchClassification;
  matchedMaterial?: CommercialMaterial;
  priceSourceType?: PriceSourceType;
  baseCost: number;
  markupPercent: number;
  proposedUnitPrice: number;
  differences?: string;
  isPriceExpired?: boolean;
} {
  // Combine custom catalog with benchmark catalog safely (preventing undefined trim crashes)
  const effectiveCatalog = (catalog && catalog.length > 0)
    ? [
        ...catalog,
        ...STANDARD_INDUSTRIAL_CATALOG.filter(
          (s) => !catalog.some((c) => (c.internalCode || '').trim().toLowerCase() === s.internalCode.toLowerCase())
        ),
      ]
    : STANDARD_INDUSTRIAL_CATALOG;

  const normInputCode = (inputCode || '').trim().toLowerCase();
  const normMfgCode = (inputManufacturerCode || '').trim().toLowerCase();
  const normBrand = (inputBrand || '').trim().toLowerCase();
  const normDesc = inputDescription.trim().toLowerCase();
  const normSpecs = (inputSpecs || '').trim().toLowerCase();
  const allText = `${normInputCode} ${normDesc} ${normSpecs}`.toLowerCase();
  const inputFamily = extractProductFamily(allText);

  const isAlphanumericCode = (code: string | undefined): boolean => {
    if (!code) return false;
    const stripped = code.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return stripped.length >= 3 && stripped !== 'scod' && stripped !== 'semcod';
  };

  const isFamilyCompatible = (catItem: CommercialMaterial): boolean => {
    if (!catItem) return false;
    const catFamily = extractProductFamily(`${catItem.internalCode || ''} ${catItem.originalDescription || ''} ${catItem.category || ''}`);
    if (inputFamily !== 'outro' && catFamily !== 'outro' && inputFamily !== catFamily) {
      if (inputFamily === 'tubo' && ['uniao', 'curva', 'te', 'niple', 'valvula', 'flange'].includes(catFamily)) return false;
      if (['uniao', 'curva', 'te', 'niple', 'valvula', 'flange'].includes(inputFamily) && catFamily === 'tubo') return false;
      if (inputFamily !== catFamily) return false;
    }
    return true;
  };

  // 1. Exact internal code match (only if valid alphanumeric code, not '-' or empty)
  if (isAlphanumericCode(normInputCode)) {
    const strippedInput = normInputCode.replace(/[^a-z0-9]/g, '');
    const match = effectiveCatalog.find((m) => {
      if (!isAlphanumericCode(m.internalCode)) return false;
      const strippedM = m.internalCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (strippedM !== strippedInput) return false;
      return isFamilyCompatible(m);
    });
    if (match) {
      const expired = !isQuoteValid(match.quoteDate, match.validityDays);
      const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
      return {
        classification: 'EXATO',
        matchedMaterial: match,
        priceSourceType: 'codigo_interno_exato',
        baseCost: match.baseCost,
        markupPercent: defaultMarkupPercent,
        proposedUnitPrice: proposedUnit,
        isPriceExpired: expired,
      };
    }
  }

  // 2. Exact manufacturer code match with compatible brand/spec
  if (isAlphanumericCode(normMfgCode)) {
    const match = effectiveCatalog.find((m) => {
      const mfg = (m.manufacturerCode || '').trim().toLowerCase();
      if (!mfg || mfg !== normMfgCode) return false;
      if (normBrand && m.brand) {
        if (m.brand.trim().toLowerCase() !== normBrand) return false;
      }
      return isFamilyCompatible(m);
    });

    if (match) {
      const expired = !isQuoteValid(match.quoteDate, match.validityDays);
      const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
      return {
        classification: 'EXATO',
        matchedMaterial: match,
        priceSourceType: 'codigo_fabricante_exato',
        baseCost: match.baseCost,
        markupPercent: defaultMarkupPercent,
        proposedUnitPrice: proposedUnit,
        isPriceExpired: expired,
      };
    }
  }

  // 3. Domain-specific industrial fittings precision matching (OrçaÁgil)
  // Ensures distinct materials get their precise prices instead of defaulting to 120.00 or tubing
  const textWithoutFractions = allText.replace(/1[.\s/-]*1\/2/g, ' ').replace(/1\/2/g, ' ').replace(/1½/g, ' ');
  const has15Inch = allText.includes('1.1/2') || allText.includes('1 1/2') || allText.includes('1-1/2') || allText.includes('1½') || allText.includes('38');
  const has4Inch = textWithoutFractions.includes('4"') || textWithoutFractions.includes("4'") || textWithoutFractions.includes('4 pol') || textWithoutFractions.includes('dn100') || /\b4\b/.test(textWithoutFractions);
  const has3Inch = textWithoutFractions.includes('3"') || textWithoutFractions.includes("3'") || textWithoutFractions.includes('3 pol') || textWithoutFractions.includes('dn76') || /\b3\b/.test(textWithoutFractions);
  const has2Inch = textWithoutFractions.includes('2"') || textWithoutFractions.includes("2'") || textWithoutFractions.includes('2 pol') || textWithoutFractions.includes('dn50') || /\b2\b/.test(textWithoutFractions);
  const isReduction = allText.includes('reducao') || allText.includes('redução') || allText.includes('treducao') || allText.includes('tredução') || /\d+[\s'"]*x[\s'"]*\d+/i.test(allText);

  if (inputFamily === 'curva' && (allText.includes('90') || allText.includes('od') || allText.includes('curva') || allText.includes('cotovelo'))) {
    if (has4Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'CUR-OD90-304-4' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    if (has3Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'CUR-OD90-304-3' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    if (has15Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'CUR-OD90-304-15' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    // Default 2" curve
    const match = effectiveCatalog.find((m) => (m.internalCode === 'CUR-OD90-304-2' || m.internalCode === 'CUR-90-304-2-S10') && isFamilyCompatible(m));
    if (match) {
      const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
      return {
        classification: 'EXATO',
        matchedMaterial: match,
        priceSourceType: 'codigo_interno_exato',
        baseCost: match.baseCost,
        markupPercent: defaultMarkupPercent,
        proposedUnitPrice: proposedUnit,
        isPriceExpired: false,
      };
    }
  }

  if (inputFamily === 'te') {
    // Tê de redução 3" x 1.1/2"
    if (has3Inch && (has15Inch || isReduction)) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'TEE-RED-304-3X15' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    // Tê de redução 2" x 1.1/2"
    if (has2Inch && (has15Inch || isReduction)) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'TEE-RED-304-2X15' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    // Tê reto 3"
    if (has3Inch && !isReduction) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'TEE-RET-304-3' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    // Tê reto 2"
    if (has2Inch && !isReduction) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'TEE-RET-304-2' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }
  }

  if (inputFamily === 'niple' && (allText.includes('tc') || allText.includes('clamp') || allText.includes('niple') || allText.includes('tri-clamp'))) {
    if (has3Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'NIP-TC-304-3' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    if (has2Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'NIP-TC-304-2' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    if (has15Inch || !has2Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'NIP-TC-304-15' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }
  }

  if (inputFamily === 'uniao') {
    // União 3"
    if (has3Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'UNI-SMS-304-3' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    // União 1.1/2"
    if (has15Inch && !has2Inch && !has3Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'UNI-SMS-304-15' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }

    // União 2"
    if (has2Inch || !has3Inch) {
      const match = effectiveCatalog.find((m) => m.internalCode === 'UNI-SMS-304-2' && isFamilyCompatible(m));
      if (match) {
        const proposedUnit = calculateProposedPrice(match.baseCost, defaultMarkupPercent, match.freightCost, match.taxCost);
        return {
          classification: 'EXATO',
          matchedMaterial: match,
          priceSourceType: 'codigo_interno_exato',
          baseCost: match.baseCost,
          markupPercent: defaultMarkupPercent,
          proposedUnitPrice: proposedUnit,
          isPriceExpired: false,
        };
      }
    }
  }

  // 4. Confirmed valid internal quote matching description/specs
  const confirmedQuotes = effectiveCatalog.filter(
    (m) => m.sourceType === 'cotacao_confirmada' && isQuoteValid(m.quoteDate, m.validityDays)
  );
  for (const m of confirmedQuotes) {
    const targetDesc = m.normalizedDescription.toLowerCase();
    if (targetDesc === normDesc || (normDesc.length > 5 && targetDesc.includes(normDesc))) {
      const proposedUnit = calculateProposedPrice(m.baseCost, defaultMarkupPercent, m.freightCost, m.taxCost);
      return {
        classification: 'EXATO',
        matchedMaterial: m,
        priceSourceType: 'cotacao_confirmada',
        baseCost: m.baseCost,
        markupPercent: defaultMarkupPercent,
        proposedUnitPrice: proposedUnit,
        isPriceExpired: false,
      };
    }
  }

  // 5. Exact historical purchase
  const historicalPurchases = effectiveCatalog.filter((m) => m.sourceType === 'compra_historica');
  for (const m of historicalPurchases) {
    const targetDesc = m.normalizedDescription.toLowerCase();
    if (targetDesc === normDesc) {
      const expired = !isQuoteValid(m.quoteDate, m.validityDays);
      const proposedUnit = calculateProposedPrice(m.baseCost, defaultMarkupPercent, m.freightCost, m.taxCost);
      return {
        classification: 'EXATO',
        matchedMaterial: m,
        priceSourceType: 'compra_historica',
        baseCost: m.baseCost,
        markupPercent: defaultMarkupPercent,
        proposedUnitPrice: proposedUnit,
        isPriceExpired: expired,
      };
    }
  }

  // 6. Comparable item (matching critical dimensions/grade AND strictly SAME PRODUCT FAMILY)
  for (const m of effectiveCatalog) {
    const candidateFamily = extractProductFamily((m.originalDescription || '') + ' ' + (m.internalCode || ''));
    if (inputFamily !== 'outro' && candidateFamily !== inputFamily) {
      continue; // NEVER allow cross-family pollution (e.g., Curva or Tê matching União or Tubo)
    }

    const specs = m.technicalSpecs || {};
    const gradeStr = (specs.materialGrade || '').trim().toLowerCase();
    const dimStr = (specs.dimension || '').trim().toLowerCase();

    const sameGrade = gradeStr.length >= 2 && (normSpecs.includes(gradeStr) || normDesc.includes(gradeStr));
    const sameDimension = dimStr.length >= 2 && (normSpecs.includes(dimStr) || normDesc.includes(dimStr));

    if (sameGrade && sameDimension) {
      const expired = !isQuoteValid(m.quoteDate, m.validityDays);
      const proposedUnit = calculateProposedPrice(m.baseCost, defaultMarkupPercent, m.freightCost, m.taxCost);
      const diffNotes = `Item de referência ${m.internalCode} (${specs.materialGrade || ''} ${specs.dimension || ''}). Requer validação técnica de acabamento/norma.`;
      return {
        classification: 'COMPARAVEL',
        matchedMaterial: m,
        priceSourceType: 'item_comparavel',
        baseCost: m.baseCost,
        markupPercent: defaultMarkupPercent,
        proposedUnitPrice: proposedUnit,
        differences: diffNotes,
        isPriceExpired: expired,
      };
    }
  }

  // 6.5. Delegate to intelligent multi-token and dimension matcher
  const bestMatch = findBestCatalogMatch(
    {
      id: 'lookup_temp',
      internalCode: inputCode,
      manufacturerCode: inputManufacturerCode,
      description: inputDescription,
      unit: inputUnit,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      category: 'Geral',
    },
    effectiveCatalog
  );
  if (bestMatch && bestMatch.baseCost > 0) {
    const expired = !isQuoteValid(bestMatch.quoteDate, bestMatch.validityDays);
    const proposedUnit = calculateProposedPrice(bestMatch.baseCost, defaultMarkupPercent, bestMatch.freightCost, bestMatch.taxCost);
    return {
      classification: 'EXATO',
      matchedMaterial: bestMatch,
      priceSourceType: 'codigo_interno_exato',
      baseCost: bestMatch.baseCost,
      markupPercent: defaultMarkupPercent,
      proposedUnitPrice: proposedUnit,
      isPriceExpired: expired,
    };
  }

  // 7. Not found — NEVER zero cost as confirmed price, NEVER disappears
  return {
    classification: 'NAO_ENCONTRADO',
    baseCost: 0,
    markupPercent: defaultMarkupPercent,
    proposedUnitPrice: 0,
    differences: 'Nenhum material correspondente no catálogo interno. Necessária solicitação de cotação ou indicação de substituto aprovado.',
  };
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// SPREADSHEET PARSING & BOM CONSOLIDATION
// -------------------------------------------------------------

/**
 * Robust parser for Brazilian currency and numeric formats:
 * Handles: 85.5, "85,50", "R$ 85,50", "1.250,50", "1,250.50", "R$ 1.250,00"
 */
export function parsePriceOrNumber(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') {
    return !isNaN(val) && isFinite(val) ? val : undefined;
  }
  let str = String(val).trim();
  if (!str) return undefined;

  // Remove common currency symbols and spaces
  str = str.replace(/^(?:R\$|US\$|BRL|USD|EUR|€|\$)\s*/i, '');
  str = str.replace(/\s*(?:reais|brl|usd|eur)$/i, '');
  str = str.replace(/\s+/g, '').trim();

  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Brazilian format (dots are thousands, comma is decimal: "1.250,50")
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US format (commas are thousands, dot is decimal: "1,250.50")
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Single comma: "85,50" -> "85.50"
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return !isNaN(num) && isFinite(num) ? Math.round((num + Number.EPSILON) * 10000) / 10000 : undefined;
}

export interface ParsedBomRow {
  lineNumber: number;
  code?: string;
  manufacturerCode?: string;
  brand?: string;
  description: string;
  specs?: string;
  unit: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  supplierName?: string;
  validityDays?: number;
  category?: string;
  hasQuantityWarning?: boolean;
}

export function parseBomSpreadsheet(
  dataBuffer: ArrayBuffer,
  fileName: string
): {
  rows: ParsedBomRow[];
  totalRead: number;
  duplicateCount: number;
  incompleteCount: number;
} {
  const workbook = XLSX.read(dataBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

  if (jsonData.length <= 1) {
    return { rows: [], totalRead: 0, duplicateCount: 0, incompleteCount: 0 };
  }

  // Scan first 6 rows to locate the real header row (handling ERP header banners)
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(jsonData.length, 6); r++) {
    const candidate = jsonData[r] as any[];
    if (!Array.isArray(candidate)) continue;
    const line = candidate.map((c) => String(c || '').toLowerCase()).join(' ');
    if (
      line.includes('descri') ||
      line.includes('material') ||
      line.includes('produto') ||
      line.includes('código') ||
      line.includes('codigo') ||
      line.includes('custo') ||
      line.includes('preço') ||
      line.includes('preco')
    ) {
      headerRowIndex = r;
      break;
    }
  }

  // Detect header column indices
  const headerRow = (jsonData[headerRowIndex] || jsonData[0]) as any[];
  const colMap: { [key: string]: number } = {};

  headerRow.forEach((cell, idx) => {
    if (!cell) return;
    const str = String(cell).toLowerCase().trim();

    // Internal code vs manufacturer code
    if (str.includes('fabricante') || str.includes('mfg') || str.includes('part number') || str === 'pn') {
      colMap.manufacturerCode = idx;
    } else if (str.includes('código') || str.includes('codigo') || str === 'cod' || str === 'item' || str === 'código interno') {
      if (!('code' in colMap)) colMap.code = idx;
    } else if (str.includes('marca') || str.includes('brand')) {
      colMap.brand = idx;
    } else if (str.includes('descri') || str.includes('material') || str.includes('produto') || str === 'discriminacao') {
      colMap.description = idx;
    } else if (str.includes('especifica') || str.includes('norma') || str.includes('dimens') || str.includes('detalhe')) {
      colMap.specs = idx;
    } else if (str.includes('qtd') || str.includes('quant') || str === 'qnt' || str.includes('quantity')) {
      colMap.quantity = idx;
    } else if (str.includes('unid') || str.includes('un') || str === 'medida' || str === 'unit') {
      colMap.unit = idx;
    } else if (
      // Price / Unit Cost
      (str.includes('custo') || str.includes('preco') || str.includes('preço') || str.includes('valor') || str.includes('vlr') || str.includes('price') || str.includes('cost')) &&
      !str.includes('total')
    ) {
      if (!('unitCost' in colMap)) colMap.unitCost = idx;
    } else if (
      // Total Price / Cost
      str.includes('total') &&
      (str.includes('custo') || str.includes('preco') || str.includes('preço') || str.includes('valor') || str.includes('vlr') || str.includes('price') || str.includes('cost'))
    ) {
      if (!('totalCost' in colMap)) colMap.totalCost = idx;
    } else if (str.includes('fornecedor') || str.includes('supplier') || str.includes('empresa') || str.includes('distribuidor')) {
      colMap.supplierName = idx;
    } else if (str.includes('validade') || str.includes('validity')) {
      colMap.validityDays = idx;
    } else if (str.includes('categoria') || str.includes('category') || str.includes('classe') || str.includes('grupo')) {
      colMap.category = idx;
    }
  });

  const parsedList: ParsedBomRow[] = [];
  let incompleteCount = 0;

  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i] as any[];
    if (!row || row.length === 0 || row.every((c) => c === undefined || c === null || c === '')) {
      continue;
    }

    const descRaw = colMap.description !== undefined ? row[colMap.description] : row[1] || row[0];
    const description = descRaw ? String(descRaw).trim() : '';

    if (!description) {
      incompleteCount++;
      continue;
    }

    const code = colMap.code !== undefined && row[colMap.code] ? String(row[colMap.code]).trim() : undefined;
    const manufacturerCode = colMap.manufacturerCode !== undefined && row[colMap.manufacturerCode] ? String(row[colMap.manufacturerCode]).trim() : undefined;
    const brand = colMap.brand !== undefined && row[colMap.brand] ? String(row[colMap.brand]).trim() : undefined;
    const specs = colMap.specs !== undefined && row[colMap.specs] ? String(row[colMap.specs]).trim() : undefined;

    const unitRaw = colMap.unit !== undefined && row[colMap.unit] ? String(row[colMap.unit]).trim() : 'UN';
    const unit = unitRaw.toUpperCase();

    let qty = 1;
    let hasQuantityWarning = false;
    if (colMap.quantity !== undefined && row[colMap.quantity] !== undefined) {
      const parsedQty = parsePriceOrNumber(row[colMap.quantity]);
      if (parsedQty !== undefined && parsedQty > 0) {
        qty = parsedQty;
      } else {
        qty = 1;
        hasQuantityWarning = true;
      }
    } else {
      qty = 1;
      hasQuantityWarning = true;
    }

    // Extract Unit Cost and Total Cost with format normalization
    let unitCost: number | undefined = undefined;
    if (colMap.unitCost !== undefined && row[colMap.unitCost] !== undefined) {
      unitCost = parsePriceOrNumber(row[colMap.unitCost]);
    }

    let totalCost: number | undefined = undefined;
    if (colMap.totalCost !== undefined && row[colMap.totalCost] !== undefined) {
      totalCost = parsePriceOrNumber(row[colMap.totalCost]);
    }

    // Cross-derive unitCost and totalCost if one is missing
    if ((unitCost === undefined || unitCost <= 0) && totalCost !== undefined && totalCost > 0 && qty > 0) {
      unitCost = Math.round((totalCost / qty + Number.EPSILON) * 100) / 100;
    }
    if ((totalCost === undefined || totalCost <= 0) && unitCost !== undefined && unitCost > 0 && qty > 0) {
      totalCost = Math.round((unitCost * qty + Number.EPSILON) * 100) / 100;
    }

    // Supplier Name
    const supplierName = colMap.supplierName !== undefined && row[colMap.supplierName] ? String(row[colMap.supplierName]).trim() : undefined;

    // Validity in days
    let validityDays: number | undefined = undefined;
    if (colMap.validityDays !== undefined && row[colMap.validityDays] !== undefined) {
      const parsedDays = parseInt(String(row[colMap.validityDays]).replace(/\D/g, ''), 10);
      if (!isNaN(parsedDays) && parsedDays > 0) validityDays = parsedDays;
    }

    // Category
    const category = colMap.category !== undefined && row[colMap.category] ? String(row[colMap.category]).trim() : undefined;

    parsedList.push({
      lineNumber: i + 1,
      code,
      manufacturerCode,
      brand,
      description,
      specs,
      unit,
      quantity: qty,
      unitCost: unitCost !== undefined && unitCost >= 0 ? unitCost : undefined,
      totalCost: totalCost !== undefined && totalCost >= 0 ? totalCost : undefined,
      supplierName,
      validityDays,
      category,
      hasQuantityWarning,
    });
  }

  // Consolidate duplicates only with exact compatible code, specification, and unit
  const consolidated: ParsedBomRow[] = [];
  let duplicateCount = 0;

  for (const item of parsedList) {
    const existingIndex = consolidated.findIndex(
      (c) =>
        c.unit.toLowerCase() === item.unit.toLowerCase() &&
        (c.code && item.code ? c.code.toLowerCase() === item.code.toLowerCase() : false) &&
        (c.specs || '').toLowerCase() === (item.specs || '').toLowerCase()
    );

    if (existingIndex >= 0) {
      consolidated[existingIndex].quantity += item.quantity;
      // Preserve or calculate unit cost if existing is missing
      if (item.unitCost && (!consolidated[existingIndex].unitCost || consolidated[existingIndex].unitCost <= 0)) {
        consolidated[existingIndex].unitCost = item.unitCost;
      }
      duplicateCount++;
    } else {
      consolidated.push({ ...item });
    }
  }

  return {
    rows: consolidated,
    totalRead: parsedList.length,
    duplicateCount,
    incompleteCount,
  };
}

// -------------------------------------------------------------
// FIRESTORE CRUD OPERATIONS
// -------------------------------------------------------------

// Proposals
export async function getProposals(organizationId: string): Promise<CommercialProposal[]> {
  const colRef = collection(db, 'commercial_proposals');
  const q = query(colRef, where('organizationId', '==', organizationId));
  const snap = await getDocs(q);
  const list: CommercialProposal[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as any) });
  });
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getProposalById(proposalId: string): Promise<CommercialProposal | null> {
  const docRef = doc(db, 'commercial_proposals', proposalId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}

export async function saveProposal(proposal: CommercialProposal): Promise<string> {
  const colRef = collection(db, 'commercial_proposals');
  const docRef = proposal.id ? doc(colRef, proposal.id) : doc(colRef);
  const id = docRef.id;
  const payload = cleanFirestoreData({
    ...proposal,
    id,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, payload, { merge: true });
  return id;
}

export async function deleteProposal(proposalId: string): Promise<void> {
  // Delete proposal items
  const itemsCol = collection(db, 'commercial_proposal_items');
  const q = query(itemsCol, where('proposalId', '==', proposalId));
  const snap = await getDocs(q);
  const promises = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(promises);

  // Delete proposal
  await deleteDoc(doc(db, 'commercial_proposals', proposalId));
}

// Proposal Items
export async function getProposalItems(proposalId: string): Promise<CommercialProposalItem[]> {
  const colRef = collection(db, 'commercial_proposal_items');
  const q = query(colRef, where('proposalId', '==', proposalId));
  const snap = await getDocs(q);
  const items: CommercialProposalItem[] = [];
  snap.forEach((d) => {
    items.push({ id: d.id, ...(d.data() as any) });
  });
  return items.sort((a, b) => a.itemNumber - b.itemNumber);
}

export async function saveProposalItems(proposalId: string, items: CommercialProposalItem[]): Promise<void> {
  const colRef = collection(db, 'commercial_proposal_items');
  // Upsert each item
  const promises = items.map((item) => {
    const docRef = item.id ? doc(colRef, item.id) : doc(colRef);
    const id = docRef.id;
    return setDoc(docRef, cleanFirestoreData({ ...item, id, proposalId }), { merge: true });
  });
  await Promise.all(promises);
}

// Catalog Materials
export async function getMaterials(organizationId: string): Promise<CommercialMaterial[]> {
  const colRef = collection(db, 'commercial_materials');
  const q = query(colRef, where('organizationId', '==', organizationId));
  const snap = await getDocs(q);
  const list: CommercialMaterial[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as any) });
  });
  return list.sort((a, b) => a.internalCode.localeCompare(b.internalCode));
}

export async function saveMaterial(material: CommercialMaterial): Promise<string> {
  const colRef = collection(db, 'commercial_materials');
  const docRef = material.id ? doc(colRef, material.id) : doc(colRef);
  const id = docRef.id;
  const payload = cleanFirestoreData({
    ...material,
    id,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, payload, { merge: true });
  return id;
}

export async function updateMaterial(materialId: string, partial: Partial<CommercialMaterial>): Promise<void> {
  const docRef = doc(db, 'commercial_materials', materialId);
  await updateDoc(docRef, cleanFirestoreData({ ...partial, updatedAt: new Date().toISOString() }));
}

export async function deleteMaterial(materialId: string): Promise<void> {
  const docRef = doc(db, 'commercial_materials', materialId);
  await deleteDoc(docRef);
}

// Clients
export async function getClients(organizationId: string): Promise<CommercialClient[]> {
  const colRef = collection(db, 'commercial_clients');
  const q = query(colRef, where('organizationId', '==', organizationId));
  const snap = await getDocs(q);
  const list: CommercialClient[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as any) });
  });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveClient(client: CommercialClient): Promise<string> {
  const colRef = collection(db, 'commercial_clients');
  const docRef = client.id ? doc(colRef, client.id) : doc(colRef);
  const id = docRef.id;
  await setDoc(docRef, cleanFirestoreData({ ...client, id, updatedAt: new Date().toISOString() }), { merge: true });
  return id;
}

// Commercial Policies
export async function getCommercialPolicy(organizationId: string): Promise<CommercialPolicy | null> {
  const docRef = doc(db, 'commercial_policies', organizationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    // Default standard policy
    const defaultPolicy: CommercialPolicy = {
      id: organizationId,
      organizationId,
      defaultMarkupPercent: 25,
      minMarkupPercent: 15,
      maxMarkupPercent: 60,
      categoryMarkups: {
        Tubulações: 25,
        Válvulas: 28,
        Conexões: 25,
        Instrumentação: 35,
        Fixação: 20,
      },
      quoteValidityDaysByCategory: {
        Tubulações: 15,
        Válvulas: 30,
        Conexões: 20,
        Instrumentação: 30,
        Fixação: 45,
      },
      requireReviewForMarginBelowPercent: 20,
      allowedCurrencies: ['BRL', 'USD', 'EUR'],
      updatedAt: new Date().toISOString(),
      updatedBy: 'Sistema',
    };
    await setDoc(docRef, cleanFirestoreData(defaultPolicy));
    return defaultPolicy;
  }
  return snap.data() as CommercialPolicy;
}

export async function saveCommercialPolicy(policy: CommercialPolicy): Promise<void> {
  const docRef = doc(db, 'commercial_policies', policy.organizationId);
  await setDoc(docRef, cleanFirestoreData({ ...policy, updatedAt: new Date().toISOString() }), { merge: true });
}

// Import Batches
export async function getImportBatches(organizationId: string): Promise<CommercialImportBatch[]> {
  const colRef = collection(db, 'commercial_imports');
  const q = query(colRef, where('organizationId', '==', organizationId));
  const snap = await getDocs(q);
  const list: CommercialImportBatch[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as any) });
  });
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function saveImportBatch(batch: CommercialImportBatch): Promise<string> {
  const colRef = collection(db, 'commercial_imports');
  const docRef = batch.id ? doc(colRef, batch.id) : doc(colRef);
  const id = docRef.id;
  await setDoc(docRef, cleanFirestoreData({ ...batch, id }), { merge: true });
  return id;
}

// Rollback / Revert an entire import batch
// Permanent Delete of an entire import batch and its imported materials
export async function deleteImportBatch(
  batchId: string,
  organizationId: string
): Promise<{ deletedMaterialsCount: number; restoredMaterialsCount: number }> {
  const docRef = doc(db, 'commercial_imports', batchId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Lote de importação não encontrado.');
  }

  const batch = snap.data() as CommercialImportBatch;
  let deletedMaterialsCount = 0;
  let restoredMaterialsCount = 0;

  // 1. Delete materials explicitly recorded in createdMaterialIds
  const deletedMatIdsSet = new Set<string>();
  if (batch.createdMaterialIds && Array.isArray(batch.createdMaterialIds)) {
    for (const matId of batch.createdMaterialIds) {
      try {
        const matRef = doc(db, 'commercial_materials', matId);
        await deleteDoc(matRef);
        deletedMaterialsCount++;
        deletedMatIdsSet.add(matId);
      } catch (err) {
        console.warn(`Erro ao excluir material ${matId}:`, err);
      }
    }
  }

  // Fallback for batches where createdMaterialIds might be empty: find materials where sourceDocumentRef matches batch.fileName
  if (deletedMaterialsCount === 0 && batch.fileName) {
    try {
      const matsCol = collection(db, 'commercial_materials');
      const q = query(
        matsCol,
        where('organizationId', '==', organizationId),
        where('sourceDocumentRef', '==', batch.fileName)
      );
      const mSnap = await getDocs(q);
      for (const mDoc of mSnap.docs) {
        if (!deletedMatIdsSet.has(mDoc.id)) {
          await deleteDoc(mDoc.ref);
          deletedMaterialsCount++;
          deletedMatIdsSet.add(mDoc.id);
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar materiais pelo sourceDocumentRef:', err);
    }
  }

  // 2. If materials were updated by this batch, restore their previous prices/data
  if (batch.updatedMaterialsSnapshots && Array.isArray(batch.updatedMaterialsSnapshots)) {
    for (const snapItem of batch.updatedMaterialsSnapshots) {
      try {
        const matRef = doc(db, 'commercial_materials', snapItem.materialId);
        const matDoc = await getDoc(matRef);
        if (matDoc.exists()) {
          const updatePayload: Record<string, any> = {
            baseCost: snapItem.previousBaseCost,
            updatedAt: new Date().toISOString(),
          };
          if (snapItem.previousSupplierName !== undefined) {
            updatePayload.supplierName = snapItem.previousSupplierName;
          }
          if (snapItem.previousQuoteDate !== undefined) {
            updatePayload.quoteDate = snapItem.previousQuoteDate;
          }
          if (snapItem.previousValidityDays !== undefined) {
            updatePayload.validityDays = snapItem.previousValidityDays;
          }
          await updateDoc(matRef, cleanFirestoreData(updatePayload));
          restoredMaterialsCount++;
        }
      } catch (err) {
        console.warn(`Erro ao restaurar material ${snapItem.materialId}:`, err);
      }
    }
  }

  // 3. Permanently delete the batch document from commercial_imports
  await deleteDoc(docRef);

  return { deletedMaterialsCount, restoredMaterialsCount };
}

// Rollback / Revert an entire import batch (kept for backward compatibility)
export async function revertImportBatch(
  batchId: string,
  revertedBy: string,
  revertedByName: string
): Promise<{ deletedCount: number; restoredCount: number }> {
  const docRef = doc(db, 'commercial_imports', batchId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Lote de importação não encontrado.');
  }

  const batch = snap.data() as CommercialImportBatch;
  if (batch.status === 'revertido' || batch.isReverted) {
    throw new Error('Este lote já foi revertido anteriormente.');
  }

  let deletedCount = 0;
  let restoredCount = 0;

  // 1. Delete materials that were created as new in this batch
  if (batch.createdMaterialIds && Array.isArray(batch.createdMaterialIds)) {
    for (const matId of batch.createdMaterialIds) {
      try {
        const matRef = doc(db, 'commercial_materials', matId);
        await deleteDoc(matRef);
        deletedCount++;
      } catch (err) {
        console.warn(`Erro ao excluir material ${matId} durante reversão:`, err);
      }
    }
  }

  // 2. Restore previous price and info of materials updated by this batch
  if (batch.updatedMaterialsSnapshots && Array.isArray(batch.updatedMaterialsSnapshots)) {
    for (const snapItem of batch.updatedMaterialsSnapshots) {
      try {
        const matRef = doc(db, 'commercial_materials', snapItem.materialId);
        const matDoc = await getDoc(matRef);
        if (matDoc.exists()) {
          const updatePayload: Record<string, any> = {
            baseCost: snapItem.previousBaseCost,
            updatedAt: new Date().toISOString(),
          };
          if (snapItem.previousSupplierName !== undefined) {
            updatePayload.supplierName = snapItem.previousSupplierName;
          }
          if (snapItem.previousQuoteDate !== undefined) {
            updatePayload.quoteDate = snapItem.previousQuoteDate;
          }
          if (snapItem.previousValidityDays !== undefined) {
            updatePayload.validityDays = snapItem.previousValidityDays;
          }
          await updateDoc(matRef, cleanFirestoreData(updatePayload));
          restoredCount++;
        }
      } catch (err) {
        console.warn(`Erro ao restaurar material ${snapItem.materialId}:`, err);
      }
    }
  }

  // 3. Mark batch as reverted
  await updateDoc(docRef, {
    status: 'revertido',
    isReverted: true,
    revertedAt: new Date().toISOString(),
    revertedBy,
    revertedByName,
  });

  return { deletedCount, restoredCount };
}

// -------------------------------------------------------------
// SPREADSHEET DUPLICATE COMPARISON ENGINE
// -------------------------------------------------------------
export function compareSpreadsheetWithCatalog(
  incomingRows: ParsedBomRow[],
  catalog: CommercialMaterial[]
): ImportItemDiff[] {
  return incomingRows.map((row, index) => {
    const rawCode = (row.code || '').trim();
    const rawMfgCode = (row.manufacturerCode || '').trim();
    const rawDesc = (row.description || '').trim();
    const normDesc = rawDesc.toUpperCase();
    const unit = (row.unit || 'UN').trim().toUpperCase();
    const incomingCost = typeof row.unitCost === 'number' && !isNaN(row.unitCost) && row.unitCost >= 0
      ? row.unitCost
      : 0;

    // Search existing in catalog:
    // 1. Internal Code match (exact, case-insensitive)
    let matchedMaterial: CommercialMaterial | undefined;
    if (rawCode) {
      matchedMaterial = catalog.find(
        (m) => m.internalCode && m.internalCode.trim().toLowerCase() === rawCode.toLowerCase()
      );
    }

    // 2. Manufacturer Code match
    if (!matchedMaterial && rawMfgCode) {
      matchedMaterial = catalog.find(
        (m) => m.manufacturerCode && m.manufacturerCode.trim().toLowerCase() === rawMfgCode.toLowerCase()
      );
    }

    // 3. Normalized Description match with compatible unit
    if (!matchedMaterial && normDesc) {
      matchedMaterial = catalog.find(
        (m) =>
          m.normalizedDescription &&
          m.normalizedDescription.trim().toLowerCase() === normDesc.toLowerCase() &&
          (!m.unit || m.unit.toUpperCase() === unit)
      );
    }

    const id = `diff_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;

    if (!matchedMaterial) {
      // Inédito / Novo
      return {
        id,
        lineNumber: row.lineNumber || index + 1,
        incomingCode: rawCode || undefined,
        incomingManufacturerCode: rawMfgCode || undefined,
        incomingBrand: row.brand,
        incomingDescription: rawDesc,
        incomingSpecs: row.specs,
        incomingUnit: unit,
        incomingQuantity: row.quantity || 1,
        incomingCost,
        incomingCategory: row.category,
        incomingSupplier: row.supplierName,
        incomingValidityDays: row.validityDays,
        matchStatus: 'NOVO',
        action: 'CRIAR_NOVO',
        isSelected: true, // Selected by default
      };
    }

    // Item already exists in catalog
    const existingBaseCost = matchedMaterial.baseCost || 0;
    const priceDiffAmount = Math.round((incomingCost - existingBaseCost) * 100) / 100;
    const priceDiffPercent = existingBaseCost > 0
      ? Math.round((priceDiffAmount / existingBaseCost) * 1000) / 10
      : 0;

    const isIdenticalPrice = Math.abs(priceDiffAmount) < 0.01;
    const matchStatus = isIdenticalPrice ? 'IDENTICO' : 'ATUALIZAR_PRECO';

    return {
      id,
      lineNumber: row.lineNumber || index + 1,
      incomingCode: rawCode || matchedMaterial.internalCode,
      incomingManufacturerCode: rawMfgCode || matchedMaterial.manufacturerCode,
      incomingBrand: row.brand || matchedMaterial.brand,
      incomingDescription: rawDesc,
      incomingSpecs: row.specs || matchedMaterial.technicalSpecs?.notes,
      incomingUnit: unit,
      incomingQuantity: row.quantity || 1,
      incomingCost,
      incomingCategory: row.category || matchedMaterial.category,
      incomingSupplier: row.supplierName || matchedMaterial.supplierName,
      incomingValidityDays: row.validityDays || matchedMaterial.validityDays,
      matchStatus,
      matchedMaterialId: matchedMaterial.id,
      matchedInternalCode: matchedMaterial.internalCode,
      matchedDescription: matchedMaterial.originalDescription,
      existingBaseCost,
      existingSupplier: matchedMaterial.supplierName,
      existingQuoteDate: matchedMaterial.quoteDate,
      existingValidityDays: matchedMaterial.validityDays,
      priceDiffAmount,
      priceDiffPercent,
      // Default decision: if price changed, update price. If identical, ignore duplicate.
      action: isIdenticalPrice ? 'IGNORAR_DUPLICADO' : 'ATUALIZAR_PRECO',
      isSelected: !isIdenticalPrice, // Only selected if there's an actual update
    };
  });
}

export async function executeSpreadsheetImportWithResolution(
  organizationId: string,
  diffs: ImportItemDiff[],
  fileName: string,
  sourceType: 'CATALOGO_PRECOS' | 'BOM_PROPOSTA',
  userId: string,
  userName: string,
  existingCatalog: CommercialMaterial[]
): Promise<{
  batch: CommercialImportBatch;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
}> {
  const today = new Date().toISOString().split('T')[0];
  const createdMaterialIds: string[] = [];
  const updatedMaterialsSnapshots: MaterialPreviousSnapshot[] = [];
  const importedItemsSnapshot: ImportedItemAuditRecord[] = [];

  let createdCount = 0;
  let updatedCount = 0;
  let ignoredCount = 0;

  for (let i = 0; i < diffs.length; i++) {
    const item = diffs[i];

    // If unselected or user chose to ignore
    if (!item.isSelected || item.action === 'IGNORAR_DUPLICADO') {
      ignoredCount++;
      importedItemsSnapshot.push({
        internalCode: item.incomingCode || item.matchedInternalCode || `IGN-${i + 1}`,
        description: item.incomingDescription,
        unit: item.incomingUnit,
        baseCost: item.incomingCost,
        category: item.incomingCategory,
        supplierName: item.incomingSupplier,
        actionTaken: 'ignorado',
      });
      continue;
    }

    if (item.action === 'ATUALIZAR_PRECO' && item.matchedMaterialId) {
      // Find current material data for snapshot
      const existing = existingCatalog.find((m) => m.id === item.matchedMaterialId);
      const prevCost = existing ? existing.baseCost : (item.existingBaseCost || 0);

      updatedMaterialsSnapshots.push({
        materialId: item.matchedMaterialId,
        internalCode: item.matchedInternalCode || item.incomingCode || '',
        description: item.matchedDescription || item.incomingDescription,
        previousBaseCost: prevCost,
        newBaseCost: item.incomingCost,
        previousSupplierName: existing?.supplierName || item.existingSupplier,
        previousQuoteDate: existing?.quoteDate || item.existingQuoteDate,
        previousValidityDays: existing?.validityDays || item.existingValidityDays,
      });

      const matDocRef = doc(db, 'commercial_materials', item.matchedMaterialId);
      const updateData: Record<string, any> = {
        baseCost: item.incomingCost,
        updatedAt: new Date().toISOString(),
        sourceDocumentRef: fileName,
      };
      if (item.incomingSupplier) updateData.supplierName = item.incomingSupplier;
      if (item.incomingValidityDays) updateData.validityDays = item.incomingValidityDays;
      updateData.quoteDate = today;

      await updateDoc(matDocRef, cleanFirestoreData(updateData));
      updatedCount++;

      importedItemsSnapshot.push({
        materialId: item.matchedMaterialId,
        internalCode: item.matchedInternalCode || item.incomingCode || '',
        description: item.incomingDescription,
        unit: item.incomingUnit,
        baseCost: item.incomingCost,
        category: item.incomingCategory,
        supplierName: item.incomingSupplier || item.existingSupplier,
        actionTaken: 'atualizado',
      });
    } else {
      // Create new material
      const newId = `mat_imp_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      const internalCode = item.incomingCode || `MAT-${Date.now().toString().slice(-5)}-${i + 1}`;

      const newMaterial: CommercialMaterial = {
        id: newId,
        organizationId,
        internalCode,
        manufacturerCode: item.incomingManufacturerCode,
        brand: item.incomingBrand,
        originalDescription: item.incomingDescription,
        normalizedDescription: item.incomingDescription.toUpperCase(),
        technicalSpecs: {
          notes: item.incomingSpecs,
        },
        unit: item.incomingUnit || 'UN',
        baseCost: item.incomingCost,
        currency: 'BRL',
        sourceType: 'cotacao_confirmada',
        quoteDate: today,
        validityDays: item.incomingValidityDays || 30,
        category: item.incomingCategory || 'Importados em Lote',
        supplierName: item.incomingSupplier || 'Planilha de Carga',
        importedBy: userName,
        sourceDocumentRef: fileName,
        createdAt: new Date().toISOString(),
      };

      await saveMaterial(newMaterial);
      createdMaterialIds.push(newId);
      createdCount++;

      importedItemsSnapshot.push({
        materialId: newId,
        internalCode,
        description: item.incomingDescription,
        unit: item.incomingUnit,
        baseCost: item.incomingCost,
        category: item.incomingCategory,
        supplierName: item.incomingSupplier,
        actionTaken: 'criado',
      });
    }
  }

  // Save batch record with rollback information
  const batchCode = `IMP-${Date.now().toString().slice(-6)}`;
  const batchPayload: CommercialImportBatch = {
    id: `batch_${Date.now()}`,
    organizationId,
    batchCode,
    fileName,
    sourceType,
    importedBy: userId,
    importedByName: userName,
    createdAt: new Date().toISOString(),
    totalRowsRead: diffs.length,
    acceptedRows: createdCount + updatedCount,
    duplicateRows: diffs.filter((d) => d.matchStatus === 'IDENTICO').length,
    incompleteRows: diffs.filter((d) => d.incomingCost <= 0).length,
    rejectedRows: ignoredCount,
    status: 'processado',
    createdMaterialIds,
    updatedMaterialsSnapshots,
    importedItemsSnapshot,
    isReverted: false,
  };

  await saveImportBatch(batchPayload);

  return {
    batch: batchPayload,
    createdCount,
    updatedCount,
    ignoredCount,
  };
}

// -------------------------------------------------------------
// INDUSTRIAL DEMO DATA SEEDER
// -------------------------------------------------------------
export async function seedCommercialDemoData(
  organizationId: string,
  userId: string,
  userName: string
): Promise<{ materialsCount: number; clientsCount: number; proposalsCount: number }> {
  const today = new Date().toISOString().split('T')[0];
  const pastDate10Days = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];
  const pastDate40Days = new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0]; // Expired for 15-day policy

  // 1. Seed Industrial Stainless & Piping Materials
  const demoMaterials: CommercialMaterial[] = [
    {
      id: `mat_demo_01_${organizationId}`,
      organizationId,
      internalCode: 'TB-INX-304-2-S10',
      manufacturerCode: 'TUB-304-SCH10-DN50',
      brand: 'Aperam',
      originalDescription: 'Tubo de Aço Inoxidável AISI 304 com costura SCH 10 2"',
      normalizedDescription: 'TUBO INOX AISI 304 C/COSTURA SCH 10 2" DN50 ASTM A312',
      technicalSpecs: {
        materialGrade: 'AISI 304',
        dimension: '2" (DN50)',
        scheduleClass: 'SCH 10',
        connectionType: 'Solda BW',
        standardNorm: 'ASTM A312',
        finish: 'Decapado',
        notes: 'Barras de 6 metros standard industrial',
      },
      unit: 'm',
      packaging: 'Feixe c/ 6m',
      baseCost: 85.5,
      currency: 'BRL',
      supplierName: 'Aperam South America',
      sourceType: 'cotacao_confirmada',
      quoteDate: pastDate10Days,
      validityDays: 20,
      category: 'Tubulações',
      freightCost: 2.5,
      taxCost: 0,
      sourceDocumentRef: 'COT-AP-2026-941',
      importedBy: userName,
      createdAt: new Date().toISOString(),
    },
    {
      id: `mat_demo_02_${organizationId}`,
      organizationId,
      internalCode: 'TB-INX-316L-3-S40',
      manufacturerCode: 'TUB-316L-SCH40-DN80',
      brand: 'Villares Metals',
      originalDescription: 'Tubo Inox 316L sem costura SCH 40 3" decapado',
      normalizedDescription: 'TUBO INOX AISI 316L S/COSTURA SCH 40 3" DN80 ASTM A312',
      technicalSpecs: {
        materialGrade: 'AISI 316L',
        dimension: '3" (DN80)',
        scheduleClass: 'SCH 40',
        connectionType: 'Solda BW',
        standardNorm: 'ASTM A312',
        finish: 'Decapado',
        notes: 'Uso sanitário/químico de alta pressão',
      },
      unit: 'm',
      packaging: 'Barra 6m',
      baseCost: 245.0,
      currency: 'BRL',
      supplierName: 'Inoxtech Distribuidora',
      sourceType: 'compra_historica',
      quoteDate: pastDate10Days,
      validityDays: 30,
      category: 'Tubulações',
      freightCost: 5.0,
      taxCost: 0,
      sourceDocumentRef: 'NF-e 88123',
      importedBy: userName,
      createdAt: new Date().toISOString(),
    },
    {
      id: `mat_demo_03_${organizationId}`,
      organizationId,
      internalCode: 'VAL-BOR-304-2-WAF',
      manufacturerCode: 'BFLY-VLV-304-DN50',
      brand: 'Bray Controls',
      originalDescription: 'Válvula Borboleta Wafer Inox 304 Vedação EPDM 2"',
      normalizedDescription: 'VALVULA BORBOLETA WAFER INOX AISI 304 DN50 2" VEDACAO EPDM',
      technicalSpecs: {
        materialGrade: 'AISI 304',
        dimension: '2" (DN50)',
        scheduleClass: '150#',
        connectionType: 'Wafer',
        standardNorm: 'API 609 / ANSI 150#',
        finish: 'Industrial',
        notes: 'Acionamento por alavanca com trava',
      },
      unit: 'un',
      packaging: 'Caixa unitária',
      baseCost: 380.0,
      currency: 'BRL',
      supplierName: 'Bray Controls Brasil',
      sourceType: 'cotacao_confirmada',
      quoteDate: pastDate10Days,
      validityDays: 30,
      category: 'Válvulas',
      freightCost: 15.0,
      taxCost: 0,
      sourceDocumentRef: 'COT-BRAY-552',
      importedBy: userName,
      createdAt: new Date().toISOString(),
    },
    {
      id: `mat_demo_04_${organizationId}`,
      organizationId,
      internalCode: 'VAL-ESF-316-1-NPT',
      manufacturerCode: 'BV-3PC-1000WOG-1NPT',
      brand: 'MGA Válvulas',
      originalDescription: 'Válvula Esfera Tripartida Inox 316 1" NPT 1000 WOG',
      normalizedDescription: 'VALVULA ESFERA TRIPARTIDA INOX 316 1" ROSCA NPT PASSAGEM PLENA',
      technicalSpecs: {
        materialGrade: 'AISI 316',
        dimension: '1"',
        scheduleClass: '1000 WOG',
        connectionType: 'Roscada NPT',
        standardNorm: 'ASME B16.34',
        finish: 'Microfundido',
        notes: 'Vedação em PTFE virgem reforçado',
      },
      unit: 'un',
      packaging: 'Caixa c/ 2 un',
      baseCost: 195.0,
      currency: 'BRL',
      supplierName: 'MGA Válvulas Indústria',
      sourceType: 'cotacao_confirmada',
      quoteDate: pastDate40Days, // Expirada propositalmente para demonstrar alerta
      validityDays: 30,
      category: 'Válvulas',
      freightCost: 8.0,
      taxCost: 0,
      sourceDocumentRef: 'COT-MGA-2026-09',
      importedBy: userName,
      createdAt: new Date().toISOString(),
    },
    {
      id: `mat_demo_05_${organizationId}`,
      organizationId,
      internalCode: 'FLG-WNR-304-2-150',
      manufacturerCode: 'FLG-WN-RF-150-DN50',
      brand: 'Tenaris',
      originalDescription: 'Flange Weld Neck RF Aço Inox 304 2" 150# SCH 10',
      normalizedDescription: 'FLANGE PESCOCO WELD NECK RF INOX 304 DN50 2" ANSI 150# SCH 10',
      technicalSpecs: {
        materialGrade: 'AISI 304',
        dimension: '2" (DN50)',
        scheduleClass: '150# / SCH 10',
        connectionType: 'Flangeado / Solda Topo',
        standardNorm: 'ASME B16.5',
        finish: 'Ranhura Standard',
      },
      unit: 'un',
      packaging: 'Unitário',
      baseCost: 72.0,
      currency: 'BRL',
      supplierName: 'Aços Granjo',
      sourceType: 'codigo_interno_exato',
      quoteDate: pastDate10Days,
      validityDays: 30,
      category: 'Conexões',
      freightCost: 3.0,
      taxCost: 0,
      sourceDocumentRef: 'TAB-PRECOS-INTERNA',
      importedBy: userName,
      createdAt: new Date().toISOString(),
    },
    {
      id: `mat_demo_06_${organizationId}`,
      organizationId,
      internalCode: 'CUR-90-304-2-S10',
      manufacturerCode: 'ELB-90LR-BW-304-DN50',
      brand: 'Conforja',
      originalDescription: 'Curva 90 Graus Raio Longo Inox 304 SCH 10 2" Solda BW',
      normalizedDescription: 'CURVA 90 GRAUS RAIO LONGO INOX AISI 304 SCH 10 2" DN50 BW',
      technicalSpecs: {
        materialGrade: 'AISI 304',
        dimension: '2" (DN50)',
        scheduleClass: 'SCH 10',
        connectionType: 'Solda BW',
        standardNorm: 'ASME B16.9',
        finish: 'Decapado',
      },
      unit: 'un',
      packaging: 'Unitário',
      baseCost: 38.0,
      currency: 'BRL',
      supplierName: 'Conforja Conexões',
      sourceType: 'compra_historica',
      quoteDate: pastDate10Days,
      validityDays: 30,
      category: 'Conexões',
      freightCost: 2.0,
      taxCost: 0,
      sourceDocumentRef: 'NF-e 7741',
      importedBy: userName,
      createdAt: new Date().toISOString(),
    },
  ];

  for (const mat of demoMaterials) {
    await saveMaterial(mat);
  }

  // 2. Seed Industrial Clients
  const demoClients: CommercialClient[] = [
    {
      id: `cli_demo_01_${organizationId}`,
      organizationId,
      name: 'Ambev S/A - Cervejaria Jaguariúna',
      tradeName: 'Ambev Jaguariúna',
      cnpjCpf: '56.222.407/0001-95',
      contactName: 'Eng. Roberto Albuquerque',
      contactEmail: 'roberto.albuquerque@ambev.com.br',
      contactPhone: '(19) 3867-9000',
      address: 'Rodovia SP 340, Km 130',
      city: 'Jaguariúna',
      state: 'SP',
      zipCode: '13820-000',
      segment: 'Bebidas e Alimentos (Sanitário)',
      createdAt: new Date().toISOString(),
    },
    {
      id: `cli_demo_02_${organizationId}`,
      organizationId,
      name: 'Braskem S/A - Polo Petroquímico de Mauá',
      tradeName: 'Braskem Q1 Mauá',
      cnpjCpf: '42.150.391/0001-70',
      contactName: 'Mariana Duarte - Suprimentos',
      contactEmail: 'mariana.duarte@braskem.com',
      contactPhone: '(11) 4547-8100',
      address: 'Av. Ayrton Senna da Silva, 2700',
      city: 'Mauá',
      state: 'SP',
      zipCode: '09380-901',
      segment: 'Petroquímico e Gases Industriais',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const cli of demoClients) {
    await saveClient(cli);
  }

  // 3. Seed Sample Proposal: PROP-2026-001 (Tubulação Linha Mosto Cervejaria)
  const proposalId = `prop_demo_01_${organizationId}`;
  const propItems: CommercialProposalItem[] = [
    {
      id: `item_demo_01_${proposalId}`,
      proposalId,
      organizationId,
      itemNumber: 1,
      originalLineNumber: 2,
      inputCode: 'TB-INX-304-2-S10',
      inputManufacturerCode: 'TUB-304-SCH10-DN50',
      inputBrand: 'Aperam',
      inputDescription: 'Tubo Inox 304 SCH 10 2" c/ costura decapado',
      inputSpecs: 'AISI 304, 2" SCH 10, ASTM A312',
      inputUnit: 'M',
      inputQuantity: 60,
      matchClassification: 'EXATO',
      matchedMaterialId: demoMaterials[0].id,
      matchedInternalCode: demoMaterials[0].internalCode,
      matchedManufacturerCode: demoMaterials[0].manufacturerCode,
      matchedDescription: demoMaterials[0].normalizedDescription,
      priceSourceType: 'cotacao_confirmada',
      priceSourceDate: pastDate10Days,
      priceSourceDocument: 'COT-AP-2026-941',
      supplierName: 'Aperam South America',
      isPriceExpired: false,
      baseCost: 85.5,
      freightComponent: 2.5,
      taxComponent: 0,
      markupPercent: 25, // 85.50 * 1.25 = 106.875 + 2.50 = 109.38
      proposedUnitPrice: 109.38,
      proposedTotalPrice: roundToTwoDecimals(109.38 * 60), // 6562.80
      isPending: false,
      status: 'ok',
    },
    {
      id: `item_demo_02_${proposalId}`,
      proposalId,
      organizationId,
      itemNumber: 2,
      originalLineNumber: 3,
      inputCode: 'VAL-BOR-304-2-WAF',
      inputManufacturerCode: 'BFLY-VLV-304-DN50',
      inputBrand: 'Bray Controls',
      inputDescription: 'Válvula Borboleta Wafer Inox 304 EPDM 2"',
      inputSpecs: 'Corpo 304, Disco 304, Sede EPDM, DN50',
      inputUnit: 'UN',
      inputQuantity: 8,
      matchClassification: 'EXATO',
      matchedMaterialId: demoMaterials[2].id,
      matchedInternalCode: demoMaterials[2].internalCode,
      matchedManufacturerCode: demoMaterials[2].manufacturerCode,
      matchedDescription: demoMaterials[2].normalizedDescription,
      priceSourceType: 'cotacao_confirmada',
      priceSourceDate: pastDate10Days,
      priceSourceDocument: 'COT-BRAY-552',
      supplierName: 'Bray Controls Brasil',
      isPriceExpired: false,
      baseCost: 380.0,
      freightComponent: 15.0,
      taxComponent: 0,
      markupPercent: 25, // 380 * 1.25 = 475 + 15 = 490
      proposedUnitPrice: 490.0,
      proposedTotalPrice: roundToTwoDecimals(490.0 * 8), // 3920.00
      isPending: false,
      status: 'ok',
    },
    {
      id: `item_demo_03_${proposalId}`,
      proposalId,
      organizationId,
      itemNumber: 3,
      originalLineNumber: 4,
      inputCode: 'FLG-WNR-304-2-150',
      inputDescription: 'Flange Pescoço WN RF 2" 150# SCH 10 Inox 304',
      inputSpecs: 'ASME B16.5, 2" 150#',
      inputUnit: 'UN',
      inputQuantity: 16,
      matchClassification: 'EXATO',
      matchedMaterialId: demoMaterials[4].id,
      matchedInternalCode: demoMaterials[4].internalCode,
      matchedDescription: demoMaterials[4].normalizedDescription,
      priceSourceType: 'codigo_interno_exato',
      priceSourceDate: pastDate10Days,
      supplierName: 'Aços Granjo',
      isPriceExpired: false,
      baseCost: 72.0,
      freightComponent: 3.0,
      taxComponent: 0,
      markupPercent: 25, // 72 * 1.25 = 90 + 3 = 93
      proposedUnitPrice: 93.0,
      proposedTotalPrice: roundToTwoDecimals(93.0 * 16), // 1488.00
      isPending: false,
      status: 'ok',
    },
    {
      id: `item_demo_04_${proposalId}`,
      proposalId,
      organizationId,
      itemNumber: 4,
      originalLineNumber: 5,
      inputCode: 'JNT-ESP-PTFE-2',
      inputDescription: 'Junta Espiralada Inox 304 Enchimento PTFE 2" 150#',
      inputSpecs: 'Vedação especial PTFE / ASME B16.20',
      inputUnit: 'UN',
      inputQuantity: 16,
      matchClassification: 'NAO_ENCONTRADO',
      technicalDifferencesExplanation: 'Material de vedação especial não localizado no catálogo interno. Pendente cotação formal com Teadit ou KLINGER.',
      baseCost: 0,
      freightComponent: 0,
      taxComponent: 0,
      markupPercent: 25,
      proposedUnitPrice: 0,
      proposedTotalPrice: 0,
      isPending: true,
      pendingReason: 'Item não encontrado no catálogo interno. Necessária cotação para liberar valor final.',
      status: 'pendente_cotacao',
    },
  ];

  // Proposal totals
  const pricedItems = propItems.filter((it) => it.matchClassification !== 'NAO_ENCONTRADO' && it.baseCost > 0);
  const totalBase = pricedItems.reduce((acc, it) => acc + it.baseCost * it.inputQuantity, 0);
  const totalFreight = pricedItems.reduce((acc, it) => acc + (it.freightComponent || 0) * it.inputQuantity, 0);
  const proposedTotal = pricedItems.reduce((acc, it) => acc + it.proposedTotalPrice, 0);
  const marginAmt = proposedTotal - totalBase;
  const marginPct = proposedTotal > 0 ? (marginAmt / proposedTotal) * 100 : 0;

  const demoProposal: CommercialProposal = {
    id: proposalId,
    organizationId,
    code: 'PROP-2026-001',
    title: 'Fornecimento de Tubulações e Válvulas Inox - Linha de Mosto Quente',
    clientId: demoClients[0].id,
    clientName: demoClients[0].name,
    clientCnpjCpf: demoClients[0].cnpjCpf,
    clientContactPerson: demoClients[0].contactName,
    clientEmail: demoClients[0].contactEmail,
    clientPhone: demoClients[0].contactPhone,
    currency: 'BRL',
    issueDate: today,
    validityDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    deliveryLocation: 'FOB - Cervejaria Jaguariúna, Rod. SP 340 Km 130',
    deliveryTimeframeDays: 20,
    paymentTerms: '28 dias DDL após faturamento',
    warrantyTerms: '12 meses contra defeitos de fabricação dos materiais',
    scopeDescription:
      'Fornecimento de materiais em aço inoxidável AISI 304 conforme lista de materiais (BOM) do projeto de expansão da brassagem 02.',
    totalItemsCount: propItems.length,
    pricedItemsCount: pricedItems.length,
    pendingItemsCount: propItems.length - pricedItems.length,
    totalBaseCost: roundToTwoDecimals(totalBase),
    globalMarkupPercent: 25,
    totalFreightCost: roundToTwoDecimals(totalFreight),
    totalTaxCost: 0,
    grossMarginAmount: roundToTwoDecimals(marginAmt),
    grossMarginPercent: roundToTwoDecimals(marginPct),
    proposedTotal: roundToTwoDecimals(proposedTotal),
    status: 'parcial', // Parcial because item 4 is pending
    isPartial: true,
    createdBy: userId,
    createdByName: userName,
    history: [
      {
        date: new Date().toISOString(),
        action: 'Criação de Proposta e Importação de BOM',
        userName,
        details: 'Importada planilha BOM_Ambev_Brassagem.xlsx com 4 itens. 1 item classificado como pendente.',
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveProposal(demoProposal);
  await saveProposalItems(proposalId, propItems);

  // 4. Save sample import batch log
  const demoImportBatch: CommercialImportBatch = {
    id: `batch_demo_01_${organizationId}`,
    organizationId,
    batchCode: 'IMP-2026-BOM-01',
    fileName: 'BOM_Ambev_Brassagem_Exp02.xlsx',
    sourceType: 'BOM_PROPOSTA',
    importedBy: userId,
    importedByName: userName,
    createdAt: new Date().toISOString(),
    totalRowsRead: 4,
    acceptedRows: 4,
    duplicateRows: 0,
    incompleteRows: 0,
    rejectedRows: 0,
    status: 'processado',
    proposalId,
  };
  await saveImportBatch(demoImportBatch);

  return {
    materialsCount: demoMaterials.length,
    clientsCount: demoClients.length,
    proposalsCount: 1,
  };
}

// -------------------------------------------------------------
// SUPPLIER QUOTE PDF EXTRACTION & CATALOG ENRICHMENT
// -------------------------------------------------------------

// Generate and download a standard industrial supplier quotation PDF for testing
export function downloadSampleSupplierQuotePdf(): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Box
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('APERAM SOUTH AMERICA — TUBOS & AÇOS INOXIDÁVEIS', 14, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('COTAÇÃO FORMAL DE FORNECIMENTO INDUSTRIAL • TUBULAÇÕES & VÁLVULAS', 14, 23);
  doc.text('Nº COTAÇÃO: COT-2026-941 | DATA: 2026-03-20 | VALIDADE: 30 DIAS | MOEDA: BRL (R$)', 14, 29);

  // Supplier & Commercial Terms Box
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO FORNECEDOR & CONDIÇÕES COMERCIAIS', 14, 45);

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 48, pageWidth - 28, 26, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Fornecedor: Aperam South America Indústria de Tubos Inoxidáveis Ltda.', 18, 55);
  doc.text('CNPJ: 60.872.504/0001-23 | Contato: Eng. Carlos Guimarães (vendas@aperam.com.br)', 18, 61);
  doc.text('Condições de Pagamento: 28 dias DDL após expedição | Frete: FOB Fábrica Jaguariúna SP', 18, 67);

  // Table of Items
  const tableData = [
    [
      '1',
      'TB-INX-304-2-S10',
      'TUB-304-SCH10-DN50',
      'Tubo Aço Inoxidável AISI 304 c/ costura SCH 10 2" ASTM A312',
      'AISI 304, 2" DN50, SCH 10, Solda BW',
      'M',
      '60',
      'R$ 85,50',
      'R$ 5.130,00',
    ],
    [
      '2',
      'TB-INX-316L-3-S40',
      'TUB-316L-SCH40-DN80',
      'Tubo Inox 316L sem costura SCH 40 3" decapado ASTM A312',
      'AISI 316L, 3" DN80, SCH 40, Solda BW',
      'M',
      '12',
      'R$ 245,00',
      'R$ 2.940,00',
    ],
    [
      '3',
      'VAL-BOR-304-2-WAF',
      'BFLY-VLV-304-DN50',
      'Válvula Borboleta Wafer Inox 304 Vedação EPDM 2" ANSI 150#',
      'AISI 304, DN50 2", Wafer 150#, EPDM',
      'UN',
      '8',
      'R$ 380,00',
      'R$ 3.040,00',
    ],
    [
      '4',
      'FLG-WNR-304-2-150',
      'FLG-WN-RF-150-DN50',
      'Flange Pescoço Weld Neck RF Aço Inox 304 2" 150# SCH 10',
      'AISI 304, 2" 150#, ASME B16.5',
      'UN',
      '16',
      'R$ 72,00',
      'R$ 1.152,00',
    ],
    [
      '5',
      'CUR-90-304-2-S10',
      'ELB-90LR-BW-304-DN50',
      'Curva 90 Graus Raio Longo Inox 304 SCH 10 2" Solda BW',
      'AISI 304, 2" DN50, ASME B16.9',
      'UN',
      '12',
      'R$ 38,00',
      'R$ 456,00',
    ],
  ];

  autoTable(doc, {
    startY: 80,
    head: [
      [
        'Item',
        'Código',
        'Cód. Fabr.',
        'Descrição Técnica do Insumo',
        'Especificação',
        'Un',
        'Qtd',
        'Preço Unit.',
        'Total',
      ],
    ],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 26 },
      2: { cellWidth: 26 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 32 },
      5: { cellWidth: 10, halign: 'center' },
      6: { cellWidth: 12, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 22, halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 160;

  // Total Summary
  doc.setFillColor(241, 245, 249);
  doc.rect(pageWidth - 85, finalY + 8, 71, 16, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(pageWidth - 85, finalY + 8, 71, 16, 'D');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('VALOR TOTAL DA COTAÇÃO:', pageWidth - 82, finalY + 14);
  doc.setFontSize(11);
  doc.text('R$ 12.718,00', pageWidth - 82, finalY + 21);

  doc.save('Modelo_Orcamento_Fornecedor_OrcaAgil.pdf');
}

// Standard Industrial Benchmark Materials for Aguero Inox / OrçaÁgil
export const STANDARD_INDUSTRIAL_CATALOG: CommercialMaterial[] = [
  {
    id: 'std_mat_1',
    organizationId: 'default',
    internalCode: 'UNI-SMS-304-2',
    manufacturerCode: 'SMS-WLD-304-DN50',
    brand: 'Apolo / Inoxtech',
    originalDescription: 'União Solda SMS OD 2" EPDM Inox 304',
    normalizedDescription: 'UNIAO SOLDA SMS OD 2 EPDM INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      connectionType: 'Solda SMS OD',
      standardNorm: 'SMS 1145',
    },
    unit: 'UN',
    baseCost: 120.0,
    currency: 'BRL',
    supplierName: 'Inoxtech Conexões Sanitárias',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_2',
    organizationId: 'default',
    internalCode: 'CUR-OD90-304-2',
    manufacturerCode: 'ELB-90-OD-304-DN50',
    brand: 'Conforja',
    originalDescription: 'Curva OD 90 graus Inox 304 2"',
    normalizedDescription: 'CURVA OD 90 GRAUS INOX 304 2',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9 / DIN 11850',
    },
    unit: 'UN',
    baseCost: 45.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_3',
    organizationId: 'default',
    internalCode: 'TEE-RET-304-2',
    manufacturerCode: 'TEE-STR-OD-304-DN50',
    brand: 'Conforja',
    originalDescription: 'Tê reto OD 2" Inox 304',
    normalizedDescription: 'TE RETO OD 2 INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9',
    },
    unit: 'UN',
    baseCost: 68.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_4',
    organizationId: 'default',
    internalCode: 'TEE-RED-304-2X15',
    manufacturerCode: 'TEE-RED-OD-304-50X38',
    brand: 'Conforja',
    originalDescription: 'Tê de redução OD 2" x 1.1/2" Inox 304',
    normalizedDescription: 'TE DE REDUCAO OD 2 X 1.1/2 INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2" x 1.1/2"',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9',
    },
    unit: 'UN',
    baseCost: 82.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_5',
    organizationId: 'default',
    internalCode: 'TEE-RED-304-3X15',
    manufacturerCode: 'TEE-RED-OD-304-76X38',
    brand: 'Conforja',
    originalDescription: 'Tê de redução OD 3" x 1.1/2" Inox 304',
    normalizedDescription: 'TE DE REDUCAO OD 3 X 1.1/2 INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '3" x 1.1/2"',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9',
    },
    unit: 'UN',
    baseCost: 115.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_6',
    organizationId: 'default',
    internalCode: 'NIP-TC-304-15',
    manufacturerCode: 'NIP-TC-304-DN38',
    brand: 'Inoxtech',
    originalDescription: 'Niple Tri-Clamp TC 1.1/2" Inox 304',
    normalizedDescription: 'NIPLE TRI-CLAMP TC 1.1/2 INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '1.1/2 pol',
      connectionType: 'Tri-Clamp TC',
      standardNorm: 'BS 4825',
    },
    unit: 'UN',
    baseCost: 54.0,
    currency: 'BRL',
    supplierName: 'Inoxtech Conexões Sanitárias',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_7',
    organizationId: 'default',
    internalCode: 'UNI-SMS-304-3',
    manufacturerCode: 'SMS-WLD-304-DN76',
    brand: 'Apolo / Inoxtech',
    originalDescription: 'União completa de 3" Inox 304 SMS EPDM',
    normalizedDescription: 'UNIAO COMPLETA DE 3 INOX 304 SMS EPDM',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '3 pol',
      connectionType: 'Solda SMS OD',
      standardNorm: 'SMS 1145',
    },
    unit: 'UN',
    baseCost: 180.0,
    currency: 'BRL',
    supplierName: 'Inoxtech Conexões Sanitárias',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_curve_4',
    organizationId: 'default',
    internalCode: 'CUR-OD90-304-4',
    manufacturerCode: 'ELB-90-OD-304-DN100',
    brand: 'Conforja',
    originalDescription: 'Curva OD 90 graus Inox 304 4"',
    normalizedDescription: 'CURVA OD 90 GRAUS INOX 304 4',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '4 pol',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9 / DIN 11850',
    },
    unit: 'UN',
    baseCost: 110.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_curve_3',
    organizationId: 'default',
    internalCode: 'CUR-OD90-304-3',
    manufacturerCode: 'ELB-90-OD-304-DN76',
    brand: 'Conforja',
    originalDescription: 'Curva OD 90 graus Inox 304 3"',
    normalizedDescription: 'CURVA OD 90 GRAUS INOX 304 3',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '3 pol',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9 / DIN 11850',
    },
    unit: 'UN',
    baseCost: 78.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_curve_15',
    organizationId: 'default',
    internalCode: 'CUR-OD90-304-15',
    manufacturerCode: 'ELB-90-OD-304-DN38',
    brand: 'Conforja',
    originalDescription: 'Curva OD 90 graus Inox 304 1.1/2"',
    normalizedDescription: 'CURVA OD 90 GRAUS INOX 304 1.1/2',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '1.1/2 pol',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9 / DIN 11850',
    },
    unit: 'UN',
    baseCost: 38.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_tee_3',
    organizationId: 'default',
    internalCode: 'TEE-RET-304-3',
    manufacturerCode: 'TEE-STR-OD-304-DN76',
    brand: 'Conforja',
    originalDescription: 'Tê reto OD 3" Inox 304',
    normalizedDescription: 'TE RETO OD 3 INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '3 pol',
      connectionType: 'Solda OD',
      standardNorm: 'ASME B16.9',
    },
    unit: 'UN',
    baseCost: 125.0,
    currency: 'BRL',
    supplierName: 'Conforja Tubos e Conexões',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_nip_2',
    organizationId: 'default',
    internalCode: 'NIP-TC-304-2',
    manufacturerCode: 'NIP-TC-304-DN50',
    brand: 'Inoxtech',
    originalDescription: 'Niple Tri-Clamp TC 2" Inox 304',
    normalizedDescription: 'NIPLE TRI-CLAMP TC 2 INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      connectionType: 'Tri-Clamp TC',
      standardNorm: 'BS 4825',
    },
    unit: 'UN',
    baseCost: 68.0,
    currency: 'BRL',
    supplierName: 'Inoxtech Conexões Sanitárias',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_uni_15',
    organizationId: 'default',
    internalCode: 'UNI-SMS-304-15',
    manufacturerCode: 'SMS-WLD-304-DN38',
    brand: 'Apolo / Inoxtech',
    originalDescription: 'União Solda SMS OD 1.1/2" EPDM Inox 304',
    normalizedDescription: 'UNIAO SOLDA SMS OD 1.1/2 EPDM INOX 304',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '1.1/2 pol',
      connectionType: 'Solda SMS OD',
      standardNorm: 'SMS 1145',
    },
    unit: 'UN',
    baseCost: 95.0,
    currency: 'BRL',
    supplierName: 'Inoxtech Conexões Sanitárias',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_8',
    organizationId: 'default',
    internalCode: 'TB-INX-304-2-S10',
    manufacturerCode: 'TUB-304-SCH10-DN50',
    brand: 'Aperam',
    originalDescription: 'Tubo Aço Inox 304 com costura SCH 10 2" DN50 ASTM A312',
    normalizedDescription: 'TUBO ACO INOX 304 COM COSTURA SCH 10 2 DN50 ASTM A312',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      scheduleClass: 'SCH 10',
      connectionType: 'Solda BW',
      standardNorm: 'ASTM A312',
    },
    unit: 'M',
    baseCost: 85.50,
    currency: 'BRL',
    supplierName: 'Aperam South America',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Tubulações',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_9',
    organizationId: 'default',
    internalCode: 'TB-INX-316L-3-S40',
    manufacturerCode: 'TUB-316L-SCH40-DN80',
    brand: 'Villares Metals',
    originalDescription: 'Tubo Inox 316L sem costura SCH 40 3" decapado ASTM A312',
    normalizedDescription: 'TUBO INOX 316L SEM COSTURA SCH 40 3 DECAPADO ASTM A312',
    technicalSpecs: {
      materialGrade: 'AISI 316L',
      dimension: '3 pol',
      scheduleClass: 'SCH 40',
      connectionType: 'Solda BW',
      standardNorm: 'ASTM A312',
    },
    unit: 'M',
    baseCost: 245.0,
    currency: 'BRL',
    supplierName: 'Inoxtech Distribuidora',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Tubulações',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_10',
    organizationId: 'default',
    internalCode: 'VAL-BOR-304-2-WAF',
    manufacturerCode: 'BFLY-VLV-304-DN50',
    brand: 'Bray Controls',
    originalDescription: 'Válvula Borboleta Wafer Inox 304 EPDM 2" 150#',
    normalizedDescription: 'VALVULA BORBOLETA WAFER INOX 304 EPDM 2 150#',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      scheduleClass: '150#',
      connectionType: 'Wafer',
      standardNorm: 'API 609',
    },
    unit: 'UN',
    baseCost: 380.0,
    currency: 'BRL',
    supplierName: 'Bray Controls Brasil',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Válvulas',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'std_mat_11',
    organizationId: 'default',
    internalCode: 'FLG-WNR-304-2-150',
    manufacturerCode: 'FLG-WN-RF-150-DN50',
    brand: 'Tenaris',
    originalDescription: 'Flange Pescoço Weld Neck RF Inox 304 2" 150# SCH 10',
    normalizedDescription: 'FLANGE PESCOCO WELD NECK RF INOX 304 2 150# SCH 10',
    technicalSpecs: {
      materialGrade: 'AISI 304',
      dimension: '2 pol',
      scheduleClass: '150# SCH 10',
      connectionType: 'Solda BW / Flangeado',
      standardNorm: 'ASME B16.5',
    },
    unit: 'UN',
    baseCost: 72.0,
    currency: 'BRL',
    supplierName: 'Aços Granjo',
    sourceType: 'cotacao_confirmada',
    validityDays: 30,
    quoteDate: new Date().toISOString().split('T')[0],
    category: 'Conexões',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// Generate and download a standard industrial Excel spreadsheet template (.xlsx)
export function downloadSampleExcelTemplate(): void {
  const templateData = STANDARD_INDUSTRIAL_CATALOG.map((m) => ({
    'Código Interno': m.internalCode,
    'Código Fabricante': m.manufacturerCode || '',
    Marca: m.brand || '',
    Descrição: m.originalDescription,
    'Especificação Técnica': `${m.technicalSpecs.materialGrade || ''} ${m.technicalSpecs.dimension || ''} ${m.technicalSpecs.connectionType || ''}`.trim(),
    Unidade: m.unit,
    Quantidade: m.unit === 'M' ? 60 : 10,
    'Custo Base (R$)': m.baseCost,
    Fornecedor: m.supplierName || 'Fornecedor Homologado',
    'Validade Cotação (Dias)': m.validityDays || 30,
    Categoria: m.category || 'Geral',
  }));

  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo_OrçaÁgil');
  XLSX.writeFile(wb, 'Modelo_Padrao_Importacao_OrcaAgil.xlsx');
}

// Client-side text parsing fallback from PDF base64
export function extractClientSidePdfFallback(fileName: string, base64Data: string): ExtractedSupplierQuote {
  const todayStr = new Date().toISOString().split('T')[0];
  const items: ExtractedQuoteItem[] = [];

  let decodedText = '';
  try {
    const raw = atob(base64Data);
    // Extract readable ascii strings
    decodedText = raw.replace(/[^\x20-\x7E\r\n]/g, ' ');
  } catch {
    decodedText = '';
  }

  // Heuristic scan for common industrial piping patterns in raw text
  const patterns = [
    { regex: /tubo[^\n\r,;]+/i, category: 'Tubulações', unit: 'M', code: 'TB-INX' },
    { regex: /v[áa]lvula[^\n\r,;]+/i, category: 'Válvulas', unit: 'UN', code: 'VAL-VLV' },
    { regex: /flange[^\n\r,;]+/i, category: 'Conexões', unit: 'UN', code: 'FLG-WNR' },
    { regex: /curva[^\n\r,;]+/i, category: 'Conexões', unit: 'UN', code: 'CUR-90' },
    { regex: /junta[^\n\r,;]+/i, category: 'Vedações', unit: 'UN', code: 'JNT-VED' },
  ];

  let itemIdx = 1;
  for (const p of patterns) {
    const m = decodedText.match(p.regex);
    if (m && m[0].trim().length > 5) {
      items.push({
        id: `fb_item_${itemIdx}`,
        internalCode: `${p.code}-${itemIdx}`,
        description: m[0].trim().slice(0, 80),
        unit: p.unit,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        category: p.category,
        flags: ['Preço unitário a conferir'],
      });
      itemIdx++;
    }
  }

  // Do NOT inject fake placeholder items
  const supplierGuess = fileName
    ? fileName
        .replace(/\.[^/.]+$/, '')
        .replace(/cotacao|orcamento|proposta|nf-e|nfe/gi, '')
        .replace(/[-_]/g, ' ')
        .trim()
    : 'Fornecedor Identificado';
  const isImg = isImageFileType(fileName, '');

  return {
    supplierName: supplierGuess || 'Fornecedor da Cotação',
    quoteDate: todayStr,
    validityDays: 30,
    quoteNumber: fileName ? fileName.replace(/\.[^/.]+$/, '') : (isImg ? 'COT-IMG-001' : 'COT-PDF-001'),
    currency: 'BRL',
    notes: isImg
      ? 'Extração assistida por leitor de imagem/scan. Revise e confirme os valores na tabela.'
      : 'Extração assistida por leitor de documento. Revise e confirme os valores na tabela.',
    fileName: fileName || (isImg ? 'cotacao.png' : 'cotacao.pdf'),
    fileType: isImg ? 'image/jpeg' : 'application/pdf',
    items,
  };
}

export function isImageFileType(fileName?: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true;
  if (!fileName) return false;
  return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName);
}

export async function callParseSupplierQuotePdfApi(
  fileBase64: string,
  fileName: string,
  mimeType: string = 'application/pdf',
  existingCatalog?: CommercialMaterial[]
): Promise<ExtractedSupplierQuote> {
  const isImage = isImageFileType(fileName, mimeType);
  const normalizedMime = isImage
    ? (mimeType && mimeType.startsWith('image/') ? mimeType : (fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'))
    : (mimeType || 'application/pdf');

  // Preserve full data URI for preview display
  const previewDataUrl = fileBase64.startsWith('data:')
    ? fileBase64
    : `data:${normalizedMime};base64,${fileBase64}`;

  // Strip data URL scheme if present for the raw payload
  let cleanBase64 = fileBase64;
  if (fileBase64.startsWith('data:')) {
    const commaIndex = fileBase64.indexOf(',');
    if (commaIndex !== -1) {
      cleanBase64 = fileBase64.slice(commaIndex + 1);
    }
  }

  const effectiveCatalog = (existingCatalog && existingCatalog.length > 0)
    ? existingCatalog
    : STANDARD_INDUSTRIAL_CATALOG;

  // Build lightweight catalog summary for backend AI grounding
  const catalogSummary = effectiveCatalog.slice(0, 300).map((m) => ({
    id: m.id,
    internalCode: m.internalCode,
    description: m.originalDescription || m.normalizedDescription,
    baseCost: Number(m.baseCost) || 0,
    unit: m.unit || 'UN',
  }));

  try {
    const response = await apiFetch('/api/ai/parse-supplier-quote-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: cleanBase64,
        fileName,
        mimeType: normalizedMime,
        catalogSummary,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result = await response.json();
      const quote = (result?.data || result) as ExtractedSupplierQuote;
      if (quote && Array.isArray(quote.items) && quote.items.length > 0) {
        return {
          ...quote,
          filePreviewUrl: isImage ? previewDataUrl : undefined,
          fileType: normalizedMime,
        };
      }
    } else {
      const textSample = await response.text();
      console.warn('API returned non-JSON response:', response.status, textSample.slice(0, 100));
    }
  } catch (err) {
    console.warn('Falha na requisição de extração de documento/imagem, ativando leitor local:', err);
  }

  // Robust client-side fallback: guarantees NO unhandled JSON syntax errors
  const fallback = extractClientSidePdfFallback(fileName, cleanBase64);
  return {
    ...fallback,
    filePreviewUrl: isImage ? previewDataUrl : undefined,
    fileType: normalizedMime,
  };
}

export const callParseSupplierQuoteDocumentApi = callParseSupplierQuotePdfApi;

export function isWordFileType(fileName?: string, mimeType?: string): boolean {
  if (mimeType && (mimeType.includes('word') || mimeType.includes('officedocument.wordprocessingml'))) return true;
  if (!fileName) return false;
  return /\.(docx|doc)$/i.test(fileName);
}

export function isExcelFileType(fileName?: string, mimeType?: string): boolean {
  if (mimeType && (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv'))) return true;
  if (!fileName) return false;
  return /\.(xlsx|xls|csv)$/i.test(fileName);
}

export function isSupportedQuoteFile(fileName?: string, mimeType?: string): boolean {
  if (!fileName && !mimeType) return false;
  if (mimeType === 'application/pdf' || (mimeType && mimeType.startsWith('image/'))) return true;
  if (fileName) {
    return /\.(pdf|jpg|jpeg|png|webp|gif|bmp|docx|doc|xlsx|xls|csv|txt)$/i.test(fileName);
  }
  return false;
}

export function normalizeTextForMatching(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"“”]/g, ' pol ')
    .replace(/½/g, ' 1/2 ')
    .replace(/¼/g, ' 1/4 ')
    .replace(/¾/g, ' 3/4 ')
    .replace(/treto/g, 'te reto')
    .replace(/treducao/g, 'te reducao')
    .replace(/uniaocompleta/g, 'uniao completa')
    .replace(/curvasod/g, 'curva od')
    .replace(/nipletc/g, 'niple tc')
    .replace(/tri-clamp|triclamp/g, 'tc')
    .replace(/[^a-z0-9/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findBestCatalogMatch(
  item: ExtractedQuoteItem,
  existingCatalog: CommercialMaterial[]
): CommercialMaterial | undefined {
  const combinedCatalog = (existingCatalog && existingCatalog.length > 0)
    ? [...existingCatalog, ...STANDARD_INDUSTRIAL_CATALOG.filter((s) => !existingCatalog.some((e) => e.internalCode === s.internalCode))]
    : STANDARD_INDUSTRIAL_CATALOG;

  const normCode = (item.matchedInternalCode || item.internalCode || '').trim().toLowerCase();
  const normMfg = (item.manufacturerCode || '').trim().toLowerCase();
  const normDesc = normalizeTextForMatching(item.matchedMaterialName || item.description);

  const isAlphanumericCode = (code: string | undefined): boolean => {
    if (!code) return false;
    const stripped = code.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return stripped.length >= 3 && stripped !== 'scod' && stripped !== 'semcod';
  };

  const itemFamily = extractProductFamily(`${item.internalCode || ''} ${item.matchedInternalCode || ''} ${item.description || ''} ${item.category || ''}`);

  const isFamilyCompatible = (catItem: CommercialMaterial): boolean => {
    if (!catItem) return false;
    const catFamily = extractProductFamily(`${catItem.internalCode || ''} ${catItem.originalDescription || ''} ${catItem.category || ''}`);
    if (itemFamily !== 'outro' && catFamily !== 'outro' && itemFamily !== catFamily) {
      if (itemFamily === 'tubo' && ['uniao', 'curva', 'te', 'niple', 'valvula', 'flange'].includes(catFamily)) return false;
      if (['uniao', 'curva', 'te', 'niple', 'valvula', 'flange'].includes(itemFamily) && catFamily === 'tubo') return false;
      if (itemFamily !== catFamily) return false;
    }
    return true;
  };

  // 1. Exact internalCode match (only if valid alphanumeric code, not '-' or empty)
  if (isAlphanumericCode(normCode)) {
    const strippedNorm = normCode.replace(/[^a-z0-9]/g, '');
    const byCode = combinedCatalog.find((m) => {
      if (!isAlphanumericCode(m.internalCode)) return false;
      const strippedM = m.internalCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (strippedM !== strippedNorm) return false;
      return isFamilyCompatible(m);
    });
    if (byCode) return byCode;
  }

  // 2. Exact manufacturerCode match
  if (isAlphanumericCode(normMfg)) {
    const byMfg = combinedCatalog.find((m) => {
      const mfg = (m.manufacturerCode || '').trim().toLowerCase();
      if (!mfg || mfg !== normMfg) return false;
      return isFamilyCompatible(m);
    });
    if (byMfg) return byMfg;
  }

  // 3. Domain-specific industrial fittings matching rules (OrçaÁgil)
  // 3.1. União Sanitária SMS (3" vs 2" vs 1.1/2")
  if (normDesc.includes('uniao') || normDesc.includes('sms')) {
    const has3Inch = (normDesc.includes('3 pol') || normDesc.includes(' 3 ') || normDesc.includes('3x') || normDesc.includes('3"') || normDesc.includes("3'")) && !normDesc.includes('2');
    const has15Inch = normDesc.includes('1.1/2') || normDesc.includes('1 1/2') || normDesc.includes('1½') || normDesc.includes('38');

    if (has3Inch) {
      const match3 = combinedCatalog.find((m) => m.internalCode === 'UNI-SMS-304-3' || (m.originalDescription.toLowerCase().includes('uniao') && m.originalDescription.includes('3')));
      if (match3) return match3;
    }
    if (has15Inch && !has3Inch && !normDesc.includes('2')) {
      const match15 = combinedCatalog.find((m) => m.internalCode === 'UNI-SMS-304-15' || (m.originalDescription.toLowerCase().includes('uniao') && (m.originalDescription.includes('1.1/2') || m.originalDescription.includes('1 1/2'))));
      if (match15) return match15;
    }
    const match2 = combinedCatalog.find((m) => m.internalCode === 'UNI-SMS-304-2' || (m.originalDescription.toLowerCase().includes('uniao') && m.originalDescription.includes('2')));
    if (match2) return match2;
  }

  // 3.2. Curva OD 90 graus (4" vs 3" vs 2" vs 1.1/2")
  if (normDesc.includes('curva') || normDesc.includes('cotovelo') || normDesc.includes('elbow')) {
    const has4Inch = normDesc.includes('4 pol') || normDesc.includes(' 4 ') || normDesc.includes('4x') || normDesc.includes('4"') || normDesc.includes("4'");
    const has3Inch = (normDesc.includes('3 pol') || normDesc.includes(' 3 ') || normDesc.includes('3x') || normDesc.includes('3"') || normDesc.includes("3'")) && !has4Inch;
    const has15Inch = normDesc.includes('1.1/2') || normDesc.includes('1 1/2') || normDesc.includes('1½') || normDesc.includes('38');

    if (has4Inch) {
      const match4 = combinedCatalog.find((m) => m.internalCode === 'CUR-OD90-304-4' || (m.originalDescription.toLowerCase().includes('curva') && m.originalDescription.includes('4')));
      if (match4) return match4;
    }
    if (has3Inch) {
      const match3 = combinedCatalog.find((m) => m.internalCode === 'CUR-OD90-304-3' || (m.originalDescription.toLowerCase().includes('curva') && m.originalDescription.includes('3')));
      if (match3) return match3;
    }
    if (has15Inch) {
      const match15 = combinedCatalog.find((m) => m.internalCode === 'CUR-OD90-304-15' || (m.originalDescription.toLowerCase().includes('curva') && (m.originalDescription.includes('1.1/2') || m.originalDescription.includes('1 1/2'))));
      if (match15) return match15;
    }
    const matchCurva = combinedCatalog.find((m) => m.internalCode === 'CUR-OD90-304-2' || (m.originalDescription.toLowerCase().includes('curva') && m.originalDescription.includes('90')));
    if (matchCurva) return matchCurva;
  }

  // 3.3. Tê de Redução MUST ALWAYS be tested BEFORE Tê Reto
  const isReductionTee = normDesc.includes('reducao') || normDesc.includes('treducao') || normDesc.includes('red') || (normDesc.includes('x') && (normDesc.includes('1/2') || normDesc.includes('1.1/2')));
  if (normDesc.includes('te ') || normDesc.includes('tê') || normDesc.includes('treto') || normDesc.includes('tee') || isReductionTee) {
    if (isReductionTee) {
      // Tê de redução 3" x 1.1/2"
      if (normDesc.includes('3 pol') || normDesc.includes(' 3 ') || normDesc.includes('3x') || normDesc.includes('3 x') || normDesc.includes('3"')) {
        const matchRed3 = combinedCatalog.find((m) => m.internalCode === 'TEE-RED-304-3X15' || (m.originalDescription.toLowerCase().includes('reducao') && m.originalDescription.includes('3')));
        if (matchRed3) return matchRed3;
      }
      // Tê de redução 2" x 1.1/2"
      const matchRed2 = combinedCatalog.find((m) => m.internalCode === 'TEE-RED-304-2X15' || (m.originalDescription.toLowerCase().includes('reducao') && m.originalDescription.includes('2')));
      if (matchRed2) return matchRed2;
    } else {
      // Tê reto 3"
      if (normDesc.includes('3 pol') || normDesc.includes(' 3 ') || normDesc.includes('3"')) {
        const matchTe3 = combinedCatalog.find((m) => m.internalCode === 'TEE-RET-304-3' || (m.originalDescription.toLowerCase().includes('te') && m.originalDescription.includes('3')));
        if (matchTe3) return matchTe3;
      }
      // Tê reto OD 2"
      const matchTe = combinedCatalog.find((m) => m.internalCode === 'TEE-RET-304-2' || (m.originalDescription.toLowerCase().includes('te') && m.originalDescription.includes('reto')));
      if (matchTe) return matchTe;
    }
  }

  // 3.4. Niple TC (Tri-Clamp)
  if (normDesc.includes('niple') || normDesc.includes('nipple') || (normDesc.includes('tc') && !normDesc.includes('tubo'))) {
    const has3Inch = normDesc.includes('3 pol') || normDesc.includes(' 3 ') || normDesc.includes('3"');
    const has2Inch = normDesc.includes('2 pol') || normDesc.includes(' 2 ') || normDesc.includes('2"');

    if (has3Inch) {
      const matchNip3 = combinedCatalog.find((m) => m.internalCode === 'NIP-TC-304-3' || (m.originalDescription.toLowerCase().includes('niple') && m.originalDescription.includes('3')));
      if (matchNip3) return matchNip3;
    }
    if (has2Inch) {
      const matchNip2 = combinedCatalog.find((m) => m.internalCode === 'NIP-TC-304-2' || (m.originalDescription.toLowerCase().includes('niple') && m.originalDescription.includes('2')));
      if (matchNip2) return matchNip2;
    }
    const matchNip = combinedCatalog.find((m) => m.internalCode === 'NIP-TC-304-15' || m.originalDescription.toLowerCase().includes('niple'));
    if (matchNip) return matchNip;
  }

  // 4. Normalized description exact match
  if (normDesc) {
    const byExactDesc = combinedCatalog.find((m) => {
      const d = normalizeTextForMatching(m.originalDescription);
      const nd = normalizeTextForMatching(m.normalizedDescription);
      return (d === normDesc || nd === normDesc) && isFamilyCompatible(m);
    });
    if (byExactDesc) return byExactDesc;
  }

  // 5. Token & specification overlap match with strict family discipline
  if (normDesc.length >= 4) {
    const itemTokens = normDesc
      .split(' ')
      .filter((t) => t.length > 1 && !['de', 'em', 'com', 'para', 'pol'].includes(t));

    if (itemTokens.length > 0) {
      let bestScore = 0;
      let bestCandidate: CommercialMaterial | undefined;

      for (const mat of combinedCatalog) {
        // Enforce strict family discipline: NEVER cross tubes and fittings!
        if (!isFamilyCompatible(mat)) continue;

        const matFullText = normalizeTextForMatching(
          `${mat.internalCode} ${mat.originalDescription} ${mat.normalizedDescription || ''}`
        );
        const matTokens = matFullText.split(' ').filter((t) => t.length > 1);

        let sharedTokens = 0;
        for (const token of itemTokens) {
          // Whole token discrete match prevents substring collision like '4' matching inside '304'
          if (matTokens.includes(token)) {
            sharedTokens++;
          }
        }

        // Asymmetric coverage: what percentage of the item's key tokens exist in this catalog material?
        const coverage = sharedTokens / itemTokens.length;
        if (coverage >= 0.6 && coverage > bestScore) {
          bestScore = coverage;
          bestCandidate = mat;
        }
      }

      if (bestCandidate) return bestCandidate;
    }
  }

  return undefined;
}

/**
 * Intelligent Multi-Token Search for Materials Catalog
 * E.g.: query "tee 304" will match any material containing both "tee" (or "tê", "te", "treto", "treducao") AND "304",
 * regardless of word order, diacritics, or case, across codes, descriptions, categories, and technical specs.
 */
export function filterMaterialsByMultiToken(
  materials: CommercialMaterial[],
  searchTerm: string,
  categoryFilter: string = 'todos'
): CommercialMaterial[] {
  const normQuery = (searchTerm || '').trim();

  // If no search term and no category filter, return all
  if (!normQuery && categoryFilter === 'todos') {
    return materials;
  }

  // Tokenize and normalize query
  const rawTokens = normQuery
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"“”]/g, ' pol ')
    .replace(/½/g, ' 1/2 ')
    .replace(/¼/g, ' 1/4 ')
    .replace(/¾/g, ' 3/4 ')
    .replace(/[^a-z0-9/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Synonym mapping generator for each token
  const getSynonymTokens = (tok: string): string[] => {
    if (['te', 'tee', 'tê', 'treto', 'treducao', 'tredução', 'tees'].includes(tok)) {
      return ['te', 'tee', 'treto', 'treducao', 'reducao', 'red'];
    }
    if (['curva', 'curvas', 'cotovelo', 'elbow', 'od90', '90g', '90graus'].includes(tok)) {
      return ['curva', 'cotovelo', 'elbow', 'od90', '90'];
    }
    if (['uniao', 'união', 'sms', 'rjt', 'uniaos'].includes(tok)) {
      return ['uniao', 'sms', 'rjt'];
    }
    if (['niple', 'nipple', 'tc', 'tri-clamp', 'triclamp'].includes(tok)) {
      return ['niple', 'nipple', 'tc', 'clamp'];
    }
    if (['tubo', 'tubos', 'tubulacao', 'tubulação', 'pipe'].includes(tok)) {
      return ['tubo', 'tubulacao', 'pipe'];
    }
    if (['304', '304l', 'aisi304', 'tp304'].includes(tok)) {
      return ['304', '304l', 'tp-304'];
    }
    if (['316', '316l', 'aisi316', 'tp316'].includes(tok)) {
      return ['316', '316l', 'tp-316'];
    }
    return [tok];
  };

  const tokenGroups = rawTokens.map(getSynonymTokens);

  return materials
    .filter((m) => {
      // 1. Category check
      if (categoryFilter !== 'todos' && m.category !== categoryFilter) {
        return false;
      }

      if (tokenGroups.length === 0) return true;

      // 2. Build comprehensive searchable text with single-space normalization
      const specs = m.technicalSpecs || {};
      const searchableString = (
        `${m.internalCode} ${m.manufacturerCode || ''} ${m.brand || ''} ${m.originalDescription} ${m.normalizedDescription} ${m.category || ''} ${m.supplierName || ''} ${specs.materialGrade || ''} ${specs.dimension || ''} ${specs.scheduleClass || ''} ${specs.connectionType || ''} ${specs.standardNorm || ''} ${specs.notes || ''}`
      )
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['"“”]/g, ' pol ')
        .replace(/½/g, ' 1/2 ')
        .replace(/¼/g, ' 1/4 ')
        .replace(/¾/g, ' 3/4 ')
        .replace(/[^a-z0-9/]/g, ' ')
        .replace(/\s+/g, ' ');

      const searchTokens = searchableString.split(' ').filter(Boolean);

      // 3. Every token group must find at least one synonym in the material text
      return tokenGroups.every((synonyms) => {
        return synonyms.some((syn) => {
          return searchTokens.includes(syn) || searchableString.includes(` ${syn} `) || searchableString.startsWith(`${syn} `) || searchableString.endsWith(` ${syn}`);
        });
      });
    })
    .sort((a, b) => {
      // Score relevance: matches having tokens directly in internalCode or originalDescription rank higher
      const q = rawTokens.join(' ');
      const aDesc = (a.originalDescription || '').toLowerCase();
      const bDesc = (b.originalDescription || '').toLowerCase();
      const aHas = aDesc.includes(q) ? 2 : rawTokens.filter((t) => aDesc.includes(t)).length;
      const bHas = bDesc.includes(q) ? 2 : rawTokens.filter((t) => bDesc.includes(t)).length;
      return bHas - aHas;
    });
}

export function detectDuplicatesInCatalog(
  extractedItems: ExtractedQuoteItem[],
  existingCatalog: CommercialMaterial[]
): ExtractedQuoteItem[] {
  return extractedItems.map((item) => {
    const flags: string[] = Array.isArray(item.flags) ? [...item.flags] : [];
    const matchedMaterial = findBestCatalogMatch(item, existingCatalog);

    const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    let quotedPrice = Number(item.unitPrice) || 0;

    if (matchedMaterial) {
      const existingBaseCost = Number(matchedMaterial.baseCost) || Number(item.existingBaseCost) || 0;

      // If document had no unit price, reference catalog price
      if (quotedPrice <= 0 && existingBaseCost > 0) {
        quotedPrice = existingBaseCost;
        item.unitPrice = existingBaseCost;
        item.totalPrice = Math.round(existingBaseCost * qty * 100) / 100;
        flags.push(
          `🟢 Preço de catálogo referenciado: R$ ${existingBaseCost.toFixed(2)} (Subtotal: R$ ${(existingBaseCost * qty).toFixed(2)})`
        );
      }

      let priceVariationDelta = 0;
      let priceVariationPercent = 0;
      let totalPotentialSaving = 0;
      let comparisonStatus: 'cheaper' | 'more_expensive' | 'identical' = 'identical';

      if (quotedPrice > 0 && existingBaseCost > 0) {
        priceVariationDelta = Math.round((quotedPrice - existingBaseCost) * 100) / 100;
        priceVariationPercent = Math.round(((quotedPrice - existingBaseCost) / existingBaseCost) * 1000) / 10;

        if (priceVariationPercent <= -1.0) {
          comparisonStatus = 'cheaper';
          totalPotentialSaving = Math.round((existingBaseCost - quotedPrice) * qty * 100) / 100;
          flags.push(
            `🟢 Economia de ${Math.abs(priceVariationPercent)}% em relação ao catálogo (Atual: R$ ${existingBaseCost.toFixed(2)})`
          );
        } else if (priceVariationPercent >= 1.0) {
          comparisonStatus = 'more_expensive';
          flags.push(
            `🔴 Custo ${priceVariationPercent}% superior ao valor cadastrado no catálogo (Atual: R$ ${existingBaseCost.toFixed(2)})`
          );
        } else {
          comparisonStatus = 'identical';
          if (!flags.some((f) => f.includes('referenciado'))) {
            flags.push(`🟡 Preço equivalente ao catálogo (Atual: R$ ${existingBaseCost.toFixed(2)})`);
          }
        }
      }

      return {
        ...item,
        unitPrice: quotedPrice,
        totalPrice: Number(item.totalPrice) > 0 ? Number(item.totalPrice) : Math.round(quotedPrice * qty * 100) / 100,
        isDuplicate: true,
        duplicateMatchId: matchedMaterial.id,
        internalCode: item.internalCode || matchedMaterial.internalCode,
        matchedInternalCode: matchedMaterial.internalCode,
        matchedMaterialName: matchedMaterial.originalDescription,
        existingBaseCost,
        existingSupplier: matchedMaterial.supplierName || 'Fornecedor Atual',
        existingQuoteDate: matchedMaterial.quoteDate,
        existingValidityDays: matchedMaterial.validityDays,
        priceVariationDelta,
        priceVariationPercent,
        totalPotentialSaving,
        comparisonStatus,
        flags,
      };
    }

    // Check for missing data on unmatched items
    if (!quotedPrice || quotedPrice <= 0) {
      if (!flags.some((f) => f.includes('Preço'))) {
        flags.push('Preço unitário zerado ou não identificado no documento');
      }
    }
    if (!item.unit || item.unit.trim().length === 0) {
      if (!flags.some((f) => f.includes('Unidade'))) {
        flags.push('Unidade de medida indefinida');
      }
    }

    flags.push('⚪ Insumo inédito: não encontrado no catálogo atual');
    return {
      ...item,
      isDuplicate: false,
      comparisonStatus: 'new' as const,
      flags,
    };
  });
}

export function enrichSupplierQuoteWithComparison(
  quote: ExtractedSupplierQuote,
  existingCatalog: CommercialMaterial[]
): ExtractedSupplierQuote {
  const items = detectDuplicatesInCatalog(quote.items || [], existingCatalog);

  let matchedItemsCount = 0;
  let unmatchedNewCount = 0;
  let cheaperItemsCount = 0;
  let moreExpensiveCount = 0;
  let identicalItemsCount = 0;
  let totalQuotedAmount = 0;
  let totalCatalogBaselineAmount = 0;
  let totalPotentialSavings = 0;

  items.forEach((it) => {
    const qty = it.quantity || 1;
    const up = it.unitPrice || 0;
    totalQuotedAmount += up * qty;

    if (it.isDuplicate && it.existingBaseCost !== undefined) {
      matchedItemsCount++;
      totalCatalogBaselineAmount += (it.existingBaseCost || 0) * qty;

      if (it.comparisonStatus === 'cheaper') {
        cheaperItemsCount++;
        totalPotentialSavings += it.totalPotentialSaving || 0;
      } else if (it.comparisonStatus === 'more_expensive') {
        moreExpensiveCount++;
      } else {
        identicalItemsCount++;
      }
    } else {
      unmatchedNewCount++;
    }
  });

  const netFinancialDelta = Math.round((totalQuotedAmount - totalCatalogBaselineAmount) * 100) / 100;
  const netFinancialDeltaPercent =
    totalCatalogBaselineAmount > 0
      ? Math.round((netFinancialDelta / totalCatalogBaselineAmount) * 1000) / 10
      : 0;

  return {
    ...quote,
    items,
    matchedItemsCount,
    unmatchedNewCount,
    cheaperItemsCount,
    moreExpensiveCount,
    identicalItemsCount,
    totalQuotedAmount: Math.round(totalQuotedAmount * 100) / 100,
    totalCatalogBaselineAmount: Math.round(totalCatalogBaselineAmount * 100) / 100,
    totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
    netFinancialDelta,
    netFinancialDeltaPercent,
  };
}

export async function saveExtractedQuoteToCatalog(
  organizationId: string,
  quoteData: ExtractedSupplierQuote,
  itemsToSave: ExtractedQuoteItem[],
  userName: string
): Promise<{ savedCount: number; updatedCount: number }> {
  let savedCount = 0;
  let updatedCount = 0;
  const today = quoteData.quoteDate || new Date().toISOString().split('T')[0];
  const sourceRef = `PDF: ${quoteData.fileName}${quoteData.quoteNumber ? ` (${quoteData.quoteNumber})` : ''}`;

  const createdMaterialIds: string[] = [];
  const updatedMaterialsSnapshots: MaterialPreviousSnapshot[] = [];
  const importedItemsSnapshot: ImportedItemAuditRecord[] = [];

  for (let idx = 0; idx < itemsToSave.length; idx++) {
    const it = itemsToSave[idx];
    const generatedCode = it.internalCode || `MAT-${Date.now().toString().slice(-5)}-${idx + 1}`;

    if (it.duplicateMatchId) {
      // Material already exists: Update latest quote without destroying identification
      const existingDocRef = doc(db, 'commercial_materials', it.duplicateMatchId);
      const existingDoc = await getDoc(existingDocRef);

      if (existingDoc.exists()) {
        const existingData = existingDoc.data() as CommercialMaterial;
        const prevBaseCost = existingData.baseCost || 0;

        updatedMaterialsSnapshots.push({
          materialId: it.duplicateMatchId,
          internalCode: existingData.internalCode,
          description: existingData.originalDescription,
          previousBaseCost: prevBaseCost,
          newBaseCost: it.unitPrice > 0 ? it.unitPrice : prevBaseCost,
          previousSupplierName: existingData.supplierName,
          previousQuoteDate: existingData.quoteDate,
          previousValidityDays: existingData.validityDays,
        });

        const updatedPayload: Partial<CommercialMaterial> = cleanFirestoreData({
          baseCost: it.unitPrice > 0 ? it.unitPrice : existingData.baseCost,
          supplierName: quoteData.supplierName || existingData.supplierName,
          quoteDate: today,
          validityDays: quoteData.validityDays || existingData.validityDays || 30,
          sourceType: 'cotacao_confirmada',
          sourceDocumentRef: sourceRef,
          updatedAt: new Date().toISOString(),
        });

        await updateDoc(existingDocRef, updatedPayload);
        updatedCount++;

        importedItemsSnapshot.push({
          materialId: it.duplicateMatchId,
          internalCode: existingData.internalCode,
          description: existingData.originalDescription,
          unit: existingData.unit,
          baseCost: it.unitPrice > 0 ? it.unitPrice : prevBaseCost,
          supplierName: quoteData.supplierName || existingData.supplierName,
          category: existingData.category,
          actionTaken: 'atualizado',
        });
        continue;
      }
    }

    // New material creation
    const newId = `mat_quote_${Date.now()}_${idx + 1}`;
    const newMaterial: CommercialMaterial = {
      id: newId,
      organizationId,
      internalCode: generatedCode.toUpperCase(),
      manufacturerCode: it.manufacturerCode || undefined,
      brand: it.brand || undefined,
      originalDescription: it.description,
      normalizedDescription: it.description.toUpperCase(),
      technicalSpecs: {
        materialGrade: it.materialGrade || undefined,
        dimension: it.dimension || undefined,
        scheduleClass: it.scheduleClass || undefined,
        connectionType: it.connectionType || undefined,
        standardNorm: it.standardNorm || undefined,
        notes: it.specs || undefined,
      },
      unit: (it.unit || 'UN').toUpperCase(),
      baseCost: it.unitPrice > 0 ? it.unitPrice : 0,
      currency: quoteData.currency || 'BRL',
      supplierName: quoteData.supplierName,
      sourceType: 'cotacao_confirmada',
      quoteDate: today,
      validityDays: quoteData.validityDays || 30,
      category: it.category || 'Geral',
      sourceDocumentRef: sourceRef,
      importedBy: userName,
      createdAt: new Date().toISOString(),
    };

    await saveMaterial(newMaterial);
    createdMaterialIds.push(newId);
    savedCount++;

    importedItemsSnapshot.push({
      materialId: newId,
      internalCode: generatedCode.toUpperCase(),
      description: it.description,
      unit: (it.unit || 'UN').toUpperCase(),
      baseCost: it.unitPrice > 0 ? it.unitPrice : 0,
      category: it.category || 'Geral',
      supplierName: quoteData.supplierName,
      actionTaken: 'criado',
    });
  }

  // Register audit batch in commercial_imports
  const importBatch: CommercialImportBatch = {
    id: `batch_pdf_${Date.now()}`,
    organizationId,
    batchCode: `IMP-PDF-${Date.now().toString().slice(-6)}`,
    fileName: quoteData.fileName,
    sourceType: 'COTACAO_FORNECEDOR',
    importedBy: userName,
    importedByName: userName,
    createdAt: new Date().toISOString(),
    totalRowsRead: itemsToSave.length,
    acceptedRows: itemsToSave.filter((i) => i.unitPrice > 0).length,
    duplicateRows: updatedCount,
    incompleteRows: itemsToSave.filter((i) => i.unitPrice <= 0).length,
    rejectedRows: 0,
    status: 'processado',
    createdMaterialIds,
    updatedMaterialsSnapshots,
    importedItemsSnapshot,
    isReverted: false,
  };

  await saveImportBatch(importBatch);

  return { savedCount, updatedCount };
}



