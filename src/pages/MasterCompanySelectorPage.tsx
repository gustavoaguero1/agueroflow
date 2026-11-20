import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, MASTER_EMAIL } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Organization, OrgMember, UserRole } from '../types';
import { GatLogo } from '../components/common/GatLogo';
import {
  Building2,
  Plus,
  Search,
  ChevronRight,
  Users,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  X,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface MasterCompanySelectorPageProps {
  onOrganizationSelected: () => void;
}

const ACCENT_MONOS = [
  'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0A84FF]/15 dark:text-[#409CFF]',
  'bg-[#5856D6]/10 text-[#5856D6] dark:bg-[#5E5CE6]/15 dark:text-[#7D7AFF]',
  'bg-[#1E7E34]/10 text-[#1E7E34] dark:bg-[#30D158]/15 dark:text-[#30D158]',
  'bg-[#B25000]/10 text-[#B25000] dark:bg-[#FF9F0A]/15 dark:text-[#FF9F0A]',
  'bg-[#007AFF]/10 text-[#0055B3] dark:bg-[#64D2FF]/15 dark:text-[#64D2FF]',
  'bg-black/[0.06] text-[#1D1D1F] dark:bg-white/[0.10] dark:text-[#F5F5F7]',
];

export const MasterCompanySelectorPage: React.FC<MasterCompanySelectorPageProps> = ({
  onOrganizationSelected,
}) => {
  const {
    user,
    organizations,
    selectOrganization,
    createOrganization,
    refreshOrganizations,
    signOut,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'empresas' | 'usuarios'>('empresas');
  const [searchQuery, setSearchQuery] = useState('');
  const [allMembers, setAllMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectingOrgId, setSelectingOrgId] = useState<string | null>(null);

  // Create Company Modal
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgCnpj, setNewOrgCnpj] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgModalError, setOrgModalError] = useState<string | null>(null);

  // Create User (1 company per email) Modal
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserOrgId, setNewUserOrgId] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Operacional');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewUserPass, setShowNewUserPass] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userModalError, setUserModalError] = useState<string | null>(null);

  // Feedback Banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMembersData = async () => {
    setLoadingMembers(true);
    try {
      const snap = await getDocs(collection(db, 'org_members'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrgMember));
      setAllMembers(list);
    } catch (err) {
      console.warn('Erro ao carregar lista global de usuários:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    refreshOrganizations();
    loadMembersData();
  }, [refreshOrganizations]);

  const orgMap = useMemo(() => {
    const map = new Map<string, Organization>();
    organizations.forEach((o) => map.set(o.id, o));
    return map;
  }, [organizations]);

  const memberCountByOrg = useMemo(() => {
    const counts: Record<string, number> = {};
    allMembers.forEach((m) => {
      if (m.active && m.userEmail?.toLowerCase() !== MASTER_EMAIL) {
        counts[m.orgId] = (counts[m.orgId] || 0) + 1;
      }
    });
    return counts;
  }, [allMembers]);

  const nonMasterMembers = useMemo(() => {
    return allMembers
      .filter((m) => m.userEmail?.toLowerCase().trim() !== MASTER_EMAIL)
      .sort((a, b) => (a.userName || a.userEmail || '').localeCompare(b.userName || b.userEmail || '', 'pt-BR'));
  }, [allMembers]);

  const filteredOrgs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return organizations;
    return organizations.filter(
      (o) =>
        o.name?.toLowerCase().includes(q) ||
        o.slug?.toLowerCase().includes(q) ||
        o.cnpj?.toLowerCase().includes(q)
    );
  }, [organizations, searchQuery]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return nonMasterMembers;
    return nonMasterMembers.filter((m) => {
      const orgName = orgMap.get(m.orgId)?.name || '';
      return (
        m.userName?.toLowerCase().includes(q) ||
        m.userEmail?.toLowerCase().includes(q) ||
        orgName.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
      );
    });
  }, [nonMasterMembers, searchQuery, orgMap]);

  const handleEnterCompany = async (orgId: string) => {
    setSelectingOrgId(orgId);
    try {
      await selectOrganization(orgId);
      onOrganizationSelected();
    } finally {
      setSelectingOrgId(null);
    }
  };

  const handleCreateOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgModalError(null);
    if (!newOrgName.trim()) {
      setOrgModalError('Informe o nome da empresa.');
      return;
    }

    setCreatingOrg(true);
    try {
      const slug =
        newOrgSlug.trim() ||
        newOrgName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

      const created = await createOrganization(newOrgName.trim(), slug, newOrgCnpj.trim());
      setShowCreateOrgModal(false);
      setNewOrgName('');
      setNewOrgSlug('');
      setNewOrgCnpj('');
      setFeedback({ type: 'success', text: `Empresa "${created.name}" criada e pronta para acesso.` });
      onOrganizationSelected();
    } catch (err: any) {
      setOrgModalError(err?.message || 'Não foi possível criar a empresa.');
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserModalError(null);

    const normEmail = newUserEmail.trim().toLowerCase();
    const cleanName = newUserName.trim();
    const cleanPass = newUserPassword.trim();

    if (!cleanName || !normEmail || !newUserOrgId) {
      setUserModalError('Preencha nome, e-mail corporativo e a empresa de destino.');
      return;
    }

    if (normEmail === MASTER_EMAIL) {
      setUserModalError('O e-mail Master já possui acesso irrestrito a todas as empresas.');
      return;
    }

    if (cleanPass && cleanPass.length < 6) {
      setUserModalError('A senha inicial deve ter no mínimo 6 caracteres (ou deixe em branco para primeiro acesso).');
      return;
    }

    // Strictly enforce 1 company per email across all organizations
    const existing = allMembers.find(
      (m) => m.active && m.userEmail?.toLowerCase().trim() === normEmail
    );
    if (existing) {
      const existingOrgName = orgMap.get(existing.orgId)?.name || existing.orgId;
      setUserModalError(
        `Este e-mail já está vinculado à empresa "${existingOrgName}". O sistema limita a 1 empresa por e-mail.`
      );
      return;
    }

    setCreatingUser(true);
    try {
      const memId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();
      const newMember: OrgMember = {
        id: memId,
        orgId: newUserOrgId,
        userId: `uid_manual_${Date.now()}`,
        userEmail: normEmail,
        userName: cleanName,
        role: newUserRole,
        active: true,
        passwordHash: cleanPass || undefined,
        passwordSet: Boolean(cleanPass),
        passwordSetAt: cleanPass ? now : undefined,
        initialPasswordSetByAdmin: Boolean(cleanPass),
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'org_members', memId), newMember);
      setAllMembers((prev) => [...prev, newMember]);
      setShowCreateUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setFeedback({
        type: 'success',
        text: `Usuário "${cleanName}" vinculado diretamente à empresa "${orgMap.get(newUserOrgId)?.name || ''}".`,
      });
    } catch (err: any) {
      setUserModalError(err?.message || 'Erro ao vincular usuário.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleChangeMemberOrg = async (member: OrgMember, targetOrgId: string) => {
    if (!targetOrgId || targetOrgId === member.orgId) return;
    try {
      await updateDoc(doc(db, 'org_members', member.id), {
        orgId: targetOrgId,
        updatedAt: new Date().toISOString(),
      });
      setAllMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, orgId: targetOrgId } : m))
      );
      setFeedback({
        type: 'success',
        text: `${member.userName} transferido para "${orgMap.get(targetOrgId)?.name || ''}".`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao atualizar empresa do usuário.' });
    }
  };

  const handleDeleteMember = async (member: OrgMember) => {
    try {
      await deleteDoc(doc(db, 'org_members', member.id));
      setAllMembers((prev) => prev.filter((m) => m.id !== member.id));
      setFeedback({ type: 'success', text: `Vínculo de ${member.userEmail} removido.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao remover usuário.' });
    }
  };

  const getInitials = (name: string) => {
    const parts = (name || 'EM').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0B0C10] text-[#1D1D1F] dark:text-[#F5F5F7] flex flex-col">
      {/* Apple Translucent Top Header */}
      <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-[#161618]/80 backdrop-blur-xl border-b border-black/[0.08] dark:border-white/[0.08]">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <GatLogo size="sm" />
            <div className="h-5 w-px bg-black/[0.1] dark:bg-white/[0.12] hidden sm:block" />
            <div className="hidden sm:flex items-center space-x-1.5 text-xs font-medium text-[#6E6E73] dark:text-[#98989D]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
              <span>Painel Seletivo Master</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro'}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-black/[0.04] hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors cursor-pointer"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#6E6E73]" />
                  <span className="hidden sm:inline">Escuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#FF9F0A]" />
                  <span className="hidden sm:inline">Claro</span>
                </>
              )}
            </button>

            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] text-xs">
              <div className="w-5 h-5 rounded-full bg-[#0071E3] text-white flex items-center justify-center text-[10px] font-semibold apple-solid-btn">
                G
              </div>
              <span className="text-[#424245] dark:text-[#AEAEB2] font-medium truncate max-w-[180px]">
                {user?.email || MASTER_EMAIL}
              </span>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6E73] hover:text-[#D70015] dark:text-[#98989D] dark:hover:text-[#FF453A] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Title & Segmented Control */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] mb-1.5">
              Acesso Executivo Multiempresa
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.025em] text-[#1D1D1F] dark:text-[#F5F5F7]">
              Selecione uma empresa
            </h1>
            <p className="text-sm text-[#6E6E73] dark:text-[#98989D] mt-2 max-w-xl leading-relaxed">
              Como usuário Master, você acessa todas as operações cadastradas. Os demais usuários entram diretamente na empresa vinculada ao seu e-mail.
            </p>
          </div>

          {/* macOS Segmented Control */}
          <div className="inline-flex p-1 rounded-xl bg-black/[0.06] dark:bg-white/[0.08] self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('empresas')}
              className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer flex items-center space-x-2 ${
                activeTab === 'empresas'
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  : 'text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Empresas</span>
              <span className="tabular-nums opacity-70">({organizations.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('usuarios')}
              className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer flex items-center space-x-2 ${
                activeTab === 'usuarios'
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1D1D1F] dark:text-[#F5F5F7] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  : 'text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Usuários por Empresa</span>
              <span className="tabular-nums opacity-70">({nonMasterMembers.length})</span>
            </button>
          </div>
        </div>

        {/* Feedback Toast */}
        {feedback && (
          <div
            className={`px-4 py-3 rounded-2xl text-xs font-medium flex items-center justify-between border ${
              feedback.type === 'success'
                ? 'bg-[#E8F8EE] dark:bg-[#1E7E34]/20 border-[#1E7E34]/20 text-[#1E7E34] dark:text-[#30D158]'
                : 'bg-[#FFECEF] dark:bg-[#D70015]/20 border-[#D70015]/20 text-[#D70015] dark:text-[#FF453A]'
            }`}
          >
            <div className="flex items-center space-x-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Toolbar: Search + Primary CTA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'empresas'
                  ? 'Buscar empresa por nome, identificador ou CNPJ...'
                  : 'Buscar usuário por nome, e-mail ou empresa...'
              }
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] text-sm text-[#1D1D1F] dark:text-[#F5F5F7] placeholder:text-[#86868B] focus:outline-none focus:border-[#0071E3] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            />
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={() => {
                refreshOrganizations();
                loadMembersData();
              }}
              className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] hover:bg-black/[0.03] dark:hover:bg-white/[0.06] text-xs font-medium text-[#424245] dark:text-[#AEAEB2] inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar</span>
            </button>

            {activeTab === 'empresas' ? (
              <button
                type="button"
                onClick={() => {
                  setOrgModalError(null);
                  setShowCreateOrgModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold inline-flex items-center space-x-1.5 shadow-[0_1px_3px_rgba(0,113,227,0.3)] transition-all cursor-pointer apple-solid-btn whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Empresa</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUserModalError(null);
                  setNewUserOrgId(organizations[0]?.id || '');
                  setShowCreateUserModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold inline-flex items-center space-x-1.5 shadow-[0_1px_3px_rgba(0,113,227,0.3)] transition-all cursor-pointer apple-solid-btn whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                <span>Vincular Usuário</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: COMPANIES GRID */}
        {activeTab === 'empresas' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredOrgs.map((org, idx) => {
              const userCount = memberCountByOrg[org.id] || 0;
              const isEntering = selectingOrgId === org.id;
              const monoClass = ACCENT_MONOS[idx % ACCENT_MONOS.length];

              return (
                <button
                  key={org.id}
                  type="button"
                  disabled={Boolean(selectingOrgId)}
                  onClick={() => handleEnterCompany(org.id)}
                  className="group text-left p-6 rounded-[22px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] hover:border-[#0071E3]/60 dark:hover:border-[#0A84FF]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.025)] hover:shadow-[0_8px_28px_rgba(0,113,227,0.10)] transition-all duration-200 flex flex-col justify-between min-h-[184px] cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold tracking-tight shrink-0 ${monoClass}`}
                    >
                      {getInitials(org.name)}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.07] group-hover:bg-[#0071E3] group-hover:text-white text-[#86868B] flex items-center justify-center transition-colors">
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  <div className="mt-5">
                    <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-[#1D1D1F] dark:text-[#F5F5F7] group-hover:text-[#0071E3] dark:group-hover:text-[#409CFF] transition-colors truncate">
                      {org.name}
                    </h2>
                    <p className="text-xs font-mono text-[#86868B] mt-0.5 truncate">
                      {org.cnpj ? org.cnpj : org.slug}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#98989D]">
                    <span className="inline-flex items-center space-x-1.5 tabular-nums">
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        {userCount} {userCount === 1 ? 'usuário' : 'usuários'}
                      </span>
                    </span>
                    <span className="font-semibold text-[#0071E3] dark:text-[#409CFF]">
                      {isEntering ? 'Abrindo...' : 'Acessar'}
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredOrgs.length === 0 && (
              <div className="col-span-full py-16 text-center rounded-[22px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10]">
                <Building2 className="w-9 h-9 text-[#86868B] mx-auto mb-3 opacity-60" />
                <p className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Nenhuma empresa encontrada
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-1">
                  Ajuste a busca ou cadastre uma nova empresa para começar.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GLOBAL USERS TABLE (1 COMPANY PER EMAIL) */}
        {activeTab === 'usuarios' && (
          <div className="rounded-[22px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.025)] overflow-hidden">
            <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Direcionamento Automático por E-mail
                </h3>
                <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
                  Regra ativa: cada e-mail corporativo acessa exclusivamente 1 empresa cadastrada.
                </p>
              </div>
              <span className="text-xs text-[#6E6E73] dark:text-[#98989D] tabular-nums">
                {filteredMembers.length} {filteredMembers.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            {loadingMembers ? (
              <div className="p-10 text-center text-xs text-[#86868B]">Carregando usuários...</div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-8 h-8 text-[#86868B] mx-auto mb-2 opacity-60" />
                <p className="text-sm font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Nenhum usuário corporativo vinculado
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-1">
                  Clique em &ldquo;Vincular Usuário&rdquo; para associar um e-mail diretamente a uma empresa.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.06] dark:border-white/[0.08] bg-[#F5F5F7]/70 dark:bg-white/[0.03] text-[#6E6E73] dark:text-[#98989D]">
                      <th className="py-3 px-5 font-semibold">Colaborador</th>
                      <th className="py-3 px-4 font-semibold">E-mail de Login</th>
                      <th className="py-3 px-4 font-semibold">Empresa Exclusiva</th>
                      <th className="py-3 px-4 font-semibold">Perfil</th>
                      <th className="py-3 px-5 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    {filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-[#F9F9FB] dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-5 font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                          {m.userName || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#424245] dark:text-[#AEAEB2]">
                          {m.userEmail}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={m.orgId}
                            onChange={(e) => handleChangeMemberOrg(m, e.target.value)}
                            className="px-2.5 py-1 rounded-lg bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.08] dark:border-white/[0.10] text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] cursor-pointer"
                          >
                            {organizations.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 text-[#6E6E73] dark:text-[#98989D] font-medium">
                          {m.role}
                        </td>
                        <td className="py-3 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteMember(m)}
                            title="Remover vínculo"
                            className="p-1.5 rounded-lg text-[#86868B] hover:text-[#D70015] hover:bg-[#FFECEF] dark:hover:bg-[#FF453A]/15 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: Nova Empresa */}
      {showCreateOrgModal && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.18)] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Nova Empresa
                </h3>
                <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
                  Cadastre uma nova operação para acesso imediato.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateOrgModal(false)}
                className="p-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {orgModalError && (
              <div className="p-3 rounded-xl bg-[#FFECEF] dark:bg-[#FF453A]/15 text-[#D70015] dark:text-[#FF453A] text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{orgModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1.5">
                  Nome da Empresa
                </label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewOrgName(val);
                    setNewOrgSlug(
                      val
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                    );
                  }}
                  placeholder="Ex: Aguero Inox"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm text-[#1D1D1F] dark:text-[#F5F5F7]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1.5">
                  Identificador (slug)
                </label>
                <input
                  type="text"
                  required
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                  placeholder="aguero-inox"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm font-mono text-[#1D1D1F] dark:text-[#F5F5F7]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1.5">
                  CNPJ (opcional)
                </label>
                <input
                  type="text"
                  value={newOrgCnpj}
                  onChange={(e) => setNewOrgCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm font-mono text-[#1D1D1F] dark:text-[#F5F5F7]"
                />
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#6E6E73] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingOrg}
                  className="px-5 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 apple-solid-btn"
                >
                  {creatingOrg ? 'Criando...' : 'Criar e Acessar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Vincular Usuário (1 empresa por e-mail) */}
      {showCreateUserModal && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.18)] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">
                  Vincular Usuário à Empresa
                </h3>
                <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5">
                  O usuário entrará diretamente nesta empresa ao fazer login.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateUserModal(false)}
                className="p-1.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#6E6E73] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {userModalError && (
              <div className="p-3 rounded-xl bg-[#FFECEF] dark:bg-[#FF453A]/15 text-[#D70015] dark:text-[#FF453A] text-xs flex items-start space-x-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{userModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUserSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex: Maria Oliveira"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                  E-mail Corporativo (1 empresa por e-mail)
                </label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="usuario@empresa.com.br"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                    Empresa
                  </label>
                  <select
                    required
                    value={newUserOrgId}
                    onChange={(e) => setNewUserOrgId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-xs font-medium"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                    Perfil (RBAC)
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-xs font-medium"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Operacional">Operacional</option>
                    <option value="Visualizador">Visualizador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#424245] dark:text-[#AEAEB2] mb-1">
                  Senha Inicial (opcional — se vazio, define no 1º acesso)
                </label>
                <div className="relative">
                  <input
                    type={showNewUserPass ? 'text' : 'password'}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-black/[0.10] dark:border-white/[0.12] text-sm"
                  />
                  <KeyRound className="w-4 h-4 text-[#86868B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPass(!showNewUserPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer"
                  >
                    {showNewUserPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#6E6E73] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-5 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 apple-solid-btn"
                >
                  {creatingUser ? 'Salvando...' : 'Vincular Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
