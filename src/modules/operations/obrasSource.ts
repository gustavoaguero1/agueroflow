/**
 * Obras de Operações são as unidades do AgueroFlow (units, as mesmas do RDO e das OS).
 * Operações guarda só o complemento em ops_orgs/{orgId}/obras/{id} (com `unitId`): término previsto,
 * regime, estadia, observações etc. Ver unifiedCollections.ts.
 */
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Unit } from '../../types';
import { joinObras, nextUnitCode, splitObraWrite } from './unifiedCollections';
import { createVirtualCollection } from './virtualCollections';

type Unsub = () => void;
type Overlay = Record<string, unknown> & { id: string; unitId?: string };

export function createObrasSource(orgId: string, track: (u: Unsub) => Unsub) {
  const overlayPath = `ops_orgs/${orgId}/obras`;
  const unitsQuery = query(collection(db, 'units'), where('orgId', '==', orgId));

  const obras = createVirtualCollection({
    subscribeA: (next: (r: Unit[]) => void, err?: (e: unknown) => void) =>
      onSnapshot(unitsQuery, (s) => next(s.docs.map((d) => ({ ...(d.data() as Unit), id: d.id }))), err),
    subscribeB: (next: (r: Overlay[]) => void, err?: (e: unknown) => void) =>
      onSnapshot(collection(db, overlayPath), (s) => next(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err),
    join: joinObras,
  });

  const unitIdOf = async (id: string): Promise<string | null> => {
    if (id.startsWith('un_')) return id.slice(3);
    const s = await getDoc(doc(db, overlayPath, id));
    return (s.exists() && (s.data().unitId as string)) || null;
  };

  const createUnit = async (patch: Partial<Unit>): Promise<string> => {
    const codes = (await getDocs(unitsQuery)).docs.map((d) => String(d.data().code || ''));
    const now = new Date().toISOString();
    const ref = doc(collection(db, 'units'));
    await setDoc(ref, {
      orgId, name: patch.name || 'Nova obra', code: patch.code || nextUnitCode(codes),
      city: patch.city || '', state: patch.state || '', managerName: patch.managerName || '',
      createdAt: now, updatedAt: now,
    });
    return ref.id;
  };

  const write = async (id: string, data: Record<string, unknown>) => {
    const { unitPatch, overlay } = splitObraWrite(data);
    let unitId = await unitIdOf(id);
    if (!unitId) unitId = await createUnit(unitPatch);
    else if (Object.keys(unitPatch).length) await updateDoc(doc(db, 'units', unitId), { ...unitPatch, updatedAt: new Date().toISOString() });
    await setDoc(doc(db, overlayPath, id), { ...overlay, unitId }, { merge: true });
  };

  const obraDoc = (id: string) => ({
    id,
    set: (data: Record<string, unknown>) => write(id, data),
    update: (data: Record<string, unknown>) => write(id, data),
    /** A obra é a unidade (pode ter RDO e OS ligados): excluir é em Estrutura, não aqui. */
    delete: async () => {
      throw Object.assign(new Error('Obras são excluídas em Estrutura → Visão Geral & Unidades.'), { code: 'owned_elsewhere' });
    },
  });

  return {
    obras: {
      doc: (id?: string) => obraDoc(id || doc(collection(db, overlayPath)).id),
      onSnapshot: (next: Parameters<typeof obras.onSnapshot>[0], err?: (e: unknown) => void) => track(obras.onSnapshot(next, err)),
    },
    obraDoc,
  };
}
