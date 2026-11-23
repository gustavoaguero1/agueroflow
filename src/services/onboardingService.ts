import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { EmployeeOnboarding, OnboardingSubmittedData } from '../types/onboarding';
import { apiFetch } from '../apiAuthFetch';

function cleanFirestoreData<T extends Record<string, any>>(data: T): Partial<T> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = cleanFirestoreData(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as Partial<T>;
}

async function syncOnboardingToFirestore(onboarding: EmployeeOnboarding): Promise<void> {
  if (!auth.currentUser) return;
  try {
    await setDoc(doc(db, 'hr_onboardings', onboarding.id), cleanFirestoreData(onboarding), { merge: true });
  } catch {
    // Non-blocking sync when user session doesn't have Firestore token yet
  }
}

export interface GenerateLinkParams {
  organizationId: string;
  createdBy: string;
  createdByName: string;
  targetRole: string;
  targetDepartment: string;
  targetUnitId?: string;
  targetContractId?: string;
  proposedSalary?: number;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  expiresInDays?: number;
}

export async function generateOnboardingLink(params: GenerateLinkParams): Promise<{
  success: boolean;
  onboarding: EmployeeOnboarding;
  linkUrl: string;
  message?: string;
}> {
  const res = await apiFetch('/api/hr/onboarding/generate-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Falha ao gerar link de cadastro.');
  }

  if (data.onboarding) {
    await syncOnboardingToFirestore(data.onboarding);
  }

  return data;
}

export async function checkOnboardingToken(token: string): Promise<{
  success: boolean;
  status: 'valid' | 'expired' | 'submitted' | 'approved' | 'not_found';
  data?: {
    id: string;
    token: string;
    targetRole: string;
    targetDepartment: string;
    candidateName?: string;
    candidateEmail?: string;
    candidatePhone?: string;
    proposedSalary?: number;
    expiresAt: string;
    companyName: string;
  };
  error?: string;
}> {
  const res = await apiFetch(`/api/hr/onboarding/check/${encodeURIComponent(token)}`);
  return res.json();
}

export async function submitOnboardingForm(
  token: string,
  submittedData: OnboardingSubmittedData
): Promise<{
  success: boolean;
  message: string;
  protocol: string;
  submittedAt?: string;
}> {
  const res = await apiFetch('/api/hr/onboarding/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, submittedData }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Falha ao enviar formulário de cadastro.');
  }

  return data;
}

export async function listOnboardings(orgId: string = 'org_aguero_default'): Promise<EmployeeOnboarding[]> {
  const byId = new Map<string, EmployeeOnboarding>();

  // 1. Load from server gateway (includes public candidate submissions)
  try {
    const res = await apiFetch(`/api/hr/onboarding/list?orgId=${encodeURIComponent(orgId)}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      for (const item of data.data as EmployeeOnboarding[]) {
        byId.set(item.id, item);
      }
    }
  } catch (err) {
    console.warn('Aviso ao listar onboardings do gateway local:', err);
  }

  // 2. Merge with Firebase Firestore when authenticated
  if (auth.currentUser) {
    try {
      const q = query(collection(db, 'hr_onboardings'), where('organizationId', '==', orgId));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const fbItem = d.data() as EmployeeOnboarding;
        const localItem = byId.get(fbItem.id);
        if (!localItem || new Date(fbItem.updatedAt || 0).getTime() > new Date(localItem.updatedAt || 0).getTime()) {
          byId.set(fbItem.id, fbItem);
        }
      });
      // Push newer server submissions to Firestore
      for (const item of byId.values()) {
        await syncOnboardingToFirestore(item);
      }
    } catch {
      // Non-blocking
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function updateOnboardingStatus(
  id: string,
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired',
  reviewNotes?: string,
  reviewedBy?: string,
  resultingEmployeeId?: string
): Promise<void> {
  const res = await apiFetch(`/api/hr/onboarding/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reviewNotes, reviewedBy, resultingEmployeeId }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Falha ao atualizar status da admissão.');
  }

  if (auth.currentUser) {
    try {
      await setDoc(
        doc(db, 'hr_onboardings', id),
        cleanFirestoreData({
          status,
          updatedAt: new Date().toISOString(),
          reviewNotes,
          reviewedBy,
          reviewedAt: reviewedBy ? new Date().toISOString() : undefined,
          resultingEmployeeId,
        }),
        { merge: true }
      );
    } catch {
      // Non-blocking
    }
  }
}

export async function deleteOnboarding(id: string): Promise<void> {
  const res = await apiFetch(`/api/hr/onboarding/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Falha ao excluir registro.');
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'hr_onboardings', id));
    } catch {
      // Non-blocking
    }
  }
}
