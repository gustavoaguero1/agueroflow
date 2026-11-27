// Entrada de localização da obra (cerca do ponto). Aceita vírgula decimal.
export type GeoObra = { lat: number; lng: number; raioM?: number };

const num = (s: string) => {
  const t = String(s ?? '').trim().replace(',', '.');
  return t === '' ? null : Number(t);
};

export function parseGeoInput(lat: string, lng: string, raio: string): GeoObra | null | 'invalido' {
  const la = num(lat);
  const ln = num(lng);
  const r = num(raio);
  if (la === null && ln === null && r === null) return null;
  if (la === null || ln === null || !Number.isFinite(la) || !Number.isFinite(ln)) return 'invalido';
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return 'invalido';
  if (r !== null && (!Number.isFinite(r) || r < 20 || r > 5000)) return 'invalido';
  return r === null ? { lat: la, lng: ln } : { lat: la, lng: ln, raioM: Math.round(r) };
}
