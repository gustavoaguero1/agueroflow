/**
 * Mapeamento entre os dados oficiais do AgueroFlow (RH e unidades) e o formato que as telas de
 * Operações (Inox) usam. RH é o dono da identidade e dos salários; Operações guarda só um
 * complemento operacional (cidade, obra atual, folgas...). Funções puras, sem Firebase.
 */
import type { RhEmployee } from '../../types/rhPayroll';
import type { Unit } from '../../types';

type Row = Record<string, unknown> & { id: string };
type Overlay = Record<string, unknown> & { id: string; rhId?: string; unitId?: string };

/** Campos de pessoa que só o RH grava. */
export const IDENTITY_FIELDS = ['nome', 'funcao', 'status', 'admissao'] as const;

export function mergeColab(emp: RhEmployee | null, overlay: Overlay | null): Row {
  if (!emp) return { ...(overlay as Overlay), semRh: true };
  return {
    ...(overlay || {}),
    id: overlay?.id || `rh_${emp.id}`,
    rhId: emp.id,
    nome: emp.name,
    funcao: emp.role,
    status: emp.active ? 'Ativo' : 'Desligado',
    admissao: emp.admissionDate,
  };
}

export function splitColabWrite(data: Record<string, unknown>): { overlay: Record<string, unknown>; ignored: string[] } {
  const overlay: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if ((IDENTITY_FIELDS as readonly string[]).includes(k)) ignored.push(k);
    else overlay[k] = v;
  }
  return { overlay, ignored };
}

/** Por fora entra só pelo valor mensal (decisão do usuário, 23/11/2026); PJ soma tudo. */
export function salarioFromRh(emp: RhEmployee, regime?: string): { clt: number; porFora: number; pj: number; valorHora?: number } {
  const carteira = emp.baseSalaryCarteira || 0;
  const porFora = emp.baseSalaryPorFora || 0;
  const out = regime === 'PJ' ? { clt: 0, porFora: 0, pj: carteira + porFora } : { clt: carteira, porFora, pj: 0 };
  const hora = (emp.hourlyRateCarteira || 0) + (emp.hourlyRatePorFora || 0);
  return hora > 0 ? { ...out, valorHora: hora } : out;
}

/** Todas as pessoas do RH (com ou sem complemento) + complementos sem funcionário no RH. */
export function joinColabs(rh: RhEmployee[], overlays: Overlay[]): Row[] {
  const byRh = new Map(overlays.filter((o) => o.rhId).map((o) => [o.rhId as string, o]));
  const rhIds = new Set(rh.map((e) => e.id));
  return [
    ...rh.map((e) => mergeColab(e, byRh.get(e.id) || null)),
    ...overlays.filter((o) => !o.rhId || !rhIds.has(o.rhId)).map((o) => mergeColab(null, o)),
  ];
}

/** Salário de cada pessoa do RH, com o mesmo id que a pessoa tem em `colaboradores`. */
export function joinSalarios(rh: RhEmployee[], overlays: Overlay[]): Row[] {
  const byRh = new Map(overlays.filter((o) => o.rhId).map((o) => [o.rhId as string, o]));
  return rh.map((e) => {
    const o = byRh.get(e.id);
    return { id: o?.id || `rh_${e.id}`, ...salarioFromRh(e, o?.regime as string | undefined) };
  });
}

export function mergeObra(unit: Unit | null, overlay: Overlay | null): Row {
  if (!unit) return { ...(overlay as Overlay), semUnidade: true };
  const cidade = [unit.city, unit.state].filter(Boolean).join('/');
  return {
    ...(overlay || {}),
    id: overlay?.id || `un_${unit.id}`,
    unitId: unit.id,
    nome: unit.name,
    os: unit.code,
    cidade,
    coordenador: unit.managerName || '',
  };
}

const OBRA_TO_UNIT: Record<string, keyof Unit> = { nome: 'name', os: 'code', coordenador: 'managerName' };

export function splitObraWrite(data: Record<string, unknown>): { unitPatch: Partial<Unit>; overlay: Record<string, unknown> } {
  const unitPatch: Partial<Unit> = {};
  const overlay: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'cidade') {
      const [city, state] = String(v ?? '').split('/');
      unitPatch.city = (city || '').trim();
      unitPatch.state = (state || '').trim();
    } else if (k in OBRA_TO_UNIT) {
      (unitPatch as Record<string, unknown>)[OBRA_TO_UNIT[k]] = v == null ? '' : String(v);
    } else if (k !== 'id' && k !== 'unitId') {
      overlay[k] = v;
    }
  }
  return { unitPatch, overlay };
}
