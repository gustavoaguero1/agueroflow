import type { Asset } from '../types/index.ts';
import type { CollectiveAsset } from '../types/collectiveAssets.ts';

export interface AssetAvailabilityCheck {
  available: boolean;
  blockers: string[];
}

function isoDateOnly(nowIso: string): string {
  return String(nowIso || new Date().toISOString()).slice(0, 10);
}

/**
 * Evaluates whether a registered Asset or CollectiveAsset can be allocated to a
 * Work Order, inspection, or field checkout. Blocks equipment under maintenance,
 * retired/inactive, or with expired calibration.
 */
export function evaluateAssetAvailability(
  asset: Partial<Asset & { calibrationDueDate?: string }> | null | undefined,
  nowIso: string = new Date().toISOString(),
): AssetAvailabilityCheck {
  if (!asset) {
    return { available: false, blockers: ['Ativo/equipamento não encontrado nesta empresa.'] };
  }
  const blockers: string[] = [];
  const label = asset.tag ? `${asset.tag} (${asset.name || asset.id})` : asset.name || asset.id || 'Ativo';

  if (asset.status === 'em_manutencao') {
    blockers.push(`Ativo ${label} está bloqueado em manutenção e não pode ser alocado.`);
  } else if (asset.status === 'inativo') {
    blockers.push(`Ativo ${label} está inativo e não pode ser alocado.`);
  }

  const calDue = typeof asset.calibrationDueDate === 'string' ? asset.calibrationDueDate.trim().slice(0, 10) : '';
  if (calDue && /^\d{4}-\d{2}-\d{2}$/.test(calDue) && calDue < isoDateOnly(nowIso)) {
    blockers.push(`Ativo ${label} está com calibração vencida desde ${calDue} e requer recalibração antes do uso.`);
  }

  return { available: blockers.length === 0, blockers };
}

export function evaluateCollectiveAssetAvailability(
  asset: Partial<CollectiveAsset> | null | undefined,
  nowIso: string = new Date().toISOString(),
): AssetAvailabilityCheck {
  if (!asset) {
    return { available: false, blockers: ['Bem coletivo não encontrado nesta empresa.'] };
  }
  const blockers: string[] = [];
  const label = asset.code ? `${asset.code} (${asset.description || asset.id})` : asset.description || asset.id || 'Bem';

  if (asset.condition === 'em_manutencao') {
    blockers.push(`Bem coletivo ${label} está em manutenção e bloqueado para retirada/alocação.`);
  } else if (asset.condition === 'baixado') {
    blockers.push(`Bem coletivo ${label} está baixado e não pode ser utilizado.`);
  }

  const nextCal = typeof asset.nextCalibrationDate === 'string' ? asset.nextCalibrationDate.trim().slice(0, 10) : '';
  if (nextCal && /^\d{4}-\d{2}-\d{2}$/.test(nextCal) && nextCal < isoDateOnly(nowIso)) {
    blockers.push(`Bem coletivo ${label} está com calibração vencida desde ${nextCal}.`);
  }

  return { available: blockers.length === 0, blockers };
}
