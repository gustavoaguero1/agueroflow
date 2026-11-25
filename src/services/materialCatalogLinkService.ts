import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { db as defaultDb } from '../firebase';
import type { Item } from '../types';
import type { CommercialMaterial } from '../types/commercial';
import {
  buildMaterialMasterLinkPatch,
  buildMaterialMasterUnlinkPatch,
} from './materialCatalogLinkRules';

export {
  auditMaterialCatalogLinks,
  buildMaterialMasterLinkPatch,
  buildMaterialMasterUnlinkPatch,
  suggestMasterItemMatches,
} from './materialCatalogLinkRules';

export async function listMasterCatalogItems(
  orgId: string,
  firestore: Firestore = defaultDb,
): Promise<Item[]> {
  if (!orgId) return [];
  const snap = await getDocs(query(collection(firestore, 'items'), where('orgId', '==', orgId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Item))
    .sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
}

export async function confirmMaterialMasterLink(params: {
  orgId: string;
  materialId: string;
  masterItemId: string;
  actorUid: string;
  actorName: string;
  notes?: string;
  firestore?: Firestore;
}): Promise<void> {
  const firestore = params.firestore || defaultDb;
  const matRef = doc(firestore, 'commercial_materials', params.materialId);
  const itemRef = doc(firestore, 'items', params.masterItemId);

  const [matSnap, itemSnap] = await Promise.all([getDoc(matRef), getDoc(itemRef)]);
  if (!matSnap.exists()) throw new Error('Material comercial não encontrado.');
  if (!itemSnap.exists()) throw new Error('Item do catálogo mestre não encontrado.');

  const material = { id: matSnap.id, ...matSnap.data() } as CommercialMaterial;
  const masterItem = { id: itemSnap.id, ...itemSnap.data() } as Item;
  if (material.organizationId !== params.orgId || masterItem.orgId !== params.orgId) {
    throw new Error('Material comercial e item mestre precisam pertencer à mesma empresa.');
  }

  const patch = buildMaterialMasterLinkPatch({
    material,
    masterItem,
    actorUid: params.actorUid,
    actorName: params.actorName,
    notes: params.notes,
  });
  await updateDoc(matRef, patch as unknown as Record<string, unknown>);
}

export async function clearMaterialMasterLink(params: {
  orgId: string;
  materialId: string;
  actorUid: string;
  actorName: string;
  reason?: string;
  firestore?: Firestore;
}): Promise<void> {
  const firestore = params.firestore || defaultDb;
  const matRef = doc(firestore, 'commercial_materials', params.materialId);
  const matSnap = await getDoc(matRef);
  if (!matSnap.exists()) throw new Error('Material comercial não encontrado.');
  const material = { id: matSnap.id, ...matSnap.data() } as CommercialMaterial;
  if (material.organizationId !== params.orgId) {
    throw new Error('Material comercial não pertence à empresa ativa.');
  }

  const patch = buildMaterialMasterUnlinkPatch({
    actorUid: params.actorUid,
    actorName: params.actorName,
    reason: params.reason,
  });
  await updateDoc(matRef, patch as unknown as Record<string, unknown>);
}
