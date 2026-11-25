import type { Item } from '../types';
import type { CommercialMaterial } from '../types/commercial';

export interface MasterItemMatchSuggestion {
  itemId: string;
  itemSku: string;
  itemName: string;
  unitOfMeasure: string;
  score: number;
  reasons: string[];
  requiresHumanReview: true;
}

export interface MaterialCatalogLinkPatch {
  masterItemId: string | null;
  masterItemSku: string | null;
  masterItemName: string | null;
  masterLinkStatus: 'linked' | 'unlinked';
  masterLinkConfirmedBy: string;
  masterLinkConfirmedAt: string;
  masterLinkNotes?: string;
  updatedAt: string;
}

export interface MaterialCatalogLinkAudit {
  orgId: string;
  totalCommercialMaterials: number;
  linkedCount: number;
  unlinkedCount: number;
  brokenLinkCount: number;
  brokenMaterials: Array<{
    materialId: string;
    internalCode: string;
    description: string;
    masterItemId: string;
    reason: string;
  }>;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUnit(value: string | null | undefined): string {
  const raw = normalizeText(value);
  const aliases: Record<string, string> = {
    un: 'un',
    und: 'un',
    unid: 'un',
    unidade: 'un',
    pc: 'un',
    pca: 'un',
    peca: 'un',
    m: 'm',
    mt: 'm',
    metro: 'm',
    metros: 'm',
    kg: 'kg',
    quilo: 'kg',
    l: 'l',
    lt: 'l',
    litro: 'l',
    br: 'barra',
    barra: 'barra',
    cx: 'cx',
    caixa: 'cx',
  };
  return aliases[raw] || raw;
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((t) => t.length >= 2),
  );
}

/**
 * Ranks master `items` candidates for a commercial material.
 * Strictly read-only suggestions requiring explicit human review (never auto-links).
 */
export function suggestMasterItemMatches(
  material: Pick<CommercialMaterial, 'organizationId' | 'internalCode' | 'manufacturerCode' | 'normalizedDescription' | 'originalDescription' | 'unit'>,
  masterItems: readonly Item[],
  maxResults = 5,
): MasterItemMatchSuggestion[] {
  const matCode = normalizeText(material.internalCode);
  const matMfg = normalizeText(material.manufacturerCode);
  const matDesc = normalizeText(material.normalizedDescription || material.originalDescription);
  const matTokens = tokenize(matDesc);
  const matUnit = normalizeUnit(material.unit);

  const suggestions: MasterItemMatchSuggestion[] = [];

  for (const item of masterItems) {
    if (item.orgId !== material.organizationId) continue;
    if (!item.active || item.status === 'INACTIVE') continue;

    let score = 0;
    const reasons: string[] = [];

    const itemSku = normalizeText(item.sku);
    const itemCode = normalizeText(item.code);
    const itemName = normalizeText(item.name);
    const itemDesc = normalizeText(`${item.name} ${item.description || ''}`);
    const itemUnit = normalizeUnit(item.unitOfMeasure);

    if (matCode && (matCode === itemSku || (itemCode && matCode === itemCode))) {
      score += 60;
      reasons.push('Código interno coincide exatamente com o SKU/código mestre.');
    } else if (matMfg && (matMfg === itemSku || (itemCode && matMfg === itemCode))) {
      score += 45;
      reasons.push('Código do fabricante coincide com o SKU/código mestre.');
    }

    if (matDesc && itemName && matDesc === itemName) {
      score += 40;
      reasons.push('Descrição normalizada idêntica ao nome do item mestre.');
    } else if (matTokens.size > 0) {
      const itemTokens = tokenize(itemDesc);
      let shared = 0;
      for (const tok of matTokens) {
        if (itemTokens.has(tok)) shared++;
      }
      const ratio = shared / Math.max(matTokens.size, itemTokens.size || 1);
      if (ratio >= 0.4 && shared >= 2) {
        score += Math.round(ratio * 35);
        reasons.push(`Sobreposição de ${shared} termo(s) técnico(s) na descrição.`);
      }
    }

    if (score > 0 && matUnit && itemUnit && matUnit === itemUnit) {
      score += 10;
      reasons.push(`Unidade de medida compatível (${item.unitOfMeasure}).`);
    }

    if (score > 0) {
      suggestions.push({
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        unitOfMeasure: item.unitOfMeasure,
        score: Math.min(100, score),
        reasons,
        requiresHumanReview: true,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score || a.itemSku.localeCompare(b.itemSku));
  return suggestions.slice(0, maxResults);
}

/**
 * Validates and builds an explicit, human-confirmed link patch from a commercial material
 * to an active master catalog item in the same organization.
 */
export function buildMaterialMasterLinkPatch(params: {
  material: Pick<CommercialMaterial, 'id' | 'organizationId'>;
  masterItem: Pick<Item, 'id' | 'orgId' | 'sku' | 'name' | 'active' | 'status'>;
  actorUid: string;
  actorName: string;
  notes?: string;
  nowIso?: string;
}): MaterialCatalogLinkPatch {
  const { material, masterItem, actorUid, actorName, notes } = params;
  if (!actorUid?.trim() || !actorName?.trim()) {
    throw new Error('Usuário autenticado é obrigatório para confirmar o vínculo de material.');
  }
  if (!material.id?.trim() || !material.organizationId?.trim()) {
    throw new Error('Material comercial inválido.');
  }
  if (!masterItem.id?.trim() || !masterItem.orgId?.trim()) {
    throw new Error('Item do catálogo mestre inválido.');
  }
  if (material.organizationId !== masterItem.orgId) {
    throw new Error('O item do catálogo mestre pertence a outra empresa.');
  }
  if (!masterItem.active || masterItem.status === 'INACTIVE') {
    throw new Error('Não é possível vincular a um item inativo do catálogo mestre.');
  }

  const now = params.nowIso || new Date().toISOString();
  return {
    masterItemId: masterItem.id,
    masterItemSku: masterItem.sku,
    masterItemName: masterItem.name,
    masterLinkStatus: 'linked',
    masterLinkConfirmedBy: `${actorName.trim()} (${actorUid.trim()})`,
    masterLinkConfirmedAt: now,
    ...(notes?.trim() ? { masterLinkNotes: notes.trim() } : {}),
    updatedAt: now,
  };
}

export function buildMaterialMasterUnlinkPatch(params: {
  actorUid: string;
  actorName: string;
  reason?: string;
  nowIso?: string;
}): MaterialCatalogLinkPatch {
  if (!params.actorUid?.trim() || !params.actorName?.trim()) {
    throw new Error('Usuário autenticado é obrigatório para remover o vínculo de material.');
  }
  const now = params.nowIso || new Date().toISOString();
  return {
    masterItemId: null,
    masterItemSku: null,
    masterItemName: null,
    masterLinkStatus: 'unlinked',
    masterLinkConfirmedBy: `${params.actorName.trim()} (${params.actorUid.trim()})`,
    masterLinkConfirmedAt: now,
    ...(params.reason?.trim() ? { masterLinkNotes: params.reason.trim() } : {}),
    updatedAt: now,
  };
}

export function auditMaterialCatalogLinks(params: {
  orgId: string;
  commercialMaterials: readonly CommercialMaterial[];
  masterItems: readonly Item[];
}): MaterialCatalogLinkAudit {
  const { orgId } = params;
  const masterById = new Map<string, Item>();
  for (const item of params.masterItems) {
    if (!orgId || item.orgId === orgId) masterById.set(item.id, item);
  }

  const scopedMaterials = params.commercialMaterials.filter((m) => !orgId || m.organizationId === orgId);
  let linkedCount = 0;
  let unlinkedCount = 0;
  const brokenMaterials: MaterialCatalogLinkAudit['brokenMaterials'] = [];

  for (const mat of scopedMaterials) {
    const refId = (mat.masterItemId || '').trim();
    if (!refId) {
      unlinkedCount++;
      continue;
    }
    const target = masterById.get(refId);
    if (!target) {
      brokenMaterials.push({
        materialId: mat.id,
        internalCode: mat.internalCode,
        description: mat.normalizedDescription || mat.originalDescription,
        masterItemId: refId,
        reason: 'Item mestre referenciado não foi encontrado nesta empresa.',
      });
      continue;
    }
    if (!target.active || target.status === 'INACTIVE') {
      brokenMaterials.push({
        materialId: mat.id,
        internalCode: mat.internalCode,
        description: mat.normalizedDescription || mat.originalDescription,
        masterItemId: refId,
        reason: 'Item mestre referenciado está inativo.',
      });
      continue;
    }
    linkedCount++;
  }

  return {
    orgId,
    totalCommercialMaterials: scopedMaterials.length,
    linkedCount,
    unlinkedCount,
    brokenLinkCount: brokenMaterials.length,
    brokenMaterials,
  };
}
