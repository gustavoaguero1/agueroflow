import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { apiFetch } from '../../apiAuthFetch';
import { useAuth } from '../../contexts/AuthContext';
import {
  ACCESS_ACTIONS,
  ACCESS_SECTIONS,
  sanitizePermissionOverrides,
  type AccessAction,
  type AccessProfile,
  type DataScope,
  type PermissionGrant,
  type PermissionMap,
} from '../../permissions/granular';
import type { UserRole } from '../../types';

type AccessPerson = {
  id: string;
  userName: string;
  role: UserRole;
  accessProfileId?: string;
  permissionOverrides: PermissionMap;
};
type AccessData = { profiles: AccessProfile[]; members: AccessPerson[]; canEdit: boolean };
type Choice = 'inherit' | 'allow' | 'deny';
type Tab = 'profiles' | 'people';

const ACTION_LABELS: Record<AccessAction, string> = {
  view: 'Ver',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
  approve: 'Aprovar',
  manage: 'Administrar',
};
const FIELD =
  'w-full min-w-0 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#242426] px-2 py-1.5 text-[11px] text-[#1D1D1F] dark:text-[#F5F5F7] outline-none focus:ring-2 focus:ring-[#0071E3]';
const BUTTON =
  'inline-flex items-center gap-1.5 rounded-[10px] bg-[#0071E3] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0077ED] disabled:opacity-40 disabled:cursor-default';
const MUTED =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] disabled:opacity-40';

function patchGrant(
  map: PermissionMap,
  section: string,
  field: AccessAction | 'scope',
  value: boolean | DataScope | undefined,
): PermissionMap {
  const next: PermissionMap = { ...map };
  const current: PermissionGrant = { ...(next[section as keyof PermissionMap] || {}) };
  if (value === undefined) delete current[field as keyof PermissionGrant];
  else (current as Record<string, unknown>)[field] = value;
  if (!Object.keys(current).length) delete next[section as keyof PermissionMap];
  else next[section as keyof PermissionMap] = current;
  return next;
}

function choiceOf(value: boolean | undefined): Choice {
  return value === undefined ? 'inherit' : value ? 'allow' : 'deny';
}

function PermissionMatrix({
  value,
  onChange,
  disabled,
  memberMode = false,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  disabled: boolean;
  memberMode?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof ACCESS_SECTIONS[number][]>();
    for (const section of ACCESS_SECTIONS) {
      const rows = map.get(section.group) || [];
      rows.push(section);
      map.set(section.group, rows);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-[#6E6E73] dark:text-[#98989D]">
        {memberMode
          ? '“Herdar” mantém a regra do modelo escolhido. Sem modelo atribuído, mantém o acesso padrão da área.'
          : '“Herdar da área” preserva o acesso inicial já existente para essa função. Permissões explícitas substituem esse padrão.'}
      </p>
      {groups.map(([group, sections]) => (
        <details key={group} className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.015] dark:bg-white/[0.02]">
          <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]">
            {group}
            <span className="ml-2 text-[10px] font-normal text-[#6E6E73] dark:text-[#98989D]">{sections.length} submódulo(s)</span>
          </summary>
          <div className="overflow-x-auto border-t border-black/[0.06] dark:border-white/[0.08]">
            <table className="w-full min-w-[850px] text-left">
              <thead>
                <tr className="text-[10px] text-[#6E6E73] dark:text-[#98989D]">
                  <th className="px-3 py-2 font-medium min-w-[205px]">Submódulo</th>
                  {ACCESS_ACTIONS.map((action) => <th key={action} className="px-1.5 py-2 text-center font-medium">{ACTION_LABELS[action]}</th>)}
                  <th className="px-2 py-2 font-medium min-w-[130px]">Dados</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => {
                  const grant = value[section.id] || {};
                  return (
                    <tr key={section.id} className="border-t border-black/[0.05] dark:border-white/[0.06]">
                      <td className="px-3 py-2 text-[11px] font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">{section.label}</td>
                      {ACCESS_ACTIONS.map((action) => (
                        <td key={action} className="px-1 py-1.5 text-center">
                          <select
                            aria-label={section.label + ' - ' + ACTION_LABELS[action]}
                            className={FIELD + ' w-[78px]'}
                            disabled={disabled}
                            value={choiceOf(grant[action])}
                            onChange={(e) => {
                              const v = e.target.value as Choice;
                              onChange(patchGrant(value, section.id, action, v === 'inherit' ? undefined : v === 'allow'));
                            }}
                          >
                            <option value="inherit">{memberMode ? 'Herdar' : 'Área'}</option>
                            <option value="allow">Permitir</option>
                            <option value="deny">Bloquear</option>
                          </select>
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <select
                          aria-label={section.label + ' - abrangência dos dados'}
                          className={FIELD + ' min-w-[122px]'}
                          disabled={disabled}
                          value={grant.scope || (memberMode ? 'inherit' : 'all')}
                          onChange={(e) => onChange(patchGrant(value, section.id, 'scope', e.target.value === 'inherit' ? undefined : e.target.value as DataScope))}
                        >
                          {memberMode && <option value="inherit">Herdar</option>}
                          <option value="all">Todos</option>
                          <option value="assigned">Atribuídos a mim</option>
                          <option value="own">Criados por mim</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

export const GranularAccessPanel: React.FC = () => {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [data, setData] = useState<AccessData | null>(null);
  const [tab, setTab] = useState<Tab>('profiles');
  const [profileId, setProfileId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [draftProfile, setDraftProfile] = useState<AccessProfile | null>(null);
  const [memberProfileId, setMemberProfileId] = useState('');
  const [memberOverrides, setMemberOverrides] = useState<PermissionMap>({});
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/org/access?orgId=' + encodeURIComponent(orgId));
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível carregar os modelos de acesso.');
      const next = json.data as AccessData;
      setData(next);
      setProfileId((current) => current && next.profiles.some((p) => p.id === current) ? current : next.profiles[0]?.id || '');
      setMemberId((current) => current && next.members.some((m) => m.id === current) ? current : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar os acessos.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const selectedProfile = data?.profiles.find((p) => p.id === profileId) || null;
  const selectedMember = data?.members.find((m) => m.id === memberId) || null;

  useEffect(() => {
    setDraftProfile(selectedProfile ? { ...selectedProfile, permissions: sanitizePermissionOverrides(selectedProfile.permissions) } : null);
  }, [profileId, data]);

  useEffect(() => {
    setMemberProfileId(selectedMember?.accessProfileId || '');
    setMemberOverrides(sanitizePermissionOverrides(selectedMember?.permissionOverrides));
  }, [memberId, data]);

  const canEdit = !!data?.canEdit;

  const saveProfiles = async (nextProfiles: AccessProfile[]) => {
    if (!orgId || !canEdit) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/org/access/profiles?orgId=' + encodeURIComponent(orgId), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, profiles: nextProfiles }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível salvar os modelos.');
      const failed = Number(json.data?.refreshFailed) || 0;
      setNotice(failed ? 'Modelo salvo; ' + failed + ' pessoa(s) receberão o acesso ao renovar a sessão.' : 'Modelo de acesso salvo. As sessões foram atualizadas.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  const saveMember = async () => {
    if (!selectedMember || !canEdit) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/org/members/' + encodeURIComponent(selectedMember.id) + '/access', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: memberProfileId || null, permissionOverrides: memberOverrides }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível salvar o acesso individual.');
      setNotice('Acesso individual de ' + selectedMember.userName + ' atualizado. As permissões novas serão aplicadas ao renovar a sessão.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar o acesso individual.');
    } finally {
      setSaving(false);
    }
  };

  const createProfile = () => {
    const name = newProfileName.trim();
    if (!name) { setError('Informe um nome para o modelo.'); return; }
    const id = 'access_' + Date.now().toString(36);
    const empty = Object.fromEntries(ACCESS_SECTIONS.map((s) => [s.id, {
      view: false, create: false, edit: false, delete: false, approve: false, manage: false, scope: 'all',
    }])) as PermissionMap;
    const profile: AccessProfile = {
      id, name, description: newProfileDescription.trim(), permissions: empty, updatedAt: new Date().toISOString(),
    };
    setError('');
    setNewProfileName(''); setNewProfileDescription('');
    setProfileId(id); setDraftProfile(profile);
    void saveProfiles([...(data?.profiles || []), profile]);
  };

  const saveSelectedProfile = () => {
    if (!draftProfile) return;
    const next = (data?.profiles || []).map((p) => p.id === draftProfile.id ? { ...draftProfile, updatedAt: new Date().toISOString() } : p);
    void saveProfiles(next);
  };

  const deleteSelectedProfile = () => {
    if (!selectedProfile) return;
    if (!window.confirm('Excluir o modelo "' + selectedProfile.name + '"? Pessoas vinculadas precisam ser reatribuídas antes.')) return;
    const next = (data?.profiles || []).filter((p) => p.id !== selectedProfile.id);
    void saveProfiles(next);
  };

  const copyProfile = () => {
    if (!selectedProfile) return;
    const clone: AccessProfile = {
      ...selectedProfile,
      id: 'access_' + Date.now().toString(36),
      name: selectedProfile.name + ' - cópia',
      permissions: JSON.parse(JSON.stringify(selectedProfile.permissions)) as PermissionMap,
      updatedAt: new Date().toISOString(),
    };
    void saveProfiles([...(data?.profiles || []), clone]);
    setProfileId(clone.id);
  };

  const memberDirty = !!selectedMember && (
    memberProfileId !== (selectedMember.accessProfileId || '') ||
    JSON.stringify(memberOverrides) !== JSON.stringify(selectedMember.permissionOverrides || {})
  );

  const profileDirty = !!draftProfile && (
    draftProfile.name !== selectedProfile?.name ||
    draftProfile.description !== selectedProfile?.description ||
    JSON.stringify(draftProfile.permissions) !== JSON.stringify(selectedProfile?.permissions || {})
  );

  return (
    <section className="rounded-[20px] border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1C1C1E] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4" aria-labelledby="granular-access-title">
      <header className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0071E3] dark:text-[#0A84FF]" />
        <div>
          <h3 id="granular-access-title" className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">Permissões por submódulo e responsabilidade</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#6E6E73] dark:text-[#98989D]">
            Crie modelos livremente, atribua-os a qualquer pessoa e personalize exceções individuais. A regra vale para todas as áreas, não apenas para Operações.
          </p>
          {!canEdit && data && <p className="mt-1 text-xs text-[#6E6E73] dark:text-[#98989D]">Acesso somente para consulta. Para alterar, é necessário administrar Configurações.</p>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tab === 'profiles' ? BUTTON : MUTED} onClick={() => setTab('profiles')}>
          <ShieldCheck className="h-3.5 w-3.5" />Modelos de acesso
        </button>
        <button type="button" className={tab === 'people' ? BUTTON : MUTED} onClick={() => setTab('people')}>
          <Users className="h-3.5 w-3.5" />Acesso por pessoa
        </button>
        <span className="ml-auto text-[10px] text-[#6E6E73] dark:text-[#98989D]">Cada pessoa pode ter exceções próprias</span>
      </div>

      {loading && <p className="flex items-center gap-2 text-xs text-[#6E6E73]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando permissões...</p>}

      {data && tab === 'profiles' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <input className={FIELD} value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="Nome do modelo (ex.: Coordenador de obras)" disabled={!canEdit || saving} />
            <input className={FIELD} value={newProfileDescription} onChange={(e) => setNewProfileDescription(e.target.value)} placeholder="Descrição opcional" disabled={!canEdit || saving} />
            <button type="button" className={BUTTON} disabled={!canEdit || saving || !newProfileName.trim()} onClick={createProfile}>
              <Plus className="h-3.5 w-3.5" />Criar modelo
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]" htmlFor="access-profile-picker">Modelo</label>
            <select id="access-profile-picker" className={FIELD + ' max-w-sm'} value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={!data.profiles.length}>
              <option value="">Selecione um modelo</option>
              {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className={MUTED + ' ml-auto'} disabled={!selectedProfile || saving} onClick={copyProfile}><Copy className="h-3.5 w-3.5" />Duplicar</button>
            <button type="button" className={MUTED} disabled={!selectedProfile || saving || !canEdit} onClick={deleteSelectedProfile}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
          </div>
          {draftProfile && (
            <>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="space-y-1 text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                  Nome
                  <input className={FIELD} value={draftProfile.name} disabled={!canEdit || saving} onChange={(e) => setDraftProfile((p) => p ? { ...p, name: e.target.value } : p)} />
                </label>
                <label className="space-y-1 text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                  Descrição
                  <input className={FIELD} value={draftProfile.description || ''} disabled={!canEdit || saving} onChange={(e) => setDraftProfile((p) => p ? { ...p, description: e.target.value } : p)} />
                </label>
              </div>
              <PermissionMatrix
                value={draftProfile.permissions}
                disabled={!canEdit || saving}
                onChange={(permissions) => setDraftProfile((p) => p ? { ...p, permissions } : p)}
              />
              <div className="flex justify-end">
                <button type="button" className={BUTTON} disabled={!canEdit || saving || !draftProfile.name.trim() || !profileDirty} onClick={saveSelectedProfile}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar modelo
                </button>
              </div>
            </>
          )}
          {!data.profiles.length && !draftProfile && <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">Ainda não existem modelos personalizados. Os usuários continuam seguindo os acessos antigos por área até que um modelo seja atribuído.</p>}
        </div>
      )}

      {data && tab === 'people' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="space-y-1 text-[11px] text-[#6E6E73] dark:text-[#98989D]">
              Pessoa
              <select className={FIELD} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Selecione uma pessoa</option>
                {data.members.map((m) => <option key={m.id} value={m.id}>{m.userName} · {m.role}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[11px] text-[#6E6E73] dark:text-[#98989D]">
              Modelo de acesso
              <select className={FIELD} value={memberProfileId} onChange={(e) => setMemberProfileId(e.target.value)} disabled={!selectedMember || !canEdit}>
                <option value="">Sem modelo (herdar área)</option>
                {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          {selectedMember && (
            <>
              <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">
                Personalize o acesso de <strong>{selectedMember.userName}</strong>. As opções “Permitir” e “Bloquear” substituem o modelo apenas para esta pessoa.
              </p>
              <PermissionMatrix value={memberOverrides} memberMode disabled={!canEdit || saving} onChange={setMemberOverrides} />
              <div className="flex justify-end">
                <button type="button" className={BUTTON} disabled={!canEdit || saving || !memberDirty} onClick={saveMember}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar acesso individual
                </button>
              </div>
            </>
          )}
          {!selectedMember && <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">Escolha uma pessoa para atribuir um modelo ou configurar permissões específicas.</p>}
        </div>
      )}
    </section>
  );
};
