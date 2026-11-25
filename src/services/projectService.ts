import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { db as defaultDb } from '../firebase';
import type { Project } from '../types/project';
import {
  buildProjectRecord,
  normalizeProjectCode,
  validateProjectUpdatePatch,
  type CreateProjectInput,
  type UpdateProjectInput,
} from './projectRules';

export {
  buildProjectId,
  buildProjectRecord,
  normalizeProjectCode,
  validateBudgetBaseline,
  validateProjectInput,
  validateProjectUpdatePatch,
} from './projectRules';
export type { CreateProjectInput, UpdateProjectInput } from './projectRules';

const PROJECTS_COLLECTION = 'projects';

async function assertReferenceOwnedByOrg(
  firestore: Firestore,
  collectionName: 'units' | 'contracts' | 'cost_centers',
  docId: string,
  orgId: string,
  label: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(firestore, collectionName, docId));
    if (!snap.exists() || snap.data()?.orgId !== orgId) {
      throw new Error(`${label} selecionado não pertence à empresa ativa.`);
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      throw new Error(`${label} selecionado não pertence à empresa ativa.`);
    }
    throw err;
  }
}

export function subscribeProjects(
  orgId: string,
  onData: (projects: Project[]) => void,
  firestore: Firestore = defaultDb,
) {
  if (!orgId) return () => {};
  const q = query(collection(firestore, PROJECTS_COLLECTION), where('orgId', '==', orgId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      list.sort((a, b) => a.code.localeCompare(b.code));
      onData(list);
    },
    (err) => {
      console.warn('Erro ao sincronizar projetos/obras:', err);
    },
  );
}

export async function listProjects(
  orgId: string,
  firestore: Firestore = defaultDb,
): Promise<Project[]> {
  if (!orgId) return [];
  const snap = await getDocs(
    query(collection(firestore, PROJECTS_COLLECTION), where('orgId', '==', orgId)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Project))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function getProject(
  projectId: string,
  firestore: Firestore = defaultDb,
): Promise<Project | null> {
  if (!projectId) return null;
  const snap = await getDoc(doc(firestore, PROJECTS_COLLECTION, projectId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Project;
}

export async function createProject(
  input: CreateProjectInput,
  firestore: Firestore = defaultDb,
): Promise<Project> {
  const record = buildProjectRecord(input);
  await assertReferenceOwnedByOrg(firestore, 'units', record.unitId, record.orgId, 'Unidade/Planta');
  await assertReferenceOwnedByOrg(firestore, 'contracts', record.contractId, record.orgId, 'Contrato');
  if (record.costCenterId) {
    await assertReferenceOwnedByOrg(
      firestore,
      'cost_centers',
      record.costCenterId,
      record.orgId,
      'Centro de custo',
    );
  }
  await setDoc(doc(firestore, PROJECTS_COLLECTION, record.id), record);
  return record;
}

export async function updateProject(
  projectId: string,
  patch: UpdateProjectInput,
  firestore: Firestore = defaultDb,
): Promise<void> {
  const ref = doc(firestore, PROJECTS_COLLECTION, projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Projeto/obra não encontrado.');
  const existing = { id: snap.id, ...snap.data() } as Project;

  const errors = validateProjectUpdatePatch(existing, patch);
  if (errors.length > 0) throw new Error(errors.join(' '));

  if (patch.unitId && patch.unitId.trim() !== existing.unitId) {
    await assertReferenceOwnedByOrg(firestore, 'units', patch.unitId.trim(), existing.orgId, 'Unidade/Planta');
  }
  if (patch.contractId && patch.contractId.trim() !== existing.contractId) {
    await assertReferenceOwnedByOrg(firestore, 'contracts', patch.contractId.trim(), existing.orgId, 'Contrato');
  }
  if (patch.costCenterId && patch.costCenterId.trim() !== existing.costCenterId) {
    await assertReferenceOwnedByOrg(
      firestore,
      'cost_centers',
      patch.costCenterId.trim(),
      existing.orgId,
      'Centro de custo',
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.code !== undefined) updates.code = normalizeProjectCode(patch.code);
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) updates.description = patch.description.trim();
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.clientId !== undefined) updates.clientId = patch.clientId.trim();
  if (patch.clientName !== undefined) updates.clientName = patch.clientName.trim();
  if (patch.contractId !== undefined) updates.contractId = patch.contractId.trim();
  if (patch.unitId !== undefined) updates.unitId = patch.unitId.trim();
  if (patch.costCenterId !== undefined) {
    updates.costCenterId = patch.costCenterId ? patch.costCenterId.trim() : null;
  }
  if (patch.disciplines !== undefined) updates.disciplines = Array.from(new Set(patch.disciplines));
  if (patch.managerUid !== undefined) updates.managerUid = patch.managerUid.trim();
  if (patch.managerName !== undefined) updates.managerName = patch.managerName.trim();
  if (patch.plannedStartDate !== undefined) updates.plannedStartDate = patch.plannedStartDate.trim();
  if (patch.plannedEndDate !== undefined) updates.plannedEndDate = patch.plannedEndDate.trim();
  if (patch.actualStartDate !== undefined) updates.actualStartDate = patch.actualStartDate.trim();
  if (patch.actualEndDate !== undefined) updates.actualEndDate = patch.actualEndDate.trim();

  await updateDoc(ref, updates);
}
