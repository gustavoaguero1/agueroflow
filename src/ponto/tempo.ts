// Horário de Brasília (UTC-3, sem horário de verão desde 2019).
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Converte qualquer ISO para "YYYY-MM-DDTHH:MM:SS-03:00". */
export function toBrt(isoOrMs: string | number | Date): string {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (!Number.isFinite(ms)) throw new Error('data-hora inválida');
  const d = new Date(ms - 3 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}-03:00`;
}

/** Dia (YYYY-MM-DD) em Brasília. */
export const diaBrt = (iso: string | number | Date) => toBrt(iso).slice(0, 10);

/** Lista de dias de `inicio` a `fim` (inclusive). */
export function diasEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${inicio}T12:00:00Z`); t <= Date.parse(`${fim}T12:00:00Z`); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
