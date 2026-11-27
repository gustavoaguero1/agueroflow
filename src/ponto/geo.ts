// Cerca virtual da obra (lógica pura).
export interface LatLng { lat: number; lng: number }

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distância em metros (haversine). */
export function distanciaM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface ObraGeo { id: string; nome: string; geo?: { lat: number; lng: number; raioM?: number } | null }

export function obraMaisProxima(pos: LatLng | null, obras: ObraGeo[], raioPadraoM: number) {
  if (!pos) return null;
  let best: { unitId: string; nome: string; distM: number; dentro: boolean } | null = null;
  for (const o of obras) {
    if (!o.geo || !Number.isFinite(o.geo.lat) || !Number.isFinite(o.geo.lng)) continue;
    const distM = Math.round(distanciaM(pos, o.geo));
    if (!best || distM < best.distM) best = { unitId: o.id, nome: o.nome, distM, dentro: distM <= (o.geo.raioM ?? raioPadraoM) };
  }
  return best;
}
