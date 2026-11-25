import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ExternalLink, KeyRound, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../apiAuthFetch';
import type { Project } from '../types/project';
import type { ClientPortalAuditEntry, ClientPortalGrant, ClientPortalScope } from '../types/clientPortal';

const ALL_SCOPES: Array<{ id: ClientPortalScope; label: string }> = [
  { id: 'schedule', label: 'Cronograma & Marcos' },
  { id: 'rdo', label: 'RDOs Liberados' },
  { id: 'measurements', label: 'Medições (BM)' },
  { id: 'databook', label: 'Data Book / Dossiê' },
  { id: 'acceptance', label: 'Registro de Aceite' },
];

export const ClientPortalModule: React.FC = () => {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [projects, setProjects] = useState<Project[]>([]);
  const [grants, setGrants] = useState<ClientPortalGrant[]>([]);
  const [audits, setAudits] = useState<ClientPortalAuditEntry[]>([]);
  const [projectId, setProjectId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [selectedScopes, setSelectedScopes] = useState<ClientPortalScope[]>(['schedule', 'measurements', 'databook']);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    if (!orgId) return;
    const [pSnap, gSnap, aSnap] = await Promise.all([
      getDocs(query(collection(db, 'projects'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'client_portal_grants'), where('orgId', '==', orgId))).catch(() => null),
      getDocs(query(collection(db, 'client_portal_audit'), where('orgId', '==', orgId))).catch(() => null),
    ]);
    const projs = pSnap ? pSnap.docs.map((d) => ({ ...(d.data() as Project), id: d.id })) : [];
    setProjects(projs);
    if (!projectId && projs.length > 0) setProjectId(projs[0].id);
    setGrants(gSnap ? gSnap.docs.map((d) => ({ ...(d.data() as ClientPortalGrant), id: d.id })) : []);
    setAudits(aSnap ? aSnap.docs.map((d) => ({ ...(d.data() as ClientPortalAuditEntry), id: d.id })) : []);
  };

  useEffect(() => {
    void loadData();
  }, [orgId]);

  const toggleScope = (scope: ClientPortalScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleIssueGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIssuedToken(null);
    const res = await apiFetch('/api/client-portal/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        clientName,
        clientEmail: clientEmail || undefined,
        scopes: selectedScopes,
        expiresInDays: Number(expiresInDays) || 30,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error || 'Não foi possível emitir acesso externo.');
      return;
    }
    setIssuedToken(String(data.accessToken || ''));
    setClientName('');
    setClientEmail('');
    setFeedback('Acesso externo emitido com sucesso. Copie o token abaixo agora — ele não é armazenado em texto claro.');
    await loadData();
  };

  const handleRevoke = async (grantId: string) => {
    setFeedback(null);
    const res = await apiFetch(`/api/client-portal/grants/${encodeURIComponent(grantId)}/revoke`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error || 'Erro ao revogar acesso externo.');
      return;
    }
    setFeedback('Acesso externo revogado imediatamente.');
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-emerald-500" />
          <span>Portal do Cliente (Acesso Externo Isolado)</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Credenciais externas segregadas por contrato e Projeto/Obra, com escopo explícito, validade, revogação imediata e trilha de auditoria — sem acesso ao workspace interno.
        </p>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 space-y-2">
          <p>{feedback}</p>
          {issuedToken && (
            <div className="p-2 rounded bg-slate-950 text-emerald-300 font-mono break-all select-all">
              x-portal-token: {issuedToken}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleIssueGrant} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-emerald-500" />
          <span>Emitir Acesso Externo Restrito</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select required value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700">
            <option value="">Selecione o Projeto/Obra...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <input required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome do representante do cliente" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
          <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="E-mail (opcional)" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
          <input type="number" min="1" max="180" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="Validade (dias)" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_SCOPES.map((s) => (
            <label key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer">
              <input type="checkbox" checked={selectedScopes.includes(s.id)} onChange={() => toggleScope(s.id)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
          Emitir Token Externo
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="font-bold text-slate-900 dark:text-white">Acessos Emitidos ({grants.length})</h3>
          {grants.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Nenhum acesso externo ativo.</p>
          ) : (
            grants.map((g) => (
              <div key={g.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold flex items-center gap-1.5">
                    {g.revokedAt ? <ShieldAlert className="w-3.5 h-3.5 text-rose-500" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                    <span>{g.clientName}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">Escopos: {g.scopes.join(', ')} · Expira: {g.expiresAt.slice(0, 10)}</p>
                </div>
                {!g.revokedAt && (
                  <button type="button" onClick={() => handleRevoke(g.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700">
                    <XCircle className="w-3.5 h-3.5" /> Revogar
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="font-bold text-slate-900 dark:text-white">Trilha de Auditoria Externa ({audits.length})</h3>
          {audits.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">Nenhum acesso externo registrado ainda.</p>
          ) : (
            audits.slice(0, 15).map((a) => (
              <div key={a.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="font-semibold">{a.clientName} · <span className="font-mono">{a.action}</span></p>
                {a.comment && <p className="text-slate-600 dark:text-slate-300 mt-0.5">{a.comment}</p>}
                <p className="text-[10px] text-slate-500">{a.timestamp}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
