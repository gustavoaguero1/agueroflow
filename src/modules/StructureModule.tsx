import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { refreshClaims } from '../apiAuthFetch';
import { FirstAccessLinkButton } from '../components/common/FirstAccessLinkButton';
import {
  Unit,
  CostCenter,
  Contract,
  Asset,
  Team,
  OrgMember,
  AuditLog,
  UserRole,
  Project,
} from '../types';
import { subscribeProjects } from '../services/projectService';
import { ProjectsManager } from '../components/structure/ProjectsManager';
import {
  Building,
  FileText,
  Boxes,
  Users,
  ShieldAlert,
  Plus,
  Trash2,
  Lock,
  X,
  Search,
  Upload,
  Image as ImageIcon,
  Check,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  FolderKanban,
} from 'lucide-react';

interface StructureModuleProps {
  initialTab?: 'organizacao' | 'projetos' | 'unidades' | 'contratos' | 'ativos' | 'usuarios' | 'auditoria';
}

export const StructureModule: React.FC<StructureModuleProps> = ({ initialTab = 'organizacao' }) => {
  const { user, organization, member, role, isAdmin, isManagerOrAbove, areaLevel, logAudit, adminSetUserPassword } = useAuth();
  const [activeTab, setActiveTab] = useState<'organizacao' | 'projetos' | 'unidades' | 'contratos' | 'ativos' | 'usuarios' | 'auditoria'>(initialTab);

  // Sync tab if prop changes from navigation
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [units, setUnits] = useState<Unit[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modals
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  // Unit Form
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitCity, setUnitCity] = useState('');
  const [unitState, setUnitState] = useState('SP');
  const [unitManager, setUnitManager] = useState('');

  // Asset Form
  const [assetTag, setAssetTag] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] = useState('');
  const [assetModel, setAssetModel] = useState('');
  const [assetUnitId, setAssetUnitId] = useState('');

  // Contract Form (Novo Contrato)
  const [contractCode, setContractCode] = useState('');
  const [contractReference, setContractReference] = useState('');
  const [contractName, setContractName] = useState('');
  const [contractDescription, setContractDescription] = useState('');
  const [contractAvatarFile, setContractAvatarFile] = useState<File | null>(null);
  const [contractAvatarPreview, setContractAvatarPreview] = useState<string>('');
  const [contractPdfFile, setContractPdfFile] = useState<File | null>(null);
  const [contractPdfName, setContractPdfName] = useState<string>('');
  const [contractPdfData, setContractPdfData] = useState<string>('');
  const [contractIsActive, setContractIsActive] = useState<boolean>(true);
  const [contractSelectedUnitIds, setContractSelectedUnitIds] = useState<string[]>([]);

  // Member Form
  const [memberEmail, setMemberEmail] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<UserRole>('Operacional');
  const [memberPassword, setMemberPassword] = useState('');
  const [showMemberPassword, setShowMemberPassword] = useState(false);
  const [copiedNewMemberCreds, setCopiedNewMemberCreds] = useState(false);
  const [memberFormError, setMemberFormError] = useState<string | null>(null);

  // Admin Reset Member Password Modal State
  const [passwordModalMember, setPasswordModalMember] = useState<OrgMember | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);
  const [adminPasswordSuccess, setAdminPasswordSuccess] = useState<string | null>(null);
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);
  const [adminPasswordSaving, setAdminPasswordSaving] = useState(false);

  // Strong password generator helper
  const generateStrongPassword = () => {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ23456789!@#$%';
    let res = 'Gat@';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res + (Math.floor(Math.random() * 90) + 10);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!organization) return;

    const unsubUnits = onSnapshot(query(collection(db, 'units'), where('orgId', '==', organization.id)), (s) =>
      setUnits(s.docs.map((d) => ({ id: d.id, ...d.data() } as Unit)))
    );

    const unsubContracts = onSnapshot(query(collection(db, 'contracts'), where('orgId', '==', organization.id)), (s) =>
      setContracts(s.docs.map((d) => ({ id: d.id, ...d.data() } as Contract)))
    );

    const unsubCostCenters = onSnapshot(query(collection(db, 'cost_centers'), where('orgId', '==', organization.id)), (s) =>
      setCostCenters(s.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenter)))
    );

    const unsubProjects = subscribeProjects(organization.id, setProjects);

    const unsubAssets = onSnapshot(query(collection(db, 'assets'), where('orgId', '==', organization.id)), (s) =>
      setAssets(s.docs.map((d) => ({ id: d.id, ...d.data() } as Asset)))
    );

    const unsubMembers = onSnapshot(query(collection(db, 'org_members'), where('orgId', '==', organization.id)), (s) =>
      setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() } as OrgMember)))
    );

    const unsubAudit = onSnapshot(query(collection(db, 'audit_logs'), where('orgId', '==', organization.id)), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAuditLogs(list);
    });

    return () => {
      unsubUnits();
      unsubContracts();
      unsubCostCenters();
      unsubProjects();
      unsubAssets();
      unsubMembers();
      unsubAudit();
    };
  }, [organization]);

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    setIsSubmitting(true);
    try {
      const uId = `unit_${Date.now()}`;
      const newUnit: Unit = {
        id: uId,
        orgId: organization.id,
        name: unitName.trim(),
        code: unitCode.trim().toUpperCase(),
        city: unitCity.trim(),
        state: unitState.trim().toUpperCase(),
        managerName: unitManager.trim() || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'units', uId), newUnit);
      await logAudit('Estrutura', 'Criar Unidade', `Unidade ${unitName} (${unitCode})`, uId);
      setShowUnitModal(false);
      setUnitName('');
      setUnitCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    if (!assetUnitId || !units.some((unit) => unit.id === assetUnitId)) {
      alert('Selecione uma unidade cadastrada para vincular o ativo.');
      return;
    }
    setIsSubmitting(true);
    try {
      const astId = `ast_${Date.now()}`;
      const newAsset: Asset = {
        id: astId,
        orgId: organization.id,
        unitId: assetUnitId,
        tag: assetTag.trim().toUpperCase(),
        name: assetName.trim(),
        category: assetCategory.trim(),
        model: assetModel.trim() || undefined,
        status: 'operacional',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'assets', astId), newAsset);
      await logAudit('Estrutura', 'Cadastrar Ativo', `Ativo ${assetName} (TAG: ${assetTag})`, astId);
      setShowAssetModal(false);
      setAssetName('');
      setAssetTag('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('O arquivo de imagem deve ter no máximo 2MB.');
        return;
      }
      setContractAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setContractAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('O arquivo PDF deve ter no máximo 5MB.');
        return;
      }
      setContractPdfFile(file);
      setContractPdfName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setContractPdfData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    if (!contractCode.trim()) {
      alert('Por favor, informe o Código do contrato.');
      return;
    }
    if (!contractName.trim()) {
      alert('Por favor, informe o Nome do contrato.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cId = `ct_${Date.now()}`;
      const newContract: Contract = {
        id: cId,
        orgId: organization.id,
        code: contractCode.trim(),
        contractNumber: contractCode.trim(),
        name: contractName.trim(),
        title: contractName.trim(),
        reference: contractReference.trim().slice(0, 128) || undefined,
        description: contractDescription.trim() || undefined,
        avatarUrl: contractAvatarPreview || undefined,
        pdfUrl: contractPdfData || undefined,
        pdfFileName: contractPdfName || undefined,
        active: contractIsActive,
        status: contractIsActive ? 'ativo' : 'suspenso',
        partyName: organization.name,
        type: 'prestador',
        unitIds: contractSelectedUnitIds.length > 0 ? contractSelectedUnitIds : units.map((u) => u.id),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'contracts', cId), newContract);
      await logAudit(
        'Contratos',
        'Criar Contrato',
        `Contrato ${contractName.trim()} (${contractCode.trim()}) cadastrado para ${organization.name}.`,
        cId
      );

      // Reset form
      setContractCode('');
      setContractReference('');
      setContractName('');
      setContractDescription('');
      setContractAvatarFile(null);
      setContractAvatarPreview('');
      setContractPdfFile(null);
      setContractPdfName('');
      setContractPdfData('');
      setContractIsActive(true);
      setContractSelectedUnitIds([]);
      setShowContractModal(false);
    } catch (err) {
      console.error('Erro ao cadastrar contrato:', err);
      alert('Erro ao salvar contrato. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContract = async (contractId: string, title: string) => {
    if (!confirm(`Tem certeza que deseja excluir o contrato "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'contracts', contractId));
      await logAudit('Contratos', 'Excluir Contrato', `Contrato "${title}" removido`, contractId);
    } catch (err) {
      console.error('Erro ao excluir contrato:', err);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    setMemberFormError(null);

    const normEmail = memberEmail.trim().toLowerCase();
    const cleanPass = memberPassword.trim();

    if (cleanPass && cleanPass.length < 6) {
      setMemberFormError('A senha inicial deve ter no mínimo 6 caracteres (ou deixe em branco para 1º acesso).');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1 company per email: rules only expose this org's members, so other orgs are not checked here (shortcut: enforce cross-org on the server)
      if (normEmail !== 'gustavo@agueroinox.com.br') {
        const allMembersSnap = await getDocs(query(collection(db, 'org_members'), where('orgId', '==', organization.id)));
        const duplicate = allMembersSnap.docs.find((d) => {
          const m = d.data() as OrgMember;
          return m.active && m.userEmail?.toLowerCase().trim() === normEmail;
        });

        if (duplicate) {
          const dupData = duplicate.data() as OrgMember;
          if (dupData.orgId === organization.id) {
            setMemberFormError(`O e-mail ${normEmail} já está cadastrado nesta empresa.`);
          } else {
            setMemberFormError(
              `O e-mail ${normEmail} já está vinculado a outra empresa. O sistema limita o acesso a 1 empresa por e-mail.`
            );
          }
          setIsSubmitting(false);
          return;
        }
      }

      const memId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newMember: OrgMember = {
        id: memId,
        orgId: organization.id,
        userId: '', // bound by the server on the member's first Google session
        userEmail: normEmail,
        userName: memberName.trim(),
        role: memberRole,
        active: true,
        passwordSet: false,
        initialPasswordSetByAdmin: Boolean(cleanPass),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'org_members', memId), newMember);
      refreshClaims(memId);
      if (cleanPass) {
        const pw = await adminSetUserPassword(memId, cleanPass);
        if (!pw.success) alert(`Colaborador criado, mas a senha inicial não foi salva: ${pw.error || ''}`);
      }
      await logAudit(
        'Estrutura',
        'Vincular Usuário',
        `Usuário ${normEmail} com papel ${memberRole}${cleanPass ? ' (com senha inicial pré-definida pelo Admin)' : ''}`,
        memId
      );
      setShowMemberModal(false);
      setMemberEmail('');
      setMemberName('');
      setMemberPassword('');
      setShowMemberPassword(false);
      setMemberFormError(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminSubmitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalMember) return;
    setAdminPasswordError(null);
    setAdminPasswordSuccess(null);

    if (!adminNewPassword || adminNewPassword.trim().length < 6) {
      setAdminPasswordError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setAdminPasswordSaving(true);
    try {
      const res = await adminSetUserPassword(passwordModalMember.id, adminNewPassword.trim());
      if (!res.success) {
        setAdminPasswordError(res.error || 'Erro ao definir senha.');
      } else {
        setAdminPasswordSuccess(`Senha de ${passwordModalMember.userName} atualizada com sucesso pelo Administrador!`);
        setTimeout(() => {
          setPasswordModalMember(null);
          setAdminNewPassword('');
          setAdminPasswordSuccess(null);
        }, 1800);
      }
    } catch (err: any) {
      setAdminPasswordError(err?.message || 'Falha ao salvar senha do usuário.');
    } finally {
      setAdminPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 af-card p-5 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Estrutura Organizacional & Governança</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Organização ativa, filiais, contratos, ativos industriais, equipe e trilha de auditoria.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'unidades' && (
            <button
              onClick={() => setShowUnitModal(true)}
              className="px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold flex items-center space-x-1.5 cursor-pointer apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Unidade</span>
            </button>
          )}
          {activeTab === 'ativos' && (
            <button
              onClick={() => {
                setAssetUnitId('');
                setShowAssetModal(true);
              }}
              disabled={units.length === 0}
              className="px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Ativo</span>
            </button>
          )}
          {activeTab === 'contratos' && (
            <button
              onClick={() => setShowContractModal(true)}
              className="px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold flex items-center space-x-1.5 cursor-pointer apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Contrato</span>
            </button>
          )}
          {activeTab === 'usuarios' && (
            <button
              onClick={() => setShowMemberModal(true)}
              className="px-4 py-2 rounded-xl af-btn-primary text-xs font-semibold flex items-center space-x-1.5 cursor-pointer apple-solid-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Convidar Usuário</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="af-seg rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {[
          { id: 'organizacao' as const, label: 'Organização Ativa', icon: Building },
          { id: 'projetos' as const, label: `Projetos / Obras (${projects.length})`, icon: FolderKanban },
          { id: 'unidades' as const, label: `Unidades (${units.length})`, icon: Building },
          { id: 'contratos' as const, label: `Contratos (${contracts.length})`, icon: FileText },
          { id: 'ativos' as const, label: `Ativos (${assets.length})`, icon: Boxes },
          { id: 'usuarios' as const, label: `Usuários & Papéis (${members.length})`, icon: Users },
          { id: 'auditoria' as const, label: `Auditoria (${auditLogs.length})`, icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer ${
                isActive ? 'af-seg-btn-active font-semibold' : 'af-seg-btn font-medium'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'projetos' && organization && (
        <ProjectsManager
          orgId={organization.id}
          userUid={user?.uid || ''}
          userName={member?.userName || user?.displayName || user?.email || 'Usuário'}
          projects={projects}
          units={units}
          contracts={contracts}
          costCenters={costCenters}
          canManage={
            (isManagerOrAbove || role === 'Supervisor') &&
            (areaLevel('operacoes') >= 2 || areaLevel('comercial') >= 2)
          }
          onAudit={(action, details, targetId) => logAudit('Projetos/Obras', action, details, targetId)}
        />
      )}

      {activeTab === 'organizacao' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-6 max-w-2xl space-y-4 text-xs">
          <h3 className="text-sm font-bold text-white mb-2">Dados da Organização</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Nome da Empresa</span>
              <span className="text-sm font-bold text-white">{organization?.name}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Identificador / Slug</span>
              <span className="font-mono text-blue-400 font-bold">{organization?.slug}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">CNPJ</span>
              <span className="text-slate-200">{organization?.cnpj || 'Não informado'}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Data de Fundação no AgueroFlow</span>
              <span className="text-slate-200">
                {organization?.createdAt ? new Date(organization.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'unidades' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome da Unidade</th>
                <th className="py-3 px-4">Cidade / UF</th>
                <th className="py-3 px-4">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {units.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono font-bold text-blue-400">{u.code}</td>
                  <td className="py-3 px-4 font-semibold text-white">{u.name}</td>
                  <td className="py-3 px-4 text-slate-300">
                    {u.city ? `${u.city} - ${u.state}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{u.managerName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'contratos' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {contracts.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-950/50 border border-blue-800/60 flex items-center justify-center text-blue-400 mb-3 shadow-inner">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Nenhum contrato cadastrado</h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                Cadastre um contrato para agrupar unidades, associar documentos em PDF e manter o controle operacional e documental da organização.
              </p>
              <button
                onClick={() => setShowContractModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer shadow-lg shadow-blue-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Contrato</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                    <th className="py-3 px-4">Avatar / Código</th>
                    <th className="py-3 px-4">Nome do Contrato</th>
                    <th className="py-3 px-4">Referência</th>
                    <th className="py-3 px-4">Unidades Vinculadas</th>
                    <th className="py-3 px-4">Documento PDF</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {contracts.map((c) => {
                    const linkedUnits = units.filter((u) => c.unitIds?.includes(u.id));
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            {c.avatarUrl ? (
                              <img
                                src={c.avatarUrl}
                                alt={c.name || c.title}
                                className="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                            )}
                            <span className="font-mono font-bold text-blue-400">
                              {c.code || c.contractNumber || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{c.name || c.title}</div>
                          {c.description && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">{c.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-mono">
                          {c.reference || '—'}
                        </td>
                        <td className="py-3 px-4">
                          {linkedUnits.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {linkedUnits.map((u) => (
                                <span
                                  key={u.id}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300"
                                >
                                  {u.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Todas as unidades</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {c.pdfUrl ? (
                            <a
                              href={c.pdfUrl}
                              download={c.pdfFileName || `Contrato_${c.code || c.contractNumber}.pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-red-950/50 hover:bg-red-900/60 border border-red-800/60 text-red-300 text-[11px] font-medium transition-colors cursor-pointer"
                              title="Baixar / Visualizar PDF"
                            >
                              <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              <span className="truncate max-w-[120px]">{c.pdfFileName || 'Abrir PDF'}</span>
                              <Download className="w-3 h-3 text-red-400 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Nenhum PDF vinculado</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.active !== false && c.status !== 'suspenso' && c.status !== 'encerrado'
                                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {c.active !== false && c.status !== 'suspenso' ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteContract(c.id, c.name || c.title)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                            title="Excluir contrato"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'ativos' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">TAG / Código</th>
                <th className="py-3 px-4">Nome do Equipamento</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Modelo</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono font-bold text-blue-400">{a.tag}</td>
                  <td className="py-3 px-4 font-semibold text-white">{a.name}</td>
                  <td className="py-3 px-4 text-slate-300">{a.category}</td>
                  <td className="py-3 px-4 text-slate-400">{a.model || '—'}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        a.status === 'operacional'
                          ? 'bg-emerald-950/70 text-emerald-400'
                          : 'bg-amber-950/70 text-amber-300'
                      }`}
                    >
                      {a.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'usuarios' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">E-mail Corporativo</th>
                <th className="py-3 px-4">Papel (RBAC)</th>
                <th className="py-3 px-4">Credencial / Senha</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && <th className="py-3 px-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-semibold text-white">{m.userName}</td>
                  <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">{m.userEmail}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-950/70 text-blue-400 border border-blue-800/40">
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {m.passwordSet ? (
                      m.initialPasswordSetByAdmin ? (
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/50 text-amber-300 border border-amber-800/40">
                          <KeyRound className="w-2.5 h-2.5 text-amber-400" />
                          <span>Definida pelo Admin</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/40">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Definida pelo Usuário</span>
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span>Primeiro Acesso Pendente</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-emerald-400 font-semibold text-[11px] flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Ativo</span>
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordModalMember(m);
                          setAdminNewPassword('');
                          setAdminPasswordSuccess(null);
                          setAdminPasswordError(null);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer border border-slate-700/80 shadow-sm"
                        title="Redefinir ou definir nova senha para este colaborador"
                      >
                        <KeyRound className="w-3 h-3 text-amber-400" />
                        <span>Alterar Senha</span>
                      </button>
                      {!m.passwordSet && (
                        <span className="ml-1.5">
                          <FirstAccessLinkButton
                            memberId={m.id}
                            memberName={m.userName}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer border border-slate-700/80 shadow-sm"
                          />
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'auditoria' && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="py-3 px-4">Módulo</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Detalhes</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Data / Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-400">
                    Nenhum log registrado ainda.
                  </td>
                </tr>
              ) : (
                auditLogs.slice(0, 30).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-blue-400">{log.module}</td>
                    <td className="py-3 px-4 font-semibold text-slate-200">{log.action}</td>
                    <td className="py-3 px-4 text-slate-400 max-w-sm truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{log.userEmail}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Unit */}
      {showUnitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-3">Cadastrar Nova Unidade</h3>
            <form onSubmit={handleCreateUnit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Nome da Unidade *</label>
                <input
                  type="text"
                  required
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="Ex: Fábrica Mauá"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Código *</label>
                  <input
                    type="text"
                    required
                    value={unitCode}
                    onChange={(e) => setUnitCode(e.target.value)}
                    placeholder="MAU-01"
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Cidade / UF</label>
                  <input
                    type="text"
                    value={unitCity}
                    onChange={(e) => setUnitCity(e.target.value)}
                    placeholder="Mauá / SP"
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowUnitModal(false)} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asset */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-3">Cadastrar Novo Ativo Industrial</h3>
            <form onSubmit={handleCreateAsset} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">TAG do Ativo *</label>
                  <input
                    type="text"
                    required
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="ATV-2001"
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Categoria *</label>
                  <input
                    type="text"
                    required
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value)}
                    placeholder="Usinagem / Caldeiraria"
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Nome / Descrição do Ativo *</label>
                <input
                  type="text"
                  required
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="Ex: Prensa Hidráulica 100T"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Unidade vinculada *</label>
                <select
                  required
                  value={assetUnitId}
                  onChange={(e) => setAssetUnitId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="" disabled>Selecione a unidade</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </div>
              <div className="pt-2 flex justify-end space-x-2">
                <button type="button" onClick={() => setShowAssetModal(false)} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Member */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Vincular Usuário à Empresa</h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Cada e-mail corporativo é vinculado a 1 empresa e entra diretamente nesta operação ao fazer login.
            </p>
            {memberFormError && (
              <div className="mb-3 p-3 rounded-xl bg-red-950/70 border border-red-800 text-red-300 text-xs flex items-start space-x-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{memberFormError}</span>
              </div>
            )}
            <form onSubmit={handleCreateMember} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Ex: Fernanda Lima"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">E-mail Corporativo Google *</label>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="fernanda@empresa.com.br"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Papel (RBAC) *</label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="Admin">Admin (Acesso Total)</option>
                  <option value="Gerente">Gerente (Gestão e Aprovação)</option>
                  <option value="Supervisor">Supervisor (Coordenação e OS)</option>
                  <option value="Operacional">Operacional (Execução em Campo)</option>
                  <option value="Visualizador">Visualizador (Leitura Apenas)</option>
                </select>
              </div>

              {/* Senha Inicial de Acesso (Definida pelo Administrador) */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>Senha Inicial de Acesso (Opcional/Recomendado)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateStrongPassword();
                      setMemberPassword(generated);
                      setShowMemberPassword(true);
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center space-x-1 cursor-pointer font-medium"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span>Gerar Senha</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Defina uma senha inicial agora. O colaborador poderá acessar com esta senha ou alterá-la se desejar diretamente na tela de login.
                </p>

                <div className="relative">
                  <input
                    type={showMemberPassword ? 'text' : 'password'}
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                    placeholder="Ex: Gat@2026! (mínimo 6 caracteres)"
                    className="w-full pl-3 pr-20 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-amber-400 focus:outline-none"
                  />
                  <div className="absolute right-2 top-2 flex items-center space-x-1.5">
                    {memberPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(memberPassword);
                          setCopiedNewMemberCreds(true);
                          setTimeout(() => setCopiedNewMemberCreds(false), 2000);
                        }}
                        className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                        title="Copiar senha"
                      >
                        {copiedNewMemberCreds ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowMemberPassword(!showMemberPassword)}
                      className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      {showMemberPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {copiedNewMemberCreds && (
                  <p className="text-[10px] text-emerald-400 font-medium">
                    Senha copiada para a área de transferência!
                  </p>
                )}
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senha de Usuário pelo Administrador */}
      {passwordModalMember && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Redefinir Senha do Usuário</h3>
                  <p className="text-[11px] text-slate-400">Defina uma nova senha de acesso para este colaborador.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalMember(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Informações do Colaborador */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Colaborador:</span>
                <span className="font-semibold text-white">{passwordModalMember.userName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">E-mail:</span>
                <span className="font-mono text-cyan-400">{passwordModalMember.userEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Papel:</span>
                <span className="text-blue-400 font-semibold uppercase text-[10px]">{passwordModalMember.role}</span>
              </div>
            </div>

            {adminPasswordError && (
              <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-800/80 text-red-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{adminPasswordError}</span>
              </div>
            )}

            {adminPasswordSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{adminPasswordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAdminSubmitNewPassword} className="space-y-3.5 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-300">Nova Senha de Acesso *</label>
                  <button
                    type="button"
                    onClick={() => {
                      const gen = generateStrongPassword();
                      setAdminNewPassword(gen);
                      setShowAdminNewPassword(true);
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center space-x-1 cursor-pointer font-medium"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span>Gerar Senha Forte</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showAdminNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-3 pr-20 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-amber-400 focus:outline-none"
                  />
                  <div className="absolute right-2 top-2.5 flex items-center space-x-1.5">
                    {adminNewPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(adminNewPassword);
                          setAdminPasswordSuccess('Nova senha copiada para a área de transferência!');
                          setTimeout(() => setAdminPasswordSuccess(null), 2500);
                        }}
                        className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                        title="Copiar senha"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAdminNewPassword(!showAdminNewPassword)}
                      className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      {showAdminNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  O colaborador poderá usar esta senha para acessar a plataforma ou alterá-la na tela de login.
                </p>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalMember(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adminPasswordSaving}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{adminPasswordSaving ? 'Salvando...' : 'Salvar Nova Senha'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Contrato */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121826] border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Novo contrato</h3>
                <p className="text-xs text-slate-400">Cadastre um contrato para agrupar unidades.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowContractModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="mt-4 space-y-4 text-xs">
              {/* Organização ativa */}
              <div className="bg-[#0b101b] border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{organization?.name || 'Aguero Inox'}</div>
                  <div className="text-[11px] text-cyan-400 font-medium flex items-center space-x-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Organização ativa</span>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300 font-mono text-[10px]">
                  ID: {organization?.id || 'org_aguero'}
                </div>
              </div>

              {/* Dados do contrato */}
              <div className="space-y-1 pt-1">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Dados do contrato</h4>
                <p className="text-[11px] text-slate-400">
                  Código e nome são obrigatórios; referência é opcional (até 128 caracteres).
                </p>
              </div>

              {/* Código & Referência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Código *</label>
                  <input
                    type="text"
                    required
                    value={contractCode}
                    onChange={(e) => setContractCode(e.target.value)}
                    placeholder="Código"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Referência</label>
                  <input
                    type="text"
                    maxLength={128}
                    value={contractReference}
                    onChange={(e) => setContractReference(e.target.value)}
                    placeholder="Referência"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Identificação externa opcional (até 128 caracteres). Deixe vazio ao criar ou limpe ao editar para remover.
                  </p>
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={contractName}
                  onChange={(e) => setContractName(e.target.value)}
                  placeholder="Nome"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={contractDescription}
                  onChange={(e) => setContractDescription(e.target.value)}
                  placeholder="Descrição"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Avatar do contrato */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div>
                  <div className="font-semibold text-slate-200">Avatar do contrato</div>
                  <div className="text-[11px] text-slate-400">
                    Envie um arquivo de imagem para usar como avatar do contrato.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <label className="inline-flex items-center justify-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer border border-slate-700 transition-colors shrink-0">
                    <ImageIcon className="w-4 h-4 text-cyan-400" />
                    <span>Escolher imagem</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>

                  <div className="text-[11px] text-slate-400 flex items-center space-x-2 flex-wrap gap-y-1">
                    {contractAvatarFile ? (
                      <div className="flex items-center space-x-2">
                        {contractAvatarPreview && (
                          <img
                            src={contractAvatarPreview}
                            alt="Preview Avatar"
                            className="w-7 h-7 rounded object-cover border border-cyan-500/50 shrink-0"
                          />
                        )}
                        <span className="text-cyan-300 font-medium truncate max-w-xs">
                          {contractAvatarFile.name} ({(contractAvatarFile.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setContractAvatarFile(null);
                            setContractAvatarPreview('');
                          }}
                          className="text-red-400 hover:text-red-300 text-[10px] underline ml-1 cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-slate-500">Nenhum arquivo escolhido</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500 italic">Nenhum avatar definido.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Contrato em PDF */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div>
                  <div className="font-semibold text-slate-200">Contrato em PDF</div>
                  <div className="text-[11px] text-slate-400">
                    Envie o contrato em PDF para consulta futura dos administradores.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <label className="inline-flex items-center justify-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer border border-slate-700 transition-colors shrink-0">
                    <FileText className="w-4 h-4 text-red-400" />
                    <span>Escolher PDF</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfChange}
                      className="hidden"
                    />
                  </label>

                  <div className="text-[11px] text-slate-400 flex items-center space-x-2 flex-wrap gap-y-1">
                    {contractPdfFile ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-red-300 font-medium truncate max-w-xs">
                          {contractPdfName} ({(contractPdfFile.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setContractPdfFile(null);
                            setContractPdfName('');
                            setContractPdfData('');
                          }}
                          className="text-red-400 hover:text-red-300 text-[10px] underline ml-1 cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-slate-500">Nenhum arquivo escolhido</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500 italic">Nenhum PDF vinculado.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Ativo */}
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Ativo</div>
                  <div className="text-[11px] text-slate-400">
                    Contrato disponível para vínculo com unidades.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contractIsActive}
                    onChange={(e) => setContractIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Unidades Vinculadas */}
              {units.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-slate-300 font-semibold">
                    Vínculo com Unidades ({contractSelectedUnitIds.length === 0 ? 'Todas as unidades' : `${contractSelectedUnitIds.length} selecionada(s)`})
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Selecione as unidades que pertencem a este contrato (deixe desmarcado para vincular a todas).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 max-h-32 overflow-y-auto p-2 bg-slate-900 rounded-lg border border-slate-800">
                    {units.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center space-x-2 text-slate-300 hover:text-white cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={contractSelectedUnitIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setContractSelectedUnitIds([...contractSelectedUnitIds, u.id]);
                            } else {
                              setContractSelectedUnitIds(contractSelectedUnitIds.filter((id) => id !== u.id));
                            }
                          }}
                          className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
                        />
                        <span className="truncate">{u.name} ({u.code})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowContractModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-blue-900/30"
                >
                  {isSubmitting ? (
                    <span>Salvando...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Criar contrato</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
