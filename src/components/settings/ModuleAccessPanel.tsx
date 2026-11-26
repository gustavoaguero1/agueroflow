import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Loader2, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../apiAuthFetch';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_DEFAULTS, resolveAreas } from '../../permissions/areas';
import type { UserRole } from '../../types';
import {
  MODULE_ACCESS_LABELS, MODULE_PERMISSION_DETAILS, resolveModuleLevel,
  type ModuleAccessLevel, type ModuleAccessOverrides, type ModuleAccessDefaults,
} from '../../permissions/modules';

const ROLES: UserRole[] = ['Admin', 'Gerente', 'Supervisor', 'Operacional', 'Visualizador'];
type Member = {
  id: string;
  userName: string;
  role: UserRole;
  overrides: ModuleAccessOverrides;
  levels: Record<string, ModuleAccessLevel>;
};
type Overview = {
  catalog: typeof MODULE_PERMISSION_DETAILS;
  areaDefaults: Record<string, Partial<Record<string, 0 | 1 | 2>>>;
  roleDefaults: ModuleAccessDefaults;
  members: Member[];
  canEdit: boolean;
};

const LEVELS: ModuleAccessLevel[] = [0, 1, 2, 3, 4];

export function ModuleAccessPanel() {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [data, setData] = useState<Overview | null>(null);
  const [mode, setMode] = useState<'profile' | 'person'>('person');
  const [role, setRole] = useState<UserRole>('Supervisor');
  const [memberId, setMemberId] = useState('');
  const [filter, setFilter] = useState('');
  const [draftRole, setDraftRole] = useState<ModuleAccessOverrides>({});
  const [draftPerson, setDraftPerson] = useState<ModuleAccessOverrides>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch(`/api/org/module-access?orgId=${encodeURIComponent(orgId)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Não foi possível carregar os acessos granulares.');
      setData(j as Overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar permissões.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDraftRole(data?.roleDefaults?.[role] || {}); }, [data, role]);

  const people = useMemo(() => (data?.members || []).filter((m) =>
    m.userName.toLocaleLowerCase('pt-BR').includes(filter.trim().toLocaleLowerCase('pt-BR'))),
  [data, filter]);
  const person = data?.members.find((m) => m.id === memberId) || null;
  useEffect(() => { setDraftPerson(person?.overrides || {}); }, [person]);

  const canEdit = !!data?.canEdit;
  const baseForRole = data ? resolveAreas(role, data.areaDefaults as never) : ROLE_DEFAULTS[role];
  const baseForPerson = data && person ? resolveAreas(person.role, data.areaDefaults as never) : null;

  const setValue = (setter: React.Dispatch<React.SetStateAction<ModuleAccessOverrides>>, current: ModuleAccessOverrides, id: string, value: ModuleAccessLevel | undefined) => {
    const next = { ...current };
    if (value === undefined) delete next[id];
    else next[id] = value;
    setter(next);
  };

  const save = async (url: string, body: unknown, success: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const r = await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, ...body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Não foi possível salvar as permissões.');
      setNotice(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar permissões.');
    } finally {
      setSaving(false);
    }
  };

  const saveRole = () => save('/api/org/module-access/roles',
    { defaults: { ...(data?.roleDefaults || {}), [role]: draftRole } },
    `Padrões granulares de ${role} salvos. Os acessos da equipe foram atualizados.`);
  const savePerson = () => {
    if (!person) return;
    save(`/api/org/members/${encodeURIComponent(person.id)}/module-access`, { overrides: draftPerson },
      `Permissões de ${person.userName} atualizadas.`);
  };

  const roleDirty = JSON.stringify(draftRole) !== JSON.stringify(data?.roleDefaults?.[role] || {});
  const personDirty = !!person && JSON.stringify(draftPerson) !== JSON.stringify(person.overrides || {});
  const card = 'bg-[#121826] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs';
  const btn = 'px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const groups = [...new Set(MODULE_PERMISSION_DETAILS.map((m) => m.group))];

  return (
    <section className={card} aria-labelledby="granular-access-title">
      <header className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
        <div>
          <h3 id="granular-access-title" className="text-sm font-bold text-white">Permissões por submódulo e ação</h3>
          <p className="mt-1 text-[11px] text-slate-400 max-w-3xl leading-relaxed">
            Configure o que cada pessoa pode fazer em cada parte do AgueroFlow. A permissão individual prevalece sobre o padrão do perfil; quando estiver herdando, vale a permissão da área. Os níveis são cumulativos.
          </p>
        </div>
      </header>

      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {notice && <p role="status" className="text-xs text-emerald-400">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMode('profile')} aria-pressed={mode === 'profile'}
          className={`${btn} ${mode === 'profile' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-900 text-slate-300 border-slate-700'}`}>
          Padrões por perfil
        </button>
        <button type="button" onClick={() => setMode('person')} aria-pressed={mode === 'person'}
          className={`${btn} ${mode === 'person' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-900 text-slate-300 border-slate-700'}`}>
          Ajuste por pessoa
        </button>
        {loading && <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Carregando</span>}
      </div>

      {mode === 'profile' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${role === r ? 'bg-slate-100 text-slate-900' : 'bg-slate-800 text-slate-300'}`}>{r}</button>)}
          </div>
          <p className="text-[10px] text-slate-500">O padrão é aplicado aos usuários desse perfil, exceto quando houver uma exceção individual.</p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1 max-w-xs">
            <span className="sr-only">Buscar pessoa</span>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar pessoa"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white outline-none focus:border-cyan-500" />
          </label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Pessoa"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white outline-none focus:border-cyan-500">
            <option value="">Escolha uma pessoa</option>
            {people.map((m) => <option key={m.id} value={m.id}>{m.userName} · {m.role}</option>)}
          </select>
        </div>
      )}

      {mode === 'person' && !person ? (
        <p className="text-[11px] text-slate-500">Escolha uma pessoa para configurar acessos próprios, sem alterar as permissões de outras pessoas da mesma área.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group} className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 bg-slate-900/80 text-[11px] font-bold text-slate-200">{group}</div>
              <div className="divide-y divide-slate-800/80">
                {MODULE_PERMISSION_DETAILS.filter((m) => m.group === group).map((item) => {
                  const isProfile = mode === 'profile';
                  const draft = isProfile ? draftRole : draftPerson;
                  const inherited = isProfile
                    ? resolveModuleLevel(item.id, role, baseForRole, null, {})
                    : (person && baseForPerson
                      ? resolveModuleLevel(item.id, person.role, baseForPerson, data?.roleDefaults, {})
                      : 0);
                  const selected = draft[item.id];
                  const current = selected === undefined ? inherited : selected;
                  return (
                    <div key={item.id} className="p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-200">{item.label}</p>
                        <p className="text-[10px] text-slate-500">{selected === undefined ? `Herdado: ${MODULE_ACCESS_LABELS[inherited]}` : `Personalizado: ${MODULE_ACCESS_LABELS[selected]}`}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" disabled={!canEdit || saving} onClick={() => isProfile
                          ? setValue(setDraftRole, draftRole, item.id, undefined)
                          : setValue(setDraftPerson, draftPerson, item.id, undefined)}
                          aria-pressed={selected === undefined}
                          className={`${btn} ${selected === undefined ? 'bg-cyan-950 text-cyan-300 border-cyan-700' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>
                          Herdar
                        </button>
                        {LEVELS.map((level) => <button key={level} type="button" disabled={!canEdit || saving}
                          onClick={() => isProfile
                            ? setValue(setDraftRole, draftRole, item.id, level)
                            : setValue(setDraftPerson, draftPerson, item.id, level)}
                          aria-pressed={current === level && selected !== undefined}
                          className={`${btn} ${current === level && selected !== undefined ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'}`}>
                          {level} · {MODULE_ACCESS_LABELS[level]}
                        </button>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => mode === 'profile' ? setDraftRole({}) : setDraftPerson({})}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40">
                <RotateCcw className="w-3.5 h-3.5" />Limpar personalizações
              </button>
              <button type="button" disabled={saving || (mode === 'profile' ? !roleDirty : !person || !personDirty)}
                onClick={mode === 'profile' ? saveRole : savePerson}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold disabled:opacity-40">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockKeyhole className="w-3.5 h-3.5" />}
                {mode === 'profile' ? 'Salvar padrão do perfil' : 'Salvar permissões da pessoa'}
              </button>
            </div>
          )}
          {!canEdit && <p className="text-[10px] text-slate-500">Você tem acesso de consulta. Para alterar permissões, é necessário editar Configurações.</p>}
        </div>
      )}
    </section>
  );
}
