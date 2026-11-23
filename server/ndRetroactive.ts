import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type RetroactiveDateCheck = { isRetroactive: boolean; paymentDateBr: string; todayBrFormatted: string; daysAgo: number };

/** Compares a dd/mm/yyyy payment date with today's date (YYYY-MM-DD, already in America/Sao_Paulo). */
export function checkNdRetroactiveDate(paymentDateBr: string, todayIso: string): RetroactiveDateCheck {
  const [tY, tM, tD] = todayIso.split('-');
  const todayBrFormatted = `${tD}/${tM}/${tY}`;
  const clean = String(paymentDateBr || '').trim();
  const m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return { isRetroactive: false, paymentDateBr: clean, todayBrFormatted, daysAgo: 0 };
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 2000 || yyyy > 2100) {
    return { isRetroactive: false, paymentDateBr: clean, todayBrFormatted, daysAgo: 0 };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const normalizedBr = `${pad(dd)}/${pad(mm)}/${yyyy}`;
  const paymentIso = `${yyyy}-${pad(mm)}-${pad(dd)}`;
  if (paymentIso >= todayIso) return { isRetroactive: false, paymentDateBr: normalizedBr, todayBrFormatted, daysAgo: 0 };
  const daysAgo = Math.max(1, Math.round((Date.parse(`${todayIso}T12:00:00Z`) - Date.parse(`${paymentIso}T12:00:00Z`)) / 86_400_000));
  return { isRetroactive: true, paymentDateBr: normalizedBr, todayBrFormatted, daysAgo };
}

/** A user's reply to the warning that releases a paused ND with its past date. */
export const replyAllowsRetroactive = (text: string): boolean =>
  /\b(retroativ[oa]s?|j[aá]\s+foi\s+pag[oa]|pag[oa]\s+antecipad[oa]|confirmar\s+(?:a\s+)?nd|pode\s+(?:gerar|enviar|mandar|emitir)\s+(?:mesmo\s+assim|com\s+(?:essa\s+)?data|retroativ[oa])|manter\s+(?:a\s+|essa\s+)?data|mesmo\s+com\s+data\s+retroativa)\b/i.test(
    String(text || '')
  );

/** The ND message itself only skips the check when it explicitly says the past date is intended
 * (everyday wording like "confirmar ND" or "manter data" must not let a wrong date through). */
export const originalMessageAllowsRetroactive = (text: string): boolean =>
  /\b(data\s+retroativ[oa]|pagamento\s+retroativ[oa]|retroativ[oa]\s+(?:mesmo|autorizad[oa]|combinad[oa])|j[aá]\s+foi\s+pag[oa])\b/i.test(String(text || ''));

/** A Map that is rewritten to a JSON file on every change and reloaded at startup, so paused NDs survive restarts.
 * shortcut: rewrites the whole file per change; fine for a handful of paused NDs, move to Firestore if it grows. */
export class FileBackedMap<V> extends Map<string, V> {
  private ready = false;
  constructor(private file: string, private toStored: (v: V) => V) {
    super();
    try {
      if (existsSync(file)) for (const [k, v] of JSON.parse(readFileSync(file, 'utf8')) as [string, V][]) super.set(k, v);
    } catch (e) {
      console.warn(`[ND] não foi possível ler ${file}:`, e instanceof Error ? e.message : e);
    }
    this.ready = true;
  }
  private save() {
    if (!this.ready) return;
    try {
      writeFileSync(this.file, JSON.stringify([...this.entries()].map(([k, v]) => [k, this.toStored(v)]), null, 2), 'utf8');
    } catch (e) {
      console.warn(`[ND] não foi possível gravar ${this.file}:`, e instanceof Error ? e.message : e);
    }
  }
  override set(k: string, v: V): this { super.set(k, v); this.save(); return this; }
  override delete(k: string): boolean { const r = super.delete(k); if (r) this.save(); return r; }
}
