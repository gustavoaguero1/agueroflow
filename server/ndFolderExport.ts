// NDs saved into the finance network share by a small agent on a company PC (the cloud server cannot reach the LAN).
import { Router, json } from 'express';
import { timingSafeEqual } from 'node:crypto';

type NdLike = { id?: string; fileName?: string; paymentDate?: string; createdAt?: string; revisedAt?: string; revisionNumber?: number; folderExportedRev?: number };

/** dd/mm/aaaa -> "aaaa\mm.aaaa\dd.mm" (finance share layout); null when the date is not a real date. */
export function ndFolderFor(paymentDateBr: string): string | null {
  const m = String(paymentDateBr || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}\\${p(mo)}.${y}\\${p(d)}.${p(mo)}`;
}

export const exportFileName = (r: NdLike): string => {
  const name = r.fileName || `ND ${r.id}.pdf`;
  return r.revisionNumber ? name.replace(/(\.pdf)?$/i, ` - REVISADA (REV. ${r.revisionNumber}).pdf`) : name;
};

export const isPendingExport = (r: NdLike, sinceIso: string): boolean =>
  (r.revisedAt || r.createdAt || '') >= sinceIso && (r.folderExportedRev ?? -1) < (r.revisionNumber ?? 0);

export function createNdExportRouter(deps: {
  token: () => string | undefined;
  since: () => string;
  records: () => NdLike[];
  pdf: (r: NdLike) => Buffer;
  persist: () => void;
}): Router {
  const r = Router();
  r.use((req, res, next) => {
    const expected = deps.token();
    const given = String(req.headers['x-nd-export-token'] || '');
    const ok = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    return ok ? next() : res.status(401).json({ error: 'token de exportação inválido' });
  });
  const find = (id: string) => deps.records().find((x) => x.id === id);
  r.get('/pendentes', (_req, res) => {
    const since = deps.since();
    res.json(deps.records().filter((x) => isPendingExport(x, since)).flatMap((x) => {
      const folder = ndFolderFor(x.paymentDate || '');
      if (!folder) { console.warn(`[ND pasta] ND ${x.id} sem data de vencimento válida (${x.paymentDate}); não exportada.`); return []; }
      return [{ id: x.id, fileName: exportFileName(x), folder, revision: x.revisionNumber ?? 0 }];
    }));
  });
  r.get('/:id/pdf', (req, res) => {
    const rec = find(req.params.id);
    if (!rec) return res.status(404).json({ error: 'ND não encontrada' });
    res.type('application/pdf').send(deps.pdf(rec));
  });
  r.post('/:id/salvo', json(), (req, res) => {
    const rec = find(req.params.id);
    if (!rec) return res.status(404).json({ error: 'ND não encontrada' });
    // Ack the revision the agent saved; a newer revision stays pending.
    const rev = Number(req.body?.revision);
    rec.folderExportedRev = Math.max(rec.folderExportedRev ?? -1, Number.isFinite(rev) ? rev : rec.revisionNumber ?? 0);
    deps.persist();
    res.json({ ok: true });
  });
  return r;
}
