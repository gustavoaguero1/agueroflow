/**
 * Acessos por área (Configurações). Duas camadas:
 *  1. Padrão da empresa para cada perfil (Admin, Gerente, Supervisor, Operacional, Visualizador).
 *  2. Ajuste de uma pessoa, por cima do padrão do perfil dela ("essa pessoa também vê o RH").
 * Quem tem Configurações = Ver só consulta; quem tem Editar muda. O servidor grava e renova o login.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RotateCcw, Loader2, Search } from 'lucide-react';
import { apiFetch } from '../../apiAuthFetch';
import { useAuth } from '../../contexts/AuthContext';
import {
  AREAS, LEVEL_LABELS, resolveAreas,
  type AreaId, type AreaLevel, type AreaLevels, type AreaOverrides,
} from '../../permissions/areas';
import type { UserRole } from '../../types';

const ROLES: UserRole[] = ['Admin', 'Gerente', 'Supervisor', 'Operacional', 'Visualizador'];
const LEVELS: AreaLevel[] = [0, 1, 2];
// Áreas com mínimo: não oferecemos "Sem acesso".
const MIN_ONE: AreaId[] = ['painel', 'configuracoes', 'suporte'];

type Member = { id: string; userName: string; role: UserRole; areaOverrides: AreaOverrides; levels: AreaLevels };
type Overview = {
  roleDefaults: Record<UserRole, AreaLevels>;
  orgDefaults: Partial<Record<UserRole, AreaOverrides>>;
  members: Member[];
  canEdit: boolean;
};

const levelTone: Record<AreaLevel, string> = {
  0: 'text-[#6E6E73] dark:text-[#98989D]',
  1: 'text-[#0071E3] dark:text-[#0A84FF]',
  2: 'text-[#1D1D1F] dark:text-[#F5F5F7]',
};

function LevelPicker({
  value, inherited, onChange, disabled, allowZero, label,
}: {
  value: AreaLevel | undefined; inherited?: AreaLevel; onChange: (v: AreaLevel | undefined) => void;
  disabled: boolean; allowZero: boolean; label: string;
}) {
  const options = LEVELS.filter((l) => allowZero || l > 0);
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center bg-black/[0.05] dark:bg-white/[0.08] p-0.5 rounded-[10px]">
      {inherited !== undefined && (
        <button
          type="button"
          role="radio"
          aria-checked={value === undefined}
          disabled={disabled}
          onClick={() => onChange(undefined)}
          title={`Seguir o perfil (${LEVEL_LABELS[inherited]})`}
          className={`px-2 py-1 rounded-[8px] text-[11px] font-medium transition-colors disabled:cursor-default cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071E3] ${
            value === undefined ? 'bg-white dark:bg-[#3A3A3C] shadow-[0_1px_2px_rgba(0,0,0,0.08)] text-[#1D1D1F] dark:text-white' : 'text-[#6E6E73] dark:text-[#98989D]'
          }`}
        >
          Perfil · {LEVEL_LABELS[inherited]}
        </button>
      )}
      {options.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          disabled={disabled}
          onClick={() => onChange(l)}
          className={`px-2.5 py-1 rounded-[8px] text-[11px] font-medium transition-colors disabled:cursor-default cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071E3] ${
            value === l ? `bg-white dark:bg-[#3A3A3C] shadow-[0_1px_2px_rgba(0,0,0,0.08)] ${levelTone[l]}` : 'text-[#6E6E73] dark:text-[#98989D]'
          }`}
        >
          {LEVEL_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

export function AreaAccessPanel() {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [role, setRole] = useState<UserRole>('Supervisor');
  const [personId, setPersonId] = useState('');
  const [filter, setFilter] = useState('');
  const [draftRole, setDraftRole] = useState<AreaOverrides>({});
  const [draftPerson, setDraftPerson] = useState<AreaOverrides>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setError('');
    const r = await apiFetch(`/api/org/areas?orgId=${encodeURIComponent(orgId)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      setError(j.error || 'Não foi possível carregar os acessos.');
      return;
    }
    setData(j.data as Overview);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setDraftRole(data?.orgDefaults[role] || {}); }, [data, role]);
  const person = data?.members.find((m) => m.id === personId) || null;
  useEffect(() => { setDraftPerson(person?.areaOverrides || {}); }, [person]);

  const canEdit = !!data?.canEdit;
  const roleLevels = useMemo(
    () => (data ? resolveAreas(role, { ...data.orgDefaults, [role]: draftRole }) : null),
    [data, role, draftRole],
  );
  const personBase = useMemo(
    () => (data && person ? resolveAreas(person.role, data.orgDefaults) : null),
    [data, person],
  );

  const save = async (url: string, body: unknown, done: string) => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const r = await apiFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Não foi possível salvar.');
      const failed = Number(j.data?.refreshFailed) || 0;
      setNotice(failed ? `${done} ${failed} pessoa(s) só recebem o novo acesso ao entrar de novo.` : done);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const saveRole = () => {
    const defaults = { ...(data?.orgDefaults || {}), [role]: draftRole };
    save('/api/org/areas', { orgId, defaults }, `Padrão de ${role} salvo. Quem tem esse perfil recebe o novo acesso em instantes.`);
  };
  const savePerson = () => {
    if (!person) return;
    save(`/api/org/members/${encodeURIComponent(person.id)}/areas`, { areaOverrides: draftPerson },
      `Acesso de ${person.userName} salvo. Vale assim que o login dela se renovar (em instantes).`);
  };

  const people = (data?.members || []).filter((m) => m.userName.toLowerCase().includes(filter.trim().toLowerCase()));
  const roleDirty = JSON.stringify(draftRole) !== JSON.stringify(data?.orgDefaults[role] || {});
  const personDirty = !!person && JSON.stringify(draftPerson) !== JSON.stringify(person.areaOverrides || {});

  const card = 'bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] rounded-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
  const primary = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-default cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071E3]';
  const ghost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-xs font-medium text-[#6E6E73] dark:text-[#98989D] hover:text-[#1D1D1F] dark:hover:text-white disabled:opacity-40 cursor-pointer';

  return (
    <section className={`${card} p-5 space-y-5`} aria-labelledby="area-access-title">
      <header className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#0071E3] dark:text-[#0A84FF] mt-0.5 shrink-0" />
        <div>
          <h3 id="area-access-title" className="text-sm font-bold text-[#1D1D1F] dark:text-[#F5F5F7]">Acessos por área</h3>
          <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-0.5 max-w-2xl leading-relaxed">
            Cada perfil tem um acesso padrão a cada área. Mude o padrão da empresa para um perfil, ou libere algo a mais para uma pessoa
            (por exemplo, um Supervisor que também precisa ver o RH). Painel, Configurações e Suporte ficam sempre visíveis.
            Quem perde algum acesso precisa entrar de novo no sistema.
          </p>
          {!canEdit && data && (
            <p className="text-xs text-[#6E6E73] dark:text-[#98989D] mt-1.5">Você pode consultar. Para mudar, é preciso editar Configurações.</p>
          )}
        </div>
      </header>

      {error && <p role="alert" className="text-xs text-[#D70015] dark:text-[#FF6961]">{error}</p>}
      {notice && <p role="status" className="text-xs text-[#248A3D] dark:text-[#30D158]">{notice}</p>}
      {!data && !error && (
        <p className="text-xs text-[#6E6E73] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Carregando acessos…</p>
      )}

      {data && roleLevels && (
        <>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mr-1">Padrão do perfil</span>
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071E3] ${
                    role === r ? 'bg-[#0071E3] text-white' : 'bg-black/[0.05] dark:bg-white/[0.08] text-[#1D1D1F] dark:text-[#F5F5F7]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {AREAS.map((a) => {
                const locked = role === 'Admin' && a.id === 'configuracoes';
                return (
                  <li key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">{a.label}</p>
                      <p className="text-[11px] text-[#6E6E73] dark:text-[#98989D]">
                        {a.description}
                        {!a.enforcedInDatabase && !MIN_ONE.includes(a.id) && (
                          <> Sem acesso esconde do menu; os dados não ficam bloqueados para quem é da empresa.</>
                        )}
                      </p>
                    </div>
                    <LevelPicker
                      label={`${a.label} para ${role}`}
                      value={roleLevels[a.id]}
                      onChange={(v) => setDraftRole((d) => ({ ...d, [a.id]: v ?? data.roleDefaults[role][a.id] }))}
                      disabled={!canEdit || saving || locked}
                      allowZero={!MIN_ONE.includes(a.id)}
                    />
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <div className="flex items-center justify-end gap-2">
                <button type="button" className={ghost} disabled={saving || !Object.keys(draftRole).length} onClick={() => setDraftRole({})}>
                  <RotateCcw className="w-3.5 h-3.5" />Voltar ao padrão do sistema
                </button>
                <button type="button" className={primary} disabled={saving || !roleDirty} onClick={saveRole}>
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Salvar padrão de {role}
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-xs font-semibold text-[#1D1D1F] dark:text-[#F5F5F7] mr-1">Ajuste por pessoa</span>
              <label className="relative flex-1 max-w-xs">
                <span className="sr-only">Buscar pessoa</span>
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6E6E73]" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar pessoa"
                  className="w-full pl-8 pr-3 py-1.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08] text-xs text-[#1D1D1F] dark:text-[#F5F5F7] outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
              </label>
              <select
                aria-label="Pessoa"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                className="px-3 py-1.5 rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08] text-xs text-[#1D1D1F] dark:text-[#F5F5F7] outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                <option value="">Escolha uma pessoa</option>
                {people.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.userName} · {m.role}{Object.keys(m.areaOverrides).length ? ' · ajustado' : ''}
                  </option>
                ))}
              </select>
            </div>

            {!person && (
              <p className="text-xs text-[#6E6E73] dark:text-[#98989D]">
                Escolha alguém para liberar ou tirar uma área só dela. O resto continua seguindo o perfil.
              </p>
            )}

            {person && personBase && (
              <>
                <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                  {AREAS.map((a) => {
                    const locked = person.role === 'Admin' && a.id === 'configuracoes';
                    return (
                      <li key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5">
                        <p className="text-[13px] font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">{a.label}</p>
                        <LevelPicker
                          label={`${a.label} para ${person.userName}`}
                          value={draftPerson[a.id]}
                          inherited={personBase[a.id]}
                          onChange={(v) => setDraftPerson((d) => {
                            const next = { ...d };
                            if (v === undefined) delete next[a.id];
                            else next[a.id] = v;
                            return next;
                          })}
                          disabled={!canEdit || saving || locked}
                          allowZero={!MIN_ONE.includes(a.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
                {canEdit && (
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" className={ghost} disabled={saving || !Object.keys(draftPerson).length} onClick={() => setDraftPerson({})}>
                      <RotateCcw className="w-3.5 h-3.5" />Seguir só o perfil
                    </button>
                    <button type="button" className={primary} disabled={saving || !personDirty} onClick={savePerson}>
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Salvar acesso de {person.userName.split(' ')[0]}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
