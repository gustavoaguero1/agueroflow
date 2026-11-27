/**
 * Local da obra (latitude, longitude e raio) usado pela cerca do ponto eletrônico.
 */
import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { MapPin, Crosshair, X } from 'lucide-react';
import { db } from '../../firebase';
import type { Unit } from '../../types';
import { parseGeoInput } from '../../ponto/geoInput';

const input = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500';

export const ObraGeoEditor: React.FC<{ unit: Unit; onClose: () => void }> = ({ unit, onClose }) => {
  const [lat, setLat] = useState(unit.geo ? String(unit.geo.lat) : '');
  const [lng, setLng] = useState(unit.geo ? String(unit.geo.lng) : '');
  const [raio, setRaio] = useState(unit.geo?.raioM ? String(unit.geo.raioM) : '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) { setMsg('Este aparelho não informa a localização.'); return; }
    setMsg('Pegando a localização…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setMsg(`Precisão de ${Math.round(p.coords.accuracy)} m.`); },
      () => setMsg('Não deu para pegar a localização. Permita o acesso ou digite.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const salvar = async () => {
    const geo = parseGeoInput(lat, lng, raio);
    if (geo === 'invalido') { setMsg('Confira os números: latitude de -90 a 90, longitude de -180 a 180 e raio de 20 a 5000 m.'); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'units', unit.id), { geo, updatedAt: new Date().toISOString() });
      onClose();
    } catch {
      setMsg('Não foi possível salvar agora.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="geo-title">
      <div className="bg-[#121826] border border-slate-700 rounded-xl p-5 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="geo-title" className="text-sm font-bold text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" /> Local da obra para o ponto</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-400">{unit.code} · {unit.name}. A marcação fora do raio é gravada com alerta para o RH.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-slate-400"><span>Latitude</span><input className={input} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23,5505" /></label>
          <label className="space-y-1 text-xs text-slate-400"><span>Longitude</span><input className={input} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46,6333" /></label>
          <label className="space-y-1 text-xs text-slate-400 col-span-2"><span>Raio (m) — vazio usa o padrão (300 m)</span><input className={input} inputMode="numeric" value={raio} onChange={(e) => setRaio(e.target.value)} placeholder="300" /></label>
        </div>
        <button type="button" onClick={usarMinhaLocalizacao} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5"><Crosshair className="w-4 h-4" /> Usar minha localização (estando na obra)</button>
        {msg && <p className="text-xs text-blue-300">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-200">Cancelar</button>
          <button type="button" onClick={salvar} disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white">{busy ? 'Salvando…' : 'Salvar local'}</button>
        </div>
      </div>
    </div>
  );
};
