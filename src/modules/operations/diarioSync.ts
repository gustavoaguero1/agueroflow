/**
 * Depois de gravar o diário de um dia, regrava o apontamento de jornada desse dia
 * (worker_time_logs) e apaga os apontamentos do diário que não existem mais.
 */
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import type { RhEmployee } from '../../types/rhPayroll';
import type { Unit } from '../../types';
import { joinColabs, joinObras } from './unifiedCollections';
import { diarioToTimeLogs, timeLogIdPrefix, type DiarioLinha } from './diarioToTimeLogs';

const rows = async (q: ReturnType<typeof query> | ReturnType<typeof collection>) =>
  (await getDocs(q)).docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));

export async function syncDiarioToTimeLogs(orgId: string, isoDate: string): Promise<void> {
  const d = await getDoc(doc(db, `ops_orgs/${orgId}/diario/${isoDate}`));
  const linhas = ((d.exists() && d.data().linhas) || {}) as Record<string, DiarioLinha>;

  const [rh, colOv, units, obraOv, existing] = await Promise.all([
    rows(query(collection(db, 'rh_employees'), where('orgId', '==', orgId))),
    rows(collection(db, `ops_orgs/${orgId}/colaboradores`)),
    rows(query(collection(db, 'units'), where('orgId', '==', orgId))),
    rows(collection(db, `ops_orgs/${orgId}/obras`)),
    rows(query(collection(db, 'worker_time_logs'), where('orgId', '==', orgId), where('date', '==', isoDate))),
  ]);
  const colabs = new Map(joinColabs(rh as unknown as RhEmployee[], colOv as never).map((c) => [c.id, c as never]));
  const obras = new Map(joinObras(units as unknown as Unit[], obraOv as never).map((o) => [o.id, o as never]));

  const logs = diarioToTimeLogs(orgId, isoDate, linhas, colabs, obras);
  const keep = new Set(logs.map((l) => l.id));
  const batch = writeBatch(db);
  for (const l of logs) batch.set(doc(db, 'worker_time_logs', l.id), l);
  for (const e of existing) {
    if (e.id.startsWith(timeLogIdPrefix(isoDate)) && !keep.has(e.id)) batch.delete(doc(db, 'worker_time_logs', e.id));
  }
  await batch.commit();
}
