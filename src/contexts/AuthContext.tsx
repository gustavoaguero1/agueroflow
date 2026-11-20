import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, googleProvider, db, handleFirestoreError, OperationType, isolatedAuth } from '../firebase';
import { postJson } from '../apiAuthFetch';
import {
  Organization,
  OrgMember,
  UserRole,
  AuditLog,
  Unit,
  Contract,
  TrustedDevice,
} from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  member: OrgMember | null;
  organization: Organization | null;
  organizations: Organization[];
  role: UserRole;
  isMaster: boolean;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
  isSupervisorOrAbove: boolean;
  canViewFinancials: boolean;

  // Global Context Multiempresa (Hierarchy: Org -> Contract -> Unit)
  selectedUnitId: string;
  setSelectedUnitId: (unitId: string) => void;
  selectedContractId: string;
  setSelectedContractId: (contractId: string) => void;
  units: Unit[];
  contracts: Contract[];

  // MFA & Trusted Device
  deviceId: string;
  isDeviceTrusted: boolean;
  requireMfaVerification: boolean;
  trustedDevices: TrustedDevice[];
  confirmMfaAndTrustDevice: () => Promise<boolean>;
  revokeTrustedDevice: (docId: string) => Promise<void>;

  // Auth Operations
  signInWithGoogle: () => Promise<User | null>;
  signInWithGoogleAutoResolve: () => Promise<{
    authorized: boolean;
    isMaster: boolean;
    org?: Organization;
    error?: string;
  }>;
  signInWithCredentials: (
    nameOrEmail: string,
    password: string,
    companyInput?: string
  ) => Promise<{
    success: boolean;
    isMaster?: boolean;
    isFirstAccess?: boolean;
    memberId?: string;
    memberName?: string;
    memberEmail?: string;
    orgId?: string;
    orgName?: string;
    error?: string;
  }>;
  setupFirstAccessPassword: (
    memberId: string,
    orgId: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  changeUserPassword: (
    nameOrEmail: string,
    companyInput: string,
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string; memberName?: string }>;
  adminSetUserPassword: (
    memberId: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  createOrganization: (name: string, slug: string, cnpj?: string) => Promise<Organization>;
  selectOrganization: (orgId: string) => Promise<void>;
  clearActiveOrganization: () => void;
  refreshOrganizations: () => Promise<Organization[]>;
  validateUserOrgMembershipBySlug: (
    slug: string,
    providedEmail?: string
  ) => Promise<{ authorized: boolean; org?: Organization; member?: OrgMember; error?: string }>;
  logAudit: (module: string, action: string, details: string, targetId?: string) => Promise<void>;
  seedDemoData: () => Promise<void>;
  demoDataLoaded: boolean;
  authError: string | null;
}

export const MASTER_EMAIL = 'gustavo@agueroinox.com.br';
const FIRST_ACCESS_LINK_MSG = 'Peça ao administrador o seu link de primeiro acesso.';

type ServerSession = { claims?: { master?: boolean }; member?: OrgMember | null; org?: Organization | null };

// Binds the uid on the server and refreshes claims. Non-fatal: without the server (e.g. local dev) we keep the Firestore lookups.
// Google sign-in and onAuthStateChanged both sync right after the popup: share one in-flight call per uid.
const inflightSessions = new Map<string, Promise<ServerSession | null>>();
function syncServerSession(currentUser: User): Promise<ServerSession | null> {
  let p = inflightSessions.get(currentUser.uid);
  if (!p) {
    p = doSyncServerSession(currentUser).finally(() => inflightSessions.delete(currentUser.uid));
    inflightSessions.set(currentUser.uid, p);
  }
  return p;
}

async function doSyncServerSession(currentUser: User): Promise<ServerSession | null> {
  try {
    const r = await postJson<ServerSession>('/api/auth/session');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await currentUser.getIdToken(true);
    return r.data;
  } catch (err) {
    console.warn('Sessão do servidor indisponível; seguindo com dados locais:', err);
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to get or create client device UUID (non-sensitive identifier)
function getOrCreateDeviceId(): string {
  let devId = localStorage.getItem('agueroflow_client_dev_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('agueroflow_client_dev_id', devId);
  }
  return devId;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<OrgMember | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [demoDataLoaded, setDemoDataLoaded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Global Multi-unit & Contract Context
  const [selectedUnitId, setSelectedUnitId] = useState<string>('todas');
  const [selectedContractId, setSelectedContractId] = useState<string>('todos');
  const [units, setUnits] = useState<Unit[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  // MFA & Device Trust State
  const [deviceId] = useState<string>(getOrCreateDeviceId);
  const [isDeviceTrusted, setIsDeviceTrusted] = useState<boolean>(true);
  const [requireMfaVerification, setRequireMfaVerification] = useState<boolean>(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  // Bumped on every explicit org selection, so a slower loadUserData started earlier cannot override it.
  const orgSelectionSeq = useRef(0);

  // Load units and contracts when active organization changes
  const loadOrgHierarchy = useCallback(async (orgId: string) => {
    try {
      const [uSnap, cSnap] = await Promise.all([
        getDocs(query(collection(db, 'units'), where('orgId', '==', orgId))),
        getDocs(query(collection(db, 'contracts'), where('orgId', '==', orgId))),
      ]);
      const loadedUnits = uSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Unit));
      const loadedContracts = cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract));
      setUnits(loadedUnits);
      setContracts(loadedContracts);
    } catch (err) {
      console.warn('Erro ao carregar estrutura da organização:', err);
    }
  }, []);

  // Check and manage trusted device records for the current user
  const checkDeviceTrust = useCallback(async (currentUser: User, orgId: string) => {
    try {
      const qDev = query(
        collection(db, 'trusted_devices'),
        where('userId', '==', currentUser.uid),
        where('orgId', '==', orgId),
        where('status', '==', 'ativo')
      );
      const snap = await getDocs(qDev);
      const devs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrustedDevice));
      setTrustedDevices(devs);

      const currentDev = devs.find((d) => d.deviceId === deviceId);
      if (currentDev) {
        // Device is already trusted and active
        setIsDeviceTrusted(true);
        setRequireMfaVerification(false);
      } else {
        // New device or browser detected: require second factor / verification step
        setIsDeviceTrusted(false);
        setRequireMfaVerification(true);
      }
    } catch (err) {
      console.warn('Verificação de dispositivo confiável:', err);
      setIsDeviceTrusted(true); // Fallback safely without locking
    }
  }, [deviceId]);

  // Confirm MFA and save trusted device record
  const confirmMfaAndTrustDevice = async (): Promise<boolean> => {
    if (!user || !organization) return false;
    try {
      const docId = `td_${user.uid}_${deviceId}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days validity
      const record: TrustedDevice = {
        id: docId,
        userId: user.uid,
        userEmail: user.email || '',
        orgId: organization.id,
        deviceId,
        deviceName: navigator.userAgent.includes('Mobile') ? 'Dispositivo Móvel' : 'Navegador Web Desktop',
        createdAt: new Date().toISOString(),
        expiresAt,
        status: 'ativo',
      };
      await setDoc(doc(db, 'trusted_devices', docId), record);
      setIsDeviceTrusted(true);
      setRequireMfaVerification(false);
      setTrustedDevices((prev) => [...prev.filter((d) => d.id !== docId), record]);

      await logAuditDirect(
        organization.id,
        user.uid,
        user.email || '',
        'Segurança',
        'Dispositivo Confiável Registrado',
        `Dispositivo ${record.deviceName} marcado como confiável após autenticação com validação de segundo fator.`
      );
      return true;
    } catch (err) {
      console.error('Erro ao registrar dispositivo confiável:', err);
      return false;
    }
  };

  const revokeTrustedDevice = async (docId: string) => {
    if (!user || !organization) return;
    try {
      await updateDoc(doc(db, 'trusted_devices', docId), {
        status: 'revogado',
        revokedAt: new Date().toISOString(),
      });
      setTrustedDevices((prev) => prev.filter((d) => d.id !== docId));
      if (docId.includes(deviceId)) {
        setIsDeviceTrusted(false);
        setRequireMfaVerification(true);
      }
      await logAuditDirect(
        organization.id,
        user.uid,
        user.email || '',
        'Segurança',
        'Dispositivo Revogado',
        `Dispositivo ${docId} revogado com sucesso.`
      );
    } catch (err) {
      console.error('Erro ao revogar dispositivo:', err);
    }
  };

  // Ensures master user (gustavo@agueroinox.com.br) has 100% Admin role in any target organization
  const ensureMasterMembership = async (targetOrg: Organization, uid?: string): Promise<OrgMember> => {
    try {
      const q = query(
        collection(db, 'org_members'),
        where('orgId', '==', targetOrg.id),
        where('userEmail', '==', MASTER_EMAIL)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existing = snap.docs[0];
        const data = existing.data() as OrgMember;
        if (data.role !== 'Admin' || !data.active) {
          await updateDoc(doc(db, 'org_members', existing.id), {
            role: 'Admin',
            active: true,
            userName: 'Gustavo Aguero (Master)',
            updatedAt: new Date().toISOString(),
          });
        }
        return { ...data, id: existing.id, role: 'Admin', active: true };
      }

      const memId = `mem_master_${targetOrg.id}_${Date.now().toString(36)}`;
      const newMember: OrgMember = {
        id: memId,
        orgId: targetOrg.id,
        userId: uid || 'usr_master_gustavo',
        userEmail: MASTER_EMAIL,
        userName: 'Gustavo Aguero (Master)',
        role: 'Admin',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'org_members', memId), newMember);
      return newMember;
    } catch (err) {
      console.warn('Erro ao assegurar membro master no Firestore:', err);
      return {
        id: `mem_master_${targetOrg.id}`,
        orgId: targetOrg.id,
        userId: uid || 'usr_master_gustavo',
        userEmail: MASTER_EMAIL,
        userName: 'Gustavo Aguero (Master)',
        role: 'Admin',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  };

  // Fetch all organizations in Firestore (Master capability)
  const fetchAllOrganizations = useCallback(async (): Promise<Organization[]> => {
    const allOrgsSnap = await getDocs(collection(db, 'organizations'));
    let allOrgs = allOrgsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Organization));
    if (allOrgs.length === 0) {
      const defaultOrg: Organization = {
        id: 'org_aguero_inox',
        name: 'Aguero Inox',
        slug: 'aguero-inox',
        email: MASTER_EMAIL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'organizations', defaultOrg.id), defaultOrg);
      allOrgs = [defaultOrg];
    }
    allOrgs.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    setOrganizations(allOrgs);
    return allOrgs;
  }, []);

  const refreshOrganizations = useCallback(async (): Promise<Organization[]> => {
    return fetchAllOrganizations();
  }, [fetchAllOrganizations]);

  // Helper: Find a single active org_member record by email, userName, or uid (1 company per email)
  const findSingleActiveMember = useCallback(
    async (identifier: string, uid?: string): Promise<{ member: OrgMember; org: Organization } | null> => {
      const norm = identifier.toLowerCase().trim();
      const membersRef = collection(db, 'org_members');
      let matchedDoc: { id: string; data: OrgMember } | null = null;

      if (uid) {
        const uidSnap = await getDocs(query(membersRef, where('userId', '==', uid), where('active', '==', true)));
        if (!uidSnap.empty) {
          matchedDoc = { id: uidSnap.docs[0].id, data: uidSnap.docs[0].data() as OrgMember };
        }
      }

      // Email fallback only runs if the uid lookup missed; a rules denial (no matching claims) means "not found".
      if (!matchedDoc && norm) {
        const emailSnap = await getDocs(query(membersRef, where('userEmail', '==', norm), where('active', '==', true))).catch((err) => {
          if (err?.code === 'permission-denied') return null;
          throw err;
        });
        if (emailSnap && !emailSnap.empty) {
          matchedDoc = { id: emailSnap.docs[0].id, data: emailSnap.docs[0].data() as OrgMember };
        }
      }

      if (!matchedDoc) return null;

      const orgDoc = await getDoc(doc(db, 'organizations', matchedDoc.data.orgId));
      if (!orgDoc.exists()) return null;

      return {
        member: { ...matchedDoc.data, id: matchedDoc.id },
        org: { id: orgDoc.id, ...orgDoc.data() } as Organization,
      };
    },
    []
  );

  const loadUserData = useCallback(async (currentUser: User, session?: ServerSession | null, seq = orgSelectionSeq.current) => {
    const stale = () => orgSelectionSeq.current !== seq;
    try {
      const isMaster = currentUser.email?.toLowerCase().trim() === MASTER_EMAIL || session?.claims?.master === true;

      if (isMaster) {
        // Master user has access to ALL organizations via selective panel
        const allOrgs = await fetchAllOrganizations();
        const savedOrgId = sessionStorage.getItem('gat_master_active_org');
        const restoredOrg = savedOrgId ? allOrgs.find((o) => o.id === savedOrgId) : null;
        if (stale()) return;

        if (restoredOrg) {
          const masterMember = await ensureMasterMembership(restoredOrg, currentUser.uid);
          if (stale()) return;
          setMember(masterMember);
          setOrganization(restoredOrg);
          await loadOrgHierarchy(restoredOrg.id);
          await checkDeviceTrust(currentUser, restoredOrg.id);
        } else {
          // Leave organization null so Master enters the Selective Company Panel
          setMember({
            id: `mem_master_global`,
            orgId: '',
            userId: currentUser.uid,
            userEmail: MASTER_EMAIL,
            userName: currentUser.displayName || 'Gustavo Aguero (Master)',
            role: 'Admin',
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setOrganization(null);
          setUnits([]);
          setContracts([]);
        }
        return;
      }

      // Non-master user: strictly 1 company per email -> direct routing to assigned company
      // Password users (uid member_<id>) have no email: their member/org come only from the server session.
      const resolved = currentUser.uid.startsWith('member_')
        ? (session?.member && session.org ? { member: session.member, org: session.org } : null)
        : await findSingleActiveMember(currentUser.email || '', currentUser.uid);

      if (resolved) {
        const { member: mData, org: singleOrg } = resolved;
        setOrganizations([singleOrg]);
        setMember(mData);
        setOrganization(singleOrg);
        await loadOrgHierarchy(singleOrg.id);
        await checkDeviceTrust(currentUser, singleOrg.id);
      } else {
        setMember(null);
        setOrganization(null);
        setOrganizations([]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados do usuário:', err);
      setAuthError('Não foi possível verificar os dados organizacionais no Firestore.');
    }
  }, [fetchAllOrganizations, findSingleActiveMember, loadOrgHierarchy, checkDeviceTrust]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthError(null);
      if (currentUser) {
        const seq = orgSelectionSeq.current;
        await loadUserData(currentUser, await syncServerSession(currentUser), seq);
      } else {
        setMember(null);
        setOrganization(null);
        setOrganizations([]);
        setUnits([]);
        setContracts([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadUserData]);

  // Validates if the user is associated with the registered company (requiring prior admin registration)
  const validateUserOrgMembershipBySlug = async (
    slugOrName: string,
    providedEmail?: string
  ): Promise<{ authorized: boolean; org?: Organization; member?: OrgMember; error?: string }> => {
    const currentUser = user;
    const emailToCheck = providedEmail || currentUser?.email;
    const uidToCheck = currentUser?.uid;

    if (!uidToCheck && !emailToCheck) {
      return { authorized: false, error: 'Usuário não autenticado.' };
    }

    const cleanInput = slugOrName.toLowerCase().trim();
    if (!cleanInput) {
      return { authorized: false, error: 'Por favor, informe a empresa para validar o acesso.' };
    }

    try {
      // 1. Locate organization by slug or by name
      let orgSnap = await getDocs(query(collection(db, 'organizations'), where('slug', '==', cleanInput)));
      if (orgSnap.empty) {
        orgSnap = await getDocs(query(collection(db, 'organizations'), where('name', '==', slugOrName.trim())));
      }
      if (orgSnap.empty) {
        const allOrgsSnap = await getDocs(collection(db, 'organizations'));
        const matched = allOrgsSnap.docs.find((d) => {
          const data = d.data();
          return (
            (data.slug && data.slug.toLowerCase() === cleanInput) ||
            (data.name && data.name.toLowerCase() === cleanInput)
          );
        });
        if (matched) {
          orgSnap = { empty: false, docs: [matched] } as any;
        }
      }

      let targetOrg: Organization;
      const isMaster = emailToCheck?.toLowerCase() === MASTER_EMAIL;

      if (orgSnap.empty) {
        if (isMaster) {
          // Master user can auto-create the company on the fly
          const cleanSlug = cleanInput.replace(/[^a-z0-9_-]/g, '-');
          const newOrgId = `org_${cleanSlug}_${Date.now().toString(36)}`;
          targetOrg = {
            id: newOrgId,
            name: slugOrName.trim(),
            slug: cleanSlug,
            email: MASTER_EMAIL,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'organizations', newOrgId), targetOrg);
          setOrganizations((prev) => [...prev.filter((o) => o.id !== targetOrg.id), targetOrg]);
        } else {
          return {
            authorized: false,
            error: `Empresa '${slugOrName}' não encontrada. Verifique o nome ou identificador informado com o administrador da sua conta.`,
          };
        }
      } else {
        targetOrg = { id: orgSnap.docs[0].id, ...orgSnap.docs[0].data() } as Organization;
      }

      // 2. Validate membership or ensure master access
      let memberDoc: OrgMember | null = null;
      let matchedDocSnap: any = null;

      if (isMaster) {
        memberDoc = await ensureMasterMembership(targetOrg, uidToCheck);
      } else {
        // Check by userId first if we have uid
        if (uidToCheck) {
          const memSnap = await getDocs(
            query(
              collection(db, 'org_members'),
              where('userId', '==', uidToCheck),
              where('orgId', '==', targetOrg.id),
              where('active', '==', true)
            )
          );
          if (!memSnap.empty) {
            matchedDocSnap = memSnap.docs[0];
            memberDoc = { id: matchedDocSnap.id, ...matchedDocSnap.data() } as OrgMember;
          }
        }

        // Check by userEmail (administrator pre-registration)
        if (!memberDoc && emailToCheck) {
          const normEmail = emailToCheck.toLowerCase().trim();
          const memEmailSnap = await getDocs(
            query(
              collection(db, 'org_members'),
              where('userEmail', '==', normEmail),
              where('orgId', '==', targetOrg.id),
              where('active', '==', true)
            )
          );
          if (!memEmailSnap.empty) {
            matchedDocSnap = memEmailSnap.docs[0];
            memberDoc = { id: matchedDocSnap.id, ...matchedDocSnap.data() } as OrgMember;
          }
        }
      }

      // If user is NOT associated with the company in org_members
      if (!memberDoc) {
        return {
          authorized: false,
          error: `Acesso não autorizado: O e-mail (${emailToCheck || 'informado'}) não está associado à empresa '${targetOrg.name}'. É necessário que o administrador da conta tenha realizado o seu cadastro prévio.`,
        };
      }

      setOrganization(targetOrg);
      setMember(memberDoc);
      await loadOrgHierarchy(targetOrg.id);
      if (currentUser) {
        await checkDeviceTrust(currentUser, targetOrg.id);
      }

      return { authorized: true, org: targetOrg, member: memberDoc };
    } catch (err: any) {
      console.error('Erro na validação de vínculo:', err);
      return { authorized: false, error: 'Falha ao validar associação da conta com a empresa.' };
    }
  };

  const signInWithGoogle = async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        await loadUserData(result.user, await syncServerSession(result.user));
        return result.user;
      }
      return null;
    } catch (err: any) {
      console.error('Erro no login Google:', err);
      setAuthError(err.message || 'Falha ao autenticar com Google.');
      throw err;
    }
  };

  // Streamlined Google Sign-In: Master -> Selective Panel, Regular User -> Direct to Assigned Single Company
  const signInWithGoogleAutoResolve = async (): Promise<{
    authorized: boolean;
    isMaster: boolean;
    org?: Organization;
    error?: string;
  }> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const googleUser = result.user;
      if (!googleUser || !googleUser.email) {
        return { authorized: false, isMaster: false, error: 'Não foi possível obter o e-mail da conta Google.' };
      }
      // Bind uid + fresh claims before any org-scoped read (rules check claims). Non-fatal, like onAuthStateChanged.
      await syncServerSession(googleUser);

      const normEmail = googleUser.email.toLowerCase().trim();
      const isMaster = normEmail === MASTER_EMAIL;

      if (isMaster) {
        sessionStorage.removeItem('gat_master_active_org');
        await fetchAllOrganizations();
        setOrganization(null);
        setMember({
          id: 'mem_master_global',
          orgId: '',
          userId: googleUser.uid,
          userEmail: MASTER_EMAIL,
          userName: googleUser.displayName || 'Gustavo Aguero (Master)',
          role: 'Admin',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setUser(googleUser);
        return { authorized: true, isMaster: true };
      }

      const resolved = await findSingleActiveMember(normEmail, googleUser.uid);
      if (!resolved) {
        await fbSignOut(auth);
        setUser(null);
        setMember(null);
        setOrganization(null);
        setOrganizations([]);
        return {
          authorized: false,
          isMaster: false,
          error: `O e-mail ${googleUser.email} não está vinculado a nenhuma empresa cadastrada. Solicite o cadastro ao administrador da sua empresa.`,
        };
      }

      const { member: mData, org: singleOrg } = resolved;

      setOrganizations([singleOrg]);
      setOrganization(singleOrg);
      setMember(mData);
      setUser(googleUser);
      await loadOrgHierarchy(singleOrg.id);
      await checkDeviceTrust(googleUser, singleOrg.id);

      return { authorized: true, isMaster: false, org: singleOrg };
    } catch (err: any) {
      console.error('Erro no login Google:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        return { authorized: false, isMaster: false };
      }
      return { authorized: false, isMaster: false, error: err?.message || 'Falha ao autenticar com o Google.' };
    }
  };

  const setupFirstAccessPassword = async (
    _memberId: string,
    _orgId: string,
    _newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Passwords are only set through the admin's first-access link (FirstAccessPage) or by the admin.
    return { success: false, error: FIRST_ACCESS_LINK_MSG };
  };

  const changeUserPassword = async (
    nameOrEmail: string,
    companyInput: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; memberName?: string }> => {
    const cleanUser = nameOrEmail.trim();
    const cleanCurrent = currentPassword.trim();
    const cleanNew = newPassword.trim();

    if (!cleanUser) {
      return { success: false, error: 'Por favor, informe seu Nome ou E-mail cadastrado.' };
    }
    if (!cleanCurrent) {
      return { success: false, error: 'Por favor, informe sua senha atual ou provisória.' };
    }
    if (!cleanNew || cleanNew.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    try {
      // Called from the login screen: authenticate on an isolated Auth instance so the app session is untouched.
      const login = await postJson('/api/auth/credential-login', {
        nameOrEmail: cleanUser,
        password: cleanCurrent,
        company: companyInput.trim() || undefined,
      });
      if (!login.ok) {
        return { success: false, error: login.data?.isFirstAccess ? FIRST_ACCESS_LINK_MSG : login.error || 'A senha atual / provisória informada não confere.' };
      }
      if (login.data.isMaster) {
        return { success: false, error: 'A senha Master não pode ser alterada por esta tela.' };
      }
      let res;
      try {
        const tmp = await signInWithCustomToken(isolatedAuth(), login.data.token);
        res = await postJson(
          '/api/auth/set-password',
          { currentPassword: cleanCurrent, newPassword: cleanNew },
          { Authorization: `Bearer ${await tmp.user.getIdToken()}` },
        );
      } finally {
        await fbSignOut(isolatedAuth()).catch(() => {});
      }
      if (!res.ok) {
        return { success: false, error: res.error || 'Falha ao alterar senha.' };
      }

      const memberData = login.data.member as OrgMember;
      await logAuditDirect(
        memberData.orgId,
        `member_${memberData.id}`,
        memberData.userEmail,
        'Segurança',
        'Alteração de Senha',
        `Senha de acesso alterada com sucesso pelo colaborador ${memberData.userName} (${memberData.userEmail}) na tela de login.`
      );

      return { success: true, memberName: memberData.userName };
    } catch (err: any) {
      console.error('Erro ao alterar senha:', err);
      return { success: false, error: err.message || 'Falha ao alterar senha.' };
    }
  };

  const adminSetUserPassword = async (
    memberId: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!newPassword || newPassword.trim().length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    try {
      const res = await postJson('/api/auth/set-password', { memberId, newPassword: newPassword.trim() });
      if (!res.ok) {
        return { success: false, error: res.error || 'Falha ao salvar senha.' };
      }

      if (organization) {
        await logAuditDirect(
          organization.id,
          user?.uid || 'admin',
          user?.email || 'admin',
          'Segurança',
          'Redefinição de Senha por Admin',
          `Senha do colaborador ${memberId} definida/redefinida pelo administrador.`,
          memberId
        );
      }

      return { success: true };
    } catch (err: any) {
      console.error('Erro ao definir senha pelo admin:', err);
      return { success: false, error: err.message || 'Falha ao salvar senha.' };
    }
  };

  const signInWithCredentials = async (
    nameOrEmail: string,
    password: string,
    companyInput?: string
  ): Promise<{
    success: boolean;
    isMaster?: boolean;
    isFirstAccess?: boolean;
    memberId?: string;
    memberName?: string;
    memberEmail?: string;
    orgId?: string;
    orgName?: string;
    error?: string;
  }> => {
    setAuthError(null);
    const cleanUser = nameOrEmail.trim();

    if (!cleanUser) {
      return { success: false, error: 'Por favor, informe seu E-mail ou Nome cadastrado.' };
    }

    try {
      const res = await postJson('/api/auth/credential-login', {
        nameOrEmail: cleanUser,
        password,
        company: companyInput?.trim() || undefined,
      });
      if (!res.ok) {
        if (res.data?.isFirstAccess) {
          return { success: false, isFirstAccess: true, memberName: res.data.memberName, error: FIRST_ACCESS_LINK_MSG };
        }
        return { success: false, error: res.error || 'Falha ao autenticar com as credenciais informadas.' };
      }

      if (res.data.isMaster) {
        // Load all companies and route Master to the Selective Company Panel
        sessionStorage.removeItem('gat_master_active_org');
        const cred = await signInWithCustomToken(auth, res.data.token);
        await fetchAllOrganizations();
        setOrganization(null);
        setUnits([]);
        setContracts([]);
        setMember({
          id: 'mem_master_global',
          orgId: '',
          userId: cred.user.uid,
          userEmail: MASTER_EMAIL,
          userName: 'Gustavo Aguero (Master)',
          role: 'Admin',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setUser(cred.user);

        return { success: true, isMaster: true };
      }

      const memberData = res.data.member as OrgMember;
      const targetOrg = res.data.org as Organization;
      const cred = await signInWithCustomToken(auth, res.data.token);

      // Establish direct single-company session
      setOrganization(targetOrg);
      setMember(memberData);
      setOrganizations([targetOrg]);
      setUser(cred.user);
      await loadOrgHierarchy(targetOrg.id);

      await logAuditDirect(
        targetOrg.id,
        cred.user.uid,
        memberData.userEmail,
        'Autenticação',
        'Login por Credenciais',
        `Acesso direto à empresa ${targetOrg.name} realizado por ${memberData.userName} (${memberData.userEmail}).`
      );

      return { success: true, isMaster: false, orgId: targetOrg.id, orgName: targetOrg.name };
    } catch (err: any) {
      console.error('Erro no login por credenciais:', err);
      return { success: false, error: err.message || 'Falha ao autenticar com as credenciais informadas.' };
    }
  };

  const signOut = async () => {
    try {
      sessionStorage.removeItem('gat_master_active_org');
      await fbSignOut(auth);
      setUser(null);
      setMember(null);
      setOrganization(null);
      setOrganizations([]);
      setUnits([]);
      setContracts([]);
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  const createOrganization = async (name: string, slug: string, cnpj?: string): Promise<Organization> => {
    if (!user) throw new Error('Usuário precisa estar autenticado para criar organização.');

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
    const orgId = `org_${cleanSlug}_${Date.now().toString(36)}`;

    const newOrg: Organization = {
      id: orgId,
      name: name.trim(),
      slug: cleanSlug,
      cnpj: cnpj?.trim() || '',
      email: user.email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'organizations', orgId), newOrg);

      const newMember =
        isMasterUser
          ? await ensureMasterMembership(newOrg, user.uid)
          : await (async () => {
              const memberId = `mem_${user.uid}_${orgId}`;
              const m: OrgMember = {
                id: memberId,
                orgId,
                userId: user.uid,
                userEmail: (user.email || '').toLowerCase().trim(),
                userName: user.displayName || user.email?.split('@')[0] || 'Administrador',
                role: 'Admin',
                active: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              await setDoc(doc(db, 'org_members', memberId), m);
              return m;
            })();

      await logAuditDirect(orgId, user.uid, user.email || '', 'Estrutura', 'Criar Organização', `Organização ${name} criada com sucesso.`);

      setOrganizations((prev) => {
        const merged = [...prev.filter((o) => o.id !== newOrg.id), newOrg];
        merged.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
        return merged;
      });
      orgSelectionSeq.current++;
      setOrganization(newOrg);
      setMember(newMember);
      if (isMasterUser) {
        sessionStorage.setItem('gat_master_active_org', newOrg.id);
      }
      await loadOrgHierarchy(newOrg.id);

      return newOrg;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `organizations/${orgId}`);
    }
  };

  const selectOrganization = async (orgId: string) => {
    if (!user) return;
    const isMaster = isMasterUser;
    // Strictly restrict multi-company switching to Master user only
    if (!isMaster) return;

    let targetOrg = organizations.find((o) => o.id === orgId);
    if (!targetOrg) {
      const orgDoc = await getDoc(doc(db, 'organizations', orgId));
      if (orgDoc.exists()) {
        targetOrg = { id: orgDoc.id, ...orgDoc.data() } as Organization;
      }
    }
    if (!targetOrg) return;

    try {
      orgSelectionSeq.current++;
      const masterMember = await ensureMasterMembership(targetOrg, user.uid);
      sessionStorage.setItem('gat_master_active_org', targetOrg.id);
      setSelectedUnitId('todas');
      setSelectedContractId('todos');
      setOrganization(targetOrg);
      setMember(masterMember);
      await loadOrgHierarchy(targetOrg.id);
    } catch (err) {
      console.error('Erro ao trocar organização:', err);
    }
  };

  const clearActiveOrganization = () => {
    const isMaster = isMasterUser;
    if (!isMaster) return;
    orgSelectionSeq.current++;
    sessionStorage.removeItem('gat_master_active_org');
    setOrganization(null);
    setUnits([]);
    setContracts([]);
    setSelectedUnitId('todas');
    setSelectedContractId('todos');
  };

  const logAuditDirect = async (
    orgId: string,
    userId: string,
    userEmail: string,
    module: string,
    action: string,
    details: string,
    targetId?: string
  ) => {
    try {
      const logData: AuditLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orgId,
        userId,
        userEmail,
        module,
        action,
        targetId: targetId || '',
        details,
        timestamp: new Date().toISOString(),
      };
      await addDoc(collection(db, 'audit_logs'), logData);
    } catch (err) {
      console.warn('Falha silenciosa ao registrar auditoria:', err);
    }
  };

  const logAudit = async (module: string, action: string, details: string, targetId?: string) => {
    if (!user || !organization) return;
    await logAuditDirect(organization.id, user.uid, user.email || '', module, action, details, targetId);
  };

  // Seed standard operational demo data explicitly identified as demonstration
  const seedDemoData = async () => {
    if (!user || !organization) return;
    setDemoDataLoaded(true);

    try {
      const orgId = organization.id;

      // 1. Units
      const unit1Id = `unit_central_${orgId}`;
      const unit2Id = `unit_regional_${orgId}`;
      await setDoc(doc(db, 'units', unit1Id), {
        id: unit1Id,
        orgId,
        name: 'Unidade Operacional Principal (Matriz)',
        code: 'UN-01',
        city: 'São Paulo',
        state: 'SP',
        managerName: 'Carlos Eduardo Mendes',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'units', unit2Id), {
        id: unit2Id,
        orgId,
        name: 'Centro de Serviços Regional',
        code: 'UN-02',
        city: 'Campinas',
        state: 'SP',
        managerName: 'Mariana Duarte',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 2. Cost Centers
      const cc1Id = `cc_operacional_${orgId}`;
      await setDoc(doc(db, 'cost_centers', cc1Id), {
        id: cc1Id,
        orgId,
        code: 'CC-101',
        name: 'Operações e Serviços Técnicos',
        budget: 180000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 3. Contracts
      const contractId = `ct_manut_${orgId}`;
      await setDoc(doc(db, 'contracts', contractId), {
        id: contractId,
        orgId,
        title: 'Contrato de Serviços Técnicos e Sustentação Operacional',
        contractNumber: 'CT-2026/088',
        partyName: 'TecnoService Manutenção & Operação Ltda',
        type: 'prestador',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'ativo',
        value: 120000.0,
        unitIds: [unit1Id, unit2Id],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 4. Assets
      const asset1Id = `ast_climatizacao_${orgId}`;
      const asset2Id = `ast_gerador_${orgId}`;
      await setDoc(doc(db, 'assets', asset1Id), {
        id: asset1Id,
        orgId,
        unitId: unit1Id,
        tag: 'ATV-1001',
        name: 'Sistema de Climatização Central Chiller 80TR',
        category: 'Facilities & Climatização',
        model: 'Carrier AquaSnap 30RB',
        serialNumber: 'CR-884210',
        status: 'operacional',
        location: 'Cobertura Técnica - Bloco A',
        lastMaintenanceDate: '2026-09-20',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'assets', asset2Id), {
        id: asset2Id,
        orgId,
        unitId: unit1Id,
        tag: 'ATV-1002',
        name: 'Grupo Gerador a Diesel 500kVA',
        category: 'Energia & Utilidades',
        model: 'Cummins C500D6',
        serialNumber: 'CM-2024-09',
        status: 'em_manutencao',
        location: 'Subsolo 1 - Sala de Força',
        lastMaintenanceDate: '2026-10-02',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 5. Teams
      const teamId = `team_eletro_${orgId}`;
      await setDoc(doc(db, 'teams', teamId), {
        id: teamId,
        orgId,
        name: 'Equipe de Operações e Serviços Técnicos',
        specialty: 'Eletromecânica & Facilities',
        leaderName: 'Roberto Silva',
        memberCount: 6,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 6. Items (Materials & Services)
      const item1Id = `item_valvula_${orgId}`;
      const item2Id = `item_filtro_${orgId}`;
      const item3Id = `item_oleo_${orgId}`;
      await setDoc(doc(db, 'items', item1Id), {
        id: item1Id,
        orgId,
        sku: 'SKU-VLV-304',
        name: 'Válvula Reguladora de Fluxo 2" em Aço Inox',
        type: 'peca',
        category: 'Tubulações & Fluidos',
        unitOfMeasure: 'UN',
        referencePrice: 420.0,
        minStock: 5,
        maxStock: 30,
        criticalStock: 3,
        supplier: 'Distribuidora Central de Válvulas',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'items', item2Id), {
        id: item2Id,
        orgId,
        sku: 'SKU-FLT-HEPA',
        name: 'Filtro de Ar de Alta Eficiência HEPA H13',
        type: 'peca',
        category: 'Climatização & Filtros',
        unitOfMeasure: 'UN',
        referencePrice: 185.0,
        minStock: 10,
        maxStock: 50,
        criticalStock: 4,
        supplier: 'Filtros & Ar Técnico Ltda',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'items', item3Id), {
        id: item3Id,
        orgId,
        sku: 'SKU-LUB-ISO68',
        name: 'Lubrificante Sintético Industrial ISO VG 68 (Balde 20L)',
        type: 'peca',
        category: 'Fluidos e Lubrificantes',
        unitOfMeasure: 'BALDE',
        referencePrice: 380.0,
        minStock: 8,
        maxStock: 40,
        criticalStock: 5,
        supplier: 'PetroLube Distribuição',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Stock balances
      await setDoc(doc(db, 'stock_balances', `bal_${unit1Id}_${item1Id}`), {
        id: `bal_${unit1Id}_${item1Id}`,
        orgId,
        unitId: unit1Id,
        itemId: item1Id,
        currentBalance: 12,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'stock_balances', `bal_${unit1Id}_${item2Id}`), {
        id: `bal_${unit1Id}_${item2Id}`,
        orgId,
        unitId: unit1Id,
        itemId: item2Id,
        currentBalance: 2, // Critical level!
        updatedAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'stock_balances', `bal_${unit1Id}_${item3Id}`), {
        id: `bal_${unit1Id}_${item3Id}`,
        orgId,
        unitId: unit1Id,
        itemId: item3Id,
        currentBalance: 18,
        updatedAt: new Date().toISOString(),
      });

      // 7. Work Orders
      const order1Id = `os_1001_${orgId}`;
      const order2Id = `os_1002_${orgId}`;
      const order3Id = `os_1003_${orgId}`;

      await setDoc(doc(db, 'work_orders', order1Id), {
        id: order1Id,
        orgId,
        unitId: unit1Id,
        contractId,
        costCenterId: cc1Id,
        assetId: asset1Id,
        orderNumber: 'OS-2026-001',
        title: 'Manutenção Preventiva do Chiller e Troca de Filtros',
        description: 'Revisão periódica de compressores, medição de pressão do gás refrigerante, inspeção de comandos e troca dos filtros de ar.',
        orderType: 'preventiva',
        priority: 'alta',
        status: 'em_execucao',
        requesterId: user.uid,
        requesterName: user.displayName || 'Coordenação de Operações',
        assignedTeam: 'Equipe de Operações e Serviços Técnicos',
        assignedUsers: [user.uid],
        scheduledStartDate: '2026-10-14',
        scheduledEndDate: '2026-10-18',
        actualStartDate: '2026-10-15',
        estimatedHours: 16,
        actualHours: 8,
        estimatedCost: 2850.0,
        messageCount: 3,
        pendingQuestionCount: 0,
        plannedServices: [
          {
            id: 'srv_1',
            description: 'Inspeção preliminar de pressões e vazamentos de refrigerante',
            category: 'mecanica',
            estimatedHours: 3,
            actualHours: 3,
            status: 'concluido',
            assignedWorker: 'Carlos Mecânico',
            completedAt: '2026-10-15T11:30:00.000Z',
          },
          {
            id: 'srv_2',
            description: 'Substituição e higienização dos filtros HEPA H13',
            category: 'climatizacao' as any,
            estimatedHours: 4,
            actualHours: 3,
            status: 'concluido',
            assignedWorker: 'Carlos Mecânico',
            completedAt: '2026-10-15T15:00:00.000Z',
          },
          {
            id: 'srv_3',
            description: 'Medição de corrente dos compressores e reaperto de barramentos',
            category: 'eletrica',
            estimatedHours: 5,
            actualHours: 2,
            status: 'em_andamento',
            assignedWorker: 'André Eletricista',
          },
          {
            id: 'srv_4',
            description: 'Teste de carga contínua por 4 horas e emissão de laudo',
            category: 'geral',
            estimatedHours: 4,
            actualHours: 0,
            status: 'planejado',
          },
        ],
        plannedLabor: [
          {
            id: 'lab_1',
            workerName: 'Carlos Mecânico',
            role: 'Mecânico de Climatização Sênior',
            estimatedHours: 8,
            actualHours: 6,
            hourlyRate: 85,
            totalCost: 680,
            status: 'em_campo',
          },
          {
            id: 'lab_2',
            workerName: 'André Eletrotécnico',
            role: 'Eletricista de Força e Controle',
            estimatedHours: 8,
            actualHours: 2,
            hourlyRate: 90,
            totalCost: 720,
            status: 'alocado',
          },
        ],
        plannedParts: [
          {
            id: 'prt_1',
            sku: 'SKU-FLT-HEPA',
            name: 'Filtro de Ar de Alta Eficiência HEPA H13',
            quantityPlanned: 4,
            quantityUsed: 4,
            unit: 'UN',
            unitPrice: 185,
            totalCost: 740,
            status: 'aplicado',
          },
          {
            id: 'prt_2',
            sku: 'SKU-LUB-ISO68',
            name: 'Lubrificante Sintético Industrial ISO VG 68',
            quantityPlanned: 1,
            quantityUsed: 0,
            unit: 'BALDE',
            unitPrice: 380,
            totalCost: 380,
            status: 'disponivel',
          },
        ],
        notes: '[Demonstração ilustrativa — dados fictícios] Acesso autorizado à cobertura técnica.',
        createdAt: '2026-10-14T08:00:00.000Z',
        updatedAt: new Date().toISOString(),
      });

      // Sample discussion messages for OS 1
      await setDoc(doc(db, 'order_messages', `msg_1_${order1Id}`), {
        id: `msg_1_${order1Id}`,
        orgId,
        orderId: order1Id,
        senderId: 'sup_01',
        senderName: 'Engenheiro Marcelo (Superior)',
        senderRole: 'Superior',
        messageType: 'pergunta',
        content: 'Como está o diferencial de pressão nos filtros após a substituição inicial?',
        createdAt: '2026-10-15T11:45:00.000Z',
        resolved: true,
      });

      await setDoc(doc(db, 'order_messages', `msg_2_${order1Id}`), {
        id: `msg_2_${order1Id}`,
        orgId,
        orderId: order1Id,
        senderId: user.uid,
        senderName: 'Carlos Mecânico (Responsável)',
        senderRole: 'Responsavel',
        messageType: 'resposta',
        replyToId: `msg_1_${order1Id}`,
        replyToAuthor: 'Engenheiro Marcelo',
        replyToContent: 'Como está o diferencial de pressão nos filtros...',
        content: 'Diferencial caiu de 280 Pa para 75 Pa. Fluxo nominal restabelecido conforme especificação do fabricante.',
        createdAt: '2026-10-15T12:10:00.000Z',
      });

      await setDoc(doc(db, 'order_messages', `msg_3_${order1Id}`), {
        id: `msg_3_${order1Id}`,
        orgId,
        orderId: order1Id,
        senderId: 'sup_01',
        senderName: 'Engenheiro Marcelo (Superior)',
        senderRole: 'Superior',
        messageType: 'liberacao',
        content: 'Excelente resultado. Autorizado o avanço para a etapa elétrica e medição de corrente.',
        createdAt: '2026-10-15T12:20:00.000Z',
      });

      // Sample events for OS 1
      await setDoc(doc(db, 'order_events', `evt_1_${order1Id}`), {
        id: `evt_1_${order1Id}`,
        orgId,
        orderId: order1Id,
        userId: user.uid,
        userName: user.displayName || 'Coordenador Operacional',
        eventType: 'criacao',
        description: 'Ordem de Serviço OS-2026-001 aberta no estado "Aberto".',
        newStatus: 'aberto',
        timestamp: '2026-10-14T08:00:00.000Z',
      });

      await setDoc(doc(db, 'order_events', `evt_2_${order1Id}`), {
        id: `evt_2_${order1Id}`,
        orgId,
        orderId: order1Id,
        userId: user.uid,
        userName: 'Carlos Mecânico',
        eventType: 'mudanca_status',
        description: 'Transição operacional: Aberto → Em Execução. Equipe mobilizada com ferramentas e EPIs.',
        previousStatus: 'aberto',
        newStatus: 'em_execucao',
        timestamp: '2026-10-15T08:30:00.000Z',
      });

      await setDoc(doc(db, 'order_events', `evt_3_${order1Id}`), {
        id: `evt_3_${order1Id}`,
        orgId,
        orderId: order1Id,
        userId: 'sup_01',
        userName: 'Engenheiro Marcelo (Superior)',
        eventType: 'dialogo',
        description: '[Diálogo] Superior alinhou medição de pressão dos filtros e autorizou continuidade elétrica.',
        timestamp: '2026-10-15T12:20:00.000Z',
      });

      await setDoc(doc(db, 'work_orders', order2Id), {
        id: order2Id,
        orgId,
        unitId: unit1Id,
        contractId,
        costCenterId: cc1Id,
        assetId: asset2Id,
        orderNumber: 'OS-2026-002',
        title: 'Inspeção e Troca da Válvula Reguladora de Pressão',
        description: 'Vazamento intermitente detectado na conexão do gerador. Troca da junta e teste de estanqueidade.',
        orderType: 'corretiva',
        priority: 'critica',
        status: 'aguardando_pecas',
        requesterId: user.uid,
        requesterName: 'Supervisor de Operações',
        assignedTeam: 'Equipe de Operações e Serviços Técnicos',
        scheduledStartDate: '2026-10-16',
        scheduledEndDate: '2026-10-17',
        estimatedHours: 6,
        actualHours: 2,
        estimatedCost: 1450.0,
        messageCount: 1,
        pendingQuestionCount: 1,
        plannedServices: [
          {
            id: 'srv_2_1',
            description: 'Bloqueio do fluxo e despressurização da linha',
            category: 'caldeiraria',
            estimatedHours: 2,
            actualHours: 2,
            status: 'concluido',
            assignedWorker: 'Roberto Silva',
          },
          {
            id: 'srv_2_2',
            description: 'Substituição da válvula reguladora 2" e juntas de vedação',
            category: 'mecanica',
            estimatedHours: 4,
            actualHours: 0,
            status: 'planejado',
          },
        ],
        plannedLabor: [
          {
            id: 'lab_2_1',
            workerName: 'Roberto Silva',
            role: 'Caldeireiro Especialista',
            estimatedHours: 6,
            actualHours: 2,
            hourlyRate: 95,
            totalCost: 570,
            status: 'em_campo',
          },
        ],
        plannedParts: [
          {
            id: 'prt_2_1',
            sku: 'SKU-VLV-304',
            name: 'Válvula Reguladora de Fluxo 2" em Aço Inox',
            quantityPlanned: 1,
            quantityUsed: 0,
            unit: 'UN',
            unitPrice: 420,
            totalCost: 420,
            status: 'solicitado',
          },
        ],
        notes: '[Demonstração ilustrativa — dados fictícios] Requer bloqueio de segurança.',
        createdAt: '2026-10-16T09:00:00.000Z',
        updatedAt: new Date().toISOString(),
      });

      // Sample question for OS 2
      await setDoc(doc(db, 'order_messages', `msg_1_${order2Id}`), {
        id: `msg_1_${order2Id}`,
        orgId,
        orderId: order2Id,
        senderId: user.uid,
        senderName: 'Roberto Silva (Responsável)',
        senderRole: 'Responsavel',
        messageType: 'pergunta',
        content: 'Linha despressurizada. A nova válvula já foi liberada pelo almoxarifado ou necessita de pedido emergencial?',
        createdAt: '2026-10-16T11:00:00.000Z',
        resolved: false,
      });

      await setDoc(doc(db, 'order_events', `evt_1_${order2Id}`), {
        id: `evt_1_${order2Id}`,
        orgId,
        orderId: order2Id,
        userId: user.uid,
        userName: 'Roberto Silva',
        eventType: 'criacao',
        description: 'OS-2026-002 registrada com prioridade Crítica para o Gerador.',
        timestamp: '2026-10-16T09:00:00.000Z',
      });

      await setDoc(doc(db, 'work_orders', order3Id), {
        id: order3Id,
        orgId,
        unitId: unit2Id,
        contractId,
        orderNumber: 'OS-2026-003',
        title: 'Vistoria Termográfica do Quadro Geral de Distribuição',
        description: 'Inspeção termográfica preventiva em barramentos e disjuntores da subestação.',
        orderType: 'inspecao',
        priority: 'media',
        status: 'concluido',
        requesterId: user.uid,
        requesterName: 'Auditoria de Qualidade',
        assignedTeam: 'Equipe de Operações e Serviços Técnicos',
        scheduledStartDate: '2026-10-05',
        scheduledEndDate: '2026-10-06',
        actualStartDate: '2026-10-05',
        actualEndDate: '2026-10-06',
        estimatedHours: 4,
        actualHours: 4,
        estimatedCost: 800.0,
        messageCount: 2,
        pendingQuestionCount: 0,
        plannedServices: [
          {
            id: 'srv_3_1',
            description: 'Varredura termográfica infravermelha com câmera calibrada',
            category: 'eletrica',
            estimatedHours: 4,
            actualHours: 4,
            status: 'concluido',
            assignedWorker: 'André Eletricista',
            completedAt: '2026-10-06T14:00:00.000Z',
          },
        ],
        notes: '[Demonstração ilustrativa — dados fictícios] Todos os pontos em conformidade técnica.',
        createdAt: '2026-10-05T07:30:00.000Z',
        updatedAt: '2026-10-06T15:00:00.000Z',
      });

      // 8. Occurrences
      const occId = `occ_101_${orgId}`;
      await setDoc(doc(db, 'occurrences', occId), {
        id: occId,
        orgId,
        unitId: unit1Id,
        assetId: asset2Id,
        orderId: order2Id,
        title: 'Vazamento detectado em conexão de combustível do gerador',
        description: 'Identificado gotejamento de diesel na linha de retorno. Área isolada preventivamente.',
        type: 'seguranca',
        urgency: 'alta',
        status: 'acao_corretiva',
        reportedBy: user.displayName || 'Inspetor Técnico',
        assignedTo: 'Equipe de Operações e Serviços Técnicos',
        deadline: '2026-10-18',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await loadOrgHierarchy(orgId);
      await logAudit(
        'Demonstração',
        'Carga de Dados',
        'Carga de dados de demonstração operacionais carregada com identificação oficial [Demonstração ilustrativa — dados fictícios].'
      );
    } catch (err) {
      console.error('Erro ao popular dados de demonstração:', err);
    }
  };

  const isMasterUser =
    user?.email?.toLowerCase().trim() === MASTER_EMAIL ||
    member?.userEmail?.toLowerCase().trim() === MASTER_EMAIL;
  const role: UserRole = isMasterUser ? 'Admin' : (member?.role || 'Visualizador');
  const isAdmin = isMasterUser || role === 'Admin';
  const isManagerOrAbove = isMasterUser || role === 'Admin' || role === 'Gerente';
  const isSupervisorOrAbove = isMasterUser || role === 'Admin' || role === 'Gerente' || role === 'Supervisor';
  // Financial numbers and 100% of modules visible to Admin, Gerente, and Master User
  const canViewFinancials = isMasterUser || role === 'Admin' || role === 'Gerente';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        member,
        organization,
        organizations,
        role,
        isMaster: isMasterUser,
        isAdmin,
        isManagerOrAbove,
        isSupervisorOrAbove,
        canViewFinancials,
        selectedUnitId,
        setSelectedUnitId,
        selectedContractId,
        setSelectedContractId,
        units,
        contracts,
        deviceId,
        isDeviceTrusted,
        requireMfaVerification,
        trustedDevices,
        confirmMfaAndTrustDevice,
        revokeTrustedDevice,
        signInWithGoogle,
        signInWithGoogleAutoResolve,
        signInWithCredentials,
        setupFirstAccessPassword,
        changeUserPassword,
        adminSetUserPassword,
        signOut,
        createOrganization,
        selectOrganization,
        clearActiveOrganization,
        refreshOrganizations,
        validateUserOrgMembershipBySlug,
        logAudit,
        seedDemoData,
        demoDataLoaded,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
